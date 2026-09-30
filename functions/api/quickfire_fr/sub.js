/* QuickFire XI: Friends — /api/quickfire_fr/sub. Football's handler, for the
   Friends set: its own fr_qf_ tables (functions/_lib/qf-sets.js). */
import { subFor } from "../quickfire/sub.js";
import { QF_SETS } from "../../_lib/qf-sets.js";

export const onRequestPost = subFor(QF_SETS.quickfire_fr);
