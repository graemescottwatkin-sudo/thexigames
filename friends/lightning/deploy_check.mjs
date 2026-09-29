#!/usr/bin/env node
/* friends/lightning/deploy_check.mjs — Lightning Round XI: Friends's gate.
 *
 * ONE GATE PER GAME; the deploy sequence finds it by walking the directory.
 *
 * LAUNCHED 28 Sep 2026, on the owner's "launch Lightning Round", and PUBLIC
 * like the other Friends games. While it was in build this gate held it to the
 * unreleased rule — named nowhere outside its own page, noindexed, linked from
 * nothing — and those checks are kept, keyed off games.js, so they would bite
 * again for a game taken back out. Launched, it asks the opposite: listed,
 * named and linked in the Friends squad, indexable, in the sitemap.
 *
 * THE TAG LAW, first-release form. Until tools/post_deploy.mjs records the
 * first live build, LAST_SHIPPED is the first release, v001a, and
 * LAST_SHIPPED_ASSETS is null, and the paired hash comparison is SKIPPED AND
 * SAYS SO -- Who Am I XI: Friends launched the same way. Once a build is recorded
 * a missing hash is a failure, because a comparison against nothing is the
 * sentinel fault.
 *
 * WHAT IS THIS GAME'S OWN. Lightning Round shows the right answer the moment a
 * pick is marked (the owner, 29 Sep 2026, "Immediately upon answering",
 * reversing the 28 Sep hold to the end of the run). The server's half -- every
 * verdict names its own question's answer and a served question never does --
 * is proved by friends/lightning/round_test.mjs; the page's half is here.
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

const GAME = "lightning_fr";
const DIR = "friends/lightning";
const NAME = "Lightning Round";            // what must appear nowhere else while in build
const PREFIX = "xifl.";

/* WHAT IS LIVE. Bump both after a deploy with tools/post_deploy.mjs. */
const LAST_SHIPPED = "v001c";
const LAST_SHIPPED_ASSETS = "af4cc019f8b26f6a";

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}
const skip = (name, why) => console.log(`  --  ${name}  — NOT CHECKED: ${why}`);

const html = read(DIR + "/index.html");
const js = read(DIR + "/js/game.js");
const css = read(DIR + "/css/style.css");
const cfg = read(DIR + "/js/config.js");
const markup = html.replace(/<!--[\s\S]*?-->/g, "");
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const jsCode = noComments(js);

const launched = !!LAUNCHED[GAME];
/* The name the script puts on the bar and the share, read once. */
const NAME_IN_JS = (js.match(/var NAME = "([^"]+)"/) || [])[1];

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

const tag = (markup.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1];
t("asset URLs carry a build tag so a cached copy cannot be reused", !!tag, tag);
t("the build tag never goes backwards", !!tag && tag >= LAST_SHIPPED, `now ${tag}, live ${LAST_SHIPPED}`);
if (LAST_SHIPPED_ASSETS === null && LAST_SHIPPED === "v001a") {
  skip("the game's own assets cannot change without its build tag moving",
    `nothing has shipped; assets now ${ownAssetHash()}`);
} else {
  t("the game's own assets cannot change without its build tag moving",
    typeof LAST_SHIPPED_ASSETS === "string" && /^[0-9a-f]{16}$/.test(LAST_SHIPPED_ASSETS) &&
      (tag > LAST_SHIPPED || ownAssetHash() === LAST_SHIPPED_ASSETS),
    LAST_SHIPPED_ASSETS === null ? "a build is recorded as shipped with no hash" : `assets ${ownAssetHash()}`);
}
t("every asset the page pulls from this game carries the same tag", (() => {
  const own = [...markup.matchAll(/(?:src|href)="(?:css|js)\/[^"?]+\?v=([^"]*)"/g)].map((m) => m[1]);
  return own.length >= 3 && own.every((v) => v === tag);
})(), tag);
t("the build tag matches the one the script reports",
  (jsCode.match(/var BUILD = "([^"]+)"/) || [])[1] === tag, tag);
t("every file reference resolves, exact case", (() => {
  /* A link to a folder (the archive, "archive/") is a route, not a file. */
  const refs = [...markup.matchAll(/(?:src|href)="(?!data:|#|https?:)([^"?]+)/g)].map((m) => m[1])
    .filter((r) => !r.endsWith("/"));
  if (refs.length < 5) return false;
  return refs.every((r) => {
    const full = r.startsWith("/") ? path.join(ROOT, r.slice(1)) : path.join(ROOT, DIR, r);
    const dir = path.dirname(full);
    return fs.existsSync(dir) && fs.readdirSync(dir).includes(path.basename(full));
  });
})());
t("every css and js file in the folder is loaded by the page", (() => {
  const files = ["css", "js"].flatMap((d) => fs.readdirSync(path.join(ROOT, DIR, d)).map((f) => d + "/" + f));
  return files.length >= 3 && files.every((f) => markup.includes('"' + f + "?v="));
})());
t("every element id the script looks up is in the page", (() => {
  const ids = [...js.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  const listed = (js.match(/\[('screenStart'[\s\S]*?)\]\.forEach/) || [])[1] || "";
  const all = [...ids, ...[...listed.matchAll(/'([^']+)'/g)].map((m) => m[1])];
  const missing = all.filter((id) => !markup.includes('id="' + id + '"'));
  return all.length >= 12 && missing.length === 0 ? true
    : (console.log("        missing: " + missing.join(", ") + " (" + all.length + " ids read)"), false);
})());

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
  const main = markup.slice(markup.indexOf("<main"), markup.indexOf("</main>"));
  return /<footer class="xic-foot">/.test(markup) && !main.includes("xic-foot");
})());
t("the title and the bar agree on the family's name for this game", (() => {
  const title = (markup.match(/<title>([^<—|]+)/) || [])[1] || "";
  const h1 = (markup.match(/<h1[^>]*>([^<]+)<\/h1>/) || [])[1] || "";
  return title.trim() === NAME_IN_JS && h1.trim() === NAME_IN_JS && / XI: Friends$/.test(NAME_IN_JS || "");
})(), NAME_IN_JS);

