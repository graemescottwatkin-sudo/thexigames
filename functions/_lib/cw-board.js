/* functions/_lib/cw-board.js — Codeword XI's bank, and what may leave it.
 *
 * A filled crossword grid with its letters replaced by numbers 1-26, three
 * starter letters given, eleven football answers and no clues. The cipher IS
 * the puzzle.
 *
 * THE SOLUTION NEVER LEAVES THIS DATABASE, which is the whole reason this file
 * exists rather than the route handing over the row it read. A board's payload
 * carries `rows` — the FILLED grid — `words`, every answer with its position,
 * and `code`, the entire cipher. Any one of the three is the puzzle solved:
 * `rows` is the answer sheet, `words` is the answer sheet in a list, and `code`
 * plus the numbers a player can see inverts to `rows` in one pass. So none of
 * them goes out. What goes out is what a printed codeword prints: the numbers,
 * the blocks, three given letters, and the clues.
 *
 * That is the same boundary the crossword holds — /api/daily ships cell shape
 * and never a letter — and the same one Grid XI and Ballpark were built to
 * after the word search shipped its boards whole and had two live leaks closed
 * before its score could mean anything.
 *
 * AND IT IS A DIFFERENT FAULT FROM THE ONE THE IMPORTER FIXED. The importer
 * stops a YEAR of solutions being readable as static files; this stops TODAY'S
 * being readable in the response. Fixing either alone leaves the puzzle
 * solvable without being played.
 */
import { utcDay, dailyDayKey } from "./daily.js";

export function hasDB(env) { return !!(env && env.DB); }

/* The server decides what day it is, in UTC. Never a date sent up. */
export function todayKey(now = Date.now()) { return utcDay(now); }

/* ---- the queue ----
 *
 * THE EPOCH IS NOT HELD HERE EITHER. cw_schedule stores an explicit day per
 * board, so this file never does epoch arithmetic and a re-based calendar — the
 * owner has said he may reset every game to day one — is a rewrite of that
 * table and nothing else. A constant here would be a second copy that a reset
 * would silently disagree with, which is the fault the importer was rewritten
 * to avoid an hour after it was written.
 */
export async function boardForDay(env, day) {
  if (!hasDB(env)) return null;
  const row = await env.DB.prepare(
    "SELECT b.no, b.day, b.payload FROM cw_schedule s " +
    "JOIN cw_board b ON b.no = s.board_no WHERE s.day = ?"
  ).bind(day).first();
  if (!row) return null;
  try { return { no: row.no, day: row.day, ...JSON.parse(row.payload) }; }
  catch (e) { return null; }
}

/* A BOARD BY ITS NUMBER, BOUNDED BY THE CALENDAR RATHER THAN BY THE NUMBER.
 *
 * The past opens and the future never does, and the bound is the SCHEDULE's:
 * a board is reachable when the day it was given is today or earlier. Nothing
 * here does epoch arithmetic to decide that — it joins on cw_schedule and lets
 * the calendar answer, so a re-based queue moves what is reachable without
 * this function knowing a reset happened.
 *
 * A board with no scheduled day is not a board. That is the word search's rule
 * of 6 September stated for this game: its schedule held two years of
 * inventory and every reader that treated "in the table" as "has run"
 * published 233 boards nobody had played. Here the day must EXIST and be past.
 */
export async function boardByNo(env, no, today) {
  if (!hasDB(env) || !Number.isInteger(no) || no < 1) return null;
  const row = await env.DB.prepare(
    "SELECT b.no, b.day, b.payload FROM cw_board b " +
    "JOIN cw_schedule s ON s.board_no = b.no WHERE b.no = ? AND s.day <= ?"
  ).bind(no, today).first();
  if (!row) return null;
  try { return { no: row.no, day: row.day, ...JSON.parse(row.payload) }; }
  catch (e) { return null; }
}

/* A BOARD BY THE NUMBER THE REST OF THE SITE CALLS IT.
 *
 * TWO NUMBERINGS EXIST AND THEY ARE NOT THE SAME, which is the thing this
 * function is for. cw_board.no is Codeword's own 1..365, counted from ITS epoch
 * of 13 September 2026. Every address on this site is a FAMILY board number
 * counted from the family's day one, 26 August 2026 — /football/<game>/daily/12
 * is 6 September in all of them, and the number means the same thing
 * everywhere. So Codeword's board 1 is family number 20, not 1.
 *
 * Found by asking keyLabel what /football/codeword/daily/1 would be called and
 * being told 26 August 2026 — a date three weeks before the game existed. The
 * two numberings differ by nineteen and the endpoint would have served the
 * wrong board for every archive link on the site, quietly, because both numbers
 * are small positive integers and either looks reasonable in a URL.
 *
 * THE TRANSLATION IS A DAY, and the day is the only thing both schemes agree
 * about. The family number becomes a date by the shared arithmetic in daily.js
 * — not restated here — and the date is looked up in cw_schedule, which is
 * also what bounds it: a day at or before today, or nothing. */
