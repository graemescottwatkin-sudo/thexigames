/* POST /api/scrambled/round — { playId, token }
 *
 * Kick off, by this server's clock. One clock for the whole board, so unlike
 * HiLo there is nothing to restart and nothing further to be told: from here
 * the server serves every guess and every reveal, which is the rest of what a
 * score is made of.
 *
 * KICKING OFF TWICE KEEPS THE FIRST CLOCK. A reload, a double tap, a resumed
 * board — none of them hands the player a fresh ninety minutes.
 */
import { json, bad } from "../../_lib/sc-board.js";
import { csrfOk } from "../../_lib/auth.js";
import { startRound, hasDB } from "../../_lib/sc-round.js";
import { clockFor, isPreviewId } from "../../_lib/preview.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!csrfOk(request)) return bad("Refused.", 403);
  let body;
  try { body = await request.json(); } catch (e) { return bad("Expected a JSON body."); }
  const { playId, token } = body || {};
  if (!playId || !token) return bad("A round is a play and a board.");

  /* Nowhere to keep a clock, and that is not an error: the board plays and
     scores itself, as it did before any of this existed. */
  if (!hasDB(env)) return json({ verified: false });
  /* AN ADMIN PREVIEW'S ROUND IS SCRATCH (functions/_lib/preview.js). Its id
     comes from XIPlays and starts pv- there, so its rows are purged with the
     rest; an id without the mark is not written at all in a preview, so a
     preview can never add a row to a real attempt. */
  if ((await clockFor(context)).preview && !isPreviewId(playId)) return json({ verified: false });

  const at = await startRound(env, playId, token, Date.now());
  return json({ verified: at !== null });
}
