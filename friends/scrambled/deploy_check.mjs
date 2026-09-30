#!/usr/bin/env node
/* friends/scrambled/deploy_check.mjs — the gate for Scrambled XI: Friends.
 *
 *   node friends/scrambled/deploy_check.mjs      (from the repo root, no node_modules)
 *
 * Scrambled XI: Friends and Vowels XI: Friends (the owner, 29 Sep 2026: "start
 * the Friends Scrambled and Vowels build", five answers a board, no clock,
 * "Straight to public") are football's pages with one set of Friends rewrites
 * (tools/build_friendsscrambled.js) over the Friends board set (fr_sc_board).
 * This gate holds the tag law, the page's shape, the launch's five things
 * together, and the one refusal the whole build rests on: a board served
 * through the real daily route carries none of its answers, proved by
 * execution against the committed sample.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LAUNCHED, GAMES, isListed, entryKey } from "../../functions/_lib/games.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (p) => fs.existsSync(path.join(ROOT, p));

const GAME = "scrambled_fr";
const DIR = "friends/scrambled";
const NAME = "Scrambled XI: Friends";
const PREFIX = "xifs.";
const CYPHER = "";                       // "?cy=1" for the vowels page
const LAST_SHIPPED = "v001b";
const LAST_SHIPPED_ASSETS = "17f5908ac3b66a14";

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}
const skip = (name, why) => console.log(`  --  ${name}  — NOT CHECKED: ${why}`);

const html = read(DIR + "/index.html");
const js = read(DIR + "/js/game.js");
const css = read(DIR + "/css/style.css");
const markup = html.replace(/<!--[\s\S]*?-->/g, "");
const jsCode = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

console.log("The tree");
t("no node_modules, no package.json, no .wrangler in the repository root",
  !has("node_modules") && !has("package.json") && !has(".wrangler"));

console.log("\nThe tag law");
function ownAssetHash() {
  const paths = [...markup.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)\?v=[^"]*"/g)].map((m) => m[1]).sort();
  if (!paths.length) return null;
  const h = crypto.createHash("sha256");
  for (const p of paths) {
    if (!has(DIR + "/" + p)) return null;
    h.update(p); h.update("\0");
    h.update(fs.readFileSync(path.join(ROOT, DIR, p), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 16);
}
const tag = (markup.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1];
t("asset URLs carry a build tag", !!tag, tag);
t("the build tag never goes backwards", !!tag && tag >= LAST_SHIPPED, `now ${tag}, live ${LAST_SHIPPED}`);
if (LAST_SHIPPED_ASSETS === null && LAST_SHIPPED === "v001a") {
  skip("the game's own assets cannot change without its build tag moving", `nothing has shipped; assets now ${ownAssetHash()}`);
} else {
  t("the game's own assets cannot change without its build tag moving",
    typeof LAST_SHIPPED_ASSETS === "string" && (tag > LAST_SHIPPED || ownAssetHash() === LAST_SHIPPED_ASSETS),
    `assets ${ownAssetHash()}`);
}
t("the build tag matches the one the script reports", (jsCode.match(/var BUILD = "([^"]+)"/) || [])[1] === tag, tag);
t("every file reference resolves, exact case", (() => {
  const refs = [...markup.matchAll(/(?:src|href)="(?!data:|#|https?:)([^"?]+)/g)].map((m) => m[1]).filter((r) => !r.endsWith("/"));
  if (refs.length < 5) return false;
  return refs.every((r) => {
    const full = r.startsWith("/") ? path.join(ROOT, r.slice(1)) : path.join(ROOT, DIR, r);
    const d = path.dirname(full);
    return fs.existsSync(d) && fs.readdirSync(d).includes(path.basename(full));
  });
})());

console.log("\nGenerated, not written");
/* THE PAGES ARE THE GENERATOR'S, and the board module is the sample's. Both
   are run as the owner and CI run them; a hand edit to either is drift. */
const gen = spawnSync(process.execPath, [path.join(ROOT, "tools", "build_friendsscrambled.js"), "--check"], { cwd: ROOT, encoding: "utf8" });
t("friends/scrambled/ and friends/vowels/ are what football's pages generate", gen.status === 0,
  gen.status === 0 ? "" : (gen.stdout + gen.stderr).split("\n").filter((l) => /REFUSED|DRIFT/.test(l)).slice(0, 2).join(" | "));
const boards = spawnSync(process.execPath, [path.join(ROOT, "tools", "build_scrambled_fr.js"), "--check"], { cwd: ROOT, encoding: "utf8" });
t("the Friends board module is what its sample builds, through football's gate", boards.status === 0,
  boards.status === 0 ? "" : (boards.stdout + boards.stderr).split("\n").filter(Boolean).slice(-1)[0]);

