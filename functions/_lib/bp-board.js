/* bp-board.js — Ballpark XI's boards, and the number that must not travel.
 *
 * THE ONE THING THIS FILE IS FOR. Every question is a number, and the number IS
 * the answer: a question sent whole is a question already answered. The word
 * search shipped its boards whole and had two live leaks closed before its
 * score could mean anything; Grid XI was built the other way round because of
 * it, and so is this. publicQuestion() below is where it is enforced.
 *
 * WHAT A BROWSER IS HANDED: the question, its detail line, where the slider
 * starts and ends, its step, its unit, the WIDTH of the ballpark, and whether
 * the question is graded strictly. Not the answer.
 *
 * `tolerance` IS SAFE TO SEND and the page needs it: it is the width of the
 * band, not where the band is, and the reference demo draws it around the
 * player's own knob to say how precise they must be. Without the answer it
 * locates nothing.
 *
 * WHY THERE IS NO "DOES THE SERIALISED BOARD CONTAIN AN ANSWER" GREP HERE.
 * Grid XI ends its daily route with one, and it works there because answers are
 * WORDS: a grid containing PIRLO contains it on purpose or by a leak, and
 * either way it is worth stopping. Numbers coincide. 92 is an answer on one
 * board and a slider end on another, and 80 questions in the bank have their
 * answer sitting exactly on `hi` — so a value grep would fire on all of them
 * while catching nothing, which is the vacuous check this project has found six
 * of. The guard here is STRUCTURAL instead: the projection is built from an
 * allowlist, and leaks() asserts that what came out carries no key the
 * allowlist does not name. A new field on a question is inert until somebody
 * adds it here on purpose.
 */
import { utcDay } from "./daily.js";
import { BP_SAMPLE_BOARDS, BP_SAMPLE_SCHEDULE } from "./bp-sample.js";
/* The rules are the PAGE'S own file, imported rather than restated — the same
   arrangement Grid XI, HiLo and Scrambled keep. One statement of the ladder,
   the clock and what a substitution costs, executed on the server and rendered
   by the client. See football/ballpark/js/rules.js. */
import XIBP_RULES from "../../football/ballpark/js/rules.js";

export function hasDB(env) { return !!(env && env.DB); }
export function todayKey(now = Date.now()) { return utcDay(now); }

/* The token a round is played under. It names the BOARD, not the day, for the
   reason Grid XI's does: a board opened from the archive is the same board it
   was on its own day, and a token that said "the daily" would make two
   different rounds look like one. */
export const boardToken = (id) => "bp:" + id;

/* THE FIELDS A QUESTION MAY SHOW. `answer` is not here and must never be. */
const PUBLIC_KEYS = ["id", "question", "detail", "lo", "hi", "tolerance",
  "step", "unit", "strict"];

/* ---- the bank ---------------------------------------------------------- */

export async function loadBank(env) {
  if (!hasDB(env)) return sampleBank();
  try {
    const boards = await env.DB.prepare(
      "SELECT id, ordinal, payload FROM bp_board").all();
    const sched = await env.DB.prepare(
      "SELECT day, board_id FROM bp_schedule").all();
    const list = (boards.results || []).map(rowToBoard).filter(Boolean);
    if (!list.length) return sampleBank();
    const schedule = {};
    for (const r of (sched.results || [])) schedule[String(r.day)] = String(r.board_id);
    return { boards: list, schedule, source: "d1" };
  } catch (e) {
    /* The tables are absent or unreadable. The sample, and SAID so — a game
       that quietly serves a fixture while claiming to serve the bank is the
       fault every `source` field in this family exists to prevent. */
    return sampleBank();
  }
}

/* The sample's calendar is OFFSETS from today rather than dates, because a
   fixture with a date in it expires and then reports a fault in the code when
   the fault is in the fixture. Resolved here, once. */
