/* bp-round.js — the clock, the substitutions and the points the server owns, so
 * a Ballpark XI score can be verified.
 *
 * WHAT A SCORE IS MADE OF, and why none of it is a counter:
 *
 *   the clock      twenty seconds a question, ten of grace, then a point a
 *                  second — and the seconds are measured HERE, between the
 *                  moment the question was opened and the moment the guess
 *                  arrived. A page that timed itself would be a page that
 *                  chooses its own score.
 *   the ladder     how far out the guess was, in ballparks, graded server-side
 *                  because the answer only exists server-side
 *   the subs       three lives: a wide miss spends one, so does running out of
 *                  time, and so does narrowing while any remain
 *   the bonus      a point for each bang-on, four at most, which is what
 *                  carries 110 to 114
 *
 * ROWS PER EVENT, DERIVED ON READ. The score, the substitutions spent and
 * whether the board is over are read back out of these rows every time rather
 * than kept in columns beside them — a column would be a second statement of
 * the same fact, and this project has paid for those. Grid XI's gd-round.js is
 * the same arrangement and says so at greater length.
 *
 * WHAT IS *NOT* DERIVED, AND WHY. The grade and the points of a locked guess
 * ARE stored. Re-deriving them would need the ladder at read time, so the day a
 * ladder moved — and one moved on 8 September, for the strict kinds — every
 * past round would silently re-score. A verdict is what was true when it was
 * given.
 *
 * IT NEVER REFUSES A GUESS FOR WANT OF A DATABASE. Every function returns
 * rather than throws and does nothing at all without a database or a play id.
 * The game does not depend on being scored: the verdict is served either way
 * and only the SCORE is lost, which is what HiLo, Scrambled and Grid XI do.
 */
import { RULES } from "./bp-board.js";

function usable(env, playId) {
  return !!(env && env.DB && typeof playId === "string" && playId.length > 0);
}

/* ---- writing ------------------------------------------------------------ */

/* Kick off. Idempotent on play_id: a double tap, or a page that reloaded and
   resumed, must not start a second round for one attempt. The clock is planted
   on question zero — no question is open yet, and openQuestion() is the only
   thing that moves it. */
export async function startRound(env, playId, boardId, day, atMs) {
  if (!usable(env, playId)) return null;
  try {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO bp_round (play_id, board_id, day, started_ms, clock_idx, clock_ms)" +
      " VALUES (?, ?, ?, ?, 0, ?)")
      .bind(playId, String(boardId), String(day), Number(atMs) || Date.now(),
            Number(atMs) || Date.now()).run();
    return true;
  } catch (e) { return null; }
}

/* THE CLOCK ONLY EVER GOES FORWARD. A question's twenty seconds start when it
   is shown, so the page has to say it has shown one — and that message can
   arrive twice, from a refresh, a double tap, or a retry on a dropped
   connection. The WHERE clause is the whole guard: the clock moves only to a
   question LATER than the one it is on, so re-opening the current question is a
   no-op and there is no way to buy back seconds already spent. */
export async function openQuestion(env, playId, idx, atMs) {
  if (!usable(env, playId)) return null;
  try {
    await env.DB.prepare(
      "UPDATE bp_round SET clock_idx = ?, clock_ms = ? WHERE play_id = ? AND clock_idx < ?")
      .bind(Number(idx), Number(atMs) || Date.now(), playId, Number(idx)).run();
    return true;
  } catch (e) { return null; }
}

export async function roundRow(env, playId) {
  if (!usable(env, playId)) return null;
  try {
    return await env.DB.prepare(
      "SELECT play_id, board_id, day, started_ms, clock_idx, clock_ms" +
      " FROM bp_round WHERE play_id = ?").bind(playId).first();
  } catch (e) { return null; }
}

/* One locked guess, with the verdict this server gave it. INSERT OR IGNORE on
   (play_id, idx) so a retried submission is one row and cannot be re-graded on
   a second, later clock reading. */
export async function recordAnswer(env, playId, idx, v, elapsedMs, atMs) {
  if (!usable(env, playId)) return null;
  try {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO bp_answer (play_id, idx, question_id, guess, ballparks," +
      " grade, points, spent_sub, elapsed_ms, at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(playId, Number(idx), String(v.questionId),
            v.guess === null || v.guess === undefined ? null : Number(v.guess),
            /* Infinity is not a REAL. A timeout is stored as -1, which no real
               distance can be, rather than as a number that would read as a
               very good guess. */
            Number.isFinite(v.ballparks) ? Number(v.ballparks) : -1,
            String(v.grade), Number(v.points), v.spentSub ? 1 : 0,
            Number(elapsedMs) || 0, Number(atMs) || Date.now()).run();
    return true;
  } catch (e) { return null; }
}

