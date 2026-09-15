/* POST /api/whoami/giveup — leave the pitch.
 *
 * NOT A SUBSTITUTION, which is why it is not a rung of the ladder and not part
 * of /clue. There were three substitutions once and the third was this, taken
 * from the family's bench-of-three without asking what a third would buy; the
 * answer was nothing, because the spell, the career and the bio are everything
 * this game knows about a player that is not his name.
 *
 * IT ENDS THE BOARD AT NOTHING. That is an accounting rather than a penalty —
 * a board you were told the answer to scored nothing — and it is why giving up
 * carries no price: pricing it would make the reveal a cheap route to a number.
 */
import { hasDB, noStore } from "../../_lib/wadata.js";
import { getRound, giveUp } from "../../_lib/wa-play.js";

const NO = (msg = "no") => noStore({ error: msg }, 400);

export async function onRequestPost({ request, env }) {
  if (!hasDB(env)) return NO();
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  const round = await getRound(env, body.playId);
  if (!round) return NO("no round");

  const out = await giveUp(env, round);
  if (out.error) return NO(out.error);
  return noStore(out);
}
