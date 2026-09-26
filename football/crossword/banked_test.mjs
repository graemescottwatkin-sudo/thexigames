/* banked_test.mjs — a board already banked reopens finished, not empty.
 *
 * The owner, 26 Sep 2026, on the iPad: "It says I already played but nothing
 * filled in". Crossword No. 9 was banked at 36 (21:45 UTC). Eight minutes
 * later a device holding a morning save -- no letters, 50 seconds -- pushed it
 * to /api/account/state, the endpoint stamped it newest, and the iPad adopted
 * an empty board over a finished one. Typing into it (MONACO) pushed again.
 *
 * The fix is two halves and this suite RUNS both together: the page, in
 * jsdom, talking to the REAL functions/api/account/state.js over a stubbed D1
 * that holds the player's result and journey. A stub standing in for the
 * endpoint would prove only that the page agrees with the stub.
 *
 *   1. A device with leftover play on a banked board is refused, and then
 *      opens the finished grid the account holds -- Full Time showing.
 *   2. A device that finished before the final grid was ever sent (every
 *      board before this change) sends it when it next opens the board, so
 *      the other devices can.
 *
 *   node football/crossword/banked_test.mjs      (from the repo root)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { localResources } from "../../tools/local_resources.js";
import { onRequestGet as apiDaily } from "../../functions/api/daily.js";
import { onRequestGet as apiCategories } from "../../functions/api/categories.js";
import { onRequestGet as apiStatus } from "../../functions/api/status.js";
import { onRequestGet as stateGet, onRequestPost as statePost } from "../../functions/api/account/state.js";
import { dailyNumber } from "../../functions/_lib/daily.js";
import { getDailyPuzzle } from "../../functions/_lib/db.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css",
  ".js": "text/javascript", ".json": "application/json", ".txt": "text/plain" };
const REAL = { "/api/daily": apiDaily, "/api/categories": apiCategories, "/api/status": apiStatus };

/* One reading of the clock, handed to both sides. */
const NOW = Date.now();
const SERVER_DATE = new Date(NOW).toUTCString();
const TODAY_NO = dailyNumber(NOW);
const KEY = "daily:" + TODAY_NO;
const SLOT = "fcw.v04.daily." + TODAY_NO;
const SYNC = "fcw.v04.sync.daily." + TODAY_NO;

/* The board the page will be served (no database: the sample set), and its
   solution -- the finished grid a device that solved it would hold. */
const PUZZLE = (await getDailyPuzzle({}, TODAY_NO)).puzzle;
const SOLUTION = {};
for (const k of Object.keys(PUZZLE.cells)) SOLUTION[k] = PUZZLE.cells[k].ch;

