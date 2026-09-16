/* /football/ballpark/archive/ — every board this game has had, at its own
   address. See functions/_lib/archive-page.js, which holds the page for every
   game; this file is the route and nothing else, so ten games cannot grow ten
   archives.

   THIS ARCHIVE OPENS WITH TWENTY-ONE DAYS ALREADY IN IT, which is unusual and
   is the consequence of LAUNCHED being the day the game began serving rather
   than the day it took a shirt. Those boards ran; dating the launch later would
   have hidden them. */
import { archiveRoute } from "../../../_lib/archive-page.js";
export const onRequestGet = (ctx) => archiveRoute(ctx, "ballpark");
export const onRequestHead = onRequestGet;
