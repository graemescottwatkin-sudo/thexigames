/* unpushed_test.mjs — play the server never saw survives a reopen.
 *
 * THE FAULT, found on the Play build (24 Sep 2026). Signed in, the crossword
 * mirrors each daily board to the account and, on opening one, adopts the
 * account's copy if it is newer than "our last push". That last push was held
 * in memory only, so after a force-stop it was "" and the account's copy was
 * always newer. The copy pushed at kick-off (clock running, no letters) passed
 * the letters-or-time floor and replaced everything typed since. Two answers
 * typed with no signal, app closed, reopened: grid empty, clock still running.
 * Not specific to being offline either: a kill inside the 2.5s push debounce
 * did the same with the signal full on.
 *
 * WHAT THIS DRIVES, in the real page in jsdom, signed in, with the account's
 * state endpoint stubbed and able to drop the connection:
 *   1. the reported fault: kick-off pushed, letters typed while pushes fail,
 *      the window closed and reopened on the same storage. The letters come
 *      back, and they are sent to the account.
 *   2. cross-device adoption still works: a board this device has fully
 *      pushed takes another device's newer journey. The fix must not turn
 *      every device into one that overwrites the others.
 *   3. a device that saved before this fix (no sync record) keeps the old rule.
 *   4. a board emptied by a reset takes the account's journey, however stale
 *      its sync record.
 *
 *   node football/crossword/unpushed_test.mjs        (from the repo root)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

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

/* ONE READING OF THE CLOCK, handed to both sides, as save_test and
   adopt_test do. */
const NOW = Date.now();
const SERVER_DATE = new Date(NOW).toUTCString();
const TODAY_NO = dailyNumber(NOW);
const SLOT = "fcw.v04.daily." + TODAY_NO;
const SYNC = "fcw.v04.sync.daily." + TODAY_NO;

/* The account, as the server holds it. A push is stored and stamped with a
   server clock that only moves forward, as the real endpoint's does. */
let account = { state: null, updatedAt: null };
let postDown = false;
const posts = [];
let stampN = 0;
const stamp = () => new Date(Date.UTC(2026, 8, 24, 12, 0, stampN++)).toISOString();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const send = (obj, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json", Date: SERVER_DATE });
    res.end(JSON.stringify(obj));
  };
  if (url.pathname === "/api/auth/session") {
    return send({ user: { id: "unpushed-test-user", displayName: "Tester" }, googleClientId: null });
  }
  if (url.pathname === "/api/account/state") {
    if (req.method === "POST") {
      let raw = ""; for await (const c of req) raw += c;
      const body = JSON.parse(raw || "{}");
      /* NO SIGNAL: the socket dies with no answer, as in a tunnel. */
      if (postDown) { posts.push({ lost: true, body }); req.socket.destroy(); return; }
      posts.push({ lost: false, body });
      if (body.state === null) { account = { state: null, updatedAt: null }; return send({ ok: true }); }
      account = { state: body.state, updatedAt: stamp() };
      return send({ updatedAt: account.updatedAt });
    }
    return send(account.state ? account : { state: null });
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

/* EACH jsdom WINDOW HAS ITS OWN STORAGE, so a relaunch is modelled by carrying
   the device's storage across explicitly: `device` is every key the previous
   window held. Without it the "reopen" was a first visit, and this suite's
   first run reported the fault as unfixed on a board that had simply never
   been saved (the same trap QuickFire's resume suite fell into on 23 Sep). */
const deviceOf = (w) => {
  const out = {};
  for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); out[k] = w.localStorage.getItem(k); }
  return out;
};
async function openDaily({ fresh = false, seed = null } = {}) {
  const dom = await JSDOM.fromURL(origin + "/", {
    runScripts: "dangerously", pretendToBeVisual: true, resources: "usable",
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      w.scrollTo = () => {}; w.scrollBy = () => {};
      w.fetch = (u, o) => fetch(String(u).startsWith("http") ? u : origin + u, o);
      w.confirm = () => true;
      if (fresh) w.localStorage.clear();
      for (const k in seed || {}) w.localStorage.setItem(k, seed[k]);
    },
  });
  await wait(4000);
  const d = dom.window.document;
  const btn = d.getElementById("homeDaily");
  if (btn) btn.click();
  await wait(2500);
  const stage = d.querySelector(".stage");
  if (stage && stage.classList.contains("prestart")) {
    d.getElementById("kickOffBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  }
  await wait(4000);
  return dom;
}
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
async function typeInto(w, key, ch) {
  const [x, y] = key.split(",");
  w.document.querySelector(`#grid .cell[data-x="${x}"][data-y="${y}"]`)
    .dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
  await wait(120);
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: ch, bubbles: true }));
  await wait(200);
}
async function until(test, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (test()) return true; await wait(250); }
  return test();
}
const snapWith = (letters, elapsed = 90) => JSON.stringify({
  mode: "daily", dailyNo: TODAY_NO, letters, elapsed, complete: false,
  revealedCells: [], revealAnswerCells: [], revealedEntries: [], subbedCells: [],
  subs: 0, checks: 0, checkAlls: 0, helpActions: [], pauseCount: 0, pausedMs: 0,
});

let targets = [];
let carried = {};

