/* functions/_lib/qf-sets.js — which QuickFire game is which.
 *
 * QUICKFIRE XI AND QUICKFIRE XI: FRIENDS ARE ONE ENGINE (the owner, 30 Sep
 * 2026: add QuickFire XI: Friends "the way Lightning Round was added", reusing
 * the football engine). Each game is a SET: its own tables, so neither can
 * read, answer or overwrite the other's rows -- football's and Friends' bank
 * ids collide (EVT0002 is in both), and qf_question's id is the primary key --
 * and its own rules where the owner ruled them different. Everything that
 * touches a QuickFire table asks this file which one, the way Who Am I's two
 * games ask wa-registry.js and Scrambled's two ask sc-board.js's SETS.
 *
 * THE TABLE NAMES ARE BUILT FROM A CONSTANT HERE, NEVER FROM A REQUEST. A set is
 * chosen by the route file that serves it (functions/api/quickfire/* is
 * football, functions/api/quickfire_fr/* is Friends), so no player-supplied
 * string ever reaches a table name.
 */

/* THE SIX, EXEMPT FOR FRIENDS ONLY (the owner, 30 Sep 2026: "yes and yes", to
   "Let the six main names repeat for Friends only (43 -> 64 days)?"). From two
   board rules and no others: a clue may name one of them while another
   question answers it, and one of them may answer again inside a week. A
   clue that says "Rachel" says nothing about WHICH Rachel question is being
   asked, and almost every Friends clue names one of the six -- with the rules
   as they stood the calendar ran 43 days. "No answer twice on one board" still
   holds for them: that is a different rule and nobody relaxed it. Matched on
   the importer's own normalised answer, so "Rachel" is exempt and "Rachel
   Green" is not. */
const FRIENDS_SIX = ["Rachel", "Monica", "Phoebe", "Joey", "Chandler", "Ross"];

export const QF_SETS = {
  quickfire: {
    game: "quickfire", pre: "qf_", sql: "qf-production.sql", weeks: true, exemptAnswers: [],
  },
  quickfire_fr: {
    game: "quickfire_fr", pre: "fr_qf_", sql: "fr-qf-production.sql", weeks: false, exemptAnswers: FRIENDS_SIX,
  },
};

/* The football set is the default everywhere, so every caller that predates
   Friends reads exactly what it always read. */
export const FOOTBALL = QF_SETS.quickfire;

/* A set by game id, or a refusal: an unknown id falling back to football would
   be a Friends route quietly serving football's tables. */
export function qfSet(game) {
  const s = QF_SETS[game];
  if (!s) throw new Error("No QuickFire set for " + JSON.stringify(game));
  return s;
}

/* One table of a set: qfTable(set, "daily") is "qf_daily" or "fr_qf_daily". */
export function qfTable(set, name) {
  return (set || FOOTBALL).pre + name;
}
