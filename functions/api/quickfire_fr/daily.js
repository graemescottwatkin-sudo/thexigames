/* QuickFire XI: Friends — /api/quickfire_fr/daily. Football's handler, for the
   Friends set: its own fr_qf_ tables (functions/_lib/qf-sets.js). */
import { dailyFor } from "../quickfire/daily.js";
import { QF_SETS } from "../../_lib/qf-sets.js";

export const onRequestGet = dailyFor(QF_SETS.quickfire_fr);
export const onRequestHead = onRequestGet;
