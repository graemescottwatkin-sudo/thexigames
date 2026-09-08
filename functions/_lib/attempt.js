/* attempt.js — is this play the attempt this token is being played on?
 *
 * WHY THIS EXISTS. An independent review on 7 September 2026 reproduced three
 * faults that are one fault wearing three coats: the crossword's endpoints
 * marked, revealed and scored against a TOKEN, and wrote against a PLAY ID,
 * and nothing ever checked that the two were the same attempt.
 *
 *   /api/finish   loaded the play by id alone and stamped srv_score onto it.
 *                 Reproduced: a solved practice board returned score 114 and
 *                 wrote it onto a row whose own columns said game "hilo",
 *                 board "hl:999".
 *   /api/reveal   served the whole answer with no play id at all, and the
 *                 tally quietly did nothing. Reproduced: "REALMADRID" back,
 *                 zero writes — so the help never reached the row that was
 *                 later submitted as a clean verified score.
 *
 * The board is judged where the answers are, and the score is written where
 * the clock is; this is the one place that says the two belong together.
 *
 * WHAT AN IDENTITY IS. A token names a game and a board. A play row records
 * the game and board it was opened on. They must agree:
 *
 *   daily:12      game crossword, board_key "daily:12"
 *   theme:240     game crossword, board_key "arsenal-1"  (theme_id + "-" + no)
 *   practice:1    game crossword, board_key "practice"
 *
 * WHAT IS DELIBERATELY LENIENT, and why it is not a hole. A play row written
 * before board_key existed has none — production still holds theme plays with
 * board_key NULL — so a null key cannot be compared and the game and mode are
 * checked instead. That refuses every cross-GAME case, which is the one the
 * review reproduced, and it cannot refuse a player who is mid-board on an old
 * row. A row with a key is held to it exactly.
 */

/* The board key a token names, or null when it cannot be known from the
   stored board alone. `stored` is what getPuzzleForToken returned. */
export function boardKeyForToken(token, stored) {
  const m = /^(daily|practice|theme):(\d+)$/.exec(String(token || ""));
  if (!m) return null;
  if (m[1] === "daily") return "daily:" + Number(m[2]);
  if (m[1] === "practice") return "practice";
  /* A themed board carries its own slug and number, which is exactly how the
     client builds the key it sends to /api/play. */
  if (stored && stored.themeId && stored.boardNo != null) {
    return String(stored.themeId) + "-" + Number(stored.boardNo);
  }
  return null;
}

export function modeForToken(token) {
  const m = /^(daily|practice|theme):(\d+)$/.exec(String(token || ""));
  return m ? m[1] : null;
}

/* The columns any caller of this needs to have selected. Named here so a
   caller cannot check an identity it did not load. */
export const ATTEMPT_COLUMNS = "game, board_key, mode";

/* Does this play row belong to this token? `row` must carry game, board_key
   and mode. A missing row is not an attempt. */
export function attemptMatches(row, token, stored, game = "crossword") {
  if (!row) return false;
  if (String(row.game || "crossword") !== game) return false;
  const mode = modeForToken(token);
  if (!mode) return false;
  if (row.mode && String(row.mode) !== mode) return false;
  const want = boardKeyForToken(token, stored);
  /* No key on the row: an old play, from before the column. Game and mode have
     already been checked, which is what can be checked. */
  if (row.board_key === null || row.board_key === undefined) return true;
  if (!want) return true;                 // nothing to compare it against
  return String(row.board_key) === want;
}
