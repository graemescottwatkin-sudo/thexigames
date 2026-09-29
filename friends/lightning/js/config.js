/* config.js — every tunable in Lightning Round lives here and nowhere else.
 *
 * The SERVER imports this file (functions/_lib/lr-round.js) rather than
 * keeping a copy, QuickFire's rule: a page copy and a server copy agree on the
 * day they are written and disagree the first time anybody tunes one.
 *
 * The name is Ross's tie-breaker in S04E12: "Thirty seconds, all the questions
 * you can answer." We give ninety (the owner, 29 Sep 2026).
 */
(function (root) {
  'use strict';

  var CONFIG = {
    /* --- The clock ---------------------------------------------------- */
    /* NINETY SECONDS, and a miss costs about three of them in all: the one-second
       look below (the clock runs through it) and the two taken off. The
       owner, 29 Sep 2026, choosing "1s look, -2s penalty". */
    RUN_MS: 90000,                 // one run, in real time
    WRONG_PENALTY_MS: 2000,        // a wrong answer takes this off the clock
    /* A pick that left the page before zero can arrive just after it. This
       much lateness is forgiven; anything later is refused and not marked. */
    LATE_GRACE_MS: 750,

    /* --- Scoring ------------------------------------------------------ */
    POINTS_PER_CORRECT: 1,

    /* --- The deal ----------------------------------------------------- */
    FIRST_DIFF: 'Easy',            // every run opens on an easy one
    /* After the first, each question's difficulty is drawn with these
       weights (percent). */
    MIX: { Easy: 20, Medium: 50, Hard: 30 },
    /* Questions dealt per run. Far more than anyone answers in sixty seconds
       (a question a second and a half is forty); a run that uses them all
       ends early rather than wrapping. */
    RUN_LENGTH: 80,
    /* No subject (the bank's pgk) twice within this many questions, where the
       pool allows it. */
    SUBJECT_GAP: 4,
    /* Practice avoids the player's most recent this-many questions, and today's
       daily, falling back to the longest-ago seen when a difficulty runs dry. */
    RECENT_KEEP: 600,

    /* --- Pacing on the page ------------------------------------------- */
    RIGHT_PAUSE_MS: 300,           // the flash on a right answer
    /* LONG ENOUGH TO READ THE RIGHT ONE: a miss shows the pick in red and the
       correct option in green, straight away (the owner, 29 Sep 2026). The
       server's clock runs through this, so the look is part of the miss's cost. */
    WRONG_PAUSE_MS: 1000,

    /* --- Guarding the bank -------------------------------------------- */
    /* Runs started per caller per hour, per mode. Every answer is shown the
       moment it is given (the owner's call, 29 Sep 2026, reversing the hold to
       the end), so unlimited runs are a way to read the bank out; this caps it
       without getting in a real player's way. */
    PRACTICE_STARTS_PER_HOUR: 60,

    /* --- Storage ------------------------------------------------------ */
    STORAGE_PREFIX: 'xifl.'
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  root.LR_CONFIG = CONFIG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
