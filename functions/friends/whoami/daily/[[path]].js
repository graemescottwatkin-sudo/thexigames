/* GET /friends/whoami/daily and /friends/whoami/daily/<no>
   One URL, one board, forever. The number is the FAMILY board number, the same
   quantity every other game's permalink carries.

   THIS FILE EXISTS FROM DAY ONE, WHICH THE FRIENDS CROSSWORD'S DID NOT. That
   game was in PERMA_GAMES for a day with nothing serving these addresses —
   data claiming permanent addresses that 404'd — and it went unseen precisely
   because the game launched UNLISTED, so the sitemap advertised none of them
   and no crawler ever asked. An unlisted game is the one that most needs its
   routes written on the day it is registered, because nothing else will notice. */
import { permalinkRoute } from "../../../_lib/permalink.js";
export const onRequestGet = (ctx) => permalinkRoute(ctx, "whoami_fr");
export const onRequestHead = onRequestGet;
