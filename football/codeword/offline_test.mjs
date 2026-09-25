/* offline_test.mjs — a dropped connection mid-board does not cost the board.
 *
 * THE FAULT. Marking and the whistle are the server's, and both used to fail
 * for good on one lost request. A word finished with no signal called
 * serverOracle.confirm, whose post() had no failure path. The callback never
 * came, refreshSolved's `asking` stayed true, and no word was confirmed again
 * for the rest of the round, however long the player kept typing. A whistle
 * blown with no signal left the board marked over with no Full Time, and
 * nothing asked again.
 *
 * WHAT THIS DRIVES, in the real page in jsdom, against a server that can drop
 * the connection (the socket is destroyed, which is what a train does):
 *   - a word finished offline is confirmed when the connection returns, by the
 *     browser's "online" event, with no second word typed
 *   - the same by the timed retry alone, for a phone whose wifi has no route
 *     out and so never fires "online"
 *   - once confirmed, the retrying stops
 *   - a word the server marked WRONG is not re-asked on a timer
 *   - a whistle blown offline brings Full Time, with the server's verdict,
 *     when the connection returns
 *
 *   node football/codeword/offline_test.mjs        (from the repo root)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { onRequestGet as daily } from "../../functions/api/codeword/daily.js";
import { todayKey } from "../../functions/_lib/cw-board.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* WAIT FOR THE THING, NOT FOR A NUMBER OF MILLISECONDS, as the grid's journey
   learned on 24 Sep 2026: a fixed sleep after an action is a race, and a loaded
   machine loses it. The page holds its round and its asks in closures, so what
   is waited on is `heard`: every answer the page has READ from the referee,
   and every ask that came back to it lost, recorded where its fetch resolves.
   The page's own handler runs in the same turn, so by the next look it has
   acted on what it heard. The deadline stops a wait that cannot end: a
   condition that never comes true fails the assertion after it. The sleeps
   that remain give an ABSENCE, or the retry timer, its window. */
const until = async (ok, ms = 10000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await wait(20);
  return ok();
};
const heard = [];
const told = (what, ok = true) => heard.filter((e) => e.what === what && e.ok === ok).length;
/* BUT NOT TOO LONG AFTER "online". The page retries by itself every 5s
   (RETRY_MS), which is the second case's whole point, so a reconnect given
   longer than that could be the timer's doing and would pass with the
   "online" handler gone. Well under it, so what lands was the event's. */
const ONLINE_MS = 3000;

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css",
  ".js": "text/javascript", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

/* The board through the real daily endpoint and a stub that re-applies the
   day bound, as resume_test does. Only C is given, so every word needs
   typing. */
const CODE = {}; "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((c, i) => { CODE[c] = i + 1; });
const DAY = todayKey();
const ROWS = ["CAT", "ARE", "TEN"];
const WORDS = [["CAT", 0, 0, "a"], ["ARE", 1, 0, "a"], ["TEN", 2, 0, "a"], ["CAT", 0, 0, "d"]];
const board = {
  no: 1, day: DAY, size: 3, rows: ROWS, words: WORDS, code: CODE, given: ["C"],
  hints: WORDS.map(() => ({ sense: "s", cat: "c", enum: "3", text: "s c" })),
  breaks: WORDS.map(() => []), meta: { seed: 1 },
};
const env = { DB: { prepare: (sql) => ({
  bind: (...args) => ({
    first: async () => {
      if (/WHERE s\.day = \?/.test(sql)) {
        return String(args[0]) === DAY ? { no: 1, day: DAY, payload: JSON.stringify(board) } : null;
      }
      if (/WHERE b\.no = \? AND s\.day <= \?/.test(sql)) {
        return Number(args[0]) === 1 && String(args[1]) >= DAY ? { no: 1, day: DAY, payload: JSON.stringify(board) } : null;
      }
      return null;
    },
    all: async () => ({ results: [] }),
    run: async () => ({ success: true }),
  }),
}) } };

/* The referee, as the server answers it: a slot is solved when every one of
   its squares holds the right letter. The page never learns the grid. */