console.log("\nThe page");
t("exactly one H1, before any other heading", (() => {
  const hs = [...markup.matchAll(/<h([1-6])\b/g)].map((m) => m[1]);
  return hs.filter((h) => h === "1").length === 1 && hs[0] === "1";
})());
t("the stylesheet's braces balance", (css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length);
t("the title, the h1 and the script agree on the name", (() => {
  const title = (markup.match(/<title>([^<—|]+)/) || [])[1] || "";
  const h1 = (markup.match(/<h1[^>]*>([^<]+?)\s*&mdash;/) || [])[1] || "";
  return title.trim() === NAME && h1.trim() === NAME && jsCode.includes(`"${NAME}"`);
})(), NAME);
t("the board is a list, not a pitch", /class="xlist" id="pitch"/.test(markup) && !/class="pitch"/.test(markup));
t("its own storage prefix, and football's appears nowhere in its code",
  jsCode.includes(`var PREFIX = "${PREFIX}"`) && !/"xisc\.|"xivw\./.test(jsCode), PREFIX);
t("no season: the Friends streak is xi-played's", !/xi-season\.js/.test(markup));
t("its daily is the Friends route, and every other call is the shared engine's",
  jsCode.includes('"/api/scrambled_fr/daily"') && !jsCode.includes('"/api/scrambled/daily"'));
t("no clock: the Friends engine is loaded, and football's is not",
  /js\/config\.js\?v=/.test(markup) && /js\/scoring\.js\?v=/.test(markup) && !/football\/scrambled\/js\//.test(markup) &&
    jsCode.includes("window.SCX_FR_CONFIG") && jsCode.includes("window.SCX_FR_SCORING"));

console.log("\nLaunched: the five things, together");
t("in GAMES and in LAUNCHED", GAMES.includes(GAME) && !!LAUNCHED[GAME], LAUNCHED[GAME]);
t("listed", isListed(GAME));
t("its results have a key of their own", String(entryKey(GAME, { no: 12 }) || "").startsWith(GAME === "vowels_fr" ? "frvw:" : "frsc:"));
const chrome = read("shared/xi-chrome.js");
t("named on the Friends team sheet, with its address", chrome.includes(`name: "${NAME}", href: "/${DIR}/"`));
t("in the sitemap", read("functions/sitemap.xml.js").includes(`["/${DIR}/", "daily"`));
t("indexed, with an address of its own", !/name="robots"[^>]+noindex/.test(markup) &&
  markup.includes(`rel="canonical" href="https://www.thexigames.com/${DIR}/"`));
t("on the Friends hub", read("friends/index.html").includes(`href="/${DIR}/"`));

console.log("\nThe answers never leave the server");
/* EXECUTED, NOT GREPPED: the real daily route, run against the committed
   sample boards, and its response searched for every answer on the board it
   served -- the name, the display, every alias. A scramble is not a name
   (its letters are in another order), so a hit is a leak. */
{
  const { dailyFor } = await import(pathToFileURL(path.join(ROOT, "functions", "api", "scrambled", "daily.js")).href);
  const { FR_SC_BOARDS } = await import(pathToFileURL(path.join(ROOT, "functions", "_lib", "fr-sc-boards.js")).href);
  const { launchNumber } = await import(pathToFileURL(path.join(ROOT, "functions", "_lib", "games.js")).href);
  const { dailyNumber } = await import(pathToFileURL(path.join(ROOT, "functions", "_lib", "daily.js")).href);
  const first = launchNumber("scrambled_fr");
  const today = dailyNumber();
  t("PRECONDITION: the ring has begun, so there is a board to serve", Number.isInteger(first) && today >= first, `first ${first}, today ${today}`);
  const res = await dailyFor({ request: new Request("https://x.test/api/scrambled_fr/daily" + CYPHER), env: {} }, "frsc", "scrambled_fr");
  const body = await res.text();
  let j = {};
  try { j = JSON.parse(body); } catch (e) { j = {}; }
  const board = FR_SC_BOARDS.find((b) => b.title === j.title);
  t("the route served one of the sample boards, as a list", !!board && j.layout === "list" && (j.slots || []).length === 5,
    `${j.title || j.error || "nothing"}, ${(j.slots || []).length} slot(s)`);
  const fold = (x) => String(x || "").toUpperCase().replace(/[^A-Z]/g, "");
  const flat = fold(body);
  const answers = board ? board.slots.flatMap((s) => [s.name, s.display, ...(s.aliases || [])]).map(fold).filter((a) => a.length >= 3) : [];
  /* A presolved answer (no vowels) is handed over by design, and said so. */
  const given = new Set((j.slots || []).filter((s) => s.presolved).map((s) => s.id));
  const leaked = board ? board.slots.filter((s) => !given.has(s.id))
    .flatMap((s) => [s.name, s.display, ...(s.aliases || [])]).map(fold).filter((a) => a.length >= 3 && flat.includes(a)) : ["no board"];
  t("and not one answer, display or alias is anywhere in what it sent", answers.length >= 5 && leaked.length === 0,
    leaked.length ? "LEAKED: " + leaked.slice(0, 3).join(", ") : `${answers.length} answer string(s) searched`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
