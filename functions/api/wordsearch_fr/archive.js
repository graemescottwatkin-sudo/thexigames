/* GET /api/wordsearch_fr/archive — the days already played, newest first,
   strictly before today, each with its family board NUMBER, which is what a
   permalink names. Bounded below by the launch (frws-data.js). */
import { archive, utcDayKey } from "../../_lib/frws-data.js";
import { json } from "../../_lib/frws-http.js";
import { dailyNoForDay } from "../../_lib/daily.js";

export async function onRequestGet({ env }) {
  const now = Date.now();
  const days = (await archive(env, now)).map((d) => ({ ...d, no: dailyNoForDay(d.day) }));
  return json({ today: utcDayKey(now), todayNo: dailyNoForDay(utcDayKey(now)), days });
}