console.log("1. Letters typed while pushes fail, then a force-stop and a reopen");
{
  account = { state: null, updatedAt: null }; postDown = false; posts.length = 0;
  let dom = await openDaily({ fresh: true });
  let w = dom.window;
  targets = cells(w).slice(0, 3).map((el) => el.dataset.x + "," + el.dataset.y);
  const kickPushed = await until(() => posts.some((p) => !p.lost));
  const kick = account.state ? JSON.parse(account.state) : null;
  t("kick-off reaches the account: clock running, no letters",
    kickPushed && kick && kick.elapsed > 0 && Object.keys(kick.letters || {}).length === 0,
    kick ? `elapsed ${kick.elapsed}, ${Object.keys(kick.letters || {}).length} letters` : "nothing pushed");

  postDown = true;
  const WORD = ["Q", "R", "S"];
  for (let i = 0; i < 3; i++) await typeInto(w, targets[i], WORD[i]);
  await wait(3500);
  const local = slot(w);
  t("the letters are saved on the device",
    targets.every((k, i) => local && local.letters && local.letters[k] === WORD[i]),
    targets.map((k) => k + "=" + ((local && local.letters || {})[k] || "-")).join(" "));
  t("and never reached the account", Object.keys(JSON.parse(account.state).letters || {}).length === 0);
  let device = deviceOf(w);
  t("the device holds a sync record from the kick-off push", !!device[SYNC], String(device[SYNC]));
  dom.window.close();                                   // the force-stop

  postDown = false; posts.length = 0;
  dom = await openDaily({ fresh: true, seed: device });  // the relaunch, same device
  w = dom.window;
  const shown = painted(w);
  t("THE REPORTED FAULT: the letters are back on the reopened board",
    targets.every((k, i) => shown[k] === WORD[i]),
    targets.map((k) => k + "=" + (shown[k] || "-")).join(" "));
  await until(() => posts.some((p) => !p.lost && p.body.state && JSON.parse(p.body.state).letters[targets[0]]));
  const sent = account.state ? JSON.parse(account.state) : {};
  t("and they are sent to the account, which now holds them",
    targets.every((k, i) => (sent.letters || {})[k] === WORD[i]),
    Object.keys(sent.letters || {}).length + " letters on the account");
  await wait(1500);
  carried = deviceOf(w);
  dom.window.close();
}

console.log("\n2. Another device's newer journey, on a board this device has fully pushed");
{
  /* The board as case 1 left it: pushed, acknowledged, nothing pending. The
     account then moves on from ANOTHER device, stamped later by the server. */
  const other = {}; ["J", "K", "L"].forEach((c, i) => { other[targets[i]] = c; });
  account = { state: snapWith(other, 300), updatedAt: stamp() };
  posts.length = 0;
  const dom = await openDaily({ fresh: true, seed: carried });
  const shown = painted(dom.window);
  t("the newer journey is adopted: cross-device still works",
    targets.every((k) => shown[k] === other[k]),
    targets.map((k) => k + "=" + (shown[k] || "-")).join(" "));
  dom.window.close();
}

console.log("\n2b. Unpushed play here, and a newer journey from another device");
{
  /* The family's merge rule: unpushed local work survives. This device typed
     with no signal after its last acknowledged push; meanwhile another device
     pushed. Adopting the other device's copy would throw this one's answers
     away unseen, so this device's play is kept and sent. */
  const device = { ...carried };
  const mine = JSON.parse(device[SLOT]);
  mine.letters = {}; ["T", "U", "V"].forEach((c, i) => { mine.letters[targets[i]] = c; });
  device[SLOT] = JSON.stringify(mine);
  const theirs = {}; ["G", "H", "I"].forEach((c, i) => { theirs[targets[i]] = c; });
  account = { state: snapWith(theirs, 400), updatedAt: stamp() };
  posts.length = 0;
  const dom = await openDaily({ fresh: true, seed: device });
  const shown = painted(dom.window);
  t("this device's unpushed play is kept over the newer remote",
    targets.every((k) => shown[k] === mine.letters[k]),
    targets.map((k) => k + "=" + (shown[k] || "-")).join(" "));
  await until(() => account.state && JSON.parse(account.state).letters[targets[0]] === "T");
  t("and it is what the account holds afterwards",
    JSON.parse(account.state).letters[targets[0]] === "T", JSON.stringify(JSON.parse(account.state).letters));
  dom.window.close();
}

console.log("\n3. A device that saved before this fix");
{
  const mine = {}; ["A", "B", "C"].forEach((c, i) => { mine[targets[i]] = c; });
  const theirs = {}; ["X", "Y", "Z"].forEach((c, i) => { theirs[targets[i]] = c; });
  account = { state: snapWith(theirs, 200), updatedAt: stamp() };
  const dom = await openDaily({ fresh: true, seed: { [SLOT]: snapWith(mine, 100) } });
  const shown = painted(dom.window);
  t("no sync record: the old rule, and the account's newer journey is taken",
    targets.every((k) => shown[k] === theirs[k]),
    targets.map((k) => k + "=" + (shown[k] || "-")).join(" "));
  dom.window.close();
}

console.log("\n4. A board emptied by a reset, with a stale sync record");
{
  const theirs = {}; ["D", "E", "F"].forEach((c, i) => { theirs[targets[i]] = c; });
  account = { state: snapWith(theirs, 200), updatedAt: stamp() };
  const dom = await openDaily({ fresh: true, seed: {
    [SLOT]: snapWith({}, 45),
    [SYNC]: JSON.stringify({ syncedAt: "2026-01-01T00:00:00.000Z", sig: "a board that is gone" }),
  } });
  const shown = painted(dom.window);
  t("an empty board has nothing to lose: the account's journey is taken",
    targets.every((k) => shown[k] === theirs[k]),
    targets.map((k) => k + "=" + (shown[k] || "-")).join(" "));
  dom.window.close();
}

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
