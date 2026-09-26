/* rebuild_race_test.mjs — the account's newer journey survives whatever answers first.
 *
 * THE FAULT, found 26 Sep 2026. A daily in progress resumes at boot and pulls
 * the account's journey for that board. Tap Menu then Daily before the pull
 * answers, and the tap's load sets off holding this device's letters as they
 * were. The pull then finds another device's newer journey, writes it to the
 * board's slot and loads the board again with it. Two loads are in flight, and
 * every load painted whatever it was handed when its answer arrived — so the
 * NETWORK decided which won. When the tap's answer landed second, this
 * device's older letters were painted, saved over the adopted journey, and
 * pushed with the next keystroke: the other device's play, gone from the
 * account. Nothing about it needs bad luck beyond a slow answer; on a phone
 * with a weak signal the tap is well inside the pull's round trip.
 *
 * WHAT THIS DRIVES, in the real page in jsdom, signed in, with every answer
 * the order depends on HELD by the test server and released in the order
 * under test — so the ordering is forced, not hoped for:
 *   1. the reported fault: the tap's load answers LAST, after the adopted
 *      journey is drawn. It draws nothing and saves nothing, and the next
 *      keystroke sends the adopted journey, not the old letters.
 *   2. the tap's load answers while the adoption's is still out: it draws and
 *      saves nothing, and the board stays loading until the load that
 *      overtook it is drawn.
 *   3. the control: the tap's load answers first. Adoption still happens —
 *      the fix must not stop a newer journey being taken.
 *   4. no tap: the session answers after the resumed board is drawn. Once
 *      signed in the page pulls the journey it could not pull before, adopts
 *      it, and sends that — not the old letters.
 * In every order the adopted journey is what ends up drawn, kept and sent.
 *
 *   node football/crossword/rebuild_race_test.mjs        (from the repo root)
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
import { dailyNumber } from "../../functions/_lib/daily.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css",
  ".js": "text/javascript", ".json": "application/json", ".txt": "text/plain" };
const REAL = { "/api/daily": apiDaily, "/api/categories": apiCategories, "/api/status": apiStatus };

/* ONE READING OF THE CLOCK, handed to both sides, as unpushed_test does. */
const NOW = Date.now();
const SERVER_DATE = new Date(NOW).toUTCString();
const TODAY_NO = dailyNumber(NOW);
const SLOT = "fcw.v04.daily." + TODAY_NO;

/* The account, as the server holds it; every push is stored and stamped. */
let account = { state: null, updatedAt: null };
const pushes = [];

/* HELD ANSWERS. Only the window under test is counted and held — it tags its
   requests — so a window opened to learn the board's cells, or one already
   closed, cannot take a gate meant for another. A request that arrives while
   its gate is armed waits for release; `arrived` says it is waiting. */
let windowNo = 0;
const counts = { pull: 0, daily: 0 };
let holds = {};
const gate = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open, arrived: false }; };
async function held(kind, mine) {
  if (!mine) return;
  const n = ++counts[kind];
  /* The boot's board waits for the session: the pull runs only for a page
     that already knows it is signed in, and which of the two answers first is
     otherwise the network's choice. This suite is about the loads AFTER that. */
  if (kind === "daily" && n === 1 && !lateSession) await sessionAnswered.p;
  const g = holds[kind + ":" + n];
  if (g) { g.arrived = true; await g.p; }
}
let sessionAnswered = gate();
/* Case 4 turns that round: the session is held until the board is drawn. */
let lateSession = null;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const mine = windowNo > 0 && Number(req.headers["x-test-window"]) === windowNo;
  const send = (obj) => {
    res.writeHead(200, { "Content-Type": "application/json", Date: SERVER_DATE });
    res.end(JSON.stringify(obj));
  };
  /* Signed in only in the window under test: the probe must not pull. */
  if (url.pathname === "/api/auth/session") {
    if (!mine) return send({ user: null });
    if (lateSession) { lateSession.arrived = true; await lateSession.p; }
    send({ user: { id: "race-test-user", displayName: "Tester" }, googleClientId: null });
    /* Answered is not read: the page acts on it a tick later. */
    setTimeout(() => sessionAnswered.open(), 200);
    return;
  }
  if (url.pathname === "/api/account/state") {
    if (req.method === "POST") {
      let raw = ""; for await (const c of req) raw += c;
      if (!mine) return send({});
      const body = JSON.parse(raw || "{}");
      pushes.push(body);
      account = { state: body.state, updatedAt: new Date(Date.UTC(2026, 8, 26, 12, 0, pushes.length)).toISOString() };
      return send({ updatedAt: account.updatedAt });
    }
    await held("pull", mine);
    return send(account.state ? account : { state: null });
  }
  if (url.pathname.startsWith("/api/account/")) return send({ results: [], user: null });
  const fn = REAL[url.pathname];
  if (fn) {
    if (url.pathname === "/api/daily") await held("daily", mine);
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
/* Waits on what the page says, with a deadline: a condition that never comes
   true returns false and the assertion after it fails. */
const until = async (ok, ms = 20000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await wait(20);
  return ok();
};

async function open(tag, seed) {
  return JSDOM.fromURL(origin + "/", {
    runScripts: "dangerously", pretendToBeVisual: true, resources: localResources(),
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      w.scrollTo = () => {}; w.scrollBy = () => {};
      w.fetch = (u, o = {}) => {
        const headers = new Headers(o.headers);
        headers.set("X-Test-Window", String(tag));
        return fetch(String(u).startsWith("http") ? u : origin + u, { ...o, headers });
      };
      w.confirm = () => true;
      w.localStorage.clear();
      for (const k in seed || {}) w.localStorage.setItem(k, seed[k]);
    },
  });
}
const cellsOf = (d) => [...d.querySelectorAll("#grid .cell[data-x]")];

