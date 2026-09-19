/* vowels/deploy_check.mjs — the gate Vowels XI ships through.
 *
 * Run from the repository root, with no node_modules, no package.json and no
 * .wrangler in the tree. Those are checked, because a gate that passes on a
 * machine with build state and fails on Pages has told you nothing.
 *
 *   node vowels/deploy_check.mjs        expect 0 failed
 *
 * THE TAG LAW. LAST_SHIPPED is what is LIVE, and LAST_SHIPPED_ASSETS is a hash
 * of the bytes it names. A tag is burned the moment it ships and never goes
 * backwards. Equal to LAST_SHIPPED is the RESTING state and passes — the tree
 * is what is live. What carries the law is the pair below it: if the bytes
 * changed, the tag must have moved, and if they did not, it must not have.
 *
 * WHAT THIS GATE CANNOT SEE. It reads shape, not truth. It will pass a board
 * whose XI is wrong, a career that belongs to another player, or a scramble
 * that is unfair. The bank is checked by tools/build_scrambled.js --check and
 * by the author who sourced it; a green gate here is a well-formed release,
 * not a correct one.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { gamePath } from "../../functions/_lib/permalink.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* ROOT IS TWO LEVELS UP NOW. The games moved under a theme on 4 Sep 2026 —
   /football/crossword/ — so this file's own folder is one deeper than it was
   and the repository is its grandparent. Every gate read the root as its
   parent and, the moment they moved, reported the whole family missing:
   "functions/ is at the repository root" failed for five games at once. */
const ROOT = path.join(HERE, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (p) => fs.existsSync(path.join(ROOT, p));

/* WHAT IS LIVE. Bump both after a deploy, with tools/post_deploy.mjs, which
   derives them from the live page rather than trusting anyone's memory. */
/* LAUNCH STATE. This game has never deployed, so "what is live" is what is
   about to be: v001 and the bytes generated from Scrambled at that tag. The
   gate is therefore at its RESTING state — tag equals LAST_SHIPPED and the
   hash matches — which is the state the tag law says passes. It is not a
   sentinel: change a byte of the page or the script without moving the tag and
   this refuses, from the very first commit, which is the half of the law that
   carries it. post_deploy will write both from the live page after the first
   deploy, exactly as it does for the other four. */
const LAST_SHIPPED = "v001s";
const LAST_SHIPPED_ASSETS = "a263cab768a02d01";

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}

/* The bytes this game ships, hashed together. Its own assets only: shared/
   carries its own plain vN lifecycle and must not move with the game tag. */
