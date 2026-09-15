/* GET /api/whoami/daily — today's eleven doors, or a board that has been.
 *
 * WHAT A DOOR IS: a club and the year a player last left it. That is the whole
 * of what a browser gets, and the absence of everything else is the design
 * rather than an omission — publicDoor() in wadata.js drops player_id in one
 * place so a new caller cannot forget to.
 *
 * ONLY ONE DOOR IS PLAYED PER PERSON PER DAY and the other ten stay live for
 * everybody else, so a leak here spoils ten answers for every other player that
 * day rather than one answer for this one.
 */
import { hasDB, getBoard, noStore, today } from "../../_lib/wadata.js";
import { CURVE, MAX_SCORE, FULL_TIME } from "../../_lib/xi-score.js";
import { MATCH_MINUTES, RATE_SECONDS, LADDER, GIVE_UP } from "../../_lib/wa-play.js";
import { boardNoOf, boardByFamilyNo, playableDay, lastPlayableDay } from "../../_lib/wa-board.js";

export async function onRequestGet({ request, env }) {
  if (!hasDB(env)) return noStore({ error: "no database binding", source: "none" }, 503);

  const url = new URL(request.url);
  const askedNo = url.searchParams.get("no");
  const askedDay = url.searchParams.get("date");

  let board = null, day = today();
  try {
    if (askedNo !== null) {
      /* Anything that is not a positive integer is a 404 rather than a coerced
         one: Number("") is 0 and Number("3x") is NaN, and both would otherwise
         walk into the lookup as something. */
      const no = /^\d+$/.test(askedNo) ? Number(askedNo) : -1;
      board = await boardByFamilyNo(env, no, today());
      if (board) day = board.date;
    } else if (askedDay !== null) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(askedDay) && await playableDay(env, askedDay)) {
        board = await getBoard(env, askedDay);
        if (board) day = askedDay;
      }
    } else {
      board = await getBoard(env);
    }
  } catch (err) {
    return noStore({ error: "query failed", detail: String(err), source: "d1" }, 500);
  }

  /* ONE 404 FOR "not yet" AND "never was". A board that has not run must not be
     distinguishable from one that does not exist, or the shape of the queue is
     readable by asking for numbers until the answer changes. */
  if (!board) {
    return noStore({ error: "no board published for that day", date: today(), source: "d1" }, 404);
  }

  const no = boardNoOf(day);
  return noStore({
    source: "d1",
    generatedAt: new Date().toISOString(),
    /* THE SCORING RULE TRAVELS WITH THE BOARD, and it is not a secret — it is
       the thing a player is entitled to know before they spend anything. The
       page needs the curve to tick a live "worth now" readout, and the only
       alternative to sending it is a second copy in the client that agrees
       today and disagrees the first time anybody tunes one. Codeword has that
       second copy; this does not.
       The LADDER goes with it for the same reason: the page draws the prices,
       and a price it invented would be a price the server did not charge. */
    scoring: {
      curve: CURVE, max: MAX_SCORE, fullTime: FULL_TIME,
      matchMinutes: MATCH_MINUTES, rateSeconds: RATE_SECONDS,
      ladder: LADDER.map((r) => ({ stage: r.stage, sub: r.sub,
                                   points: r.points, label: r.label })),
      giveUp: { label: GIVE_UP.label },
    },
    no, day,
    lastDay: await lastPlayableDay(env),
    isToday: day === today(),
    board: { ...board, no, day },
  });
}

export const onRequestHead = onRequestGet;
