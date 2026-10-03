/* POST /api/lightning_fr/answer — { runId, idx, pick }. Marked here; the
 * verdict comes back with the next question. */
import { hasDB } from "../../_lib/qfdata.js";
import { getRun, answerRun } from "../../_lib/lr-play.js";
import { ok, no, readPost } from "../../_lib/lr-http.js";
import { clockFor } from "../../_lib/preview.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!hasDB(env)) return no("unavailable", 503);
  const body = await readPost(request);
  if (!body) return no("missing request header", 403);
  const run = await getRun(env, body.runId);
  if (!run) return no("no run");
  /* The request's time: a preview run is timed on the day it was started on. */
  const out = await answerRun(env, run, Number(body.idx), body.pick, (await clockFor(context)).now);
  if (out.error) return no(out.error, 400, out.over ? { over: true, msLeft: 0 } : null);
  return ok(out);
}
