/* POST /api/wordsearch_fr/secret — the secret bonus word, once it has been earned.
 *
 * THE OWNER, 6 Oct 2026: once the main eleven are found, the thirty seconds of
 * bonus time begin, and "after 15 of those the word is revealed" -- the word,
 * not where it is -- "in case they still dont know what they are looking for".
 *
 * THE SERVER DECIDES BOTH HALVES, because the daily is judged here and a page
 * holding the word early could take the ten points without looking. So this
 * names the word only when this round has all eleven answers on record AND
 * SECRET_SHOWN_AFTER_S has passed since the last of them was found, by the
 * times the finds were recorded here. Asked early it says how long to wait,
 * and the page asks again then. Never the placement: finding it is still the
 * player's.
 */
import { csrfOk } from "../../_lib/auth.js";
import { boardById } from "../../_lib/frws-data.js";
import { roundOn, foundWords, hasDB } from "../../_lib/frws-round.js";
import { SECRET_SHOWN_AFTER_S } from "../../_lib/frws-public.js";
import { json } from "../../_lib/frws-http.js";

export async function onRequestPost({ request, env }) {
  if (!csrfOk(request)) return json({ error: "Refused." }, 403);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Expected a JSON body." }, 400); }
  const { playId } = body || {};
  if (!playId) return json({ error: "Which round?" }, 400);
  if (!hasDB(env)) return json({ secret: null });

  const round = await roundOn(env, playId);
  if (!round) return json({ secret: null });
  const puzzle = await boardById(env, round.puzzle_id);
  if (!puzzle || !puzzle.bonus) return json({ secret: null });

  const words = new Set((puzzle.answers || []).map((a) => a.grid));
  const mains = (await foundWords(env, playId)).filter((f) => !Number(f.is_bonus) && words.has(f.word));
  if (!words.size || new Set(mains.map((f) => f.word)).size < words.size) return json({ secret: null });

  const wait = Math.max(...mains.map((f) => Number(f.at_ms))) + SECRET_SHOWN_AFTER_S * 1000 - Date.now();
  if (wait > 0) return json({ secret: null, wait });
  return json({ secret: puzzle.bonus.display });
}
