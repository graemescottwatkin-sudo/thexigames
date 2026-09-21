/* POST /api/crossword/<game>/verify — the namespaced address, 22 Sep 2026.
 *
 * <game> is the GAME ID, not its directory: the Friends crossword is
 * `crossword_fr` and lives at /friends/crossword/, and this repository has a
 * rule about those being two facts.
 *
 * The rules live in functions/api/verify.js, where they always have. Only the
 * signature changed, so the diff that made this possible is a handful of lines
 * in each handler rather than a file appearing somewhere new. An unknown game
 * is refused there, never defaulted to football's.
 */
import { verifyHandler } from "../../verify.js";

export const onRequestPost = (ctx) => verifyHandler(ctx, ctx.params.game);
