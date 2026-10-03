/* POST /api/lightning_fr/source — { runId, idx }  ->  the citation behind a question
 *
 * The owner, 2 Oct 2026: "Show any source, whatever it is and the part that is
 * referenced". So Lightning hands over every question's source -- publisher,
 * link and the quoted line -- with no allowlist (unlike functions/_lib/
 * sources.js publicSource(), which the football boards keep).
 *
 * ONLY FOR A QUESTION ALREADY ANSWERED IN THIS RUN. Its answer was shown the
 * moment the pick was marked, so the citation gives nothing away; a question
 * dealt but not reached keeps its source, as it keeps its answer.
 *
 * ON AN ACCOUNT, COUNTED, CAPPED: the family's rule ("i dont mind sharing
 * sources but i dont want it mass requested by a single user"), the same
 * fifty-a-day presses the crossword's [source] spends.
 */
import { hasDB } from "../../_lib/qfdata.js";
import { getRun } from "../../_lib/lr-play.js";
import { ok, no, readPost } from "../../_lib/lr-http.js";
import { currentUser } from "../../_lib/auth.js";
import { utcDay } from "../../_lib/daily.js";
import { takePress, SOURCE_PRESSES_A_DAY } from "../../_lib/sources.js";
import { isPreviewId } from "../../_lib/preview.js";

export async function onRequestPost({ request, env }) {
  if (!hasDB(env)) return no("unavailable", 503);
  const body = await readPost(request);
  if (!body) return no("missing request header", 403);
  const run = await getRun(env, body.runId);
  if (!run) return no("no run");
  const idx = Number(body.idx);
  if (!Number.isInteger(idx) || idx < 1) return no("no such question");
  const answered = await env.DB.prepare("SELECT question_id FROM fr_lr_answer WHERE run_id = ? AND idx = ?")
    .bind(run.run_id, idx).first();
  if (!answered) return no("that question was not answered", 403);

  let src = null;
  try {
    src = await env.DB.prepare("SELECT name, url, text FROM fr_lr_source WHERE id = ?")
      .bind(answered.question_id).first();
  } catch (e) { src = null; }
  /* Nothing to hand over is not a refusal, and spends no press. */
  if (!src) return ok({ source: null });

  /* ANSWERED FIRST, ACCOUNT SECOND, so "register" is never the answer to a
     question that was never reached. */
  const user = await currentUser(request, env);
  if (!user) return no("Sources are for registered players. Registering is free.", 401, { needsAccount: true });
  if (run.user_id && String(run.user_id) !== String(user.id)) return no("not your run", 403);

  /* AN ADMIN PREVIEW'S RUN SPENDS NO PRESS. source_press is the account's own
     count, and a preview records nothing (functions/_lib/preview.js). Only an
     admin's preview mints a pv- run, and its owner was checked just above. */
  const used = isPreviewId(run.run_id) ? 0 : await takePress(env, user.id, utcDay());
  if (used === null) {
    return no(`That is ${SOURCE_PRESSES_A_DAY} sources today. The count resets at midnight UTC.`, 429,
      { capped: true, limit: SOURCE_PRESSES_A_DAY });
  }
  const url = /^https?:\/\//i.test(String(src.url || "")) ? String(src.url) : null;
  return ok({ source: { name: src.name || "", url, text: src.text || "" }, used, limit: SOURCE_PRESSES_A_DAY });
}
