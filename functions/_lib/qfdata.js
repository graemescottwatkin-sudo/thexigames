/* functions/_lib/qfdata.js — QuickFire XI's only route to D1.
 *
 * Two rules this file exists to hold:
 *
 *  1. A board is served on its play date and not before. There is no fallback
 *     sample: an unbound binding must look like a broken game, not a working
 *     one with a handful of boards. That fallback is what let the word search
 *     run for weeks on sample data with every check green.
 *
 *  2. Nothing leaves here that the player is not entitled to today. A challenge
 *     link can only rebuild questions that have already been played, so a
 *     hand-crafted code cannot read tomorrow's board.
 */

export function hasDB(env) {
  return !!(env && env.DB);
}

/* THE FOUR OPTIONS ARE SELECTED, and the order they come back in IS the order
   they are shown — there is no stored position, because position is derivable
   from the rule the importer enforces: exactly one option equals `answer`.
   Storing it too would be a second statement of which button is correct, free
   to drift from the first.
   SELECTED ONLY BECAUSE THE IMPORTER NOW REFUSES A ROW THAT BREAKS THAT RULE.
   These columns existed in the schema from 13 September, written by nothing and
   read by nothing; selecting them before anything validated them would have
   served unvalidated options to players, which is worse than serving none — a
   player picks the right option and is told they are wrong. The order is
   importer first, reader second, and it is not interchangeable.
   A row mid-pivot has four NULLs here, which renders as no options rather than
   as four blank buttons. */
const QUESTION_COLUMNS = `
  q.id, q.answer, q.aliases, q.clue, q.answer_type, q.difficulty,
  q.option_1, q.option_2, q.option_3, q.option_4
`;

/* WHAT A BROWSER IS HANDED, AND WHAT IT IS NOT.
 *
 * THE ANSWER LEFT THIS RESPONSE ON 15 SEPTEMBER 2026. Until then every question
 * went out as {id, clue, answer, aliases, ...} — eleven answers a day, in plain
 * text, to anyone who typed curl. It was not a regression and it was nobody's
 * mistake: the game was a TYPING game, the page revealed letters out of
 * `answer` character by character, and it could not draw a board without it. So
 * the field was load-bearing for as long as the game worked that way.
 *
 * It stopped being load-bearing when the game became four options. There is
 * nothing to reveal and nothing to match per character; the page needs the
 * options and an id, and the marking happens on this side. Removing the field
 * before the client changed would have taken the game down — the two halves are
 * one change, which is why they are one commit.
 *
 * ALIASES GO TOO, and they were the quieter half. They exist only for matching
 * a typed answer, so they are useless to a four-option page and a list of ways
 * to spell the answer is a list of the answer.
 *
 * THE OPTIONS GO OUT IN THE BANK'S ORDER, which is deliberate and was checked
 * rather than assumed. The importer's comment says that order IS the
 * presentation and the only record of where the right answer sits — so if the
 * bank put the answer first every time, serving them in order would hand it
 * over by position. Counted against all 1,921 live rows: 492 at position one,
 * 485 at two, 479 at three, 465 at four, and ZERO with no matching option. Near
 * uniform, and the invariant holds on every row.
 */
/* EXPORTED FOR A TEST, which is a thing worth justifying rather than doing
   quietly. The partial-row rule — four options or none, never two buttons —
   cannot be proved by reading the source: a regex can see the guard and not
   whether it fires. A sabotage that removed it went unnoticed by a suite that
   only read the file, which is how the gap was found. So the function is
   exported and the rule is executed. */
export function shapeQuestion(row) { return shape(row); }

function shape(row) {
  const options = [row.option_1, row.option_2, row.option_3, row.option_4]
    .filter((o) => o !== null && o !== undefined && String(o).trim() !== "");
  return {
    id: row.id,
    clue: row.clue,
    /* Four, or none. A row mid-pivot renders as a question with no options
       rather than as four blank buttons, which is the importer's own rule about
       what a partial row means. */
    options: options.length === 4 ? options : [],
    answerType: row.answer_type,
    difficulty: row.difficulty || "medium",
  };
}

/* The three fields that must never reach a browser, named so a suite can
   assert against the list rather than restating it. `answer` is the answer,
   `aliases` is the answer spelled other ways, and `answer_norm` is what the
   server matches on. */
export const SECRET_FIELDS = ["answer", "aliases", "answer_norm"];

function split(rows) {
  const questions = [];
  const bench = [];
  for (const row of rows) {
    (row.role === "bench" ? bench : questions).push(shape(row));
  }
  return { questions, bench };
}

