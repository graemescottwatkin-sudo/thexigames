#!/usr/bin/env node
/* friends/quickfire/live_check.mjs — QuickFire XI: Friends, against production.
 *
 *   node friends/quickfire/live_check.mjs --expect v001a
 *
 * Reads the DEPLOYED site; named in the workflow and never run in CI. It
 * proves what no offline suite can: that the Friends bank is in D1 (fr_qf_*)
 * and served from there, that the calendar began on the launch day, that the
 * Friends board is not football's, that a round opened on the Friends routes
 * does not exist on football's, and that no question leaves the server with
 * its answer marked.
 *
 * IT PLAYS ONE QUESTION of today's board: opens a round, serves question one
 * and gives up on it with a pick that is not one of its options, which the
 * server refuses without scoring or storing anything. The round row it leaves
 * is one unfinished sitting, which is what every abandoned round is.
 *
 * MIN_ASSERTIONS is the second net under the completion marker: set below the
 * run's real count by the assertions that can legitimately skip (the --expect
 * one), and reviewed, not raised by reflex, when checks are added.
 */
import { gamePath } from "../../functions/_lib/permalink.js";
import { LAUNCHED } from "../../functions/_lib/games.js";

const BASE = "https://www.thexigames.com";
const GAME = "quickfire_fr";
const NAME = "QuickFire XI: Friends";
const PATH = gamePath(GAME);
const MIN_ASSERTIONS = 20;

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
const post = (p, body) => get(p, { method: "POST", body: JSON.stringify(body) });

console.log(`${NAME} — live\n`);

const page = await get(PATH);
t("the page answers", page.status === 200, String(page.status));
if (EXPECT) t("the build tag is what was expected", new RegExp(`js/game\\.js\\?v=${EXPECT}\\b`).test(page.text), EXPECT);
const tags = [...page.text.matchAll(/(?:href|src)="(?:css|js)\/[^"?]+\?v=([^"]+)"/g)].map((m) => m[1]);
t("every one of this game's own assets carries the same tag", tags.length >= 3 && new Set(tags).size === 1, tags.join(" "));
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
const today = await get("/api/quickfire_fr/daily");
const d = today.json || {};
const qs = [...((d.daily && d.daily.questions) || []), ...((d.daily && d.daily.bench) || [])];
t("today's board answers, FROM D1", today.status === 200 && d.source === "d1" && Number.isInteger(d.no), today.text.slice(0, 120));
t("eleven questions and three to skip to, four options each", qs.length === 14 && qs.every((q) => Array.isArray(q.options) && q.options.length === 4),
  `${qs.length} question(s)`);
t("and no question carries its answer", qs.every((q) => !("answer" in q) && !("answer_norm" in q) && !("aliases" in q)));
t("no weekly round: that is football's", d.week === null, String(d.week));
const football = await get("/api/quickfire/daily");
const fq = ((football.json && football.json.daily && football.json.daily.questions) || []).map((q) => q.clue);
t("and it is not football's board for the same day", football.status === 200 && fq.length === 11 &&
  qs.slice(0, 11).every((q, i) => q.clue !== fq[i]), (qs[0] || {}).clue);
const first = await get("/api/quickfire_fr/daily?date=" + LAUNCHED[GAME]);
t("the calendar began on the launch day", first.status === 200 && first.json && first.json.day === LAUNCHED[GAME],
  `${first.status} ${first.json && first.json.day}`);
const before = await get("/api/quickfire_fr/daily?date=2026-09-28");
t("and there is no board before it", before.status === 404, String(before.status));
const tomorrow = Number.isInteger(d.no) ? await get("/api/quickfire_fr/daily?no=" + (d.no + 1)) : { status: 0 };
t("tomorrow is shut", tomorrow.status === 404, String(tomorrow.status));

console.log("\nPlay");
const open = await post("/api/quickfire_fr/play", {});
const playId = open.json && open.json.playId;
t("a round opens on the Friends routes", open.status === 200 && typeof playId === "string", open.text.slice(0, 80));
const served = playId ? await post("/api/quickfire_fr/next", { playId, idx: 1 }) : { status: 0 };
t("and serves its first question", served.status === 200 && served.json && served.json.idx === 1, served.text.slice(0, 80));
const refused = playId ? await post("/api/quickfire_fr/answer", { playId, idx: 1, pick: "not one of the four" }) : { status: 0 };
t("a pick that is not one of its options is refused, and nothing is scored",
  refused.status === 400 && refused.json && refused.json.error === "that was not one of the options", refused.text.slice(0, 80));
const cross = playId ? await post("/api/quickfire/next", { playId, idx: 1 }) : { status: 0 };
t("and a Friends round does not exist on football's routes", cross.status === 400 && cross.json && cross.json.error === "no round",
  cross.text.slice(0, 80));
const perma = Number.isInteger(d.no) ? await get(PATH + "daily/" + d.no) : { status: 0 };
t("today's board has its own address", perma.status === 200, String(perma.status));
const archive = await get(PATH + "archive/");
t("and the archive answers", archive.status === 200, String(archive.status));

console.log("\nThe API's HEAD");
const head = await fetch(BASE + "/api/quickfire_fr/daily", { method: "HEAD", cache: "no-store" });
const headBody = await head.text();
t("HEAD answers 200 with an empty body", head.status === 200 && headBody === "", String(head.status));
t("and carries the API's noindex", /noindex/i.test(head.headers.get("x-robots-tag") || ""), head.headers.get("x-robots-tag") || "none");

t("this run reached the end without a block going quiet", ran >= MIN_ASSERTIONS, `${ran} assertion(s), floor ${MIN_ASSERTIONS}`);
console.log(`\n${pass} passed, ${fail} failed  (live check complete)`);
process.exit(fail ? 1 : 0);
