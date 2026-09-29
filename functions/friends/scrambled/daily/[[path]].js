/* /friends/scrambled/daily/N — one board of Scrambled XI: Friends by its
   family number. The number is the FAMILY board number; the board behind it
   is the Friends ring counted from the game's launch day. */
import { permalinkRoute } from "../../../_lib/permalink.js";
export const onRequestGet = (ctx) => permalinkRoute(ctx, "scrambled_fr");
export const onRequestHead = onRequestGet;
