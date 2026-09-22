/* GET /api/whoami/names — every name a player may type, for the FOOTBALL deck, at the address
 * it has always had.
 *
 * The rules moved to functions/_lib/wa-endpoints.js on 22 September 2026, when
 * the Who Am I API was namespaced by game so a second deck could have the same
 * server instead of a second copy of it. Nothing about what this address does
 * has changed, and nothing about it may: every live football client on every
 * device is calling it right now, and a deploy that moved it would break the
 * game for anybody who had not reloaded. It delegates, and it always will.
 *
 * The same rules are reachable at /api/whoami/whoami/names. Two addresses, one
 * implementation — the same shape the crossword API took the same day.
 */
import { namesHandler } from "../../_lib/wa-endpoints.js";
import { LEGACY_GAME } from "../../_lib/wa-registry.js";

export const onRequestGet = (ctx) => namesHandler(ctx, LEGACY_GAME);

/* HEAD IS THE SAME QUESTION WITH THE BODY THROWN AWAY, and it is asserted in
   production by the live_check. Built from the GET rather than answered
   separately, so the two cannot come to disagree about a status. */
export const onRequestHead = onRequestGet;
