/* push.js — reminders on a phone: the rules, and nothing that sends.
 *
 * Read by /api/push/device, which stores what a phone asked for, and by the
 * sender Worker in workers/push/, which decides every fifteen minutes who is
 * due what. Nothing here holds a key or makes a request. The FCM client is in
 * workers/push/fcm.js, and the key is a secret on that Worker and nowhere else.
 *
 * THE SERVER DECIDES THE DAY. A phone sends a time zone name and a preferred
 * minute. It never sends a date. "Today's puzzles" means the server's UTC day,
 * as everywhere else, and every time below is worked out from that day and
 * the zone.
 *
 * AN UNLISTED GAME IS ADVERTISED NOWHERE, and a notification is advertising.
 * The morning and the streak messages name no game at all. A challenge message
 * links a game only if isListed says so.
 */
import { utcDay } from "./daily.js";
import { isListed } from "./games.js";
import { gamePath } from "./permalink.js";
import XI_SEASON from "../../shared/xi-season.js";

export const PLATFORMS = ["android"];
export const DEFAULT_MORNING = 540;          // 09:00 local
export const STALE_DAYS = 60;                // no re-register in this long: the token is gone
/* Where a tapped notification may take the app. The app refuses anything
   outside it on its own side too (MainActivity.openFromNotification), so
   this is the second of two locks, not the only one. */
export const APP_PATH = "/football/";
export const SITE = "https://www.thexigames.com";

const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/* ---------- what a phone may send ---------- */

/* FCM tokens are about 160 characters of URL-safe base64 with a colon in the
   middle. The bound is generous, because Google does not promise a length. */
export function validToken(t) {
  const s = String(t || "");
  return /^[A-Za-z0-9_:-]{20,512}$/.test(s) ? s : null;
}

export function validPlatform(p) {
  const s = String(p || "");
  return PLATFORMS.includes(s) ? s : null;
}

/* ASKED OF THE RUNTIME, not matched against a list. A phone reports
   whatever its OS calls the zone, and older names such as Asia/Calcutta are
   still sent. Intl.supportedValuesOf lists only the canonical names, so it
   would refuse a real phone. The DateTimeFormat constructor accepts any name
   it can use and throws on one it cannot, and resolvedOptions gives back the
   canonical spelling, which is the one stored. */
export function validZone(tz) {
  const s = String(tz || "");
  if (!s || s.length > 64 || !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(s)) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: s }).resolvedOptions().timeZone || null;
  } catch (e) {
    return null;
  }
}

/* A minute of the day, or null when none was sent. Out of range is refused
   rather than clamped: a phone that sent 1500 has a bug worth seeing. */
export function validMinute(m) {
  if (m === undefined || m === null || m === "") return null;
  const n = Number(m);
  return Number.isInteger(n) && n >= 0 && n < 1440 ? n : undefined;
}

/* A switch, or null when none was sent. */
export function flag(v) {
  if (v === undefined || v === null) return null;
  return v === true || v === 1 || v === "1" ? 1 : 0;
}

/* ---------- local time ---------- */

const formats = new Map();
function formatFor(tz) {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    formats.set(tz, f);
  }
  return f;
}

/* The minute of the day it is in `tz` at instant `ms`. */
export function localMinute(ms, tz) {
  let h = 0, m = 0;
  for (const p of formatFor(tz).formatToParts(new Date(ms))) {
    if (p.type === "hour") h = Number(p.value) % 24;
    if (p.type === "minute") m = Number(p.value);
  }
  return h * 60 + m;
}

const resetOf = (day) => Date.parse(day + "T00:00:00Z");

/* ---------- the morning ----------
 *
 * WHEN THE MORNING MESSAGE FOR BOARD DAY D GOES. At the player's morning
 * minute, on the first local morning at or after D's boards appear.
 *
 * Two cases, because the boards change at midnight UTC and that is a
 * different local time in every zone:
 *
 *  - The reset falls before the morning, which covers the UK and anywhere
 *    west of it (in New York the reset is 7pm or 8pm local). The message waits
 *    for the morning. Sending at the reset would put "today's puzzles are out"
 *    on a phone at 8pm.
 *  - The reset falls within MORNING_SPAN after the morning minute: Sydney at
 *    10:00 against a 09:00 morning. The boards were not out at 9, so the
 *    message waits for the reset and goes at 10.
 *
 * A reset more than MORNING_SPAN after the morning minute is treated as
 * "before" the next morning. Every local time of day occurs exactly once in
 * the 24 hours of a board day, so the message always has a slot, and no two
 * board days share one.
 *
 * CLOCK CHANGES. The offset is first read at the reset, and a clock change
 * between the reset and the message would put it an hour out, as it did in
 * Casablanca on 20 Sep 2026: 08:00 instead of 09:00. settle() reads the
 * clock again at the answer and moves it onto the minute, as long as that
 * stays inside the board day. A minute that does not exist on that day (the
 * hour a spring-forward skips) cannot be hit, and the message goes an hour
 * either side of it.
 */
export const MORNING_SPAN = 6 * 60;         // minutes after the morning that still count as morning
export const MORNING_LATE = 3 * HOUR;       // after this, a missed morning is skipped, not sent at teatime

/* Move `at` onto local `minute` if the clock there disagrees by no more than
   two hours, and the result stays within [lo, hi]. */
function settle(at, minute, tz, lo, hi) {
  let d = (minute - localMinute(at, tz) + 1440) % 1440;
  if (d > 720) d -= 1440;
  if (d === 0 || Math.abs(d) > 120) return at;
  const moved = at + d * MIN;
  return moved >= lo && moved <= hi ? moved : at;
}

