#!/usr/bin/env node
/* runway_check.mjs — how many days of published boards each scheduled game has
 * left, and a refusal when one is nearly out.
 *
 *   node tools/runway_check.mjs                 report, exit 1 if any game is short
 *   node tools/runway_check.mjs --days 30       a different threshold
 *   node tools/runway_check.mjs --report        never exit non-zero
 *
 * WHY THIS EXISTS. On 14 September 2026 QuickFire XI's calendar ran to 25
 * October and nothing anywhere would have said so. The endpoint answers
 *
 *     {"error":"no board published for today","date":"...","source":"d1"}
 *
 * on a day past the end of the runway — and that is the SAME response, byte for
 * byte, as a day legitimately before the first board. The message is honest and
 * it is indistinguishable from silent expiry. A game can therefore run out in
 * front of players while every check in this repository stays green, because
 * every check asks whether the code works and none asks whether there is
 * anything left to serve.
 *
 * THE THRESHOLD IS 14 DAYS, one number across every game to begin with. Per-game
 * thresholds are a later refinement once there is evidence of how often this
 * fires; one number that works now beats five that are guesses. Wordsearch at
 * 473 days left and QuickFire at 47 will diverge, and that divergence is the
 * evidence to tune on.
 *
 * THREE THINGS MAKE IT A CHECK RATHER THAN A COMFORT, and each is here because
 * this project has been bitten by its absence:
 *
 *   1. THE GAME LIST IS DERIVED, NOT WRITTEN DOWN. It is read from
 *      sqlite_master — every table whose name ends _schedule, plus QuickFire's
 *      qf_daily, which is the same thing under a different name. A hardcoded
 *      roster goes stale the day a seventh game ships, and that has happened
 *      here already: a check held three folder names, two stopped resolving
 *      after the theme move, and it kept reporting a pass over what it could
 *      still find. Fifty-six suites were covered by nothing for a day.
 *
 *   2. A RING GAME IS NOT A GAME WITH NO DAYS LEFT. Crossword, Scrambled and
 *      Vowels derive the board from the date — 1..today, no schedule table, no
 *      end to reach. They cannot expire and they must never be reported as
 *      "0 days left", which is the obvious way to write this wrong: the same
 *      output, the opposite meaning, and the alarming one is the wrong one.
 *      They are absent from sqlite_master's _schedule tables, so deriving the
 *      list is also what keeps them out — the two requirements are one
 *      mechanism rather than two.
 *
 *   3. IT HAS BEEN SEEN TO FAIL. tools/runway_test.mjs runs the judgement
 *      against a schedule truncated to yesterday and watches it go red. A check
 *      nobody has watched fail is a check that might be returning ok
 *      unconditionally, and this project has found six of those.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it does not look at whether TODAY has a
 * board. A gap in the middle of a calendar is a different fault with a different
 * cause, and a check that reports two things reports neither clearly. This one
 * answers "when does it end".
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const THRESHOLD = Number(arg("days", 14));
const REPORT_ONLY = process.argv.includes("--report");

/* ---------------------------------------------------------------- pure --- */

/* Which column holds the day. The family is not consistent about this and
   pretending otherwise would mean a list: hl_schedule, bp_schedule, gd_schedule
   and ws_schedule all use `day`, QuickFire's qf_daily uses `play_date`. Asked of
   the table rather than assumed, so a seventh game naming it either way works
   and a game naming it something else is REFUSED rather than skipped — an
   unreadable table is a fault, not an absence. */
export function dateColumn(columns) {
  for (const want of ["day", "play_date"]) {
    if (columns.includes(want)) return want;
  }
  return null;
}

/* Whole days from today to the last published board, in UTC.
   Both arguments are YYYY-MM-DD strings and are compared as dates rather than
   as text: string comparison would be correct for ordering and useless for
   "how many days", which is the number the threshold needs. */
