/* POST /api/grid/guess — { token, playId, n, guess }
 *
 * One submission, marked here. THE BROWSER HOLDS NO ANSWER, so this is not a
 * convenience or a policy — it is the only place the marking can happen. The
 * page sends which entry it typed into and what it typed, and gets back the
 * marks, whether that solved the entry, and the cells the guess newly proved.
 *
 * WHAT DOES NOT COME BACK, ever: the answer. Not on a wrong guess, obviously,
 * and not on a right one either — the page already has the letters it typed,
 * and a response that echoed the word would put an answer on the wire for the
 * ten entries still unsolved to be tested against.
 *
 * NOR DOES THE STATE COME FROM THE CLIENT. Turns, misses and which entries are
 * solved are read back out of this round's own rows every time — see
 * functions/_lib/gd-round.js — so a page cannot claim a turn it did not have,
 * and cannot un-spend one by replaying a guess. A page that sent its own count
 * is a page that decides its own score, which is the fault the word search had
 * to be rebuilt to remove.
 */
import { json, bad } from "../../_lib/puzzle.js";
import { csrfOk } from "../../_lib/auth.js";
import {
  loadBank, boardById, boardToken, entryOf, judge, dayOf, answersOf,
} from "../../_lib/gd-board.js";
import {
  startRound, recordGuess, roundState, confirmedCells,
} from "../../_lib/gd-round.js";

/* The token names the board: "gd:gx-0169". Parsed here rather than trusted as
   an id, so a body cannot ask for a row by name. */
function boardForToken(bank, token) {
  const s = String(token || "");
  if (s.slice(0, 3) !== "gd:") return null;
  return boardById(bank, s.slice(3));
}

export async function onRequestPost({ request, env }) {
  if (!csrfOk(request)) return bad("Refused.", 403);
  let body;
  try { body = await request.json(); } catch (e) { return bad("Expected a JSON body."); }

  const bank = await loadBank(env);
  const board = boardForToken(bank, body.token);
  if (!board) return bad("No such board.", 404);
  const entry = entryOf(board, body.n);
  if (!entry) return bad("No such entry.");

  const now = Date.now();
  /* Kick off is idempotent and happens on the first guess rather than on a
     separate call: a round that has to be opened explicitly is a round a page
     can forget to open, and then the first guess is unscored with nothing to
     say so. */
  await startRound(env, body.playId, board.id, dayOf(bank, board.id) || "", now);

  /* THE ROUND'S STATE BEFORE THIS GUESS, from its rows. */
  const before = await roundState(env, body.playId);

  /* FULL TIME IS FULL TIME. A board whose turns are gone, or which is already
     solved, cannot be guessed into — and the check is here, against the
     server's own count, rather than in the page that would like to keep
     playing. Served as a verdict rather than an error: the page has something
     true to render, and a 403 would look like a fault. */
  if (before && before.over) {
    return json({ over: true, ...before, marks: null, correct: false, confirms: [],
                  answers: answersOf(board) });
  }
  if (before && before.solvedEntries.includes(Number(entry.n))) {
    return bad("That entry is already solved.");
  }

  const known = await confirmedCells(env, body.playId, board);
  const verdict = judge(board, entry.n, body.guess, known);
  if (verdict.error) return bad(verdict.error);

  /* JUDGED HERE, SO RECORDED HERE, and deliberately unable to change the
     verdict. With no database, no play id or no round, this answers null and
     the guess is served exactly as it would have been — the game does not
     depend on being scored. */
  await recordGuess(env, body.playId, entry.n, String(body.guess || "").toUpperCase()
    .replace(/[^A-Z]/g, ""), verdict.correct, now);

  const after = await roundState(env, body.playId);
  return json({
    n: verdict.n,
    marks: verdict.marks,
    correct: verdict.correct,
    /* Only greens travel; amber and grey are claims about this answer alone.
       The letters here are always letters the player just typed, at positions
       the server confirmed — so nothing arrives that was not already on their
       screen. */
    confirms: verdict.confirms,
    ...(after ? {
      turns: after.turns, misses: after.misses, over: after.over,
      solved: after.solved, solvedEntries: after.solvedEntries,
      score: after.score,
      /* AT FULL TIME, AND ONLY AT FULL TIME, THE ANSWERS. The board is over —
         solved out or out of turns — so there is nothing left to give away and
         a player who failed should see what it was. Sent from here rather than
         fetched separately, because a second endpoint that hands out answers is
         a second door to guard; this one can only open when the round the
         server has been counting says it is finished.

         A player CAN reach it by spending fifteen turns deliberately. That is
         the same bargain every game in the family makes at full time, and what
         they get is the board they have just lost. */
      ...(after.over ? { answers: answersOf(board) } : {}),
    } : { scored: false }),
  });
}