export function morningAt(day, tz, minute = DEFAULT_MORNING) {
  const r = resetOf(day);
  const x = localMinute(r, tz);
  if ((x - minute + 1440) % 1440 < MORNING_SPAN) return r;
  return settle(r + ((minute - x + 1440) % 1440) * MIN, minute, tz, r + MIN, r + DAY - MIN);
}

export function morningDue(dev, now) {
  if (!dev || !Number(dev.want_morning)) return false;
  const day = utcDay(now);
  if (dev.sent_morning === day) return false;
  const at = morningAt(day, dev.tz, Number.isInteger(dev.morning_minute) ? dev.morning_minute : DEFAULT_MORNING);
  return now >= at && now < at + MORNING_LATE;
}

/* ---------- the streak ----------
 *
 * THE LAST DAYTIME MOMENT THAT STILL LEAVES TIME TO PLAY. The nudge is sent
 * STREAK_LEAD before the boards reset, but never outside STREAK_EARLY to
 * STREAK_LATE local. If that moment falls in the night, the nudge moves back
 * to STREAK_LATE the evening before.
 *
 * Why not simply 19:00 local, which is what the design first said: the day
 * that matters is the UTC board day, and in the Americas the board day ends
 * during the afternoon. In New York the reset is 19:00 or 20:00 local; in Los
 * Angeles it is 16:00 or 17:00. A 19:00 nudge arrives after the streak is
 * already lost, or two hours into the next board day, telling the player
 * about a day they have not started. For the UK the result is the same as the
 * design: 19:00 in winter, and 19:00 in summer too, because 22:00 BST is past
 * STREAK_LATE.
 */
export const STREAK_LEAD = 3 * HOUR;
export const STREAK_EARLY = 8 * 60;
export const STREAK_LATE = 19 * 60;

export function streakAt(day, tz) {
  const c = resetOf(day) + DAY - STREAK_LEAD;
  const x = localMinute(c, tz);
  if (x >= STREAK_EARLY && x <= STREAK_LATE) return c;
  const back = x > STREAK_LATE ? x - STREAK_LATE : x + 1440 - STREAK_LATE;
  return settle(c - back * MIN, STREAK_LATE, tz, resetOf(day), c);
}

/* Only a device with an account behind it: a signed-out player's streak lives
   on their phone, and the server has never seen it. */
export function streakDue(dev, now) {
  if (!dev || !Number(dev.want_streak) || !dev.user_id) return false;
  const day = utcDay(now);
  if (dev.sent_streak === day) return false;
  return now >= streakAt(day, dev.tz);
}

/* ---------- what the account says ----------
 *
 * ASKED, NOT RECOMPUTED. `dayGames` is what season-store's finishedDaysFor
 * returns, and the streak is shared/xi-season.js's streaks(): the same
 * function the hub and every game use to show a streak. A second definition
 * here could nudge a player about a streak their own screen says they do not
 * have. */
export function playedOn(dayGames, day) {
  return (dayGames || []).some((d) => d && d.day === day && (d.games || []).length > 0);
}

/* The run that is at risk: live, but with nothing finished today. Zero when
   there is nothing to lose. */
export function streakAtRisk(dayGames, day) {
  if (playedOn(dayGames, day)) return 0;
  return XI_SEASON.streaks(dayGames, null, day).daily;
}

/* ---------- the words ----------
 *
 * Paths, not addresses. The sender adds SITE, so there is one origin and a
 * message can never point anywhere else. */
export function morningMessage() {
  return {
    channel: "reminders",
    title: "Today's puzzles are out",
    body: "A new day of The XI Games is ready.",
    url: APP_PATH,
  };
}

export function streakMessage(run) {
  const days = run === 1 ? "1 day" : run + " days";
  return {
    channel: "reminders",
    title: "Your streak is on the line",
    body: days + " and counting. Finish one game today to keep it going.",
    url: APP_PATH,
  };
}

/* The full address a message carries. Anything outside APP_PATH becomes
   APP_PATH itself: the app would refuse to open it anyway, and a tap that does
   nothing is worse than a tap that lands on the hub. */
export function addressOf(path) {
  const p = String(path || "");
  return SITE + (p.startsWith(APP_PATH) && !p.includes("//") ? p : APP_PATH);
}

/* A challenge result, or null when the game may not be named. */
export function challengeMessage(game, challengeId, name, score) {
  if (!isListed(game)) return null;
  const who = String(name || "Somebody").slice(0, 40);
  return {
    channel: "challenges",
    title: who + " took on your challenge",
    body: "They scored " + Number(score) + ". See where you stand.",
    url: gamePath(game) + "?c=" + encodeURIComponent(String(challengeId)),
  };
}

/* Queued for the Worker, which is the only thing holding the key. Best
   effort: a missing table (before 046 is applied) or a D1 hiccup costs a
   notification, never the entry it is about. */
export async function queueChallengeResult(env, { creatorId, entrantId, game, challengeId, name, score }) {
  try {
    if (!env || !env.DB || !creatorId) return false;
    if (entrantId && String(entrantId) === String(creatorId)) return false;
    const msg = challengeMessage(game, challengeId, name, score);
    if (!msg) return false;
    await env.DB.prepare(
      `INSERT INTO push_outbox (id, user_id, kind, title, body, url, created_at)
       VALUES (?, ?, 'challenge', ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), String(creatorId), msg.title, msg.body, msg.url,
            new Date().toISOString()).run();
    return true;
  } catch (e) {
    return false;
  }
}
