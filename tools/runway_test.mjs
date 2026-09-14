/* runway_test.mjs — the runway check, watched failing before it is trusted.
 *
 *   node tools/runway_test.mjs        (from the repo root)
 *
 * THE POINT OF THIS FILE is condition three of the check's own design: it has
 * been SEEN TO FAIL. A check nobody has watched go red might be returning ok
 * unconditionally, and this project has found six that were. Every case below
 * that matters is a case where the check must refuse, and the truncated-schedule
 * case is the one the whole thing exists for.
 *
 * The database is stubbed and the stub re-applies the real behaviour rather than
 * rubber-stamping — a stub that answered whatever was convenient would prove the
 * test and not the code. What a stub CANNOT prove is the SQL itself; that runs
 * against production when the tool is run for real, and the shape of the query
 * is pinned here only insofar as the stub answers the same questions in the same
 * order.
 */
import { dateColumn, daysLeft, verdict, readRunway } from "./runway_check.mjs";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const TODAY = "2026-09-14";

/* A database that answers the three questions the tool asks, from a fixture of
   { table: { column, last, rows } }. It implements the real rules: a table with
   no recognised date column has none, and MAX over no rows is null. */
const stub = (tables) => (sql) => {
  if (sql.includes("sqlite_master")) {
    return Object.keys(tables)
      .filter((n) => n.endsWith("_schedule") || n === "qf_daily")
      .sort().map((name) => ({ name }));
  }
  const m = sql.match(/PRAGMA table_info\((\w+)\)/);
  if (m) return (tables[m[1]].columns || []).map((name) => ({ name }));
  const q = sql.match(/FROM (\w+)$/);
  const t2 = tables[q[1]];
  return [{ last: t2.last ?? null, days_published: t2.rows ?? 0 }];
};

console.log("Days remaining, in UTC");
t("a board fourteen days out is fourteen days out", daysLeft("2026-09-28", TODAY) === 14);
t("today is zero, not one", daysLeft(TODAY, TODAY) === 0);
t("yesterday is negative", daysLeft("2026-09-13", TODAY) === -1);
t("across a month boundary", daysLeft("2026-10-01", TODAY) === 17);
t("nonsense is null rather than NaN", daysLeft("not-a-date", TODAY) === null);

console.log("\nThe day column is asked of the table, not assumed");
t("hl/bp/gd/ws use day", dateColumn(["day", "board_id"]) === "day");
t("qf_daily uses play_date", dateColumn(["play_date", "status"]) === "play_date");
t("a table with neither is refused, not guessed",
  dateColumn(["when", "board_id"]) === null);

console.log("\nThe judgement");
{
  const rows = [
    { game: "ws", table: "ws_schedule", last: "2027-12-31", days: 473 },
    { game: "bp", table: "bp_schedule", last: "2027-03-21", days: 188 },
    { game: "qf", table: "qf_daily", last: "2026-10-31", days: 47 },
  ];
  const v = verdict(rows, TODAY, 14);
  t("three healthy games pass", v.ok && v.short === 0);
  t("and are ordered nearest-first", v.lines.map((l) => l.game).join() === "qf,bp,ws",
    v.lines.map((l) => l.game).join());
}

console.log("\nTHE CASE IT EXISTS FOR: a schedule truncated to yesterday");
{
  const rows = [
    { game: "ws", table: "ws_schedule", last: "2027-12-31", days: 473 },
    { game: "qf", table: "qf_daily", last: "2026-09-13", days: -1 },
  ];
  const v = verdict(rows, TODAY, 14);
  t("it REFUSES", !v.ok && v.short === 1);
  t("and says the game is expired rather than merely short",
    v.lines[0].state === "EXPIRED", v.lines[0].state);
  t("and says what a player gets, which is the whole problem",
    /same 404 as a day before launch/.test(v.lines[0].note));
  t("the healthy game is still reported ok beside it",
    v.lines.find((l) => l.game === "ws").state === "ok");
}

console.log("\nThe threshold");
{
  const at = verdict([{ game: "x", table: "x_schedule", last: "2026-09-28", days: 14 }], TODAY, 14);
  t("exactly on the threshold is SHORT, not ok", !at.ok && at.lines[0].state === "SHORT",
    "at 14 days with a 14-day threshold, the warning has one day of use left");
  const over = verdict([{ game: "x", table: "x_schedule", last: "2026-09-29", days: 15 }], TODAY, 14);
  t("one day past it is ok", over.ok);
}

console.log("\nA walk that finds nothing has not found everything healthy");
{
  const v = verdict([], TODAY, 14);
  t("no scheduled games at all is REFUSED", !v.ok && v.foundNone);
  /* This is the fault that put fifty-six suites behind nothing for a day: a
     check narrowed until it found no problems because it could no longer see
     any. Asserted so the refusal cannot be tidied into a pass. */
  t("and it is not reported as all clear", v.short === 0 && !v.ok,
    "zero problems and zero coverage are the same output and must not be");
}

console.log("\nAn unreadable table is a fault, not an absence");
{
  const v = verdict([{ game: "x", table: "x_schedule", last: null, days: null }], TODAY, 14);
  t("a table with no day column REFUSES", !v.ok && v.unreadable === 1);
  t("and is not silently skipped", v.lines[0].state === "UNREADABLE");
}

console.log("\nThe list is derived from the database, and ring games are not in it");
{
  const rows = readRunway(stub({
    hl_schedule: { columns: ["day", "board_id"], last: "2026-11-28", rows: 87 },
    qf_daily:    { columns: ["play_date", "status"], last: "2026-10-31", rows: 47 },
    /* Ring games have no schedule table at all — there is nothing to add here
       to represent crossword, scrambled or vowels, and that is the point. The
       tables below exist in the real database and must NOT be picked up. */
    sc_board:    { columns: ["id"], last: null, rows: 908 },
    clues:       { columns: ["id"], last: null, rows: 3406 },
  }));
  t("only the schedule tables are read", rows.map((r) => r.table).join() === "hl_schedule,qf_daily",
    rows.map((r) => r.table).join());
  t("ring games cannot appear as 0 days left because they never appear",
    !rows.some((r) => r.game === "scrambled" || r.game === "crossword" || r.game === "vowels"));
  t("the game name comes off the table name", rows.map((r) => r.game).join() === "hl,qf");
  t("qf_daily is read even though it is not named _schedule",
    rows.some((r) => r.table === "qf_daily" && r.last === "2026-10-31"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
