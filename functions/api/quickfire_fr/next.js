/* QuickFire XI: Friends — /api/quickfire_fr/next. Football's handler, for the
   Friends set: its own fr_qf_ tables (functions/_lib/qf-sets.js). */
import { nextFor } from "../quickfire/next.js";
import { QF_SETS } from "../../_lib/qf-sets.js";

export const onRequestPost = nextFor(QF_SETS.quickfire_fr);
