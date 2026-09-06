/* season-store.js — the season's rows: writing a day down, and reading it back.
 *
 * Separate from season.js, which is the RULE and knows nothing about a
 * database. The rule is read by the hub and by the server; only this half
 * touches D1, and only for a signed-in player.
 *
 * WHAT IS AND IS NOT RECORDED. A game started, a game finished, a day, an
 * account. Not a score, not a board, not a referrer, not how much help was
 * bought — the season counts finishes, so anything else here would be data
 * collected because it was available rather than because it was needed.
 *
 * NOTHING IS RECORDED FOR A PLAYER WITHOUT AN ACCOUNT, which is not a
 * limitation but the design: their season is their device's, computed from
 * what their browser already holds, and the server never learns they played.
 */
import { GAMES } from "./games.js";
import { utcDay } from "./daily.js";
import { currentUser } from "./auth.js";

export function hasDB(env) { return !!(env && env.DB); }

const okGame = (g) => (GAMES.includes(String(g)) ? String(g) : null);

/* A game started today, by this account. Idempotent on (user, day, game): a
   reload, a double tap or a resumed round is the same start, and the second
   one must not overwrite the first — nor un-finish a game already finished,
   which is why this does not touch finished_at. */
export async function noteStart(env, user, game, now) {
  if (!hasDB(env) || !user || !user.id) return false;
  const g = okGame(game);
  if (!g) return false;
  try {
    await env.DB.prepare(
      `INSERT INTO season_play (user_id, day, game, started_at)
            VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, day, game) DO NOTHING`)
      .bind(String(user.id), utcDay(now), g).run();
    return true;
  } catch (e) { return false; }
}

/* And finished. Written even if no start was seen — a player who signed in
   mid-puzzle, or whose start never reached the server, has still finished
   something, and a finish with no start is a finish rather than nothing. */
export async function noteFinish(env, user, game, now) {
  if (!hasDB(env) || !user || !user.id) return false;
  const g = okGame(game);
  if (!g) return false;
  const day = utcDay(now);
  try {
    await env.DB.prepare(
      `INSERT INTO season_play (user_id, day, game, started_at, finished_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(user_id, day, game)
       DO UPDATE SET finished_at = COALESCE(season_play.finished_at, datetime('now'))`)
      .bind(String(user.id), day, g).run();
    return true;
  } catch (e) { return false; }
}

/* The days this account has played, newest first, as the rule wants them:
   { day, started, finished }. A day is one row here however many games are in
   it, which is what makes "finished 2 or more" countable. */
export async function daysFor(env, user, limit = 120) {
  if (!hasDB(env) || !user || !user.id) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT day,
              COUNT(*) AS started,
              SUM(CASE WHEN finished_at IS NOT NULL THEN 1 ELSE 0 END) AS finished
         FROM season_play
        WHERE user_id = ?
        GROUP BY day
        ORDER BY day DESC
        LIMIT ?`)
      .bind(String(user.id), Math.max(1, Math.min(400, Number(limit) || 120))).all();
    return (results || []).map((r) => ({
      day: r.day, started: Number(r.started) || 0, finished: Number(r.finished) || 0,
    }));
  } catch (e) { return []; }
}

/* WHICH GAMES THIS ACCOUNT HAS FINISHED TODAY, by name rather than by count.
 *
 * daysFor above aggregates a day into two numbers, which is all the season
 * rule needs and is exactly what is missing when the question is "has this
 * player already played HiLo today". The hub answered that from localStorage
 * and so did every game, which is device-local by construction — so a player
 * signed in on two devices saw a shirt lit on one and dark on the other, and
 * could start today's board a second time on the device that had not heard.
 * The account knew all along; nothing asked it.
 *
 * FINISHED, not started. A board opened and abandoned is not a board played,
 * and refusing a second attempt on a round somebody never completed would take
 * the day away from them.
 */
export async function gamesFinishedOn(env, user, day) {
  if (!hasDB(env) || !user || !user.id || !day) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT game FROM season_play
        WHERE user_id = ? AND day = ? AND finished_at IS NOT NULL
        ORDER BY game`).bind(String(user.id), String(day)).all();
    return (results || []).map((r) => String(r.game)).filter(Boolean);
  } catch (e) { return []; }
}

/* Convenience for the endpoints: the signed-in player, or null. Kept here so
   the two callers do not each decide what "signed in" means. */
export async function seasonUser(request, env) {
  if (!hasDB(env)) return null;
  try { return await currentUser(request, env); } catch (e) { return null; }
}
