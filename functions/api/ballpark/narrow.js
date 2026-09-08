/* POST /api/ballpark/narrow — { token, playId, idx }
 *
 * Halve the slider around the answer. One substitution while any remain; four
 * seconds of this question's clock once they are gone.
 *
 * THE WINDOW IS PLACED HERE BECAUSE THE ANSWER IS HERE, and it is placed OFF
 * CENTRE on purpose: a window centred on the answer would be the answer. See
 * narrowWindow() in functions/_lib/bp-board.js.
 *
 * ONCE PER QUESTION, AND THE SAME WINDOW EVERY TIME IT IS ASKED FOR. The demo
 * picks the offset at random, which a server may not: a retried request would
 * deal a second window, and two windows placed around one answer intersect on a
 * range far smaller than either — so asking twice would be worth more than
 * asking once, and a dropped connection would be worth points. The row is
 * written INSERT OR IGNORE on (play_id, idx) and read back before anything is
 * computed, so the first window is the only window.
 */
import { json, bad } from "../../_lib/puzzle.js";
import { csrfOk } from "../../_lib/auth.js";
import {
  loadBank, boardById, playable, questionAt, dayOf, narrowWindow, RULES,
} from "../../_lib/bp-board.js";
import {
  startRound, roundRow, roundState, recordNarrow, narrowFor,
} from "../../_lib/bp-round.js";

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
  if (!playable(bank, board, now)) return bad("No such board.", 404);

  const idx = Number(body.idx);
  const q = questionAt(board, idx);
  if (!q) return bad("No such question.");

  await startRound(env, body.playId, board.id, dayOf(bank, board.id) || "", now);
  const state = await roundState(env, body.playId);

  /* NO DATABASE, NO ROUND. The window is still dealt so the fixture path plays,
     seeded by the question alone, and nothing is charged for it. */
  if (!state) {
    return json({ idx, scored: false, ...narrowWindow(q, String(q.id)),
                  cost: { sub: 0, seconds: 0 } });
  }
  if (state.over) return json({ idx, over: true, ...state });
  if (idx !== state.answered + 1) return bad("That is not the question in play.");

  const row = await roundRow(env, body.playId);
  /* Narrowing a question that is not open would buy a window before its clock
     started — the range for free. The same rule the answer route keeps. */
  if (!row || Number(row.clock_idx) !== idx) return bad("That question is not open.");

  /* ALREADY BOUGHT: the stored window, and charged nothing a second time.
     `cost` is what THIS request charged, which is nothing — what it cost when
     it was first bought is `spentSub`, so a page can still say so without the
     two meanings sharing one field. */
  const had = await narrowFor(env, body.playId, idx);
  if (had) {
    return json({
      idx, scored: true, again: true,
      lo: Number(had.lo), hi: Number(had.hi),
      cost: { sub: 0, seconds: 0 },
      spentSub: !!Number(had.spent_sub),
      subsUsed: state.subsUsed,
    });
  }

  /* WHAT IT COSTS is one rule in one place — a substitution while there are
     any, four seconds of this question's clock once there are not. rules.js
     owns it so the page can print the price before the player presses. */
  const cost = RULES.narrowCost(state.subsUsed);
  /* Seeded by the round AND the question, so one question in one round has one
     window however many times it is asked for, and two players on the same
     board are not handed the same one. */
  const win = narrowWindow(q, String(body.playId) + ":" + String(q.id));
  await recordNarrow(env, body.playId, idx, cost.sub, win.lo, win.hi, now);

  const after = await roundState(env, body.playId);
  return json({
    idx, scored: true,
    lo: win.lo, hi: win.hi,
    cost,
    subsUsed: after ? after.subsUsed : state.subsUsed + (cost.sub ? 1 : 0),
    subs: RULES.SUBS,
  });
}
