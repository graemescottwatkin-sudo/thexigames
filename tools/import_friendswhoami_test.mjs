/* tools/import_friendswhoami_test.mjs — the Friends Who Am I importer and
 * calendar, run for real against a synthetic deck.
 *
 *   node tools/import_friendswhoami_test.mjs      (from the repo root)
 *
 * WHY. On 23 September 2026 the owner ruled that dailies deal VERIFIED clues
 * only. Three independent counts agreed on the result — 151 daily rounds from
 * 66 cards — and a count cannot tell a correct banding from a wrong one: any
 * grouping of the same clues gives the same totals. So this proves the
 * STRUCTURE: which clue numbers land in which daily round, that a card with too
 * few verified clues gets none, that locations get none, and that the calendar
 * deals daily letters rather than full-card ones.
 *
 * THE DECK IS SYNTHETIC ON PURPOSE. The real deck is the bank and is secret;
 * nothing from it may be committed. The shape — deck-data JSON inside
 * who-am-i-app.html, cards with id, name, section, clues[{t, vs, ep, verified}],
 * accept and find — is the one the deck session documented, and the importer is
 * run as the owner runs it, as a subprocess, with --out and --deck pointing at
 * a temporary folder so the real data/ files are never touched.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMPORTER = path.join(ROOT, "tools", "import_friendswhoami.js");
const CALENDAR = path.join(ROOT, "tools", "build_friendswhoami_calendar.js");

let pass = 0, fail = 0;
const t = (n, ok, d) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`);
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "frwa-import-"));
process.on("exit", () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

/* ---- a synthetic deck -------------------------------------------------- */

/* depth clues, verified at the given 1-based positions. The text names no
   card, so the importer's self-naming check has nothing to object to. */
const card = (id, name, section, depth, verified) => ({
  id, name, section,
  clues: Array.from({ length: depth }, (_, i) => ({
    t: `Synthetic clue ${i + 1} of card ${id}.`, vs: "none",
    ...(verified.includes(i + 1) ? { verified: true } : {}),
  })),
  accept: [name], find: [],
});
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const GOOD = [
  /* 12 clues, nine verified: m = 9, r = 3. Daily A takes the 1st, 4th and 7th
     verified clues — n 1, 5, 9 — B n 2, 6, 10, C n 3, 7, 11. n 4, 8, 12 are
     not verified and appear in no daily round. */
  card("1", "Alpha One", "Loves & Exes", 12, [1, 2, 3, 5, 6, 7, 9, 10, 11]),
  /* Two verified clues: no daily round at all. */
  card("2", "Beta Two", "Family & Relatives", 6, [2, 4]),
  /* Three clues, all verified: one daily round, n 1, 2, 3. */
  card("3", "Epsilon Four", "The Main Six", 3, [1, 2, 3]),
  /* Thirty-six, all verified: twelve daily rounds, letters A to L. */
  card("E1", "Gamma Three", "Expert Pile", 36, range(1, 36)),
  /* A location, fully verified — and still no daily round. */
  card("L1", "Delta Place", "Locations", 3, [1, 2, 3]),
];

function deckDir(name, cards) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir, { recursive: true });
  const json = JSON.stringify({ cards, stats: {} });
  fs.writeFileSync(path.join(dir, "who-am-i-app.html"),
    `<!doctype html><html><body><script type="application/json" id="deck-data">${json}</script></body></html>`);
  return dir;
}

const node = (script, args) => spawnSync(process.execPath, [script, ...args],
  { cwd: ROOT, encoding: "utf8" });

/* ---- the importer ------------------------------------------------------ */

console.log("=== The importer builds daily rounds from verified clues only ===");
const deckSql = path.join(TMP, "deck.sql");
const imp = node(IMPORTER, ["--source", deckDir("good", GOOD), "--out", deckSql]);
t("the importer accepts the synthetic deck", imp.status === 0,
  imp.status === 0 ? "" : (imp.stdout + imp.stderr).split("\n").filter((l) => /REFUSED|Error|fault/.test(l)).slice(0, 3).join(" | "));
const sql = fs.existsSync(deckSql) ? fs.readFileSync(deckSql, "utf8") : "";
t("and writes where it was told, not into data/", sql.length > 0);

