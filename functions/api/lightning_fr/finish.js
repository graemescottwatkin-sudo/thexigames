/* POST /api/lightning_fr/finish — { runId }. The score is counted here from
 * the run's own rows; the page's running total is only ever a display. */
import { hasDB } from "../../_lib/qfdata.js";
import { getRun, finishRun } from "../../_lib/lr-play.js";
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
  const out = await finishRun(env, run, (await clockFor(context)).now);
  if (out.error) return no(out.error, 409, { msLeft: out.msLeft });
  return ok(out);
}