/* TODAY, IN UTC, FROM THE FAMILY'S OWN FUNCTION.
 *
 * It read Europe/London, and that was one game answering a question the whole
 * site already had an answer to. CLAUDE.md is explicit — "the SERVER decides
 * what day it is, in UTC" — and every other game, the permalink layer, the
 * sitemap and the archive all count from utcDay().
 *
 * THE COST WAS AN HOUR A NIGHT, ALL SUMMER, AND IT WAS LIVE. British Summer
 * Time is UTC+1, so between midnight and 1am London the two disagree: this
 * function said 15 September while the permalink layer said the 14th. The API
 * served board 21 and /football/quickfire/daily/21 answered 404 — the address
 * of the board the game was itself serving, refused as "not yet". Found by
 * curling both at 23:35 UTC, an hour that only exists to be missed.
 *
 * The visible change is that a new board now arrives at midnight UTC — 1am
 * London during BST — which is when every other game's does. One clock. */
/* IMPORTED AS WELL AS RE-EXPORTED, and the difference took a live game down.
 * A bare `export { x } from "./y.js"` forwards the name to importers WITHOUT
 * binding it in this module's own scope — so every call to today() inside this
 * file threw "today is not defined", and the daily endpoint answered 500.
 *
 * QuickFire ran like that in production from the moment the clock fix shipped.
 * The fix was right and the spelling was not, and I wrote the identical line in
 * two files an hour apart, then wrote a COMMENT in a third file explaining the
 * trap after Codeword's suites caught it there — and still did not come back
 * and check these two. Knowing a fault by name does not stop you shipping it.
 *
 * WHY NOTHING CAUGHT IT: no suite executes getDaily/getBoard. The round suites
 * read this file as TEXT, and the journey suites stub the endpoint out
 * entirely, so the one function that calls today() was never run. A module that
 * fails on import-time linkage passes every check that never imports it. */
import { utcDay } from "./daily.js";
export const today = utcDay;

export async function getDaily(env, date) {
  const play = date || today();
  const { results } = await env.DB.prepare(`
    SELECT ${QUESTION_COLUMNS}, s.role, s.slot, d.play_date
    FROM qf_daily d
    JOIN qf_daily_slot s ON s.play_date = d.play_date
    JOIN qf_question   q ON q.id = s.question_id
    WHERE d.play_date = ?1
      AND d.status = 'published'
      AND q.status  = 'verified'
    ORDER BY s.role DESC, s.slot
  `).bind(play).all();

  if (!results || !results.length) return null;
  const { questions, bench } = split(results);
  if (questions.length !== 11) return null;   // fail closed: never serve a short board
  return { id: "XIQF-" + play.replace(/-/g, ""), date: play, questions, bench };
}

/* The weekly round, if one is live. Shelf life is enforced here as well as in
   the client — a stale week must not be reachable by editing the page. */
export async function getWeek(env, shelfLifeDays = 10) {
  const { results } = await env.DB.prepare(`
    SELECT ${QUESTION_COLUMNS}, s.role, s.slot, w.week_ending, w.label
    FROM qf_week w
    JOIN qf_week_slot s ON s.week_ending = w.week_ending
    JOIN qf_question  q ON q.id = s.question_id
    WHERE w.status = 'published'
      AND q.status = 'verified'
      AND w.week_ending <= date('now')
      AND w.week_ending >= date('now', ?1)
    ORDER BY w.week_ending DESC, s.role DESC, s.slot
  `).bind(`-${shelfLifeDays} day`).all();

  if (!results || !results.length) return null;
  const weekEnding = results[0].week_ending;
  const rows = results.filter((r) => r.week_ending === weekEnding);
  const { questions, bench } = split(rows);
  if (questions.length !== 11) return null;
  return { weekEnding, label: rows[0].label || "The Last 7 Days", questions, bench };
}

/* Questions for a challenge link. Only ids that have already appeared on a
   board whose play date has passed, so a crafted code reads nothing early. */
export async function getPlayedQuestions(env, ids) {
  const clean = [...new Set(ids)].filter((n) => Number.isInteger(n)).slice(0, 32);
  if (!clean.length) return [];
  const marks = clean.map((_, i) => `?${i + 1}`).join(",");
  const { results } = await env.DB.prepare(`
    SELECT ${QUESTION_COLUMNS}
    FROM qf_question q
    WHERE q.id IN (${marks})
      AND q.status = 'verified'
      AND EXISTS (
        SELECT 1 FROM qf_daily_slot s
        JOIN qf_daily d ON d.play_date = s.play_date
        WHERE s.question_id = q.id
          AND d.status = 'published'
          AND d.play_date <= date('now')
      )
  `).bind(...clean).all();
  return (results || []).map(shape);
}

export function noStore(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
