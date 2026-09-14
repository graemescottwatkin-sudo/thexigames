/* Codeword XI — kick off, and the clock starts HERE.
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
import { hasDB, todayKey, boardForDay, boardByNo } from "../../_lib/cw-board.js";
import { validRate } from "../../_lib/cw-round.js";
import { startRound } from "../../_lib/cw-play.js";

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

  /* THE RATE IS FIXED AT KICK-OFF AND REFUSED AFTERWARDS. The page offers two
     clocks, 3 real seconds to the match minute or 20, and the server cannot
     turn elapsed time into a minute without knowing which. The producing side
     found the live version of this: its rate was switchable mid-match and the
     minute was computed over the whole match, so a switch REWOUND the clock —
     seventeen minutes of decay handed back for one click. */
  const rate = validRate(body.rate);
  if (rate === null) return NO("rate must be 3 or 20");

  const day = todayKey();
  const raw = body.no;
  let board;
  try {
    board = raw === undefined || raw === null
      ? await boardForDay(env, day)
      : (/^[0-9]{1,6}$/.test(String(raw)) ? await boardByNo(env, Number(raw), day) : null);
  } catch (e) { return NO(); }
  if (!board) return NO("no board");

  const r = await startRound(env, { boardNo: board.no, day: board.day, rate });
  return json(r);
}
