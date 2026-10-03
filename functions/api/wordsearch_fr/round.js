/* POST /api/wordsearch_fr/round — { playId }
 *
 * Kick off on today's board, by this server's clock. Kicking off twice keeps
 * the first clock. Answers with what the round has already found — each with
 * its clue number, word and placement, which the player has earned — so a
 * resumed board draws its lines back. */
import { csrfOk } from "../../_lib/auth.js";
import { dailyBoard } from "../../_lib/frws-data.js";
import { foundAnswer } from "../../_lib/frws-public.js";
import { startRound, roundOn, foundWords, hasDB } from "../../_lib/frws-round.js";
import { json } from "../../_lib/frws-http.js";
import { clockFor } from "../../_lib/preview.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!csrfOk(request)) return json({ error: "Refused." }, 403);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Expected a JSON body." }, 400); }
  const { playId } = body || {};
  if (!playId) return json({ error: "Which round?" }, 400);
  if (!hasDB(env)) return json({ verified: false });

  /* Today is the request's day: the real one, or an admin's preview day, whose
     play id is already a scratch one (XIPlays hands out pv- ids in a preview). */
  const { day, puzzle } = await dailyBoard(env, (await clockFor(context)).now);
  if (!puzzle) return json({ verified: false });

  /* An id already used on another board is not this round (see find.js):
     `stale` tells the page to start a fresh one rather than play unjudged. */
  const prior = await roundOn(env, playId);
  if (prior && prior.puzzle_id !== puzzle.id) return json({ verified: false, stale: true });
  const at = await startRound(env, playId, puzzle.id, day, Date.now());
  if (at === null) return json({ verified: false });
  const done = new Set((await foundWords(env, playId)).map((f) => f.word));
  const found = (puzzle.answers || []).concat(puzzle.bonus ? [puzzle.bonus] : [])
    .filter((a) => done.has(a.grid))
    .map((a) => foundAnswer(puzzle, a, a === puzzle.bonus));
  return json({ verified: true, startedMs: at, found });
}
