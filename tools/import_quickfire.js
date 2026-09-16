#!/usr/bin/env node
/* tools/import_quickfire.js — turns the private question bank into SQL for D1.
 *
 *   node tools/import_quickfire.js --source ../quickfirexi-source
 *
 * OUTPUT data/qf-production.sql   gitignored: it contains every answer.
 *
 *   npx wrangler d1 execute crosswordxi --remote --file=data/qf-production.sql
 *
 * The same shape as import_clues.js and import_wordsearch.js, for the same
 * reason: the bank lives OUTSIDE this repository — not ignored, absent — and
 * reaches the database through wrangler rather than through a deploy. Nothing
 * about a question is edited on the live site.
 *
 * SOURCE ../quickfirexi-source/bank.json
 * {
 *   "questions": [
 *     { "id": 1, "answer": "Everton", "aliases": [],
 *       "clue": "Club nicknamed The Toffees", "source": "https://…",
 *       "answerType": "club", "difficulty": "easy" }
 *   ],
 *   "dailies": [ { "date": "2026-09-01", "questionIds": [ …11… ],
 *                  "benchIds": [ …3… ] } ],
 *   "weeks":   [ { "weekEnding": "2026-08-30", "label": "The Last 7 Days",
 *                  "questionIds": [ …11… ], "benchIds": [ …3… ],
 *                  "themes": [ …11… ] } ]
 * }
 *
 * VALIDATION IS NOT OPTIONAL. This writes nothing if a board would be unfair or
 * unplayable, because the alternative is finding out at 8am from a player. Every
 * rule below is one the export gate already held; they live here now because
 * here is where a bad board can still be stopped.
 */
import fs from "node:fs";
import path from "node:path";
/* THE GAME'S NUMBERS ARE THE GAME'S, and this file used to keep its own copies.
 * qf-round.js already says why, for the server: "every tunable in the game
 * lives here and nowhere else", imported rather than restated, because a second
 * copy agrees on the day it is written and disagrees the first time anybody
 * tunes one. The importer was the second copy nobody had noticed — PER_BOARD =
 * 11 and BENCH = 3 as literals, while the page and the server both read
 * config.js.
 *
 * Nothing had drifted. The cost was that it could, in one direction and
 * silently: lowering SUBS_PER_DAILY to 2 would give players two substitutions
 * while this file went on demanding three-question benches, and nothing
 * anywhere compares the two. The importer would have kept refusing boards that
 * matched the game.
 *
 * Found 16 Sep 2026 while asking why the bench is what ends the calendar. It is
 * — at every bank size measured, the build stops for want of a bench and never
 * for want of an eleven — and that is a real finding about the BANK. It should
 * not also have been a number this file was free to be wrong about. */
import CONFIG from "../football/quickfire/js/config.js";

const argIdx = process.argv.indexOf("--source");
const SRC = argIdx > -1 ? process.argv[argIdx + 1] : "../quickfirexi-source";
const OUT = path.join(process.cwd(), "data", "qf-production.sql");

/* THE TWO RULES ABOUT REPETITION, AND THEY ARE NOT THE SAME RULE.
 *
 * A QUESTION may never be asked twice. That is absolute, has no window, and is
 * new on 14 September 2026 — nothing enforced it before. The history check
 * below is keyed on the ANSWER, so until today the only thing stopping the
 * same question appearing on two boards was that its answer would trip the
 * 90-day window: prevention by accident, and a feed that reused a question
 * outside 90 days imported clean.
 *
 * AN ANSWER may recur after a week, because an answer repeating is only
 * something a player notices if the QUESTION repeats. "Liverpool" answering a
 * transfer question in September and a stadium question in October is two
 * different questions and one familiar word. The old window treated the answer
 * string as the unit of novelty when the question is the unit a player
 * actually experiences, and it cost 21 boards — 47 to 31 October against 68 to
 * 21 November at the shorter window, measured on the live pool rather than
 * argued. It also created a shortage it was then blamed on: running
 * indefinitely needs 990 distinct answers at 90 days and 154 at 14, against
 * 524 held.
 *
 * 7 AND 14 MEASURE IDENTICALLY, so the number is an editorial call about how
 * soon a word may come round again, not a capacity one. Seven, by the owner's
 * decision: "7 days as long as it's a different question" — which is the pair
 * of rules below in his words, and is why the question rule arrives in the same
 * change rather than after it. Dropping the 90 without it would have left the
 * importer weaker than it was. */
