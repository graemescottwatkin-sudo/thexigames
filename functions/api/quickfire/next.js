/* POST /api/quickfire/next — serve a question, which is the act that starts
 * its clock.
 *
 * WHY THIS IS A ROUTE AND NOT SOMETHING THE PAGE DECIDES. QuickFire scores by
 * the minute, per question, from 100 inside 9' down to 36 at 89'. If the page
 * said when a question started, the page would be choosing its own score — and
 * it would not even need to lie, only to reload. The stamp is taken here, once,
 * and serveQuestion() refuses to take a second one.
 *
 * IT RETURNS NO QUESTION. The clues and the options came down with
 * /api/quickfire/daily, which is fine — they are what is printed on the page.
 * What this hands back is the clock: when the question was served and what
 * minute it is now, so a reloaded page can pick the clock up where it was
 * rather than at nought.
 */
import { hasDB } from "../../_lib/qfdata.js";
import { getRound, serveQuestion } from "../../_lib/qf-play.js";
import { PER_DAILY } from "../../_lib/qf-round.js";

const NO = (msg = "no", extra) => new Response(JSON.stringify({ error: msg, ...(extra || {}) }), {
  status: 400,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  },
});

export async function onRequestPost({ request, env }) {
  if (!hasDB(env)) return NO();

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  const round = await getRound(env, body.playId);
  if (!round) return NO("no round");

  const idx = Number(body.idx);
  if (!Number.isInteger(idx) || idx < 1 || idx > PER_DAILY) return NO("no such question");

  const out = await serveQuestion(env, round, idx);
  /* `at` travels with a refusal to rewind, so the page can resume where the
     round actually is. See serveQuestion. */
  if (out.error) return NO(out.error, out.at ? { at: out.at } : null);

  return new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
