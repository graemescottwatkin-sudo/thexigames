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
import { whoamiOf, LEGACY_GAME } from "./wa-registry.js";
import { hasDB, today } from "./wadata.js";

/* THE GAME'S OWN TABLE AND ITS OWN LAUNCH DAY.
 *
 * Both were football's, written in: the SQL named wa_board and the bound read
 * LAUNCHED.whoami. A second Who Am I needs the same queries against a different
 * table and a different first day, and a `game` argument is the smallest thing
 * that can carry both. Omitted, it is football's, so the legacy routes call
 * these exactly as they always did.
 *
 * AN UNKNOWN GAME IS REFUSED RATHER THAN DEFAULTED. Falling back to football
 * would list one game's boards under another game's address, which is the
 * quietest failure this file could have. */
const of_ = (game) => whoamiOf(game || LEGACY_GAME);
const BOARDS = (game) => {
  const w = of_(game);
  return w ? w.tables.board : null;
};
const FROM = (game) => {
  const w = of_(game);
  return (w && LAUNCHED[w.id]) || "0000-01-01";
};

export function boardNoOf(day) {
  return dailyNoForDay(String(day));
}

export function dayOfBoardNo(no) {
  return Number.isInteger(no) && no >= 1 ? dailyDayKey(no) : null;
}

/* A BOARD BY ITS FAMILY NUMBER, bounded by today. Without the bound,
   /football/whoami/daily/300 hands somebody next July's eleven doors — and
   unlike a crossword, those doors stay live for other players when they run. */
export async function boardByFamilyNo(env, familyNo, now, game) {
  if (!of_(game) || !hasDB(env) || !Number.isInteger(familyNo) || familyNo < 1) return null;
  const day = dayOfBoardNo(familyNo);
  if (!day) return null;
  if (day > String(now || today())) return null;
  /* THE GAME'S OWN READER: football resolves a board through wadata.getBoard
     and Friends through frwa-data.getBoard. Both answer the same question and
     neither knows the other exists. */
  return await of_(game).data.getBoard(env, day);
}

/* Is this a day a player may open? Asked of the table rather than computed from
   a launch date, because "published" is a status a row carries and a date
   cannot answer it. */
export async function playableDay(env, day, game) {
  const table = BOARDS(game);
  if (!table || !hasDB(env) || !day) return false;
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
    `SELECT play_date FROM ${table} WHERE play_date = ? AND status = 'published' ` +
    "AND play_date <= ? AND play_date >= ?"
  ).bind(String(day), today(), FROM(game)).first();
  return !!row;
}

/* THE BOARDS THAT HAVE BEEN, newest first — days and numbers and nothing else.
   An archive index is the easiest place in a game to publish tomorrow by
   accident, because the index feels like metadata right up until you notice the
   metadata IS the board. Nothing here is worth leaking even if the bound were
   wrong, and the bound is in the query rather than in a filter after it. */
export async function archive(env, limit = 400, game) {
  const table = BOARDS(game);
  if (!table || !hasDB(env)) return [];
  const { results } = await env.DB.prepare(
    `SELECT play_date FROM ${table} WHERE status = 'published' ` +
    "AND play_date <= ? AND play_date >= ? ORDER BY play_date DESC LIMIT ?"
  ).bind(today(), FROM(game), Math.max(1, Math.min(1000, Number(limit) || 400))).all();
  return (results || []).map((r) => ({ day: r.play_date, no: boardNoOf(r.play_date) }));
}

/* The most recent published day at or before today — today's board when there
   is one, and the last one there was when there is not. A game that runs out of
   boards should show its last rather than a 404. */
export async function lastPlayableDay(env, game) {
  const table = BOARDS(game);
  if (!table || !hasDB(env)) return null;
  const row = await env.DB.prepare(
    `SELECT MAX(play_date) AS d FROM ${table} WHERE status = 'published' ` +
    "AND play_date <= ? AND play_date >= ?"
  ).bind(today(), FROM(game)).first();
  return row && row.d ? String(row.d) : null;
}
