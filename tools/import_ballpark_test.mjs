/* import_ballpark_test.mjs — the importer's guards, pinned.
 *
 * WHY THIS FILE EXISTS. Every guard in tools/import_ballpark.js was proved on
 * the evening of 13 September 2026 by sabotaging it by hand and watching it
 * refuse. That proves it worked that evening. It proves nothing about tomorrow,
 * and the session that did it is over.
 *
 * The Ballpark content side reached the same conclusion about its own freeze
 * boundary the same day and pinned it with a failing test. Their reasoning is
 * the reasoning here: a rule that three sessions read three ways will eventually
 * be "fixed" in the wrong direction, and the fix will look like a tidy-up.
 * Off-by-one boundaries always do.
 *
 * THE ONE THAT MATTERS MOST is the boundary. On 13 September the past was read
 * three ways by three sessions. Mine landed correct BY LUCK: carryForward keeps
 * days strictly before `--from`, and `--from` is tomorrow, so today is carried.
 * I did not choose that with a played board in mind. bp-0019 was today's board,
 * somebody opened a round on it at 12:48 UTC, and a boundary that stopped at
 * yesterday would have made it rebuildable.
 *
 *   node tools/import_ballpark_test.mjs        (from the repo root)
 */
import {
  carryForward, historyClash, contentClash, buildSchedule, scheduleFromSql,
  boardsFromSql, staleBoards,
} from "./import_ballpark.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0, skip = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* A calendar as the emitted SQL would hold it: one board a day from the epoch. */
const prev = {};
for (let i = 0; i < 19; i++) {
  const day = new Date(Date.parse("2026-08-26T00:00:00Z") + i * 86400000)
    .toISOString().slice(0, 10);
  prev[day] = `bp-${String(i + 1).padStart(4, "0")}`;
}
const TODAY = "2026-09-13";          // the day bp-0019 ran, and was played
const TOMORROW = "2026-09-14";

console.log("The boundary: where the past ends");
{
  /* THE CASE THAT WAS ARGUED THREE WAYS. Rebuilding from tomorrow must carry
     TODAY forward — today's board has been served, whether or not the calendar
     calls it "past". */
  const kept = carryForward(prev, TOMORROW);
  t("rebuilding from tomorrow carries TODAY forward",
    kept[TODAY] === "bp-0019", `${TODAY} -> ${kept[TODAY]}`);
  t("and every day before it", Object.keys(kept).length === 19,
    `${Object.keys(kept).length} days kept`);

  /* THE SABOTAGE, STATED AS A TEST. A boundary that stopped at yesterday — the
     "freeze 18, today is not past" reading — leaves today's board rebuildable.
     Written as an assertion about carryForward's contract rather than about a
     number, so it still means something when the dates have moved on. */
  const stoppedAtYesterday = carryForward(prev, TODAY);
  t("a boundary that stops at TODAY would drop today's board",
    stoppedAtYesterday[TODAY] === undefined && Object.keys(stoppedAtYesterday).length === 18,
    "this is the reading to refuse, asserted so a 'tidy-up' fails here");
}

console.log("\nA played day cannot be moved");
{
  const next = { ...prev, [TODAY]: "bp-9999" };
  const clashes = historyClash(prev, next, TOMORROW);
  t("a past day naming a different board is a clash",
    clashes.length === 1 && clashes[0].day === TODAY, JSON.stringify(clashes[0] || {}));

  const gone = { ...prev };
  delete gone["2026-09-08"];
  t("a past day with no board at all is the same lie by omission",
    historyClash(prev, gone, TOMORROW).some((c) => c.day === "2026-09-08" && c.now === null));

  t("a FUTURE day changing is not a clash",
    historyClash(prev, { ...prev, "2026-12-01": "bp-0500" }, TOMORROW).length === 0);
}

console.log("\nAn id keeping its place is not the board keeping its questions");
{
  /* The fault this was written for: bp-0014 and bp-0015 kept their ids through
     three reissues while six of eleven questions moved off each. */
  const was = { "bp-0014": JSON.stringify({ questions: ["a", "b"] }) };
  const now = { "bp-0014": JSON.stringify({ questions: ["a", "c"] }) };
  t("a served board whose questions changed is a clash",
    contentClash(was, now, ["bp-0014"]).length === 1);
  t("a served board that is unchanged is not",
    contentClash(was, was, ["bp-0014"]).length === 0);
  t("a served board gone from the bank is a clash",
    contentClash(was, {}, ["bp-0014"])[0]?.why === "gone from the bank");
  t("an UNserved board changing is not a clash",
    contentClash(was, now, []).length === 0,
    "only what was played is protected");
}