/* ---- being found, which it must not be yet ------------------------------ */

console.log(launched ? "\nLaunched" : "\nIn build: named nowhere, found by nothing");

if (!launched) {
  t("the game is not registered: not in GAMES, not in LAUNCHED", !GAMES.includes(GAME) && !launched);
  t("the page is noindexed", /<meta[^>]+name="robots"[^>]+noindex/i.test(markup));
  t("and advertises no address of its own (no canonical, no og:url)",
    !/rel="canonical"/.test(markup) && !/og:url/.test(markup));

  /* NAMED NOWHERE ELSE, and "else" is walked rather than listed: every file
     the site serves or builds from outside this game's own corner. Comments
     count — shared/xi-chrome.js ships unminified, and the Who Am I launch found
     its own address spelled out in a comment there. */
  const OWN = [DIR + "/", "functions/api/lightning_fr/", "functions/_lib/lr-", "data/migrations/"];
  const leaks = [];
  (function walk(d) {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = d ? d + "/" + e.name : e.name;
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      if (e.isDirectory()) { if (!/^(data|tools|workers)$/.test(rel)) walk(rel); continue; }
      if (!/\.(html|js|mjs|css|json|xml|txt)$|^_headers$|^_redirects$/.test(e.name)) continue;
      if (OWN.some((o) => rel.startsWith(o))) continue;
      const s = fs.readFileSync(path.join(ROOT, rel), "utf8");
      if (s.includes(NAME) || s.includes("/" + DIR) || s.includes(GAME)) leaks.push(rel);
    }
  })("");
  t("its name, its address and its id appear in no other served file", leaks.length === 0,
    leaks.join(", ") || "walked the served tree");
} else {
  const { isListed } = await import(pathToFileURL(path.join(ROOT, "functions/_lib/games.js")).href);
  const { gamePath, gameDir, THEME_OF } = await import(pathToFileURL(path.join(ROOT, "functions/_lib/permalink.js")).href);
  t("launched and listed", GAMES.includes(GAME) && isListed(GAME), LAUNCHED[GAME]);
  t("its address is asked, not assembled, and is where this file is",
    gameDir(GAME) === DIR && gamePath(GAME) === "/" + DIR + "/" && THEME_OF[GAME] === "friends", gamePath(GAME));
  t("the noindex is gone", !/<meta[^>]+name="robots"[^>]+noindex/i.test(markup));
  t("and the page states its own address", markup.includes('rel="canonical" href="https://www.thexigames.com' + gamePath(GAME) + '"'));
  const chrome = read("shared/xi-chrome.js");
  const squad = (chrome.match(/friends:\s*\[([\s\S]*?)\n\s*\],/) || [])[1] || "";
  t("the Friends squad names this game and links to it",
    !!NAME_IN_JS && squad.includes('name: "' + NAME_IN_JS + '"') && squad.includes('href: "' + gamePath(GAME) + '"'));
  t("the chrome's reset sweeps its storage prefix", chrome.includes('"' + PREFIX + '"'));
  t("the Friends streaks probe it, under the key the page banks to", (() => {
    const played = read("shared/xi-played.js");
    return played.includes('id: "' + GAME + '", key: "' + PREFIX + 'results.v1"') &&
      /var KEY_RESULTS = PREFIX \+ "results\.v1";/.test(jsCode);
  })());
  t("and every banked row carries its day and the moment it finished",
    /day: r\.day/.test(jsCode) && /at: Date\.now\(\)/.test(jsCode));
}

