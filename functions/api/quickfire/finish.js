/* QuickFire XI — the whistle. The SERVER says what it was worth.
 *
 * THE ANSWER IS NOT IN THE PAYLOAD ANY MORE, which is why this file exists.
 * Until 15 September 2026 every question went out with its answer in plain
 * text, because the page was a typing game that revealed letters out of it. It
 * is four options now, so the page needs the options and an id — and the
 * marking has to happen somewhere the answer already is.
 *
 * FAIL CLOSED. If anything below refuses, nothing is marked, nothing is spent
 * and no minutes are charged. Charging for something that did not happen is the
 * fault only the player it happened to would ever see.
 */

import { hasDB } from "../../_lib/qfdata.js";
import { getRound, finishRound } from "../../_lib/qf-play.js";

/* One refusal, saying nothing about which. */
const NO = (msg = "no") => new Response(JSON.stringify({ error: msg }), {
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

  /* COMPUTED HERE, NOT POSTED. Moving the marking to this side to stop a forged
     score and then accepting the score from the page would be the front door
     locked and the back door open. */
  const out = await finishRound(env, round);
  return new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
