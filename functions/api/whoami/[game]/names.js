/* GET /api/whoami/<game>/names — every name a player may type, for any deck.
 *
 * The namespaced address, added 22 September 2026. <game> is the GAME ID and
 * not its directory: the Friends deck is `whoami_fr` and lives at
 * /friends/whoami/, and this repository has a rule about those being two facts.
 * So the id is what goes here.
 *
 * AN UNKNOWN GAME IS REFUSED BY THE HANDLER, never defaulted to football's. A
 * typo in this path resolving to the football deck would serve one game's doors
 * under another game's address, which is the quietest failure this endpoint
 * could have — every response would be well-formed.
 */
import { namesHandler } from "../../../_lib/wa-endpoints.js";

export const onRequestGet = (ctx) => namesHandler(ctx, ctx.params.game);

/* HEAD IS THE SAME QUESTION WITH THE BODY THROWN AWAY, and it is asserted in
   production by the live_check. Built from the GET rather than answered
   separately, so the two cannot come to disagree about a status. */
export const onRequestHead = onRequestGet;
