/* gd-round.js — the turns, the misses and the hints the server owns, so a Grid
 * XI score can be verified.
 *
 * WHAT A SCORE IS MADE OF, and why none of it is a counter:
 *
 *   the turns    fifteen to start, one spent on a wrong answer and one given
 *                BACK for a right one
 *   the misses   every wrong submission, which efficiency is scaled by
 *   the hints    a revealed letter, four points, never a turn
 *   the solved   an entry answered exactly
 *
 * ROWS PER EVENT. The board ENDS the moment the turns reach zero, so WHEN each
 * submission happened decides which ones count at all — a running total cannot
 * say whether the twelfth guess arrived before or after full time, and a client
 * that retried on a dropped connection would look identical to one that kept
 * playing past the end. The word search's fouls need rows for a cousin of this
 * reason; see migration 031.
 *
 * DERIVED, NEVER STORED. turns, misses and solved are read back out of the rows
 * every time rather than kept in a column beside them. A column would be a
 * second statement of the same fact and this project has paid for those; and
 * the derivation is the only place the rule "a right answer returns a turn"
 * exists on the server, so it cannot drift from rules.js, which it imports.
 *
 * IT NEVER REFUSES A GUESS. Every function here returns rather than throws and
 * does nothing at all without a database or a play id — an older page, a round
 * that never kicked off, a suite. The game does not depend on being scored: the
 * verdict is served either way and only the SCORE is lost, which is the same
 * arrangement HiLo and Scrambled keep.
 */
import { RULES } from "./gd-board.js";

const TABLE_MISSING = /no such table/i;

function usable(env, playId) {
  return !!(env && env.DB && typeof playId === "string" && playId.length > 0);
}

/* ---- writing ------------------------------------------------------------ */

/* Kick off. Idempotent on play_id: a double tap, or a page that reloaded and
   resumed, must not start a second round for one attempt. */
export async function startRound(env, playId, boardId, day, atMs) {
  if (!usable(env, playId)) return null;
  try {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO gd_round (play_id, board_id, day, started_ms) VALUES (?, ?, ?, ?)")
      .bind(playId, String(boardId), String(day), Number(atMs) || Date.now()).run();
    return true;
  } catch (e) { return null; }
}

/* One submission. `idx` is the nth of this round and is the server's own count,
   not the client's: a page that sent its own index could overwrite an earlier
   guess and erase a miss. INSERT OR IGNORE on (play_id, idx) then means a retry
   of the same submission is one row, and a genuinely new guess gets the next
   index because the count moved. */
export async function recordGuess(env, playId, entryN, guess, correct, atMs) {
  if (!usable(env, playId)) return null;
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM gd_guess WHERE play_id = ?").bind(playId).first();
    const idx = Number((row && row.n) || 0);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO gd_guess (play_id, idx, entry_n, guess, correct, at_ms)" +
      " VALUES (?, ?, ?, ?, ?, ?)")
      .bind(playId, idx, Number(entryN), String(guess), correct ? 1 : 0,
            Number(atMs) || Date.now()).run();
    return idx;
  } catch (e) { return null; }
}

/* A revealed letter, keyed by CELL. A cell belongs to two entries at a
   crossing, so revealing it from either is the same reveal and must be charged
   once — which is what the primary key says, rather than a rule written in the
   endpoint that the endpoint could forget. */
export async function recordHint(env, playId, cell, atMs) {
  if (!usable(env, playId)) return null;
  try {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO gd_hint (play_id, cell, at_ms) VALUES (?, ?, ?)")
      .bind(playId, String(cell), Number(atMs) || Date.now()).run();
    return true;
  } catch (e) { return null; }
}

/* ---- reading back ------------------------------------------------------- */

/* THE STATE OF A ROUND, derived from its rows and from rules.js, which is the
   same file the browser renders with and the same file the marking uses. */
export async function roundState(env, playId) {
  if (!usable(env, playId)) return null;
  try {
    const guesses = await env.DB.prepare(
      "SELECT entry_n, guess, correct FROM gd_guess WHERE play_id = ? ORDER BY idx")
      .bind(playId).all();
    const hints = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM gd_hint WHERE play_id = ?").bind(playId).first();
    const rows = guesses.results || [];

    /* Turns walked forward one row at a time, not netted. Netting gives the
       same number here and would stop doing so the day a rule cares about the
       order — and one already does: the board is over when this reaches zero,
       so a guess after that point must not be able to bring it back. */
    let turns = RULES.TURNS_START, misses = 0, over = false;
    const solved = new Set();
    for (const r of rows) {
      if (over) continue;                        // full time; the row is history
      if (r.correct) { turns = RULES.turnsAfter(turns, true); solved.add(Number(r.entry_n)); }
      else { turns = RULES.turnsAfter(turns, false); misses++; }
      if (RULES.isOver({ solved: solved.size, turns })) over = true;
    }
    const hintCount = Number((hints && hints.n) || 0);
    return {
      turns, misses, over,
      solved: solved.size, solvedEntries: [...solved].sort((a, b) => a - b),
      hints: hintCount * RULES.PTS_LETTER,
      score: RULES.score({ solved: solved.size, misses, hints: hintCount * RULES.PTS_LETTER }),
    };
  } catch (e) {
    /* The tables are absent or unreadable. Null, and the caller serves the
       verdict without a score rather than refusing to judge. */
    if (e && TABLE_MISSING.test(String(e.message || e))) return null;
    return null;
  }
}

/* Which cells this round has proved, so a crossing is free and a hint is not
   charged twice. Derived from the guesses and the board, because a cell is
   confirmed by a CORRECT mark and that is a fact about the marking rather than
   a thing worth its own table. */
export async function confirmedCells(env, playId, board) {
  const out = {};
  if (!usable(env, playId) || !board) return out;
  try {
    const guesses = await env.DB.prepare(
      "SELECT entry_n, guess FROM gd_guess WHERE play_id = ? ORDER BY idx")
      .bind(playId).all();
    for (const r of (guesses.results || [])) {
      const entry = (board.entries || []).find((e) => Number(e.n) === Number(r.entry_n));
      if (!entry) continue;
      const marks = RULES.mark(r.guess, entry.answer);
      if (!marks) continue;
      RULES.propagate(entry, marks, out).forEach((c) => { out[c.cell] = c.letter; });
    }
    const hints = await env.DB.prepare(
      "SELECT cell FROM gd_hint WHERE play_id = ?").bind(playId).all();
    for (const h of (hints.results || [])) {
      /* A revealed cell is confirmed like any other, and its letter comes from
         the board rather than from anything the client said. */
      const owner = (board.entries || []).find((e) => (e.cells || []).includes(String(h.cell)));
      if (!owner) continue;
      const i = owner.cells.indexOf(String(h.cell));
      if (i >= 0 && owner.answer) out[String(h.cell)] = owner.answer[i];
    }
    return out;
  } catch (e) { return out; }
}
