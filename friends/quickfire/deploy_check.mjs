#!/usr/bin/env node
/* friends/quickfire/deploy_check.mjs — the gate for QuickFire XI: Friends.
 *
 *   node friends/quickfire/deploy_check.mjs      (from the repo root, no node_modules)
 *
 * QuickFire XI: Friends (the owner, 30 Sep 2026: "yes and yes" to adding it
 * with the six main names exempt, first daily "yesterday", "Seconds, same
 * pace", "Skip") is football QuickFire's page with one set of Friends
 * rewrites (tools/build_friendsquickfire.js) over the football engine's
 * Friends set (functions/_lib/qf-sets.js, fr_qf_* tables). This gate holds the
 * tag law, the page's shape, the launch's five things together, and the one
 * refusal the build rests on: a board served through the real Friends daily
 * route carries no answer field, and is read from the Friends tables and
 * never football's -- proved by execution, against a real SQLite built from
 * every migration.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LAUNCHED, GAMES, isListed, entryKey, inSeason } from "../../functions/_lib/games.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (p) => fs.existsSync(path.join(ROOT, p));

const GAME = "quickfire_fr";
const DIR = "friends/quickfire";
const NAME = "QuickFire XI: Friends";
const PREFIX = "xifq.";
const LAST_SHIPPED = "v001e";
const LAST_SHIPPED_ASSETS = "ef8bac45d99f33b5";

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
const gen = spawnSync(process.execPath, [path.join(ROOT, "tools", "build_friendsquickfire.js"), "--check"], { cwd: ROOT, encoding: "utf8" });
t("friends/quickfire/ is what football QuickFire's page generates", gen.status === 0,
  gen.status === 0 ? "" : (gen.stdout + gen.stderr).split("\n").filter((l) => /REFUSED|DRIFT/.test(l)).slice(0, 2).join(" | "));

console.log("\nThe page");
t("exactly one H1, before any other heading", (() => {
  const hs = [...markup.matchAll(/<h([1-6])\b/g)].map((m) => m[1]);
  return hs.filter((h) => h === "1").length === 1 && hs[0] === "1";
})());
t("the stylesheet's braces balance", (css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length);
t("the title, the h1 and the script agree on the name", (() => {
  const title = (markup.match(/<title>([^<—|]+)/) || [])[1] || "";
  const h1 = (markup.match(/<h1>([^<]+)<\/h1>/) || [])[1] || "";
  return title.trim() === NAME && h1.trim() === NAME && jsCode.includes(`'${NAME}'`);
})(), NAME);
t("its own storage prefix and result key, and football's appear nowhere in its code",
  jsCode.includes(`var PREFIX = "${PREFIX}"`) && jsCode.includes("'frqf:'") && !/"qfx\.|'qf:'/.test(jsCode), PREFIX);
t("every call is to the Friends routes, none to football's",
  jsCode.includes('"/api/quickfire_fr/daily"') && !/\/api\/quickfire\//.test(jsCode));
t("no season: the Friends streak is xi-played's", !/xi-season\.js/.test(markup) && !inSeason(GAME));
t("seconds, not a match clock: the page shows the seconds left", jsCode.includes("secsLeft(minute)") &&
  /<span class="prime">s<\/span>/.test(markup) && !/0' to 90'/.test(markup));
t("skips, not substitutions", /<span>Skip<\/span>/.test(markup) && !/Sub it off|SUBBED OFF|substitution/.test(markup + jsCode));

console.log("\nLaunched: the five things, together");
t("in GAMES and in LAUNCHED", GAMES.includes(GAME) && !!LAUNCHED[GAME], LAUNCHED[GAME]);
t("listed", isListed(GAME));
t("its results have a key of their own", String(entryKey(GAME, { day: "2026-09-29" }) || "") === "frqf:2026-09-29");
const chrome = read("shared/xi-chrome.js");
t("named on the Friends team sheet, with its address", chrome.includes(`name: "${NAME}", href: "/${DIR}/"`));
t("in the sitemap", read("functions/sitemap.xml.js").includes(`["/${DIR}/", "daily"`));
t("indexed, with an address of its own", !/name="robots"[^>]+noindex/.test(markup) &&
  markup.includes(`rel="canonical" href="https://www.thexigames.com/${DIR}/"`));
t("on the Friends hub", read("friends/index.html").includes(`href="/${DIR}/"`));

console.log("\nThe answers never leave the server, and the sets never meet");
/* EXECUTED, NOT GREPPED: the real Friends daily route over a real SQLite
   built from every migration, seeded with the SAME ids in both games'
   tables. It must serve the Friends board, and no question may carry an
   answer field. The answer's words are one of four options by design; which
   one is what must stay on the server. */
{
  let sqlite = null;
  try { sqlite = await import("node:sqlite"); } catch (e) { sqlite = null; }
  if (!sqlite) {
    t("node:sqlite is available to run the route", false);
  } else {
    const db = new sqlite.DatabaseSync(":memory:");
    const mig = path.join(ROOT, "data", "migrations");
    for (const f of fs.readdirSync(mig).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort()) {
      try { db.exec(fs.readFileSync(path.join(mig, f), "utf8")); } catch (e) { /* ALTERs the base already has */ }
    }
    const env = { DB: { prepare(sql) {
      const make = (args) => ({ bind: (...a) => make(a),
        first: async () => db.prepare(sql).get(...args) ?? null,
        all: async () => ({ results: db.prepare(sql).all(...args) }),
        run: async () => ({ meta: { changes: 0 } }) });
      return make([]);
    } } };
    const { today } = await import(pathToFileURL(path.join(ROOT, "functions", "_lib", "qfdata.js")).href);
    const day = today();
    for (const [pre, who] of [["qf_", "Football"], ["fr_qf_", "Friends"]]) {
      for (let i = 1; i <= 14; i++) {
        const id = "EVT" + String(i).padStart(4, "0");
        db.prepare(`INSERT INTO ${pre}question (id, answer, answer_norm, answer_type, clue, status, option_1, option_2, option_3, option_4)
          VALUES (?, ?, ?, 'person', ?, 'verified', ?, ?, ?, ?)`).run(id, `${who} ${i}`, `${who} ${i}`.toLowerCase(), `${who} clue ${i}`,
          `${who} ${i}`, `${who} x${i}`, `${who} y${i}`, `${who} z${i}`);
        db.prepare(`INSERT INTO ${pre}daily_slot (play_date, slot, question_id, role) VALUES (?, ?, ?, ?)`)
          .run(day, i <= 11 ? i : i - 11, id, i <= 11 ? "xi" : "bench");
      }
      db.prepare(`INSERT INTO ${pre}daily (play_date, status) VALUES (?, 'published')`).run(day);
    }
    const { onRequestGet } = await import(pathToFileURL(path.join(ROOT, "functions", "api", "quickfire_fr", "daily.js")).href);
    const res = await onRequestGet({ request: new Request("https://x.test/api/quickfire_fr/daily"), env });
    const j = await res.json().catch(() => ({}));
    const qs = [...((j.daily && j.daily.questions) || []), ...((j.daily && j.daily.bench) || [])];
    t("the Friends route served the Friends board, eleven and three, from fr_qf_*",
      res.status === 200 && qs.length === 14 && qs.every((q) => /^Friends clue /.test(q.clue)), `${res.status}, ${qs.length} question(s), ${(qs[0] || {}).clue}`);
    t("and no question carries an answer field", qs.length === 14 && qs.every((q) => !("answer" in q) && !("answer_norm" in q) && !("aliases" in q)),
      Object.keys(qs[0] || {}).join(","));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
