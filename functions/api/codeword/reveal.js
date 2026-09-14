/* Codeword XI — one letter, for a substitution and seven minutes.
 *
 * THE PAGE CANNOT DO THIS FOR ITSELF. publicBoard() sends the numbers, the
 * clues and three given letters and none of the filled grid, the answers or
 * the cipher — so marking, revealing and scoring happen here or not at all.
 *
 * FAIL CLOSED. If anything below refuses, nothing is marked, nothing is
 * revealed and NO MINUTES ARE CHARGED. Charging for a helper that did not help
 * is the fault only the player it happened to would ever see.
 */

import { json } from "../../_lib/puzzle.js";
import { hasDB, todayKey, boardByNo } from "../../_lib/cw-board.js";
import { getRound, revealRound } from "../../_lib/cw-play.js";

/* One refusal for every reason, saying nothing about which. */
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
  if (round.finished_ms) return NO("the whistle has gone");

  const n = Number(body.n);
  if (!Number.isInteger(n) || n < 1 || n > 26) return NO("no such number");

  const board = await boardByNo(env, Number(round.board_no), todayKey());
  if (!board) return NO("no board");

  const out = await revealRound(env, round, board, n);
  if (out.error) return NO(out.error);
  return json(out);
}
