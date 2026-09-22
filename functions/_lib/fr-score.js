/* functions/_lib/fr-score.js — what a Friends board is worth.
 *
 * OUT OF 110, WHICH IS ELEVEN TENS. The football crossword scores in match
 * minutes, with a table, a season and a result; the ruling for Friends is a
 * score out of 110 and a genuine streak of +1 a day, with no season at all.
 * Those are different games that happen to share a shape, so they must not
 * share a scoring function — and this file exists so that the difference is
 * stated ONCE rather than implied in two places that will drift.
 *
 * IT WAS 100 UNTIL 22 SEPTEMBER 2026, and the change is not cosmetic: it
 * deletes a problem rather than working around one.
 *
 * 100 does not divide into an XI. 100/11 is 9.0909…, so eleven correct entries
 * scored independently and rounded came to 99 — a player who solved the whole
 * board being told they got 99. This file carried two defences against that:
 * the score was computed from the TOTAL and rounded ONCE rather than summed
 * from per-entry rounding, and the all-correct case was PINNED to 100 rather
 * than trusted to arithmetic. Both were correct, and both existed only because
 * the number was wrong.
 *
 * 110/11 is exactly 10. An entry is worth ten points, a revealed one is worth
 * five, and every reachable score is a whole number without anything being
 * rounded or pinned. The pin is kept below as a GUARANTEE rather than a repair
 * — it now asserts what the arithmetic already produces, which is the right
 * way round for a number a player will notice being wrong.
 *
 * ELEVEN IS THE SHAPE OF THIS FAMILY, and that is the argument for the number
 * rather than a coincidence that flatters it: eleven clues, eleven games,
 * eleven players to a team.
 *
 * THE PENALTY IS A REVEAL, and it is taken off the earned score rather than
 * added to a deduction pile, so the result can never go below zero or above
 * TOTAL without this file saying so.
 */

export const TOTAL = 110;
export const ENTRIES = 11;

/* TEN, AND IT IS DERIVED. Writing 10 here would be the one place that stops
   agreeing the day either number moves; this cannot. */
export const PER_ENTRY = TOTAL / ENTRIES;

/* A revealed entry counts as solved for the board but is worth a fraction of
   one that was not. Half, which is the value the football crossword's own
   reveal has always carried — a revealed answer is still progress, and a game
   that scores it at zero teaches players to guess wildly rather than ask.
   At ten points an entry that is five, exactly. */
export const REVEAL_WORTH = 0.5;

export function boardScore(correct, revealed, entries = ENTRIES) {
  const n = Math.max(1, Number(entries) || ENTRIES);
  const solved = Math.max(0, Math.min(n, Number(correct) || 0));
  const shown = Math.max(0, Math.min(solved, Number(revealed) || 0));

  /* A revealed entry is inside `solved`, not beside it — the caller counts an
     entry once. Taking it out and adding back its fraction is what keeps the
     two from being double counted, which is the arithmetic bug this shape
     exists to make impossible. */
  const earned = (solved - shown) + shown * REVEAL_WORTH;

  /* THE GUARANTEE, NOT A REPAIR. With 110 the arithmetic already returns TOTAL
     here; this states it so that a future change to TOTAL or ENTRIES that stops
     dividing cannot quietly make a full board score 109. */
  if (earned >= n) return TOTAL;

  /* Rounded because `entries` is a parameter and a caller may pass a board that
     is not eleven. For the real board every value is already whole. */
  return Math.round((earned / n) * TOTAL);
}

/* WHETHER THE DAY IS KEPT, which is the streak's question and not the score's.
   A streak is a genuine one — the owner's ruling — so it asks whether the board
   was FINISHED, not whether it was finished well. A player who reveals their
   way through keeps the day and scores 55; a player who leaves two entries
   blank does not keep it whatever the other nine were worth. */
export function keptTheDay(correct, entries = ENTRIES) {
  const n = Math.max(1, Number(entries) || ENTRIES);
  return (Number(correct) || 0) >= n;
}
