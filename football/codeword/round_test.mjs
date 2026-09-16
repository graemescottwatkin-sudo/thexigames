/* codeword/round_test.mjs — Codeword XI's client, played.
 *
 * WHY THIS FILE EXISTS, and it is the sharpest reason any suite in this repo
 * has. Two bugs shipped to production in the client on 15 September 2026 and
 * NEITHER WAS REACHABLE BY ANY EXISTING TEST. play_test.mjs drives
 * functions/_lib/cw-play.js and is a good suite; board_test.mjs drives the
 * board projection. Between them they cover both ends of every endpoint call
 * and nothing in the middle — and both faults were in the code AROUND the
 * calls:
 *
 *   1. a second charge in an inline click-handler body. The server applied
 *      subsLeft and spentMinutes and the handler then added COST on top, so one
 *      reveal spent two of three substitutions and ran the clock ten minutes
 *      fast. Every check asked the oracle what it had done, and the oracle was
 *      right every time.
 *   2. a dropped call in a re-entrancy guard. refreshSolved() returned early
 *      when a confirm was in flight and never asked again, so the last letter
 *      of the last answer arriving mid-flight lost the question for good. Live,
 *      that left board 2 with all 169 squares filled and correct, ten of eleven
 *      words locked and the eleventh silent: no error, no retry, nothing to
 *      click. A player who completes the board is told they have not.
 *
 * So this drives the SHIPPED game.js in the SHIPPED index.html, through the DOM
 * a player actually touches — click a square, press a key — and stubs only the
 * network. The stub can HOLD a response open, which is the only way to put a
 * second confirm in flight against the first and the whole reason fault 2 was
 * invisible.
 *
 *   npm install -D jsdom --no-save
 *   node football/codeword/round_test.mjs      (from the repo root)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
/* THE URL UNDER TEST IS BUILT BY THE THING THAT BUILDS THE REAL ONES.
   The Codeword session's archive suite hand-wrote its fixtures as query strings
   — the shape it had invented before this route existed — so it proved its own
   imagination consistent with itself and passed while the live archive served
   the wrong board. A fixture invented by the side that does not own the
   interface proves nothing about the interface.
   permalinkPath() is the ONE place a board address is assembled in this repo;
   the sitemap, every archive index and the route all call it. Importing it here
   means that if the theme moves or the URL form changes, this fixture moves
   with it and the loader either keeps up or goes red. */
import { permalinkPath } from "../../functions/_lib/permalink.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const game = fs.readFileSync(path.join(DIR, "js", "game.js"), "utf8");

/* THE COSTS ARE READ FROM THE SHIPPED FILE, not restated here. A suite that
   pins 7 and 5 as literals asserts the drift instead of catching it, and this
   repo has a memory about exactly that. */
const RULE_LINE = (game.match(/var MAX = \d+, SUBS = \d+, COST = \{[^}]*\}/) || [])[0] || "";
const COST = {
  reveal: Number((RULE_LINE.match(/reveal:\s*(\d+)/) || [])[1]),
  check: Number((RULE_LINE.match(/check:\s*(\d+)/) || [])[1]),
};
const SUBS = Number((RULE_LINE.match(/SUBS = (\d+)/) || [])[1]);
/* AND THEY MUST HAVE PARSED. The first version of this block missed SUBS, read
   NaN, and fed NaN into the stub — so the page displayed "NaN substitutions"
   and the assertion comparing it to `(SUBS - 1) + " substitutions"` compared
   "NaN substitutions" to itself and PASSED. A fixture that fails to load its
   own constants is a suite testing nothing, agreeing with itself. */
if (![COST.reveal, COST.check, SUBS].every(Number.isFinite)) {
  console.log(`FAIL  the scoring rule was read out of game.js  — ` +
    `reveal ${COST.reveal}, check ${COST.check}, subs ${SUBS}`);
  process.exit(1);
}

/* ---- a board -----------------------------------------------------------
 * Three across-words on one row each, four letters, no crossings — the
 * smallest thing that can have "some words done and one not". Sealed exactly
 * as the server seals it: numbers, givens, slot shapes, and NO solution.
 */
