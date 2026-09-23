/* run.js — one run of the sender: who is due what, send it, write it down.
 *
 * Every fifteen minutes (the cron in wrangler.toml). A run is safe to repeat:
 * each device carries the board day its last morning and its last streak
 * nudge went out on, so a second run in the same quarter-hour, or a retry
 * after a failure, finds nothing new to send.
 *
 * WHAT IS MARKED SENT, AND WHEN. A morning or a nudge is marked when it was
 * delivered, and also when it was deliberately not sent: the player had
 * already played today, or had no streak to lose. Either way the day's
 * question has been answered. A delivery that FAILED is not marked, so the
 * next run tries again, until MORNING_LATE has passed and the morning is
 * skipped rather than arriving at teatime.
 *
 * `send(token, message)` is injected, so a suite can run this whole function
 * against a real SQLite with a fake FCM. The Worker passes fcm.js's sender.
 */
import { utcDay } from "../../functions/_lib/daily.js";
import { finishedDaysFor } from "../../functions/_lib/season-store.js";
import {
  morningDue, streakDue, streakAtRisk, playedOn, morningMessage, streakMessage,
  addressOf, STALE_DAYS,
} from "../../functions/_lib/push.js";
import { SENT, GONE, FAILED } from "./fcm.js";

const DAY = 86400000;
export const OUTBOX_MAX_AGE = DAY;       // a challenge result a day late is noise
export const OUTBOX_BATCH = 100;
export const RUN_KEEP = 7 * DAY;

const iso = (ms) => new Date(ms).toISOString();
const changes = (r) => Number((r && r.meta && r.meta.changes) || 0);

export async function run(env, now, send) {
  const db = env.DB;
  const day = utcDay(now);
  const stats = { sent: 0, failed: 0, pruned: 0 };

  /* A token not re-registered for STALE_DAYS belongs to an app nobody opens.
     FCM may still accept messages for it, which is why this is not left to
     GONE alone. */
  stats.pruned += changes(await db.prepare(
    "DELETE FROM push_device WHERE seen_at < ?").bind(iso(now - STALE_DAYS * DAY)).run());

  /* One read of an account's finished days per run, however many phones the
     account has. */
  const history = new Map();
  async function daysOf(userId) {
    if (!history.has(userId)) history.set(userId, await finishedDaysFor(env, { id: userId }));
    return history.get(userId);
  }

  /* SENT, GONE or FAILED; a GONE token's row is deleted here. */
  async function deliver(token, msg) {
    let out;
    try { out = await send(token, { ...msg, address: addressOf(msg.url) }); } catch (e) { out = FAILED; }
    if (out === SENT) { stats.sent++; return SENT; }
    if (out === GONE) {
      await db.prepare("DELETE FROM push_device WHERE token = ?").bind(token).run();
      stats.pruned++;
      return GONE;
    }
    stats.failed++;
    return FAILED;
  }

  const mark = (column, token) => db.prepare(
    `UPDATE push_device SET ${column} = ? WHERE token = ?`).bind(day, token).run();

  /* Only devices with something still owed today. The time checks are done
     here in JS rather than in SQL, because they need the device's time zone
     and SQLite has none. */
  const { results } = await db.prepare(
    `SELECT token, user_id, tz, morning_minute, want_morning, want_streak, sent_morning, sent_streak
       FROM push_device
      WHERE (want_morning = 1 AND (sent_morning IS NULL OR sent_morning <> ?1))
         OR (want_streak = 1 AND user_id IS NOT NULL AND (sent_streak IS NULL OR sent_streak <> ?1))`)
    .bind(day).all();

  for (const dev of results || []) {
    /* One bad row must not stop everybody else's morning. A zone the runtime
       has since stopped knowing throws in localMinute. */
    try {
      if (morningDue(dev, now)) {
        const played = dev.user_id ? playedOn(await daysOf(dev.user_id), day) : false;
        const out = played ? SENT : await deliver(dev.token, morningMessage());
        if (out === GONE) continue;
        if (out === SENT) await mark("sent_morning", dev.token);
      }
      if (streakDue(dev, now)) {
        const at = streakAtRisk(await daysOf(dev.user_id), day);
        const out = at > 0 ? await deliver(dev.token, streakMessage(at)) : SENT;
        if (out === GONE) continue;
        if (out === SENT) await mark("sent_streak", dev.token);
      }
    } catch (e) {
      stats.failed++;
    }
  }

  /* Challenge results, queued by /api/challenge/entry. Each is tried once
     and removed: a retry would repeat the message on every phone that did
     receive it the first time. */
  await db.prepare("DELETE FROM push_outbox WHERE created_at < ?").bind(iso(now - OUTBOX_MAX_AGE)).run();
  const queued = (await db.prepare(
    `SELECT id, user_id, kind, title, body, url FROM push_outbox
      ORDER BY created_at LIMIT ?`).bind(OUTBOX_BATCH).all()).results || [];
  for (const m of queued) {
    await db.prepare("DELETE FROM push_outbox WHERE id = ?").bind(m.id).run();
    if (m.kind !== "challenge") continue;
    const phones = (await db.prepare(
      "SELECT token FROM push_device WHERE user_id = ? AND want_challenge = 1")
      .bind(m.user_id).all()).results || [];
    for (const p of phones) {
      await deliver(p.token, { channel: "challenges", title: m.title, body: m.body, url: m.url });
    }
  }

  await db.prepare("INSERT OR REPLACE INTO push_run (ran_at, sent, failed, pruned) VALUES (?, ?, ?, ?)")
    .bind(iso(now), stats.sent, stats.failed, stats.pruned).run();
  await db.prepare("DELETE FROM push_run WHERE ran_at < ?").bind(iso(now - RUN_KEEP)).run();
  return stats;
}