const cellsOf = ([w, r, c, dir]) => w.split("").map((_, k) => (dir === "a" ? [r, c + k] : [r + k, c]));
const solvedBy = (guess) => WORDS.map((w, i) => [w, i])
  .filter(([w]) => cellsOf(w).every(([r, c]) => guess[CODE[ROWS[r][c]]] === ROWS[r][c]))
  .map(([, i]) => i);

let down = false;
const log = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/codeword/daily") {
    const r = await daily({ request: new Request("https://x" + req.url), env });
    res.writeHead(r.status, { "Content-Type": "application/json" });
    return res.end(await r.text());
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/codeword/")) {
    let raw = ""; for await (const ch of req) raw += ch;
    const body = raw ? JSON.parse(raw) : {};
    const what = url.pathname.split("/").pop();
    log.push({ what, reached: !down, at: Date.now() });
    /* NO SIGNAL: the connection dies with no answer, so fetch rejects, which
       is what a phone in a tunnel sees. A 500 would be a server that answered. */
    if (down) { req.socket.destroy(); return; }
    let out = {};
    if (what === "play") out = { playId: "p-offline", startedMs: Date.now(), rate: 3, scored: true, subsLeft: 3 };
    else if (what === "mark") out = { solved: solvedBy(body.guess || {}) };
    else if (what === "finish") out = { score: 97, solved: 4, minute: 12, result: "W", scored: true };
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(out));
  }
  const file = url.pathname === "/football/codeword/" ? "/football/codeword/index.html" : url.pathname;
  const full = path.join(ROOT, file);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "text/plain" });
    res.end(fs.readFileSync(full));
  } else { res.writeHead(404); res.end("nope"); }
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

async function open() {
  const dom = await JSDOM.fromURL(`http://localhost:${PORT}/football/codeword/`, {
    runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
    beforeParse(win) {
      win.fetch = (u, o) => {
        const url = new URL(u, win.location.href);
        const what = url.pathname.startsWith("/api/codeword/") ? url.pathname.split("/").pop() : null;
        return globalThis.fetch(url, o).then((r) => {
          if (what) {
            const json = r.json.bind(r);
            r.json = () => json().then((v) => { heard.push({ what, ok: true }); return v; });
          }
          return r;
        }, (e) => { if (what) heard.push({ what, ok: false }); throw e; });
      };
    },
  });
  await new Promise((r) => dom.window.addEventListener("load", r));
  await until(() => !!dom.window.document.querySelector("#key [data-n]"));   // boot has drawn the board
  return dom;
}

/* A letter onto a number: pick the number that `on` belongs to in the key,
   then type `letter` (the right one unless a wrong one is asked for). Typing
   is synchronous; whatever it sets off is waited on by the caller, which
   knows what that is. */
async function put(dom, on, letter = on) {
  const d = dom.window.document;
  const k = d.querySelector(`#key [data-n="${CODE[on]}"]`);
  if (!k || k.classList.contains("absent")) throw new Error("no number on this board for " + on);
  k.click();
  d.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: letter, bubbles: true }));
}
const guessed = (dom, on) => {
  const n = CODE[on];
  const cell = dom.window.document.querySelector(`#grid .cell[data-n="${n}"] .l`);
  return cell ? cell.textContent : null;
};
const solved = (dom) => Number(dom.window.document.getElementById("solved").textContent);
const marks = () => log.filter((e) => e.what === "mark");

console.log("A word finished with no signal, then the signal returns");
{
  log.length = 0; heard.length = 0; down = false;
  const dom = await open();
  await put(dom, "A");                              // opens the round: /play reached the server
  await until(() => told("play") > 0);
  t("the round opened with a signal", log.some((e) => e.what === "play" && e.reached));
  down = true;
  await put(dom, "T");                              // CAT across and down are both complete now
  await until(() => told("mark", false) > 0);
  t("finishing the word offline asked the referee, and the ask was lost",
    marks().length >= 1 && marks().every((e) => !e.reached), marks().length + " asks, none reached");
  t("nothing is marked while there is no signal", solved(dom) === 0, "solved " + solved(dom));
  const toast = dom.window.document.getElementById("toast").textContent;
  t("the player is told it will be marked when the connection returns", /when it returns/.test(toast), toast);

  down = false;
  const before = marks().length;
  const answered = told("mark");
  dom.window.dispatchEvent(new dom.window.Event("online"));
  await until(() => told("mark") > answered, ONLINE_MS);
  t("coming back online confirms the word, with no second word typed",
    solved(dom) === 2 && marks().length === before + 1 && marks().at(-1).reached,
    `solved ${solved(dom)}, ${marks().length - before} new ask(s)`);
  const settled = marks().length;
  await wait(6000);                                 // an absence: this one stays fixed
  t("and once confirmed, the retrying stops", marks().length === settled, `${marks().length - settled} more asks`);
  dom.window.close();
}

