/* functions/_lib/qf-board.js — which QuickFire boards exist, and what they are
 * called.
 *
 * ONE NUMBERING, AND IT IS THE FAMILY'S. Every address on this site is a family
 * board number counted from the family's day one, 26 August 2026:
 * /football/<game>/daily/12 is 6 September in all of them, and the number means
 * the same thing everywhere. QuickFire has no internal ordinal of its own to
 * disagree with that — its boards are keyed by DATE in qf_daily — so unlike
 * Codeword there are not two numbers here to confuse. The translation between a
 * number and a day is the shared arithmetic in daily.js and is imported rather
 * than restated, because a second copy of it is a second answer to what a
 * Tuesday was.
 *
 * Codeword's session found the cost of getting that wrong the hard way: its
 * board 1 is family number 20, both are small positive integers, and either
 * looks reasonable in a URL. The fault is silent in exactly the way that
 * matters — it serves A board, just not the one the link asked for.
 *
 * A BOARD WITH NO PUBLISHED DAY IS NOT A BOARD, and a day in the future is not
 * a board either. That is the word search's rule of 6 September 2026, where a
 * schedule holding two years of inventory was read as two years of history and
 * published 233 boards nobody had played. qf_daily holds 89 days running to
 * 11 December 2026; today is one of them and the other 88 are not all past.
 */
import { dailyDayKey, dailyNoForDay } from "./daily.js";
import { hasDB, getDaily, today } from "./qfdata.js";

/* The family number for a day, and the day for a family number. Thin on
   purpose — they exist so that nothing else in QuickFire is tempted to do the
   arithmetic itself. */
export function boardNoOf(day) {
  return dailyNoForDay(String(day));
}

export function dayOfBoardNo(no) {
  return Number.isInteger(no) && no >= 1 ? dailyDayKey(no) : null;
}

/* A BOARD BY ITS FAMILY NUMBER, bounded by today.
 *
 * The bound is the whole point. Without it /football/quickfire/daily/200 serves
 * a board from November to anybody who types it, and the eleven questions on it
 * are the eleven questions somebody will be asked in November. */
export async function boardByFamilyNo(env, familyNo, now) {
  if (!hasDB(env) || !Number.isInteger(familyNo) || familyNo < 1) return null;
  const day = dayOfBoardNo(familyNo);
  if (!day) return null;
  const cutoff = now || today();
  if (day > String(cutoff)) return null;
  return await getDaily(env, day);
}

/* Is this day one a player is allowed to open? Asked of the table rather than
   computed from a launch date, because "published" is a status a row carries
   and a date cannot answer. */
export async function playableDay(env, day) {
  if (!hasDB(env) || !day) return false;
  const row = await env.DB.prepare(
    "SELECT play_date FROM qf_daily WHERE play_date = ? AND status = 'published' AND play_date <= ?"
  ).bind(String(day), today()).first();
  return !!row;
}

/* THE BOARDS THAT HAVE BEEN, newest first — what the archive picker shows.
 *
 * It returns days and numbers and NOTHING ELSE. An archive index that carried
 * so much as a clue would be publishing tomorrow's board the moment the query
 * bound slipped, which is the failure this file's header is about. The
 * questions come from getDaily when a board is actually opened.
 *
 * `limit` is a courtesy, not a security boundary: the bound that matters is
 * play_date <= today. */
export async function archive(env, limit = 400) {
  if (!hasDB(env)) return [];
  const { results } = await env.DB.prepare(
    "SELECT play_date FROM qf_daily WHERE status = 'published' AND play_date <= ? " +
    "ORDER BY play_date DESC LIMIT ?"
  ).bind(today(), Math.max(1, Math.min(1000, Number(limit) || 400))).all();
  return (results || []).map((r) => ({ day: r.play_date, no: boardNoOf(r.play_date) }));
}

/* The most recent published day at or before today — which is today's board
   when there is one, and the last one there was when there is not. A game that
   runs out of boards should show the last one rather than a 404. */
export async function lastPlayableDay(env) {
  if (!hasDB(env)) return null;
  const row = await env.DB.prepare(
    "SELECT MAX(play_date) AS d FROM qf_daily WHERE status = 'published' AND play_date <= ?"
  ).bind(today()).first();
  return row && row.d ? String(row.d) : null;
}
