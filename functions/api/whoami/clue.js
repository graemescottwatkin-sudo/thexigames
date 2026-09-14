/* POST /api/whoami/clue — buy the next rung of the ladder.
 *
 * THE LADDER IS CONFIG, not a switch in here: football/whoami/js/config.js says
 * what each stage costs and what it is allowed to reveal, and wa-play.js reads
 * it. The owner is play-testing what a substitution should buy, and a ladder
 * baked into this route would make every answer to that a code change.
 *
 * A STAGE ALREADY PAID FOR IS SERVED AGAIN FOR NOTHING. A reload must not be a
 * second purchase — the shape of fault Codeword found in its own demo, where a
 * clock could be rewound for free.
 */
import { hasDB, noStore } from "../../_lib/wadata.js";
import { getRound, buyClue } from "../../_lib/wa-play.js";

const NO = (msg = "no") => noStore({ error: msg }, 400);

export async function onRequestPost({ request, env }) {
  if (!hasDB(env)) return NO();
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  const round = await getRound(env, body.playId);
  if (!round) return NO("no round");

  const out = await buyClue(env, round, Number(body.stage));
  if (out.error) return NO(out.error);
  return noStore(out);
}
