/* friends/vowels/journey_test.mjs — Vowels XI: Friends, one board from kick
 * off to Full Time in jsdom, through the real handlers: the same Friends ring
 * read half a turn round, the vowels blanked. The journey is
 * friends/scrambled/journey.mjs, shared with Scrambled XI: Friends.
 *
 *   node friends/vowels/journey_test.mjs      (from the repo root, jsdom installed)
 */
import { journey } from "../scrambled/journey.mjs";
console.log("Vowels XI: Friends — the journey");
const failed = await journey({ dir: "friends/vowels", id: "vowels_fr", prefix: "xifv.", cypher: "consonants" });
process.exit(failed ? 1 : 0);
