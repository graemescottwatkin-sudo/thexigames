/* GET /api/ballpark/archive — which boards have been the daily, and when.
 *
 * THE LIST STOPS AT TODAY, and that is the whole of this endpoint's job.
 * bp_schedule holds 175 days, most of them ahead: the word search shipped an
 * archive index built the same way and offered 238 boards from days the game
 * had not reached, then published 233 of them on its answers pages — names,
 * placements and the secret bonus word, for boards nobody had played. The bound
 * is applied in the QUERY rather than to the rows afterwards, because a filter
 * after the fact is a filter somebody can forget to apply.
 *
 * IT CARRIES NO CONTENT. A day and a board number, and nothing about what is on
 * the board — this game's boards have no titles to give away, and the
 * questions themselves would be the answers' own shape. The catalogue lesson
 * from Grid XI: a menu is ids, never payloads.
 */
import { json } from "../../_lib/puzzle.js";
import { dailyNumber, dailyDayKey } from "../../_lib/daily.js";
import { loadBank, todayKey } from "../../_lib/bp-board.js";
import { FREE_ARCHIVE_DAYS } from "../../_lib/archive.js";

export async function onRequestGet({ env }) {
  const now = Date.now();
  const today = todayKey(now);
  const todayNo = dailyNumber(now);

  const bank = await loadBank(env);
  const schedule = bank.schedule || {};

  /* Every day the calendar names that has actually arrived, newest first. The
     board NUMBER is the family's day count, so it is derived from the day
     rather than from a position in this list — a game that started after the
     epoch has gaps, and a running index would quietly renumber them. */
  const days = Object.keys(schedule)
    .filter((d) => d <= today)
    .sort()
    .reverse()
    .map((day) => ({ day, no: noForDay(day, todayNo, today), id: schedule[day] }))
    .filter((e) => e.no !== null);

  return json({ today: todayNo, days, freeArchiveDays: FREE_ARCHIVE_DAYS,
                source: bank.source });
}

/* The day count for a date, and NOTHING ELSE — in particular not the seal.
 *
 * It used to refuse a date after today as well, and that quietly became the
 * only thing keeping tomorrow out of the list: sabotaging the `d <= today`
 * filter above left the suite green, because this function was covering for it.
 * A seal that lives inside a helper named after arithmetic is a seal the next
 * refactor removes without noticing. So the filter is the one place the future
 * is shut, and this only answers "which board number is that date", returning
 * null when the date is not a family day at all — before the epoch, or not a
 * date. */
function noForDay(day, todayNo, today) {
  const back = Math.round(
    (Date.parse(today + "T00:00:00Z") - Date.parse(day + "T00:00:00Z")) / 86400000);
  if (!Number.isFinite(back)) return null;
  const no = todayNo - back;
  return no >= 1 && dailyDayKey(no) === day ? no : null;
}

export async function onRequestHead(ctx) {
  const r = await onRequestGet(ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
