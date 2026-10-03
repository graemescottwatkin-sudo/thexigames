/* POST /api/wordsearch_fr/find — { playId, from:[r,c], to:[r,c] }
 *
 * The selection goes up and the server says what it hit, judged by football's
 * own geometry against placements the browser has never been given. A miss
 * is a foul and is recorded as one. It will not say which word you nearly
 * had.
 *
 * The board is the one this round kicked off on (which was the daily that
 * day), or today's daily when there is no round — never a board named in the
 * request, which would let anyone judge drags against a board of their
 * choosing. */
import { csrfOk } from "../../_lib/auth.js";
import { dailyBoard, boardById } from "../../_lib/frws-data.js";
import { foundAnswer } from "../../_lib/frws-public.js";
import { judge } from "../../_lib/ws-round.js";
import { roundOn, recordFind, recordFoul, foundWords, hasDB } from "../../_lib/frws-round.js";
import { json } from "../../_lib/frws-http.js";
import { clockFor } from "../../_lib/preview.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!csrfOk(request)) return json({ error: "Refused." }, 403);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Expected a JSON body." }, 400); }
  const { playId, from, to } = body || {};
  if (!Array.isArray(from) || !Array.isArray(to)) return json({ error: "A selection is two squares." }, 400);

  /* WHICH BOARD. Today's daily — unless this round kicked off on an earlier
     day's, which is a player still on yesterday's board past midnight. A
     round from TODAY on a board that is no longer today's (the schedule was
     re-imported under it) is void: judging against it would call every right
     drag on the board the player can see a foul. It is answered `stale`, and
     the page starts a fresh round. Found on a phone, 28 Sep 2026. */
  /* "Today" is the request's day: the real one, or an admin's preview day. */
  const { day, puzzle: today } = await dailyBoard(env, (await clockFor(context)).now);
  const round = hasDB(env) && playId ? await roundOn(env, playId) : null;
  if (round && round.day === day && (!today || round.puzzle_id !== today.id)) {
    return json({ hit: null, stale: true });
  }
  /* AND NOT A LATER DAY'S. The only round that can carry a day still to come
     is an admin preview's scratch one (functions/_lib/preview.js), and asked
     about without the preview's clock it would be judged against a board
     nobody may see yet. "An earlier day's board" above means earlier. */
  if (round && String(round.day) > day) return json({ hit: null, stale: true });
  const puzzle = round && round.day !== day ? await boardById(env, round.puzzle_id) : today;
  if (!puzzle) return json({ error: "No daily today." }, 404);

  const already = round ? (await foundWords(env, playId)).map((f) => f.word) : [];
  const hit = judge(puzzle, from, to, already);
  const now = Date.now();
  if (!hit) {
    const idx = round ? await recordFoul(env, playId, now) : null;
    return json({ hit: null, foul: true, fouls: idx || null });
  }
  if (round) await recordFind(env, playId, hit.item.grid, hit.bonus, now);
  return json({ hit: foundAnswer(puzzle, hit.item, hit.bonus) });
}
