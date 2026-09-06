/* /football/scrambled/archive/ — every board this game has, at its own address.
   See functions/_lib/archive-page.js, which holds the page for every game;
   this file is the route and nothing else, so five games cannot grow five
   archives. */
import { archiveRoute } from "../../../_lib/archive-page.js";

export const onRequestGet = (ctx) => archiveRoute(ctx, "scrambled");
export const onRequestHead = onRequestGet;
