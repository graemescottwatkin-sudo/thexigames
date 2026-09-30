/* QuickFire XI: Friends — /api/quickfire_fr/finish. Football's handler, for the
   Friends set: its own fr_qf_ tables (functions/_lib/qf-sets.js). */
import { finishFor } from "../quickfire/finish.js";
import { QF_SETS } from "../../_lib/qf-sets.js";

export const onRequestPost = finishFor(QF_SETS.quickfire_fr);