export function daysLeft(last, today) {
  const a = Date.parse(last + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

/* The judgement. Rows are { game, table, last, days } and come from the
   database; today and the threshold come from the caller so a suite can pin
   both. Returns every game with its verdict, and whether anything is short —
   the caller decides what to do about it. */
export function verdict(rows, today, threshold) {
  const lines = [];
  let short = 0, unreadable = 0;
  for (const r of [...rows].sort((a, b) => (a.days ?? -1) - (b.days ?? -1))) {
    if (r.last === null || r.days === null) {
      unreadable++;
      lines.push({ ...r, state: "UNREADABLE",
        note: "no day column, or no rows — this table cannot answer the question" });
      continue;
    }
    if (r.days < 0) {
      short++;
      lines.push({ ...r, state: "EXPIRED",
        note: `ran out ${-r.days} day(s) ago — a player asking today gets the ` +
              `same 404 as a day before launch` });
      continue;
    }
    if (r.days <= threshold) {
      short++;
      lines.push({ ...r, state: "SHORT", note: `${r.days} day(s) left` });
      continue;
    }
    lines.push({ ...r, state: "ok", note: `${r.days} day(s) left` });
  }
  /* A WALK THAT FINDS NOTHING FINDS NO PROBLEMS. If no scheduled game is
     discovered at all, that is this check having stopped working rather than
     every game being healthy — the exact shape of the folder-name fault above.
     Refused rather than reported clean. */
  const foundNone = rows.length === 0;
  return { lines, short, unreadable, foundNone,
           ok: !foundNone && short === 0 && unreadable === 0 };
}

/* ------------------------------------------------------------ the wire --- */

/* --command, NOT --file, AND THE DIFFERENCE IS NOT COSMETIC.
 *
 * `wrangler d1 execute --file=x.sql --json` returns wrangler's own SUMMARY as
 * its results — [{"Total queries executed":1,"Rows read":138,...}] — not the
 * rows the SELECT produced. `--command` returns the rows. Reaching for --file
 * to dodge shell quoting therefore reads a progress report as data, and it only
 * announced itself here because the summary has no `name` key and the next line
 * threw. Had the shapes happened to overlap, this check would have run green
 * over a number it invented. Do not switch back.
 *
 * Which leaves the shell, and it is unavoidable: npx is npx.cmd on Windows,
 * execFileSync cannot find bare "npx" (ENOENT), and Node 20+ refuses to spawn a
 * .cmd without a shell (EINVAL). The SQL is safe to pass through one because it
 * carries no backslashes — that is why the table match is substr rather than
 * LIKE ... ESCAPE. Keep it that way: a backslash here has three layers to
 * survive and did not survive two of them during development.
 */
function d1(sql) {
  const out = execFileSync(
    `npx --yes wrangler d1 execute crosswordxi --remote --json --command "${sql}"`,
    { encoding: "utf8", maxBuffer: 1 << 24, shell: true });
  const start = out.indexOf("[");
  if (start < 0) throw new Error("no JSON in wrangler output:\n" + out.slice(0, 400));
  const parsed = JSON.parse(out.slice(start))[0];
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new Error("wrangler returned no results array — was this --file?");
  }
  return parsed.results;
}

export function readRunway(query) {
  /* DERIVED. Every _schedule table, plus qf_daily — QuickFire's schedule under
     a name that predates the convention. Named here because it is a fact about
     one game rather than a pattern, and left as the only exception on purpose:
     a second exception would mean the convention is not one. */
  /* substr rather than LIKE '%\_schedule' ESCAPE '\'. The underscore is a
     single-character wildcard in LIKE, so matching it literally needs an escape
     — and an escaped backslash has to survive a JS string, a file write and
     SQLite's own parser. Three layers, and it took two of them to break it
     during development. substr(name, -9) has no escaping at all and says the
     same thing more plainly. */
  const tables = query(
    "SELECT name FROM sqlite_master WHERE type='table' " +
    "AND (substr(name, -9) = '_schedule' OR name = 'qf_daily') ORDER BY name"
  ).map((r) => r.name);

  const rows = [];
  for (const table of tables) {
    const cols = query(`PRAGMA table_info(${table})`).map((c) => c.name);
    const col = dateColumn(cols);
    const game = table.replace(/_schedule$|_daily$/, "");
    if (!col) { rows.push({ game, table, last: null, days: null }); continue; }
    const r = query(`SELECT MAX(${col}) AS last, COUNT(*) AS days_published FROM ${table}`)[0];
    rows.push({ game, table, last: r.last ?? null, published: r.days_published,
                days: r.last ? daysLeft(r.last, todayUTC()) : null });
  }
  return rows;
}

export const todayUTC = () => new Date().toISOString().slice(0, 10);

function main() {
  const today = todayUTC();
  const rows = readRunway(d1);
  const v = verdict(rows, today, THRESHOLD);

  console.log(`\nRunway as at ${today} (UTC), threshold ${THRESHOLD} days\n`);
  for (const l of v.lines) {
    const mark = l.state === "ok" ? "  ok  " : `${l.state.padEnd(6)}`;
    console.log(`${mark}${l.game.padEnd(12)}${String(l.last ?? "—").padEnd(13)}${l.note}`);
  }
  /* Said out loud, because a reader counting six games and seeing five listed
     should not have to work out which is missing and why. */
  console.log(`\n${v.lines.length} scheduled game(s). Ring games derive the board ` +
    `from the date and cannot expire, so they are not listed and that is correct.`);

  if (v.foundNone) {
    console.error("\nREFUSED: no scheduled game found at all. That is this check " +
      "having stopped working, not every game being healthy.");
    process.exit(REPORT_ONLY ? 0 : 1);
  }
  if (v.ok) { console.log("\nAll clear.\n"); return; }
  console.error(`\n${v.short} game(s) at or under ${THRESHOLD} days` +
    (v.unreadable ? `, ${v.unreadable} unreadable` : "") +
    ". Regenerate before the runway ends: a day past it is indistinguishable " +
    "from a day before launch.\n");
  process.exit(REPORT_ONLY ? 0 : 1);
}

const isMain = process.argv[1] && process.argv[1].endsWith("runway_check.mjs");
if (isMain) main();
