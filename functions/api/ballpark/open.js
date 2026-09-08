/* POST /api/ballpark/open — { token, playId, idx }
 *
 * "I am showing question four now, start its clock."
 *
 * WHY THE PAGE HAS TO SAY SO. A question is worth ten points for the first ten
 * seconds and then a point a second less, so the score turns on WHEN the
 * question appeared — and that is a moment only the page knows, because the
 * player reads the verdict on the last one for as long as they like before
 * pressing Next. Timing from the previous answer would charge them for reading;
 * timing from the request that fetched the board would charge them for all
 * eleven at once.
 *
 * WHY IT CANNOT BE ABUSED. The clock only ever moves FORWARD, in
 * openQuestion(): the UPDATE carries `WHERE clock_idx < ?`, so opening the
 * question that is already open changes nothing. A page cannot refresh its way
 * to a fresh twenty seconds, and a retried request is a no-op rather than a
 * gift. Going BACK to an earlier question is refused for the same reason.
 *
 * WITHOUT A DATABASE this does nothing and says so, and the game still plays:
 * the verdict is served either way and only the score is lost, which is what
 * every game in this family does.
 */
import { json, bad } from "../../_lib/puzzle.js";
import { csrfOk } from "../../_lib/auth.js";
import {
  loadBank, boardById, playable, questionAt, dayOf, RULES,
} from "../../_lib/bp-board.js";
import { startRound, openQuestion, roundRow, roundState } from "../../_lib/bp-round.js";

function boardForToken(bank, token) {
  const s = String(token || "");
  if (s.slice(0, 3) !== "bp:") return null;
  return boardById(bank, s.slice(3));
}

export async function onRequestPost({ request, env }) {
  if (!csrfOk(request)) return bad("Refused.", 403);
  const now = Date.now();
  let body;
  try { body = await request.json(); } catch (e) { return bad("Expected a JSON body."); }

  const bank = await loadBank(env);
  const board = boardForToken(bank, body.token);
  if (!board) return bad("No such board.", 404);
  /* THE FUTURE IS SHUT AT EVERY DOOR, not only at the one that serves the
     board. Grid XI learned this hours after it launched: its daily route
     refused a board whose day had not come and the endpoint beside it judged
     anything in the bank. Refused with the words a missing board gets, so a
     probe cannot tell "not yet" from "no such thing". */
  if (!playable(bank, board, now)) return bad("No such board.", 404);

  const idx = Number(body.idx);
  const q = questionAt(board, idx);
  if (!q) return bad("No such question.");

  await startRound(env, body.playId, board.id, dayOf(bank, board.id) || "", now);

  const state = await roundState(env, body.playId);
  if (!state) return json({ idx, scored: false });
  if (state.over) return json({ idx, over: true, ...state });
  /* IN ORDER, ONE AT A TIME. The next question is the one after the last locked
     answer — not whichever the page names. Opening question eleven first would
     start its clock while ten sit unanswered, and then every one of them could
     be answered later against a clock that had already run. */
  if (idx !== state.answered + 1) {
    return bad("That is not the question in play.");
  }

  await openQuestion(env, body.playId, idx, now);
  const row = await roundRow(env, body.playId);
  return json({
    idx,
    scored: true,
    /* What the page needs to draw the countdown, from the server's clock rather
       than its own: when this question opened, and how long it gets. The page
       counts down for display; the points are decided here. */
    clockMs: row ? Number(row.clock_ms) : now,
    now,
    clock: RULES.CLOCK,
    ...state,
  });
}
