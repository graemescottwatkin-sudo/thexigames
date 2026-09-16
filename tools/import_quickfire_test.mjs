/* tools/import_quickfire_test.mjs — the importer's rules about repetition.
 *
 * RUNS THE REAL SCRIPT. import_quickfire.js is a program rather than a module:
 * it reads a bank at import time and exits, so there is nothing to call. It is
 * spawned here against fixture banks, which proves the rule as it will run
 * rather than a re-statement of it — the difference the project pays for when
 * a suite re-applies a rule in JS and the real code has drifted.
 *
 * AND IT IS SPAWNED IN A TEMPORARY DIRECTORY, because the importer writes
 * data/qf-production.sql relative to its CWD. A passing case run from the repo
 * root would silently overwrite the real generated SQL with fixture output,
 * which is a test that damages what it is testing.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "import_quickfire.js");

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* FOUR OPTIONS, EXACTLY ONE OF THEM THE ANSWER — the importer's own rule since
   this morning, so a fixture that ignores it is refused before anything about
   repetition is reached. The options are DERIVED from the answer here rather
   than written beside it, which is why setAnswer below rebuilds them: a fixture
   whose answer and options drift apart tests the option rule by accident and
   the rule under test not at all. */
function withOptions(x) {
  return { ...x, option_1: x.answer, option_2: x.answer + " (b)",
    option_3: x.answer + " (c)", option_4: x.answer + " (d)" };
}
function setAnswer(bank, id, answer) {
  const i = bank.questions.findIndex((q) => q.id === id);
  bank.questions[i] = withOptions({ ...bank.questions[i], answer });
}

/* Eleven plus three, the shape every board must have. */
const qid = (n) => `q${String(n).padStart(4, "0")}`;
function makeQuestions(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    /* Source is required per question — every claim traceable, the
       crosswords rule. A fixture without it is refused before the rules under
       test are ever reached, which is how the first run of this suite reported
       three reds that had nothing to do with repetition. */
    out.push(withOptions({ id: qid(i), clue: `Question number ${i}`,
      answer: `Answer ${i}`, unit: null, source: "https://example.invalid/fixture" }));
  }
  return out;
}
const slots = (from) => Array.from({ length: 11 }, (_, i) => qid(from + i));
const bench = (from) => Array.from({ length: 3 }, (_, i) => qid(from + i));

/* Run the importer against a bank, in its own directory, and give back what it
   said. A run that writes is a run that passed the gate. */
function run(bank) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qfimp-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.mkdirSync(path.join(dir, "data"));
  fs.writeFileSync(path.join(dir, "src", "bank.json"), JSON.stringify(bank));
  const r = spawnSync(process.execPath, [SCRIPT, "--source", path.join(dir, "src")],
    { cwd: dir, encoding: "utf8" });
  const out = String(r.stdout || "") + String(r.stderr || "");
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, out };
}

/* A bank whose dailies are built from disjoint question ranges: 14 questions a
   board, so nothing repeats unless a fixture makes it. */
function cleanBank(days, startDates) {
  const questions = makeQuestions(14 * days);
  const dailies = [];
  for (let d = 0; d < days; d++) {
    const base = 1 + d * 14;
    dailies.push({ date: startDates[d], questionIds: slots(base), benchIds: bench(base + 11) });
  }
  return { questions, dailies, weeks: [] };
}

console.log("=== The importer runs at all ===");
{
  const r = run(cleanBank(2, ["2026-10-01", "2026-10-02"]));
  t("a bank with no repetition is accepted", r.status === 0, "exit " + r.status + " " + r.out.split("\n")[0]);
}

console.log("\n=== A question may never be asked twice ===");
{
  /* THE RULE THAT DID NOT EXIST. Two boards 200 days apart — far outside any
     answer window there has ever been — sharing one question. Before 14
     September 2026 this imported clean. */
  const bank = cleanBank(2, ["2026-10-01", "2027-04-19"]);
  bank.dailies[1].questionIds[0] = bank.dailies[0].questionIds[0];
  const r = run(bank);
  t("the same question on two boards is refused, however long the gap",
    r.status !== 0 && /was already asked on 2026-10-01/.test(r.out),
    (r.out.match(/- .*already asked.*/) || ["not refused"])[0]);
}
{
  const bank = cleanBank(2, ["2026-10-01", "2026-10-02"]);
  bank.dailies[1].questionIds[3] = bank.dailies[0].questionIds[7];
  const r = run(bank);
  t("and on consecutive days too", r.status !== 0 && /already asked/.test(r.out), "exit " + r.status);
}

