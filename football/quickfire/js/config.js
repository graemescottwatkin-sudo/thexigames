/* config.js — every tunable in the game lives here and nowhere else.
   Change a number, reload the page, play again. No build step needed.
*/
(function (root) {
  'use strict';

  var CONFIG = {
    /* --- Match clock ------------------------------------------------- */
    QUESTION_DURATION_MS: 30000,   // real time for one question
    MATCH_DURATION_MINUTES: 90,    // in-game minutes covered by that time
    PAUSE_ON_TAB_HIDDEN: true,     // stop the clock if the player switches app

    /* --- Weekly ------------------------------------------------------ */
    // How long after its week ends the topical round stays playable. Past this
    // it is hidden rather than served stale, because a seven-day quiz that is a
    // month old is just wrong.
    WEEKLY_SHELF_LIFE_DAYS: 10,

    /* --- Daily ------------------------------------------------------- */
    QUESTIONS_PER_DAILY: 11,       // core rule — an XI of questions
    INTER_QUESTION_MS: 1400,       // pause on the GOAL / FULL TIME card

    /* --- Reveal ------------------------------------------------------ */
    // Fraction of revealable characters visible from each match minute onward.
    // The engine never reveals the final character before 90', so Full Time
    // always leaves something unsaid.
    REVEAL_CHECKPOINTS: [
      { minute: 15, fraction: 0.15 },
      { minute: 30, fraction: 0.32 },
      { minute: 45, fraction: 0.50 },
      { minute: 60, fraction: 0.65 },
      { minute: 75, fraction: 0.80 }
    ],

    /* --- Scoring ----------------------------------------------------- */
    // Points for a correct answer at or before each match minute. A question
    // plays 90 minutes in 30 real seconds, so a minute is a third of a second.
    // THE OWNER'S BANDS, 26 Sep 2026: "10 = upto 12 seconds, 7 = upto 20
    // seconds, 4 = any time" -- 12s is 36', 20s is 60', and 89' is the last
    // minute before the whistle. Eleven questions at 10 is 110, and the bonus
    // below makes 114, the family's total.
    SCORE_BANDS: [
      { maxMinute: 36, points: 10 },
      { maxMinute: 60, points: 7 },
      { maxMinute: 89, points: 4 }
    ],

    // All eleven answered correctly, at any speed: the owner, 26 Sep 2026,
    // "bonus 4 for getting all 11 correct regardless of time taken". A question
    // that was passed counts by its replacement.
    ALL_CORRECT_BONUS: 4,

    /* ROUNDS PLAYED BEFORE 27 SEP 2026 were scored out of 1100 -- 100 points
       down to 36 a question, 20 a pass -- and their per-answer points are
       stored, so they are recognised by them (any answer worth more than the
       top band above) and totalled and shown on their own terms, never
       re-scored. */
    LEGACY_SCORING: { max: 1100, subPenalty: 20 },

    // Off by default, as specified. Set either to a positive number to test
    // whether a cost on wrong guesses restores the guess/wait tension.
    WRONG_GUESS_POINT_PENALTY: 0,   // points deducted per wrong guess
    /* TEN MATCH MINUTES PER WRONG PICK, the owner's number, set on 15 Sep 2026
       when the game became four options. It was 0 for the typing game, which
       had no concept of a wrong pick — a wrong guess cleared the cells and you
       typed again. With four options a blind pick is a free 25% unless being
       wrong costs more than thinking does.

       IT WAS VERY NEARLY 5, AND 5 CAME FROM A FALSE PREMISE. The case put for
       five was that eleven questions share a 90-minute clock, making 8.2
       minutes a question's budget and five minutes 61% of it. The clock is per
       QUESTION — each has its own 0' to 90', worth thirty seconds of real time
       — so the budget is 90, not 8.2, and five minutes is 5.6% of a question
       and 1.67 seconds of real time. Correct arithmetic about the wrong noun.
       Ten is 11% of a question, 3.3 real seconds, and — the reason it is ten
       rather than any other number — EXACTLY ONE BAND. A wrong pick costs a
       band, which is a sentence a player can feel and a designer can reason
       about, worth between 3 and 15 points depending where the clock sits.

       MINUTES AND NOT POINTS because the clock already punishes hesitation, so
       a points penalty punishes twice; a time penalty moves you down the same
       curve as everything else and costs more the earlier you were.

       AND IT LIVES HERE SO IT CAN BE MOVED. Because the bands are unequal —
       fifteen points between the first two and three between the last two —
       there is no timing-independent right value, so the only way anyone finds
       one is by playing it and changing this line. The SERVER reads this file
       rather than keeping its own copy. Nothing on the page reads it at all any
       more: the penalty is charged in functions/_lib/qf-play.js and the page is
       TOLD how many minutes went, which is why setting it no longer has to wait
       for anything.

       THE NUMBER THAT WOULD SHOW THIS IS WRONG is not the penalty, it is
       whether players finish at all. If rounds routinely run out of clock the
       fix is the band widths or the duration, and the penalty will look
       innocent throughout. */
    /* 0 SINCE 26 SEP 2026, BECAUSE THE 10 NEVER COST ANYTHING. A wrong pick
       ends its question -- one answer per question, qf_answer's primary key --
       and the minutes were added after it was scored, then cleared when the
       next question was served. So the page said "10 minutes gone" and nothing
       went. A wrong answer scores 0, which is the whole cost. */
    WRONG_GUESS_MINUTE_PENALTY: 0,   // match minutes added per wrong pick

    // What survives on the board after a wrong guess:
    //   'correct-positions' keep every character that's in the right place and
    //                       clear the rest, so you only retype the gaps.
    //   'all'               keep everything, cursor stays put.
    //   'none'              clear everything you typed.
    // Note: with wrong guesses free, 'correct-positions' can be farmed — type
    // the same letter into every gap and the board confirms where it belongs.
    // Pair it with a wrong-guess penalty if that shows up in play.
    WRONG_GUESS_KEEP: 'correct-positions',

    // If the clock reveals the very cell the player was mid-keystroke on, their
    // letter would otherwise land one cell late and knock the rest out of step.
    // For this long after a reveal, a keystroke that matches a just-revealed
    // character and does not match the next gap is treated as already served.
    // Set to 0 to turn the grace off.
    REVEAL_GRACE_MS: 900,

    /* --- Substitutions ------------------------------------------------ */
    // Passing swaps the question for a fresh one off the bench, back at 0'.
    // The bench is fixed and shared, so everyone plays the same possible pool.
    SUBS_PER_DAILY: 3,
    // The owner, 26 Sep 2026: a pass costs no points, only one of the three.
    SUB_POINT_PENALTY: 0,          // deducted from the running total per sub
    SUB_MIN_MINUTE: 0,             // raise this to stop instant rerolling

    /* --- Storage ----------------------------------------------------- */
    // The namespace is PREFIX in game.js, which is where aligned_test reads it
    // from. This is the rest of the key, not a second copy of the prefix.
    STORAGE_KEY: 'daily.v1',

    /* --- Testing ----------------------------------------------------- */
    // Instrumentation only — records the minute the player started typing the
    // answer that won the question, so typing lag can be measured against the
    // scoring bands. Does not affect the score.
    RECORD_FIRST_KEYSTROKE: true
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  root.QFX_CONFIG = CONFIG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
