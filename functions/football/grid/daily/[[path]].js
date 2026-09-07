/* /football/grid/daily and /football/grid/daily/<key> — see functions/_lib/permalink.js,
   which holds the URL shape, the key rules and the page for every game. This
   file is the route and nothing else, so six games cannot grow six schemes. */
import { permalinkRoute } from "../../../_lib/permalink.js";

export const onRequestGet = (ctx) => permalinkRoute(ctx, "grid");
export const onRequestHead = onRequestGet;
