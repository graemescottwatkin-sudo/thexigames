/* labels_test.mjs — four things the crossword said that were not true.
 *
 * All found on the Play build, 24 Sep 2026 (MobileApp's log, 8i):
 *   a) My Season printed "undefinedth" for Best finish and in Recent results:
 *      a result pulled from the account carries no league position, and
 *      `undefined < null` let it become the best finish.
 *   b) Signed in, the history's footer still read "Saved on this device only".
 *   c) A result was dated by the DEVICE's local day, so a board finished after
 *      midnight in Britain was filed a day late, disagreeing with the calendar.
 *   d) A board five days old was labelled "TODAY'S PUZZLE", on the board and in
 *      the kick-off box.
 *
 * Driven in the real page in jsdom; the account endpoints stubbed; a past
 * board opened at its permanent address exactly as production serves it (the
 * page with a <base> tag).
 *
 *   node football/crossword/labels_test.mjs        (from the repo root)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import { onRequestGet as apiDaily } from "../../functions/api/daily.js";
import { onRequestGet as apiCategories } from "../../functions/api/categories.js";
import { onRequestGet as apiStatus } from "../../functions/api/status.js";
import { dailyNumber, dailyDayKey } from "../../functions/_lib/daily.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* WAIT FOR THE THING, NOT FOR A NUMBER OF MILLISECONDS. Each page was given a
   fixed five and a half seconds to boot and two and a half to load a board, and
   a loaded machine loses that race. The page says when it is ready — the
   account's result merged into this device's history, a board's squares drawn,
   the landing screen built — so that is what is waited on. The deadline stops
   a wait that cannot end: a condition that never comes true returns false and
   the assertion after it fails as it always would have. */
const until = async (ok, ms = 10000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await wait(20);
  return ok();
};
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };
const REAL = { "/api/daily": apiDaily, "/api/categories": apiCategories, "/api/status": apiStatus };

/* ONE READING OF THE CLOCK, handed to both sides. */
const NOW = Date.now();
const SERVER_DATE = new Date(NOW).toUTCString();
const TODAY_NO = dailyNumber(NOW);
const PAST_NO = TODAY_NO - 3;

let user = null;
let accountResults = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const send = (o) => { res.writeHead(200, { "Content-Type": "application/json", Date: SERVER_DATE }); res.end(JSON.stringify(o)); };
  if (url.pathname === "/api/auth/session") return send({ user, googleClientId: null });
  if (url.pathname === "/api/account/results") return send({ results: accountResults });
  if (url.pathname.startsWith("/api/account/")) return send({ added: 0, results: [], user: null });
  const fn = REAL[url.pathname];
  if (fn) {
    const out = await fn({ request: new Request("http://127.0.0.1" + req.url, { method: req.method }), env: {} });
    res.writeHead(out.status, { "Content-Type": "application/json", Date: SERVER_DATE });
    return res.end(await out.text());
  }
  if (url.pathname.startsWith("/api/")) return send({});
  /* A board's permanent address: the page, with a <base> so its own relative
     assets resolve, which is what permalinkPage does in production. */
  const perma = /^\/football\/crossword\/daily\/(\d+)$/.exec(url.pathname);
  if (perma) {
    const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8").replace("<head>", '<head><base href="/football/crossword/">');
    res.writeHead(200, { "Content-Type": TYPES[".html"], Date: SERVER_DATE });
    return res.end(html);
  }
  let rel = url.pathname.replace(/^\/football\/crossword/, "");
  if (rel === "/" || rel === "") rel = "/index.html";
  const file = rel.startsWith("/shared/") ? path.join(ROOT, rel.slice(1)) : path.join(DIR, rel);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { Date: SERVER_DATE }); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", Date: SERVER_DATE });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;

/* The squares are drawn in the same synchronous pass that writes the strap and
   the kick-off card, so a board with squares has its labels too. */
const drawn = (dom) => dom.window.document.querySelectorAll("#grid .cell").length > 0;
const landed = (dom) => dom.window.document.getElementById("homeClubSelect").options.length > 0;
/* The account's row has reached this device's history: the pull has landed and
   been merged, which is what My Season reads. */
const merged = (no) => (dom) => {
  try { return JSON.parse(dom.window.localStorage.getItem("fcw.results.v1") || "[]").some((r) => r && r.dailyNo === no); }
  catch (e) { return false; }
};
async function open(at, ready, storage = {}) {
  const dom = await JSDOM.fromURL(origin + at, {
    runScripts: "dangerously", pretendToBeVisual: true, resources: "usable",
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      w.scrollTo = () => {}; w.scrollBy = () => {};
      w.fetch = (u, o) => fetch(new URL(u, w.location.href), o);
      w.confirm = () => true;
      for (const k in storage) w.localStorage.setItem(k, typeof storage[k] === "string" ? storage[k] : JSON.stringify(storage[k]));
    },
  });
  await until(() => dom.window.document.readyState === "complete" && ready(dom), 30000);
  return dom;
}
const txt = (d, id) => ((d.getElementById(id) || {}).textContent || "").trim();

