/* QuickFire XI — kick off. The clock starts HERE.
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

import { hasDB, today } from "../../_lib/qfdata.js";
import { playableDay } from "../../_lib/qf-board.js";
import { startRound } from "../../_lib/qf-play.js";

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

  /* WHICH BOARD THIS SITTING IS AGAINST. Today's unless a day is named, and a
     named day is checked against the table rather than believed — playableDay()
     asks whether that row is published and at or before today. Without it a
     round could be opened against December's board and answered question by
     question, which is the board-early leak from a different direction: the
     questions would come from /daily's own bound, but the round would exist and
     the answers would be marked, and "was I right" is most of a board.

     A PAST BOARD IS A REAL SITTING, not a practice mode. It is scored the same
     way, banked the same way, and its clock runs the same. The owner's standard
     is that boards which have gone can be selected and played properly; a
     second, lesser code path for old boards would be a second set of rules to
     keep in step. */
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  const asked = body.date;
  if (asked !== undefined && asked !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(asked))) return NO("no such board");
    if (!(await playableDay(env, String(asked)))) return NO("no such board");
    const r = await startRound(env, String(asked));
    return new Response(JSON.stringify(r), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  /* THE DAY IS THIS SERVER'S. A date sent up is not read: the board a round
     belongs to is decided here, so a client cannot open yesterday's round and
     answer today's questions into it. */
  const r = await startRound(env, today());
  return new Response(JSON.stringify(r), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
