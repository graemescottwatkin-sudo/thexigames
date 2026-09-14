/* GET /api/codeword/daily — today's board, and only today's.
 *
 * THIS ENDPOINT IS THE FIX FOR A REAL LEAK, so its refusals matter more than
 * its response. Codeword's queue is 365 board files, each carrying the filled
 * grid, every answer and the whole cipher. Staged as a public folder, anyone
 * could fetch daily/0200.json today and read the solution to April 2027 — the
 * producing session confirmed it by doing it, which is the same shape as the
 * word search publishing 233 boards that had never run. The queue lives in D1
 * now and this hands over ONE board, chosen by this server's clock.
 *
 * ?no= OPENS THE PAST AND NEVER THE FUTURE, which is the family's shape and
 * was a deliberate reversal. This endpoint shipped with no parameter at all on
 * the reasoning that a parameter which must be checked against the future
 * forever is a check that can eventually be got wrong, and no parameter cannot.
 * That was the right instinct and the wrong call: the owner's standard for
 * every game is a daily board plus the boards that have already gone, so the
 * past has to open. The instinct survives as the shape of the check — the
 * bound is derived from the SCHEDULE rather than from a number anyone sends,
 * and a board with no day at or before today is not a board.
 *
 * THE SERVER DECIDES WHAT DAY IT IS, in UTC. A date sent up is not read, and
 * the number that is read is checked against this server's calendar.
 */
import { json } from "../../_lib/puzzle.js";
import {
  hasDB, todayKey, boardForDay, boardByNo, publicBoard, lastDay,
} from "../../_lib/cw-board.js";

/* ONE 404 FOR EVERY REASON THERE IS NO BOARD, and the reason is not in it.
 * Contract 9.4: a 404 for a day past the end of the queue must not differ from
 * a 404 for a day the queue never covered, because the difference between those
 * two answers tells a reader how deep the queue is. Sealed, unknown and
 * malformed get one identical answer across this family; this is that answer.
 */
const NOTHING = () => new Response(JSON.stringify({ error: "no board" }), {
  status: 404,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  },
});

export async function onRequestGet({ request, env }) {
  if (!hasDB(env)) return NOTHING();
  const day = todayKey();

  /* A number, or today. Anything that is not a plain positive integer is not a
     board and gets the same 404 as one that has not run — the malformed and
     the sealed must be indistinguishable, or the difference is a way to ask
     what exists. */
  const raw = new URL(request.url).searchParams.get("no");
  let board;
  try {
    if (raw === null) {
      board = await boardForDay(env, day);
    } else {
      board = /^[0-9]{1,6}$/.test(raw) ? await boardByNo(env, Number(raw), day) : null;
    }
  } catch (e) { return NOTHING(); }
  if (!board) return NOTHING();

  const served = publicBoard(board);
  if (!served) return NOTHING();

  /* HOW MUCH QUEUE IS LEFT, reported and never used to decide anything here.
     The runway check reads cw_schedule from post_deploy and is the thing that
     raises the alarm; this is for a human looking at a response. It is the last
     DAY rather than a count of days so that nothing has to agree with anything
     about what today is. */
  let last = null;
  try { last = await lastDay(env); } catch (e) { last = null; }

  return json({ day, no: served.no, board: served, lastDay: last });
}

/* HEAD answers like the rest of the family: 200, no body. */
export async function onRequestHead(ctx) {
  const r = await onRequestGet(ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
