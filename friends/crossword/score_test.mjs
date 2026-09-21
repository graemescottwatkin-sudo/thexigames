/* friends/crossword/score_test.mjs — the /100 rule, and what marking sends back.
 *
 * THE ARITHMETIC CASE IS THE REASON THIS FILE EXISTS. Eleven entries do not
 * divide into 100: 100/11 is 9.0909…, so eleven entries scored one at a time
 * and rounded come to 99. A player who solves the whole board being told they
 * got 99 is the one number anybody would notice, and it is the kind of bug that
 * survives review because every individual line of it looks right.
 *
 * THE MARKING CASES ARE ABOUT WHAT COMES BACK. The endpoint is the only side
 * with the answers, so everything it says is a disclosure: this holds it to
 * per-entry booleans and no letters, in both directions — a wrong entry must
 * not be told what it should have been, and a right one must not be echoed.
 */

import { onRequestPost } from "../../functions/api/crossword_fr/check.js";
import { boardScore, keptTheDay, TOTAL, ENTRIES, REVEAL_WORTH }
  from "../../functions/_lib/fr-score.js";
import { makeBoard, answersOf, solvedGrid, key } from "./fixture.mjs";
import { launchNumber } from "../../functions/_lib/games.js";

/* THE FIRST PUBLIC BOARD NUMBER, NOT 1. A public number is the FAMILY's daily
   number, so the bank's board 1 is advertised as no. 4 — and the endpoint
   refuses anything below the launch, because that is a board from before the
   game existed.

   EVERY CASE BELOW SAID no: NO1, written while the game was unlaunched and the
   two numbers coincided. Three of them failed on the launch; the rest went on
   passing FOR THE WRONG REASON, because they assert a 400 or a 403 and a
   refused board number produces one of those too. A case that cannot tell its
   own subject from a bad fixture is the quieter half of this bug, so they are
   all moved, not just the three that went red. */
const NO1 = launchNumber("crossword_fr");

