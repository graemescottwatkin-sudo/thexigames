/* /football/archive/ — every football game's previous dailies, one page.
   The hub's "Browse previous dailies" link. See themeArchiveRoute in
   functions/_lib/archive-page.js; this file is the route and nothing else. */
import { themeArchiveRoute } from "../../_lib/archive-page.js";

export const onRequestGet = (ctx) => themeArchiveRoute(ctx, "football");
export const onRequestHead = onRequestGet;
