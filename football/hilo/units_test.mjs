/* hilo/units_test.mjs — the importer's unit list against the page's formatter.
 *
 *   node football/hilo/units_test.mjs        (from the repo root)
 *
 * TWO LISTS WITH NOTHING BETWEEN THEM, which is this project's oldest fault in
 * its quietest form. tools/import_hilo.js decides which units a board may
 * carry; football/hilo/js/game.js decides how each one READS. Until 16 Sep 2026
 * the first knew four and the second named two, and they had agreed only by
 * luck: fmt() ends `return String(v)`, which is correct for "year" and would be
 * correct for nothing else.
 *
 * The failure that shape produces is not an error. An unknown unit falls
 * through and renders a bare number — on a game whose whole question is whether
 * the next number is higher or lower, where a bare number looks exactly like a
 * right answer. It would have shipped looking fine.
 *
 * So this suite holds the DECISION — unit to rendered string — and holds it
 * against both sides. A unit added to the importer with no decision here goes
 * red; a decision here for a unit the importer would refuse goes red; and a
 * rendering that changes under either goes red with it.
 *
 * It runs fmt's OWN BYTES rather than a copy of its rules. The function is cut
 * out of game.js by brace matching and evaluated, so a rewrite of fmt is tested
 * and a reimplementation of fmt is not something this file contains.
 */
import fs from "node:fs";
import { UNITS } from "../../tools/import_hilo.js";
import { HL_SAMPLE_BOARDS } from "../../functions/_lib/hl-sample.js";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const GAME = "football/hilo/js/game.js";
const src = fs.readFileSync(GAME, "utf8");

/* ---- fmt, cut out and made callable ---------------------------------- */

/* Brace matching rather than a regex, because a regex cannot count braces and
   fmt contains them. Starts at the signature and returns the source through
   the matching close. */
function bodyOf(name) {
  const at = src.indexOf("function " + name + "(");
  if (at < 0) return null;
  const open = src.indexOf("{", at);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (!depth) return src.slice(at, i + 1); }
  }
  return null;
}

const fmtSrc = bodyOf("fmt");

/* THE FLOOR UNDER THIS WHOLE FILE. Every assertion below calls fmt; if the cut
   failed, they would all throw or all compare undefined, and a suite that
   cannot find its subject must say so rather than produce a tidy row of
   results about nothing. */
if (!fmtSrc) {
  console.error(`REFUSED: no function fmt( in ${GAME} — this suite has nothing to test.`);
  console.error("  It was renamed, moved or removed. That is a real change and this");
  console.error("  suite going quiet about it would be worse than it going red.");
  process.exit(1);
}

const fmt = new Function("return (" + fmtSrc + ")")();

console.log("=== the formatter was found and runs ===");
t("fmt was cut out of the page's own source", typeof fmt === "function",
  `${fmtSrc.split("\n").length} lines from ${GAME}`);
t("and it is the page's fmt, not a rewrite of it", src.includes(fmtSrc),
  "the bytes under test are the bytes that ship");

/* ---- the decision ----------------------------------------------------- */

/* ONE ROW PER UNIT THE IMPORTER ACCEPTS, and the row is the decision: this
   value, rendered, reads like this. `bare` marks a unit the formatter does not
   name and reaches through `return String(v)`.
   Note what is NOT written here: nothing asserts fmt's branches by reading
   them. The expectation is a STRING A PLAYER WOULD SEE, so a branch that is
   present but wrong fails the same as a branch that is missing. */
const RENDERS = {
  year:   { value: 2004, reads: "2004",     bare: true,
            why: "a year is its own rendering; String() is right and the fallthrough is where it belongs" },
  count:  { value: 1234, reads: "1,234",    bare: false,
            why: "appearances, goals, caps — grouped, because four figures happen" },
  pounds: { value: 1234, reads: "£1,234",   bare: false,
            why: "a fee, and the symbol is not decoration: 1,234 and £1,234 are different claims" },
  cm:     { value: 175,  reads: "175 cm",   bare: false,
            why: "height. A bare 175 on a Taller/Shorter ladder reads as a count of something" },
  date:   { value: 8036, reads: "8036",     bare: true,
            why: "NOT A DECISION, A RECORD OF A GAP. The gate says a date value is a whole count "
               + "of days, and fmt has no branch, so this prints the day count where a date belongs. "
               + "No board has ever used it — the check below refuses the day one does." },
};

console.log("");
console.log("=== every accepted unit renders the way somebody decided ===");
for (const unit of UNITS) {
  const want = RENDERS[unit];
  t(`the importer accepts "${unit}", and this suite says how it reads`, !!want,
    want ? want.why : `NO ROW IN RENDERS for "${unit}" — a unit was added to the importer `
                    + `without deciding what a player sees. Add it here, with the string.`);
  if (!want) continue;
  const got = fmt(want.value, unit);
  t(`  fmt(${want.value}, "${unit}") reads "${want.reads}"`, got === want.reads,
    got === want.reads ? want.why : `rendered ${JSON.stringify(got)}`);
}

