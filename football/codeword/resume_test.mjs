/* resume_test.mjs — a finished Codeword board stays finished.
 *
 * THE FAULT THIS EXISTS FOR, reported by the owner: "Codeword daily doesn't
 * retain completion". It did not. The game keeps its results in xicw.results
 * and no board state — deliberately — and nothing on boot ever READ them. A
 * board finished an hour earlier reopened as an empty grid with a clock at
 * zero and no sign it had ever been played. The only hint was a toast saying
 * the round was a replay, and that arrives after the FIRST KEYSTROKE, because
 * the round is opened by starting to type: the player is told they have
 * already done this only once they have begun doing it again.
 *
 * WHY NO TEST CAUGHT IT. Every suite this game had is server-side —
 * board_test, play_test, round_test — and the fault is entirely in the page,
 * on the second visit. It needs a device that has finished a board AND comes
 * back, which is the one journey nothing drove. A device that has finished
 * nothing behaves identically with the bug and without it.
 *
 *   node football/codeword/resume_test.mjs        (from the repo root)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { localResources } from "../../tools/local_resources.js";
import { onRequestGet as daily } from "../../functions/api/codeword/daily.js";
import { todayKey } from "../../functions/_lib/cw-board.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css",
  ".js": "text/javascript", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

/* THE BOARD COMES FROM A STUBBED DATABASE, through the real endpoint. Codeword
   has no offline sample — /api/codeword/daily answers 404 with no DB bound — so
   a page opened without one boots into "No game today" and proves nothing about
   a finished board. The stub is board_test's shape: it re-applies the day bound
   rather than rubber-stamping, so this test cannot pass on a code path that
   stopped asking for today. */
const CODE = {}; "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((c, i) => { CODE[c] = i + 1; });
const DAY = todayKey();
const BOARD_NO = 1;
const boardOf = (no, day) => ({
  no, day, size: 3,
  rows: ["CAT", "ARE", "TEN"],
  words: [["CAT", 0, 0, "a"], ["ARE", 1, 0, "a"], ["TEN", 2, 0, "a"], ["CAT", 0, 0, "d"]],
  code: CODE, given: ["C", "A", "T"],
  hints: [0, 1, 2, 3].map(() => ({ sense: "s", cat: "c", enum: "3", text: "s c" })),
  breaks: [[], [], [], []],
  meta: { seed: 1 },
});
const env = { DB: { prepare: (sql) => ({
  bind: (...args) => ({
    first: async () => {
      if (/WHERE s\.day = \?/.test(sql)) {
        return String(args[0]) === DAY
          ? { no: BOARD_NO, day: DAY, payload: JSON.stringify(boardOf(BOARD_NO, DAY)) } : null;
      }
      if (/WHERE b\.no = \? AND s\.day <= \?/.test(sql)) {
        return Number(args[0]) === BOARD_NO && String(args[1]) >= DAY
          ? { no: BOARD_NO, day: DAY, payload: JSON.stringify(boardOf(BOARD_NO, DAY)) } : null;
      }
      return null;
    },
    all: async () => ({ results: [] }),
    run: async () => ({ success: true }),
  }),
}) } };

const MIME2 = MIME;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/codeword/daily") {
    const r = await daily({ request: new Request("https://x" + req.url), env });
    const body = await r.text();
    res.writeHead(r.status, { "Content-Type": "application/json" });
    return res.end(body);
  }
  /* Nothing else is needed: the page opens a round only when somebody types,
     and this test never does. A POST arriving here would mean the page had
     started a match on its own, so it is refused loudly rather than stubbed. */
  if (req.method === "POST") { res.writeHead(500); return res.end("the page must not open a round on load"); }
  const file = url.pathname === "/football/codeword/" ? "/football/codeword/index.html" : url.pathname;
  const full = path.join(ROOT, file);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    res.writeHead(200, { "Content-Type": MIME2[path.extname(full)] || "text/plain" });
    res.end(fs.readFileSync(full));
  } else { res.writeHead(404); res.end("nope"); }
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

/* The day comes from the game's own todayKey, handed to BOTH the stub and the
   expectations — one reading of the clock, not two. */
const todayBoard = { no: BOARD_NO, day: DAY };

async function open(seed) {
  const dom = await JSDOM.fromURL(`http://localhost:${PORT}/football/codeword/`, {
    runScripts: "dangerously", resources: localResources(), pretendToBeVisual: true,
    beforeParse(win) {
      win.fetch = (u, o) => globalThis.fetch(new URL(u, win.location.href), o);
      if (seed) { try { win.localStorage.setItem("xicw.results", JSON.stringify(seed)); } catch (e) {} }
    },
  });
  await new Promise((r) => dom.window.addEventListener("load", r));
  await new Promise((r) => setTimeout(r, 600));    // let the board fetch land
  return dom;
}

console.log("A device that has finished today's board");
{
  const banked = { no: todayBoard.no, day: DAY, score: 97, solved: 11, minute: 22, result: "W" };
  const dom = await open([banked]);
  const d = dom.window.document;
  const ft = d.getElementById("ft");
  t("the Full Time card is up on arrival, not an empty grid",
    !!ft && ft.classList.contains("on"),
    ft ? ft.className : "no #ft at all");
  /* THE BANKED FIGURES, NOT RECOMPUTED ONES. The letters are not stored, so a
     card that worked its score out from the grid in front of it would read
     zero — the number has to come from the record. */
  t("and it shows the score that was banked",
    (d.getElementById("ftScore") || {}).textContent === String(banked.score),
    (d.getElementById("ftScore") || {}).textContent);
  t("and the result that was banked",
    (d.getElementById("ftRes") || {}).textContent === "Win",
    (d.getElementById("ftRes") || {}).textContent);
  dom.window.close();
}

console.log("\nA device that has not");
{
  const dom = await open(null);
  const d = dom.window.document;
  const ft = d.getElementById("ft");
  /* THE OTHER HALF, and without it the check above passes on a card that is
     always up. A first visit must get the board, not somebody else's result. */
  t("arrives at the board, with no Full Time card",
    !!ft && !ft.classList.contains("on"), ft ? ft.className : "no #ft at all");
  dom.window.close();
}

console.log("\nA result from another day");
{
  /* A board finished YESTERDAY must not mark today as done. The list holds
     every board this device has ever finished, so matching on anything looser
     than the day would show a stale card for ever. */
  const other = new Date(Date.parse(DAY + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  const dom = await open([{ no: todayBoard.no - 1, day: other, score: 50, solved: 7, minute: 40, result: "D" }]);
  const d = dom.window.document;
  const ft = d.getElementById("ft");
  t("does not mark today as finished",
    !!ft && !ft.classList.contains("on"), ft ? ft.className : "no #ft at all");
  dom.window.close();
}

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
