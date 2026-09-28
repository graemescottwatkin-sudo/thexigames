/* config.js — every tunable in Lightning Round lives here and nowhere else.
 *
 * The SERVER imports this file (functions/_lib/lr-round.js) rather than
 * keeping a copy, QuickFire's rule: a page copy and a server copy agree on the
 * day they are written and disagree the first time anybody tunes one.
 *
 * The name is Ross's tie-breaker in S04E12: "Thirty seconds, all the questions
 * you can answer." We give sixty.
 */
(function (root) {
  'use strict';

  var CONFIG = {
    /* --- The clock ---------------------------------------------------- */
    RUN_MS: 60000,                 // one run, in real time
    WRONG_PENALTY_MS: 3000,        // a wrong answer takes this off the clock
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
    RIGHT_PAUSE_MS: 220,           // the flash on a right answer
    /* Longer than a right one so the miss registers, and short: the answer
       is not shown until the end, so there is nothing to read. */
    WRONG_PAUSE_MS: 450,

    /* --- Guarding the bank -------------------------------------------- */
    /* Runs started per caller per hour, per mode. Answers are held back until
       a run ends, but the end-of-run review still names every one missed, so
       unlimited runs are a slow way to read the bank out; this caps it without
       getting in a real player's way. */
    PRACTICE_STARTS_PER_HOUR: 60,

    /* --- Storage ------------------------------------------------------ */
    STORAGE_PREFIX: 'xifl.'
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  root.LR_CONFIG = CONFIG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
