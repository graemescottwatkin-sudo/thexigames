#!/usr/bin/env node
/* friends/wordsearch/deploy_check.mjs — Wordsearch XI: Friends's gate.
 *
 * ONE GATE PER GAME; the deploy sequence finds it by walking the directory.
 * Modelled on Lightning Round's (friends/lightning/deploy_check.mjs), which was
 * the last Friends game built this way.
 *
 * IN BUILD. The game is not in LAUNCHED and not in GAMES, so this gate holds it
 * to the rule every unreleased game is held to: named nowhere outside its own
 * corner, noindexed, and linked from nothing. The checks about being FOUND flip
 * the day it is registered — they key off games.js, not off a flag here — so a
 * launch that forgets the noindex, or a build that leaks its name early, turns
 * this red rather than passing in both states.
 *
 * THE TAG LAW, pre-launch form. Nothing has shipped, so LAST_SHIPPED_ASSETS is
 * null and the paired hash comparison is SKIPPED AND SAYS SO. That skip ends at
 * launch: a launched game with no recorded hash is a failure.
 *
 * WHAT IS THIS GAME'S OWN. The list is CLUES and the answers are hunted, so
 * the served daily carries no answer (proved on data by round_test.mjs, and by
 * execution here); the board's rules are football's and are IMPORTED, not
 * copied — the drag geometry from ws-round.js, the score from scoring.js.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LAUNCHED, GAMES } from "../../functions/_lib/games.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (p) => fs.existsSync(path.join(ROOT, p));

const GAME = "wordsearch_fr";
const DIR = "friends/wordsearch";
const NAME = "Wordsearch XI: Friends";     // what must appear nowhere else while in build
const PREFIX = "xifws.";
const API = "/api/wordsearch_fr/";
const ROUTE_FILES = ["archive.js", "catalog.js", "daily.js", "find.js", "finish.js", "puzzle.js", "round.js", "secret.js"];

/* WHAT IS LIVE. Bump both after a deploy with tools/post_deploy.mjs. */
const LAST_SHIPPED = "v001b";      // the launch build, 30 Sep 2026
const LAST_SHIPPED_ASSETS = "565b24d942149a76";

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
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const jsCode = noComments(js);

const launched = !!LAUNCHED[GAME];

/* ---- the tag law -------------------------------------------------------- */

console.log("The tag law");

