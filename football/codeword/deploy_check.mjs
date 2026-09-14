/* football/codeword/deploy_check.mjs — Codeword XI's gate.
 *
 * CODEWORD XI IS NOT LAUNCHED, and most of this file exists to keep it that
 * way until somebody decides otherwise. Grid XI's gate held the same shape
 * before it shipped: assert the ABSENCE of every mark a launch would have to
 * make, so the game cannot go live by drift — by a stray edit, by a sweep that
 * touched every game, or by somebody adding a row to a list because the other
 * ten had one. Launching is then a deliberate edit that turns these round, and
 * the file that refuses it is the file that lists what a launch must include.
 *
 * THE OWNER HAS APPROVED THE INTEGRATION AND NOT A DATE. A shirt number is
 * taken at LAUNCH and Codeword has none; the number and the day are his and he
 * has not set them. So nothing here asserts a shirt, and the block below
 * refuses one being written.
 *
 * WHAT IS REAL TODAY: migration 036, the importer and its gate, the board
 * library and the one endpoint. There is no page yet — the producing side's
 * page reads a board file whole and this server does not serve one, which is a
 * change on their side and not a patch on ours.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (p) => fs.existsSync(path.join(ROOT, p));

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}

/* Comments must not satisfy a check that demands a thing. A grep that matches
   the sentence explaining why something is forbidden is a grep that passes on
   the file that forbids it — found in this project before, and the reason
   every search below reads stripped code. */
const stripped = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

console.log("The tree is clean enough to gate");
for (const junk of ["node_modules", "package.json", ".wrangler"]) {
  t(`no ${junk} in the tree`, !has(junk), "gates run against what ships");
}

