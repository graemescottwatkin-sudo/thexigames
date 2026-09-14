/* POST /api/whoami/finish — what the sitting came to.
 *
 * Read from the rows this side wrote, never from anything the page reports.
 * Marking on the server and then accepting the result from the browser would be
 * the front door locked and the back door open.
 *
 * THE ANSWER IS INCLUDED ONLY ONCE THE DOOR IS CLOSED — solved, or given up.
 * Asking to "finish" a door still in play must not be a way to read it.
 */
import { hasDB, noStore } from "../../_lib/wadata.js";
import { getRound, finishRound } from "../../_lib/wa-play.js";

const NO = (msg = "no") => noStore({ error: msg }, 400);

export async function onRequestPost({ request, env }) {
  if (!hasDB(env)) return NO();
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  const round = await getRound(env, body.playId);
  if (!round) return NO("no round");

  return noStore(await finishRound(env, round));
}