/* ---- the account, as D1 holds it ---------------------------------------- */
const USER = "banked-test-user";
let results = [];      // { user_id, game, entry_key }
let rows = [];         // board_state
const posts = [];
const DB = { prepare: (sql) => ({ bind: (...b) => ({
  first: async () => {
    if (/FROM sessions/.test(sql)) return { id: USER, user_id: USER, display_name: "Tester", expires_at: "9999-01-01" };
    if (/FROM users/.test(sql)) return { id: USER, display_name: "Tester" };
    if (/FROM results/.test(sql)) {
      return results.some((x) => x.user_id === b[0] && x.game === b[1] && x.entry_key === b[2]) ? { hit: 1 } : null;
    }
    if (/FROM board_state/.test(sql)) {
      const r = rows.find((x) => x.user_id === b[0] && x.game === b[1] && x.entry_key === b[2]);
      return r ? { state: r.state, updated_at: r.updated_at } : null;
    }
    return null;
  },
  run: async () => {
    const i = rows.findIndex((x) => x.user_id === b[0] && x.game === b[1] && x.entry_key === b[2]);
    if (/DELETE FROM board_state/.test(sql)) { if (i > -1) rows.splice(i, 1); return; }
    if (/INSERT INTO board_state/.test(sql)) {
      const row = { user_id: b[0], game: b[1], entry_key: b[2], state: b[3], updated_at: b[4] };
      if (i > -1) rows[i] = row; else rows.push(row);
    }
  },
  all: async () => ({ results: [] }),
}) }) };
const ENV = { DB };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const send = (obj, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json", Date: SERVER_DATE });
    res.end(JSON.stringify(obj));
  };
  if (url.pathname === "/api/auth/session") {
    return send({ user: { id: USER, displayName: "Tester" }, googleClientId: null });
  }
  if (url.pathname === "/api/account/state") {
    let raw = ""; for await (const c of req) raw += c;
    /* The real endpoint, with the session cookie the page's own would carry. */
    const headers = new Headers(req.headers);
    headers.set("Cookie", "cxi_session=banked");
    const request = new Request("http://127.0.0.1" + req.url, {
      method: req.method, headers, body: req.method === "POST" ? raw : undefined });
    const out = await (req.method === "POST" ? statePost : stateGet)({ request, env: ENV });
    const text = await out.text();
    if (req.method === "POST") posts.push({ status: out.status, body: JSON.parse(raw || "{}"), answer: text });
    res.writeHead(out.status, { "Content-Type": "application/json", Date: SERVER_DATE });
    return res.end(text);
  }
  if (url.pathname.startsWith("/api/account/")) return send({ results: [], user: null });
  const fn = REAL[url.pathname];
  if (fn) {
    const out = await fn({ request: new Request("http://127.0.0.1" + req.url, { method: req.method }), env: {} });
    res.writeHead(out.status, { "Content-Type": "application/json", Date: SERVER_DATE });
    return res.end(await out.text());
  }
  if (url.pathname.startsWith("/api/")) return send({});
  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = rel.startsWith("/shared/") ? path.join(ROOT, rel.slice(1)) : path.join(DIR, rel);
  const SHARED = path.join(ROOT, "shared");
  if ((!file.startsWith(DIR) && !file.startsWith(SHARED)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { Date: SERVER_DATE }); return res.end("not found");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", Date: SERVER_DATE });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(test, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (test()) return true; await wait(250); }
  return test();
}

const snap = (letters, extra = {}) => JSON.stringify({
  mode: "daily", dailyNo: TODAY_NO, letters, elapsed: 50, complete: false,
  revealedCells: [], revealAnswerCells: [], revealedEntries: [], subbedCells: [],
  subs: 0, checks: 0, checkAlls: 0, helpActions: [], pauseCount: 0, pausedMs: 0,
  club: "Arsenal", clubMode: "chosen", ...extra,
});
const cells = (w) => [...w.document.querySelectorAll("#grid .cell[data-x]")];
const painted = (w) => {
  const out = {};
  for (const el of cells(w)) {
    const v = (el.querySelector(".ltr") || {}).textContent || "";
    if (v) out[el.dataset.x + "," + el.dataset.y] = v;
  }
  return out;
};
const slot = (w) => { try { return JSON.parse(w.localStorage.getItem(SLOT)); } catch (e) { return null; } };
const fullTime = (w) => w.document.getElementById("doneOverlay").classList.contains("show");

async function openDaily(seed) {
  const dom = await JSDOM.fromURL(origin + "/", {
    runScripts: "dangerously", pretendToBeVisual: true, resources: localResources(),
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      w.scrollTo = () => {}; w.scrollBy = () => {};
      w.fetch = (u, o = {}) => fetch(String(u).startsWith("http") ? u : origin + u, o);
      /* "You have already played this one ... Open it anyway?" -- the owner
         said yes. */
      w.confirm = () => true;
      w.localStorage.clear();
      for (const k in seed || {}) w.localStorage.setItem(k, seed[k]);
    },
  });
  const w = dom.window, d = w.document;
  await until(() => d.readyState === "complete" &&
    (d.getElementById("accountToggle") || {}).textContent === "account" &&
    !d.getElementById("newBtn").classList.contains("busy"), 30000);
  const btn = d.getElementById("homeDaily");
  if (btn) btn.click();
  return dom;
}

