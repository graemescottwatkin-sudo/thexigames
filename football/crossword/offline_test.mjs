/* offline_test.mjs — a grid finished with no signal reaches Full Time when
 * the signal returns, once, and only if it is right.
 *
 * WHY THIS EXISTS. The app's audit (MobileApp, 23 Sep 2026) read isComplete(),
 * which needs the server's yes for every entry, and concluded that a grid
 * filled offline could never reach Full Time. The page's comments said the
 * opposite: on reconnect setOffline(false) re-verifies everything and
 * checkComplete() follows. Both were readings, and driving a whole board
 * found a third answer. The reconnect catch-up worked. But a board RESTORED
 * from its save was never asked about at all: `verified` was reset with the
 * board and nothing called /api/verify until the next keystroke. So a grid
 * filled on a train and reopened on the platform showed every square, no
 * solved word and no Full Time, however good the signal. The first scenario
 * below failed with 0 asks until finishBuild's restore branch called
 * verifyNow().
 *
 * WHAT IT DRIVES, in the real page in jsdom, against the real routes (no
 * database: the development puzzles), with /api/verify and /api/finish
 * unreachable (the socket is destroyed, as in a tunnel):
 *   - a saved board, every square filled and right, resumed with no signal:
 *     no Full Time, the offline strip saying why, no /finish sent
 *   - the signal returning: the whole grid verified, Full Time, and exactly
 *     one /api/finish carrying the letters, answered complete
 *   - no second /finish afterwards
 *   - the same board with ONE wrong square: no Full Time and no /finish, on
 *     reconnect or after
 *
 *   node football/crossword/offline_test.mjs        (from the repo root)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { localResources } from "../../tools/local_resources.js";

import { onRequestGet as apiDaily } from "../../functions/api/daily.js";
import { onRequestGet as apiCategories } from "../../functions/api/categories.js";
import { onRequestPost as apiCheck } from "../../functions/api/check-answer.js";
import { onRequestPost as apiVerify } from "../../functions/api/verify.js";
import { onRequestPost as apiFinish } from "../../functions/api/finish.js";
import { onRequestGet as apiStatus } from "../../functions/api/status.js";
import { dailyNumber } from "../../functions/_lib/daily.js";
import { getDailyPuzzle } from "../../functions/_lib/db.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");

/* ONE READING OF THE CLOCK, handed to both sides as save_test does: the
   board seeded is the board the page opens, whatever the machine's zone. */
const NOW = Date.now();
const SERVER_DATE = new Date(NOW).toUTCString();
const TODAY_NO = dailyNumber(NOW);
const SLOT = "fcw.v04.daily." + TODAY_NO;

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* WAIT FOR THE THING, NOT FOR A NUMBER OF MILLISECONDS, as the grid's journey
   learned on 24 Sep 2026: a fixed sleep after an action is a race, and a loaded
   machine loses it. Each wait below is on something the page or the server
   says only once the work has landed — the document complete, the whole-grid
   nudge verifyNow sends only after checkComplete has had its turn, a /finish
   answered. The deadline is the guard against a wait that cannot end: a
   condition that never comes true returns false and the assertion after it
   fails as it always would have. The sleeps that remain give an ABSENCE its
   window, which no condition can prove. */
const until = async (ok, ms = 10000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await wait(20);
  return ok();
};
/* BUT NOT TOO LONG AFTER "online". The page also retries by itself every 5s,
   so a reconnect given longer than that could be the timer's doing, and a
   page whose "online" handler did nothing would pass. The old sleep was 3s;
   the deadline stays there, which proves what that sleep proved. Measured:
   with the handler emptied, a 10s deadline stayed green. */
const ONLINE_MS = 3000;

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css",
  ".js": "text/javascript", ".json": "application/json", ".txt": "text/plain" };
const ROUTES = {
  "/api/daily": apiDaily, "/api/categories": apiCategories, "/api/check-answer": apiCheck,
  "/api/verify": apiVerify, "/api/finish": apiFinish, "/api/status": apiStatus,
};

/* Which routes have no signal. The board itself loads; what is lost is
   everything after, which is the train pulling out once play has begun. */
