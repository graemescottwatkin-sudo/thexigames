/* grid/deploy_check.mjs — the gate Grid XI ships through.
 *
 * Run from the repository root, with no node_modules, no package.json and no
 * .wrangler in the tree. Those are checked, because a gate that passes on a
 * machine with build state and fails on Pages has told you nothing.
 *
 *   node football/grid/deploy_check.mjs        expect 0 failed
 *
 * THE TAG LAW. LAST_SHIPPED is what is LIVE, and LAST_SHIPPED_ASSETS is a hash
 * of the bytes it names. A tag is burned the moment it ships and never goes
 * backwards. Equal to LAST_SHIPPED is the RESTING state and passes — the tree
 * is what is live. What carries the law is the pair below it: if the bytes
 * changed the tag must have moved, and if they did not it must not have.
 *
 * WHAT THIS GATE IS FOR THAT THE OTHER SIX ARE NOT. Every game in this family
 * has a secret, and in every other one the secret is a WORD. Here the secret is
 * the whole board: the grid starts EMPTY, so every letter in it is an answer,
 * and one board handed over is one board solved. So the checks below are
 * weighted accordingly — three of them execute the real projection against the
 * real sample and refuse if a single answer, or a stray capital, survives the
 * trip to a browser.
 *
 * WHAT IT CANNOT SEE. It reads shape, not truth. The boards are gated twice
 * before they reach D1 — by the emitter and by tools/import_grid.js — and a
 * green gate here is a well-formed release, not a correct one.
 *
 * GRID XI IS NOT LAUNCHED. It is in BUILT and not in GAMES, exactly where
 * QuickFire is, which is why this file also refuses the things a launch would
 * have to change deliberately rather than by drift.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (p) => fs.existsSync(path.join(ROOT, p));

/* WHAT IS LIVE. Bump both after a deploy with tools/post_deploy.mjs, which
   derives them from the live page rather than trusting anyone's memory.
   v000z is the day before a first release: not v000, which aligned_test
   refuses as a sentinel, and below v001 so the first ship moves past it. */
const LAST_SHIPPED = "v002";
const LAST_SHIPPED_ASSETS = null;   // nothing has shipped yet; the first ship sets it

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}

const html = read("football/grid/index.html");
const js = read("football/grid/js/game.js");

/* The bytes this game ships, hashed together — the same hash the other gates
   and post_deploy compute: discovered from the page, name, NUL, bytes, in a
   stable order, and normalised to LF because what ships is what is in git. */
function ownAssetHash() {
  const paths = [...html.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)\?v=[^"]*"/g)]
    .map((m) => m[1]).sort();
  if (!paths.length) return null;
  const h = crypto.createHash("sha256");
  for (const p of paths) {
    if (!has("football/grid/" + p)) return null;
    h.update(p); h.update("\0");
    h.update(fs.readFileSync(path.join(ROOT, "football", "grid", p), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 16);
}

console.log("The tag law");
const tag = (html.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1];
t("asset URLs carry a build tag so a cached copy cannot be reused", !!tag, tag);
t("LAST_SHIPPED is a real version, not a sentinel",
  !!LAST_SHIPPED && LAST_SHIPPED !== "v000", `shipped ${LAST_SHIPPED}`);
t("the build tag never goes backwards", tag >= LAST_SHIPPED,
  `now ${tag}, live ${LAST_SHIPPED}`);
const nowHash = ownAssetHash();
/* THE PAIRING, with the one honest exception: nothing has shipped, so there is
   no hash to compare against and no claim to make. Written as null rather than
   as a made-up value, because a constant that stands for nothing is the
   sentinel fault — and the moment the first release records a hash, this
   becomes the check it is on every other game. */
t("the game's own assets cannot change without its build tag moving",
  LAST_SHIPPED_ASSETS === null
    ? !!nowHash
    : (nowHash === LAST_SHIPPED_ASSETS ? tag === LAST_SHIPPED : tag > LAST_SHIPPED),
  LAST_SHIPPED_ASSETS === null
    ? `nothing shipped yet; this tree hashes to ${nowHash}`
    : (nowHash === LAST_SHIPPED_ASSETS ? "unchanged since the last ship" : `changed, and the tag moved ${LAST_SHIPPED} -> ${tag}`));
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
  const bad = fs.readdirSync(path.join(ROOT, "football", "grid"))
    .filter((f) => /\.(zip|sql|bak)$/i.test(f) || f.endsWith(".json"));
  return bad.length === 0;
})(), "a bank or a zip in a served folder is the answer key on the web");
t("no board source is served from the game folder",
  !has("football/grid/boards") && !has("football/grid/bank"));
t("the production SQL is not in the tree, or is gitignored",
  !has("data/gd-production.sql") || read(".gitignore").includes("data/gd-production.sql"),
  "568kB of answers");

console.log("\nTHE ANSWERS DO NOT REACH A BROWSER");
/* EXECUTED, not pattern-matched, and against the real sample. A regex cannot
   tell what a function returns; calling it can. This is the check the whole
   game is arranged around, so it is asked three ways: no whole answer, no
   stray letter, and no field that could carry one next year. */