let pass = 0, fail = 0;
const t = (n, ok, d) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`);
};

/* ---- the rule ----------------------------------------------------------- */

console.log("=== Out of 100, with eleven entries ===");
{
  t("PRECONDITION: eleven does not divide 100", (TOTAL / ENTRIES) % 1 !== 0,
    `${TOTAL}/${ENTRIES} = ${(TOTAL / ENTRIES).toFixed(4)} — the whole reason for the next case`);

  const perEntry = Math.round(TOTAL / ENTRIES) * ENTRIES;
  t("and rounding per entry would NOT reach 100", perEntry !== TOTAL,
    `${perEntry}, which is what the naive sum gives`);

  t("all eleven is exactly 100", boardScore(11, 0) === 100, String(boardScore(11, 0)));
  t("none is 0", boardScore(0, 0) === 0, String(boardScore(0, 0)));
  t("one is 9", boardScore(1, 0) === 9, String(boardScore(1, 0)));
  t("ten is 91", boardScore(10, 0) === 91, String(boardScore(10, 0)));
  t("never above 100", boardScore(99, 0) === 100, String(boardScore(99, 0)));
  t("never below 0", boardScore(-5, 0) === 0, String(boardScore(-5, 0)));
  t("nonsense is 0 rather than NaN", boardScore("x", null) === 0,
    String(boardScore("x", null)));
}

console.log("\n=== A reveal is worth less, and is not counted twice ===");
{
  t("eleven, all revealed, is half", boardScore(11, 11) === Math.round(TOTAL * REVEAL_WORTH),
    String(boardScore(11, 11)));
  t("a revealed entry scores below the same entry solved",
    boardScore(11, 1) < boardScore(11, 0),
    `${boardScore(11, 1)} vs ${boardScore(11, 0)}`);
  t("more reveals never score more",
    [0, 1, 2, 5, 11].every((r, i, a) => i === 0 || boardScore(11, a[i]) <= boardScore(11, a[i - 1])),
    [0, 1, 2, 5, 11].map((r) => boardScore(11, r)).join(" "));
  t("revealed cannot exceed solved", boardScore(2, 11) === boardScore(2, 2),
    `${boardScore(2, 11)} vs ${boardScore(2, 2)}`);
}

console.log("\n=== Keeping the day is a different question from the score ===");
{
  t("all eleven keeps it", keptTheDay(11) === true);
  t("ten does not", keptTheDay(10) === false);
  t("revealing your way through still keeps it",
    keptTheDay(11) === true && boardScore(11, 11) < TOTAL,
    `kept, scored ${boardScore(11, 11)} — a genuine streak asks whether it was ` +
    `finished, not whether it was finished well`);
}

/* ---- marking ------------------------------------------------------------ */

/* THE BOARD IS THE ENGINE'S, NOT THIS FILE'S. It was hand-built at first, with
   `entry.cells` as "x,y" STRINGS where the engine emits { x, y } OBJECTS — so
   check.js looked every cell up as undefined, read every answer as blank, and
   would have marked a perfect grid entirely wrong in production. The fixture
   agreed with the bug, so all 35 cases passed. See fixture.mjs. */

const BOARD = makeBoard();
const ANSWERS = answersOf(BOARD);

const env = (p) => ({ DB: { prepare: () => ({ bind: () => ({
  first: async () => (p === null ? null : { payload: JSON.stringify({ puzzle: p }) }),
}) }) } });

function post(bodyObj, opts) {
  const o = opts || {};
  return new Request("https://thexigames.com/api/crossword_fr/check", {
    method: "POST",
    headers: o.noCsrf ? { "Content-Type": "application/json" }
                      : { "Content-Type": "application/json", "X-XI-Games": "1" },
    body: typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj),
  });
}
const mark = (bodyObj, p, opts) =>
  onRequestPost({ request: post(bodyObj, opts), env: env(p === undefined ? BOARD : p) });

/* Read out of the board rather than typed here, so the "correct" grid cannot
   drift from the board it is being marked against. */
const rightGrid = () => solvedGrid(BOARD);

console.log("\n=== Marking ===");
{
  const r = await mark({ no: NO1, filled: rightGrid() });
  const b2 = await r.json();
  t("PRECONDITION: the board has eleven markable entries",
    ANSWERS.length === 11 && ANSWERS.every((a) => a.letters.length > 2),
    `${ANSWERS.length} entries, shortest answer ${Math.min(...ANSWERS.map((a) => a.letters.length))}`);
  t("a fully solved board marks every entry right",
    r.status === 200 && b2.correct === 11, `${r.status}, ${b2.correct} correct`);
  t("and scores exactly 100", b2.score === 100, String(b2.score));
  t("and keeps the day", b2.kept === true);

  /* ONE WRONG LETTER, PLACED IN A REAL CELL OF A REAL ENTRY. The entry it
     belongs to must fail and the others must not — except any entry that
     crosses that same cell, which legitimately fails too. */
  const target = ANSWERS[0];
  const spoiledKey = target.keys[0];
  const wrong = { ...rightGrid() };
  wrong[spoiledKey] = wrong[spoiledKey] === "X" ? "Q" : "X";
  const r2 = await (await mark({ no: NO1, filled: wrong })).json();

  const crossing = ANSWERS.filter((a) => a.keys.includes(spoiledKey)).map((a) => a.id);
  t("the entry holding the wrong letter fails",
    r2.entries.find((e) => e.id === target.id).correct === false);
  t("and every entry that does NOT cross that cell still passes",
    r2.entries.filter((e) => !crossing.includes(e.id)).every((e) => e.correct === true),
    `${crossing.length} entr(ies) cross it`);
  t("so the day is not kept", r2.kept === false);
  t("and the score falls short of 100", r2.score < 100, String(r2.score));
}

console.log("\n=== What marking may not say ===");
{
  const b3 = await (await mark({ no: NO1, filled: {} })).json();
  t("an empty grid is marked wrong, not right", b3.correct === 0, String(b3.correct));

  /* VALUES, WALKED — never the serialised reply. Normalising JSON.stringify
     makes KEY NAMES searchable, and "acROSS" contains ROSS, a real Friends
     answer. The route's own first leak scan made exactly that mistake. */
  const vals = [];
  (function walk(v) {
    if (v == null) return;
    if (typeof v === "string") { vals.push(v.toUpperCase().replace(/[^A-Z0-9]/g, "")); return; }
    if (typeof v === "object") for (const k of Object.keys(v)) walk(v[k]);
  })(b3);
  t("PRECONDITION: the reply carries values to search", vals.length > 0, `${vals.length}`);
  t("and not one answer is inside any of them",
    ANSWERS.every((a) => !vals.some((v) => v.includes(a.letters))),
    `${ANSWERS.length} answers against ${vals.length} values`);

  t("the reply is per entry, not per cell",
    b3.entries.every((e) => !("cells" in e) && !("want" in e) && !("letters" in e)));
  t("and carries no clue text either, which the board already sent",
    b3.entries.every((e) => !("clue" in e)));
}

console.log("\n=== Refusals ===");
{
  t("no CSRF header", (await mark({ no: NO1, filled: {} }, undefined, { noCsrf: true })).status === 403);
  t("not JSON", (await mark("{nope", undefined)).status === 400);
  t("no board number", (await mark({ filled: {} })).status === 400);
  t("board number zero", (await mark({ no: 0, filled: {} })).status === 400);
  t("filled is an array", (await mark({ no: NO1, filled: [] })).status === 400);
  t("filled is missing", (await mark({ no: NO1 })).status === 400);

  const huge = {};
  for (let i = 0; i < 500; i++) huge[`c${i}`] = "A";
  t("an absurdly large grid is refused rather than truncated",
    (await mark({ no: NO1, filled: huge })).status === 400,
    "truncating would mark the rest blank — a wrong answer invented by the server");

  t("a board that is not there is a 404", (await mark({ no: NO1, filled: {} }, null)).status === 404);

  /* AN ENTRY WITH NO STORED LETTERS MUST NOT MARK CORRECT. Two empty strings
     compare equal, so the naive check hands a point for nothing — and it would
     do it on exactly the boards that are already broken. */
  const hollow = JSON.parse(JSON.stringify(BOARD));
  for (const k of Object.keys(hollow.cells)) hollow.cells[k].ch = "";
  const h = await (await mark({ no: NO1, filled: {} }, hollow)).json();
  t("a board with no letters scores 0, not 11 out of 11", h.correct === 0 && h.score === 0,
    JSON.stringify({ correct: h.correct, score: h.score }));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