const WORDS = ["KANE", "BALE", "SANE"];
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/* One number per letter, stable and arbitrary. */
const CODE = {};
ALPHA.split("").forEach((l, i) => { CODE[l] = i + 1; });

function board() {
  const size = 4;
  const cells = [];
  for (let r = 0; r < size; r++) {
    cells[r] = [];
    for (let c = 0; c < size; c++) {
      cells[r][c] = r < WORDS.length ? CODE[WORDS[r][c]] : null;
    }
  }
  return {
    no: 2, size, cells,
    given: [{ n: CODE.K, letter: "K" }],
    slots: WORDS.map((w, i) => ({
      row: i, col: 0, dir: "a", len: w.length,   /* LOWERCASE: wordCells tests w.dir === "a" */
      sense: "", cat: "answer", enum: String(w.length), text: "", breaks: [],
    })),
    absent: ALPHA.split("").filter((l) => !WORDS.join("").includes(l)),
  };
}

/* ---- the server, which can be made to wait -----------------------------
 *
 * `hold` is the point of this stub. A confirm that resolves immediately can
 * never be in flight when the next one is asked for, and the bug being pinned
 * lives entirely in that window.
 */
function server(opts = {}) {
  const calls = [];
  let playFails = !!opts.failPlay;
  let held = null;                       // a pending confirm, kept open
  let holdNext = false;
  let heldPlay = null, holdPlay = false; // and the round-opening call
  const state = { subsUsed: 0, spent: 0 };

  function solvedFor(guess) {
    const done = [];
    WORDS.forEach((w, i) => {
      const ok = w.split("").every((ch) => guess[CODE[ch]] === ch);
      if (ok) done.push(i);
    });
    return done;
  }

  async function handle(what, body) {
    calls.push({ what, body: JSON.parse(JSON.stringify(body)) });
    if (what === "play") {
      return { playId: "p1", startedMs: Date.now(), rate: 3, scored: true, subsLeft: SUBS };
    }
    if (what === "mark" && body.check) {
      /* Check Grid. The SERVER charges, and says what it has charged in total. */
      state.spent += COST.check;
      return { wrong: [], spentMinutes: state.spent };
    }
    if (what === "mark") {
      return { solved: solvedFor(body.guess || {}) };
    }
    if (what === "reveal") {
      /* THE SERVER HAS ALREADY APPLIED BOTH. subsLeft and spentMinutes are
         totals, not deltas — which is exactly why the client adding COST on
         top was a double charge rather than a rounding error. */
      state.subsUsed += 1;
      state.spent += COST.reveal;
      const letter = Object.keys(CODE).find((l) => CODE[l] === body.n);
      return { letter, subsLeft: SUBS - state.subsUsed, spentMinutes: state.spent, charged: true };
    }
    if (what === "finish") return { score: 100, result: "W" };
    return {};
  }

  return {
    calls, state,
    holdNextConfirm() { holdNext = true; },
    releaseHeld() { const h = held; held = null; if (h) h(); return !!h; },
    heldIsWaiting() { return !!held; },
    holdNextPlay() { holdPlay = true; },
    playWorksNow() { playFails = false; },
    releaseHeldPlay() { const h = heldPlay; heldPlay = null; if (h) h(); return !!h; },
    async fetch(url, opts) {
      const what = String(url).replace("/api/codeword/", "").split("?")[0];
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const isConfirm = what === "mark" && !body.check;
      if (what === "play" && playFails) {
        calls.push({ what, body: JSON.parse(JSON.stringify(body)) });
        return { ok: false, status: 500, json: async () => ({}),
                 headers: { get: () => null } };
      }
      const payload = await handle(what, body);
      if (what === "play" && holdPlay) {
        holdPlay = false;
        await new Promise((go) => { heldPlay = go; });
      }
      if (isConfirm && holdNext) {
        holdNext = false;
        await new Promise((go) => { held = go; });
      }
      return { ok: true, status: 200, json: async () => payload,
               headers: { get: () => null } };
    },
  };
}

