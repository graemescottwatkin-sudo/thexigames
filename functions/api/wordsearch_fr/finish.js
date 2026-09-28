/* POST /api/wordsearch_fr/finish — { playId } -> the server's score
 *
 * Every number from rows this server wrote: the words it matched, the clock
 * it started, the fouls it judged. No score is accepted from the page. Once
 * the round is over — every word found, or the clock past ninety — it also
 * names the answers and the secret, which the full-time card shows. */
import { csrfOk } from "../../_lib/auth.js";
import { verifiedScore, reveal, hasDB } from "../../_lib/frws-round.js";
import { json } from "../../_lib/frws-http.js";

export async function onRequestPost({ request, env }) {
  if (!csrfOk(request)) return json({ error: "Refused." }, 403);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Expected a JSON body." }, 400); }
  const { playId } = body || {};
  if (!playId) return json({ error: "Which round?" }, 400);
  if (!hasDB(env)) return json({ verified: false });

  const shown = await reveal(env, playId);
  const got = await verifiedScore(env, playId);
  return json({ verified: !!got, ...(got || {}), ...(shown ? { reveal: shown } : {}) });
}
