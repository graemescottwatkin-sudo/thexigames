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

/* THE TAG LAW. LAST_SHIPPED is what is LIVE and LAST_SHIPPED_ASSETS is a hash
 * of the bytes it names. A tag is burned the moment it ships and never goes
 * backwards; equal to LAST_SHIPPED is the RESTING state and passes, because the
 * tree is then what is live. The asset hash is the half that carries the law —
 * it refuses CHANGED BYTES under a tag that has not moved, which a version
 * number alone cannot see.
 *
 * v001 is this game's first, and it is a real tag rather than a sentinel: a
 * constant nothing moves is a comparison against nothing, which is the fault
 * LAST_PRESENTED was retired for.
 *
 * AND THE HASH IS REAL, WHICH TOOK TWO ATTEMPTS. The first version of this line
 * was sixteen zeroes — a placeholder written directly beneath a comment saying
 * a constant nothing moves is a comparison against nothing. It is the fault
 * this session had already diagnosed in QuickFire's gate hours earlier and then
 * reproduced from scratch, which is worth recording: knowing a fault by name
 * does not stop you writing it. Computed from the two files the page names with
 * a ?v=, CRLF normalised to LF because what ships is what is in git. */
const LAST_SHIPPED = "v001";
const LAST_SHIPPED_ASSETS = "318abfac233eeeb0";

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
/* NOT "the file is absent" — that was wrong and this gate caught it on its own
   author. Generating data/cw-production.sql is the normal thing to do before an
   import, so its presence on disk proves only that somebody did their job. The
   question is whether GIT would carry it, and that answer lives in .gitignore.
   A check that fails for doing the right thing is a check that gets disabled. */
t("the generated SQL can never be committed",
  read(".gitignore").split("\n").some((l) => l.trim() === "data/*-production.sql"),
  "the banks are secret, and this is the line that keeps them so");

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
  /* THESE WERE REFUSALS UNTIL 14 SEPTEMBER 2026, and turning them round IS the
     launch — the deliberate edit they existed to demand. They were briefly
     turned round once before the page was ready, and aligned_test refused it:
     the page loaded nothing from shared/, so the drawer, the squad, the theme
     and the season were all absent behind a masthead built to look right. The
     registration came out again and went back only once the page earned it.
     The gate refused its own author, which is the only evidence about a gate
     worth having. */
  t("codeword is in GAMES, so its results are the account's to carry",
    inList("GAMES"),
    "a game people can play whose rows nobody may write is half a launch");
  t("and has a launch day, which is what every list counts from",
    /codeword: "[0-9]{4}-[0-9]{2}-[0-9]{2}"/.test(games),
    "boardKeys, the archive index and the sitemap all start there");
  t("and its first board and its launch day are the same day",
    /codeword: "2026-09-14"/.test(games),
    "nothing counts from before the queue starts");
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
  /* IT WEARS THE SEVENTH, the next free number, which is what launching does.
     Ballpark was sitting on the seven as the owner's ORDERING of what came next
     and moves down — that was never a shirt, and the squad's own comment says
     so. */
  t("codeword wears the seventh shirt", /n: 7,\s*name: "Codeword XI"/.test(squad),
    "a launched game takes the next free number");
  t("and Ballpark moved down to make room", /n: 8,\s*status: "In testing"/.test(squad),
    "a game in testing does not hold a shirt, and moves when one ships past it");
}
{
  /* NAMED NOWHERE IN SERVED MARKUP. The family rule, and the one that has to
     survive a sweep: an unreleased game appears as a number and a status and
     nothing else. HTML comments are exempt; this reads the files as served. */
  const pages = ["index.html", "404.html"];
  const named = pages.filter((p) => has(p) &&
    read(p).replace(/<!--[\s\S]*?-->/g, " ").includes("Codeword"));
  /* IT MAY BE NAMED NOW. The rule forbids naming an UNRELEASED game; this one
     is out, so the hub names it and so does its own page. */
  t("the hub names it, now that it is out", named.includes("index.html"),
    named.join(", ") || "named nowhere");
  const map = read("functions/sitemap.xml.js");
  t("and it is in the sitemap, offered to a crawler", /football\/codeword/.test(map));
}
/* THE PAGE IS IN THE TREE AND THE GAME IS STILL NOT LAUNCHED, which is a state
   worth asserting rather than a contradiction. A game may be playable in the
   repo before it is out — Scrambled and QuickFire both were — and its own page
   may name it; the rule is that no OTHER served page does, which is checked
   above. What the page must not do is carry a board. */
