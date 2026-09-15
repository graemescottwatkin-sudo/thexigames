/* /football/whoami/archive/ — every board this game has had, at its own
   address. See functions/_lib/archive-page.js, which holds the page for every
   game; this file is the route and nothing else, so nine games cannot grow
   nine archives. */
import { archiveRoute } from "../../../_lib/archive-page.js";
export const onRequestGet = (ctx) => archiveRoute(ctx, "whoami");
export const onRequestHead = onRequestGet;