const FINISHED = snap(SOLUTION, { elapsed: 2567, complete: true });
const solvedCount = Object.keys(SOLUTION).length;
t("PRECONDITION: the board has a solution to finish with", solvedCount > 10, solvedCount + " squares");

console.log("1. Leftover play on a banked board: refused, then opened finished");
{
  results = [{ user_id: USER, game: "crossword", entry_key: KEY }];
  rows = [{ user_id: USER, game: "crossword", entry_key: KEY, state: FINISHED, updated_at: "2026-09-26T21:45:05.000Z" }];
  posts.length = 0;
  /* The iPad: a board it adopted empty, one word typed into it since, and a
     sync record for the empty board -- so the page counts the word as play
     the account never saw, and pushes instead of asking. */
  const k0 = Object.keys(SOLUTION)[0];
  const seed = {
    [SLOT]: snap({ [k0]: "M" }, { elapsed: 60 }),
    [SYNC]: JSON.stringify({ syncedAt: "2026-09-26T21:52:59.836Z", sig: "an-empty-board" }),
  };
  const dom = await openDaily(seed);
  const w = dom.window;
  await until(() => fullTime(w), 30000);
  const refused = posts.find((p) => p.status === 409);
  t("its leftover play is refused by the account, which says the board is banked",
    !!refused && /"banked":true/.test(refused.answer), posts.map((p) => p.status).join(",") || "no push");
  t("the finished grid is kept on the account, not replaced",
    rows.length === 1 && JSON.parse(rows[0].state).complete === true);
  const shown = painted(w);
  const right = Object.keys(SOLUTION).filter((k) => shown[k] === SOLUTION[k]).length;
  t("the board opens FINISHED: every square holds its letter",
    right === solvedCount, `${right} of ${solvedCount}`);
  t("and Full Time is showing", fullTime(w));
  t("and the device keeps the finished board", !!slot(w) && slot(w).complete === true);
  dom.window.close();
}

console.log("\n2. The device that finished, before the final grid was ever sent");
{
  results = [{ user_id: USER, game: "crossword", entry_key: KEY }];
  rows = [];
  posts.length = 0;
  /* Finished here, never sent: no sync record, a complete save. */
  const dom = await openDaily({ [SLOT]: FINISHED });
  const w = dom.window;
  await until(() => rows.length === 1, 30000);
  t("it sends its finished grid when it opens the board",
    rows.length === 1 && JSON.parse(rows[0].state).complete === true,
    posts.map((p) => p.status).join(",") || "nothing sent");
  t("and the account now holds it for the other devices",
    rows.length === 1 && Object.keys(JSON.parse(rows[0].state).letters).length === solvedCount);
  dom.window.close();
}

console.log("\n3. A finished board on the device is never replaced by an unfinished one");
/* The page wrote an adopted journey into the board's slot BEFORE it asked
   whether the board here was finished, so an older journey on the account
   could overwrite the one device's finished grid. Not banked here, so the
   server rule does not apply: this is the page's own guard. */
{
  results = [];
  rows = [{ user_id: USER, game: "crossword", entry_key: KEY,
    state: snap({ [Object.keys(SOLUTION)[0]]: SOLUTION[Object.keys(SOLUTION)[0]] }, { elapsed: 50 }),
    updated_at: "2026-09-26T21:52:59.836Z" }];
  posts.length = 0;
  const dom = await openDaily({ [SLOT]: FINISHED });
  const w = dom.window;
  await until(() => fullTime(w), 30000);
  await wait(1500);                                   // let the account's answer land and be judged
  const kept = slot(w);
  t("the device keeps its finished board",
    !!kept && kept.complete === true && Object.keys(kept.letters || {}).length === solvedCount,
    kept ? `complete ${kept.complete}, ${Object.keys(kept.letters || {}).length} letters` : "no slot");
  const shown = painted(w);
  t("and still shows it finished", Object.keys(SOLUTION).every((k) => shown[k] === SOLUTION[k]) && fullTime(w));
  dom.window.close();
}

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