const down = new Set();
const log = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const fn = ROUTES[url.pathname];
  if (fn || url.pathname.startsWith("/api/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    /* The entry is kept, not found again as the log's last: Full Time sends
       /finish alongside the next-game probes, and an answer written to
       whatever arrived last could land on one of those. */
    const entry = { path: url.pathname, reached: !down.has(url.pathname), body: raw };
    log.push(entry);
    if (down.has(url.pathname)) { req.socket.destroy(); return; }
    if (!fn) { res.writeHead(200, { "Content-Type": "application/json", Date: SERVER_DATE }); return res.end("{}"); }
    const request = new Request("http://127.0.0.1" + req.url, {
      method: req.method, body: raw || undefined, headers: { "Content-Type": "application/json" },
    });
    const out = await fn({ request, env: {} });
    const body = await out.text();
    entry.answer = body;
    res.writeHead(out.status, { "Content-Type": "application/json", Date: SERVER_DATE });
    return res.end(body);
  }
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
const origin = `http://127.0.0.1:${server.address().port}`;

/* Today's board, from the same function the route serves it with. */
const puzzle = (await getDailyPuzzle({}, TODAY_NO)).puzzle;
const SOLUTION = {};
for (const k of Object.keys(puzzle.cells)) SOLUTION[k] = puzzle.cells[k].ch;
const saved = (letters) => JSON.stringify({
  mode: "daily", dailyNo: TODAY_NO, letters, elapsed: 240, complete: false,
  revealedCells: [], revealAnswerCells: [], revealedEntries: [],
  subbedCells: [], subs: 0, checks: 0, checkAlls: 0, helpActions: [],
  pauseCount: 0, pausedMs: 0, club: "Manchester City", clubMode: "chosen",
});

async function open(letters) {
  const dom = await JSDOM.fromURL(origin + "/", {
    runScripts: "dangerously", pretendToBeVisual: true, resources: localResources(),
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      w.scrollTo = () => {}; w.scrollBy = () => {};
      w.fetch = (u, o) => fetch(String(u).startsWith("http") ? u : origin + u, o);
      w.confirm = () => true;
      w.localStorage.setItem(SLOT, saved(letters));
      w.localStorage.setItem("fcw.clubPref", "Manchester City");
    },
  });
  const d = dom.window.document;
  await until(() => d.readyState === "complete", 30000);
  /* Back into today's board from the landing screen, as a player would. */
  (d.getElementById("homeDaily") || d.getElementById("dailyBtn")).dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  /* Every caller opens with the referee unreachable, so the restored board is
     in when the page has taken a lost ask as no signal — and a FULL grid is
     settled only once its whole-grid nudge has gone out, because verifyNow
     sends that after checkComplete has run. Reading "no Full Time" any sooner
     would be reading it before the page could have got it wrong. */
  const full = Object.keys(letters).length === Object.keys(SOLUTION).length;
  await until(() => d.body.classList.contains("offline") &&
    (!full || verifies().some((e) => /"grid":/.test(e.body))), 30000);
  const stage = d.querySelector(".stage");
  if (stage && stage.classList.contains("prestart")) {
    d.getElementById("kickOffBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    await until(() => !stage.classList.contains("prestart"));
  }
  return dom;
}
const shown = (dom) => dom.window.document.getElementById("doneOverlay").classList.contains("show");
const finishes = () => log.filter((e) => e.path === "/api/finish");
const verifies = () => log.filter((e) => e.path === "/api/verify");

console.log("A full, right grid, resumed with no signal");
{
  log.length = 0; down.clear();
  down.add("/api/verify"); down.add("/api/finish");
  const dom = await open(SOLUTION);
  const d = dom.window.document;
  /* Every square, found and holding its letter. A square that is not found
     is a failure, not a pass: a selector that matches nothing agrees with
     everything. */
  const filled = Object.keys(SOLUTION).every((k) => {
    const [x, y] = k.split(",");
    const el = d.querySelector(`#grid .cell[data-x="${x}"][data-y="${y}"] .ltr`);
    return !!el && el.textContent === SOLUTION[k];
  });
  t("the board is today's and every square came back from the save",
    d.querySelectorAll("#grid .cell").length > 0 && filled, `${Object.keys(SOLUTION).length} squares`);
  t("it asked the referee, and every ask was lost",
    verifies().length > 0 && verifies().every((e) => !e.reached), `${verifies().length} asks`);
  t("no Full Time is called without the referee", !shown(dom));
  t("no /finish is sent while nothing is verified", finishes().length === 0, `${finishes().length} sent`);
  t("the strip says Full Time will be called when the connection returns",
    d.body.classList.contains("offline") && /Full Time will be called/.test(d.getElementById("netStrip").textContent),
    d.getElementById("netStrip").textContent);

  down.clear();
  dom.window.dispatchEvent(new dom.window.Event("online"));
  await until(() => finishes().some((e) => e.answer !== undefined), ONLINE_MS);
  const f = finishes();
  t("the signal returning brings Full Time", shown(dom));
  t("with exactly one /api/finish, carrying the letters", f.length === 1 && f[0].reached &&
    Object.keys(JSON.parse(f[0].body).letters || {}).length === Object.keys(SOLUTION).length, `${f.length} sent`);
  t("which the server answered complete", f[0] && /"complete":true/.test(f[0].answer || ""), f[0] && f[0].answer);
  await wait(6000);                                 // an absence: this one stays fixed
  t("and no second /finish afterwards", finishes().length === 1, `${finishes().length} sent`);
  dom.window.close();
}

console.log("\nThe same grid with one square wrong");
{
  log.length = 0; down.clear();
  down.add("/api/verify"); down.add("/api/finish");
  const wrong = { ...SOLUTION };
  const k0 = Object.keys(wrong)[0];
  wrong[k0] = wrong[k0] === "Z" ? "Q" : "Z";
  const dom = await open(wrong);
  t("offline: no Full Time", !shown(dom));
  down.clear();
  const asked = verifies().length;
  dom.window.dispatchEvent(new dom.window.Event("online"));
  /* The reconnect's whole-grid nudge, answered: it goes out only after
     checkComplete has run on the referee's verdicts, so "no Full Time" below
     is read after the page could have called it, not before. */
  await until(() => verifies().slice(asked).some((e) => e.reached && /"grid":/.test(e.body) && e.answer !== undefined), ONLINE_MS);
  t("reconnected: the grid is verified", verifies().some((e) => e.reached));
  t("and a wrong grid does not reach Full Time", !shown(dom));
  await wait(6000);                                 // an absence: this one stays fixed
  t("nor ever sends /finish", finishes().length === 0, `${finishes().length} sent`);
  dom.window.close();
}

console.log("\nThe last letter typed with no signal");
{
  log.length = 0; down.clear();
  down.add("/api/verify"); down.add("/api/finish");
  const gap = Object.keys(SOLUTION)[Object.keys(SOLUTION).length - 1];
  const most = { ...SOLUTION }; delete most[gap];
  const dom = await open(most);
  const d = dom.window.document;
  const before = d.getElementById("netStrip").textContent;
  t("offline with a square to go, the strip says only that answers cannot be checked",
    d.body.classList.contains("offline") && !/Full Time/.test(before), before);
  const [x, y] = gap.split(",");
  d.querySelector(`#grid .cell[data-x="${x}"][data-y="${y}"]`).dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
  await wait(200);                                  // a pause between two synchronous handlers, not a race
  const typed = verifies().length;
  d.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: SOLUTION[gap], bubbles: true }));
  /* The asks the last letter set off have all been lost and taken as such:
     the whole-grid nudge is sent only once every one of them has settled. */
  await until(() => verifies().slice(typed).some((e) => /"grid":/.test(e.body)));
  const after = d.getElementById("netStrip").textContent;
  t("typing the last letter turns it into Full Time will be called", /Full Time will be called/.test(after), after);
  down.clear();
  dom.window.dispatchEvent(new dom.window.Event("online"));
  await until(() => finishes().some((e) => e.reached && e.answer !== undefined), ONLINE_MS);
  await wait(3000);                                 // "once" is an absence, and keeps its window
  t("and the signal returning calls it, once", shown(dom) && finishes().filter((e) => e.reached).length === 1,
    `${finishes().filter((e) => e.reached).length} reached`);
  dom.window.close();
}

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