/* ---- the bank stays out of the page ------------------------------------- */

console.log("\nThe bank stays on the server");

t("no deck, pool or bank file anywhere in this game's directory", (() => {
  const bad = [];
  (function walk(d) {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      if (e.isDirectory()) walk(d + "/" + e.name);
      else if (/\.(sql|json|csv)$/i.test(e.name)) bad.push(d + "/" + e.name);
    }
  })(DIR);
  return bad.length === 0;
})());

/* THE POOL FILES BY NAME, not by "lightning": the pattern was *lightning*.sql
   and it matched the game's own MIGRATION, 047-friends-lightning.sql, the
   moment that was committed -- a false refusal found only after launch, because
   a sweep of an archived tree runs git in a folder that tracks nothing. */
t("the pool's load file is not in the repository at all", (() => {
  const r = spawnSync("git", ["ls-files", "--", "*fr-lightning-production*", "*lightning-pool*"], { cwd: ROOT, encoding: "utf8" });
  if (r.error || r.status !== 0) return false;             // cannot check is not a pass
  return r.stdout.trim() === "";
})(), "fr-lightning-production.sql lives in LightningRoundXI_Friends/export/");

/* EXECUTED: a row with its answer goes in, and what the page is sent comes
   out. A regex over shape() would pass on a comment. */
const round = await import(pathToFileURL(path.join(ROOT, "functions/_lib/lr-round.js")).href);
const ROW = { id: "ZZZ0001", clue: "Which?", answer: "Secret Answer", option_1: "Secret Answer",
  option_2: "B", option_3: "C", option_4: "D", diff: "Easy", pgk: "x" };
const sent = JSON.stringify(round.shape(ROW, "seed", 1));
t("PRECONDITION: the row carries its answer", ROW.answer.length > 0);
t("a served question has the four options and no answer field",
  !/"answer"/.test(sent) && JSON.parse(sent).options.length === 4, sent);

/* THE PAGE'S HALF OF "THE ANSWER THE MOMENT IT IS GIVEN" (the owner, 29 Sep
   2026, reversing the 28 Sep hold to the end). The verdict from /answer names
   the right option (round_test proves the server); the page must light it, or
   a player is told "wrong" and not what was right -- and it must light it from
   THE VERDICT, never from a question as served, which carries no answer. */
t("the page lights the right option green from the verdict",
  /if \(r\.answer\) markRight\(r\.answer\);/.test(jsCode) &&
    /b\.classList\.add\('right'\)/.test(jsCode.slice(jsCode.indexOf("function markRight"))),
  "settle() -> markRight(r.answer)");