console.log("\n=== An answer may come round again after a week ===");
{
  /* The same ANSWER on two different questions. This is the case the 90-day
     rule refused and the owner's rule allows: different question, familiar
     word. Eight days apart, which is outside seven and well inside ninety. */
  const bank = cleanBank(2, ["2026-10-01", "2026-10-09"]);
  setAnswer(bank, bank.dailies[1].questionIds[0],
    bank.questions.find((q) => q.id === bank.dailies[0].questionIds[0]).answer);
  const r = run(bank);
  t("an answer reused after eight days is accepted, on a different question",
    r.status === 0, "exit " + r.status + " " + (r.out.match(/- .*/) || [""])[0]);
}
{
  const bank = cleanBank(2, ["2026-10-01", "2026-10-04"]);
  setAnswer(bank, bank.dailies[1].questionIds[0],
    bank.questions.find((q) => q.id === bank.dailies[0].questionIds[0]).answer);
  const r = run(bank);
  t("but three days apart is still refused",
    r.status !== 0 && /inside the 7-day lookback/.test(r.out),
    (r.out.match(/- .*lookback.*/) || ["not refused"])[0]);
}
{
  /* THE WINDOW IS SEVEN AND THE MESSAGE SAYS SEVEN. A rule whose number and
     whose sentence disagree is how a reader is told the wrong thing while the
     code does the right one. */
  const bank = cleanBank(2, ["2026-10-01", "2026-10-04"]);
  setAnswer(bank, bank.dailies[1].questionIds[0],
    bank.questions.find((q) => q.id === bank.dailies[0].questionIds[0]).answer);
  const r = run(bank);
  t("and the refusal names the window it enforced", /7-day lookback/.test(r.out) && !/90-day/.test(r.out));
}
{
  /* The old setting, proved gone rather than assumed gone: thirty days apart
     was refused yesterday and is accepted today. */
  const bank = cleanBank(2, ["2026-10-01", "2026-10-31"]);
  setAnswer(bank, bank.dailies[1].questionIds[0],
    bank.questions.find((q) => q.id === bank.dailies[0].questionIds[0]).answer);
  const r = run(bank);
  t("a gap of thirty days, which the old ninety refused, is accepted now",
    r.status === 0, "exit " + r.status);
}

console.log("\n=== The board rules it already had still hold ===");
{
  const bank = cleanBank(1, ["2026-10-01"]);
  setAnswer(bank, bank.dailies[0].questionIds[1],
    bank.questions.find((q) => q.id === bank.dailies[0].questionIds[0]).answer);
  const r = run(bank);
  t("the same answer twice on ONE board is still refused",
    r.status !== 0 && /appears twice on the board/.test(r.out), "exit " + r.status);
}
{
  const bank = cleanBank(1, ["2026-10-01"]);
  bank.dailies[0].questionIds = bank.dailies[0].questionIds.slice(0, 10);
  const r = run(bank);
  t("a short board is still refused",
    r.status !== 0 && /10 questions, expected 11/.test(r.out), "exit " + r.status);
}