function ownAssetHash() {
  const paths = [...markup.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)\?v=[^"]*"/g)]
    .map((m) => m[1]).sort();
  if (!paths.length) return null;
  const h = crypto.createHash("sha256");
  for (const p of paths) {
    if (!has(DIR + "/" + p)) return null;
    h.update(p); h.update("\0");
    h.update(fs.readFileSync(path.join(ROOT, DIR, p), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 16);
}

const tag = (markup.match(/"js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1];
t("asset URLs carry a build tag so a cached copy cannot be reused", !!tag, tag);
t("the build tag never goes backwards", !!tag && tag >= LAST_SHIPPED, `now ${tag}, live ${LAST_SHIPPED}`);
/* THE LAUNCH BUILD, BEFORE IT IS LIVE: LAST_SHIPPED names the tag the launch
   ships and post_deploy records its hash once it has. Only that one state
   skips, as Lightning's launch did; any later tag with no hash is a failure. */
if (LAST_SHIPPED_ASSETS === null && (!launched || LAST_SHIPPED === "v001a")) {
  skip("the game's own assets cannot change without its build tag moving",
    `nothing has shipped; assets now ${ownAssetHash()}`);
} else {
  t("the game's own assets cannot change without its build tag moving",
    typeof LAST_SHIPPED_ASSETS === "string" && /^[0-9a-f]{16}$/.test(LAST_SHIPPED_ASSETS) &&
      (tag > LAST_SHIPPED || ownAssetHash() === LAST_SHIPPED_ASSETS),
    launched && LAST_SHIPPED_ASSETS === null ? "launched with no hash recorded" : `assets ${ownAssetHash()}`);
}
t("every asset the page pulls from this game carries the same tag", (() => {
  const own = [...markup.matchAll(/(?:src|href)="(?:css|js)\/[^"?]+\?v=([^"]*)"/g)].map((m) => m[1]);
  return own.length >= 2 && own.every((v) => v === tag);
})(), tag);
t("the build tag matches the one the script reports",
  (jsCode.match(/var BUILD = "([^"]+)"/) || [])[1] === tag, tag);
t("every file reference resolves, exact case", (() => {
  const refs = [...markup.matchAll(/(?:src|href)="(?!data:|#|https?:)([^"?]+)/g)].map((m) => m[1]);
  if (refs.length < 5) return false;
  const bad = refs.filter((r) => {
    const full = r.startsWith("/") ? path.join(ROOT, r.slice(1)) : path.join(ROOT, DIR, r);
    const dir = path.dirname(full);
    return !(fs.existsSync(dir) && fs.readdirSync(dir).includes(path.basename(full)));
  });
  return bad.length === 0 ? true : (console.log("        missing: " + bad.join(", ")), false);
})());
t("every css and js file in the folder is loaded by the page", (() => {
  const files = ["css", "js"].flatMap((d) => fs.readdirSync(path.join(ROOT, DIR, d)).map((f) => d + "/" + f));
  return files.length >= 2 && files.every((f) => markup.includes('"' + f + "?v="));
})());
t("every element id the script looks up is in the page", (() => {
  const ids = [...new Set([...js.matchAll(/\$\("([A-Za-z0-9_]+)"\)/g)].map((m) => m[1]))];
  const missing = ids.filter((id) => !markup.includes('id="' + id + '"'));
  return ids.length >= 40 && missing.length === 0 ? true : (console.log("        missing: " + missing.join(", ")), false);
})(), (() => new Set([...js.matchAll(/\$\("([A-Za-z0-9_]+)"\)/g)].map((m) => m[1])).size + " ids")());
t("the shared scripts are all on one shared version", (() => {
  const vs = new Set([...markup.matchAll(/\/shared\/[^"?]+\?v=(v\d+)"/g)].map((m) => m[1]));
  const want = (read("shared/xi-chrome.js").match(/\?v=(v\d+)/) || [])[1];
  return vs.size === 1 && (!want || vs.has(want));
})(), [...new Set([...markup.matchAll(/\/shared\/[^"?]+\?v=(v\d+)"/g)].map((m) => m[1]))].join(","));

/* ---- markup sanity ------------------------------------------------------ */

console.log("\nMarkup");

t("HTML comments are balanced", (html.match(/<!--/g) || []).length === (html.match(/-->/g) || []).length);
t("every <div> is closed", (markup.match(/<div\b/g) || []).length === (markup.match(/<\/div>/g) || []).length);
t("the stylesheet's braces and comments balance",
  (css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length &&
  (css.match(/\/\*/g) || []).length === (css.match(/\*\//g) || []).length);
t("exactly one H1, before any other heading", (() => {
  const hs = [...markup.matchAll(/<h([1-6])\b/g)].map((m) => m[1]);
  return hs.filter((h) => h === "1").length === 1 && hs[0] === "1";
})());
t("the shared footer is at top level, not inside the app", (() => {
  const app = markup.slice(markup.indexOf('id="gameApp"'), markup.indexOf('id="result"'));
  return /<footer class="xic-foot">/.test(markup) && !app.includes("xic-foot");
})());
t("the title and the bar agree on the game's name", (() => {
  const title = (markup.match(/<title>([^<—|]+)/) || [])[1] || "";
  const bar = (js.match(/var GAME = "[^"]+", NAME = "([^"]+)"/) || [])[1];
  return title.trim() === bar && bar === NAME;
})(), NAME);
t("xi-played loads before xi-menu, which reads it for the streaks", (() => {
  const a = markup.indexOf("/shared/xi-played.js"), b = markup.indexOf("/shared/xi-menu.js");
  return a > -1 && b > a;
})());
t("Friends streaks only: no W/L form on the landing (the owner, 28 Sep 2026)",
  !/home-form|homeRun|formChips/.test(markup + jsCode) && /id="streakGame"/.test(markup) && /id="streakDaily"/.test(markup));

/* ---- being found, which it must not be yet ------------------------------ */

console.log(launched ? "\nLaunched" : "\nIn build: named nowhere, found by nothing");

if (!launched) {
  t("the game is not registered: not in GAMES, not in LAUNCHED", !GAMES.includes(GAME) && !launched);
  t("the page is noindexed", /<meta[^>]+name="robots"[^>]+noindex/i.test(markup));
  t("and advertises no address of its own (no canonical, no og:url)",
    !/rel="canonical"/.test(markup) && !/og:url/.test(markup));
  const OWN = [DIR + "/", "functions/api/wordsearch_fr/", "functions/_lib/frws-", "data/migrations/"];
  const leaks = [];
  let walked = 0;
  (function walk(d) {
    for (const e of fs.readdirSync(path.join(ROOT, d || "."), { withFileTypes: true })) {
      const rel = d ? d + "/" + e.name : e.name;
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      if (e.isDirectory()) { if (!/^(data|tools|workers)$/.test(rel)) walk(rel); continue; }
      if (!/\.(html|js|mjs|css|json|xml|txt)$|^_headers$|^_redirects$/.test(e.name)) continue;
      if (OWN.some((o) => rel.startsWith(o))) continue;
      walked++;
      const s = fs.readFileSync(path.join(ROOT, rel), "utf8");
      if (s.includes(NAME) || s.includes("/" + DIR) || s.includes(GAME) || s.includes(API)) leaks.push(rel);
    }
  })("");
  t("its name, its address, its id and its API appear in no other served file",
    walked > 100 && leaks.length === 0, leaks.join(", ") || `walked ${walked} files`);
} else {
  t("launched, so the noindex is gone", !/<meta[^>]+name="robots"[^>]+noindex/i.test(markup));
  t("and the chrome's reset sweeps its storage prefix",
    read("shared/xi-chrome.js").includes('"' + PREFIX + '"'));
  t("and it has its row in xi-played.js, id then key", new RegExp(`id:\\s*"${GAME}",\\s*key:\\s*"${PREFIX.replace(".", "\\.")}`)
    .test(read("shared/xi-played.js")));
}

/* ---- the bank stays out of the repository ------------------------------- */

console.log("\nThe bank stays on the server");

t("no board, bank or load file anywhere in this game's directory", (() => {
  const bad = [];
  (function walk(d) {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      if (e.isDirectory()) walk(d + "/" + e.name);
      else if (/\.(sql|json|csv|xlsx)$/i.test(e.name)) bad.push(d + "/" + e.name);
    }
  })(DIR);
  return bad.length === 0 ? true : (console.log("        " + bad.join(", ")), false);
})());
t("the boards' load file is not in the repository at all", (() => {
  const r = spawnSync("git", ["ls-files", "--", "*wordsearch-production*", "*fr-wordsearch*", "*boards.json"],
    { cwd: ROOT, encoding: "utf8" });
  if (r.error || r.status !== 0) return false;             // cannot check is not a pass
  return r.stdout.trim() === "";
})(), "it is built in WordsearchXI_Friends/export/");
t("and no sample boards on the server: without a database there is no daily", !has("functions/_lib/frws-sample.js") &&
  !/SAMPLE/.test(noComments(read("functions/_lib/frws-data.js"))));

/* EXECUTED: a board with its answers goes in, and what a player is served
   comes out. A regex over publicPuzzle would pass on a comment. */
const pub = await import(pathToFileURL(path.join(ROOT, "functions/_lib/frws-public.js")).href);
const BOARD = {
  id: "FRWS-0000", theme: "Theme", category: "Cat", status: "ready", hash: "h", version: 1, share_key: "k",
  grid: ["QQQQ"], answers: [{ clue: "Which? (6)", display: "Secret", grid: "SECRET",
    placement: { direction: "E", start_row: 0, start_col: 0, end_row: 0, end_col: 5 } }],
  bonus: { clue: "Bonus? (5)", display: "Hidden", grid: "HIDDEN", category: "Bonus clue",
    placement: { direction: "E", start_row: 1, start_col: 0, end_row: 1, end_col: 4 } },
};
const sent = JSON.stringify(pub.publicPuzzle(BOARD));
t("PRECONDITION: the board carries its answers", JSON.stringify(BOARD).includes("SECRET"));
/* THE ANSWERS ARE THE LIST since 6 Oct 2026 (the owner: "no clues just
   answers"), so the eleven words are served; where they are, and the secret
   word, are not. The answer's clue is no longer sent at all. */
t("a served board names its answers and their lengths, and no placement, no secret word, no answer clue",
  sent.includes('"display":"Secret"') && /"len":6/.test(sent) &&
  !/HIDDEN|Hidden|placement|Which\? \(6\)/.test(sent), sent);
t("and its secret carries the seconds after which /secret will name it",
  JSON.parse(sent).bonus && JSON.parse(sent).bonus.showAfter === pub.SECRET_SHOWN_AFTER_S && pub.SECRET_SHOWN_AFTER_S > 0, sent);

/* ---- one rule, one place ------------------------------------------------ */

console.log("\nFootball's rules, imported rather than copied");

const round = read("functions/_lib/frws-round.js");
t("the server scores with football's scoring.js",
  /import XIWS_SCORING from "\.\.\/\.\.\/football\/wordsearch\/js\/scoring\.js"/.test(round));
t("and the page loads the same file", /src="\/football\/wordsearch\/js\/scoring\.js\?v=/.test(markup) &&
  /window\.XIWS_SCORING/.test(jsCode));
t("the page does not restate the clock or the curve", !/\b600\b/.test(jsCode) && !/\[\[0,\s*104\]/.test(jsCode));
t("a drag is judged by football's geometry", /import \{ judge \} from "\.\.\/\.\.\/_lib\/ws-round\.js"/.test(
  read("functions/api/wordsearch_fr/find.js")));
t("this game's tables and no other's", (() => {
  const code = [round, read("functions/_lib/frws-data.js")].map(noComments).join("\n");
  const tables = [...code.matchAll(/\b(?:FROM|INTO|JOIN|UPDATE)\s+([a-z_]+)/g)].map((m) => m[1]);
  return tables.length >= 10 && tables.every((x) => x.startsWith("fr_ws_"));
})(), "fr_ws_* only");
t("the migration is safe to re-run", (() => {
  const f = "data/migrations/048-friends-wordsearch.sql";
  if (!has(f)) return false;
  const code = read(f).split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  const creates = code.match(/\bCREATE\b/g) || [];
  const safe = code.match(/\bCREATE (?:TABLE|INDEX) IF NOT EXISTS\b/g) || [];
  return creates.length >= 5 && creates.length === safe.length && !/\b(ALTER|DROP|DELETE)\b/i.test(code);
})(), "048: CREATE ... IF NOT EXISTS only");

/* ---- the client ---------------------------------------------------------- */

console.log("\nThe client");

t("storage is under one prefix", new RegExp(`var PREFIX = "${PREFIX.replace(".", "\\.")}"`).test(jsCode), PREFIX);
t("and every key is built from it", (() => {
  const composed = jsCode.match(/PREFIX \+ /g) || [];
  const bare = jsCode.match(/["'](?:xi[a-z]*|qfx|fcw)\.[a-zA-Z0-9._]+["']/g) || [];
  return composed.length >= 3 && bare.length === 0 ? true : (console.log("        bare: " + bare.join(", ")), false);
})(), (jsCode.match(/PREFIX \+ /g) || []).length + " key(s) off the constant");
t("and no other game uses it", (() => {
  const users = [];
  for (const theme of ["football", "friends"]) {
    for (const g of fs.readdirSync(path.join(ROOT, theme))) {
      const f = path.join(theme, g, "js", "game.js");
      if (theme + "/" + g !== DIR && has(f) && read(f).includes(PREFIX)) users.push(f);
    }
  }
  return users.length === 0;
})());
t("every call goes to this game's API, relatively, with the family's CSRF header", (() => {
  /* This game's API, and the family's account and session routes, which every
     launched game calls to bank a result: nothing else. */
  const apis = (jsCode.match(/["']\/api\/[^"']*["']/g) || []).map((a) => a.slice(1, -1));
  const allowed = (a) => a === API || /^\/api\/account\/(migrate|results\?game=)$/.test(a) || a === "/api/auth/session";
  return apis.includes(API) && apis.every(allowed) && /"X-XI-Games": "1"/.test(jsCode) && !/fetch\(["']https?:/.test(jsCode)
    ? true : (console.log("        calls: " + apis.join(", ")), false);
})());
t("every route the client calls exists", (() => {
  const called = [...new Set([...jsCode.matchAll(/\b(?:api|post)\("([a-z]+)/g)].map((m) => m[1]))];
  return called.length >= 6 && called.every((r) => has(`functions/api/wordsearch_fr/${r}.js`));
})(), [...new Set([...jsCode.matchAll(/\b(?:api|post)\("([a-z]+)/g)].map((m) => m[1]))].join(", "));
t("the routes load as ES modules and export their handler", await (async () => {
  for (const r of ROUTE_FILES) {
    const m = await import(pathToFileURL(path.join(ROOT, "functions/api/wordsearch_fr", r)).href);
    if (typeof m.onRequestGet !== "function" && typeof m.onRequestPost !== "function") return false;
  }
  return true;
})());
t("no helper sits in the route folder, where Pages would serve it as a route",
  fs.readdirSync(path.join(ROOT, "functions/api/wordsearch_fr")).sort().join() === ROUTE_FILES.join());
t("the stylesheet defines no .xic- rule, which the chrome owns", !/\.xic-/.test(noComments(css)));
t("and the Friends additions take their colours from the family's tokens", (() => {
  const mine = noComments(css.slice(css.indexOf("FRIENDS: THE LIST IS CLUES")));
  return css.includes("FRIENDS: THE LIST IS CLUES") && !/#[0-9a-f]{3,6}\b/i.test(mine);
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
