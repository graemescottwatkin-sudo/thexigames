/* Counting the help the server itself served.
 *
 * A play id arrives with a check or a reveal, and the count against that row
 * goes up by one. The browser is not asked how much help it took — it is the
 * party with the reason to understate it.
 *
 * IT USED TO FAIL QUIETLY AND SAY NOTHING, on the reasoning that "an uncounted
 * check makes a score too generous; a refused check breaks the game, and those
 * are not the same size of wrong". That was written when the score was the
 * browser's. It is the SERVER'S score now, and an independent review walked
 * straight through the gap on 7 September 2026: a reveal with no play id
 * returned "REALMADRID" and recorded nothing, so the answer could be collected
 * on one request and the board finished on another as a clean 114.
 *
 * So it still never throws — but it now REPORTS whether the charge landed, and
 * the endpoints refuse to serve help they could not charge. The identity is in
 * the predicate rather than checked beforehand: between a SELECT and an UPDATE
 * a row can change, and one statement cannot be raced.
 */
export async function tally(env, playId, column, identity) {
  const allowed = ["srv_checks", "srv_check_alls", "srv_reveal_letters", "srv_reveal_answers"];
  if (allowed.indexOf(column) === -1) return false;
  if (!env || !env.DB) return false;
  const id = String(playId || "");
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return false;
  const game = (identity && identity.game) || "crossword";
  const boardKey = identity && identity.boardKey;
  try {
    /* board_key IS NULL is allowed through for the same reason attempt.js
       allows it: production holds theme plays written before that column
       existed, and a player mid-board on one must not lose their help. */
    const q = boardKey
      ? `UPDATE plays SET ${column} = COALESCE(${column}, 0) + 1
          WHERE play_id = ? AND game = ? AND (board_key IS NULL OR board_key = ?)`
      : `UPDATE plays SET ${column} = COALESCE(${column}, 0) + 1
          WHERE play_id = ? AND game = ?`;
    const res = await (boardKey
      ? env.DB.prepare(q).bind(id, game, boardKey)
      : env.DB.prepare(q).bind(id, game)).run();
    /* A stub that reports no row count is taken at its word: the suites are
       not what this guards, and refusing every charge offline would be a
       worse fault than the one it closes. */
    if (res && res.meta && typeof res.meta.changes === "number") return res.meta.changes > 0;
    return true;
  } catch (e) { return false; /* counting must never break play */ }
}