export async function boardByFamilyNo(env, familyNo, today) {
  if (!hasDB(env) || !Number.isInteger(familyNo) || familyNo < 1) return null;
  const day = dailyDayKey(familyNo);
  if (!day || day > String(today)) return null;
  return await boardForDay(env, day);
}

/* The highest day the queue holds, for the runway check and for knowing when
   the game is about to run out. Asked of the schedule, not computed. */
export async function lastDay(env) {
  if (!hasDB(env)) return null;
  const row = await env.DB.prepare("SELECT MAX(day) AS d FROM cw_schedule").first();
  return row && row.d ? String(row.d) : null;
}

/* ---- what a browser is handed ---- */

/* THE NUMBERS, WHICH ARE THE PUZZLE. Each cell is the code number of the letter
   that belongs there, or null for a block. Derived from rows and code together
   and neither is sent: a player can see the numbers on paper too, and cannot
   get back to the letters from them without solving it. */
export function cipherGrid(board) {
  const rows = (board && board.rows) || [];
  const code = (board && board.code) || {};
  return rows.map((row) =>
    String(row).split("").map((ch) => (ch === "." ? null : (code[ch] || null))));
}

/* THE THREE STARTERS, as number to letter. This is the ONLY part of the cipher
   that may go out, and it is three of twenty-six by the game's own design —
   the given letters are printed on the puzzle. Sent as pairs rather than as a
   slice of `code` so that a future change to the given count cannot quietly
   start sending more of the mapping than it should. */
export function givenPairs(board) {
  const code = (board && board.code) || {};
  const out = [];
  for (const letter of (board && board.given) || []) {
    const n = code[letter];
    if (Number.isInteger(n)) out.push({ n, letter });
  }
  return out;
}

/* WHICH LETTERS THE BOARD DOES NOT USE.
 *
 * ASKED FOR, AND WEIGHED RATHER THAN WAVED THROUGH, because every field added
 * to a sealed response is a field somebody has to justify. This one narrows the
 * alphabet from 26 to 25 and that IS information — but it is information the
 * puzzle is designed to print, on paper as well as here: a codeword tells you
 * which letters are in play so a solver does not spend the afternoon trying to
 * fit QPR into a grid with no Q in it.
 *
 * IT CANNOT BE DERIVED FROM cells, which is why it has to be sent. The numbers
 * give a count — twenty-five distinct — and never an identity, and the identity
 * is the whole value of the line.
 *
 * AND IT REVEALS NO PAIR. Knowing Q is unused leaves the other twenty-five
 * numbers mapped to twenty-five letters in 25! arrangements less the three
 * given; it removes a candidate from every square at once rather than settling
 * any square. Derived from the GRID rather than from `code`, because code is a
 * bijection over all twenty-six whatever the board holds. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export function absentLetters(board) {
  const inGrid = new Set(((board && board.rows) || []).join("").split(""));
  return ALPHABET.filter((L) => !inGrid.has(L));
}

/* WHERE THE ENTRIES ARE, WITHOUT WHAT THEY SAY. The page has to draw the word
   breaks and attach each hint to its run of squares, which needs the position,
   the direction and the LENGTH — and never the answer. `words` holds
   [answer, row, col, dir]; the answer is dropped here and that is deliberate,
   because it is the only field in the entry that is a secret. */
export function slots(board) {
  const words = (board && board.words) || [];
  const hints = (board && board.hints) || [];
  const breaks = (board && board.breaks) || [];
  return words.map((w, i) => {
    const [answer, row, col, dir] = Array.isArray(w) ? w : [];
    const hint = hints[i] || {};
    return {
      row, col, dir,
      len: String(answer || "").length,
      /* The clue, which is meant to be read: a two-part sense and category,
         already joined by the producing side, plus the enumeration. */
      sense: hint.sense || null,
      cat: hint.cat || null,
      enum: hint.enum || null,
      text: hint.text || null,
      breaks: Array.isArray(breaks[i]) ? breaks[i] : [],
    };
  });
}

/* The board as it is served. Nothing here can be turned back into the grid:
   there is no `rows`, no `words`, no `code`, and the three givens are the three
   the puzzle prints anyway.
 *
 * `size` and the cell numbers are enough to render, `slots` is enough to draw
 * the bars and place the clues, and a solver still has to solve it. */
export function publicBoard(board) {
  if (!board) return null;
  return {
    no: board.no,
    day: board.day,
    size: board.size,
    cells: cipherGrid(board),
    given: givenPairs(board),
    absent: absentLetters(board),
    slots: slots(board),
  };
}

/* A guard rather than a comment. Anything handed to a browser goes through
   publicBoard, and this is what a suite asserts against so the rule is
   executed rather than trusted — the crossword's answers leaked twice before
   its equivalent existed. */
export const SECRET_FIELDS = ["rows", "words", "code"];
export function leaksSolution(served) {
  const seen = [];
  const walk = (v) => {
    if (!v || typeof v !== "object") return;
    for (const k of Object.keys(v)) {
      if (SECRET_FIELDS.includes(k)) seen.push(k);
      walk(v[k]);
    }
  };
  walk(served);
  return seen;
}
