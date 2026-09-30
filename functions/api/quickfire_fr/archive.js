/* QuickFire XI: Friends — /api/quickfire_fr/archive. Football's handler, for the
   Friends set: its own fr_qf_ tables (functions/_lib/qf-sets.js). */
import { archiveFor } from "../quickfire/archive.js";
import { QF_SETS } from "../../_lib/qf-sets.js";

export const onRequestGet = archiveFor(QF_SETS.quickfire_fr);
export const onRequestHead = onRequestGet;
