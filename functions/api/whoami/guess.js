/* POST /api/whoami/guess — name him.
 *
 * THREE OUTCOMES, and the middle one is why this cannot be a string comparison
 * on the page: naming somebody who really did play for that club is a NEAR MISS
 * rather than a mistake. Deciding that on the client needs the club's full
 * roster, and a roster is a candidate list for the door.
 *
 * NO ANSWER IN A WRONG RESPONSE, on either branch. A near miss says it was a
 * near miss and stops there — saying who it actually was would end the game for
 * the price of a wrong guess, and the door stays live for everybody else that
 * day.
 */
import { hasDB, noStore } from "../../_lib/wadata.js";
import { getRound, judgeGuess } from "../../_lib/wa-play.js";

const NO = (msg = "no") => noStore({ error: msg }, 400);

export async function onRequestPost({ request, env }) {
  if (!hasDB(env)) return NO();
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  const round = await getRound(env, body.playId);
  if (!round) return NO("no round");

  const out = await judgeGuess(env, round, body.guess);
  if (out.error) return NO(out.error);
  return noStore(out);
}