console.log("\nNothing the past already served is dealt a second time");
{
  /* Rebuilding from a day forward restarts the run at the first board. Without
     the guard, boards the carried-forward past already used are handed out
     again — bp-0014 played on 8 September and scheduled again for the 27th. */
  const boards = [];
  for (let i = 1; i <= 25; i++) boards.push({ id: `bp-${String(i).padStart(4, "0")}`, ordinal: i });
  const kept = carryForward(prev, TOMORROW);
  const sched = buildSchedule(boards, TOMORROW, kept);
  const counts = {};
  for (const id of Object.values(sched)) counts[id] = (counts[id] || 0) + 1;
  const twice = Object.entries(counts).filter(([, n]) => n > 1);
  t("no board is scheduled twice", twice.length === 0,
    twice.map(([id, n]) => `${id} x${n}`).join(", "));
  t("the carried-forward past keeps its boards",
    sched[TODAY] === "bp-0019" && sched["2026-08-26"] === "bp-0001");
  t("the rebuild starts on the --from day",
    sched[TOMORROW] === "bp-0020", `${TOMORROW} -> ${sched[TOMORROW]}`);
}

console.log("\nReading the previous calendar back out of the SQL");
{
  /* TWO DAYS IN DIFFERENT MONTHS, deliberately. A one-row fixture is matched by
     a regex narrowed to any single month, and that is not hypothetical: the
     August-only version of this fixture stayed green while the reader was
     sabotaged to see six schedule rows out of 175. Only the real-dump block
     below caught it, and that block skips in CI, so CI was covered by nothing.
     A fixture that cannot disagree is not evidence. */
  const sql = [
    "DELETE FROM bp_schedule;",
    "INSERT OR REPLACE INTO bp_board (id, ordinal, payload, updated_at) VALUES ('bp-0001', 1, '{\"q\":[\"O''Shea\"]}', '2026-09-08T23:58:36.756Z');",
    "INSERT OR REPLACE INTO bp_board (id, ordinal, payload, updated_at) VALUES ('bp-0019', 19, '{\"q\":[]}', '2026-09-08T23:58:36.756Z');",
    "INSERT INTO bp_schedule (day, board_id) VALUES ('2026-08-26', 'bp-0001');",
    "INSERT INTO bp_schedule (day, board_id) VALUES ('2026-09-13', 'bp-0019');",
  ].join("\n");
  const days = scheduleFromSql(sql), boards = boardsFromSql(sql);
  t("every schedule row is recovered, whatever month it falls in",
    days["2026-08-26"] === "bp-0001" && days["2026-09-13"] === "bp-0019"
      && Object.keys(days).length === 2, JSON.stringify(days));
  t("every board payload is recovered", Object.keys(boards).length === 2);
  t("a doubled quote in a payload comes back single",
    boards["bp-0001"] === '{"q":["O\'Shea"]}', boards["bp-0001"]);
  t("an empty file yields an empty calendar, not a crash",
    Object.keys(scheduleFromSql("")).length === 0);
}

console.log("\nAgainst what the tool ITSELF wrote");
{
  /* THE FIXTURES ABOVE ARE HAND-WRITTEN BY THE SAME HAND AS THE REGEXES, so
     they could not have disagreed. This block reads the real emitted file when
     one is beside the checkout, which is the only comparison here with two
     independent sides: the emitter writes it, the readers parse it.
     The file is gitignored (it carries answers), so CI has nothing to read and
     this SKIPS there — counted as a skip, never as a pass. */
  const path = new URL("../data/bp-production.sql", import.meta.url);
  let sql = null;
  try { sql = readFileSync(path, "utf8"); } catch { /* not on this machine */ }
  if (sql === null) {
    skip += 3;
    console.log("  skip  no data/bp-production.sql beside the checkout (expected in CI)");
  } else {
    const days = scheduleFromSql(sql), boards = boardsFromSql(sql);
    const emitted = (sql.match(/INSERT INTO bp_schedule/g) || []).length;
    const written = (sql.match(/INSERT OR REPLACE INTO bp_board/g) || []).length;
    t("every schedule row the emitter wrote is read back",
      Object.keys(days).length === emitted, `${Object.keys(days).length} of ${emitted}`);
    t("every board row the emitter wrote is read back",
      Object.keys(boards).length === written, `${Object.keys(boards).length} of ${written}`);
    /* The unescape path, which the hand fixture never exercises: payloads are
       JSON and footballers are called O'Shea, so '' appears in real rows and a
       reader that left it doubled would compare unequal against a fresh
       stringify and report a content clash on a board nobody touched. */
    const doubled = Object.values(boards).filter((p) => p.includes("''")).length;
    const parses = Object.values(boards).every((p) => { try { JSON.parse(p); return true; } catch { return false; } });
    t("payload quotes are unescaped and every payload parses as JSON",
      doubled === 0 && parses, `${doubled} still doubled`);
  }
}

