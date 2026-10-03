/* Codeword XI — which slots are done, and what CHECK GRID costs.
 *
 * THE PAGE CANNOT DO THIS FOR ITSELF. publicBoard() sends the numbers, the
 * clues and three given letters and none of the filled grid, the answers or
 * the cipher — so marking, revealing and scoring happen here or not at all.
 *
 * FAIL CLOSED. If anything below refuses, nothing is marked, nothing is
 * revealed and NO MINUTES ARE CHARGED. Charging for a helper that did not help
 * is the fault only the player it happened to would ever see.
 */

import { json } from "../../_lib/puzzle.js";
import { hasDB, boardByNo } from "../../_lib/cw-board.js";
import { clockFor } from "../../_lib/preview.js";
import { getRound, markRound, checkRound } from "../../_lib/cw-play.js";

/* One refusal for every reason, saying nothing about which. */
const NO = (msg = "no") => new Response(JSON.stringify({ error: msg }), {
  status: 400,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  },
});

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!hasDB(env)) return NO();
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  const round = await getRound(env, body.playId);
  if (!round) return NO("no round");
  if (round.finished_ms) return NO("the whistle has gone");

  /* Bounded by the request's day: the real one, or an admin's preview day, so
     a preview round can be played as well as opened. */
  const board = await boardByNo(env, Number(round.board_no), (await clockFor(context)).day);
  if (!board) return NO("no board");

  /* CHECK GRID IS THE PAID QUESTION AND confirm IS NOT, which is the whole
     reason they share a route rather than being one call. confirm says which
     slots are completely filled and right — exactly what the page used to work
     out for itself when it held the answer, so it is no weaker than the game
     already was. "Which letter is wrong in a half-filled grid" is a different
     question, and it is the one worth five minutes. */
  if (body.check) return json(await checkRound(env, round, board, body.guess));
  return json(await markRound(env, round, board, body.guess));
}
