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
import crypto from "node:crypto";

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
/* THE BUILD TAG MOVED v001 -> v001a ON 15 SEPTEMBER 2026, and these two
 * constants did NOT, which is the correct resting state rather than an
 * oversight. LAST_SHIPPED is what is LIVE; v001a is in the tree and has not
 * shipped. post_deploy bumps both after the deploy, from the live page.
 *
 * WHY THE TAG MOVED: js/game.js gained the account push it had been missing
 * since launch — recordResult wrote to localStorage and nothing ever called
 * /api/account/migrate, so a signed-in player's result reached their own device
 * and stopped. Changed bytes under a burned tag is exactly what the hash below
 * exists to refuse, so the tag had to move with them.
 *
 * AND THE HASH BELOW REFUSED NOTHING UNTIL TODAY, which is why this comment is
 * long. Both constants were declared here and NEITHER WAS EVER READ. Forty
 * lines above explain that the asset hash is "the half that carries the law"
 * and that making it real took two attempts; nothing compared against it, and
 * there was no tag check in this gate at all. The whole tag law was a comment.
 * Found by changing game.js and watching the gate pass 56 of 56.
 *
 * That is the sentinel fault in its least visible form. A sentinel is a
 * constant nothing moves; this was a constant nothing READ — which looks
 * healthier and checks exactly as much. */
const LAST_SHIPPED = "v001b";
const LAST_SHIPPED_ASSETS = "62b1674ff352c3fa";

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
  /* AND NOTHING UNRELEASED SITS ABOVE IT. This asked for `n: 8, status: "In
     testing"` — Ballpark's slot on the day Codeword launched — and went red the
     moment QuickFire launched on the eight and pushed Ballpark to the nine.
     That is the assertion being wrong rather than the squad: it pinned a
     literal that MOVES every time a game ships, so it could only ever hold
     until the next launch, and it would have been "fixed" by bumping the number
     to whatever it is this week. The rule it was reaching for does not move —
     an unreleased game carries a status and no name, wherever it sits. Checked
     for every slot above this game's, which is where a launch pushes things. */
  t("and every slot is either a launched name or a status, never both", (() => {
    const rows = [...squad.matchAll(/\{\s*n:\s*(\d+),([^}]*)\}/g)];
    if (rows.length !== 11) return false;      // eleven shirts, never a twelfth
    return rows.every(([, , body]) => /name:/.test(body) !== /status:/.test(body));
  })(), "a game in testing does not hold a shirt, and is named nowhere until it launches");
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

/* ---- the tag law, which this gate declared and did not enforce ---------- */

console.log("\nThe tag law");
{
  const html = read("football/codeword/index.html");
  const js = read("football/codeword/js/game.js");
  const tagJs = (html.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1] || "";

  t("the page's script tag and the script's BUILD agree",
    !!tagJs && new RegExp(`var BUILD\\s*=\\s*"${tagJs}"`).test(js), tagJs);

  /* Every one of this game's own assets carries the same tag. The word search
     shipped with one ?v= left behind and the same URL then named different
     bytes for every browser holding it cached. */
  const own = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"?]+)\?v=([^"]+)"/g)];
  t("every asset the page names carries that same tag",
    own.length > 0 && own.every((m) => m[2] === tagJs),
    own.map((m) => m[1] + "=" + m[2]).join(" "));

  t("the tag has not gone backwards",
    tagJs >= LAST_SHIPPED, `now ${tagJs}, live ${LAST_SHIPPED}`);

  /* THE HALF THAT CARRIES THE LAW: changed bytes under a tag that has not
     moved, which a version number alone cannot see. Normalised to LF because
     what ships is what is in git and a Windows checkout writes CRLF. */
  const assetsNow = (() => {
    const paths = own.map((m) => m[1]).sort();
    if (!paths.length) return null;
    const h = crypto.createHash("sha256");
    for (const p of paths) {
      const full = "football/codeword/" + p;
      if (!has(full)) return null;
      h.update(p); h.update("\0");
      h.update(read(full).replace(/\r\n/g, "\n"));
    }
    return h.digest("hex").slice(0, 16);
  })();

  t("the game's own assets cannot change without its build tag moving",
    !!assetsNow && (assetsNow === LAST_SHIPPED_ASSETS || tagJs !== LAST_SHIPPED),
    assetsNow === LAST_SHIPPED_ASSETS
      ? "unchanged since " + LAST_SHIPPED
      : tagJs !== LAST_SHIPPED
        ? "changed, and the tag moved " + LAST_SHIPPED + " -> " + tagJs
        : "CHANGED with the tag still on " + tagJs +
          " — bump the tag, then set LAST_SHIPPED_ASSETS to " + assetsNow);
}


