/* POST /api/lightning_fr/start — deal a run and start its clock.
 *
 *   { mode: "daily", no? }               a day's run, the same for everyone;
 *                                        today's unless a board number is named
 *   { mode: "practice", recent: [ids] }  a fresh run, avoiding what was seen
 *   { runId }                            where an unfinished run is (a reload)
 *
 * The day is this server's: a date sent up is not read. */
import { hasDB } from "../../_lib/qfdata.js";
import { currentUser } from "../../_lib/auth.js";
import { limited } from "../../_lib/limit.js";
import { getRun, startRun, resumeRun } from "../../_lib/lr-play.js";
import CONFIG from "../../../friends/lightning/js/config.js";
import { ok, no, readPost } from "../../_lib/lr-http.js";
import { clockFor } from "../../_lib/preview.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!hasDB(env)) return no("unavailable", 503);
  const body = await readPost(request);
  if (!body) return no("missing request header", 403);
  /* The request's time, and whether this run is an admin's scratch one
     (functions/_lib/preview.js). Every run endpoint reads the same clock, so a
     preview run's time is measured on the day it was started on. */
  const clock = await clockFor(context);

  if (body.runId) {
    const run = await getRun(env, body.runId);
    if (!run) return no("no run");
    return ok(await resumeRun(env, run, clock.now));
  }

  const mode = body.mode === "practice" ? "practice" : body.mode === "daily" ? "daily" : null;
  if (!mode) return no("no such mode");

  /* EVERY WRONG PICK NAMES ITS ANSWER, so unlimited runs are a way to read
     the bank out. Capped per caller; the limiter fails open. */
  if (await limited(env, request, "lr_" + mode, CONFIG.PRACTICE_STARTS_PER_HOUR, 3600)) {
    return no("Too many runs. Give it a few minutes.", 429);
  }

  let user = null;
  try { user = await currentUser(request, env); } catch (e) { user = null; }
  const out = await startRun(env, { mode, no: body.no, userId: user ? user.id : null, recent: body.recent,
                                   now: clock.now, preview: clock.preview });
  if (out.error) return no(out.error, out.error === "no questions" ? 503 : out.error === "no such board" ? 404 : 400);
  return ok(out);
}