t("and a wrong pick goes red", /button\.classList\.add\(r\.correct \? 'right' : 'wrong'\)/.test(jsCode) &&
  /\.option\.wrong\{background:var\(--danger\)/.test(css));
t("and says, at the clock, what the miss cost and the total lost",
  /showPenalty\(cost, Math\.round\(run\.lostMs \/ 1000\)\)/.test(jsCode) && markup.includes('id="penalty"'));
/* A PLAYER CAN SAY A QUESTION IS WRONG, through the family's endpoint, by the
   bank's id: the answer is shown at once, so a wrong question is seen at once. */
t("a question can be reported, by its id, through the family's endpoint", (() => {
  const code = jsCode.slice(jsCode.indexOf("function report("));
  return /call\('\/api\/report-clue', \{ game: 'lightning_fr', itemId: id,/.test(code) &&
    markup.includes('id="ftReport"') && /renderReport\(r\.answers/.test(jsCode);
})());
t("the end-of-run review lists them again, from /finish's answers",
  /\ba\.answer\b/.test(jsCode) && /r\.answers/.test(jsCode));

/* ---- one fact, one place ------------------------------------------------ */

console.log("\nThe rules live in config.js");

const CONFIG = (await import(pathToFileURL(path.join(ROOT, DIR, "js/config.js")).href)).default;
t("the server reads the page's config rather than a copy",
  /import CONFIG from "\.\.\/\.\.\/friends\/lightning\/js\/config\.js"/.test(read("functions/_lib/lr-round.js")) &&
  round.RUN_MS === CONFIG.RUN_MS && round.WRONG_PENALTY_MS === CONFIG.WRONG_PENALTY_MS);
t("the page does not restate the clock or the penalty", (() => {
  const nums = [CONFIG.RUN_MS, CONFIG.WRONG_PENALTY_MS].map(String);
  return nums.every((n) => !new RegExp("\\b" + n + "\\b").test(jsCode));
})(), `${CONFIG.RUN_MS} and ${CONFIG.WRONG_PENALTY_MS} appear only in config.js`);
t("the mix adds up to a hundred", ["Easy", "Medium", "Hard"].reduce((a, d) => a + CONFIG.MIX[d], 0) === 100,
  JSON.stringify(CONFIG.MIX));
t("the migration is safe to re-run", (() => {
  const f = "data/migrations/047-friends-lightning.sql";
  if (!has(f)) return false;
  const code = read(f).split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  const creates = code.match(/\bCREATE\b/g) || [];
  const safe = code.match(/\bCREATE (?:TABLE|INDEX) IF NOT EXISTS\b/g) || [];
  return creates.length >= 5 && creates.length === safe.length && !/\b(ALTER|DROP|DELETE)\b/i.test(code);
})(), "047: CREATE ... IF NOT EXISTS only");

/* ---- the client ---------------------------------------------------------- */

console.log("\nThe client");

/* Written out in game.js, because the family's alignment suite resolves keys
   only from literals; held equal to config's here, so the two cannot drift. */
t("storage is under one prefix, written once and equal to config's",
  CONFIG.STORAGE_PREFIX === PREFIX && jsCode.includes('var PREFIX = "' + PREFIX + '";'), PREFIX);
t("and every key is built from it", (() => {
  const composed = jsCode.match(/PREFIX \+ /g) || [];
  const bare = jsCode.match(/["'](?:xi[a-z]*|qfx|fcw)\.[a-zA-Z0-9._]+["']/g) || [];
  return composed.length >= 3 && bare.length === 0;
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
  /* The game's own routes, and the family's account and sign-in routes, which
     every game calls the same way; nothing else, and never another game's. */
  const calls = jsCode.match(/['"]\/api\/[a-z_]+\/[a-z]+/g) || [];
  const own = calls.filter((c) => c.includes("/api/lightning_fr/"));
  return own.length >= 3 && calls.every((c) => /\/api\/(lightning_fr|account|auth)\//.test(c)) &&
    /* and the family's report endpoint, the one other route it may call */
    (jsCode.match(/'\/api\/[a-z-]+'/g) || []).every((c) => c === "'/api/report-clue'") &&
    /"X-XI-Games": "1"/.test(jsCode) && !/fetch\(["']https?:/.test(jsCode);
})());
t("every route the client calls exists", ["start", "answer", "finish"]
  .every((r) => has(`functions/api/lightning_fr/${r}.js`)));
t("the routes load as ES modules and export their handlers", await (async () => {
  for (const r of ["start", "answer", "finish"]) {
    const m = await import(pathToFileURL(path.join(ROOT, `functions/api/lightning_fr/${r}.js`)).href);
    if (typeof m.onRequestPost !== "function") return false;
  }
  const d = await import(pathToFileURL(path.join(ROOT, "functions/api/lightning_fr/daily.js")).href);
  return typeof d.onRequestGet === "function";
})());
t("the played-today probe answers the server's day and nothing else", await (async () => {
  const d = await import(pathToFileURL(path.join(ROOT, "functions/api/lightning_fr/daily.js")).href);
  const body = await d.onRequestGet().json();
  return /^\d{4}-\d{2}-\d{2}$/.test(body.day) && !("question" in body) && !("seq" in body);
})());
t("no helper sits in the route folder, where Pages would serve it as a route",
  fs.readdirSync(path.join(ROOT, "functions/api/lightning_fr"))
    .every((f) => ["start.js", "answer.js", "finish.js", "daily.js"].includes(f)));

/* ---- the words ----------------------------------------------------------- */

console.log("\nIt does not read as a football game");

const readable = (() => {
  const body = markup.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
  const attrs = (body.match(/(?:placeholder|aria-label|title|alt|content)="[^"]*"/g) || []).join(" ");
  const strings = (jsCode.match(/'[^'\n]{3,}'/g) || []).join(" ");
  return body.replace(/<[^>]+>/g, " ") + " " + attrs + " " + strings;
})();
const hay = " " + readable.toLowerCase().replace(/[^a-z]+/g, " ").trim() + " ";
t("PRECONDITION: the scan can see the copy", hay.includes(" ninety seconds ") && hay.includes(" practice "));
const FOOTBALL = ["club", "clubs", "player", "players", "pitch", "substitution", "substitutions", "goal",
  "goals", "footballer", "kick off", "full time", "match", "minute", "eleven"];
t("no football vocabulary in what a player can read", (() => {
  const hit = FOOTBALL.filter((w) => hay.includes(" " + w + " "));
  if (hit.length) console.log("        still football: " + hit.join(", "));
  return hit.length === 0;
})(), FOOTBALL.length + " terms checked");
t("the stylesheet defines no .xic- rule, which the chrome owns", !/\.xic-/.test(noComments(css)));
t("and takes its colours from the family's tokens", !/#[0-9a-f]{3,6}\b/i.test(noComments(css).replace(/color:#fff\b/g, "")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
