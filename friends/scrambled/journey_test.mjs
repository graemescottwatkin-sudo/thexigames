/* friends/scrambled/journey_test.mjs — Scrambled XI: Friends, one board from
 * kick off to Full Time in jsdom, through the real handlers. The journey is
 * friends/scrambled/journey.mjs, shared with Vowels XI: Friends.
 *
 *   node friends/scrambled/journey_test.mjs      (from the repo root, jsdom installed)
 */
import { journey } from "./journey.mjs";
console.log("Scrambled XI: Friends — the journey");
const failed = await journey({ dir: "friends/scrambled", id: "scrambled_fr", prefix: "xifs.", cypher: null });
process.exit(failed ? 1 : 0);