console.log("\nThe queue lives in D1, and the folder it came from does not ship");
t("migration 036 exists", has("data/migrations/036-codeword.sql"));
{
  const m = read("data/migrations/036-codeword.sql");
  const code = m.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const stmts = code.split(";").map((s) => s.trim()).filter(Boolean);
  t("it is three statements and nothing else", stmts.length === 3, `${stmts.length} statements`);
  t("and every one is CREATE ... IF NOT EXISTS, so re-running it is safe",
    stmts.every((s) => /^CREATE (TABLE|INDEX) IF NOT EXISTS/i.test(s)));
  t("cw_board is keyed on the ordinal, not the date",
    /CREATE TABLE IF NOT EXISTS cw_board \(\s*\n\s*no\s+INTEGER PRIMARY KEY/.test(m),
    "a reset to day one rewrites every date; the id survives it");
  t("and cw_schedule exists, which is what puts this game in the runway check",
    /CREATE TABLE IF NOT EXISTS cw_schedule/.test(m),
    "runway_check asks sqlite_master for tables ending _schedule");
}
/* THE PACKAGE MUST NOT BE IN THE REPOSITORY. Every board file carries the
   filled grid, all eleven answers and the whole cipher. A year of them staged
   as static files was the defect this integration found; committing them here
   would publish the same thing from a different address. */
t("no Codeword board files have been committed into the tree",
  !has("football/codeword/daily") && !has("data/codeword"),
  "drop/daily is importer input and must never be served");
t("and the generated SQL is not committed either",
  !has("data/cw-production.sql"),
  "the banks are secret; data/*-production.sql is gitignored");

console.log("\nThe importer refuses what the contract says it must");
t("the importer exists", has("tools/import_codeword.js"));
{
  const imp = stripped("tools/import_codeword.js");
  t("it refuses when --source names nothing, rather than falling back",
    /SOURCE_GIVEN/.test(imp),
    "a fallback that gates a different bank reports a clean pass on the wrong thing");
  t("it holds no epoch of its own", !/Date\.UTC\(\s*20\d\d\s*,/.test(imp),
    "the epoch is read from the package and corroborated by manifest.json");
  t("it counts days in UTC, never local",
    /getUTCFullYear/.test(imp) && !/get(FullYear|Month|Date)\b/.test(imp),
    "a local-time ordinal moves the boundary for everyone ahead of UTC");
  t("it strips meta before anything is stored",
    /const \{ meta, \.\.\.rest \} = board/.test(imp),
    "meta is build noise and an import must not fail because a seed changed");
  t("it rewrites the schedule whole, so a re-run does not double the rows",
    /DELETE FROM cw_schedule;/.test(imp));
  t("and writes boards by id, so a re-run replaces them",
    /INSERT OR REPLACE INTO cw_board/.test(imp));
}
t("and its gate is proved by a suite", has("tools/import_codeword_test.mjs"));

console.log("\nThe solution never leaves the database");
t("the board library exists", has("functions/_lib/cw-board.js"));
{
  const lib = stripped("functions/_lib/cw-board.js");
  t("publicBoard is what a browser is handed", /export function publicBoard/.test(lib));
  /* THE ASSERTION THAT CARRIES THIS FILE. The three secret fields must not be
     named in what publicBoard returns. Checked by EXECUTION below as well,
     because a regex cannot tell a field that is returned from one that is
     read on the way past. */
  t("it names the three fields that must never go out",
    /SECRET_FIELDS = \["rows", "words", "code"\]/.test(lib),
    "rows is the answer sheet, words is the same list, code inverts the grid");
}
{
  /* EXECUTED, not grepped. A board is built here, served, and the result
     searched for every answer it contains. */
  const { publicBoard, leaksSolution } = await import("../../functions/_lib/cw-board.js");
  const code = {};
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((L, i) => { code[L] = i + 1; });
  const board = {
    no: 1, day: "2026-09-14", size: 3,
    rows: ["CAT", "ARE", "TEN"],
    words: [["CAT", 0, 0, "a"], ["ARE", 1, 0, "a"], ["TEN", 2, 0, "a"]],
    code, given: ["C", "A", "T"],
    hints: [{ sense: "s", cat: "c", enum: "3", text: "s c" }, { sense: "s", cat: "c", enum: "3", text: "s c" },
      { sense: "s", cat: "c", enum: "3", text: "s c" }],
    breaks: [[], [], []],
  };
  const served = publicBoard(board);
  const blob = JSON.stringify(served);
  t("a served board carries none of the three secret fields",
    leaksSolution(served).length === 0, leaksSolution(served).join(","));
  t("and not one of its answers appears anywhere in the response",
    !board.words.some(([a]) => blob.includes(a)),
    "the numbers are the puzzle; the letters are the solution");
  t("the cipher does not go out whole either",
    !blob.includes('"code"') && served.given.length === 3,
    "three given letters is what the puzzle prints, and 26 is the answer");
  t("what does go out is enough to render",
    served.cells.length === 3 && served.slots.length === 3 &&
      served.slots.every((s) => s.len > 0 && s.text));

  /* THE ABSENT LETTERS, which are printed on the puzzle and are the one field
     added to the sealed shape by request. It narrows the alphabet and that is
     deliberate — a solver should not hunt for a letter the board does not hold.
     What it must never do is name a letter the board DOES hold, which would be
     a mapping given away from the other direction. Derived from the grid, and
     checked against the numbers that actually appear. */
  const distinct = new Set(served.cells.flat().filter((x) => x !== null)).size;
  t("the absent letters account for exactly the numbers that are missing",
    26 - served.absent.length === distinct,
    `${distinct} distinct numbers, ${served.absent.length} absent`);
  t("and not one of them is a letter the grid actually uses",
    !served.absent.some((L) => board.rows.join("").includes(L)),
    served.absent.join(""));
  t("it is derived from the grid, not from the cipher",
    served.absent.length > 0 && !served.absent.includes("C"),
    "CAT/ARE/TEN is six distinct letters, so twenty are absent and C is not one");
}

console.log("\nThe endpoint serves today and nothing else");
t("the daily endpoint exists", has("functions/api/codeword/daily.js"));
{
  const api = stripped("functions/api/codeword/daily.js");
  t("it hands over publicBoard, never the row it read", /publicBoard/.test(api));
  /* THE PAST OPENS AND THE FUTURE NEVER DOES. This shipped asserting the
     opposite — that there was no board number at all — on the reasoning that a
     parameter which must be checked against the future forever is a check that
     can eventually be got wrong. The owner's standard for every game is a daily
     board plus the ones that have gone, so the past has to open; the instinct
     survives as the SHAPE of the bound, which is the schedule's rather than
     arithmetic anybody here does. */
  t("it takes a board number, so the boards that have gone can be opened",
    /searchParams\.get\("no"\)/.test(api));
  t("and a malformed one is refused rather than coerced",
    /\^\[0-9\]\{1,6\}\$/.test(api),
    "the malformed and the sealed must get the same answer");
  {
    const lib = stripped("functions/_lib/cw-board.js");
    t("the bound is the calendar's: a board is reachable only once its day has come",
      /JOIN cw_schedule s ON s\.board_no = b\.no WHERE b\.no = \? AND s\.day <= \?/.test(lib),
      "a board with no scheduled day is not a board — the word search's 233");
  }
  t("its 404 says nothing about why there is no board",
    /"no board"/.test(api) && !/not yet|coming|expired|ended/i.test(api),
    "the difference between two 404s tells a reader the queue depth");
  t("and is neither cached nor indexed",
    /"Cache-Control": "no-store"/.test(api) && /"X-Robots-Tag": "noindex"/.test(api));
}

console.log("\nAnd it is NOT launched, which is the point of this gate");
{
  const games = read("functions/_lib/games.js");
  const inList = (name) => {
    const start = games.indexOf(`export const ${name} =`);
    if (start === -1) return false;
    return games.slice(start, games.indexOf("]", start)).includes('"codeword"');
  };
  t("codeword is not in GAMES", !inList("GAMES"),
    "a game in GAMES is a game whose results the account carries");
  t("and not in BUILT", !inList("BUILT"),
    "BUILT is what may hold a play id; it goes in when the page does");
  t("and has no launch day", !/codeword: "[0-9]{4}-/.test(games),
    "LAUNCHED is what every list counts from, and it is set on the day");
}
{
  const squad = (() => {
    const s = read("shared/xi-chrome.js");
    return s.slice(s.indexOf("var SQUAD"), s.indexOf("var PAGES"));
  })();
  /* NO SHIRT. A shirt is taken at launch and moves down when a game ships past
     it; the owner has approved the work and not a date. This refuses a number
     being written for a game that has not launched — which is the mistake that
     reached this session as a relayed decision and was withdrawn. */
  t("codeword wears no shirt", !/Codeword/.test(squad),
    "a game in build does not hold a number");
}
{
  /* NAMED NOWHERE IN SERVED MARKUP. The family rule, and the one that has to
     survive a sweep: an unreleased game appears as a number and a status and
     nothing else. HTML comments are exempt; this reads the files as served. */
  const pages = ["index.html", "404.html"];
  const named = pages.filter((p) => has(p) &&
    read(p).replace(/<!--[\s\S]*?-->/g, " ").includes("Codeword"));
  t("codeword is named in no served page", named.length === 0, named.join(", "));
  const map = read("functions/sitemap.xml.js");
  t("and is not in the sitemap", !/codeword/.test(map),
    "the sitemap offers a game to a crawler; an unlaunched one has nothing to offer");
}
t("it has no page of its own yet, and the gate says so rather than assuming",
  !has("football/codeword/index.html"),
  "the producing page reads a board file whole; this server serves publicBoard");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
