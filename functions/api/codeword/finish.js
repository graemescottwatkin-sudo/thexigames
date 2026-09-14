/* Codeword XI — the whistle. The SERVER says what the match was worth.
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
import { hasDB } from "../../_lib/cw-board.js";
import { getRound, finishRound } from "../../_lib/cw-play.js";

/* One refusal for every reason, saying nothing about which. */
const NO = (msg = "no") => new Response(JSON.stringify({ error: msg }), {
  status: 400,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  },
});

export async function onRequestPost({ request, env }) {
  if (!hasDB(env)) return NO();
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  const round = await getRound(env, body.playId);
  if (!round) return NO("no round");

  /* THE SCORE IS COMPUTED HERE, NOT POSTED. Choosing server-side checking to
     stop a forged score and then letting the page post the score would be the
     front door locked and the back door open — which is what this endpoint
     exists to close, and it was the producing side that noticed it was open. */
  return json(await finishRound(env, round));
}
