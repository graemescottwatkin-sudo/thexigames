/* GET /football/whoami/daily and /football/whoami/daily/<no>
   One URL, one board, forever. The number is the FAMILY board number counted
   from 26 August 2026, the same as every other game — Who Am I's boards are
   keyed on play_date and the day is what the number resolves to. */
import { permalinkRoute } from "../../../_lib/permalink.js";
export const onRequestGet = (ctx) => permalinkRoute(ctx, "whoami");
export const onRequestHead = onRequestGet;
