/* tools/import_friendscrossword_test.mjs — the Friends importer's refusals,
 * proved against fixture banks rather than the real one.
 *
 * WHY THIS EXISTS WHEN THE IMPORTER ALREADY GATES. The importer cannot run in
 * CI: it needs 3,053 clues and 120 board definitions that live outside this
 * repository and are on no runner. So `--check` stays out of checks.yml, and
 * this stands in its place — the arrangement quickfire, codeword and whoami
 * already use. A rule that is only ever exercised on one laptop is a rule
 * nobody will notice breaking.
 *
 * IT SPAWNS THE REAL SCRIPT, for the reason the project keeps relearning: a
 * suite that re-states a rule in JS proves the rule, not the code, and passes
 * happily after the code has drifted away from it. Every case below runs
 * import_friendscrossword.mjs as a program and reads what it decided.
 *
 * AND IT WRITES NOWHERE NEAR data/. The importer resolves its output from its
 * own location rather than the working directory, so running it from a
 * temporary folder would NOT protect the real fr-production.sql — `--out` is
 * passed explicitly on every case instead.
 *
 * THE FIXTURE BANK IS NOT A MINIATURE OF THE REAL ONE and does not need to be.
 * Eleven interlocking words, one `group` each — the engine samples one row per
 * group, so a bank that shares a group places a single answer and every case
 * here would fail for a reason that has nothing to do with what it is testing.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SCRIPT = path.join(HERE, "import_friendscrossword.mjs");
const require = createRequire(import.meta.url);
const FCW = require(path.join(ROOT, "football/crossword/js/engine.js"));

let pass = 0, fail = 0;
const t = (n, ok, d) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`);
};

/* ---- fixtures ----------------------------------------------------------- */

const WORDS = ["MONICA", "CHANDLER", "PHOEBE", "RACHEL", "JOEY", "ROSS",
  "GUNTHER", "JANICE", "EMMA", "MARCEL", "LONDON"];
const title = (w) => w[0] + w.slice(1).toLowerCase();

function makeBank(over) {
  const f = over || (() => ({}));
  return WORDS.map((w, i) => Object.assign({
    id: `FIX${String(i + 1).padStart(4, "0")}`,
    cat: "Fixture > Thing",
    group: `G${i + 1}`,
    pgk: `P${i + 1}`,
    entity: `E${i + 1}`,
    maxPer: 1,
    clue: `Fixture clue number ${i + 1}?`,
    answer: title(w),
    grid: w,
    enum: `(${w.length})`,
    breaks: [],
    diff: "Easy",
    era: "Timeless",
    aliases: [],
    notes: "",
    sourceName: "Fixture",
    sourceQuote: `A fixture sentence naming ${title(w)} for row ${i + 1}.`,
  }, f(w, i)));
}

const ALL_IDS = makeBank().map((r) => r.id);
const board = (over) => Object.assign({
  themeId: "fixture", boardNo: 1, verified: 11, ready: true,
  seed: 500, clueIds: ALL_IDS,
}, over || {});

/* Run the importer against a bank and a manifest, in a throwaway directory. */
function run(bank, manifest, extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frx-"));
  const src = path.join(dir, "bank");
  fs.mkdirSync(src);
  if (bank !== null) {
    fs.writeFileSync(path.join(src, "data.json"), JSON.stringify(bank));
  }
  if (manifest !== null) {
    fs.writeFileSync(path.join(src, "rehearsal-manifest-fixture.json"),
      JSON.stringify(manifest));
  }
  const out = path.join(dir, "out.sql");
  const args = [SCRIPT, "--source", src, "--out", out].concat(extra || []);
  const r = spawnSync(process.execPath, args, { cwd: dir, encoding: "utf8" });
  return {
    code: r.status,
    text: (r.stdout || "") + (r.stderr || ""),
    wrote: fs.existsSync(out),
    sql: fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "",
  };
}
const refused = (r) => r.code !== 0 && /REFUSED/.test(r.text);
const why = (r) => (r.text.split("\n").filter((l) => /REFUSED/.test(l))[0] || "").trim();

/* ---- it runs at all ----------------------------------------------------- */

console.log("=== The importer runs, and writes only when asked ===");
{
  const r = run(makeBank(), [board(), board({ boardNo: 2, seed: 7 })]);
  t("two clean boards are gated", r.code === 0 && /2 boards gated/.test(r.text), why(r));
  t("and the SQL is written",
    r.wrote && /INSERT OR REPLACE INTO fr_puzzles/.test(r.sql));
  t("one INSERT per board",
    (r.sql.match(/INSERT OR REPLACE/g) || []).length === 2);

  const c = run(makeBank(), [board()], ["--check"]);
  t("--check writes nothing", c.code === 0 && !c.wrote);
}

/* ---- absent input must not pass ----------------------------------------- */

console.log("\n=== Absent input must not pass ===");
t("no data.json", refused(run(null, [board()])));
t("no manifest", refused(run(makeBank(), null)));
t("an empty bank", refused(run([], [board()])));
t("an empty manifest", refused(run(makeBank(), [])));

