/* /friends/vowels/archive/ — the index is functions/_lib/archive-page.js,
   which holds it for every game; this file is the route and nothing else. */
import { archiveRoute } from "../../../_lib/archive-page.js";
export const onRequestGet = (ctx) => archiveRoute(ctx, "vowels_fr");
export const onRequestHead = onRequestGet;