/* A narrowed range. The window is stored as it was served, so a retry returns
   the same one — see migration 034 for why a second window would be worth more
   than the first. */
export async function recordNarrow(env, playId, idx, spentSub, lo, hi, atMs) {
  if (!usable(env, playId)) return null;
  try {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO bp_narrow (play_id, idx, spent_sub, lo, hi, at_ms)" +
      " VALUES (?, ?, ?, ?, ?, ?)")
      .bind(playId, Number(idx), spentSub ? 1 : 0, Number(lo), Number(hi),
            Number(atMs) || Date.now()).run();
    return true;
  } catch (e) { return null; }
}

export async function narrowFor(env, playId, idx) {
  if (!usable(env, playId)) return null;
  try {
    return await env.DB.prepare(
      "SELECT idx, spent_sub, lo, hi FROM bp_narrow WHERE play_id = ? AND idx = ?")
      .bind(playId, Number(idx)).first();
  } catch (e) { return null; }
}

/* ---- reading back ------------------------------------------------------- */

/* THE STATE OF A ROUND, derived from its rows and from rules.js — the same file
   the browser renders with and the same file the grading used. */
export async function roundState(env, playId) {
  if (!usable(env, playId)) return null;
  try {
    const answers = await env.DB.prepare(
      "SELECT idx, question_id, guess, ballparks, grade, points, spent_sub" +
      " FROM bp_answer WHERE play_id = ? ORDER BY idx").bind(playId).all();
    const narrows = await env.DB.prepare(
      "SELECT idx, spent_sub FROM bp_narrow WHERE play_id = ?").bind(playId).all();
    const rows = answers.results || [];
    const nrows = narrows.results || [];

    let points = 0, bangOns = 0, green = 0, subsUsed = 0;
    for (const r of rows) {
      points += Number(r.points) || 0;
      if (r.grade === "Bang on") bangOns++;
      if (Number(r.spent_sub)) subsUsed++;
      /* "Green" is the ladder's own verdict on whether this reads as a good
         answer, and it is the share of the points that says so — not the
         label, which differs between the two ladders ("In the ballpark" and
         "A year out" are both green). Recovered from the grade rather than
         stored, because it is the one thing here that a ladder change SHOULD
         restate: it is a description, not a verdict. */
      if (greenGrades.has(String(r.grade))) green++;
    }
    for (const n of nrows) if (Number(n.spent_sub)) subsUsed++;

    const answered = rows.length;
    const over = answered >= RULES.QUESTIONS;
    return {
      answered, over,
      /* Which questions have been locked, so a resuming page knows where it is
         without being asked to remember. */
      lockedIdx: rows.map((r) => Number(r.idx)),
      subsUsed, green, bangOns,
      /* THE RUNNING TOTAL, and at full time the final one. Bonuses are applied
         by rules.js so the cap of four lives in one place. */
      score: RULES.score({ points: points, bangOns: bangOns }),
      /* WIN, DRAW, LOSS — decided only once the eleventh is locked. A round in
         progress has no result, and the server never learns that somebody
         walked away, so there is no honest way to report a loss from here. */
      result: over ? (subsUsed <= RULES.SUBS ? "W" : "D") : null,
      /* Every narrow, by question, so the page can show which ranges were
         bought without asking a second endpoint. */
      narrowed: nrows.map((n) => Number(n.idx)),
    };
  } catch (e) {
    /* The tables are absent or unreadable. Null, and the caller serves the
       verdict without a score rather than refusing to judge. */
    return null;
  }
}

/* The grades that read as a good answer, taken from the ladders themselves so
   that adding a rung cannot leave this list behind. */
const greenGrades = new Set(
  [...RULES.GRADES, ...RULES.STRICT_GRADES].filter((g) => g[3]).map((g) => g[2]));

/* The verdicts, for a page that is resuming or for full time. The ANSWER is not
   in here: it belongs to the response that graded the guess, and to the answers
   at full time, neither of which is this. */
export async function verdicts(env, playId) {
  if (!usable(env, playId)) return [];
  try {
    const r = await env.DB.prepare(
      "SELECT idx, question_id, guess, ballparks, grade, points, spent_sub" +
      " FROM bp_answer WHERE play_id = ? ORDER BY idx").bind(playId).all();
    return (r.results || []).map((x) => ({
      idx: Number(x.idx), questionId: String(x.question_id),
      guess: x.guess === null ? null : Number(x.guess),
      ballparks: Number(x.ballparks) < 0 ? null : Number(x.ballparks),
      grade: String(x.grade), points: Number(x.points),
      spentSub: !!Number(x.spent_sub),
    }));
  } catch (e) { return []; }
}
