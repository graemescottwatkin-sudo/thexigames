/* /football/grid/archive/ — every board this game has, at its own address.
   See functions/_lib/archive-page.js, which holds the page for every game;
   this file is the route and nothing else. */
import { archiveRoute } from "../../../_lib/archive-page.js";

export const onRequestGet = (ctx) => archiveRoute(ctx, "grid");
export const onRequestHead = onRequestGet;
