/* GET /api/whoami_fr/daily — the Friends deck's board, at its id-shaped
 * address.
 *
 * THE THIRD ADDRESS FOR ONE IMPLEMENTATION, and it exists for the same reason
 * /api/crossword_fr/daily does beside /api/crossword/crossword_fr/daily: a
 * game's id is the name everything else in this family files it under, so a
 * game in GAMES is expected to answer at /api/<id>/daily. tools/aligned_test
 * derives "does this game serve a daily" by reading that directory, which is a
 * structural check rather than a list somebody maintains — and a namespaced-only
 * game is invisible to it.
 *
 * shared/xi-played.js probes this one, because the played-today table is read
 * by every page in the family and asks each game the same question at the same
 * shape of address. The GAME'S OWN CLIENT calls /api/whoami/whoami_fr/* — the
 * namespaced form — and that is the one to add calls to.
 */
import { dailyHandler } from "../../_lib/wa-endpoints.js";

export const onRequestGet = (ctx) => dailyHandler(ctx, "whoami_fr");
export const onRequestHead = onRequestGet;
