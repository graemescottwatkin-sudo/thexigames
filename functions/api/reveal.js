/* POST /api/reveal
 *
 * Body: { token, entry, index }   one letter  — Reveal Letter, Substitution
 *    or { token, entry }          one answer  — Reveal Answer
 *
 * §6 of the deployment standard allows the server to return an answer "only
 * after the user explicitly requests a reveal". That is exactly what this is:
 * every route to it costs the player points or spends a substitution, and it
 * hands back one letter or one entry — never the puzzle, never the bank.
 *
 * Scoring stays in the browser. A player who calls this endpoint directly can
 * read one answer they were already able to reveal in the UI, so there is
 * nothing to gain; keeping score server-side would need accounts and is out of
 * scope for a puzzle with no login.
 */
import { normalise, json, bad } from "../_lib/puzzle.js";
import { tally } from "../_lib/tally.js";
import { getPuzzleForToken, hasDB } from "../_lib/db.js";
import { boardKeyForToken } from "../_lib/attempt.js";
import { playableDailyNo } from "../_lib/daily.js";
import { isAdmin } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return bad("Expected a JSON body.");
  }

  const { token, entry, index, playId } = body || {};
  /* A daily token is only playable on its own day; see _lib/daily.js. The one
     exception is the owner previewing another day — otherwise the preview is a
     board that cannot be checked, revealed or finished, which is not much of a
     preview. The guard is unchanged for everyone else: the flag is read from
     the database, not taken from the request. */
  if (playableDailyNo(token) === false && !(await isAdmin(request, env))) {
    return bad("That puzzle is not today's daily.", 403);
  }
  const stored = await getPuzzleForToken(env, token);
  if (!stored) return bad("Unknown puzzle.", 404);
  const puzzle = stored.puzzle;

  const idx = Number(entry);
  if (!Number.isInteger(idx) || idx < 0 || idx >= puzzle.entries.length) {
    return bad("Unknown entry.");
  }
  const answer = normalise(puzzle.entries[idx].row.grid);

  /* HELP THAT CANNOT BE CHARGED IS NOT SERVED, and until 8 September 2026 it
     was. An independent review asked for entry 0 with NO play id and got the
     whole answer back while the tally recorded nothing — so the help never
     reached the row that was later submitted for a verified score. The board
     is judged where the answers are and the score is written where the clock
     is; a reveal has to touch both or it is free.
     Offline and with no database this is unchanged: nothing there can be
     verified, and /api/finish says so on its own. */
  const identity = { game: "crossword", boardKey: boardKeyForToken(token, stored) };
  const charge = async (column) => {
    if (!hasDB(env)) return true;
    return tally(env, playId, column, identity);
  };

  if (index === undefined || index === null) {
    if (!(await charge("srv_reveal_answers"))) return refused();
    return json({ entry: idx, answer });
  }

  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= answer.length) {
    return bad("That square is not part of this answer.");
  }
  /* A substitution is free to the player but still a revealed letter, and it
     comes through this same call. The server cannot tell the two apart and
     should not try: what it counts is letters it handed over. */
  if (!(await charge("srv_reveal_letters"))) return refused();
  return json({ entry: idx, index: i, letter: answer[i] });
}

/* One refusal, and it says what to do about it. A player whose attempt never
   reached the server — a start that failed on a flaky connection — sees this
   rather than a silent nothing, and starting the board again fixes it. */
function refused() {
  return bad("That help could not be charged to this attempt. Start the board again.", 409);
}