function ownAssetHash() {
  /* THE SAME HASH THE OTHER GATES AND post_deploy COMPUTE, or the bump can
     never match. Discovered from the page, never a hardcoded list — an asset
     added to index.html is covered the day it is added — and hashed as
     name, NUL, bytes in a stable order. The first version of this gate
     hashed a fixed list of bytes only, so the value post_deploy recorded
     could not be reproduced here and the gate went red on the next run for
     a change nobody had made. One hash, three gates, one shape. */
  const paths = [...html.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)\?v=[^"]*"/g)]
    .map((m) => m[1]).sort();
  if (!paths.length) return null;
  const h = crypto.createHash("sha256");
  for (const p of paths) {
    h.update(p); h.update("\0");
    /* NORMALISED TO LF FIRST. The hash is meant to describe the bytes that
       SHIP, and what ships is what is in git — LF. On a Windows checkout the
       same file is CRLF in the working tree, so the hash depended on which
       tool last wrote the file: a plain `git checkout` of an untouched file
       turned every one of these gates red for a change nobody had made.
       All five places that compute this hash normalise, or they cannot
       agree. */
    h.update(fs.readFileSync(path.join(ROOT, "football", "vowels", p), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 16);
}

const html = read("football/vowels/index.html");
const js = read("football/vowels/js/game.js");

console.log("The tag law");
const tag = (html.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1];
t("asset URLs carry a build tag so a cached copy cannot be reused", !!tag, tag);
t("LAST_SHIPPED is a real version, not a sentinel",
  !!LAST_SHIPPED && LAST_SHIPPED !== "v000", `shipped ${LAST_SHIPPED}`);
/* LAST_PRESENTED is NOT checked here. aligned_test asserts it for every game
   in the family, and a file cannot search itself for a string it must contain
   in order to search for it — written both ways, the check matched its own
   text and failed a file that does not declare the constant at all. One fact,
   one place, and the place is the cross-game contract. */
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
t("the build tag never goes backwards", tag >= LAST_SHIPPED,
  `now ${tag}, live ${LAST_SHIPPED}`);
/* The pairing that makes the tag mean something: if the bytes moved, the tag
   must have moved with them, or a browser holding yesterday's copy keeps it. */
const nowHash = ownAssetHash();
t("the game's own assets cannot change without its build tag moving",
  nowHash === LAST_SHIPPED_ASSETS ? tag === LAST_SHIPPED : tag > LAST_SHIPPED,
  nowHash === LAST_SHIPPED_ASSETS
    ? "unchanged since the last ship"
    : `changed, and the tag moved ${LAST_SHIPPED} -> ${tag}`);
t("the build tag matches the one the script reports",
  (js.match(/var BUILD = "([^"]+)"/) || [])[1] === tag, tag);
/* ITS OWN ASSETS, ANCHORED ON THE QUOTE. Inherited from Scrambled's gate,
   where the pattern was unanchored and every asset in the page was the game's
   own. Here it is not: config.js and scoring.js are loaded from
   ../football/scrambled/js/ deliberately — one file, one cache entry, the same rules
   for both games — and they carry SCRAMBLED's tag, which is the point. The
   unanchored pattern matched "js/config.js?v=" inside that longer path and
   failed this game for doing the right thing. ownAssetHash() above was already
   anchored, so the two disagreed about what this game's assets even are. */
t("every asset the page pulls of its OWN carries the same tag", (() => {
  const tags = [...html.matchAll(/(?:src|href)="(?:css|js)\/[a-z_]+\.(?:css|js)\?v=(v[0-9a-z]+)"/g)]
    .map((m) => m[1]);
  return tags.length > 0 && tags.every((x) => x === tag);
})());
/* And the shared rules it borrows are on the tag of the game they belong to,
   which is what "borrowed rather than copied" looks like from here. */
/* MATCHED ON THE PATH THE PAGE ACTUALLY CARRIES, which is absolute now. It
   was written for `../scrambled/js/` and went stale the day the games moved
   under a theme: the relative hop became an absolute path, and this refused
   the game for carrying the very thing it was asserting. Built from
   gamePath() so it moves with the tree instead of being rewritten after it. */
const BORROWED = gamePath("scrambled") + "js/";
t("and the rules it borrows stay on Scrambled's tag", (() => {
  /* Read by splitting on the path rather than by a regex built from it. A
     constructed pattern has to escape the slashes in that path, and doing so
     through two layers of quoting is how the first version of this ended up
     matching nothing at all while looking exactly right. */
  const found = [];
  for (const file of ["config.js", "scoring.js"]) {
    const key = BORROWED + file + "?v=";
    const at = html.indexOf(key);
    if (at < 0) continue;
    const after = html.slice(at + key.length);
    found.push(after.slice(0, after.indexOf('"')));
  }
  return found.length === 2 && found.every((v) => v && v !== tag);
})(), "one file, one cache entry, two games");

console.log("\nThe tree is clean enough to be Pages");
for (const junk of ["node_modules", "package.json", "package-lock.json", ".wrangler"]) {
  t(`no ${junk} in the repository root`, !has(junk));
}
t("no forbidden files in the game folder", (() => {
  const bad = fs.readdirSync(path.join(ROOT, "football", "vowels"))
    .filter((f) => /\.(zip|sql|bak)$/i.test(f) || f === "bank.json");
  return bad.length === 0;
})(), "a bank or a zip in a served folder is the answer key on the web");

console.log("\nThe bank stays secret");
t("no board source is served from the game folder",
  !has("football/vowels/xi") && !has("football/vowels/boards"),
  "sources under a served path are the schedule and the answers");
t("the generated module lives under functions/, which Pages bundles",
  has("functions/_lib/sc-boards.js") && !has("football/vowels/js/sc-boards.js"));
t("and the production SQL is not in the tree", !has("data/sc-production.sql") ||
  read(".gitignore").includes("data/*-production.sql"),
  "gitignored, so it cannot be committed by accident");

console.log("\nThe archive is shut");
t("the open archive flag is off, so tomorrow's board is not public",
  /const OPEN_ARCHIVE = false;/.test(read("functions/_lib/sc-board.js")));

console.log("\nIt is part of the family");
t("the page loads the shared tokens before the shared chrome", (() => {
  const tok = html.indexOf("xi-tokens.css");
  const chr = html.indexOf("xi-chrome.css");
  return tok > -1 && chr > -1 && tok < chr;
})());
/* Comments stripped first. This stylesheet SAYS it defines no .xic- rules, in
   a comment, and the check read that sentence as the thing it forbids —
   failing a file for describing its own compliance. */
t("it defines no .xic- rules of its own", (() => {
  const css = read("football/vowels/css/style.css");
  let out = "";
  for (let k = 0; k < css.length; k++) {
    if (css[k] === "/" && css[k + 1] === "*") {
      const end = css.indexOf("*/", k + 2);
      if (end < 0) break;
      k = end + 1;
      continue;
    }
    out += css[k];
  }
  return out.indexOf(".xic-") === -1;
})(),
  "the chrome is shared; a game restyling it is two chromes");
t("the CSRF header is the family's", /"X-XI-Games"/.test(js));


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
