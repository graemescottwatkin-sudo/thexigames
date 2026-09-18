/* functions/_lib/wa-board.js — which Who Am I boards exist, and what they are
 * called.
 *
 * ONE NUMBERING, AND IT IS THE FAMILY'S: counted from the family's day one,
 * 26 August 2026, so /football/<game>/daily/12 is 6 September in every game and
 * the number means the same thing everywhere. The translation is the shared
 * arithmetic in daily.js and is imported rather than restated — a second copy
 * is a second answer to what a Tuesday was.
 *
 * Codeword found the cost of getting that wrong: its own board 1 is family
 * number 20, both are small positive integers, and either looks reasonable in a
 * URL. The fault is silent in the way that matters — it serves A board, just
 * not the one the link asked for.
 *
 * A BOARD WITH NO PUBLISHED DAY IS NOT A BOARD, and a day in the future is not
 * one either. The word search published 233 boards on 6 September 2026 by
 * reading a schedule of inventory as a schedule of history. wa_board holds 365
 * days; today is one of them and the other 364 are not all past.
 */
import { dailyDayKey, dailyNoForDay } from "./daily.js";
/* WHEN THIS GAME LAUNCHED, from the one place it is written. Every query below
   is bounded at BOTH ends by it: `<= today` alone let three boards from before
   day one stay listed and playable. */
import { LAUNCHED } from "./games.js";
const FROM = () => LAUNCHED.whoami || "0000-01-01";
import { hasDB, getBoard, today } from "./wadata.js";

export function boardNoOf(day) {
  return dailyNoForDay(String(day));
}

export function dayOfBoardNo(no) {
  return Number.isInteger(no) && no >= 1 ? dailyDayKey(no) : null;
}

/* A BOARD BY ITS FAMILY NUMBER, bounded by today. Without the bound,
   /football/whoami/daily/300 hands somebody next July's eleven doors — and
   unlike a crossword, those doors stay live for other players when they run. */
export async function boardByFamilyNo(env, familyNo, now) {
  if (!hasDB(env) || !Number.isInteger(familyNo) || familyNo < 1) return null;
  const day = dayOfBoardNo(familyNo);
  if (!day) return null;
  if (day > String(now || today())) return null;
  return await getBoard(env, day);
}

/* Is this a day a player may open? Asked of the table rather than computed from
   a launch date, because "published" is a status a row carries and a date
   cannot answer it. */
export async function playableDay(env, day) {
  if (!hasDB(env) || !day) return false;
  /* BOUNDED AT BOTH ENDS. This asked only that the day had arrived, which was
     enough while the board table began on the day the game did. When Who Am I
     was re-dated to day one on 18 September 2026 its LAUNCHED moved and the
     published rows behind it did not, so 15, 16 and 17 September were still
     "published and not in the future" — three boards from before the game
     existed, listed in the archive AND playable, scored and banked like any
     other sitting because this function is the only thing play.js asks.
     A day before the game began is not a past board, it is a board that never
     ran. The bound is in the QUERY rather than in a filter after it, for the
     reason the archive below states. */
  const row = await env.DB.prepare(
    "SELECT play_date FROM wa_board WHERE play_date = ? AND status = 'published' " +
    "AND play_date <= ? AND play_date >= ?"
  ).bind(String(day), today(), FROM()).first();
  return !!row;
}

/* THE BOARDS THAT HAVE BEEN, newest first — days and numbers and nothing else.
   An archive index is the easiest place in a game to publish tomorrow by
   accident, because the index feels like metadata right up until you notice the
   metadata IS the board. Nothing here is worth leaking even if the bound were
   wrong, and the bound is in the query rather than in a filter after it. */
export async function archive(env, limit = 400) {
  if (!hasDB(env)) return [];
  const { results } = await env.DB.prepare(
    "SELECT play_date FROM wa_board WHERE status = 'published' " +
    "AND play_date <= ? AND play_date >= ? ORDER BY play_date DESC LIMIT ?"
  ).bind(today(), FROM(), Math.max(1, Math.min(1000, Number(limit) || 400))).all();
  return (results || []).map((r) => ({ day: r.play_date, no: boardNoOf(r.play_date) }));
}

/* The most recent published day at or before today — today's board when there
   is one, and the last one there was when there is not. A game that runs out of
   boards should show its last rather than a 404. */
export async function lastPlayableDay(env) {
  if (!hasDB(env)) return null;
  const row = await env.DB.prepare(
    "SELECT MAX(play_date) AS d FROM wa_board WHERE status = 'published' " +
    "AND play_date <= ? AND play_date >= ?"
  ).bind(today(), FROM()).first();
  return row && row.d ? String(row.d) : null;
}
