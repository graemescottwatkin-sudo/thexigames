/* QuickFire XI: Friends — /api/quickfire_fr/play. Football's handler, for the
   Friends set: its own fr_qf_ tables (functions/_lib/qf-sets.js). */
import { playFor } from "../quickfire/play.js";
import { QF_SETS } from "../../_lib/qf-sets.js";

export const onRequestPost = playFor(QF_SETS.quickfire_fr);
