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

export function publicPuzzle(p) {
  if (!p) return null;
  return {
    id: p.id, theme: p.theme, category: p.category,
    status: p.status, hash: p.hash, version: p.version,
    share_key: p.share_key,
    grid: p.grid,
    answers: (p.answers || []).map((a, n) => ({ n, clue: a.clue, len: len(a) })),
    bonus: p.bonus ? { has: true, clue: p.bonus.clue, category: p.bonus.category, len: len(p.bonus) } : null,
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