console.log("\nA generated script has a shelf life");
{
  /* WHAT THIS IS FOR. Every other check in the importer runs at GENERATION
     time, and all of them passed on a script that was exactly right when it was
     written. The freeze boundary then moves on its own at the next UTC midnight
     whether or not anybody regenerates, so the window between generating and
     applying is where a correct script rots — and nothing in the file says how
     old it is except a timestamp nobody compares to the calendar.

     On the night this was written two sessions asserted the day had rolled when
     it had not, twice in ten minutes, each reasoning from how long the exchange
     had FELT rather than reading date -u. It cost nothing because it erred
     toward caution; the same misread the other way applies a stale script and
     rewrites a board that is being served. Which is why this is code. */
  const sql = [
    "INSERT OR REPLACE INTO bp_board (id, ordinal, payload, updated_at) VALUES ('bp-0020', 20, '{\"q\":[]}', '2026-09-13T23:50:19.729Z');",
    "INSERT OR REPLACE INTO bp_board (id, ordinal, payload, updated_at) VALUES ('bp-0021', 21, '{\"q\":[]}', '2026-09-13T23:50:19.729Z');",
    "-- bp-0019 FROZEN: served and played, left exactly as D1 holds it.",
    "INSERT INTO bp_schedule (day, board_id) VALUES ('2026-09-13', 'bp-0019');",
    "INSERT INTO bp_schedule (day, board_id) VALUES ('2026-09-14', 'bp-0020');",
    "INSERT INTO bp_schedule (day, board_id) VALUES ('2026-09-15', 'bp-0021');",
  ].join("\n");

  t("on its generation day the script is fresh",
    staleBoards(sql, "2026-09-13").length === 0);
  /* THE CASE THAT ACTUALLY HAPPENED, one midnight later. */
  const day1 = staleBoards(sql, "2026-09-14");
  t("one day later it would rewrite the board now being served",
    day1.length === 1 && day1[0].id === "bp-0020" && day1[0].day === "2026-09-14",
    JSON.stringify(day1));
  t("two days later, two of them",
    staleBoards(sql, "2026-09-15").length === 2);
  /* A FROZEN BOARD IS NOT A STALENESS COMPLAINT. bp-0019 sits on a day long
     past, but the script only NAMES it in a comment and never writes it, so it
     must not be reported — otherwise every script is stale the moment it has a
     history to carry, the check fires always, and a check that always fires is
     switched off within a week. */
  t("a frozen board on a past day is not stale — it is not written at all",
    !staleBoards(sql, "2026-09-20").some((s) => s.id === "bp-0019"),
    "the marker is a comment, not an INSERT");
  t("and the check is not vacuous on that same script",
    staleBoards(sql, "2026-09-20").length === 2, "bp-0020 and bp-0021 still caught");
  /* The rule is derived from the script and the clock alone, so it holds on a
     file it has never seen. Run against the real applied dump when present. */
  try {
    const real = readFileSync(new URL("../data/bp-production.sql", import.meta.url), "utf8");
    const fresh = staleBoards(real, "2026-09-13");
    const rotted = staleBoards(real, "2026-09-30");
    t("on the real applied dump: fresh on its own day, stale a fortnight on",
      fresh.length === 0 && rotted.length > 0, `${rotted.length} board(s) would be trampled`);
  } catch {
    skip++;
    console.log("  skip  no data/bp-production.sql beside the checkout (expected in CI)");
  }
}

console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ""}`);
if (fail) process.exit(1);