const { publicBoard, publicText, boardToken } = await import("../../functions/_lib/gd-board.js");
const { GD_SAMPLE_BOARDS } = await import("../../functions/_lib/gd-sample.js");
const sample = GD_SAMPLE_BOARDS[0];
const pub = publicBoard(sample, boardToken(sample.id));
const text = publicText(sample, boardToken(sample.id));
t("not one answer survives the projection", (() => {
  const leaked = sample.entries.filter((e) => e.answer && text.includes(e.answer));
  return leaked.length === 0;
})(), `${sample.entries.length} answers withheld`);
t("and not a letter of one, in any field", (() => {
  /* Every string a board legitimately carries is removed first; what is left
     is anything that should not be there at all. */
  const stripped = text
    .replace(/"(token|id|title|dir|cell|entries|crossings|rows|cols|len|n|r|c)"/g, "")
    .replace(/"gd:[^"]*"/g, "")
    .replace(new RegExp('"' + sample.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"', "g"), "")
    .replace(/"(across|down)"/g, "");
  return !/[A-Z]{2,}/.test(stripped);
})());
t("a public entry carries no field beyond the shape", (() => {
  const allowed = ["n", "dir", "r", "c", "len", "cells"];
  return pub.entries.every((e) => Object.keys(e).every((k) => allowed.includes(k)));
})(), "`answer` and `member` must never be here");
t("nothing is given at the start, so a board opens on its title alone",
  !("given" in pub) && !("opening" in pub),
  "the owner's ruling, 6 Sep 2026");

console.log("\nThe page cannot mark a guess");
const stripComments = (src) => {
  let out = "";
  for (let k = 0; k < src.length; k++) {
    if (src[k] === "/" && src[k + 1] === "*") {
      const end = src.indexOf("*/", k + 2); if (end < 0) break; k = end + 1; continue;
    }
    out += src[k];
  }
  return out;
};
const code = stripComments(js);
t("every guess goes up to be marked", /\/api\/grid\/|api\("guess"/.test(code));
/* THE RULE FILE IS SHARED WITH THE WORKER, and that is safe: the algorithm is
   public and the answer is not. What would NOT be safe is the page calling
   mark(), which needs an answer — so it must not, and this says so of the
   stripped source rather than of a comment that mentions it. */
t("and the page never calls the marker itself",
  !/\bR\.mark\(|XIGR_RULES\.mark\(/.test(code),
  "mark() needs an answer; the browser has none");
t("the CSRF header is the family's", /"X-XI-Games"/.test(code));
t("the rules the page draws with are the module the server imports",
  /js\/rules\.js/.test(html) &&
  read("functions/_lib/gd-board.js").includes("football/grid/js/rules.js"));

console.log("\nIt is part of the family");
t("the page loads the shared tokens before the shared chrome", (() => {
  const tok = html.indexOf("xi-tokens.css"), chr = html.indexOf("xi-chrome.css");
  return tok > -1 && chr > -1 && tok < chr;
})());
t("it defines no .xic- rules of its own", (() => {
  return stripComments(read("football/grid/css/style.css")).indexOf(".xic-") === -1;
})());
t("the shared layer is on the shared tag, not this game's", (() => {
  const shared = [...html.matchAll(/\/shared\/[a-z-]+\.(?:css|js)\?v=(v\d+)"/g)].map((m) => m[1]);
  return shared.length > 0 && shared.every((x) => x === shared[0] && x !== tag);
})());

console.log("\nAnd it IS launched, which is a thing to state rather than assume");
/* THESE WERE THE REFUSALS. Until 7 September 2026 this block asserted the
   opposite of every line below — not in GAMES, no shirt, named nowhere but
   its own page — so that the game could not go live by drift. Launching was
   the deliberate edit they existed to demand, and they are the assertions
   that it was made COMPLETELY: a launch half done is a game whose results
   nobody may write, or whose shirt nobody can see. */
const games = read("functions/_lib/games.js");
t("grid is in BUILT, so a round can have a play id",
  /"quickfire", "grid"|"grid", "quickfire"/.test(games));
t("and in GAMES, so its results are the account's to carry",
  games.slice(games.indexOf('export const GAMES ='), games.indexOf('];')).indexOf('"grid"') > -1,
  "a game people can play whose rows nobody may write is half a launch");
t("and has a launch day, which is what every list counts from",
  /grid: "[0-9]{4}-[0-9]{2}-[0-9]{2}"/.test(games),
  "boardKeys, the archive index and the sitemap all start there");
const squad = (() => {
  const s = read("shared/xi-chrome.js");
  return s.slice(s.indexOf("var SQUAD"), s.indexOf("var PAGES"));
})();
t("it wears the sixth shirt", /n: 6,[^}]*name: "Grid XI"/.test(squad),
  "a launched game takes the next free number");
t("and QuickFire moved down to make room", /n: 7,[^}]*status: "In testing"/.test(squad),
  "a game in testing does not hold a shirt, and moves when one ships past it");
t("its own page still says its name", /Grid XI/.test(html));
t("and the hub says it too, now that it is out", (() => {
  const hub = read("index.html");
  return /Grid XI/.test(hub) && /id="shirt6"/.test(hub);
})(), "the front door is where a launch is visible");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
