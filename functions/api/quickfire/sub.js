/* POST /api/quickfire/sub — spend a substitution.
 *
 * Passing swaps the question for one off the bench and charges twenty points.
 * The count is kept HERE because the penalty is subtracted from the final score
 * on this side: a page that reported its own substitutions would be choosing
 * how much its own mistakes cost, which is the same hole as reporting its own
 * clock, one layer along.
 *
 * spendSub() existed in qf-play.js for most of a day with nothing calling it —
 * exported, tested, and unreachable. That is the quiet version of a missing
 * feature: everything reads as present until a player presses the button.
 */
import { hasDB } from "../../_lib/qfdata.js";
import { getRound, spendSub } from "../../_lib/qf-play.js";
import { FOOTBALL } from "../../_lib/qf-sets.js";

const NO = (msg = "no") => new Response(JSON.stringify({ error: msg }), {
  status: 400,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  },
});

export const subFor = (set) => async function ({ request, env }) {
  if (!hasDB(env)) return NO();

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  const round = await getRound(env, body.playId, set);
  if (!round) return NO("no round");

  const out = await spendSub(env, round, set);
  if (out.error) return NO(out.error);

  return new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
};

/* FOOTBALL'S ROUTE. QuickFire XI: Friends serves the same handler for its own
   set from functions/api/quickfire_fr/ (functions/_lib/qf-sets.js). */
export const onRequestPost = subFor(FOOTBALL);
