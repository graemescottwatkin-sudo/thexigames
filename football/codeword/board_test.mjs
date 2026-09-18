/* codeword/board_test.mjs — what may leave the database, and what may be asked
 * for.
 *
 * TWO RULES, AND THE SECOND ONE REPLACED A PROPERTY RATHER THAN ADDING TO IT.
 * The daily endpoint shipped with no board number at all, on the reasoning that
 * a parameter which must be checked against the future forever is a check that
 * can eventually be got wrong, and no parameter cannot. The owner's standard is
 * a daily board plus the boards that have gone, so the past had to open — and
 * the producing side held me to my own argument: the property I was protecting
 * is now gone, and what replaces it is a bound that has to keep being right.
 *
 * So the boundary case below is TOMORROW, not a board far in the future. A
 * board a year away is refused by almost any bug; the board that becomes
 * reachable tomorrow is the one an off-by-one serves, and it is the one that
 * breaks first if the epoch moves again — which it has done three times in a
 * day.
 */
import fs from "node:fs";
import {
  publicBoard, leaksSolution, boardByNo, boardByFamilyNo, boardForDay, absentLetters, cipherGrid,
} from "../../functions/_lib/cw-board.js";
import { scoreAt, outcome, confirmSlots, wrongNumbers, letterFor, validRate, minuteOf } from "../../functions/_lib/cw-round.js";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const CODE = {};
"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((L, i) => { CODE[L] = i + 1; });
const board = (no, day) => ({
  no, day, size: 3,
  rows: ["CAT", "ARE", "TEN"],
  words: [["CAT", 0, 0, "a"], ["ARE", 1, 0, "a"], ["TEN", 2, 0, "a"], ["CAT", 0, 0, "d"]],
  code: CODE, given: ["C", "A", "T"],
  hints: [0, 1, 2, 3].map(() => ({ sense: "s", cat: "c", enum: "3", text: "s c" })),
  breaks: [[], [], [], []],
  meta: { seed: 1 },
});

/* A stub that RE-APPLIES the rule rather than rubber-stamping it: it honours
   `day <= ?` using the bind the code actually passes, so a code path that
   stopped passing today is caught below.
 *
 * WHAT IT CANNOT PROVE, STATED BECAUSE IT WAS MEASURED. Deleting the
 * `AND s.day <= ?` clause from the real SQL does NOT fail the boundary
 * assertion — it fails "a board whose day has gone is served", because this
 * stub stops recognising the query and returns null for everything. The suite
 * goes red, which is the safety property, but it goes red for the wrong
 * reason and would mislead whoever read it.
 *
 * That is this project's own rule arriving in person: a stubbed database
 * cannot prove a query, and a bound dropped from real SQL passes offline. What
 * IS proved here is that the code passes the right binds and reads the result
 * correctly. THE CLAUSE ITSELF IS PROVED IN THE LIVE_CHECK, against real D1,
 * derived — the highest board number the archive offers may not exceed the
 * boards the calendar has actually reached. */
function db(rows, seen) {
  return { DB: { prepare: (sql) => ({
    bind: (...args) => ({
      first: async () => {
        if (seen) { seen.sql = sql; seen.args = args; }
        if (/WHERE b\.no = \? AND s\.day <= \?/.test(sql)) {
          const [no, today] = args;
          const r = rows.find((x) => x.no === Number(no) && x.day <= String(today));
          return r ? { no: r.no, day: r.day, payload: JSON.stringify(board(r.no, r.day)) } : null;
        }
        if (/WHERE s\.day = \?/.test(sql)) {
          const r = rows.find((x) => x.day === String(args[0]));
          return r ? { no: r.no, day: r.day, payload: JSON.stringify(board(r.no, r.day)) } : null;
        }
        return null;
      },
    }),
    first: async () => null,
  }) } };
}

const TODAY = "2026-09-20";
const ROWS = [
  { no: 5, day: "2026-09-18" },   // gone
  { no: 6, day: "2026-09-19" },   // gone
  { no: 7, day: TODAY },          // today
  { no: 8, day: "2026-09-21" },   // TOMORROW — the boundary
  { no: 9, day: "2026-09-22" },
];

