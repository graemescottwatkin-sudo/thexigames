/* THE LIST IS THE ANSWERS, since 6 Oct 2026. The owner, on No. 19: "it's
 * giving clues, it's a wordsearch...no clues just answers". So the board sends
 * the eleven words, as football's does, and what follows below about clues is
 * the history it reverses. Placements are still withheld until found -- the
 * words are the list, finding them is the game -- and the secret is still its
 * clue and length, with the word itself named by /secret once it is earned.
 */
/* frws-public.js — what a Wordsearch XI: Friends board may tell a browser
 * while it is being played.
 *
 * Football's ws-public.js sends the eleven names, because a football word
 * search shows its list. This game's list is CLUES, and the answer to each is
 * the thing being hunted — so it withholds one more thing than football does:
 *
 *   grid          yes — it is the puzzle
 *   the clues     yes — they are the list
 *   the lengths   yes — "(5)" is part of a clue, as it is in a crossword
 *   the answers   NO  — until found
 *   placements    NO  — until found
 *   the bonus     its clue and length only, as football's
 *
 * `n` is the answer's place in the list, which is how the page ticks a clue
 * off without ever having been told the word under it.
 */
const len = (a) => String((a && a.grid) || "").length;

/* HOW LONG AFTER THE ELEVENTH FIND THE SECRET WORD IS SHOWN, in seconds of
   the thirty-second bonus time (the owner, 6 Oct 2026: "after 15 of those the
   word is revealed"). One number, here: /secret enforces it for the daily and
   every board the page is sent carries it, so free play waits the same. */
export const SECRET_SHOWN_AFTER_S = 15;
export const withShowAfter = (bonus) => (bonus ? { ...bonus, showAfter: SECRET_SHOWN_AFTER_S } : null);

export function publicPuzzle(p) {
  if (!p) return null;
  return {
    id: p.id, theme: p.theme, category: p.category,
    status: p.status, hash: p.hash, version: p.version,
    share_key: p.share_key,
    grid: p.grid,
    answers: (p.answers || []).map((a, n) => ({ n, display: a.display, len: len(a) })),
    bonus: withShowAfter(p.bonus ? { has: true, clue: p.bonus.clue, category: p.bonus.category, len: len(p.bonus) } : null),
  };
}

/* A found word: which clue it answers, what it is, and where it sits. */
export function foundAnswer(puzzle, item, isBonus) {
  const n = isBonus ? null : (puzzle.answers || []).findIndex((a) => a.grid === item.grid);
  return {
    n, display: item.display, grid: item.grid, placement: item.placement,
    ...(isBonus ? { bonus: true } : {}),
  };
}