console.log("\nThe same, on a phone whose wifi never fires \"online\"");
{
  log.length = 0; heard.length = 0; down = false;
  const dom = await open();
  await put(dom, "A");
  await until(() => told("play") > 0);
  down = true;
  await put(dom, "T");
  await until(() => told("mark", false) > 0);       // lost, and the retry timer armed on it
  down = false;
  await wait(6000);                                 // the timer alone, no event: its own 5s, left to fire
  t("the timed retry confirms the word by itself", solved(dom) === 2 && marks().some((e) => e.reached),
    `solved ${solved(dom)}`);
  /* THE GUARD IS FREE AGAIN: the next word is asked about as normal. Before
     the fix `asking` stayed latched and this word was never asked at all. */
  const answered = told("mark");
  await put(dom, "R");
  await put(dom, "E");                              // ARE complete and right
  await until(() => told("mark") > answered);
  t("and the next word is marked as normal afterwards", solved(dom) === 3, `solved ${solved(dom)}`);
  dom.window.close();
}

console.log("\nA word the referee marked wrong");
{
  log.length = 0; heard.length = 0; down = false;
  const dom = await open();
  await put(dom, "A");
  await put(dom, "T");
  await until(() => told("mark") > 0);              // CAT confirmed
  await put(dom, "R");
  const before = marks().length;
  const answered = told("mark");
  await put(dom, "E", "N");                         // N on E's number: ARN, complete and wrong
  await until(() => told("mark") > answered);       // and the referee's no has been read
  const asked = marks().length;
  /* THE SCENARIO MUST EXIST before its absence of retries means anything: the
     wrong word is complete on the grid, and it was put to the referee. */
  t("a complete wrong word is on the grid", guessed(dom, "R") === "R" && guessed(dom, "E") === "N",
    `R=${guessed(dom, "R")} E=${guessed(dom, "E")}`);
  t("is asked about once, and not marked", asked === before + 1 && marks().at(-1).reached && solved(dom) === 2,
    `${asked - before} ask(s), solved ${solved(dom)}`);
  await wait(6000);                                 // an absence: this one stays fixed
  t("and is NOT re-asked on a timer: a wrong answer is not owed anything",
    marks().length === asked, `${marks().length - asked} more asks`);
  dom.window.close();
}

console.log("\nA whistle blown with no signal");
{
  log.length = 0; heard.length = 0; down = false;
  const dom = await open();
  const d = dom.window.document;
  await put(dom, "A");
  await until(() => told("play") > 0);              // a whistle with no round has nothing to ask
  down = true;
  d.getElementById("whistle").click();
  await until(() => told("finish", false) > 0);
  const ft = d.getElementById("ft");
  t("the whistle's call was lost", log.some((e) => e.what === "finish" && !e.reached));
  t("and no Full Time is invented without the referee", !ft.classList.contains("on"));
  down = false;
  dom.window.dispatchEvent(new dom.window.Event("online"));
  await until(() => told("finish") > 0, ONLINE_MS);
  const fin = log.filter((e) => e.what === "finish" && e.reached);
  t("the connection returning brings Full Time", ft.classList.contains("on"), ft.className);
  t("with the server's verdict, not one worked out on the page",
    d.getElementById("ftScore").textContent === "97" && fin.length === 1,
    `score ${d.getElementById("ftScore").textContent}, ${fin.length} finish reached`);
  await wait(6000);                                 // an absence: this one stays fixed
  t("and the whistle is asked for once, not again after it answered",
    log.filter((e) => e.what === "finish" && e.reached).length === 1);
  dom.window.close();
}

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
