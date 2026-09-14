/* QuickFire XI — one locked pick, marked on this side.
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

import { hasDB, today, getDaily } from "../../_lib/qfdata.js";
import { getRound, answerRound } from "../../_lib/qf-play.js";
import { PER_DAILY } from "../../_lib/qf-round.js";

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

  const idx = Number(body.idx);
  if (!Number.isInteger(idx) || idx < 1 || idx > PER_DAILY) return NO("no such question");

  /* THE BOARD IS THE ROUND'S, NOT THE REQUEST'S. The round records which day it
     was opened on and the questions are fetched for THAT day, so a round opened
     yesterday cannot be answered against today's board — which would otherwise
     be a way to see a board early by opening a round and waiting. */
  const board = await getDaily(env, round.play_date);
  const list = (board && board.questions) || [];
  const question = list[idx - 1];
  if (!question) return NO("no such question");

  /* The shaped question carries no answer — that is the whole point — so the
     row with the answer on it is fetched here rather than reused from what the
     page was served. */
  const row = await env.DB.prepare(
    "SELECT id, answer, option_1, option_2, option_3, option_4 FROM qf_question WHERE id = ?"
  ).bind(question.id).first();
  if (!row) return NO("no such question");

  const out = await answerRound(env, round, row, idx, body.pick);
  if (out.error) return NO(out.error);
  return new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
