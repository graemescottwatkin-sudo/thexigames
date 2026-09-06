/* POST /api/scrambled/finish — { playId }  ->  the score, the server's
 *
 * Every number is read from rows this server wrote while the board was played:
 * which slots were done and how, because it marked every guess and served
 * every reveal; how long it took, from a clock it started; how much help was
 * bought, because it sold all of it. No score is accepted, which is the rule
 * that lets a challenge table be shown to other people.
 *
 * It writes plays.srv_score — the column Crossword XI's /api/finish writes and
 * every challenge endpoint reads — so nothing new has to be invented for this
 * game to join a table.
 *
 * The Full Time card has always said the number it shows is the device's own
 * and unverified. A round this cannot verify keeps that number and says so:
 * fewer than eleven slots done, no kick off, no database.
 */
import { json, bad } from "../../_lib/sc-board.js";
import { csrfOk } from "../../_lib/auth.js";
import { verifiedScore, hasDB } from "../../_lib/sc-round.js";
import { ENGINE_GAMES } from "../../_lib/games.js";

export async function onRequestPost({ request, env }) {
  if (!csrfOk(request)) return bad("Refused.", 403);
  let body;
  try { body = await request.json(); } catch (e) { return bad("Expected a JSON body."); }
  const { playId } = body || {};
  if (!playId) return bad("Which round?");
  if (!hasDB(env)) return json({ verified: false });

  /* NOTHING ABOUT THE BOARD IS TAKEN FROM THE REQUEST. This asked the page how
     many slots the board had, which was a hole big enough to drive a
     leaderboard through: solve three, say the board has three, and a fast
     unhelped score tops the table. The round knows which board it started on
     and the server counts the slots itself. */
  const got = await verifiedScore(env, playId);
  if (!got) return json({ verified: false });

  /* BOTH GAMES THIS ENGINE SERVES, and the list is games.js's. This read
     `AND game = 'scrambled'`, which matched nothing for a Vowels play — the
     same bank read half a turn round, but `game` is "vowels" in its rows. So
     no Vowels finish was ever verified: 20 plays and 0 scores on production,
     while this endpoint answered `verified: true` and the page believed it. */
  const games = ENGINE_GAMES.scrambled;
  let landed = true;
  try {
    const res = await env.DB.prepare(
      `UPDATE plays SET srv_score = ?, srv_verified_at = datetime('now'),
                        srv_elapsed_secs = ?
        WHERE play_id = ? AND game IN (${games.map(() => "?").join(",")})`)
      .bind(got.score, got.elapsedSecs, String(playId), ...games).run();
    /* AND SAY SO WHEN IT CHANGED NOTHING. A silent no-op reported as success
       is how the Vowels fault survived: the row was never written and every
       caller was told it had been. D1 reports the row count; a stub that does
       not is taken at its word, because the suites are not what this guards. */
    if (res && res.meta && typeof res.meta.changes === "number") landed = res.meta.changes > 0;
  } catch (e) { landed = false; /* the score stands; the row can be caught up later */ }

  return json({ verified: landed, score: got.score, solved: got.solved,
    given: got.given, free: got.free, help: got.help, elapsedSecs: got.elapsedSecs });
}