console.log("=== The solution never leaves ===");
{
  const served = publicBoard(board(7, TODAY));
  t("no rows, words or code in what is served",
    leaksSolution(served).length === 0, leaksSolution(served).join(","));
  const blob = JSON.stringify(served);
  t("and not one answer appears anywhere in it",
    !["CAT", "ARE", "TEN"].some((a) => blob.includes(a)));
  t("the numbers are sent, which are the puzzle",
    served.cells[0][0] === CODE.C && served.cells[1][1] === CODE.R);
  t("a block is null rather than a number", cipherGrid({ rows: ["C.T"], code: CODE })[0][1] === null);
  t("three givens, as number to letter", served.given.length === 3 &&
    served.given.every((g) => g.n && g.letter));
  t("the slots carry length and clue but never the answer",
    served.slots.every((s) => s.len === 3 && s.text && s.answer === undefined));
  t("absent letters are the ones the grid does not use",
    !served.absent.includes("C") && served.absent.includes("Z"),
    served.absent.length + " absent");
}

console.log("\n=== The past opens, the future never does ===");
{
  t("a board whose day has gone is served",
    !!(await boardByNo(db(ROWS), 5, TODAY)), "board 5, two days ago");
  t("today's board is served by number too",
    !!(await boardByNo(db(ROWS), 7, TODAY)), "board 7");
  /* THE BOUNDARY. Board 8 is TOMORROW. This is the case an off-by-one serves
     and a board a year away does not. */
  t("TOMORROW's board is refused, which is the off-by-one case",
    (await boardByNo(db(ROWS), 8, TODAY)) === null, "board 8, day " + ROWS[3].day);
  t("and a board further out is refused as well",
    (await boardByNo(db(ROWS), 9, TODAY)) === null);
  t("a number the queue does not hold is refused",
    (await boardByNo(db(ROWS), 999, TODAY)) === null);
  t("zero and negatives are refused before they reach the query",
    (await boardByNo(db(ROWS), 0, TODAY)) === null &&
    (await boardByNo(db(ROWS), -2, TODAY)) === null);
  const seen = {};
  await boardByNo(db(ROWS, seen), 5, TODAY);
  t("today is what the query is bounded by, not a constant",
    seen.args && seen.args[1] === TODAY, JSON.stringify(seen.args));
  t("boardForDay asks for the day it was given",
    !!(await boardForDay(db(ROWS), TODAY)));
}

console.log("\n=== Two numberings, and only one of them is an address ===");
{
  /* CODEWORD'S OWN no COUNTS FROM ITS EPOCH, 13 September 2026. Every address
     on this site counts from the FAMILY's day one, 26 August — so board 1 is
     family number 20 and the two differ by nineteen. Both are small positive
     integers and either looks reasonable in a URL, which is exactly why taking
     the wrong one would have served the wrong board for every archive link
     without anything failing. Found by asking keyLabel what
     /football/codeword/daily/1 would be called and being told a date three
     weeks before the game existed. */
  /* THE OFFSET IS DERIVED, NOT WRITTEN DOWN. This pinned nineteen — family 20
     was Codeword's board 1 — which was true while the family counted from
     26 August and Codeword's queue started on 13 September. On 18 September
     2026 every game in the estate reset to day 1 together, the gap closed to
     nothing, and five assertions failed for a change they were never about.
     The PROPERTY under test is that two numberings exist and only one is an
     address; the size of the gap between them is not the property, and pinning
     it meant the suite had to be edited the moment the gap moved. */
  const { dailyDayKey } = await import("../../functions/_lib/daily.js");
  const { LAUNCHED } = await import("../../functions/_lib/games.js");
  const firstDay = LAUNCHED.codeword;
  /* The family number that names Codeword's own board 1: walk forward until
     the family calendar lands on the day the queue starts. */
  let famOfBoard1 = 1;
  while (famOfBoard1 < 400 && dailyDayKey(famOfBoard1) < firstDay) famOfBoard1++;
  t("the family number for Codeword board 1 resolves to the day it ran",
    dailyDayKey(famOfBoard1) === firstDay,
    `family ${famOfBoard1} -> ${firstDay}`);
  const rows = [{ no: 1, day: firstDay }, { no: 2, day: dailyDayKey(famOfBoard1 + 1) }];
  const today = firstDay;
  t("asking by FAMILY number finds the board that ran that day",
    (await boardByFamilyNo(db(rows), famOfBoard1, today))?.no === 1,
    `family ${famOfBoard1} -> board 1`);
  /* A family number BEFORE the queue starts finds nothing. When the game
     launched with the family this is family 0, which is not a number the site
     issues — so the case is only reachable while the two differ, and it is
     skipped rather than asserted falsely. */
  if (famOfBoard1 > 1) {
    t("asking by an earlier family number finds nothing, because nothing ran",
      (await boardByFamilyNo(db(rows), famOfBoard1 - 1, today)) === null,
      dailyDayKey(famOfBoard1 - 1) + " is before the queue starts");
  }
  t("and TOMORROW's family number is refused",
    (await boardByFamilyNo(db(rows), famOfBoard1 + 1, today)) === null,
    `family ${famOfBoard1 + 1} is ${dailyDayKey(famOfBoard1 + 1)}`);

  /* THE NUMBER THAT GOES OUT MUST BE THE NUMBER THAT COMES BACK, and this is
     the assertion that was missing when the game shipped. The endpoint READ a
     family number and REPORTED the internal one, and the page round-trips what
     it is given: it sent a 1 back to an endpoint that read 1 as 26 August, so
     kick-off 400'd, `round` stayed null, and every later call began
     `if (!round) return;`. Nothing errored. The board drew, the clock ran, and
     completing a word did nothing — reported by the owner minutes after deploy.
     Each end was right about a different thing, which is not the same as both
     being right. */
  const api = fs.readFileSync("functions/api/codeword/daily.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  t("the daily response reports the FAMILY number, the same one ?no= reads",
    /no: familyNo/.test(api) && !/no: served\.no/.test(api),
    "what goes out and what comes back must be the same scheme");
}

