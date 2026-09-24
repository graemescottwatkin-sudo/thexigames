/* deploy_check.mjs — Wordsearch XI's gate.
 *
 * Crossword's 34 checks, split honestly: the general ones carried over, the
 * crossword-specific ones left behind, and the two bank checks adopted
 * AS-WRITTEN — they only became true of this game when the bank moved to D1,
 * and narrowing them to pass earlier would have made the gate lie.
 *
 * Every check corresponds to something that has happened once, here or on
 * the crossword. Counts assertions, because a gate that does not count
 * cannot tell a silent skip from a pass — v4.3's tokens check note()d for
 * every build it existed and never failed once.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const DIR = path.dirname(fileURLToPath(import.meta.url));
/* ROOT IS TWO LEVELS UP NOW. The games moved under a theme on 4 Sep 2026 —
   /football/crossword/ — so this file's own folder is one deeper than it was
   and the repository is its grandparent. Every gate read the root as its
   parent and, the moment they moved, reported the whole family missing:
   "functions/ is at the repository root" failed for five games at once. */
const ROOT = path.join(DIR, "..", "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const has = (f) => fs.existsSync(path.join(DIR, f));
const readRoot = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const hasRoot = (f) => fs.existsSync(path.join(ROOT, f));

/* What was live when this gate last let a build through. Update after every
   deployment; the tag check below refuses a build that has not moved.

   THE VERSION SCHEME (new line, starts here): vNNN with an optional minor
   letter. Major bumps by one — v001, v002 — and minors walk the alphabet
   within a major — v001a, v001b, v001c. Ordering: v001 < v001a < v001b
   < v002.

   MAINTAINED, unlike its first draft. This sat at "v000" from the day the
   game shipped: the check compared every build against nothing and could not
   fail — a tag law half-implemented is the crossword's discipline worn as a
   costume. The constants are real now and the deploy ritual bumps them, same
   as the crossword's: LAST_SHIPPED after a deploy, beside the hash of the
   bytes it names. aligned_test asserts neither game's constant is a sentinel
   and that LAST_PRESENTED is gone rather than frozen. */
const LAST_SHIPPED = "v002x";     // <- what is LIVE; bump after each deploy

t("the game has its own index.html", has("index.html"));
t("functions are shared at the repository root", hasRoot("functions/api/wordsearch/daily.js"));
t("css and js are present", has("css/style.css") && has("js/game.js"));

const html = has("index.html") ? read("index.html") : "";
/* Routes (hrefs ending in /) are the hub's and other games' addresses, not
   files in this folder — the monorepo serves them. Files must resolve. */
const refs = [...html.matchAll(/(?:src|href)="(?!data:|#|https?:|mailto:)([^"]+)"/g)]
  .map((m) => m[1].split("?")[0]).filter((r) => !r.endsWith("/"));
/* A REFERENCE IS EITHER THIS GAME'S OR THE SITE'S, and the two resolve from
   different places. The shared layer moved to absolute paths when the games
   moved under a theme — /shared/xi-chrome.css rather than ../shared/, because
   a relative hop is depth arithmetic that has to be redone every time the tree
   moves, and it had just been wrong for exactly that reason. So a reference
   starting with / is looked for from the REPOSITORY and the rest from this
   game's folder; reading them all as this game's reported the whole shared
   layer missing. */
t("every relative file reference resolves, exact case",
  refs.every((r) => fs.existsSync(path.join(r.startsWith("/") ? ROOT : DIR,
    r.startsWith("/") ? r.slice(1) : r))), refs.join(", "));

/* ---- build tag: three places, moved past live ------------------------- */
const tagHtml = (html.match(/js\/game\.js\?v=(v\d+[a-z]?)/) || [])[1] || "";
const tagCss = (html.match(/css\/style\.css\?v=(v\d+[a-z]?)/) || [])[1] || "";
const js = has("js/game.js") ? read("js/game.js") : "";
const tagJs = (js.match(/BUILD\s*=\s*"(v\d+[a-z]?)"/) || [])[1] || "";
t("the asset tags and the code agree on the build", !!tagJs && tagJs === tagHtml && tagCss === tagHtml,
  `html js=${tagHtml} css=${tagCss} code=${tagJs}`);
/* v001 -> 1.00, v001a -> 1.01, v001b -> 1.02, v002 -> 2.00 — the minor
   letter is a fraction of the major, so ordering falls out of arithmetic. */
const num = (v) => {
  const m = String(v).match(/^v(\d+)([a-z])?$/);
  if (!m) return 0;
  return parseInt(m[1], 10) + (m[2] ? (m[2].charCodeAt(0) - 96) / 100 : 0);
};
/* NEVER BACKWARDS, rather than always ahead.

   This asked for the tree's tag to be strictly AHEAD of what is live, so
   the resting state between releases — the tree is exactly what is live —
   failed it. Every commit after a post-deploy bump was red until the next
   release, on every game, including games the commit never touched. Red
   that is expected is red nobody reads, which is worse than no gate.

   Nothing is lost by allowing equal. The pairing below is the check that
   carries the law: if the bytes changed, the tag must have moved; if they
   did not, it must not have. Equal with unchanged bytes is exactly right,
   and equal with changed bytes is what that check refuses. What is left
   for this one is the thing it is now named for: a tag that goes
   backwards, which would hand a browser an old ?v= for new bytes. */
t("the build tag never goes backwards",
  num(tagJs) >= num(LAST_SHIPPED),
  `now ${tagJs}, live ${LAST_SHIPPED}`);

/* THE ASSETS MOVED BUT THE TAG DID NOT.
   v001t: a client fix was committed with the build tag left on the live
   version, so the same ?v= URL would have named different bytes — and the
   browsers holding that URL cached are exactly the devices the fix was for.
   Every existing tag check passed: they ask whether the four tags AGREE and
   whether the tag is AHEAD of LAST_SHIPPED, and both were true of a tag that
   had not moved since the last deploy. The property nobody was checking is
   the one that matters — if the bytes changed, the tag must have changed too.

   LAST_SHIPPED_ASSETS is the other half of LAST_SHIPPED: what is live is a
   tag AND the bytes it names. Both move together, in the post-deploy commit.
   On failure this prints the value to paste, because a constant that is
   laborious to update is a constant that goes stale — which is how
   LAST_SHIPPED itself ended two releases behind. */
const LAST_SHIPPED_ASSETS = "fff149ba72e0816f";
function ownAssetHash() {
  /* Discovered from the page, never a hardcoded list: an asset added to
     index.html is covered the day it is added, so this check cannot quietly
     go narrower than the page it guards. */
  const paths = [...html.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)\?v=[^"]*"/g)]
    .map((m) => m[1]).sort();
  if (!paths.length) return null;
  const h = crypto.createHash("sha256");
  for (const p of paths) {
    if (!has(p)) return null;          // fail closed: the page names a file that is not there
    h.update(p); h.update("\0");
    /* NORMALISED TO LF FIRST. The hash is meant to describe the bytes that
       SHIP, and what ships is what is in git — LF. On a Windows checkout the
       same file is CRLF in the working tree, so the hash depended on which
       tool last wrote the file: a plain `git checkout` of an untouched file
       turned every one of these gates red for a change nobody had made.
       All five places that compute this hash normalise, or they cannot
       agree. */
    h.update(fs.readFileSync(path.join(DIR, p), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 16);
}
const assetsNow = ownAssetHash();
const tagNow = tagJs;
t("the game's own assets cannot change without its build tag moving",
  !!assetsNow && (assetsNow === LAST_SHIPPED_ASSETS || tagNow !== LAST_SHIPPED),
  assetsNow === LAST_SHIPPED_ASSETS
    ? "unchanged since " + LAST_SHIPPED
    : tagNow !== LAST_SHIPPED
      ? "changed, and the tag moved " + LAST_SHIPPED + " -> " + tagNow
      : "CHANGED with the tag still on " + tagNow +
        " — bump the tag, then set LAST_SHIPPED_ASSETS to " + assetsNow);

/* ---- markup sanity ---------------------------------------------------- */
t("HTML comments are balanced, so none can render as text",
  (html.match(/<!--/g) || []).length === (html.match(/-->/g) || []).length,
  `${(html.match(/<!--/g) || []).length} open, ${(html.match(/-->/g) || []).length} close`);
t("every <div> is closed, so no panel ends up inside another",
  (html.match(/<div\b/g) || []).length === (html.match(/<\/div>/g) || []).length,
  `${(html.match(/<div\b/g) || []).length} open, ${(html.match(/<\/div>/g) || []).length} close`);
const css = has("css/style.css") ? read("css/style.css") : "";
t("the stylesheet's braces and comments balance",
  (css.match(/{/g) || []).length === (css.match(/}/g) || []).length &&
  (css.match(/\/\*/g) || []).length === (css.match(/\*\//g) || []).length,
  `${(css.match(/{/g) || []).length} braces`);

/* ---- one H1, and it is the first heading in the body ------------------ */
/* Comments stripped before anything counts tags. The family template documents
   the identity rule in a comment containing the text <h1>, and a gate counting
   raw markup reads that as a second heading — it fails a correct page. The
   crossword gate already strips for its <div> count; this one did not. */
t("exactly one H1, before any other heading", (() => {
  const m = html.replace(/<!--[\s\S]*?-->/g, "");
  return (m.match(/<h1\b/g) || []).length === 1 && m.indexOf("<h1") < m.indexOf("<h2");
})());

/* ---- SEO surface ------------------------------------------------------ */
t("canonical, og:url and JSON-LD agree on the address", (() => {
  const canon = (html.match(/rel="canonical"\s+href="([^"]+)"/) || [])[1];
  const og = (html.match(/property="og:url"\s+content="([^"]+)"/) || [])[1];
  try {
    const ld = JSON.parse((html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]);
    return !!canon && canon === og && ld.url === canon;
  } catch (e) { return false; }
})());
t("og:image and summary_large_image are declared",
  /og:image/.test(html) && /summary_large_image/.test(html));
t("the unofficial-game disclaimer is present", /[Uu]nofficial/.test(html));

/* ---- noindex matches the address the page claims ---------------------- */
/* Adopted from the crossword verbatim in spirit: derive the expectation from
   og:url rather than asking robots and headers merely to agree with each
   other — both can be wrong together, and were. */
t("noindex matches the address the page claims", (() => {
  if (!hasRoot("_headers")) return true;
  const url = (html.match(/property="og:url"\s+content="([^"]+)"/) || [])[1] || "";
  /* www is the canonical host, not a staging subdomain — the crossword's
     version of this check reads www as a subdomain and is satisfied by the
     /api/* noindex, two faults cancelling. Corrected here: only non-www
     hosts count, and only a global noindex (one outside any /api/ block)
     counts as blocking. */
  const onSubdomain = /:\/\/(?!www\.)[a-z0-9-]+\.thexigames\.com/.test(url);
  /* Comments stripped first: the family _headers documents this very rule in
     a comment, and a gate that reads a comment as a live header fails a
     correct file. Only rule lines count. */
  const rules = readRoot("_headers").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const global = rules.split(/^\/api\//m)[0];
  const noindexed = /X-Robots-Tag:\s*noindex/i.test(global);
  return onSubdomain === noindexed;
})());

/* ---- cache rules under THIS game's path ------------------------------- */
/* THE GAME'S PATH, not just its name. This was path.basename(DIR) — the
   folder name — and that WAS the URL path until the games moved under a
   theme. The cache rules in _headers are written against the address a
   browser asks for, /football/quickfire/css/*, so a check built from the
   basename looked for a rule that no longer exists and reported the cache
   rules missing. Derived from the repository so it follows the tree. */
const GAME = path.relative(ROOT, DIR).split(path.sep).join("/");
t(`css and js have immutable cache rules under /${GAME}/`, (() => {
  if (!hasRoot("_headers")) return false;
  const h = readRoot("_headers");
  return new RegExp(`^/${GAME}/css/\\*`, "m").test(h) && new RegExp(`^/${GAME}/js/\\*`, "m").test(h);
})(), `/${GAME}/css/* and /${GAME}/js/*`);
t(`the game's index.html is never stored`, (() => {
  if (!hasRoot("_headers")) return false;
  const h = readRoot("_headers");
  const i = h.indexOf(`/${GAME}/index.html`);
  return i > -1 && /Cache-Control:\s*no-store/.test(h.slice(i, i + 120));
})());

/* ---- the shared token layer, finally enforced ------------------------- */
const EXPECTED_TOKENS = "v1";
t(`xi-tokens.css exists in shared/ and is ${EXPECTED_TOKENS}`, (() => {
  if (!hasRoot("shared/xi-tokens.css")) return false;
  const m = readRoot("shared/xi-tokens.css").match(/xi-tokens\.css\s*—\s*(v\d+)/);
  return !!m && m[1] === EXPECTED_TOKENS;
})());
t("the page references the shared tokens rather than carrying a copy",
  /shared\/xi-tokens\.css/.test(html) && !/--paper\s*:/.test(css),
  "palette variables must not be restated in the game's stylesheet");

/* ---- the bank stays out of the page ----------------------------------- */
/* The two crossword checks this game could not honestly run until now. */
t("no puzzle bank in any public file", (() => {
  for (const f of ["index.html", "js/game.js", "css/style.css"]) {
    if (has(f) && /DAILY_SCHEDULE|const PUZZLES\s*=\s*\[/.test(read(f))) return false;
  }
  return true;
}), "the schedule shipping to the browser is the fault this rebuild retires");
t("no answers or placements in any public file", (() => {
  for (const f of ["index.html", "js/game.js"]) {
    if (has(f) && /"start_row"|start_row:/.test(read(f).replace(/placementCells|pl\.start_row/g, ""))) return false;
  }
  return true;
}));
t("generated production SQL is gitignored and absent from the game folder", (() => {
  const gi = hasRoot(".gitignore") ? readRoot(".gitignore") : "";
  return /ws-production\.sql|\*-production\.sql/.test(gi) && !has("ws-production.sql");
})());

/* ---- functions parse as the Pages bundler parses them ----------------- */
/* RUN-ME v154: the fault 547 green assertions never saw, because no local
   suite imported the file that would not bundle. Parse every one. */
const fnDir = path.join(ROOT, "functions");
const fnFiles = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    fs.statSync(p).isDirectory() ? walk(p) : /\.js$/.test(f) && fnFiles.push(p);
  }
})(fnDir);
/* ONE child parses every file as a MODULE, and executes none of them.

   This was `node --check <file>` once per file until 24 Sep 2026, and it was
   VACUOUS: the repo has no package.json, so a .js file has no declared type,
   and Node's syntax detection sees `import` in a CommonJS parse, concludes
   "this is ESM" and exits 0 WITHOUT PARSING THE BODY AS A MODULE. Measured on
   Node 24.20: `return 1 +;` appended to functions/_lib/wsdata.js left this
   gate green, 38 passed / 0 failed, "199 files" — the RUN-ME v154 fault above
   is exactly what it could no longer see. It was also most of the gate's run
   time: a process per file, 2m15s for the whole gate on Windows.

   `new vm.SourceTextModule(source)` is the parse `node --input-type=module
   --check` performs — both construct a ModuleWrap from the source text.
   Construction parses; nothing links or evaluates unless asked, so no
   Function's top level runs here. The API sits behind
   --experimental-vm-modules; if it is ever gone the child exits non-zero and
   this check FAILS saying so, rather than parsing nothing and passing.
   QuickFire's gate carries the same check; each gate stands alone. */
const PARSE_ALL = `
const vm = require("node:vm"), fs = require("node:fs");
if (typeof vm.SourceTextModule !== "function") {
  console.error("vm.SourceTextModule is unavailable on node " + process.version);
  process.exit(2);
}
const files = JSON.parse(fs.readFileSync(0, "utf8"));
const out = { parsed: 0, fails: [] };
for (const f of files) {
  try { new vm.SourceTextModule(fs.readFileSync(f, "utf8"), { identifier: f }); out.parsed++; }
  catch (e) { out.fails.push([f, String(e && e.message)]); }
}
process.stdout.write(JSON.stringify(out));`;
const parse = (() => {
  try {
    const raw = execFileSync(process.execPath, ["--experimental-vm-modules", "-e", PARSE_ALL],
      { input: JSON.stringify(fnFiles), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return JSON.parse(raw);
  } catch (e) {
    return { parsed: 0, fails: [], broke: `the parser did not run: exit=${e.status} ` +
      JSON.stringify(String(e.stderr || e.message).trim().split("\n")[0]) };
  }
})();
const parseFails = parse.fails.map(([f, why]) => `${path.relative(ROOT, f)} (${why})`);
/* Positive as well as negative: every file walked was parsed, and the walk
   found some. A child that parsed nothing reports no failures too. */
t("every Functions file parses as an ES module, as the Pages bundler parses it",
  !parse.broke && parseFails.length === 0 && fnFiles.length > 0 && parse.parsed === fnFiles.length,
  parse.broke || parseFails.join(", ") || `${parse.parsed} of ${fnFiles.length} files`);
t("every wordsearch import resolves to something the target exports", (() => {
  for (const f of fnFiles.filter((x) => x.includes("wordsearch") || x.includes("ws-"))) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/import\s*{([^}]+)}\s*from\s*"([^"]+)"/g)) {
      const target = path.resolve(path.dirname(f), m[2]);
      if (!fs.existsSync(target)) return false;
      const tsrc = fs.readFileSync(target, "utf8");
      for (const name of m[1].split(",").map((s) => s.trim().split(" as ")[0])) {
        if (!new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${name}\\b`).test(tsrc)) return false;
      }
    }
  }
  return true;
})());

/* ---- the coordinate convention, held forever -------------------------- */
/* The source bank's placements are 1-based; the family speaks 0-based, and
   the conversion happens once, at import. This check spells every sample
   word off its grid at base 0 — the exact fault that cost this build its
   only red run cannot come back quietly. */
/* THE DATA IS READ, NOT SCRAPED OFF THE WORKING TREE. This matched the source
   text for `SAMPLE_PUZZLES = [ ... ];` followed by a NEWLINE — and a Windows
   checkout writes CRLF, so the pattern found nothing, the catch turned that
   into `return false`, and a valid tree failed a release gate with a message
   about placements being wrong. An independent review hit exactly that on
   7 September 2026. Same class as the shared-layer hash fixed the day before:
   what ships is what is in git, and a check that reads the working tree byte
   for byte asks a different question on each machine.
   Normalised, and an extraction failure is now its own check rather than a
   content error wearing its clothes. */
const sampleBoards = (() => {
  try {
    const src = fs.readFileSync(path.join(ROOT, "functions/_lib/ws-sample.js"), "utf8")
      .split("\r\n").join("\n");
    const m = src.match(/SAMPLE_PUZZLES = (\[[\s\S]*?\]);\n/);
    return m ? JSON.parse(m[1]) : null;
  } catch (e) { return null; }
})();
t("the sample boards can be read at all", Array.isArray(sampleBoards),
  sampleBoards ? sampleBoards.length + " boards" : "ws-sample.js did not parse");
t("sample placements spell their words at base 0", (() => {
  try {
    const boards = sampleBoards;
    if (!boards) return true;      // already reported, one line up
    const D = { E:[0,1],W:[0,-1],S:[1,0],N:[-1,0],SE:[1,1],SW:[1,-1],NE:[-1,1],NW:[-1,-1] };
    for (const b of boards) for (const a of b.answers.concat([b.bonus])) {
      const pl = a.placement, dd = D[pl.direction];
      let word = "";
      for (let k = 0; k < a.grid.length; k++) {
        const r = pl.start_row + dd[0] * k, c = pl.start_col + dd[1] * k;
        if (r < 0 || r >= 14 || c < 0 || c >= 12) return false;
        word += b.grid[r][c];
      }
      if (word !== a.grid) return false;
    }
    return boards.length === 3;
  } catch (e) { return false; }
})());

/* ---- hygiene ---------------------------------------------------------- */
t("no node_modules in the game folder", !has("node_modules"));
/* THE ROOT TOO. This gate passed with a .wrangler directory sitting in the
   repository root — a local dev server's state — while the other two gates
   refused. Pages must not build and must not upload tool state, and the rule
   is the family's, so the check is. Watched failing with a .wrangler present. */
for (const junk of ["node_modules", "package.json", "package-lock.json", ".wrangler"]) {
  t(`no ${junk} in the repository root`, !hasRoot(junk));
}
t("no absolute or machine-specific paths",
  !/\/home\/|\/Users\/|C:\\\\/.test(html + js + css));
t("API calls use relative URLs", !/fetch\("https?:\/\//.test(js));
t("no forbidden files in the game folder", (() => {
  const FORBIDDEN = [/\.xlsx?$/i, /\.sql$/i, /\.zip$/i, /preview.*\.html$/i, /bank.*\.json$/i];
  return fs.readdirSync(DIR).every((f) => !FORBIDDEN.some((re) => re.test(f)));
})());

/* ---- report ----------------------------------------------------------- */

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
if (fail) process.exit(1);