console.log("");
console.log("=== and nothing is decided here that the importer would refuse ===");
for (const unit of Object.keys(RENDERS)) {
  t(`"${unit}" is a unit the importer accepts`, UNITS.includes(unit),
    UNITS.includes(unit) ? "" : `RENDERS names "${unit}" and tools/import_hilo.js would refuse a `
                              + `board carrying it — so this row guards nothing.`);
}

/* ---- the two that reach the fallthrough ------------------------------- */

console.log("");
console.log("=== the fallthrough is reached on purpose, and only on purpose ===");
/* A unit that renders as a bare number is fine when the number IS the reading,
   and is a latent bug otherwise. Both are in RENDERS with `bare`, so this is
   not a judgement made here — it is the judgement above, counted. */
const bare = UNITS.filter((u) => RENDERS[u] && RENDERS[u].bare);
t("the units that fall through are the ones marked as falling through",
  bare.length === 2 && bare.includes("year") && bare.includes("date"),
  bare.join(", ") || "none");

/* THE TRIPWIRE ON "date". It is accepted by the gate, rendered as a raw day
   count by the page, and used by nothing. That is survivable only while the
   last clause holds, so the last clause is what is checked — against the
   committed sample, which is what CI has, and against the bank when one is
   beside the checkout. */
const sampleDate = HL_SAMPLE_BOARDS.filter((b) => b.unit === "date");
t('no board in the sample carries unit "date"', sampleDate.length === 0,
  sampleDate.length
    ? `${sampleDate.length} board(s) do, and the page would print a day count: ${sampleDate.map((b) => b.id).join(", ")}`
    : `${HL_SAMPLE_BOARDS.length} sample board(s) checked`);

/* AND THE BANK, WHERE THERE IS ONE. Absent on a runner, which is why the
   sample is checked first and unconditionally: a check that only runs where
   the bank is would be a check CI never performs. */
const BANK = "../Other/HiLoXI/boards";
let bankDate = null;
try {
  if (fs.existsSync(BANK)) {
    bankDate = [];
    for (const f of fs.readdirSync(BANK)) {
      if (!f.endsWith(".json")) continue;
      const b = JSON.parse(fs.readFileSync(BANK + "/" + f, "utf8"));
      if (b && b.unit === "date") bankDate.push(f);
    }
  }
} catch (e) { bankDate = null; }
if (bankDate === null) {
  console.log(`  --    no bank beside this checkout, so only the sample was read  — ${BANK}`);
} else {
  t('no board in the bank carries unit "date" either', bankDate.length === 0,
    bankDate.length ? `${bankDate.length}: ${bankDate.slice(0, 5).join(", ")}`
                    : `${fs.readdirSync(BANK).filter((f) => f.endsWith(".json")).length} board file(s) read`);
}

/* ---- fmt is the only way a value reaches the screen ------------------- */

console.log("");
console.log("=== every value on screen goes through it ===");
/* WITHOUT THIS THE REST IS ABOUT A FUNCTION RATHER THAN ABOUT THE GAME. fmt
   could be perfect and bypassed. Comments are stripped first — this project's
   own rule, because a comment naming a thing satisfies a check meant to
   demand it. */
/* LINE-PRESERVING, because this check REPORTS LINE NUMBERS and a strip that
   collapses a twelve-line comment into one space renumbers everything after
   it. The first run of this suite pointed at game.js:185, which is a line in
   renderForm that has nothing to do with values — a true finding reported at a
   false address is a finding somebody chases and then stops trusting. Block
   comments keep their newlines. */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
const calls = (code.match(/\bfmt\(/g) || []).length;
t("fmt is called from more than one place", calls >= 5, `${calls} call site(s)`);

/* LADDER VALUES ONLY, AND THE NAME SAYS SO. The first version matched
   `.value` as well and flagged game.js:221 — `o.value = c` on an <option> in
   the club picker, which is a DOM property and not a number on a board. A
   check whose name is broader than its behaviour is this project's own stated
   fault; the honest fix was to narrow the BEHAVIOUR and then narrow the NAME
   to match, rather than special-case the line that embarrassed it.
   So this covers the ladder — `values[...]` and `chain[...]`, the numbers a
   player is asked to call — and does not claim to cover every number on the
   page. */
const raw = code.split("\n")
  .map((l, i) => ({ n: i + 1, l }))
  .filter(({ l }) => /textContent\s*=/.test(l))
  .filter(({ l }) => /\bvalues\s*\[|\bchain\s*\[/.test(l))
  .filter(({ l }) => !/\bfmt\s*\(/.test(l));
t("no LADDER value is written to the screen without it", raw.length === 0,
  raw.length ? raw.map((r) => `${GAME}:${r.n}`).join(", ")
             : "every textContent carrying a values[] or chain[] read calls fmt");

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