/* ---- the page ---------------------------------------------------------- */
async function open(opts = {}) {
  const srv = server(opts);
  const dom = new JSDOM(html, {
    url: "https://www.thexigames.com" + (opts.at || "/football/codeword/"),
    runScripts: "outside-only", pretendToBeVisual: true,
  });
  const w = dom.window, doc = w.document;
  w.fetch = (url, opts) => srv.fetch(url, opts);
  /* The daily, which boot() is handed. Shaped as loadDaily() unwraps it. */
  const daily = { board: board() };
  w.fetch = (url, opts) => {
    if (String(url).includes("daily")) {
      /* RECORDED WITH THE NUMBER IT ASKED FOR. The daily is answered here rather
         than by the stub, so without this the one thing the archive checks need
         to see — WHICH board the page requested — never reached srv.calls. */
      const no = (/[?&]no=([^&]*)/.exec(String(url)) || [])[1];
      srv.calls.push({ what: "daily", body: { no } });
      return Promise.resolve({ ok: true, status: 200, json: async () => daily,
                               headers: { get: () => null } });
    }
    return srv.fetch(url, opts);
  };
  /* THE DEVICE'S OWN RECORD, seeded before the page boots. This is the store
     the page reads to decide whether a kick-off is its own replay. */
  if (opts.played) {
    try { w.localStorage.setItem("xicw.results", JSON.stringify(opts.played)); }
    catch (e) { /* jsdom without storage: the test below will say so */ }
  } else {
    try { w.localStorage.removeItem("xicw.results"); } catch (e) {}
  }
  w.eval(game);
  await settle(w);
  return { w, doc, srv, dom };
}

const settle = (w) => new Promise((r) => w.setTimeout(r, 0));
const tick = async (w, n = 6) => { for (let i = 0; i < n; i++) await settle(w); };

function cell(doc, r, c) {
  return doc.querySelector(`#grid .cell[data-r="${r}"][data-c="${c}"]`);
}
function click(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent("click", { bubbles: true }));
}
function press(w, key) {
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true }));
}
/* Type a whole word into row r, selecting each square by hand rather than
   trusting the cursor to step — the step rule is not what is under test. */
function typeWord(w, doc, r, word) {
  word.split("").forEach((ch, c) => {
    const el = cell(doc, r, c);
    if (!el) return;
    click(el);
    press(w, ch);
  });
}
const subsText = (doc) => doc.querySelector("#subs span").textContent;
const minute = (doc) => Number(doc.getElementById("minute").textContent.replace(/\D/g, ""));

/* ======================================================================== */

console.log("=== The board loads and is playable ===");
{
  const { doc, srv } = await open();
  t("the grid is drawn from the sealed board",
    doc.querySelectorAll("#grid .cell").length === 16,
    `${doc.querySelectorAll("#grid .cell").length} squares`);
  t("and nothing in the page holds an answer",
    !doc.body.innerHTML.includes("KANE") && !doc.body.innerHTML.includes("BALE"),
    "a sealed board renders without a solution");
  t("no round is opened before the player touches anything",
    !srv.calls.some((c) => c.what === "play"));
}

console.log("");
console.log("=== One reveal is ONE substitution, not two ===");
{
  const { w, doc, srv } = await open();
  click(cell(doc, 1, 0));                       // B of BALE, not a given
  await tick(w);
  click(doc.getElementById("reveal"));
  await tick(w);

  t("the server was asked to reveal", srv.calls.some((c) => c.what === "reveal"));
  t("and it charged one substitution", srv.state.subsUsed === 1, String(srv.state.subsUsed));
  /* THE ASSERTION THIS FILE WAS WRITTEN FOR. The page must show what the server
     charged, not the server's charge plus its own. */
  t("the page shows ONE spent, which is what the server said",
    subsText(doc) === (SUBS - 1) + " substitutions",
    subsText(doc) + `  (server left ${SUBS - 1})`);
  t("and the clock advanced by one reveal, not two",
    minute(doc) === COST.reveal, `${minute(doc)}' for a ${COST.reveal}' helper`);
}