console.log("\n=== The scoring is the producing side's, to the point ===");
{
  t("the curve hits its published points",
    scoreAt(0) === 114 && scoreAt(10) === 97 && scoreAt(45) === 68 && scoreAt(90) === 36);
  t("and is flat after ninety, not negative", scoreAt(200) === 36);
  /* NOT ROUNDED HERE. The producing side rounds once, at the end of outcome().
     Rounding inside the curve disagrees with its page on 105 of the 1,452
     minute-and-solved combinations — measured, not feared. */
  t("scoreAt is unrounded, so the one rounding happens where theirs does",
    scoreAt(5) === 105.5, String(scoreAt(5)));
  t("all eleven inside ninety is a win", outcome(45, 11).result === "W");
  t("all eleven after ninety is a draw", outcome(95, 11).result === "D");
  t("anything less is a loss whenever it came", outcome(1, 10).result === "L");
  t("and the score scales with how many were solved",
    outcome(45, 6).score === Math.round(68 * 6 / 11), String(outcome(45, 6).score));
}

console.log("\n=== The clock is the server's, and the rate is part of it ===");
{
  const started = 0;
  t("sixty seconds on the fast clock is twenty match minutes",
    minuteOf({ rate_secs: 3, started_ms: started, spent_minutes: 0 }, 60000) === 20);
  t("the same sixty seconds on the slow clock is three",
    minuteOf({ rate_secs: 20, started_ms: started, spent_minutes: 0 }, 60000) === 3);
  /* THE SEVENTEEN MINUTES. That gap is the exploit the producing side found in
     its own demo: the rate was switchable mid-match, so flipping to the slow
     clock rewound the match and handed back the decay. The rate lives on the
     round for this reason. */
  t("which is the seventeen-minute gap a mid-match switch would have handed back",
    minuteOf({ rate_secs: 3, started_ms: started, spent_minutes: 0 }, 60000) -
    minuteOf({ rate_secs: 20, started_ms: started, spent_minutes: 0 }, 60000) === 17);
  t("minutes bought from helpers are added, not ignored",
    minuteOf({ rate_secs: 3, started_ms: started, spent_minutes: 5 }, 60000) === 25);
  t("a rate nobody offers is refused rather than corrected to a default",
    validRate(1) === null && validRate(3) === 3 && validRate(20) === 20,
    "a silently-corrected rate is a clock the player did not choose");
}

console.log("\n=== Marking, and what the paid helper is for ===");
{
  const right = {}; for (const L of Object.keys(CODE)) right[String(CODE[L])] = L;
  t("a correct grid confirms every slot", confirmSlots(board(7, TODAY), right).length === 4);
  t("and reports no wrong numbers", wrongNumbers(board(7, TODAY), right).length === 0);
  const wrong = { ...right, [String(CODE.C)]: "X" };
  t("one wrong letter drops the slots that use it",
    confirmSlots(board(7, TODAY), wrong).length === 2, "CAT across and CAT down both fail");
  t("and CHECK GRID names the NUMBER, not the square",
    JSON.stringify(wrongNumbers(board(7, TODAY), wrong)) === JSON.stringify([CODE.C]));
  /* confirm must never say WHICH letter is wrong — that is the question the
     player pays five minutes for. */
  t("confirm answers only which slots are done, never which letter is wrong",
    confirmSlots(board(7, TODAY), wrong).every((x) => Number.isInteger(x)));
  t("a half-filled slot is not confirmed",
    confirmSlots(board(7, TODAY), { [String(CODE.C)]: "C" }).length === 0);
  t("reveal returns the letter behind one number", letterFor(board(7, TODAY), CODE.E) === "E");
  t("and nothing for a number outside the cipher", letterFor(board(7, TODAY), 99) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
