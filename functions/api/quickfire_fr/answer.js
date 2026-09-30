/* QuickFire XI: Friends — /api/quickfire_fr/answer. Football's handler, for the
   Friends set: its own fr_qf_ tables (functions/_lib/qf-sets.js). */
import { answerFor } from "../quickfire/answer.js";
import { QF_SETS } from "../../_lib/qf-sets.js";

export const onRequestPost = answerFor(QF_SETS.quickfire_fr);