const LOOKBACK_DAYS = 7;    // an ANSWER must not reappear inside this window
const MAX_CHARS = 16;       // past this the answer row wraps on a phone
const PER_BOARD = CONFIG.QUESTIONS_PER_DAILY;   // an XI of questions
const BENCH = CONFIG.SUBS_PER_DAILY;            // one bench question per substitution

/* A REFUSAL RATHER THAN A DEFAULT. `undefined` reaching the checks below would
   compare false against every length and refuse all 77 boards with a message
   about the wrong thing. If config.js is ever restructured this names the field
   that moved. */
for (const [name, value] of [["QUESTIONS_PER_DAILY", PER_BOARD], ["SUBS_PER_DAILY", BENCH]]) {
  if (!Number.isInteger(value) || value < 1) {
    console.error(`REFUSED: CONFIG.${name} is ${JSON.stringify(value)}, not a positive whole number.`);
    console.error("  football/quickfire/js/config.js is where the game's tunables live, and this");
    console.error("  importer reads them rather than keeping a copy. Nothing was written.");
    process.exit(2);
  }
}

const bankPath = path.join(SRC, "bank.json");
if (!fs.existsSync(bankPath)) {
  console.error(`\nNo bank at ${bankPath}\n` +
    `The source folder is deliberately not in this repository. Point --source at it.\n`);
  process.exit(1);
}
const bank = JSON.parse(fs.readFileSync(bankPath, "utf8"));
const questions = bank.questions || [];
const dailies = bank.dailies || [];
const weeks = bank.weeks || [];

/* ------------------------------------------------------------- helpers --- */

