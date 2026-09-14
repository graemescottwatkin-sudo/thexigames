/* GET /football/quickfire/daily and /football/quickfire/daily/<no>
   One URL, one puzzle, forever. The number is the FAMILY board number counted
   from 26 August 2026, the same as every other game — QuickFire's boards are
   keyed on play_date and the day is what the number resolves to. */
import { permalinkRoute } from "../../../_lib/permalink.js";
export const onRequestGet = (ctx) => permalinkRoute(ctx, "quickfire");
export const onRequestHead = onRequestGet;
