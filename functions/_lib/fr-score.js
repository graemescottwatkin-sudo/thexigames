/* functions/_lib/fr-score.js — what a Friends board is worth.
 *
 * OUT OF 100, WHICH IS THE WHOLE RULE AND IS NOT THE FOOTBALL ONE. The football
 * crossword scores in match minutes, with a table, a season and a result; the
 * owner's ruling for Friends, 19 September 2026, is a score out of 100 and a
 * genuine streak of +1 a day, with no season at all. Those are different games
 * that happen to share a shape, so they must not share a scoring function —
 * and this file exists so that the difference is stated ONCE rather than
 * implied in two places that will drift.
 *
 * ELEVEN ENTRIES INTO 100 DOES NOT DIVIDE, and that matters more than it
 * sounds. 100/11 is 9.0909…, so eleven correct entries scored independently and
 * rounded come to 99, not 100 — a player who solves the whole board would be
 * told they got 99%. The board score is therefore computed from the TOTAL and
 * rounded once, never summed from per-entry rounding. The all-correct case is
 * additionally pinned to 100 rather than trusted to arithmetic, because that is
 * the one number a player will notice being wrong.
 *
 * THE PENALTY IS A REVEAL, and it is taken off the earned score rather than
 * added to a deduction pile, so the result can never go below zero or above
 * 100 without this file saying so.
 */

export const TOTAL = 100;
export const ENTRIES = 11;

/* A revealed entry counts as solved for the board but is worth a fraction of
   one that was not. Half, which is the value the football crossword's own
   reveal has always carried — a revealed answer is still progress, and a game
   that scores it at zero teaches players to guess wildly rather than ask. */
export const REVEAL_WORTH = 0.5;

/* Rounded ONCE, at the end. See the header: per-entry rounding cannot reach
   100 with eleven entries, and a player who solves everything must see 100. */
export function boardScore(correct, revealed, entries = ENTRIES) {
  const n = Math.max(1, Number(entries) || ENTRIES);
  const solved = Math.max(0, Math.min(n, Number(correct) || 0));
  const shown = Math.max(0, Math.min(solved, Number(revealed) || 0));

  /* A revealed entry is inside `solved`, not beside it — the caller counts an
     entry once. Taking it out and adding back its fraction is what keeps the
     two from being double counted, which is the arithmetic bug this shape
     exists to make impossible. */
  const earned = (solved - shown) + shown * REVEAL_WORTH;
  if (earned >= n) return TOTAL;
  return Math.round((earned / n) * TOTAL);
}

/* WHETHER THE DAY IS KEPT, which is the streak's question and not the score's.
   A streak is a genuine one — the owner's ruling — so it asks whether the board
   was FINISHED, not whether it was finished well. A player who reveals their
   way through keeps the day and scores 50; a player who leaves two entries
   blank does not keep it whatever the other nine were worth. */
export function keptTheDay(correct, entries = ENTRIES) {
  const n = Math.max(1, Number(entries) || ENTRIES);
  return (Number(correct) || 0) >= n;
}