/* ---- the manifest's own claims ------------------------------------------ */

console.log("\n=== A board must be what the manifest says it is ===");
t("not ready", refused(run(makeBank(), [board({ ready: false })])));
t("ten clue ids",
  refused(run(makeBank(), [board({ clueIds: ALL_IDS.slice(0, 10) })])));
t("twelve clue ids",
  refused(run(makeBank(), [board({ clueIds: ALL_IDS.concat(ALL_IDS[0]) })])));
t("the same clue twice",
  refused(run(makeBank(),
    [board({ clueIds: ALL_IDS.slice(0, 10).concat(ALL_IDS[0]) })])));
t("a clue id the bank does not have",
  refused(run(makeBank(),
    [board({ clueIds: ALL_IDS.slice(0, 10).concat("NOPE0001") })])));

{
  /* The seed is the agreement between this repository's engine and the bank's
     rehearsal. A recorded size that no longer matches means they have drifted,
     and drift is a stop rather than a warning. */
  const real = FCW.generate(makeBank(), { seed: 500 });
  const wrong = `${real.width + 3}x${real.height + 3}`;
  t("a size the engine no longer reproduces",
    refused(run(makeBank(), [board({ size: wrong })])), `pinned ${wrong}`);
  t("and the size it does reproduce is accepted",
    run(makeBank(), [board({ size: `${real.width}x${real.height}` })]).code === 0);
}

/* ---- the leak scan ------------------------------------------------------ */

console.log("\n=== The answer may not reach the public row ===");
{
  /* The scan is live: an answer in a served field is refused, and `cat` is
     served. This is the case that a `cat` exemption would have silently
     turned off. */
  const inCat = makeBank((w, i) => (i === 0 ? { cat: `Fixture > ${title(w)}` } : {}));
  t("an answer inside its own category", refused(run(inCat, [board()])));

  const inEra = makeBank((w, i) => (i === 3 ? { era: title(w) } : {}));
  t("an answer inside its own era", refused(run(inEra, [board()])));
}
{
  /* THE ONE EXEMPTION, and it is exactly one field wide. Three rows of the real
     3,053 contain their answer in their own clue: BTS0173 (MONKEY, "two
     monkeys"), QUO0071 (MONICA, inside "Harmonica"), EVT0509 (HANDLER, inside
     "Chandler"). The clue is public by definition, so this must be allowed.

     AND THE FIXTURE HAS TO BE A SUBSTRING, not a whole word, or it tests
     nothing. The engine already refuses a self-answering clue — but
     isSelfAnswering() compares whole distinctive WORDS, so it returns false for
     all three rows above: "monkeys" is not "MONKEY", and "Harmonica" is not
     "MONICA". A whole-word fixture is dropped by the engine before this
     importer ever sees it, and the case fails on an entry count with the
     exemption never reached. The two checks look like the same rule and are
     not: the engine's is about clue quality, this one is about bytes. */
  const inClue = makeBank((w, i) =>
    (i === 0 ? { clue: `Which one plays the Har${w.toLowerCase()} on the show?` } : {}));
  t("PRECONDITION: the engine does not drop it as self-answering",
    FCW.isSelfAnswering(inClue[0]) === false, "otherwise the case below is vacuous");
  const r = run(inClue, [board()]);
  t("an answer inside its own CLUE is allowed",
    r.code === 0 && /1 board/.test(r.text), why(r));
}

/* ---- the regression this suite exists for ------------------------------- */

console.log("\n=== The scan pairs by clue id, never by position ===");
{
  /* THE ENGINE LAYS A BOARD OUT, so it returns entries in GRID order and not in
     the order it was handed the rows. The first version of the leak scan walked
     the two lists side by side, which compared every answer against somebody
     else's entry — refusing eight good boards, and, far worse, able to miss a
     real leak sitting in the row it skipped past.
     This bank makes the two readings disagree on purpose: every row's category
     names EVERY answer except its own. Paired by id, nothing is wrong and the
     board must gate. Paired by position, a category holds the answer of the row
     it is being compared with the moment the order differs anywhere — and it
     differs on every seed measured. */
  const names = WORDS.map(title);
  const crossed = makeBank((w, i) => ({
    cat: "Fixture > " + names.filter((_, j) => j !== i).join(" "),
  }));

  const generated = FCW.generate(crossed, { seed: 500 });
  const order = generated.entries.map((e) => e.row.id).join(",");
  t("PRECONDITION: the engine really does reorder", order !== ALL_IDS.join(","),
    "without this the case below proves nothing");

  const r = run(crossed, [board()]);
  t("a board whose categories name every OTHER answer gates",
    r.code === 0 && /1 board/.test(r.text), why(r));

  /* And the mirror, so the case above cannot pass by the scan being dead: the
     same bank plus one row that also names its OWN answer must be refused. */
  const poisoned = crossed.map((row, i) =>
    (i === 0 ? Object.assign({}, row, { cat: row.cat + " " + names[0] }) : row));
  t("and adding its own answer to one of them refuses",
    refused(run(poisoned, [board()])));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
