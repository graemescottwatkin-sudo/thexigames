/* functions/_lib/cw-round.js — Codeword XI's sitting: the clock, the helpers,
 * the marking and the score. Every rule the browser is not allowed to decide.
 *
 * THE SERVER OWNS THE CLOCK, AND THE WHOLE SCORE IS A FUNCTION OF IT. A minute
 * the client reports is a score the client chooses. The producing side found
 * the colourful version of this in its own demo: the clock RATE was switchable
 * mid-match and the minute was computed as elapsed/rate over the whole match,
 * so flipping to the slow clock rewound it — seventeen minutes of decay handed
 * back for one click. The rate is fixed at kick-off here and refused after.
 *
 * THE RULES BELOW ARE THE PRODUCING SIDE'S, READ OUT OF ITS PAGE rather than
 * described to me: CURVE, MAX, SUBS and COST are the values its own source
 * carries, and its prose matched them exactly when I checked.
 */

/* The decay, in match minutes. Verified against the demo's source. */
export const CURVE = [[0, 114], [10, 97], [20, 86], [30, 78], [45, 68], [60, 58], [75, 47], [90, 36]];
export const MAX_SCORE = 114;
export const SUBS = 3;
export const COST = { check: 5, reveal: 7 };
export const SLOTS = 11;
/* Two clocks, and only these two: 3 real seconds to the match minute, or 20. */
export const RATES = [3, 20];

export function scoreAt(minute) {
  if (minute <= 0) return MAX_SCORE;
  if (minute >= 90) return 36;
  for (let i = CURVE.length - 1; i >= 0; i--) {
    if (minute >= CURVE[i][0]) {
      const [m0, s0] = CURVE[i], [m1, s1] = CURVE[i + 1] || [90, 36];
      if (m1 === m0) return s0;
      /* Linear between the published points, and DELIBERATELY UNROUNDED.
         The producing side rounds once, at the end of outcome(), and an
         intermediate round here would make this server and that page compute
         different scores for the same match on some minutes — two authorities
         disagreeing about what happened, which is the fault (a) was chosen to
         remove rather than relocate. Proved equal across every minute 0..120
         and every solved count 0..11. */
      return s0 + (s1 - s0) * ((minute - m0) / (m1 - m0));
    }
  }
  return MAX_SCORE;
}

/* THE MATCH MINUTE. Elapsed real time divided by the rate, plus whatever the
   helpers have charged. Both halves are the server's: elapsed from its own
   started_ms, spent from its own record of what was bought. */
export function minuteOf(round, now) {
  const rate = Number(round.rate_secs) || RATES[0];
  const elapsed = Math.max(0, Number(now) - Number(round.started_ms));
  return Math.floor(elapsed / (rate * 1000)) + (Number(round.spent_minutes) || 0);
}

/* WHAT A FINISHED MATCH WAS WORTH. The producing side's own formula, and the
   result is a football result rather than a number. */
export function outcome(minute, solved, total = SLOTS) {
  return {
    score: Math.round(scoreAt(minute) * solved / total),
    solved,
    minute,
    result: solved < total ? "L" : (minute <= 90 ? "W" : "D"),
  };
}

/* WHICH SLOTS ARE COMPLETELY FILLED AND RIGHT, and never which letter is
 * wrong. That distinction is the producing side's and it is what keeps the
 * paid helper worth paying for: the page used to mark a slot done for free
 * because it held the answer, so confirm is no weaker than the game already
 * was — but "which letter is wrong in a half-filled grid" is a different
 * question, and it is the one CHECK GRID answers.
 *
 * `guess` maps cipher number to the letter the player has put there. A slot
 * counts only when every square in it is filled AND the word reads correctly.
 */
export function confirmSlots(board, guess) {
  const out = [];
  const rows = board.rows || [];
  (board.words || []).forEach((w, i) => {
    const [answer, r, c, dir] = Array.isArray(w) ? w : [];
    if (!answer) return;
    const code = board.code || {};
    let ok = true;
    for (let k = 0; k < String(answer).length; k++) {
      const rr = dir === "d" ? r + k : r;
      const cc = dir === "d" ? c : c + k;
      const real = (rows[rr] || "")[cc];
      const n = code[real];
      const put = guess ? guess[String(n)] : null;
      if (!put || String(put).toUpperCase() !== real) { ok = false; break; }
    }
    if (ok) out.push(i);
  });
  return out;
}

/* WHICH NUMBERS CARRY A WRONG LETTER — the paid helper. It names NUMBERS and
 * not squares, because a codeword's mistake is a mapping rather than a cell:
 * telling a player that square 4,7 is wrong tells them less than telling them
 * that 14 is not an E, and it would also tell them where to look. */
export function wrongNumbers(board, guess) {
  const code = board.code || {};
  const back = new Map();
  for (const L of Object.keys(code)) back.set(String(code[L]), L);
  const out = [];
  for (const n of Object.keys(guess || {})) {
    const put = String(guess[n] || "").toUpperCase();
    if (!put) continue;
    const real = back.get(String(n));
    if (real && put !== real) out.push(Number(n));
  }
  return out.sort((a, b) => a - b);
}

/* THE LETTER BEHIND ONE NUMBER. The only place a piece of the cipher is handed
   over on purpose, and it costs a substitution and seven minutes. */
export function letterFor(board, n) {
  const code = board.code || {};
  for (const L of Object.keys(code)) if (Number(code[L]) === Number(n)) return L;
  return null;
}

/* A rate the page may ask for. Anything else is refused rather than coerced to
   a default: a silently-corrected rate is a clock the player did not choose. */
export function validRate(raw) {
  const n = Number(raw);
  return RATES.includes(n) ? n : null;
}
