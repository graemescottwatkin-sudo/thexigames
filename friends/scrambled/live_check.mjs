#!/usr/bin/env node
/* friends/scrambled/live_check.mjs — Scrambled XI: Friends, against production.
 *
 *   node friends/scrambled/live_check.mjs --expect v001a
 *
 * Reads the DEPLOYED site; named in the workflow and never run in CI. It
 * proves what no offline suite can: that the Friends boards are in D1 and
 * served from there (a fallback to the committed sample would look like a
 * working game with four boards), that the ring began on the launch day, that
 * a Friends play token is judged against the Friends set, and that nothing an
 * answer is made of leaves the server.
 *
 * MIN_ASSERTIONS is the second net under the completion marker: set below the
 * run's real count by the assertions that can legitimately skip (none today
 * but the --expect one), and reviewed, not raised by reflex, when checks are
 * added.
 */
import { gamePath } from "../../functions/_lib/permalink.js";
import { launchNumber } from "../../functions/_lib/games.js";

const BASE = "https://www.thexigames.com";
const GAME = "scrambled_fr";
const NAME = "Scrambled XI: Friends";
const CYPHER = "";                       // "?cy=1" for the vowels page
const PATH = gamePath(GAME);
const MIN_ASSERTIONS = 22;

const expectAt = process.argv.indexOf("--expect");
const EXPECT = expectAt > -1 ? process.argv[expectAt + 1] : null;

let pass = 0, fail = 0, ran = 0;
const t = (n, ok, d) => {
  ran++; ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`);
};
const get = async (p, opts = {}) => {
  const r = await fetch(BASE + p, { headers: { "X-XI-Games": "1", "Content-Type": "application/json" }, cache: "no-store", ...opts });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* a page, not an endpoint */ }
  return { status: r.status, headers: r.headers, text, json };
};
const join = (p, q) => p + (q ? (p.includes("?") ? "&" : "?") + q.replace(/^\?/, "") : "");

console.log(`${NAME} — live\n`);

const page = await get(PATH);
t("the page answers", page.status === 200, String(page.status));
if (EXPECT) t("the build tag is what was expected", new RegExp(`js/game\\.js\\?v=${EXPECT}\\b`).test(page.text), EXPECT);
const tags = [...page.text.matchAll(/(?:href|src)="(?:css|js)\/[^"?]+\?v=([^"]+)"/g)].map((m) => m[1]);
t("every one of this game's own assets carries the same tag", tags.length >= 2 && new Set(tags).size === 1, tags.join(" "));
t("the page is indexable, and is this game's page",
  !/<meta[^>]+name="robots"[^>]+noindex/i.test(page.text) && page.text.includes(`<link rel="canonical" href="${BASE}${PATH}">`));
const sitemap = await get("/sitemap.xml");
t("the sitemap advertises it", sitemap.status === 200 && sitemap.text.includes(BASE + PATH + "<"));
const hub = await get("/friends/");
t("the Friends hub links it", hub.status === 200 && hub.text.includes(`href="${PATH}"`));
const chromeRef = (page.text.match(/src="(\/shared\/xi-chrome\.js\?v=[^"]+)"/) || [])[1];
const chrome = chromeRef ? await get(chromeRef) : { status: 0, text: "" };
t("the shipped chrome names it on the Friends team sheet, with its address",
  chrome.status === 200 && chrome.text.includes(`name: "${NAME}", href: "${PATH}"`), chromeRef || "no chrome reference");

console.log("\nThe board");
const today = await get(join("/api/scrambled_fr/daily", CYPHER));
const d = today.json || {};
const first = launchNumber("scrambled_fr");
t("today's board answers", today.status === 200 && Number.isInteger(d.no), today.text.slice(0, 120));
t("FROM D1, not the committed sample", d.source === "d1", String(d.source));
t("the ring began on the launch day", d.first === first, `first ${d.first}, launch ${first}`);
t("a list of five, under its theme", d.layout === "list" && typeof d.title === "string" && d.title.length > 2 &&
  Array.isArray(d.slots) && d.slots.length === 5, `${d.title}, ${(d.slots || []).length}`);
const cy = CYPHER === "?cy=1";
t(cy ? "every slot a blanked cypher" : "every slot a scramble and its word lengths",
  (d.slots || []).every((s) => cy ? typeof s.cy === "string" : typeof s.scramble === "string" && Array.isArray(s.len)));
t("and no slot names itself, unless it is handed over as presolved",
  (d.slots || []).every((s) => (!("name" in s) || s.presolved === true) && !("display" in s) && !("aliases" in s)));
t("its token is the Friends set's", new RegExp(`^frsc:${cy ? "c:" : ""}${d.no}$`).test(String(d.token)), String(d.token));
const football = await get(join("/api/scrambled/daily", CYPHER));
t("and it is not football's board for the same day", football.status === 200 && !!football.json &&
  football.json.title !== d.title && String(football.json.token).startsWith("sc:"), football.json && football.json.title);
const tomorrow = Number.isInteger(d.no) ? await get(join("/api/scrambled_fr/daily?no=" + (d.no + 1), CYPHER)) : { status: 0 };
t("tomorrow is shut", tomorrow.status === 403, String(tomorrow.status));
const before = Number.isInteger(first) ? await get("/api/scrambled_fr/daily?no=" + (first - 1)) : { status: 0 };
t("and a number before the ring began is no board", before.status === 403 || before.status === 404, String(before.status));

console.log("\nPlay");
/* A WRONG NAME AGAINST A FRIENDS TOKEN: 200 with no solve proves the shared
   guess route found the board in the Friends set (a token it could not
   resolve is a 403), without giving anything away. */
const guess = d.token ? await get("/api/scrambled/guess", { method: "POST", body: JSON.stringify({ token: d.token, guess: "ZZZQX NOTANANSWER" }) }) : { status: 0 };
t("the shared guess route judges a Friends token against the Friends boards",
  guess.status === 200 && !!guess.json && guess.json.solvedId === null, guess.text.slice(0, 100));
const perma = Number.isInteger(d.no) ? await get(PATH + "daily/" + d.no) : { status: 0 };
t("today's board has its own address", perma.status === 200, String(perma.status));
const archive = await get(PATH + "archive/");
t("and the archive answers", archive.status === 200, String(archive.status));

console.log("\nThe API's HEAD");
const head = await fetch(BASE + join("/api/scrambled_fr/daily", CYPHER), { method: "HEAD", cache: "no-store" });
const headBody = await head.text();
t("HEAD answers 200 with an empty body", head.status === 200 && headBody === "", String(head.status));
t("and carries the API's noindex", /noindex/i.test(head.headers.get("x-robots-tag") || ""), head.headers.get("x-robots-tag") || "none");

t("this run reached the end without a block going quiet", ran >= MIN_ASSERTIONS, `${ran} assertion(s), floor ${MIN_ASSERTIONS}`);
console.log(`\n${pass} passed, ${fail} failed  (live check complete)`);
process.exit(fail ? 1 : 0);
