/* GET /football/ballpark/daily and /football/ballpark/daily/<no>
   One URL, one board, forever. The number is the FAMILY board number counted
   from 26 August 2026, the same as every other game — and for this game alone
   the family's day one IS its own day one, because it began serving on the
   family's epoch. */
import { permalinkRoute } from "../../../_lib/permalink.js";
export const onRequestGet = (ctx) => permalinkRoute(ctx, "ballpark");
export const onRequestHead = onRequestGet;
