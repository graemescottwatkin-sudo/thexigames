/* GET /api/wordsearch_fr/puzzle?id=FRWS-0123 — one released board, whole,
 * for free play (which judges on the page and has help cards).
 *
 * Football's rules, unchanged: an unreleased, unknown or malformed id and
 * today's daily all get the same 404 that names nothing; an old board past
 * the free archive window asks the player to sign in. */
import { boardById, released, lastScheduledDay, isTodaysDaily } from "../../_lib/frws-data.js";
import { mayOpenArchive, archiveRefusal, daysBack } from "../../_lib/archive.js";
import { json } from "../../_lib/frws-http.js";

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("id") || "";
  const none = () => json({ error: "No such board." }, 404);
  if (!/^FRWS-\d{4}$/.test(id)) return none();
  if (!(await released(env, id))) return none();
  if (await isTodaysDaily(env, id)) return none();

  const ran = await lastScheduledDay(env, id);
  if (ran !== null) {
    const back = daysBack(ran);
    if (!(await mayOpenArchive(request, env, back))) return json(archiveRefusal(back), 401);
  }
  const puzzle = await boardById(env, id);
  return puzzle ? json({ puzzle }) : none();
}
