/* functions/friends/archive/index.js -- /friends/archive/

   The Friends hub's "Browse previous dailies" link, from 27 Sep 2026 when the
   Friends games went public. See themeArchiveRoute in
   functions/_lib/archive-page.js; this file is the route and nothing else, as
   functions/football/archive/index.js is for football. */
import { themeArchiveRoute } from "../../_lib/archive-page.js";

export const onRequestGet = (ctx) => themeArchiveRoute(ctx, "friends");
export const onRequestHead = onRequestGet;
