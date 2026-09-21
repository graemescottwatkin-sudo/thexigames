/* /friends/crossword/archive/ — every board this game has had, at its own
   address. See functions/_lib/archive-page.js, which holds the page for every
   game; this file is the route and nothing else, so eleven games cannot grow
   eleven archives.

   IT IS NOINDEXED WHILE THE GAME IS UNLISTED, and that is decided in the page
   rather than here: an archive is a list of every board the game has run, so
   for a game nobody is meant to find it is the most complete disclosure on the
   site. The route is the same either way. */
import { archiveRoute } from "../../../_lib/archive-page.js";
export const onRequestGet = (ctx) => archiveRoute(ctx, "crossword_fr");
export const onRequestHead = onRequestGet;
