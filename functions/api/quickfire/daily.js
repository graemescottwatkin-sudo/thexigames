/* GET /api/quickfire/daily — today's eleven, or a board that has been.
 *
 * WHAT THIS USED TO SEND, and why the change is the whole point: every question
 * came down with its `answer` in plain text. Eleven a day, one curl. That was
 * load-bearing rather than careless — the page was a typing game that revealed
 * letters out of the answer string and genuinely could not draw a board without
 * it — which is why removing the field and rewriting the page were one change.
 * `shape()` in qfdata.js now sends the four options instead, and the marking
 * happens in /api/quickfire/answer where the answer never leaves.
 *
 * THE BOARD NUMBER IS THE FAMILY'S and it is reported here so the page never
 * has to work one out. Codeword shipped a live bug on exactly this seam a day
 * ago: its daily READ family numbers and REPORTED its own internal ordinal, the
 * page round-tripped that number into /play, /play refused it, the round stayed
 * null, and every handler on the page began `if (!round) return;`. The game
 * recognised nothing and nothing errored. QuickFire has only one numbering, so
 * the trap is not the same one — but the lesson is to send the number the page
 * will send back, which is what this does.
 */
import { hasDB, getDaily, getWeek, noStore, today } from "../../_lib/qfdata.js";
import { boardNoOf, boardByFamilyNo, playableDay, lastPlayableDay } from "../../_lib/qf-board.js";

export async function onRequestGet({ request, env }) {
  if (!hasDB(env)) {
    return noStore({ error: "no database binding", source: "none" }, 503);
  }

  const url = new URL(request.url);
  const askedNo = url.searchParams.get("no");
  const askedDay = url.searchParams.get("date");

  let daily = null, week = null, day = today();

  try {
    if (askedNo !== null) {
      /* A BOARD BY NUMBER. Anything that is not a positive integer is a 404
         rather than a coerced one: Number("") is 0 and Number("3x") is NaN, and
         both would otherwise walk into the lookup as something. */
      const no = /^\d+$/.test(askedNo) ? Number(askedNo) : -1;
      daily = await boardByFamilyNo(env, no, today());
      if (daily) day = daily.date;
    } else if (askedDay !== null) {
      /* A BOARD BY DATE, checked against the table rather than parsed. A date
         that is not a published day at or before today is not a board, and the
         bound is what stops /api/quickfire/daily?date=2026-12-11 handing over
         the eleven questions somebody will be asked in December. */
      if (/^\d{4}-\d{2}-\d{2}$/.test(askedDay) && await playableDay(env, askedDay)) {
        daily = await getDaily(env, askedDay);
        if (daily) day = askedDay;
      }
    } else {
      daily = await getDaily(env);
    }
    week = await getWeek(env);
  } catch (err) {
    return noStore({ error: "query failed", detail: String(err), source: "d1" }, 500);
  }

  if (!daily) {
    /* THE SAME 404 FOR "not yet" AND "never was". A board that has not run must
       not be distinguishable from one that does not exist, or the shape of the
       queue is readable by asking for numbers until the answer changes. */
    return noStore({ error: "no board published for that day", date: today(), source: "d1" }, 404);
  }

  const no = boardNoOf(day);
  const last = await lastPlayableDay(env);

  return noStore({
    source: "d1",
    generatedAt: new Date().toISOString(),
    no,
    day,
    lastDay: last,
    isToday: day === today(),
    daily: { ...daily, no, day },
    week,
  });
}

export const onRequestHead = onRequestGet;
