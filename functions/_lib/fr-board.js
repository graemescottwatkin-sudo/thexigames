/* functions/_lib/fr-board.js — which stored board a Friends board number means.
 *
 * TWO NUMBERINGS EXIST AND THEY ARE NOT THE SAME, which is the whole reason
 * this file is here rather than the arithmetic being inlined twice.
 *
 *   THE PUBLIC NUMBER is the family's daily number, counted from the family
 *   epoch in functions/_lib/daily.js. It is what a permalink carries, what
 *   /api/crossword_fr/daily takes as ?no=, and what boardKeys() advertises in
 *   the sitemap. Every game in this family works this way: boardKeys lists
 *   launchNumber(game)..today, so Vowels launched on board TEN and its own
 *   comment says so. A game's first board is not board 1.
 *
 *   THE STORED NUMBER is fr_puzzles.daily_no, which runs 1..120 because that is
 *   how the bank numbered its rehearsal manifest, and re-importing must not
 *   depend on when the game launched.
 *
 * THE ROUTE WAS WRITTEN THE OTHER WAY FIRST and it was wrong in a way nothing
 * caught until launch day. It derived "today" as dailyNumber - launched + 1,
 * so it called the opening board 1 while boardKeys called the same board 4.
 * The sitemap would have advertised /friends/crossword/daily/4, the route would
 * have read 4 as the fourth board of the bank, and a player following the link
 * would have been served the wrong puzzle — silently, because board 4 exists.
 *
 * The suites could not see it: they stub the database and never ask boardKeys
 * what the site advertises. It surfaced only when the game was actually added
 * to PERMA_GAMES. One fact, one place — so both routes ask this.
 */

import { launchNumber } from "./games.js";

export const GAME = "crossword_fr";

/* How many boards the bank holds. A public number beyond the last of them is a
   day the calendar has reached and the bank has not: that is a runway problem
   to be fixed by importing more boards, never by wrapping round to board 1 and
   serving somebody a puzzle they have already had. */
export const BOARDS = 120;

/* The stored row a public board number means, or null if there is not one.
   Null for a number before the game launched, for a number past the bank, and
   for anything that is not a board number at all — the caller decides what to
   say about each, because "not out yet" and "we have run out" are different
   sentences to a player. */
export function storedNo(publicNo) {
  const n = Number(publicNo);
  if (!Number.isInteger(n) || n < 1) return null;

  /* BEFORE LAUNCH THERE IS NO OFFSET TO APPLY, so the number addresses the bank
     directly. That is not a shortcut, it is what keeps the game BUILDABLE: this
     family works on its games in the open, /football/scrambled/ and
     /football/quickfire/ were both playable before they launched, and a themed
     game with no launch date would otherwise have no reachable board at all.
     There is no ambiguity either — launchNumber is null exactly when no public
     number has been advertised for this game anywhere. */
  const from = launchNumber(GAME);
  const board = from ? n - from + 1 : n;

  /* A number before the launch lands below 1, and one past the bank above 120.
     Both are "there is no board of ours for that", which the caller says
     plainly rather than treating as an error. */
  return board >= 1 && board <= BOARDS ? board : null;
}

/* The public number of a stored board — the inverse, for anything that starts
   from the bank rather than from a URL. */
export function publicNo(board) {
  const from = launchNumber(GAME);
  const b = Number(board);
  if (!from || !Number.isInteger(b) || b < 1 || b > BOARDS) return null;
  return from + b - 1;
}

/* The last public number the bank can answer, so a caller can say how much
   runway is left rather than discovering the end by serving a 404. */
export function lastPublicNo() {
  return publicNo(BOARDS);
}