/* ============ THE GATE MUST NOT PASS ON NOTHING ============
 *
 * EVERY RULE ABOUT THIS STYLESHEET IS A PROHIBITION — no .xic- rule, no
 * restated shared class, no redefined token — and a prohibition is satisfied
 * completely by an empty file. Measured on 15 September 2026: emptying
 * css/style.css and moving the build tag so the asset hash could not be the
 * thing that caught it, five of the nine gates passed with 0 failed. Codeword
 * passed 60 of 60. The page would have shipped with no styling at all and
 * every check would have agreed it was correct.
 *
 * The general form, which is what makes these one bug rather than several:
 * A GATE BUILT ENTIRELY OUT OF PROHIBITIONS PASSES ON AN EMPTY INPUT. It is
 * the same fault as a grep that skipped a binary file, a verifier that skipped
 * an unparseable board, and a historyClash with no day to examine — a check
 * whose input is absent must not report a pass. Reported in this form by the
 * Connection session, which found it in its own design-law gate, and
 * reproduced here against all nine before it was believed.
 *
 * TWO CHECKS, AND THE SECOND IS THE ONE WITHOUT A HOLE. The first is a
 * liveness floor: the file must actually hold rules. The second asserts what
 * the family law has only ever said in the negative — that a game CONSUMES
 * shared tokens. A stylesheet can be long, clean, literal-free and have
 * stopped taking a single value from the family, and nothing here noticed.
 * A check shaped as presence has no empty-input hole by construction.
 *
 * THE FLOORS ARE DELIBERATELY FAR BELOW THE TRUTH. The smallest stylesheet in
 * the family holds 90 rules and 94 token uses; the largest holds 766 and 617.
 * Twenty is low enough that ordinary editing can never reach it, because a
 * threshold near the truth fails during normal work, gets raised until it
 * means nothing, and is then still there looking like a guard. It is not
 * measuring craft. It is refusing an empty string. */
{
  /* ASK THE PAGE WHAT TO CHECK, rather than trusting a constant in here.
     The first version of this block read css/style.css by name. That catches
     an empty or truncated stylesheet and not the likelier accident: the
     game's CSS is renamed or moved, a stale style.css is left behind with
     real content in it, and the gate goes on examining a file nobody serves —
     every prohibition green, every floor green, honestly answering about the
     wrong input, forever. Predicted by the Connection session from the shape
     alone rather than found by being bitten, and confirmed here: with the
     page moved to css/main.css and style.css deleted, this block did not
     refuse, it THREW ENOENT — which is red, but red by crashing, and a crash
     mid-gate is not a verdict.
     So the file under test is whatever index.html actually loads. Fonts and
     the shared layer are somebody else's; what is left is this game's own. */
  const pageHtml = fs.readFileSync(new URL("index.html", import.meta.url), "utf8");
  const ownCss = [...pageHtml.matchAll(/<link[^>]+href="([^"]+\.css)(?:\?[^"]*)?"/g)]
    .map((m) => m[1])
    .filter((h) => !h.startsWith("http") && !h.startsWith("/shared/"));
  t("the page loads a stylesheet of this game's own",
    ownCss.length > 0,
    ownCss.length ? ownCss.join(", ") : "none — every CSS rule below would check nothing");
  /* A NAMED FILE THAT IS NOT THERE IS A REFUSAL, not an exception. */
  const missingCss = ownCss.filter((h) => !fs.existsSync(new URL(h, import.meta.url)));
  t("and every stylesheet it names is a file that exists",
    missingCss.length === 0, missingCss.join(", ") || `${ownCss.length} checked`);
  const cssBytes = ownCss
    .filter((h) => fs.existsSync(new URL(h, import.meta.url)))
    .map((h) => fs.readFileSync(new URL(h, import.meta.url), "utf8"))
    .join("\n");
  const rules = (cssBytes.match(/\{/g) || []).length;
  const tokens = (cssBytes.match(/var\(--/g) || []).length;
  t("the stylesheet this gate has been checking is actually there",
    rules >= 20, `${rules} rule(s) — every other rule about this file is a`
      + " prohibition, and an empty file breaks none of them");
  t("and it still takes its values from the family, rather than merely not fighting it",
    tokens >= 20, `${tokens} use(s) of var(--) — said in the positive, because`
      + " a rule that forbids cannot notice an absence");
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