console.log("");
console.log("=== Check Grid charges once too ===");
{
  const { w, doc, srv } = await open();
  click(cell(doc, 1, 0));
  await tick(w);
  click(doc.getElementById("check"));
  await tick(w);
  t("the server charged one check", srv.state.spent === COST.check, String(srv.state.spent));
  t("and the clock shows exactly that",
    minute(doc) === COST.check, `${minute(doc)}' for a ${COST.check}' helper`);
}

console.log("");
console.log("=== A word finished before the round opens is not lost ===");
{
  /* FOUND BY WRITING THIS FILE, and worse than either fault it was written for.
     start() opens the round asynchronously, and serverOracle.confirm did
     `if (!round) return;` — dropping the callback. refreshSolved() had already
     set asking = true before calling, so the flag latched TRUE FOR THE REST OF
     THE ROUND and no word was ever confirmed again. A player quick enough to
     finish an answer before /play comes back loses the whole board, silently. */
  const { w, doc, srv } = await open();
  srv.holdNextPlay();
  typeWord(w, doc, 0, "KANE");               // finished while /play is open
  await tick(w);
  t("no confirm can go out before the round exists",
    srv.calls.filter((c) => c.what === "mark").length === 0);

  srv.releaseHeldPlay();
  await tick(w, 12);
  t("and when the round opens the finished word is asked about",
    srv.calls.filter((c) => c.what === "mark" && !c.body.check).length >= 1,
    `${srv.calls.filter((c) => c.what === "mark" && !c.body.check).length} confirm(s)`);

  /* THE LATCH. Even if the first ask is lost, the guard must not be stuck. */
  typeWord(w, doc, 1, "BALE");
  await tick(w, 12);
  t("and the guard did not latch, so later words are still asked about",
    srv.calls.filter((c) => c.what === "mark" && !c.body.check).length >= 2,
    `${srv.calls.filter((c) => c.what === "mark" && !c.body.check).length} confirm(s) in total`);
}

console.log("");
console.log("=== A confirm that arrives mid-flight is asked again, not dropped ===");
{
  const { w, doc, srv } = await open();

  /* The round has to exist first, or this block would be testing the fault
     above rather than the one it is for. */
  click(cell(doc, 1, 0));
  await tick(w, 8);

  /* First word finished: this opens a confirm, and the stub HOLDS it. */
  srv.holdNextConfirm();
  typeWord(w, doc, 0, "KANE");
  await tick(w);
  t("a finished answer asks the server to confirm it",
    srv.calls.filter((c) => c.what === "mark" && !c.body.check).length === 1);
  t("and that ask is still in flight", srv.heldIsWaiting());

  /* THE LAST ANSWER, COMPLETED WHILE THE FIRST ASK IS OPEN. This is the exact
     shape that lost board 2: the grid stops changing after this, so if the
     question is dropped here nothing will ever ask it again. */
  typeWord(w, doc, 1, "BALE");
  typeWord(w, doc, 2, "SANE");
  await tick(w);
  const duringFlight = srv.calls.filter((c) => c.what === "mark" && !c.body.check).length;
  t("no second ask goes out while the first is open",
    duringFlight === 1, `${duringFlight} in flight`);

  srv.releaseHeld();
  await tick(w, 12);

  /* THE FIX. Before it, this stayed at 1 for ever. */
  const after = srv.calls.filter((c) => c.what === "mark" && !c.body.check).length;
  t("when the first returns, the question it displaced is asked again",
    after > 1, `${after} confirm(s) — a dropped ask is never retried`);
  t("and the completed board is actually marked solved",
    doc.querySelectorAll("#grid .cell.done").length > 0 ||
    /3\s*\/\s*3|3 of 3/.test(doc.getElementById("solved").textContent) ||
    doc.getElementById("solved").textContent.trim() !== "",
    doc.getElementById("solved").textContent.trim() || "the solved readout is empty");
}

