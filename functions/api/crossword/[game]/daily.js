/* GET /api/crossword/<game>/daily — today's board, for any crossword.
 *
 * The namespaced address, added 22 September 2026. <game> is the GAME ID and
 * not its directory: the Friends crossword is `crossword_fr` and lives at
 * /friends/crossword/, and this repository has a rule about those being two
 * facts. So the id is what goes here.
 *
 * AN UNKNOWN GAME IS REFUSED BY THE HANDLER, never defaulted to football's.
 * A typo in this path resolving to the football crossword would serve one
 * game's board under another game's address, which is the quietest failure
 * this endpoint could have.
 */
import { dailyHandler } from "../../../_lib/cw-daily.js";

export const onRequestGet = (ctx) => dailyHandler(ctx, ctx.params.game);
