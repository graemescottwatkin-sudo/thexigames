/* /api/push/device — a phone asking for reminders, changing them, or
 * stopping them.
 *
 *   POST   { token, platform, tz, morningMinute?, wantMorning?, wantStreak?, wantChallenge? }
 *   DELETE { token }
 *   GET    with the token in the X-XI-Push-Token header
 *
 * The token travels in a header on GET, not in the query string. A query
 * string is written into access logs and browser history, and this token is
 * what lets its holder change or delete the device's reminders.
 *
 * WHO THE DEVICE BELONGS TO IS DECIDED HERE, from the session, every time it
 * registers. A phone that signs out and re-registers loses its account link,
 * so a streak nudge for an account nobody is signed in to on that phone stops.
 *
 * RE-REGISTERING IS HOW A TOKEN STAYS ALIVE. The app posts on every start
 * while reminders are on. seen_at moves, and the sender prunes anything not
 * seen for STALE_DAYS. A preference left out of the body is left alone, so
 * that start-up post cannot reset the player's choices to the defaults.
 *
 * A NEW DEVICE IS MARKED AS ALREADY SENT FOR TODAY'S MORNING. The page asks
 * after a finished game, so a yes arrives from somebody who has just played.
 * Telling them "today's puzzles are out" minutes later would be the first
 * thing the feature ever did, and it would be wrong.
 */
import { json, bad } from "../../_lib/puzzle.js";
import { hasDB } from "../../_lib/db.js";
import { currentUser, csrfOk } from "../../_lib/auth.js";
import { limited, tooMany } from "../../_lib/limit.js";
import { utcDay } from "../../_lib/daily.js";
import {
  validToken, validPlatform, validZone, validMinute, flag, DEFAULT_MORNING,
} from "../../_lib/push.js";

export const TOKEN_HEADER = "X-XI-Push-Token";

async function readJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}

async function userOf(request, env) {
  try { return await currentUser(request, env); } catch (e) { return null; }
}

function prefsOf(row) {
  return {
    morningMinute: Number(row.morning_minute),
    wantMorning: !!Number(row.want_morning),
    wantStreak: !!Number(row.want_streak),
    wantChallenge: !!Number(row.want_challenge),
    /* The streak and challenge switches do nothing without an account, and
       the page says so rather than showing a switch that is quietly dead. */
    account: !!row.user_id,
  };
}

async function readDevice(env, token) {
  return env.DB.prepare(
    `SELECT token, user_id, morning_minute, want_morning, want_streak, want_challenge
       FROM push_device WHERE token = ?`).bind(token).first();
}

export async function onRequestPost({ request, env }) {
  if (!csrfOk(request)) return bad("Missing request header.", 403);
  if (!hasDB(env)) return bad("Not configured.", 503);
  if (await limited(env, request, "push-device", 30, 3600)) return tooMany(json);
  const body = await readJson(request);
  if (!body || typeof body !== "object") return bad("Expected a JSON body.");

  const token = validToken(body.token);
  if (!token) return bad("Unknown device.");
  const platform = validPlatform(body.platform);
  if (!platform) return bad("Unknown platform.");
  const tz = validZone(body.tz);
  if (!tz) return bad("Unknown time zone.");
  const minute = validMinute(body.morningMinute);
  if (minute === undefined) return bad("The morning time must be a minute of the day, 0 to 1439.");
  const wantMorning = flag(body.wantMorning);
  const wantStreak = flag(body.wantStreak);
  const wantChallenge = flag(body.wantChallenge);

  const user = await userOf(request, env);
  const now = new Date().toISOString();

  /* ?1..?10 are the new row. ?11..?14 are the same preferences as sent,
     null where the body left them out, so a stored choice survives. */
  await env.DB.prepare(
    `INSERT INTO push_device
       (token, platform, user_id, tz, morning_minute, want_morning, want_streak,
        want_challenge, created_at, seen_at, sent_morning)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10)
     ON CONFLICT(token) DO UPDATE SET
       platform = excluded.platform,
       user_id = excluded.user_id,
       tz = excluded.tz,
       seen_at = excluded.seen_at,
       morning_minute = COALESCE(?11, push_device.morning_minute),
       want_morning = COALESCE(?12, push_device.want_morning),
       want_streak = COALESCE(?13, push_device.want_streak),
       want_challenge = COALESCE(?14, push_device.want_challenge)`)
    .bind(token, platform, user ? String(user.id) : null, tz,
          minute === null ? DEFAULT_MORNING : minute,
          wantMorning === null ? 1 : wantMorning,
          wantStreak === null ? 1 : wantStreak,
          wantChallenge === null ? 1 : wantChallenge,
          now, utcDay(),
          minute, wantMorning, wantStreak, wantChallenge)
    .run();

  const row = await readDevice(env, token);
  return json({ ok: true, prefs: row ? prefsOf(row) : null });
}

export async function onRequestDelete({ request, env }) {
  if (!csrfOk(request)) return bad("Missing request header.", 403);
  if (!hasDB(env)) return bad("Not configured.", 503);
  if (await limited(env, request, "push-device", 30, 3600)) return tooMany(json);
  const body = await readJson(request);
  const token = validToken(body && body.token);
  if (!token) return bad("Unknown device.");
  await env.DB.prepare("DELETE FROM push_device WHERE token = ?").bind(token).run();
  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  if (!hasDB(env)) return bad("Not configured.", 503);
  const token = validToken(request.headers.get(TOKEN_HEADER));
  if (!token) return bad("Unknown device.");
  const row = await readDevice(env, token);
  if (!row) return bad("Unknown device.", 404);
  return json({ ok: true, prefs: prefsOf(row) });
}
