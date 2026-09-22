/* functions/_lib/wa-registry.js — WHICH "WHO AM I" GAMES EXIST, and what differs.
 *
 * Football's Who Am I was the only one, so nothing in its endpoints ever had to
 * ask which game it was serving: wadata.js named wa_board in its SQL, wa-board.js
 * named it again, and the ladder came from one config.
 *
 * A second one now exists. The Friends deck hides a CARD rather than a
 * footballer and deals three written clues rather than revealing attributes, so
 * what the two share is not their data but the SHAPE of a board: eleven doors,
 * one answer each, clues bought in order, a guess judged against a list. That
 * shape is what the endpoints, wa_round and wa_guess are written against, and
 * it is why one server can serve both.
 *
 * WHAT GOES IN A ROW: where a game's boards live, how it prices a clue, and how
 * it reads a card. Not a rule both games obey — those stay in the endpoint,
 * because a rule written once per game is a rule that will eventually be
 * written differently.
 *
 * THE OLD ADDRESSES DO NOT MOVE. /api/whoami/daily is what every live football
 * client is calling, and it keeps working by delegating here with game
 * "whoami". The namespaced form /api/whoami/<game>/daily is how the second game
 * reaches the same code. One implementation, two addresses — the same shape the
 * crossword API took on 22 September and the hub took before it.
 */
import CONFIG from "../../football/whoami/js/config.js";
import * as footballData from "./wadata.js";
import * as friendsData from "./frwa-data.js";
import { scoreAt } from "./xi-score.js";

/* THE LADDER FOR A FRIENDS DOOR. Stage one is the round's first clue and is
   free; the next two cost 4 and 3, so a door solved on clue one, two or three
   is worth 10, 6 or 3. costToReach sums the points below a stage, which is why
   these are increments and not totals -- the same shape football's ladder uses,
   so wa-play.js's arithmetic is untouched. */
export const FR_LADDER = [
  { stage: 1, points: 0, sub: 0, label: "First clue",  reveals: ["clue"] },
  { stage: 2, points: 4, sub: 1, label: "Second clue", reveals: ["clue"] },
  { stage: 3, points: 3, sub: 2, label: "Third clue",  reveals: ["clue"] },
];

/* THE EXIT, WHICH IS NOT A RUNG -- the same distinction football's config draws
   and for the same reason. It is not priced: a card you were told the answer to
   scored nothing, which is an accounting rather than a penalty. */
export const FR_GIVE_UP = { label: "Tell me", reveals: ["answer"] };

/* ---- what a door is worth ------------------------------------------------
 *
 * TWO GAMES, TWO CURVES, AND THE DIFFERENCE IS NOT A CEILING.
 *
 * Football's door decays: scoreAt(minute) falls along the family's curve from
 * kick-off, and buying a clue deducts on top. A slow board is worth less than a
 * fast one even if nothing was bought.
 *
 * The Friends deck has no clock at all. Its rule is the one the deck itself
 * states -- solve on the first clue of a round for 3, the second for 2, the
 * third for 1 -- and the only thing that costs you is asking for the next clue.
 * Scaled to a door worth ten, that is 10 / 6 / 3, which keeps the deck's 3:2:1
 * and makes eleven doors total 110: the number ruled for the Friends crossword,
 * so the two games of this theme are scored out of the same thing.
 *
 * A TIME PENALTY WAS NOT ADDED, and that is deliberate rather than unfinished.
 * The deck is a party game read aloud; the pace is the table's, not the
 * player's, and a clock would be this file inventing a rule instead of
 * recording one.
 */
export const WHOAMIS = {
  whoami: {
    id: "whoami",
    /* EVERY TABLE THIS GAME OWNS, named once. wa-board.js and wa-play.js wrote
       these into their SQL directly, which was correct while there was one
       game and is a wrong answer the moment there are two. */
    tables: {
      board: "wa_board", door: "wa_door",
      round: "wa_round", guess: "wa_guess",
    },
    table: "wa_board",
    data: footballData,
    /* THE LADDER IS STILL football/whoami/js/config.js -- "every tunable lives
       here and nowhere else" -- and is NAMED here rather than copied, so the
       owner's play-testing still lands without a code change. */
    ladder: CONFIG.LADDER,
    giveUp: CONFIG.GIVE_UP,
    /* WHICH STORED VERDICT IS THE NEAR MISS. finishRound counts them out of
       rows written weeks ago, so the word is a fact about this game's data and
       not a branch in the counting. */
    nearVerdict: "right-club",
    doorMax: null,                       // the curve decides, not a constant
    scoreFor: (minute, spent) =>
      Math.max(0, Math.round(scoreAt(minute) - (Number(spent) || 0))),
  },

  whoami_fr: {
    id: "whoami_fr",
    tables: {
      board: "fr_wa_board", door: "fr_wa_door",
      /* ITS OWN ROUND AND GUESS TABLES, which is a correctness fix and not
         tidiness: wa_round carries no game, and wa-play.js resolves a round's
         answer by (play_date, slot). A Friends round in wa_round would be
         judged against FOOTBALL's door for that slot. See migration 044. */
      round: "fr_wa_round", guess: "fr_wa_guess",
    },
    table: "fr_wa_board",
    data: friendsData,
    ladder: FR_LADDER,
    giveUp: FR_GIVE_UP,
    nearVerdict: "other",
    doorMax: 10,
    /* NO MINUTE TERM. The argument is accepted and ignored so the two share one
       signature; ignoring it here is the rule, not an oversight. */
    scoreFor: (_minute, spent) =>
      Math.max(0, 10 - (Number(spent) || 0)),
  },
};

export const LEGACY_GAME = "whoami";

/* The whole row, or null. Callers refuse on null rather than guessing: an
   unknown game is an unanswered question, not football's. A typo in a path
   resolving to the football deck would serve one game's doors under another
   game's address, which is the quietest failure these endpoints could have. */
export function whoamiOf(game) {
  return Object.hasOwn(WHOAMIS, String(game || "")) ? WHOAMIS[game] : null;
}

export const isWhoami = (game) => !!whoamiOf(game);