function sampleBank(now = Date.now()) {
  const schedule = {};
  for (const off of Object.keys(BP_SAMPLE_SCHEDULE)) {
    const day = utcDay(now + Number(off) * 86400000);
    if (day) schedule[day] = BP_SAMPLE_SCHEDULE[off];
  }
  return { boards: BP_SAMPLE_BOARDS, schedule, source: "sample" };
}

function rowToBoard(r) {
  let payload;
  try { payload = JSON.parse(r.payload); } catch (e) { return null; }
  return {
    id: String(r.id), ordinal: Number(r.ordinal),
    questions: payload.questions || [],
  };
}

export function boardById(bank, id) {
  return (bank.boards || []).find((b) => String(b.id) === String(id)) || null;
}

export function boardForDay(bank, day) {
  const id = (bank.schedule || {})[String(day)];
  return id ? boardById(bank, id) : null;
}

export function dayOf(bank, id) {
  const found = Object.keys(bank.schedule || {}).find(
    (d) => String(bank.schedule[d]) === String(id));
  return found || null;
}

/* MAY THIS BOARD BE PLAYED AT ALL. One question, one answer, one place — the
   shape Grid XI arrived at the hard way, hours after it launched, when its
   daily route refused a future board and the door beside it did not. Every
   endpoint here asks this and none of them re-reasons about days. */
export function playable(bank, board, now) {
  if (!board) return false;
  const day = dayOf(bank, board.id);
  return !!day && day <= todayKey(now);
}

/* ---- what the browser gets --------------------------------------------- */

export function publicQuestion(q) {
  const out = {};
  for (const k of PUBLIC_KEYS) if (q[k] !== undefined) out[k] = q[k];
  return out;
}

export function publicBoard(board, token) {
  return {
    token,
    id: String(board.id),
    questions: (board.questions || []).map(publicQuestion),
  };
}

/* THE LAST CHECK BEFORE IT GOES OUT, asked of the thing actually being
   serialised rather than of the board it came from — between the bank and here
   a board has been through a database and a JSON round trip. Structural, for
   the reason set out at the top of this file. */
export function leaks(pub) {
  const found = [];
  for (const q of (pub.questions || [])) {
    for (const k of Object.keys(q)) {
      if (!PUBLIC_KEYS.includes(k)) found.push(String(q.id || "?") + ": " + k);
    }
  }
  return found;
}

