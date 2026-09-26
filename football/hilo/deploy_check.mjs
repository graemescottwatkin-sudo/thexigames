/* hilo/deploy_check.mjs — the gate HiLo XI ships through.
 *
 * Run from the repository root, with no node_modules, no package.json and no
 * .wrangler in the tree. Those are checked, because a gate that passes on a
 * machine with build state and fails on Pages has told you nothing.
 *
 *   node hilo/deploy_check.mjs        expect 0 failed
 *
 * THE TAG LAW. LAST_SHIPPED is what is LIVE, and LAST_SHIPPED_ASSETS is a hash
 * of the bytes it names. A tag is burned the moment it ships and never goes
 * backwards. Equal to LAST_SHIPPED is the RESTING state and passes — the tree
 * is what is live. What carries the law is the pair below it: if the bytes
 * changed, the tag must have moved, and if they did not, it must not have.
 *
 * WHAT THIS GATE CANNOT SEE. It reads shape, not truth. The boards are gated
 * by tools/import_hilo.js and verified by the research side against their
 * sources; a green gate here is a well-formed release, not a correct one.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

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
   derives them from the live page rather than trusting anyone's memory.
   v000z is the day before the first release: not v000, which aligned_test
   refuses as a sentinel, and below v001 so the first ship moves past it. */
const LAST_SHIPPED = "v002o";
const LAST_SHIPPED_ASSETS = "7c02db1256587834";

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}

const html = read("football/hilo/index.html");
const js = read("football/hilo/js/game.js");

/* The bytes this game ships, hashed together: the same hash the other gates
   and post_deploy compute — discovered from the page, name, NUL, bytes in a
   stable order. One hash, four gates, one shape. */
function ownAssetHash() {
  const paths = [...html.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)\?v=[^"]*"/g)]
    .map((m) => m[1]).sort();
  if (!paths.length) return null;
  const h = crypto.createHash("sha256");
  for (const p of paths) {
    if (!has("football/hilo/" + p)) return null;
    h.update(p); h.update("\0");
    /* NORMALISED TO LF FIRST. The hash is meant to describe the bytes that
       SHIP, and what ships is what is in git — LF. On a Windows checkout the
       same file is CRLF in the working tree, so the hash depended on which
       tool last wrote the file: a plain `git checkout` of an untouched file
       turned every one of these gates red for a change nobody had made.
       All five places that compute this hash normalise, or they cannot
       agree. */
    h.update(fs.readFileSync(path.join(ROOT, "football", "hilo", p), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 16);
}

console.log("The tag law");
const tag = (html.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1];
t("asset URLs carry a build tag so a cached copy cannot be reused", !!tag, tag);
t("LAST_SHIPPED is a real version, not a sentinel",
  !!LAST_SHIPPED && LAST_SHIPPED !== "v000", `shipped ${LAST_SHIPPED}`);
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
const nowHash = ownAssetHash();
t("the game's own assets cannot change without its build tag moving",
  !!nowHash && (nowHash === LAST_SHIPPED_ASSETS ? tag === LAST_SHIPPED : tag > LAST_SHIPPED),
  nowHash === LAST_SHIPPED_ASSETS ? "unchanged since the last ship" : `changed, and the tag moved ${LAST_SHIPPED} -> ${tag}`);
t("the build tag matches the one the script reports",
  (js.match(/var BUILD = "([^"]+)"/) || [])[1] === tag, tag);
t("every asset the page pulls carries the same tag", (() => {
  const tags = [...html.matchAll(/(?:css|js)\/[a-z_]+\.(?:css|js)\?v=(v[0-9a-z]+)"/g)].map((m) => m[1]);
  return tags.length > 0 && tags.every((x) => x === tag);
})());
t("every relative file reference resolves, exact case", (() => {
  const refs = [...html.matchAll(/(?:src|href)="(?!data:|#|https?:|mailto:|\/)([^"?]+)"?/g)]
    .map((m) => m[1].split("?")[0]).filter((r) => !r.endsWith("/"));
  return refs.every((r) => fs.existsSync(path.join(HERE, r)));
})());

console.log("\nThe tree is clean enough to be Pages");
for (const junk of ["node_modules", "package.json", "package-lock.json", ".wrangler"]) {
  t(`no ${junk} in the repository root`, !has(junk));
}
t("no forbidden files in the game folder", (() => {
  const bad = fs.readdirSync(path.join(ROOT, "football", "hilo")).filter((f) => /\.(zip|sql|bak)$/i.test(f) || f.endsWith(".json"));
  return bad.length === 0;
})(), "a bank or a zip in a served folder is the answer key on the web");

console.log("\nThe values stay on the server");
t("no board source is served from the game folder", !has("football/hilo/boards") && !has("football/hilo/bank"));
t("the production SQL is not in the tree, or is gitignored",
  !has("data/hl-production.sql") || read(".gitignore").includes("data/*-production.sql"));
t("the page holds no value but the first: the judge is the server's",
  /\/api\/hilo\/call/.test(js) && !/chain\b/.test(js.replace(/\/\*[\s\S]*?\*\//g, "")),
  "every call goes up to be marked");
/* EXECUTED, not pattern-matched. This read the source of publicBoard for
   the shape of one line, and the day that line was rewritten to hand over
   LESS — a hidden row as its name alone, after a context gave a call away
   on the live page — the check went red against a stricter truth. A regex
   cannot tell what a function returns; calling it can. */
const { publicBoard } = await import("../../functions/_lib/hl-board.js");
const { HL_SAMPLE_BOARDS } = await import("../../functions/_lib/hl-sample.js");
t("publicBoard hands over the first row and, of every other row, the name alone", (() => {
  const b = HL_SAMPLE_BOARDS[0];
  const pub = publicBoard(b, "t");
  return pub.rows.length === b.chain.length &&
    pub.rows[0].value === b.chain[0].value &&
    pub.rows.slice(1).every((r) => Object.keys(r).join() === "name");
})(), "no value, context, birth date or precision behind the first");

console.log("\nIt is part of the family");
t("the page loads the shared tokens before the shared chrome", (() => {
  const tok = html.indexOf("xi-tokens.css"), chr = html.indexOf("xi-chrome.css");
  return tok > -1 && chr > -1 && tok < chr;
})());
t("it defines no .xic- rules of its own", (() => {
  const css = read("football/hilo/css/style.css");
  let out = "";
  for (let k = 0; k < css.length; k++) {
    if (css[k] === "/" && css[k + 1] === "*") { const end = css.indexOf("*/", k + 2); if (end < 0) break; k = end + 1; continue; }
    out += css[k];
  }
  return out.indexOf(".xic-") === -1;
})());
t("the CSRF header is the family's", /"X-XI-Games"/.test(js));
t("the scoring the page plays is the module the tests read",
  /js\/scoring\.js/.test(html) && /HL_SCORING/.test(js));


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
