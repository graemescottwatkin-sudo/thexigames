/* POST /api/ballpark/answer — { token, playId, idx, guess }
 *
 * One locked guess, graded here. THE BROWSER HOLDS NO ANSWER, so this is not a
 * convenience or a policy — it is the only place the grading can happen. The
 * page sends the number under the knob; it gets back how far out that was, what
 * the ladder calls it, what it earned, whether it cost a substitution, and the
 * true value, which is now safe to send because the question is finished.
 *
 * NOR DOES THE CLOCK COME FROM THE CLIENT. The seconds are measured between the
 * moment this server was told the question was opened and the moment this
 * request arrived. A page that sent its own elapsed time would be a page that
 * chooses its own score, which is the fault the word search had to be rebuilt
 * to remove.
 *
 * NOR DOES THE STATE. Which question is in play, how many substitutions are
 * gone and whether the board is over are read back out of this round's own rows
 * every time — see functions/_lib/bp-round.js.
 */
import { json, bad } from "../../_lib/puzzle.js";
import { csrfOk } from "../../_lib/auth.js";
import {
  loadBank, boardById, playable, questionAt, dayOf, judge, judgeTimeout,
  answersOf, RULES,
} from "../../_lib/bp-board.js";
import {
  startRound, roundRow, roundState, recordAnswer, narrowFor,
} from "../../_lib/bp-round.js";

/* THE WIRE IS NOT THE PLAYER'S FAULT. A lock at 19.9 seconds already scores
   almost nothing, so the only thing the timeout line decides is whether a
   substitution is spent — and spending one because a request took 400ms to
   arrive would punish a slow connection rather than a slow answer. Beyond this
   the clock has genuinely run out. */
const WIRE_GRACE_MS = 1500;

function boardForToken(bank, token) {
  const s = String(token || "");
  if (s.slice(0, 3) !== "bp:") return null;
  return boardById(bank, s.slice(3));
}

export async function onRequestPost({ request, env }) {
  if (!csrfOk(request)) return bad("Refused.", 403);
  /* One reading of the clock for the whole request: the guard below and the
     elapsed time must not disagree about what moment this is. */
  const now = Date.now();
  let body;
  try { body = await request.json(); } catch (e) { return bad("Expected a JSON body."); }

  const bank = await loadBank(env);
  const board = boardForToken(bank, body.token);
  if (!board) return bad("No such board.", 404);
  if (!playable(bank, board, now)) return bad("No such board.", 404);

  const idx = Number(body.idx);
  const q = questionAt(board, idx);
  if (!q) return bad("No such question.");

  const guess = Number(body.guess);
  if (!Number.isFinite(guess)) return bad("That is not a number.");

  await startRound(env, body.playId, board.id, dayOf(bank, board.id) || "", now);
  const state = await roundState(env, body.playId);

  /* WITHOUT A DATABASE there is no clock and no round, so the guess is graded
     on a full clock and nothing is recorded. The game plays; only the score is
     lost. This is the fixture path — `wrangler pages dev` with no D1, and the
     offline suites — and it says `scored: false` rather than pretending. */
  if (!state) {
    const v = judge(q, guess, 0);
    return json({ idx, scored: false, ...v });
  }

  /* FULL TIME IS FULL TIME. Served as a verdict rather than an error: the page
     has something true to render, and a 403 would look like a fault. */
  if (state.over) {
    return json({ idx, over: true, ...state, answers: answersOf(board) });
  }
  if (idx !== state.answered + 1) return bad("That is not the question in play.");

  const row = await roundRow(env, body.playId);
  /* A QUESTION THAT WAS NEVER OPENED HAS NO CLOCK, and grading it would have to
     invent one. Inventing zero would make skipping /open the way to a full ten
     points every time; inventing twenty would punish a page that dropped one
     request. Refused instead, which is the only answer that is not a rule. */
  if (!row || Number(row.clock_idx) !== idx) {
    return bad("That question is not open.");
  }

  /* WHAT NARROWING COST, if it was bought after the substitutions ran out: four
     seconds of THIS question's clock, added to the elapsed time rather than
     taken off the clock's length. The two are not the same arithmetic — a
     shorter clock takes its grace down with it and would charge for the four
     seconds twice. See football/ballpark/js/rules.js. */
  const narrow = await narrowFor(env, body.playId, idx);
  const penaltyMs = narrow && !Number(narrow.spent_sub) ? RULES.NARROW_SECS * 1000 : 0;
  const elapsedMs = Math.max(0, now - Number(row.clock_ms)) + penaltyMs;

  const timedOut = elapsedMs > RULES.CLOCK * 1000 + WIRE_GRACE_MS;
  const v = timedOut ? judgeTimeout(q) : judge(q, guess, elapsedMs / 1000);

  await recordAnswer(env, body.playId, idx, {
    questionId: q.id,
    guess: timedOut ? null : guess,
    ballparks: v.ballparks, grade: v.grade, points: v.points, spentSub: v.spentSub,
  }, elapsedMs, now);

  const after = await roundState(env, body.playId);
  return json({
    idx,
    scored: true,
    timedOut,
    ...v,
    elapsedMs,
    ...(after ? {
      answered: after.answered, over: after.over, subsUsed: after.subsUsed,
      /* `greens` AND `green` ARE DIFFERENT FACTS AND MUST NOT SHARE A NAME.
         `green` is this guess's verdict, a boolean from the ladder; `greens` is
         how many of the board's answers have read as good so far, a count. They
         were both called `green`, and because the round's state is spread after
         the verdict, the count won: a way-out answer given after three good ones
         came back `green: 3`, and a page doing `!!r.green` would have drawn it
         as a good answer. Found on the first production round, not offline —
         the fixture path never gets far enough to have a count above zero. */
      greens: after.green, bangOns: after.bangOns, score: after.score,
      result: after.result,
      /* AT FULL TIME, AND ONLY AT FULL TIME, THE WHOLE BOARD'S ANSWERS. There
         is nothing left to give away — every question has been locked — and a
         player who has just finished should see what the rest of them were. Sent
         from here rather than from a second endpoint, because an endpoint that
         hands out answers is a second door to guard; this one can only open
         when the round the server has been counting says it is finished. */
      ...(after.over ? { answers: answersOf(board) } : {}),
    } : {}),
  });
}
