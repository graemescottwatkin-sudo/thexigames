/* functions/_lib/cw-registry.js — WHICH CROSSWORDS EXIST, and what differs.
 *
 * WHY THIS EXISTS. The football crossword owns the un-namespaced API: /api/daily,
 * /api/check-answer, /api/reveal, /api/verify, /api/finish. It was the first
 * game and for a long time the only one, so nothing in those files ever had to
 * ask WHICH crossword it was serving.
 *
 * Then a second crossword launched. The Friends crossword shipped on
 * 21 September 2026 with two endpoints of its own under /api/crossword_fr/ and
 * a board to match: no clock, no solved count, no clue panel. Making it look
 * like the crossword this family is named after means running football's
 * client, and football's client calls seventeen endpoints.
 *
 * So the crossword API is namespaced by game — /api/crossword/<game>/… — and
 * the differences between two crosswords are collected HERE rather than
 * scattered through seven handlers as `if (game === …)`. The handlers stay
 * about the RULES, which are the same for both, and this file is the only
 * place that knows a crossword can be more than one thing.
 *
 * THE OLD ADDRESSES KEEP WORKING AND ALWAYS WILL. /api/daily is what every
 * live football client on every device is calling right now, and a deploy that
 * moved it would break the game for anybody who had not reloaded. So the old
 * routes stay and delegate here with game "crossword": one implementation, two
 * addresses, which is the same shape as the hub serving at / and /football/.
 *
 * WHAT MAY GO IN A ROW, said as a rule rather than left to taste: facts about
 * WHERE A BOARD COMES FROM and WHAT A GAME IS ALLOWED TO DO. Not presentation,
 * not copy, and never a rule — if both crosswords must obey it, it belongs in
 * the handler, because a rule written once per game is a rule that will
 * eventually be written differently.
 */
import { getDailyPuzzle, getPuzzleForToken, parseToken } from "./db.js";
import { computeScore, SCORING } from "./scoring.js";
import { boardScore, TOTAL as FR_TOTAL } from "./fr-score.js";
import { storedNo, lastPublicNo } from "./fr-board.js";

export const CROSSWORDS = {
  crossword: {
    id: "crossword",
    /* Football's boards are numbered from the family epoch and its bank is
       indexed by that number directly, so there is no conversion. */
    load: (env, no) => getDailyPuzzle(env, no),
    /* BY TOKEN, which is not the same question as by number. A football token
       may name a daily, a THEMED board or a PRACTICE board, and each lives
       somewhere different; getPuzzleForToken has held that fan-out since long
       before there was a second crossword. */
    loadByToken: (env, token) => getPuzzleForToken(env, token),
    /* WHAT A FINISHED BOARD IS WORTH. Football's rule, unchanged and moved
       here verbatim: the clock decays from the maximum and help is charged as
       MINUTES on that clock, which is why the caller hands over an elapsed
       time with the help already folded into it. */
    score: ({ elapsedSeconds, row }) => computeScore(
      elapsedSeconds,
      row.srv_checks || 0, row.srv_reveal_letters || 0,
      row.srv_reveal_answers || 0, row.srv_check_alls || 0),
    /* Help costs TIME in this game, so the caller needs the conversion. */
    helpSeconds: (row) => {
      const perMin = SCORING.MATCH_CLOCK_REAL_SECONDS / SCORING.MATCH_CLOCK_MAX_MINUTES;
      return Math.round(perMin * (
        (row.srv_checks || 0) * SCORING.HELP_MINUTES.check +
        (row.srv_check_alls || 0) * SCORING.HELP_MINUTES.checkAll +
        (row.srv_reveal_letters || 0) * SCORING.HELP_MINUTES.revealLetter +
        (row.srv_reveal_answers || 0) * SCORING.HELP_MINUTES.revealAnswer));
    },
    publicToStored: (no) => no,
    lastNo: null,                 // the bank is extended, not finite
    /* The archive and its paywall are football's. Friends has 120 boards and
       no archive page, so asking the question for it would be asking about a
       thing that does not exist. */
    archive: true,
  },

  crossword_fr: {
    id: "crossword_fr",
    /* THE BANK IS A DIFFERENT TABLE AND A DIFFERENT NUMBERING. A public board
       number is the FAMILY's daily number; fr_puzzles holds 1..120. fr-board.js
       owns that conversion and is asked rather than repeated. */
    load: async (env, no) => {
      const stored = storedNo(no);
      if (stored == null) return null;
      const row = await env.DB
        .prepare("SELECT payload FROM fr_puzzles WHERE mode = 'daily' AND daily_no = ?1")
        .bind(stored)
        .first();
      if (!row) return null;
      let parsed;
      try { parsed = JSON.parse(row.payload); } catch (e) { return null; }
      return parsed && parsed.puzzle ? { puzzle: parsed.puzzle } : null;
    },
    /* ONLY DAILIES EXIST HERE. This game has no themed boards and no practice
       pool, so a token naming either is not a board this game has lost -- it is
       a board this game never had, and it is refused rather than looked for.
       Returning null is what the handlers already do with an unknown token. */
    loadByToken: async (env, token) => {
      /* ASKED OF parseToken RATHER THAN MATCHED HERE. The token format is
         decided in db.js and a second regex for it here is a second answer the
         day it changes -- which is the fault this whole file exists to stop
         one level up. */
      const t = parseToken(token);
      if (!t || t.mode !== "daily") return null;
      return CROSSWORDS.crossword_fr.load(env, t.id);
    },
    /* ELEVEN AT TEN, AND THE CLOCK BUYS NOTHING. finish only runs on a
       COMPLETE grid, so every entry is correct by the time this is asked --
       what is left to price is how many were revealed rather than solved, and
       fr-score.js says half. The owner's ruling, 22 September 2026.
       NO TIME PENALTY AT ALL, which is the substantive half of the difference:
       this game has no match clock to decay against, and inventing one here
       would be this file deciding a game rule instead of recording one. */
    score: ({ row, entries }) => ({
      score: boardScore(entries, row.srv_reveal_answers || 0, entries),
      total: FR_TOTAL,
    }),
    helpSeconds: () => 0,
    publicToStored: storedNo,
    lastNo: () => lastPublicNo(),
    archive: false,
  },
};

export const isCrossword = (game) => Object.hasOwn(CROSSWORDS, String(game || ""));

/* THE DEFAULT IS FOOTBALL'S, and only because the un-namespaced routes are
   football's. A handler reached through /api/crossword/<game>/ always has a
   game and must never fall back — a typo in the path resolving to the football
   crossword would serve the wrong game's board under the right game's address,
   which is the quietest possible failure. The namespaced route refuses instead;
   this constant is for the legacy files alone. */
export const LEGACY_GAME = "crossword";

/* The whole registry row, or null. Callers refuse on null rather than guessing:
   an unknown crossword is an unanswered question, not football's. */
export function crosswordOf(game) {
  return Object.hasOwn(CROSSWORDS, String(game || "")) ? CROSSWORDS[game] : null;
}