/* Three cells of today's board, learned in a window that is not signed in. */
let targets = [];
{
  const dom = await open(0, {});
  const d = dom.window.document;
  await until(() => d.readyState === "complete" && !!d.getElementById("homeDaily"), 30000);
  d.getElementById("homeDaily").click();
  await until(() => cellsOf(d).length > 0, 30000);
  targets = cellsOf(d).slice(0, 3).map((el) => el.dataset.x + "," + el.dataset.y);
  dom.window.close();
}
t("today's board has cells to write into", targets.length === 3, targets.join(" "));

const snapWith = (letters, elapsed) => JSON.stringify({
  mode: "daily", dailyNo: TODAY_NO, letters, elapsed, complete: false,
  revealedCells: [], revealAnswerCells: [], revealedEntries: [], subbedCells: [],
  subs: 0, checks: 0, checkAlls: 0, helpActions: [], pauseCount: 0, pausedMs: 0,
});
const MINE = {}, THEIRS = {};
["A", "B", "C"].forEach((c, i) => { MINE[targets[i]] = c; });
["X", "Y", "Z"].forEach((c, i) => { THEIRS[targets[i]] = c; });
const word = (o) => targets.map((k) => (o || {})[k] || "-").join("");

/* One scenario. This device holds ABC and no sync record; the account holds
   another device's newer XYZ, so the pull adopts (unpushed_test case 3's
   rule). The tap's load is daily #2 and the adoption's is daily #3. */
async function scenario(order) {
  account = { state: snapWith(THEIRS, 300), updatedAt: "2026-09-26T11:00:00.000Z" };
  pushes.length = 0;
  counts.pull = 0; counts.daily = 0;
  holds = { "pull:1": gate(), "daily:2": gate(), "daily:3": gate() };
  sessionAnswered = gate();
  windowNo++;
  const dom = await open(windowNo, { [SLOT]: snapWith(MINE, 100), "fcw.mode": "daily" });
  const w = dom.window, d = w.document;
  const painted = () => {
    const o = {};
    for (const el of cellsOf(d)) { const v = (el.querySelector(".ltr") || {}).textContent || ""; if (v) o[el.dataset.x + "," + el.dataset.y] = v; }
    return o;
  };
  const slot = () => { try { return JSON.parse(w.localStorage.getItem(SLOT)).letters || {}; } catch (e) { return {}; } };
  const busy = () => d.getElementById("newBtn").classList.contains("busy");

  await until(() => d.readyState === "complete" && counts.daily >= 1 && !busy() && cellsOf(d).length > 0, 30000);
  const pullOut = await until(() => holds["pull:1"].arrived, 30000);
  t("the daily resumes at boot, from this device's letters, and pulls the account's",
    word(painted()) === "ABC" && pullOut, `painted ${word(painted())}, pull held ${pullOut}`);

  d.getElementById("menuBtn").click();
  await until(() => d.getElementById("homeOverlay").classList.contains("show"));
  d.getElementById("homeDaily").click();
  const tapOut = await until(() => holds["daily:2"].arrived);
  t("Daily is tapped while that pull is still out, and its load sets off", tapOut);

  if (order === "tap-first") {
    holds["daily:2"].open();
    await until(() => !busy() && word(painted()) === "ABC");
  }
  holds["pull:1"].open();
  const adopting = await until(() => holds["daily:3"].arrived);
  t("the pull finds the newer journey and loads the board again with it", adopting,
    `slot ${word(slot())}`);

  /* The overtaken load's answer, released while nothing else can explain what
     follows. A mark on a cell of the grid on screen shows whether it drew a
     board — a drawn board replaces the cells — where letters could not, since
     the screen may already hold the ones it would draw. Each wait after it is
     fixed on purpose: what is proved is that the overtaken load does NOT
     paint, save or clear the loading state, and no condition can wait for
     something that must not happen. On the old code it did all three within
     milliseconds. */
  async function overtakenAnswers(during) {
    cellsOf(d)[0].setAttribute("data-race-mark", "1");
    holds["daily:2"].open();
    await wait(1500);
    t(`THE FAULT${during}: the overtaken load does not save this device's older letters over the adopted journey`,
      word(slot()) === "XYZ", `slot ${word(slot())}`);
    t("and does not draw a board", !!d.querySelector('#grid .cell[data-race-mark="1"]'),
      "the grid on screen was replaced");
  }

  if (order === "tap-while-adoption-out") {
    await overtakenAnswers(" (adoption still out)");
    t("and the board is still loading: it waits for the load that overtook it", busy());
  }
  holds["daily:3"].open();
  await until(() => !busy() && word(painted()) === "XYZ");
  if (order === "tap-last") {
    await overtakenAnswers(" (adoption already drawn)");
    t("and the board stays drawn and ready", !busy() && word(painted()) === "XYZ",
      `painted ${word(painted())}, loading ${busy()}`);
  }
  await wait(500);   // fixed: nothing may repaint after the adoption is drawn
  t("the adopted journey is what is drawn", word(painted()) === "XYZ", `painted ${word(painted())}`);
  t("and what is kept on the device", word(slot()) === "XYZ", `slot ${word(slot())}`);

  /* The player carries on. What goes up is the adopted journey plus the new
     letter — never this device's old letters over the other device's play. */
  const cell = cellsOf(d).find((el) => !targets.includes(el.dataset.x + "," + el.dataset.y));
  const before = pushes.length;
  cell.dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
  await wait(150);   // pauses between synchronous handlers, not a race
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Q", bubbles: true }));
  const sent = await until(() => pushes.length > before);
  const acct = JSON.parse(account.state || "{}").letters || {};
  t("the next keystroke sends the adopted journey to the account, not the old letters",
    sent && word(acct) === "XYZ" && Object.keys(acct).length === 4,
    `pushed ${sent}, account holds ${word(acct)} + ${Object.keys(acct).length - 3} more`);
  w.close();
}

