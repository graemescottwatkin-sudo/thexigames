/* gd-board.js — Grid XI's boards, and the line every letter has to cross.
 *
 * THE ONE THING THIS FILE IS FOR. The grid starts EMPTY, so every letter in it
 * is an answer: a board sent whole is the board solved. The word search learned
 * this late and had two live leaks to close before its score could mean
 * anything — its board travelled with every answer's exact start and end
 * square, so the page judged its own drags and the score was a number the
 * browser chose. This game is built the other way round from its first day, and
 * publicBoard() below is where that is enforced.
 *
 * WHAT A BROWSER IS HANDED: the title, which is the entire clue; the shape of
 * the grid; how long each entry is and which cells it occupies; and which cells
 * two entries share. Not one letter. The crossings are safe to send because
 * knowing that 6,2 belongs to two entries is exactly what the player is told
 * the moment a green propagates, and it is structure rather than content.
 *
 * THE BANK COMES FROM D1 WHEN IT IS BOUND, AND FROM THE SAMPLE WHEN IT IS NOT
 * — the same arrangement HiLo and the word search keep, so an offline suite and
 * `wrangler pages dev` both open a real board and say which they are on.
 */
import { utcDay, dailyNumber, dailyDayKey } from "./daily.js";
import { GD_SAMPLE_BOARDS, GD_SAMPLE_SCHEDULE } from "./gd-sample.js";
/* THE RULE IS THE PAGE'S OWN FILE, imported rather than restated — the same
   reason HiLo's, Scrambled's and the word search's scoring can be shared. One
   statement of how a guess is marked, executed on the server, rendered by the
   client. See football/grid/js/rules.js, which says why that is safe: the
   algorithm is public and the answer is not. */
import XIGR_RULES from "../../football/grid/js/rules.js";

export function hasDB(env) { return !!(env && env.DB); }
export function todayKey(now = Date.now()) { return utcDay(now); }

/* A board's address is its number, the family's day count — see permalink.js,
   which made every game agree on that on 6 September 2026. The SCHEDULE is
   keyed by day, because a calendar is, so the two are reconciled here. */
export const dayForNo = (no) => dailyDayKey(no);
export const todayNo = (now = Date.now()) => dailyNumber(now);

/* The token a round is played under. It names the BOARD, not the day: a board
   opened from the archive is the same board it was on its own day, and a token
   that said "the daily" would make two different rounds look like one. */
export const boardToken = (id) => "gd:" + id;

/* ---- the bank ---------------------------------------------------------- */

export async function loadBank(env) {
  if (!hasDB(env)) return sampleBank();
  try {
    const boards = await env.DB.prepare(
      "SELECT id, set_id, kind, title, rows, cols, payload FROM gd_board").all();
    const sched = await env.DB.prepare(
      "SELECT day, board_id FROM gd_schedule").all();
    const list = (boards.results || []).map(rowToBoard).filter(Boolean);
    if (!list.length) return sampleBank();
    const schedule = {};
    for (const r of (sched.results || [])) schedule[String(r.day)] = String(r.board_id);
    return { boards: list, schedule, source: "d1" };
  } catch (e) {
    /* The tables are absent or unreadable. The sample, and SAID so — a game
       that quietly serves a fixture while claiming to serve the bank is the
       fault this whole family of `source` fields exists to prevent. */
    return sampleBank();
  }
}

/* The sample's calendar is written as OFFSETS from today rather than as dates,
   because a fixture with a date in it expires and then reports a fault in the
   code. Resolved here, once, against the same clock everything else uses. */
function sampleBank(now = Date.now()) {
  const schedule = {};
  for (const off of Object.keys(GD_SAMPLE_SCHEDULE)) {
    const day = dailyDayKey(dailyNumber(now) + Number(off));
    if (day) schedule[day] = GD_SAMPLE_SCHEDULE[off];
  }
  return { boards: GD_SAMPLE_BOARDS, schedule, source: "sample" };
}

function rowToBoard(r) {
  let payload;
  try { payload = JSON.parse(r.payload); } catch (e) { return null; }
  return {
    id: String(r.id), set_id: r.set_id, kind: r.kind, title: r.title,
    rows: Number(r.rows), cols: Number(r.cols),
    entries: payload.entries || [], crossings: payload.crossings || [],
  };
}

export function boardById(bank, id) {
  return (bank.boards || []).find((b) => String(b.id) === String(id)) || null;
}

/* Which board a DAY holds, or null. A day with no row is a day the game did not
   run — HiLo's schedule starts after the family's epoch and Grid XI's will too,
   so "no board" is an ordinary answer and not an error. */
export function boardForDay(bank, day) {
  const id = (bank.schedule || {})[String(day)];
  return id ? boardById(bank, id) : null;
}

