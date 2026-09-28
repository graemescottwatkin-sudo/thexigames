/* /friends/lightning/daily/<no> — a Lightning Round board's own address.
   One URL, one board: the number is the FAMILY board number, and the run
   behind it is dealt from that day's date, the same run everybody got. Written
   on the day the game is registered, as Who Am I's lesson asks. */
import { permalinkRoute } from "../../../_lib/permalink.js";
export const onRequestGet = (ctx) => permalinkRoute(ctx, "lightning_fr");
export const onRequestHead = onRequestGet;
