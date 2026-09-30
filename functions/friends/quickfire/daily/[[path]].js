/* /friends/quickfire/daily/N — one board of QuickFire XI: Friends by its
   family number: the day it was the Friends daily (fr_qf_daily). */
import { permalinkRoute } from "../../../_lib/permalink.js";
export const onRequestGet = (ctx) => permalinkRoute(ctx, "quickfire_fr");
export const onRequestHead = onRequestGet;
