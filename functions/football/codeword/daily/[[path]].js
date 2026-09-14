/* GET /football/codeword/daily and /football/codeword/daily/<no>
   One URL, one puzzle, forever. The number is the FAMILY board number counted
   from 26 August 2026, the same as every other game — Codeword's own 1..365
   is internal and is never an address. */
import { permalinkRoute } from "../../../_lib/permalink.js";
export const onRequestGet = (ctx) => permalinkRoute(ctx, "codeword");
export const onRequestHead = onRequestGet;
