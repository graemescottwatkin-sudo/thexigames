/* GET /api/wordsearch_fr/archive — the days already played, newest first,
   strictly before today. No board numbers: a number needs a launch date,
   and this game has none yet. */
import { archive, utcDayKey } from "../../_lib/frws-data.js";
import { json } from "../../_lib/frws-http.js";

export async function onRequestGet({ env }) {
  const now = Date.now();
  return json({ today: utcDayKey(now), days: await archive(env, now) });
}
