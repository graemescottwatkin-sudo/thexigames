/* functions/_lib/qf-round.js — QuickFire XI's sitting: the clock, the marking
 * and the score. Every rule the browser is not allowed to decide.
 *
 * THE NUMBERS ARE NOT IN THIS FILE. They are in football/quickfire/js/config.js
 * — "every tunable in the game lives here and nowhere else" — and it is
 * IMPORTED rather than restated, the same way functions/_lib/season.js imports
 * shared/xi-season.js rather than carrying a second copy of the season rule.
 *
 * That matters more here than it usually would. The whole score is a function
 * of the decay bands; a server copy and a page copy would agree on the day they
 * were written and disagree the first time anybody tuned one, and the symptom
 * would be a player's score changing when they refreshed. There is exactly one
 * table of bands and both sides read it.
 *
 * THE CLOCK IS THE SERVER'S. A minute the client reports is a score the client
 * chooses. Codeword's session found the colourful version of this in its own
 * demo — the clock RATE was switchable mid-match, so flipping it rewound the
 * match and handed back seventeen minutes of decay for one click.
 */
import CONFIG from "../../football/quickfire/js/config.js";

export const BANDS = CONFIG.SCORE_BANDS;
export const PER_DAILY = CONFIG.QUESTIONS_PER_DAILY;
export const SUBS = CONFIG.SUBS_PER_DAILY;
export const SUB_PENALTY = CONFIG.SUB_POINT_PENALTY;
export const MATCH_MINUTES = CONFIG.MATCH_DURATION_MINUTES;
/* Real time for ONE question, which is what a match minute is measured in:
   the clock runs a question's worth of real seconds across the whole 90. */
export const QUESTION_MS = CONFIG.QUESTION_DURATION_MS;

/* THE WRONG-PICK PENALTY, READ FROM THE CONFIG RATHER THAN DECLARED HERE.
 *
 * It was declared here first — `export const WRONG_PICK_MINUTES = 5` — and that
 * was wrong for a reason worth writing down: config.js ALREADY had a
 * WRONG_GUESS_MINUTE_PENALTY, sitting at 0 because the typing game had no
 * concept of a wrong pick. So a second home was being built for a setting that
 * already had one, in the file whose own header says every tunable lives there
 * and nowhere else. Found by reading the client to rewrite it and seeing the
 * constant already in use.
 *
 * Ten is the owner's number, and it replaced a five that was reasoned from a
 * false premise: that eleven questions share one 90-minute clock, making 8.2
 * minutes a question's budget. They do not — each question has its own 0' to
 * 90' — so the budget is 90 and five minutes was 5.6% of a question, 1.67
 * seconds of real time, about a sixth of a band. Ten is exactly ONE BAND, which
 * is the only landmark on this curve that means anything: a wrong pick costs a
 * band, worth 3 to 15 points depending where the clock sits.
 *
 * It is CONFIGURATION because the bands are unequal — fifteen points between
 * the first two and three between the last two — so there is no
 * timing-independent right value and the only way anyone finds one is by
 * playing it and changing the line.
 *
 * THE NUMBER THAT WOULD SHOW THIS IS WRONG is not the penalty, it is whether
 * players finish at all. If rounds routinely run out of clock the fix is the
 * band widths or the duration, and the penalty will look innocent throughout. */
export const WRONG_PICK_MINUTES = CONFIG.WRONG_GUESS_MINUTE_PENALTY;

/* What a question is worth at a given match minute. The bands are a STEP
   function — "at or before this minute, this many points" — which is how the
   page has always read them, so this reads them the same way. */
export function pointsFor(minute) {
  for (const band of BANDS) if (minute <= band.maxMinute) return band.points;
  return 0;
}

/* THE MATCH MINUTE, from this server's own clock. Elapsed real time scaled to
   the match, plus whatever the player has spent on wrong picks.
 *
 * MEASURED FROM THE QUESTION, NOT FROM THE SITTING. Each question has its own
 * 0' to 90' and its own thirty seconds of real time; a fresh one starts at 0'
 * when the question is served. This read `round.started_ms` first, which is
 * when the SITTING kicked off — so question one would have scored, question
 * two would have landed at 99' worth nothing, and so would the nine after it.
 * An eleven-question game with at most one scoring question, reported by the
 * symptom as a scoring bug. `question_ms` is stamped when a question is served
 * and is what the whole score hangs off.
 *
 * `started_ms` is the fallback rather than an error because a round that has
 * not served a question yet is at 0' either way, and a clock that throws is a
 * clock that takes the page down over a question nobody has answered.
 *
 * CAPPED AT FULL TIME. Past 90' a question is worth nothing — that is the
 * bands' own shape — but the minute is STORED, and a row reading 4,000' is a
 * number nobody can read as "they left it open overnight". */
export function minuteOf(round, now) {
  const from = Number(round.question_ms) || Number(round.started_ms);
  const elapsed = Math.max(0, Number(now) - from);
  /* MULTIPLY BEFORE DIVIDING, and the honest note is that this fixes nothing
     observable. The obvious form divides by QUESTION_MS / MATCH_MINUTES, which
     is 333.333… — a repeating decimal — and a test did read 19' for twenty
     against it. But the test was wrong, not the code: its fixture computed an
     instant as perMinute * 20, a fractional millisecond a clock never produces.
     Checked rather than assumed — over every whole millisecond in three
     questions' worth, 0 to 90,000, the two forms disagree exactly nowhere.
     So this form is kept because it removes the question rather than because it
     answered one, and NO TEST GUARDS IT: a check here would pass against both
     spellings, which is a check that proves nothing. Said plainly so the next
     person does not go looking for the bug it reads like it fixed. */
  const spent = Math.floor((elapsed * MATCH_MINUTES) / QUESTION_MS)
    + (Number(round.penalty_minutes) || 0);
  return Math.min(MATCH_MINUTES, spent);
}

/* NORMALISED THE WAY THE IMPORTER NORMALISES, because a pick is compared to a
   stored answer and the two must agree about case and spacing. Aliases are not
   consulted: with four options there is nothing to spell, so a pick either IS
   one of the four strings or it is not a pick at all. */
export function norm(v) {
  return String(v == null ? "" : v).trim().toLowerCase().replace(/\s+/g, " ");
}

/* WAS THAT THE RIGHT ONE. The answer never leaves the server, so this is the
   only place the comparison can happen. A pick that is not one of the four
   offered is refused rather than marked wrong — it did not come from the page,
   and marking it would record a guess nobody made. */
export function judge(question, pick) {
  const options = [question.option_1, question.option_2, question.option_3, question.option_4];
  const offered = options.some((o) => norm(o) === norm(pick));
  if (!offered) return { offered: false, correct: false };
  return { offered: true, correct: norm(pick) === norm(question.answer) };
}

/* What a finished round scored: the sum of what each answer earned, less the
   substitutions. Stored per answer rather than recomputed — a re-derivation
   would use TODAY's bands, so the day anybody tunes one every past round would
   silently become a different round. */
export function totalFor(answers, subsUsed) {
  const earned = answers.reduce((a, r) => a + (Number(r.points) || 0), 0);
  return Math.max(0, earned - (Number(subsUsed) || 0) * SUB_PENALTY);
}