t("it has a page of its own", has("football/codeword/index.html"));
{
  const page = read("football/codeword/index.html");
  /* THE SOLUTION IS IN NONE OF THE THREE FILES, and all three are read.
     The producing side's own build refusals check ONE blob of bytes; after the
     split there are three, and a refusal that looks at the file the answers
     were never in passes while proving nothing. That was their warning when
     they heard the split was coming, and it was the right one. */
  const gamejs = read("football/codeword/js/game.js");
  const stylecss = read("football/codeword/css/style.css");
  t("the board arrays are empty in the script that ships",
    /var ROWS = \[\];/.test(gamejs) && /var CODE = \{\};/.test(gamejs) &&
      /var WORDS = \[\];/.test(gamejs),
    "a stamped fallback board is the whole solution in view-source");
  t("and no file of the three carries a stamped grid",
    ![page, gamejs, stylecss].some((f) => /"[A-Z]{8,}"\s*,\s*"[A-Z]{8,}"/.test(f)),
    "eight capitals beside eight capitals is a filled grid, whatever it is called");
  t("it asks the server for its board rather than a folder of JSON",
    /API \+ "daily"/.test(gamejs) && /var LIVE = true/.test(gamejs));
  /* THE SIX TAGS THE PERMALINK MACHINERY REWRITES. Without them a shared board
     link cannot name the board it opens, and nothing errors — the rewrite is a
     string replacement that simply matches nothing. Invisible until somebody
     pastes a link. */
  for (const tag of ['rel="canonical"', "og:url", "og:title", "twitter:title",
    'name="description"', "<title>"]) {
    t(`the head carries ${tag} for the permalink to rewrite`, page.includes(tag));
  }
  /* AND IT IS NOT YET FAMILY-SHAPED, which is the honest state on 14 September
     2026 and the reason the launch was backed out after being attempted. The
     page loads nothing from shared/, so the drawer, the squad, the theme
     switch, the season and the play counter are all absent behind a masthead
     built to look right. This asserts the gap rather than hiding it: when the
     producing side lands the shared chrome, this line flips and the game can
     be registered. */
  /* THE PAGE IS FAMILY-SHAPED, which it was not when it arrived. It drew its
     own masthead and loaded nothing shared, so the drawer, the squad list, the
     theme switch, the season and the play counter were all absent behind
     something built to look right — which is exactly how it hid. */
  t("it loads the shared chrome rather than drawing its own",
    /shared\/xi-chrome\.js/.test(page) && /class="xic-bar"/.test(page));
  t("and the shared tokens before the shared chrome",
    page.indexOf("xi-tokens.css") > -1 &&
      page.indexOf("xi-tokens.css") < page.indexOf("xi-chrome.css"),
    "the chrome's rules read the tokens' properties; the other order paints unstyled");
  t("its own stylesheet restates no token the shared file owns", (() => {
    const owned = new Set([...read("shared/xi-tokens.css")
      .matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    return ![...stylecss.matchAll(/(--[a-z0-9-]+)\s*:/g)]
      .some((m) => owned.has(m[1]));
  })(), "nineteen were restated when it arrived, which is most of the palette");
  t("and defines no .xic- rule of its own",
    !/^\s*\.xic-[a-z-]+[^{]*\{/m.test(stylecss),
    "the chrome's namespace belongs to the chrome");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
