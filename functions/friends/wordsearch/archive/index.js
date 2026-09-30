/* /friends/wordsearch/archive/ — every board that has been a daily. The page is
   functions/_lib/archive-page.js, which holds it for every game; this file is
   the route and nothing else. */
import { archiveRoute } from "../../../_lib/archive-page.js";
export const onRequestGet = (ctx) => archiveRoute(ctx, "wordsearch_fr");
export const onRequestHead = onRequestGet;