console.log("a) and b): My Season, with a result the account holds");
{
  user = { id: "u-owner", displayName: "Graeme" };
  /* The shape /api/account/results returns: no league position. */
  accountResults = [{ game: "crossword", entryKey: "daily:" + PAST_NO, dailyNo: PAST_NO, mode: "daily",
    score: 86, elapsedSeconds: 402, club: null, season: null, completedAt: new Date(NOW).toISOString() }];
  const dom = await open("/football/crossword/", merged(PAST_NO));
  const d = dom.window.document;
  d.getElementById("statsBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await until(() => d.getElementById("statsSheet").classList.contains("show"));
  const grid = txt(d, "statGrid"), hist = txt(d, "historyBody");
  t("a result with no position: nobody reads 'undefined'", !/undefined/.test(grid + hist), (grid + " | " + hist).slice(0, 140));
  t("Best finish says '—' rather than inventing one", /—\s*Best finish/.test(grid), grid.slice(0, 120));
  t("the history row shows the board's own day", hist.includes(dailyDayKey(PAST_NO)), hist.slice(0, 80));
  t("b) signed in, the footer says it is saved to the account", /Saved to your account/.test(txt(d, "statsKept")), txt(d, "statsKept"));
  dom.window.close();
}
{
  user = null; accountResults = [];
  const dom = await open("/football/crossword/", landed);
  const d = dom.window.document;
  d.getElementById("statsBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await until(() => d.getElementById("statsSheet").classList.contains("show"));
  t("b) signed out, it still says this device only", /Saved on this device only/.test(txt(d, "statsKept")), txt(d, "statsKept"));
  dom.window.close();
}

console.log("\nd) and c): a board three days old, at its own address");
{
  user = null; accountResults = [];
  const dom = await open("/football/crossword/daily/" + PAST_NO, drawn);
  const d = dom.window.document;
  const strap = txt(d, "strapText"), mode = txt(d, "kickMode"), note = txt(d, "kickNote");
  t("the page opened that board", /daily/i.test(strap) || mode.length > 0, strap || mode);
  t("d) it is not called today's puzzle, on the board or at kick-off",
    !/Today.s puzzle/i.test(strap) && !/Today.s puzzle/i.test(mode) && !/^Today.s puzzle/.test(note),
    `${strap} | ${mode} | ${note}`);
  t("d) it says what it is", /Previous daily|Pre-season|Matchday/.test(strap) && /earlier daily|Pre-season|Matchday/i.test(mode + " " + note),
    `${mode} | ${note}`);
  dom.window.close();
}
{
  const dom = await open("/football/crossword/", landed);
  const d = dom.window.document;
  (d.getElementById("homeDaily") || d.getElementById("dailyBtn")).dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await until(() => drawn(dom));
  const mode = txt(d, "kickMode"), note = txt(d, "kickNote");
  t("today's board is still today's puzzle", /Today.s puzzle|Pre-season|Matchday/.test(mode + " " + note), `${mode} | ${note}`);
  dom.window.close();
}

console.log("\nc) the result is dated by its board");
{
  const src = fs.readFileSync(path.join(DIR, "js", "engine.js"), "utf8");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
  dom.window.eval(src);
  const FCW = dom.window.FCW;
  /* The page's own expression for the day it records, asked of the engine. */
  const recorded = FCW.localDateKey(FCW.dailyDate(PAST_NO));
  t("the day a result is filed under is the server's day for that board",
    recorded === dailyDayKey(PAST_NO), `${recorded} vs ${dailyDayKey(PAST_NO)}`);
  const game = fs.readFileSync(path.join(DIR, "js", "game.js"), "utf8");
  t("and recordDaily uses exactly that, not the device's local today",
    game.includes("date: FCW.localDateKey(FCW.dailyDate(board.no)), at: Date.now(), dailyNo: board.no"));
  const st = FCW.seasonStats([
    { dailyNo: 3, score: 36, elapsedSeconds: 2850, position: undefined, complete: true, mode: "daily", at: 0 },
    { dailyNo: 4, score: 70, elapsedSeconds: 500, position: 5, complete: true, mode: "daily", at: 0 },
  ], 6);
  t("a) the engine: best finish comes from the result that has one", st.bestFinish === 5, String(st.bestFinish));
  const none = FCW.seasonStats([{ dailyNo: 3, score: 36, elapsedSeconds: 2850, complete: true, mode: "daily", at: 0 }], 6);
  t("a) and with none, it is null, not undefined", none.bestFinish === null, String(none.bestFinish));
}

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