const daily = [...sql.matchAll(/INSERT INTO fr_wa_daily_clue \(card_id, round_letter, step, n\) VALUES \('([^']*)', '([A-Z])', (\d+), (\d+)\);/g)]
  .map((m) => ({ card: m[1], letter: m[2], step: Number(m[3]), n: Number(m[4]) }));
const roundOf = (id, L) => daily.filter((d) => d.card === id && d.letter === L)
  .sort((a, b) => a.step - b.step).map((d) => d.n);

t("PRECONDITION: daily rows were written at all", daily.length > 0, daily.length + " row(s)");
t("card 1 daily round A is n 1, 5, 9 — the 1st, 4th and 7th verified clues",
  roundOf("1", "A").join(",") === "1,5,9", roundOf("1", "A").join(","));
t("round B is n 2, 6, 10", roundOf("1", "B").join(",") === "2,6,10", roundOf("1", "B").join(","));
t("round C is n 3, 7, 11", roundOf("1", "C").join(",") === "3,7,11", roundOf("1", "C").join(","));
t("and there is no round D: nine verified clues make three rounds",
  roundOf("1", "D").length === 0);
t("no unverified clue is in any daily round",
  !daily.some((d) => d.card === "1" && [4, 8, 12].includes(d.n)));

t("a card with two verified clues has no daily round",
  !daily.some((d) => d.card === "2"));
t("three verified clues make one round, n 1, 2, 3",
  roundOf("3", "A").join(",") === "1,2,3" && roundOf("3", "B").length === 0);
t("thirty-six verified clues make twelve rounds, A to L",
  [...new Set(daily.filter((d) => d.card === "E1").map((d) => d.letter))].sort().join("") === "ABCDEFGHIJKL");
t("and the twelfth takes n 12, 24, 36", roundOf("E1", "L").join(",") === "12,24,36",
  roundOf("E1", "L").join(","));
t("a location gets no daily round, however verified",
  !daily.some((d) => d.card === "L1"));

/* The FULL card is untouched by the ruling: endless play's letters, stride 4. */
const full = [...sql.matchAll(/INSERT INTO fr_wa_clue \(card_id, n, round_letter, step, text, vs, ep\) VALUES \('1', (\d+), '([A-Z])', (\d+),/g)]
  .map((m) => ({ n: Number(m[1]), letter: m[2], step: Number(m[3]) }));
t("the full card keeps all twelve clues for endless play", full.length === 12, String(full.length));
t("banded by its own stride: full round A is n 1, 5, 9",
  full.filter((f) => f.letter === "A").map((f) => f.n).join(",") === "1,5,9");
t("the importer reports the endless-only card by name",
  /endless play only \(1\): Beta Two/.test(imp.stdout), (imp.stdout.match(/no daily rounds.*$/m) || [""])[0]);
t("and no transaction statement: D1 refuses them", !/BEGIN TRANSACTION|COMMIT;/.test(sql));

/* ---- what the importer refuses ----------------------------------------- */

console.log("\n=== What the importer refuses ===");
{
  const bad = GOOD.map((c) => JSON.parse(JSON.stringify(c)));
  bad[0].clues[0].verified = "true";              // a string, not a boolean
  const r = node(IMPORTER, ["--source", deckDir("string-flag", bad), "--check"]);
  t("a verified flag that is not a boolean", r.status !== 0 && /neither true nor absent/.test(r.stdout),
    (r.stdout.match(/REFUSED.*$/m) || ["exit " + r.status])[0]);
}
{
  const bad = GOOD.map((c) => JSON.parse(JSON.stringify(c)));
  bad[4].section = "Loves & Exes";                // L1 filed under a main section
  const r = node(IMPORTER, ["--source", deckDir("wrong-section", bad), "--check"]);
  t("a location id filed under a main section",
    r.status !== 0 && /its id says location but its section/.test(r.stdout),
    (r.stdout.match(/its id says.*$/m) || ["exit " + r.status])[0]);
}

/* ---- the calendar deals daily letters ---------------------------------- */

console.log("\n=== The calendar deals the verified rounds ===");
const calSql = path.join(TMP, "calendar.sql");
const cal = node(CALENDAR, ["--from", "2026-10-01", "--deck", deckSql, "--out", calSql]);
t("the calendar deals from the synthetic import", cal.status === 0,
  cal.status === 0 ? "" : (cal.stdout.match(/REFUSED.*$/m) || [cal.stderr.slice(0, 120)])[0]);
const doors = fs.existsSync(calSql) ? [...fs.readFileSync(calSql, "utf8")
  .matchAll(/INSERT INTO fr_wa_door \(play_date, slot, card_id, round_letter\) VALUES \('([^']*)', (\d+), '([^']*)', '([A-Z])'\);/g)]
  .map((m) => ({ day: m[1], slot: Number(m[2]), card: m[3], letter: m[4] })) : [];
t("PRECONDITION: it dealt doors", doors.length >= 3, doors.length + " door(s)");
t("three doors on the first day", doors.filter((d) => d.day === "2026-10-01").length === 3);
t("every door's letter is a daily round that card HAS",
  doors.every((d) => roundOf(d.card, d.letter).length === 3),
  doors.map((d) => d.card + ":" + d.letter).join(" "));
t("the card with too few verified clues is never dealt", !doors.some((d) => d.card === "2"));
t("and a location never is", !doors.some((d) => d.card === "L1"));
t("it reports the endless-only card", /endless only.*Beta Two/.test(cal.stdout));

console.log("\n=== And refuses an import from before the ruling ===");
{
  /* The same deck SQL with every daily row taken out — an import made by the
     importer as it was before 23 September. */
  const old = path.join(TMP, "old.sql");
  fs.writeFileSync(old, sql.split("\n").filter((l) => !/fr_wa_daily_clue/.test(l)).join("\n"));
  const r = node(CALENDAR, ["--from", "2026-10-01", "--deck", old, "--out", path.join(TMP, "old-cal.sql")]);
  t("a deck SQL with no daily rows is refused, not dealt from full rounds",
    r.status !== 0 && /no fr_wa_daily_clue rows/.test(r.stdout),
    (r.stdout.match(/REFUSED.*$/m) || ["exit " + r.status])[0]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