console.log("\n1. The tap's load answers LAST, after the adoption is drawn: the reported fault");
await scenario("tap-last");
console.log("\n2. The tap's load answers while the adoption's is still out");
await scenario("tap-while-adoption-out");
console.log("\n3. The tap's load answers first: adoption still happens");
await scenario("tap-first");

/* 4. NO TAP AT ALL: the session answers after the resumed board is drawn.
   A load pulls only for a page that knows it is signed in, so this board was
   never pulled — the device kept its older letters and sent them with the
   next keystroke, over the other device's journey. Found by the same
   investigation, and the likelier of the two: nothing but the network decides
   which of two boot requests answers first. */
console.log("\n4. The session answers after the resumed board is drawn");
{
  account = { state: snapWith(THEIRS, 300), updatedAt: "2026-09-26T11:00:00.000Z" };
  pushes.length = 0;
  counts.pull = 0; counts.daily = 0;
  holds = {};
  lateSession = gate();
  windowNo++;
  const dom = await open(windowNo, { [SLOT]: snapWith(MINE, 100), "fcw.mode": "daily" });
  const w = dom.window, d = w.document;
  const painted = () => {
    const o = {};
    for (const el of cellsOf(d)) { const v = (el.querySelector(".ltr") || {}).textContent || ""; if (v) o[el.dataset.x + "," + el.dataset.y] = v; }
    return o;
  };
  const slot = () => { try { return JSON.parse(w.localStorage.getItem(SLOT)).letters || {}; } catch (e) { return {}; } };
  const busy = () => d.getElementById("newBtn").classList.contains("busy");
  await until(() => d.readyState === "complete" && counts.daily >= 1 && !busy() && word(painted()) === "ABC", 30000);
  t("the board is drawn from this device's letters while the session is still out",
    word(painted()) === "ABC" && lateSession.arrived && counts.pull === 0,
    `painted ${word(painted())}, session waiting ${lateSession.arrived}, pulls ${counts.pull}`);
  lateSession.open();
  const pulled = await until(() => counts.pull >= 1);
  t("THE FAULT: once signed in, the board's journey is pulled", pulled, `pulls ${counts.pull}`);
  await until(() => !busy() && word(painted()) === "XYZ");
  t("and the newer journey is adopted and drawn", word(painted()) === "XYZ", `painted ${word(painted())}`);
  t("and kept on the device", word(slot()) === "XYZ", `slot ${word(slot())}`);
  const cell = cellsOf(d).find((el) => !targets.includes(el.dataset.x + "," + el.dataset.y));
  const before = pushes.length;
  cell.dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
  await wait(150);   // pauses between synchronous handlers, not a race
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Q", bubbles: true }));
  const sent = await until(() => pushes.length > before);
  const acct = JSON.parse(account.state || "{}").letters || {};
  t("and the next keystroke sends it, not the old letters",
    sent && word(acct) === "XYZ" && Object.keys(acct).length === 4,
    `pushed ${sent}, account holds ${word(acct)} + ${Object.keys(acct).length - 3} more`);
  w.close();
  lateSession = null;
}

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
