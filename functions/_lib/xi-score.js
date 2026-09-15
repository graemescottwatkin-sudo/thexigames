/* functions/_lib/xi-score.js — the family's score curve.
 *
 * ONE HUNDRED AND FOURTEEN, AND IT IS THE FAMILY'S NUMBER RATHER THAN ANY ONE
 * GAME'S. Ballpark's rules file says it plainest: "out of 114, the same frame
 * as HiLo XI and every other game in the family — eleven questions at ten
 * points is 110, and the four that carry it to 114 are the bonuses." The
 * crossword reaches it another way (38 matches at 3) and lands on the same
 * ceiling, which is the point: a player who scores 90 in one game has done
 * something comparable to scoring 90 in another, and the season can add them
 * up without weighting anything.
 *
 * WHY THIS FILE EXISTS. The curve lived in functions/_lib/cw-round.js, named
 * for Codeword, and the second game to need it would have copied it — which is
 * this project's oldest fault and the one every comment in aligned_test is
 * about. Who Am I was that second game. cw-round.js now re-exports from here,
 * so Codeword's callers are unchanged and there is one table.
 *
 * THE CLOCK IS NINETY MINUTES because it is a football match, and the score
 * does not fall to nothing at the whistle: 36 at 90' is a result rather than a
 * punishment. A player who takes the full match and gets it right has still
 * done the thing the game asked.
 */

export const CURVE = [[0, 114], [10, 97], [20, 86], [30, 78], [45, 68], [60, 58], [75, 47], [90, 36]];
export const MAX_SCORE = 114;
export const FULL_TIME = 90;
export const FULL_TIME_SCORE = 36;

/* WHAT A MATCH IS WORTH AT A GIVEN MINUTE, interpolated linearly between the
 * published points.
 *
 * DELIBERATELY UNROUNDED. A caller rounds ONCE, at the end, when it has applied
 * whatever else it applies. Rounding here as well would make two callers
 * compute different scores for the same match on some minutes — two
 * authorities disagreeing about what happened. Codeword proved its page and its
 * server equal across every minute 0..120 and every solved count 0..11 only
 * after the intermediate round came out; before it, 105 of 1,452 outcomes
 * differed.
 */
export function scoreAt(minute) {
  if (minute <= 0) return MAX_SCORE;
  if (minute >= FULL_TIME) return FULL_TIME_SCORE;
  for (let i = CURVE.length - 1; i >= 0; i--) {
    if (minute >= CURVE[i][0]) {
      const [m0, s0] = CURVE[i];
      const [m1, s1] = CURVE[i + 1] || [FULL_TIME, FULL_TIME_SCORE];
      if (m1 === m0) return s0;
      return s0 + (s1 - s0) * ((minute - m0) / (m1 - m0));
    }
  }
  return MAX_SCORE;
}