const q = (v) => (v === null || v === undefined || v === ""
  ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'");

const norm = (s) => String(s ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/['’.]/g, "").replace(/[-–—]/g, " ")
  .replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

const typeable = (s) => String(s).replace(/[^\p{L}\p{N}]/gu, "").length;
const words = (s) => String(s).trim().split(/\s+/).length;

const byId = new Map(questions.map((x) => [x.id, x]));
const problems = [];
const fault = (m) => problems.push(m);

/* ------------------------------------------------------------ questions -- */

const seenIds = new Set();
for (const x of questions) {
  const at = `question ${x.id} (${x.answer || "no answer"})`;
  /* THE BANK'S OWN ID, AS A STRING. It was checked as a whole number against a
     column typed INTEGER, and 1,829 of 1,924 rows are V30288 or PL0708 — so the
     check and the column together rejected nearly the whole bank. Migration 035
     makes the column TEXT, which is what 022's own comment always said it held.
     Everything outside this database keys on that string; minting an integer
     beside it would make the real id a non-key column. */
  if (typeof x.id !== "string" || !x.id.trim()) {
    fault(`${at}: id must be a non-empty string — the bank's own id`);
  }
  if (seenIds.has(x.id)) fault(`${at}: duplicate id`);
  seenIds.add(x.id);
  if (!x.answer || !String(x.answer).trim()) fault(`${at}: no answer`);
  if (!x.clue || !String(x.clue).trim()) fault(`${at}: no clue`);
  /* Every claim traceable to a named source. The crossword's rule, and the
     reason its bank can be re-checked years later. */
  if (!x.source || !String(x.source).trim()) fault(`${at}: no source`);
  const chars = typeable(x.answer || "");
  /* THE CEILING STAYS, THE FLOOR GOES. They were one check and they are not one
     rule: MAX_CHARS is about LAYOUT — "past this the answer row wraps on a
     phone" — and an option has to fit a phone exactly as a typed answer did.
     The floor was about TYPING, and nothing is typed under four options. It was
     rejecting ten live rows whose answers are Law, Son, Low and QPR, none of
     which is a defect under any presentation. Measured before removing: 0 of
     the 1,924 eligible rows exceed 16 typeable characters and the longest is
     15, so the ceiling blocks nothing today — but it has a live reason to stay
     and one character of margin, so it will start biting on rows added later.
     That will be a layout question, not a rule to delete. */
  if (chars > MAX_CHARS) {
    fault(`${at}: ${chars} typeable characters, the board holds at most ${MAX_CHARS}`);
  }
  /* THE ALIAS-LENGTH RULE IS GONE, and it was never doing the job it named.
     It refused any alias whose typeable length differed from the answer's, on
     the reasoning that a different length can never be entered. Across 1,939
     validated rows there are 812 aliases and NOT ONE matches its answer's
     length — 344 longer, 468 shorter — because an alias exists precisely when a
     form was shortened. A filter with a 100% rejection rate is indistinguishable
     from a field nobody uses, which is why it went unnoticed for so long, and
     it absorbed 0 of the 116 rows where the bank's answer and D1's disagree,
     which is the one job it might plausibly have been doing.
     It is also blocking a fix rather than merely sitting there: two answer
     strings each cover two different people — "Ronaldo" across 13 rows
     (Cristiano and Nazario), "Ramsey" across 2 (Alf and Aaron) — and the agreed
     repair is an alias on 15 of them. Every one faults this rule, and a fault
     writes no file at all, so the repair would have refused the whole import
     and blamed the bank. */
  if (norm(x.clue || "").includes(norm(x.answer || ""))) {
    fault(`${at}: the clue contains its own answer`);
  }
  /* THE FOUR OPTIONS, AND THE ONE RULE THAT MAKES THEM SAFE TO SERVE.
   *
   * Exactly one option must equal the answer. Until now that sentence lived in
   * migration 022's comment and nowhere in code — the columns have been in the
   * database since 13 September and are written by nothing and read by nothing.
   * A rule stated only in a comment is a rule the next import ignores.
   *
   * COMPARED AGAINST THE SAME SOURCE THE ANSWER CAME FROM, which is the whole
   * of it: `x.answer` on this row, not a lookup elsewhere. Crossword XI found
   * 116 rows where the bank's answer string and D1's disagree — bank "Man Utd",
   * D1 "Manchester United". Build the options from one source and check them
   * against another and a player picks the right option and is told they are
   * wrong, on roughly one question in eleven. It reads as a broken game rather
   * than a data problem, and nothing in the pipeline reports it.
   *
   * POSITION IS NOT STORED, DELIBERATELY. It is derivable from this rule, and a
   * stored copy is a second statement of which option is correct that can drift
   * from the first. That is the same fault one table over.
   *
   * FOUR OPTIONS ARE NOW REQUIRED, not optional. They were optional while the
   * columns were nullable and the bank was mid-pivot; migration 035 made them
   * NOT NULL, so a row without them is no longer a row this database can hold.
   * It is refused HERE rather than left to SQLite, because a constraint that
   * fires during `wrangler d1 execute` fails partway through a file with no
   * useful line and nothing gated — the whole point of this tool is that a bad
   * bank writes no file at all. */
  const opts = [x.option_1, x.option_2, x.option_3, x.option_4];
  const present = opts.filter((o) => o !== undefined && o !== null && String(o).trim() !== "");
  if (present.length !== 4) {
    fault(`${at}: ${present.length} options, and every question needs four`);
  } else if (new Set(present.map((o) => norm(String(o)))).size !== 4) {
    fault(`${at}: two options are the same, so one right answer has two buttons`);
  } else if (present.filter((o) => norm(String(o)) === norm(x.answer || "")).length !== 1) {
    /* Only ever 0 in practice — two options equal to the answer are equal to
       each other and the duplicate check above catches them first. Stated as
       "exactly one" anyway, because that is the rule, and because the check
       above is free to change. */
    fault(`${at}: no option equals the answer, and exactly one must`);
  }
}

/* --------------------------------------------------------------- boards -- */

function checkBoard(label, ids, benchIds, history, asked) {
  const all = [...ids, ...benchIds].map((id) => byId.get(id));
  if (ids.length !== PER_BOARD) fault(`${label}: ${ids.length} questions, expected ${PER_BOARD}`);
  if (benchIds.length !== BENCH) fault(`${label}: ${benchIds.length} subs, expected ${BENCH}`);

  for (const [i, id] of [...ids, ...benchIds].entries()) {
    if (!byId.has(id)) fault(`${label}: slot ${i + 1} names unknown question ${id}`);
  }
  const present = all.filter(Boolean);

  const answers = present.map((x) => norm(x.answer));
  const seen = new Set();
  for (const a of answers) {
    if (seen.has(a)) fault(`${label}: the answer "${a}" appears twice on the board`);
    seen.add(a);
  }

  for (const x of present) {
    for (const other of present) {
      if (other.id === x.id) continue;
      if (norm(x.clue).includes(norm(other.answer))) {
        fault(`${label}: the clue for ${x.answer} names another answer on the board (${other.answer})`);
      }
    }
  }

  /* THE QUESTION RULE. No window: a question asked on any earlier board may
     not be asked again, whatever the gap and whatever its answer. Scoped to
     the main eleven of the DAILIES, which is exactly the scope the answer
     history has always had — a bench question is only seen if a player spends
     a substitution on it, and the weekly boards are checked with no history at
     all. Whether a weekly board may re-ask a daily's question is a real
     question and NOT ANSWERED HERE: there is no bank on this machine to
     measure the overlap against, and a rule written without the data to test
     it is how a legitimate board gets refused at eight in the morning. */
  if (asked) {
    for (const x of present.slice(0, PER_BOARD)) {
      const before = asked.get(x.id);
      if (before) fault(`${label}: question ${x.id} was already asked on ${before}`);
    }
  }

  if (history) {
    for (const x of present.slice(0, PER_BOARD)) {
      const last = history.get(norm(x.answer));
      if (!last) continue;
      const gap = Math.round((Date.parse(label) - Date.parse(last)) / 86400000);
      if (gap > 0 && gap < LOOKBACK_DAYS) {
        fault(`${label}: ${x.answer} was used ${gap} days ago (${last}), inside the ${LOOKBACK_DAYS}-day lookback`);
      }
    }
  }
}

const history = new Map();
const asked = new Map();
for (const d of [...dailies].sort((a, b) => (a.date < b.date ? -1 : 1))) {
  checkBoard(d.date, d.questionIds || [], d.benchIds || [], history, asked);
  for (const id of d.questionIds || []) {
    const x = byId.get(id);
    if (x) history.set(norm(x.answer), d.date);
    /* Recorded whether or not the question resolved: an id that names nothing
       is already a fault above, and leaving it out here would let the same
       unknown id be repeated without a second complaint. */
    if (!asked.has(id)) asked.set(id, d.date);
  }
}
for (const w of weeks) {
  checkBoard(w.weekEnding, w.questionIds || [], w.benchIds || [], null, null);
}

if (problems.length) {
  console.error(`\nNothing written. ${problems.length} problem(s):\n`);
  for (const p of problems) console.error("  - " + p);
  console.error("");
  process.exit(1);
}

/* ------------------------------------------------------------------ SQL -- */

const out = [
  "-- Generated by tools/import_quickfire.js. Contains answers: never commit.",
  "DELETE FROM qf_daily_slot;",
  "DELETE FROM qf_week_slot;",
  "DELETE FROM qf_daily;",
  "DELETE FROM qf_week;",
  "DELETE FROM qf_question;",
];

for (const x of questions) {
  const chars = typeable(x.answer);
  /* The options are written in the order the bank gives them. That order IS the
     presentation, and it is the only record of where the right answer sits — so
     a row emitted here and a row read back must agree without anything storing
     a position. A row with no options writes four NULLs and is invisible to the
     reader's filter until it has them. */
  /* No NULL branch: the gate above refuses a row that does not carry four, and
     the column is NOT NULL, so emitting NULL here could only ever produce SQL
     that fails halfway through an import. q() would turn "" into NULL of its
     own accord, which is why the string is passed through String() first — a
     helper that quietly nulls an empty value is the wrong helper for a required
     column. */
  const opt = (v) => q(String(v));
  out.push("INSERT INTO qf_question (id, answer, answer_norm, answer_type, aliases, " +
    "clue, source, difficulty, char_count, word_count, status, origin, verified_at, " +
    "option_1, option_2, option_3, option_4) VALUES (" +
    [q(x.id), q(x.answer), q(norm(x.answer)), q(x.answerType || "unknown"),
     q((x.aliases || []).join("|")), q(x.clue), q(x.source),
     q(x.difficulty || "medium"), chars, words(x.answer),
     "'verified'", q(x.origin || "authored"), "datetime('now')",
     opt(x.option_1), opt(x.option_2), opt(x.option_3), opt(x.option_4)].join(", ") + ");");
}

for (const d of dailies) {
  out.push(`INSERT INTO qf_daily (play_date, status) VALUES (${q(d.date)}, 'published');`);
  (d.questionIds || []).forEach((id, i) => {
    out.push("INSERT INTO qf_daily_slot (play_date, slot, question_id, role) VALUES (" +
      `${q(d.date)}, ${i + 1}, ${q(id)}, 'xi');`);
  });
  (d.benchIds || []).forEach((id, i) => {
    out.push("INSERT INTO qf_daily_slot (play_date, slot, question_id, role) VALUES (" +
      `${q(d.date)}, ${i + 1}, ${q(id)}, 'bench');`);
  });
}

for (const w of weeks) {
  out.push("INSERT INTO qf_week (week_ending, label, status) VALUES (" +
    `${q(w.weekEnding)}, ${q(w.label || "The Last 7 Days")}, 'published');`);
  (w.questionIds || []).forEach((id, i) => {
    out.push("INSERT INTO qf_week_slot (week_ending, slot, question_id, role, theme) VALUES (" +
      `${q(w.weekEnding)}, ${i + 1}, ${q(id)}, 'xi', ${q((w.themes || [])[i])});`);
  });
  (w.benchIds || []).forEach((id, i) => {
    out.push("INSERT INTO qf_week_slot (week_ending, slot, question_id, role, theme) VALUES (" +
      `${q(w.weekEnding)}, ${i + 1}, ${q(id)}, 'bench', NULL);`);
  });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
/* ---- THE DAYS THAT HAVE BEEN SERVED ---------------------------------------
 *
 * This wipes five tables and rewrites them — qf_daily, qf_daily_slot, qf_week,
 * qf_week_slot, qf_question — and until now nothing stopped it rewriting a day
 * a player had already been shown. QuickFire has been live since 2026-09-14.
 *
 * QuickFire's exposure is NOT Who Am I's. There is no --from here and no
 * re-dating: the dates come from the source bank, so a day cannot slide. What
 * can happen is quieter — the bank is edited, a past daily's questions change
 * or the date disappears from `dailies`, and the import rewrites history with
 * no flag involved and nothing to notice it. A player who answered eleven
 * questions on Tuesday finds Tuesday holding a different eleven.
 *
 * Both halves, as in import_grid.js and import_whoami.mjs: a served day that
 * VANISHES and a served day that CHANGES are both "the archive now lies", and
 * neither implies the other.
 *
 * The comparison is against the last SQL this importer emitted, which is the
 * only record of the calendar outside the database. --rewrite-history overrides
 * it, loudly, because a guard with no override meets the case where the
 * override was right and then gets deleted in a hurry by whoever is blocked. */
/* NAMED FOR THE FAMILY'S RULE, NOT FOR THIS FILE'S SHAPE, and that is the whole
   reason it is a function rather than a loop.
   This was written inline. It worked, it was tested, and a grep for
   `servedClash` across tools/ returned nothing for QuickFire — so the check that
   proves this importer is guarded reported that it was not. The monorepo session
   only found it by reading the file after their own grep came back empty.
   A guard that cannot be found by the name everybody searches for is a guard the
   next person concludes is missing, and the fix after that conclusion is to add
   a second one. import_hilo.js and import_whoami.mjs answer to this name; so
   does this now. */
function servedClash(prev, next, today) {
  const out = [];
  for (const day of Object.keys(prev || {}).sort()) {
    if (day > today) continue;
    const was = prev[day], now = (next || {})[day];
    if (!now) { out.push(`${day}: served ${was.length} slots, and this import has no daily for it at all`); continue; }
    if (now.length !== was.length) { out.push(`${day}: ${was.length} slots served, ${now.length} now`); continue; }
    /* EVERY DIFFERING SLOT, NOT THE FIRST. This broke on the first difference,
       which is right for deciding IF a day clashes and wrong for saying WHAT
       clashes — and the two are not separable, because the message is the only
       thing a human reads before deciding whether to override.
       It cost a near miss: a real refusal reported "bench slot 2" on three days
       where 8, 8 and 10 of the 11 XI slots had changed. The operator measured
       the cost as nil, passed --rewrite-history, and only caught it by diffing
       the SQL by hand afterwards. Six questions somebody had answered would have
       been removed from the day they answered them.
       A refusal that under-reports its own scope is worse than a terse one: the
       override gets sized against the report. */
    const xi = [], bench = [];
    for (let i = 0; i < was.length; i++) {
      if (was[i].qid !== now[i].qid || was[i].role !== now[i].role || was[i].slot !== now[i].slot) {
        (was[i].role === "bench" ? bench : xi).push(
          `${was[i].role} slot ${was[i].slot}: ${was[i].qid} -> ${now[i].qid}`);
      }
    }
    if (!xi.length && !bench.length) continue;
    const nXi = was.filter((r) => r.role !== "bench").length;
    const nBench = was.length - nXi;
    const parts = [];
    if (xi.length) parts.push(`${xi.length} of ${nXi} XI slots`);
    if (bench.length) parts.push(`${bench.length} of ${nBench} bench slots`);
    out.push(`${day}: ${parts.join(", ")} change — ` + [...xi, ...bench].slice(0, 3).join("; ") +
      (xi.length + bench.length > 3 ? `; and ${xi.length + bench.length - 3} more` : ""));
  }
  return out;
}

let WOULD_CLASH = false;

function servedCalendarFromSql(sql) {
  const cal = {};
  const re = /INSERT INTO qf_daily_slot \(play_date, slot, question_id, role\) VALUES \('([^']+)', (\d+), '((?:[^']|'')*)', '([a-z]+)'\)/g;
  let m;
  while ((m = re.exec(sql))) {
    const [, day, slot, qid, role] = m;
    (cal[day] = cal[day] || []).push({ slot: Number(slot), qid: qid.replace(/''/g, "'"), role });
  }
  for (const day of Object.keys(cal)) {
    cal[day].sort((a, b) => (a.role === b.role ? a.slot - b.slot : a.role < b.role ? -1 : 1));
  }
  return cal;
}

{
  const todayKey = new Date().toISOString().slice(0, 10);
  const previous = fs.existsSync(OUT) ? servedCalendarFromSql(fs.readFileSync(OUT, "utf8")) : {};
  const next = {};
  for (const d of dailies) {
    const rows = [];
    (d.questionIds || []).forEach((id, i) => rows.push({ slot: i + 1, qid: String(id), role: "xi" }));
    (d.benchIds || []).forEach((id, i) => rows.push({ slot: i + 1, qid: String(id), role: "bench" }));
    rows.sort((a, b) => (a.role === b.role ? a.slot - b.slot : a.role < b.role ? -1 : 1));
    next[d.date] = rows;
  }

  const clashes = servedClash(previous, next, todayKey);

  if (clashes.length && !process.argv.includes("--rewrite-history")) {
    console.error(`REFUSED: ${clashes.length} day(s) at or before today would change.`);
    console.error("  Those questions have been served. Changing one shows the right date over the");
    console.error("  wrong board, and anybody's result for that day stops meaning what it meant.");
    console.error("  THIS CANNOT PRICE IT FOR YOU: whether a changed question was actually");
    console.error("  ANSWERED lives in the results tables, which this importer never reads. The");
    console.error("  counts below are the scope, not the cost. Check the results before deciding.");
    for (const c of clashes.slice(0, 8)) console.error("  x " + c);
    if (clashes.length > 8) console.error(`  ...and ${clashes.length - 8} more`);
    console.error("  If you really mean to rewrite what people have played: --rewrite-history");
    process.exit(1);
  }
  WOULD_CLASH = clashes.length > 0;
  if (clashes.length) {
    console.warn(`REWRITING HISTORY because --rewrite-history was passed: ${clashes.length} served day(s) change.`);
  }
}

/* AN OVERRIDE MUST NOT DESTROY THE RECORD IT OVERRODE.
 *
 * The guard's only memory of what was served is the last SQL this importer
 * emitted. Under --rewrite-history that file was overwritten with the very
 * calendar the guard had just refused — so the NEXT run compared against the
 * rewritten version, found no clash, and would have applied in silence.
 *
 * A guard whose memory is the file a refused run overwrites can be disarmed by
 * refusing once and running again. That is not a hypothetical: the operator
 * found it by restoring the previous file by hand, out of caution, and noticing
 * that if they had not, the next run would have gone through clean.
 *
 * So an override writes ALONGSIDE rather than over. The record survives, a
 * later bare run still refuses, and putting the new file in its place is a
 * deliberate act taken after the import has actually been applied — which is
 * the only moment at which the new calendar IS what was served. */
const REWROTE = process.argv.includes("--rewrite-history") && WOULD_CLASH;
const TARGET = REWROTE ? OUT.replace(/(\.sql)?$/, ".rewritten$1") : OUT;
fs.writeFileSync(TARGET, out.join("\n") + "\n");
if (REWROTE) {
  console.warn(`  ${OUT} is UNCHANGED and still records what was served.`);
  console.warn(`  Apply the file just written, then move it over that one — not before.`);
}

const distinct = new Set(questions.map((x) => norm(x.answer))).size;
console.log(`Wrote ${OUT}`);
console.log(`  ${questions.length} questions, ${distinct} distinct answers`);
console.log(`  ${dailies.length} boards, ${weeks.length} weekly rounds`);
console.log(`  ${Math.floor(distinct / PER_BOARD)} days before an answer must repeat ` +
  `(the ${LOOKBACK_DAYS}-day rule needs ${LOOKBACK_DAYS * PER_BOARD})`);
console.log(`\nImport with:\n  npx wrangler d1 execute crosswordxi --remote --file=data/qf-production.sql\n`);
