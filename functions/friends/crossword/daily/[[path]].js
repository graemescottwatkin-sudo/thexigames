/* GET /friends/crossword/daily and /friends/crossword/daily/<no>
   One URL, one puzzle, forever. The number is the FAMILY board number, the same
   quantity every other game's permalink carries — the bank's own 1..120 is
   internal and is never an address; functions/_lib/fr-board.js converts.

   THIS FILE DID NOT EXIST WHEN THE GAME LAUNCHED, and crossword_fr was in
   PERMA_GAMES regardless — which is the data claiming permanent addresses that
   nothing served. It went unseen because the game launched UNLISTED, so the
   sitemap advertised none of them and no crawler ever asked; the first thing to
   notice was tools/archive_test.mjs, reaching this game for the first time
   because being in PERMA_GAMES is what puts it in that suite's loop. */
import { permalinkRoute } from "../../../_lib/permalink.js";
export const onRequestGet = (ctx) => permalinkRoute(ctx, "crossword_fr");
export const onRequestHead = onRequestGet;
