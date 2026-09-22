/* POST /api/whoami/finish — what the sitting came to, for the FOOTBALL deck, at the address
 * it has always had.
 *
 * The rules moved to functions/_lib/wa-endpoints.js on 22 September 2026, when
 * the Who Am I API was namespaced by game so a second deck could have the same
 * server instead of a second copy of it. Nothing about what this address does
 * has changed, and nothing about it may: every live football client on every
 * device is calling it right now, and a deploy that moved it would break the
 * game for anybody who had not reloaded. It delegates, and it always will.
 *
 * The same rules are reachable at /api/whoami/whoami/finish. Two addresses, one
 * implementation — the same shape the crossword API took the same day.
 */
import { finishHandler } from "../../_lib/wa-endpoints.js";
import { LEGACY_GAME } from "../../_lib/wa-registry.js";

export const onRequestPost = (ctx) => finishHandler(ctx, LEGACY_GAME);