console.log("=== The days that have been served ===");
{
  /* TRIGGERED, NOT READ. Line ordering proves the guard is called before the
     write; it does not prove the guard is reached. Each case runs the importer
     for real, and asserts the exit code AND that the emitted SQL has not been
     touched — checking only that the file EXISTS passes a run that refused and
     then overwrote it with identical bytes. */
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const PAST = [day(2), day(1)];          // both already served

  /* This helper KEEPS its directory, unlike run() above, because the whole
     point is what the second run makes of what the first one left. */
  const staged = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qfserved-"));
    fs.mkdirSync(path.join(dir, "src"));
    fs.mkdirSync(path.join(dir, "data"));
    return dir;
  };
  const go = (dir, bank, extra = []) => {
    fs.writeFileSync(path.join(dir, "src", "bank.json"), JSON.stringify(bank));
    const r = spawnSync(process.execPath, [SCRIPT, "--source", path.join(dir, "src"), ...extra],
      { cwd: dir, encoding: "utf8" });
    return { status: r.status, out: String(r.stdout || "") + String(r.stderr || "") };
  };

  const dir = staged();
  const sql = path.join(dir, "data", "qf-production.sql");
  const first = go(dir, cleanBank(2, PAST));
  t("a first import establishes the calendar", first.status === 0 && fs.existsSync(sql),
    first.out.split("\n")[0]);

  const before = fs.existsSync(sql) ? fs.statSync(sql).mtimeMs : 0;

  /* The same days, one of them holding a different question. */
  /* SWAP TWO SLOTS rather than introduce a question. Moving a bench id into the
     XI puts the same question on the board twice, so the run refuses for a
     contract reason and the test passes while proving nothing about the served
     guard. A swap is a genuinely different board that is still entirely legal. */
  const changed = cleanBank(2, PAST);
  {
    const ids = changed.dailies[0].questionIds;
    [ids[0], ids[1]] = [ids[1], ids[0]];
  }
  const r2 = go(dir, changed);
  t("REFUSES a served day whose questions would change",
    r2.status === 1 && /at or before today would change/.test(r2.out) && r2.out.includes(PAST[0]),
    (r2.out.split("\n").find((l) => l.trim().startsWith("x ")) || r2.out.split("\n")[0]).trim());
  t("  and writes nothing — mtime unchanged", fs.statSync(sql).mtimeMs === before);

  /* A served day dropped from the bank entirely. */
  const dropped = cleanBank(2, PAST);
  dropped.dailies = dropped.dailies.slice(1);
  /* MANY SLOTS, NOT ONE — the case that would have caught the under-report.
     Every existing case changes a single slot, so a message naming only the
     first difference is indistinguishable from one naming all of them. A real
     refusal said "bench slot 2" on days where eight of eleven XI slots had
     moved, and the override was sized against that. */
  const many = cleanBank(2, PAST);
  {
    /* ROTATE WITHIN THE DAY. Copying ids in from the other daily puts the same
       question on two boards and the run refuses on THAT — the fixture fault
       that has now caught me three times: a mutation that breaks a different
       contract passes the test while never reaching the guard. A rotation of
       eight slots is a genuinely different board and entirely legal. */
    const ids = many.dailies[0].questionIds;
    const head = ids.slice(0, 8);
    head.push(head.shift());
    for (let i = 0; i < 8; i++) ids[i] = head[i];
  }
  const rMany = go(dir, many);
  t("a refusal reports EVERY changed slot, not the first",
    rMany.status === 1 && /8 of 11 XI slots/.test(rMany.out),
    (rMany.out.split(String.fromCharCode(10)).find((l) => l.includes("slots change")) || "").trim());
  t("  and says it cannot price the change itself",
    /CANNOT PRICE IT FOR YOU/.test(rMany.out));

  const r3 = go(dir, dropped);
  t("REFUSES a served day that has vanished from the bank",
    r3.status === 1 && /no daily for it at all/.test(r3.out), r3.out.split("\n")[0]);
  t("  and writes nothing", fs.statSync(sql).mtimeMs === before);

  /* Re-importing the same thing is fine, and so is adding a future day. */
  const r4 = go(dir, cleanBank(2, PAST));
  t("an unchanged re-import is allowed", r4.status === 0, r4.out.split("\n")[0]);

  /* mtime RE-CAPTURED HERE, because the unchanged re-import above legitimately
     rewrote the file. Comparing against the value taken before it would have
     reported the override as having clobbered the record when what moved it was
     an allowed write — a test failing for the right reason at the wrong moment. */
  const recordBefore = fs.statSync(sql).mtimeMs;
  const r5 = go(dir, changed, ["--rewrite-history"]);
  t("--rewrite-history lets it through and says so",
    r5.status === 0 && /REWRITING HISTORY/.test(r5.out), r5.out.split("\n")[0]);

  /* THE OVERRIDE MUST NOT DISARM THE GUARD. It used to overwrite the very file
     the guard reads as its record of what was served — so refusing once and
     running again went through in silence. The override writes ALONGSIDE now:
     the record is untouched and a second bare run must still refuse. */
  t("  and leaves the served record untouched",
    fs.statSync(sql).mtimeMs === recordBefore &&
    fs.existsSync(sql.replace(/[.]sql$/, ".rewritten.sql")),
    "the rewritten calendar goes beside the record, not over it");
  const r6 = go(dir, changed);
  t("  so running again without the flag still refuses", r6.status === 1,
    "a guard whose memory the override erased could be disarmed by refusing once");

  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
