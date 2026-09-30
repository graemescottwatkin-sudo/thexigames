/* /friends/wordsearch/daily/<no> — a Wordsearch XI: Friends board's own
   address. The number is the FAMILY board number; the board behind it is the
   one fr_ws_schedule gave that day. Written on the day the game is registered,
   as Who Am I's lesson asks. */
import { permalinkRoute } from "../../../_lib/permalink.js";
export const onRequestGet = (ctx) => permalinkRoute(ctx, "wordsearch_fr");
export const onRequestHead = onRequestGet;