/* MAY THIS BOARD BE PLAYED AT ALL, and it is one question with one answer.
 *
 * A CATALOGUE BOARD ALWAYS MAY: it has no day, which is what makes it the
 * catalogue. A DAILY MAY ONCE ITS DAY HAS COME, and not before.
 *
 * This existed only inside /api/grid/daily, which refuses a board whose day is
 * ahead — and /api/grid/guess, beside it, judged any board in the bank. A
 * token is "gd:" + an id, the ids run gx-0001 upward, and every guess came
 * back with per-letter marks and the confirmed letters with their cells, so
 * the whole of tomorrow's board could be had one guess at a time. Found on
 * 7 September 2026, hours after the game launched, while wiring the
 * catalogue. One rule, in one place, so the next door cannot be left open.
 */
export function playable(bank, board, now) {
  if (!board) return false;
  if (board.kind === "free") return true;
  const day = dayOf(bank, board.id);
  return !!day && day <= todayKey(now);
}

/* ---- the catalogue ------------------------------------------------------
 *
 * A FREE BOARD IS NEVER IN THE CALENDAR. It is the one somebody goes looking
 * for rather than the one set for everybody today — the owner's plan for these
 * is the older and more obscure elevens — and it is the only kind that can
 * carry a challenge, because a challenge on a daily would be a challenge on
 * the board everybody is already playing.
 *
 * IDENTITY ONLY. A catalogue list is a menu: ids and titles, never a payload.
 * Sending the boards themselves would be sending every grid in the bank to
 * anyone who opened the page, which is the leak the word search closed. */
export function catalogue(bank) {
  return (bank.boards || [])
    .filter((b) => b.kind === "free")
    .map((b) => ({ id: b.id, title: b.title, set_id: b.set_id || null }))
    .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
}

/* One catalogue board, by id. A DAILY is refused here however it is asked
   for: the daily route is where a daily comes from, and serving one through
   this door would hand out a board whose day has not come. */
export function freeBoard(bank, id) {
  const b = boardById(bank, id);
  return b && b.kind === "free" ? b : null;
}

export function dayOf(bank, id) {
  const found = Object.keys(bank.schedule || {}).find(
    (d) => String(bank.schedule[d]) === String(id));
  return found || null;
}

/* ---- what the browser gets --------------------------------------------- */

/* NO LETTERS. Not the answers, not a first letter, not a checksum a client
   could brute-force against. The player is given the SHAPE of the grid and
   nothing that is in it.
 *
 * There is no `given` field and there is deliberately no way to add one here:
 * the owner's ruling of 6 September is that a board opens on its title alone,
 * and if that is ever revisited it is a decision the server makes per board and
 * sends as data — never something the client derives. */
export function publicBoard(board, token) {
  return {
    token,
    id: String(board.id),
    /* THE TITLE IS THE ENTIRE CLUE. There is nothing else on the card. */
    title: board.title,
    rows: board.rows,
    cols: board.cols,
    entries: (board.entries || []).map((e) => ({
      n: e.n, dir: e.dir, r: e.r, c: e.c, len: e.len, cells: e.cells,
    })),
    /* Structure, not content: which cells two entries share. The player learns
       this the moment a green propagates and needs it to render the grid. */
    crossings: (board.crossings || []).map((x) => ({ cell: x.cell, entries: x.entries })),
  };
}

/* Every string a public board could carry, flattened — so a check can ask
   "does any answer appear anywhere in this" without knowing the shape. The
   emitter has the same helper for the same reason, and both are used. */
export function publicText(board, token) {
  return JSON.stringify(publicBoard(board, token));
}

/* ---- judging a guess ---------------------------------------------------- */

export function entryOf(board, n) {
  return (board.entries || []).find((e) => Number(e.n) === Number(n)) || null;
}

/* THE SERVER MARKS, AND ONLY THE SERVER CAN. The browser holds no answer, so it
   could not do this if it wanted to — which is the arrangement, not a promise.
 *
 * Returns what the player is told and nothing more: the marks, whether it was
 * right, and the cells this guess newly proved. NOT the answer, even when the
 * guess is wrong; and not the answer when it is right either — the page already
 * has the letters it typed, and sending the word back would put an answer on
 * the wire for the eleven entries that are still unsolved to be compared
 * against. */
export function judge(board, n, guess, known) {
  const entry = entryOf(board, n);
  if (!entry) return { error: "No such entry." };
  const marks = XIGR_RULES.mark(guess, entry.answer);
  if (!marks) return { error: "That is not the right length." };
  const correct = XIGR_RULES.isSolved(marks);
  return {
    n: entry.n,
    marks,
    correct,
    /* Only greens travel. Amber and grey are claims about THIS answer and say
       nothing about the entry crossing it — see rules.js, which states that
       precisely because it is the rule a player cannot argue with when it is
       wrong. */
    confirms: XIGR_RULES.propagate(entry, marks, known || {}),
  };
}

/* The answers, for the answers page and for a report — never for a round in
   progress. Kept here rather than read off `entries` at the call site so that
   every place answers are handed out is one grep away. */
export function answersOf(board) {
  return (board.entries || []).map((e) => ({
    n: e.n, answer: e.answer, member: e.member || null,
  }));
}

export const RULES = XIGR_RULES;
