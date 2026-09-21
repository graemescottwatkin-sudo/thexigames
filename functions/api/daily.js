/* GET /api/daily — the FOOTBALL crossword's board, at the address it has
 * always had.
 *
 * The rules moved to functions/_lib/cw-daily.js on 22 September 2026, when the
 * crossword API was namespaced by game so a second crossword could have the
 * same server instead of a second copy of it. Nothing about what this address
 * does has changed, and nothing about it may: every live football client on
 * every device is calling it right now, and a deploy that moved it would break
 * the game for anybody who had not reloaded. It delegates, and it always will.
 *
 * The same rules are reachable at /api/crossword/crossword/daily. Two
 * addresses, one implementation — the same shape as the hub serving at both /
 * and /football/.
 */
import { dailyHandler } from "../_lib/cw-daily.js";
import { LEGACY_GAME } from "../_lib/cw-registry.js";

export const onRequestGet = (ctx) => dailyHandler(ctx, LEGACY_GAME);