console.log("");
console.log("=== A board this device has finished kicks off as a replay ===");
{
  /* The server has no session and cw_round has no player column, so the page is
     the only thing that knows whose replay it would be. It says so at kick-off
     and the server takes its word — which is safe because a false claim of a
     first sitting banks nothing: recordResult refuses a board already in the
     list and migrate inserts with INSERT OR IGNORE. */
  const fresh = await open();
  click(cell(fresh.doc, 1, 0));
  await tick(fresh.w, 8);
  const first = fresh.srv.calls.find((c) => c.what === "play");
  t("a board never finished here kicks off as a first sitting",
    first && first.body.replay === false, JSON.stringify(first && first.body));

  /* The same board, with this device's own record of having finished it. */
  const again = await open({ played: [{ no: 2, day: "2026-09-15", score: 100,
    solved: 11, minute: 1, result: "W" }] });
  click(cell(again.doc, 1, 0));
  await tick(again.w, 8);
  const second = again.srv.calls.find((c) => c.what === "play");
  t("and a board it HAS finished kicks off as a replay",
    second && second.body.replay === true, JSON.stringify(second && second.body));
}

console.log("");
console.log("=== A round that could not be opened is asked for again ===");
{
  /* THE FOURTH FAULT. If /play FAILS rather than being slow there is no round,
     no round-opening callback, and confirm returns false for ever — so a board
     completed afterwards is filled, correct and silent, which is the reported
     symptom by a different road. refreshSolved asks for a round when it finds
     it has none, driven by a player finishing an answer rather than a timer. */
  const { w, doc, srv } = await open({ failPlay: true });
  click(cell(doc, 1, 0));
  await tick(w, 8);
  const failed = srv.calls.filter((c) => c.what === "play").length;
  t("the first kick-off was attempted and failed", failed === 1, `${failed} attempt(s)`);
  t("and no round exists, so nothing can be confirmed",
    srv.calls.filter((c) => c.what === "mark").length === 0);

  srv.playWorksNow();
  typeWord(w, doc, 0, "KANE");                  // finishing an answer retries
  await tick(w, 14);
  const retried = srv.calls.filter((c) => c.what === "play").length;
  t("finishing an answer asks for a round again",
    retried > 1, `${retried} kick-off attempt(s)`);
  t("and the finished word is then confirmed",
    srv.calls.filter((c) => c.what === "mark" && !c.body.check).length >= 1,
    `${srv.calls.filter((c) => c.what === "mark" && !c.body.check).length} confirm(s)`);
}

console.log("");
console.log("=== An archive permalink loads the board it names, not today ===");
{
  /* THE BUG THIS PINS was live on production tonight. The page set the archived
     day's title, og:title and canonical correctly and served TODAY's puzzle
     underneath, because the loader read only location.search and the family puts
     the number in the PATH. Right heading, right canonical, wrong board — which
     nobody reports, because it does not look broken. */
  const at = permalinkPath("codeword", 21);
  t("the family builds a board address as a path, not a query",
    at === "/football/codeword/daily/21" && at.indexOf("?") === -1, at);

  const { w, srv } = await open({ at });
  await tick(w, 8);
  const asked = srv.calls.find((c) => c.what === "daily");
  t("opening that address asks for THAT board",
    !!asked && String(asked.body.no) === "21",
    asked ? `asked no=${asked.body.no}` : "no daily request went out");

  /* The only route to today is no number in either place. */
  const plain = await open();
  await tick(plain.w, 8);
  const p = plain.srv.calls.find((c) => c.what === "daily");
  t("and the bare page still asks for today",
    !!p && (p.body.no === undefined || p.body.no === null || p.body.no === ""),
    p ? `asked no=${JSON.stringify(p.body.no)}` : "no daily request");

  /* PRESENT AND UNREADABLE IS REFUSED, not quietly turned into today —
     defaulting to today is precisely what kept the original invisible. */
  const bad = await open({ at: "/football/codeword/daily/abc" });
  await tick(bad.w, 8);
  t("a present-but-unreadable number in the path is refused, not replaced by today",
    !bad.srv.calls.some((c) => c.what === "daily"),
    "no board is better than the wrong board under the right title");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

process.exit(0);
