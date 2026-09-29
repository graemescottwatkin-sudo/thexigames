/* /friends/vowels/daily/N — one board of Vowels XI: Friends: the same Friends
   ring as Scrambled's, read half a turn round, so the same number is a
   different board. */
import { permalinkRoute } from "../../../_lib/permalink.js";
export const onRequestGet = (ctx) => permalinkRoute(ctx, "vowels_fr");
export const onRequestHead = onRequestGet;
