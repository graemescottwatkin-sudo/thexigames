/* POST /api/whoami/<game>/giveup — leave the pitch, for any deck.
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
import { giveupHandler } from "../../../_lib/wa-endpoints.js";

export const onRequestPost = (ctx) => giveupHandler(ctx, ctx.params.game);
