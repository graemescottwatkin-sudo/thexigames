/* config.js — every tunable in Who Am I XI lives here and nowhere else.
   Change a number, reload the page, play again. No build step needed.

   THE CLUE LADDER IS CONFIGURATION, NOT STRUCTURE, and that is deliberate: the
   owner is play-testing what a substitution should buy, and a ladder baked into
   the endpoints would make every answer to that question a code change. The
   SERVER reads this file rather than keeping its own copy — the same way
   QuickFire's scoring bands are read by both sides — because a ladder the page
   drew from one table and the server charged from another would disagree the
   first time anybody tuned one.
*/
(function (root) {
  'use strict';

  var CONFIG = {
    /* --- The board ---------------------------------------------------- */
    DOORS_PER_BOARD: 11,           // core rule — an XI of clubs

    /* --- The clue ladder ------------------------------------------------
       Stage 1 is free and is what you get for opening a door. Each stage
       after it costs one substitution. `reveals` names what the server is
       allowed to send at that stage and nothing else may leave on its
       account — functions/_lib/wa-play.js reads these names.

       WHY THE CAREER IS STAGE 2 AND NOT STAGE 1. The career IS the answer:
       "Cobreloa, Udinese, Barcelona, Arsenal, Man United, Inter" is Sanchez to
       anyone who can read it. Stage 1 is one spell — the door's own club, its
       years and its appearances — which narrows without naming. */
    LADDER: [
      { stage: 1, cost: 0, label: 'The spell',    reveals: ['spell'] },
      { stage: 2, cost: 1, label: 'Full career',  reveals: ['career'] },
      { stage: 3, cost: 1, label: 'Age and country', reveals: ['bio'] },
      { stage: 4, cost: 1, label: 'Give up',      reveals: ['answer'] }
    ],

    /* Three substitutions buys stages 2, 3 and the reveal. Derived from the
       ladder rather than stated twice — change the ladder and this follows. */
    get SUBS_PER_BOARD() {
      return this.LADDER.reduce(function (a, s) { return a + s.cost; }, 0);
    },

    /* --- Guessing ------------------------------------------------------- */
    /* NAMING SOMEBODY WHO DID PLAY FOR THAT CLUB is its own outcome and costs
       nothing. It is a near miss rather than a mistake, and charging for it
       would punish the one kind of wrong answer that means the player has
       understood the door. Decided server-side: the alternative is handing the
       page the club's full roster, which is a candidate list. */
    WRONG_PLAYER_SAME_CLUB_COSTS_SUB: false,
    /* A plain wrong name costs nothing either — the substitutions are spent on
       CLUES, and the tension is how many you need rather than how many you
       waste. Set to true to test the other shape. */
    WRONG_GUESS_COSTS_SUB: false,

    /* --- The type-ahead -------------------------------------------------- */
    MIN_CHARS_TO_SEARCH: 2,        // below this, show nothing rather than 3,146
    MAX_SUGGESTIONS: 8,

    /* --- Storage --------------------------------------------------------- */
    // The namespace is PREFIX in game.js, which is where aligned_test reads it
    // from. This is the rest of the key, not a second copy of the prefix.
    STORAGE_KEY: 'daily.v1'
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  root.XIWA_CONFIG = CONFIG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