/* ---- narrowing ---------------------------------------------------------
 *
 * HALF THE SLIDER, WITH THE ANSWER SOMEWHERE INSIDE IT — and deliberately not
 * at its centre, because a centred window would BE the answer.
 *
 * The demo picks the offset with Math.random(). A server may not: a retried
 * request would deal a SECOND window, and two windows placed around one answer
 * intersect on a range far smaller than either, so asking twice would be worth
 * more than asking once. The offset here is derived from the round and the
 * question, so one question in one round has one window however many times it
 * is asked for. It is also stored — see migration 034 — so the stored row is
 * what a retry returns and this function is only ever consulted once.
 */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function narrowWindow(q, seed) {
  const lo0 = Number(q.lo), hi0 = Number(q.hi), a = Number(q.answer);
  const tol = Number(q.tolerance), step = Number(q.step) || 1;
  /* HALF THE SLIDER, ROUNDED TO THE STEP. A width off the step grid puts the
     window's top end somewhere the slider cannot stop — 374..879 with a step of
     1 was narrowing to 383..635.5, and 635.5 is not a value the control can
     take, so the top of the range was unreachable. At least one step wide,
     because a question with a very short range must still narrow to something
     that can be moved. */
  const W = Math.max(step, Math.round(((hi0 - lo0) / 2) / step) * step);

  /* THE WINDOW IS CHOSEN FROM THE RANGE THAT IS ALREADY LEGAL, rather than
     chosen freely and then dragged back.
     Dragging it back was the first attempt and it was worse than doing nothing:
     when the window overshot at BOTH ends, the two corrections set it to
     exactly the ballpark plus a step either side — a window centred on the
     answer, and barely wider than the band. It handed the answer over in the
     one case where the player had paid most for it. Nine of the fixture's
     eighty-eight windows came out that way.
     So: a window of width W must start somewhere in [loMin, loMax] for the
     whole ballpark to sit inside it and for it to sit inside the slider. Pick
     from there and no correction is ever needed. */
  const loMin = Math.max(lo0, a + tol - W);
  const loMax = Math.min(a - tol, hi0 - W);
  /* THE BAND IS TOO WIDE TO HALVE AROUND. Nothing is narrowed and the original
     range comes back — the caller charges for what it got, which is nothing, so
     this must not pretend. The content rules keep the band under a fifth of the
     range (checked: none of the 1,925 questions breaks it), so this is a guard
     rather than a path the bank can reach today. */
  if (loMin > loMax) return { lo: lo0, hi: hi0, narrowed: false };

  const u = hash(String(seed));
  let lo = loMin + u * (loMax - loMin);
  /* KEPT OFF THE MIDDLE. A window whose centre lands on the answer would BE the
     answer, read off in a glance, for the price of a substitution that was
     meant to buy a narrower guess and not a free one. The centred start is
     `a - W/2`; anything within a step of it is pushed a step away, into
     whichever direction the feasible range still has room for. */
  const centredLo = a - W / 2;
  if (Math.abs(lo - centredLo) < step) {
    lo = lo + step <= loMax ? lo + step : lo - step;
  }
  lo = Math.min(loMax, Math.max(loMin, Math.round(lo / step) * step));
  /* Rounding to the step can walk it back onto the centre; asked again, after
     the last thing that moves it. */
  if (Math.abs((lo + W / 2) - a) < step / 2) {
    lo = lo + step <= loMax ? lo + step : lo - step;
    lo = Math.min(loMax, Math.max(loMin, lo));
  }
  return { lo, hi: lo + W, narrowed: true };
}

/* ---- judging ------------------------------------------------------------ */

/* THE SERVER MARKS, AND ONLY THE SERVER CAN. The browser holds no answer, so it
   could not do this if it wanted to — which is the arrangement, not a promise.
 *
 * The answer DOES come back with the verdict, and that is not a leak: the
 * question is locked and finished, and the demo puts the true value on the
 * track the moment it is. What must not happen is the answer arriving BEFORE
 * the lock, which is what publicQuestion() is for. */
export function judge(q, guess, elapsedSeconds) {
  const bp = XIBP_RULES.ballparksOut(guess, q.answer, q.tolerance);
  const grade = XIBP_RULES.gradeFor(bp, q);
  const points = Math.round(
    XIBP_RULES.pointsAt(elapsedSeconds, XIBP_RULES.CLOCK) * grade[1]);
  return {
    ballparks: bp, grade: grade[2], green: grade[3], spentSub: !!grade[4],
    points, answer: Number(q.answer),
  };
}

/* OUT OF TIME. Nought and a substitution, which is what the demo's timedOut()
   does — a question left unanswered costs a life exactly as a wild guess does,
   so running the clock down is never the cheaper way out. */
export function judgeTimeout(q) {
  return {
    ballparks: Infinity, grade: "Out of time", green: false, spentSub: true,
    points: 0, answer: Number(q.answer),
  };
}

export function questionAt(board, idx) {
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 1 || i > (board.questions || []).length) return null;
  return board.questions[i - 1];
}

/* The answers, for the answers page and for full time — never for a question
   in progress. Kept here so every place answers are handed out is one grep
   away, the same reason Grid XI's answersOf() sits beside its judge(). */
export function answersOf(board) {
  return (board.questions || []).map((q, i) => ({
    idx: i + 1, id: q.id, question: q.question, answer: Number(q.answer),
    unit: q.unit || null,
  }));
}

export const RULES = XIBP_RULES;
