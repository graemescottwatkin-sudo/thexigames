/* GET /api/hilo/archive — the days already played, newest first.

   Strictly before today, each with its board's category and subtitle: the
   list a player picks a missed day from. It stops at yesterday by
   construction, so it carries nothing about the run-in. */
import { json } from "../../_lib/puzzle.js";
import { loadBank, archive, todayKey } from "../../_lib/hl-board.js";
/* The board number beside the day. The list is built from a SCHEDULE, which
   is keyed by day, but the address of a board is its number now — so the row
   carries both and the page never has to know when day one was. */
import { dailyNoForDay } from "../../_lib/daily.js";

export async function onRequestGet({ env }) {
  const now = Date.now();
  const bank = await loadBank(env);
  const days = archive(bank, now).map((d) => ({ ...d, no: dailyNoForDay(d.day) }));
  return json({ today: todayKey(now), todayNo: dailyNoForDay(todayKey(now)),
                days, source: bank.source });
}
