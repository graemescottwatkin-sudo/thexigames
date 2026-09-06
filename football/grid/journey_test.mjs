/* journey_test.mjs — Grid XI played, in a real page, through the real handlers.
 *
 * api_test.mjs proves the ENDPOINTS work. This proves the PAGE does, which is
 * not the same claim: between them sits a file that could paint the wrong cell,
 * hold a letter it was never given, or quietly compute a score of its own. The
 * word search's whole retrofit was that last one, so it is what this looks for
 * hardest — and the only way to look is to play a board and read the DOM.
 *
 * THE CHECK THAT MATTERS MOST is that the page never holds an answer. It is
 * asserted twice over: nothing in the served markup or script carries one, and
 * after a wrong guess the board shows no letter the player did not type.
 *
 *   npm install -D jsdom --no-save
 *   node football/grid/journey_test.mjs        (from the repo root)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { onRequestGet as apiDaily } from "../../functions/api/grid/daily.js";
import { onRequestPost as apiGuess } from "../../functions/api/grid/guess.js";
/* THE REAL /api/play, because the page gets its play id from it and a round
   with no play id is a round the server does not score. Stubbing it would have
   hidden exactly the bug this suite found: the page was passing xi-plays'
   { playId, playNo } object where an id was wanted, so every guess arrived
   anonymous and the game ran unscored while looking perfectly correct. */
import { onRequestPost as apiPlay } from "../../functions/api/play.js";
import { loadBank, boardForDay, todayKey } from "../../functions/_lib/gd-board.js";
import RULES from "./js/rules.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* The board this run will actually be served, read from the same bank the
   handler reads — so the expectations are the board's, not a fixture's. */
const bank = await loadBank({});
const BOARD = boardForDay(bank, todayKey());
if (!BOARD) { console.error("no board today in the sample bank"); process.exit(1); }

/* ---- a D1 stand-in, and a server that routes /api/grid/* to the real code -- */
function makeDb() {
  const guesses = [], hints = [], rounds = [];
  const like = (sql, re) => re.test(sql);
  return { prepare: (sql) => ({ bind: (...a) => ({
    async run() {
      if (like(sql, /INTO gd_round/) && !rounds.some((r) => r.play_id === a[0])) {
        rounds.push({ play_id: a[0] });
      } else if (like(sql, /INTO gd_guess/) &&
                 !guesses.some((g) => g.play_id === a[0] && g.idx === a[1])) {
        guesses.push({ play_id: a[0], idx: a[1], entry_n: a[2], guess: a[3], correct: a[4] });
      } else if (like(sql, /INTO gd_hint/)) { hints.push({ play_id: a[0], cell: a[1] }); }
      return { success: true };
    },
    async first() {
      if (like(sql, /COUNT\(\*\) AS n FROM gd_guess/)) {
        return { n: guesses.filter((g) => g.play_id === a[0]).length };
      }
      if (like(sql, /COUNT\(\*\) AS n FROM gd_hint/)) {
        return { n: hints.filter((h) => h.play_id === a[0]).length };
      }
      return null;
    },
    async all() {
      if (like(sql, /FROM gd_guess WHERE play_id/)) {
        return { results: guesses.filter((g) => g.play_id === a[0]).sort((x, y) => x.idx - y.idx) };
      }
      if (like(sql, /FROM gd_hint WHERE play_id/)) {
        return { results: hints.filter((h) => h.play_id === a[0]) };
      }
      throw new Error("no such table");
    },
  }) }) };
}
const DB = makeDb();

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css",
  ".js": "text/javascript", ".json": "application/json" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/play" || url.pathname.startsWith("/api/grid/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request("https://www.thexigames.com" + req.url, {
      method: req.method,
      headers: { "Content-Type": "application/json", "X-XI-Games": "1" },
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const fn = url.pathname === "/api/play" ? apiPlay
      : url.pathname.endsWith("/guess") ? apiGuess : apiDaily;
    const out = await fn({ request, env: { DB } });
    res.writeHead(out.status, { "Content-Type": "application/json" });
    return res.end(await out.text());
  }
  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  /* The shared layer lives beside the game, not inside it — the page links
     /shared/, which from the served root is the repository root. */
  const file = rel.startsWith("/shared/") ? path.join(ROOT, rel.slice(1)) : path.join(DIR, rel);
  if (!(file.startsWith(DIR) || file.startsWith(path.join(ROOT, "shared"))) ||
      !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end("not found");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "text/plain" });
  res.end(fs.readFileSync(file));
});

server.listen(0, "127.0.0.1", async () => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`Serving ${DIR} at ${origin}\n`);

  const dom = await JSDOM.fromURL(origin + "/", {
    runScripts: "dangerously", pretendToBeVisual: true, resources: "usable",
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      w.scrollTo = () => {}; w.scrollBy = () => {};
      w.fetch = (u, o) => fetch(String(u).startsWith("http") ? u : origin + u, o);
      w.Element.prototype.scrollIntoView = function () {};
    },
  });
  const w = dom.window, d = w.document;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(3000);
  const G = w.__grid;
  const cells = () => [...d.querySelectorAll("#gdBoard .gd-cell.on")];
  const letters = () => cells().map((c) => c.textContent.replace(/^\d+/, "").trim()).join("");

  console.log("The board arrives, and it arrives empty");
  {
    t("the page booted and has the board", !!G && !!G.state().board,
      G && G.state().board ? G.state().board.id : "no board");
    t("the title is on the page, because the title IS the clue",
      d.getElementById("gdTitle").textContent === BOARD.title,
      d.getElementById("gdTitle").textContent);
    t("eleven entries are drawn", d.querySelectorAll("#gdEntries .gd-chip").length === 11);
    t("the grid has a cell for every letter of every answer",
      cells().length === new Set(BOARD.entries.flatMap((e) => e.cells)).size,
      cells().length + " cells");
    /* THE OWNER'S RULING: a board opens on its title alone. */
    t("and NOT ONE LETTER is on it at the start", letters() === "",
      letters() || "(empty, as it must be)");
    t("fifteen turns to start",
      d.getElementById("gdTurns").textContent === String(RULES.TURNS_START));
  }

  console.log("\nThe page holds no answer, anywhere");
  {
    const shipped = fs.readFileSync(path.join(DIR, "js", "game.js"), "utf8") +
      fs.readFileSync(path.join(DIR, "index.html"), "utf8");
    const found = BOARD.entries.filter((e) => shipped.includes(e.answer));
    t("no answer is in the page's own files", found.length === 0,
      found.length ? "LEAKED " + found[0].answer : "checked 11 answers");
    /* AND NOT IN WHAT THE PAGE WAS GIVEN. The state is readable through the
       test seam, which is where a leak would actually show up. */
    const state = JSON.stringify(G.state().board);
    const inState = BOARD.entries.filter((e) => state.includes(e.answer));
    t("nor in the board the page is holding", inState.length === 0,
      inState.length ? "LEAKED " + inState[0].answer : "shape only");
    t("and the page cannot mark a guess even if it wanted to",
      typeof G.state().board.entries[0].answer === "undefined");
  }

  console.log("\nA wrong guess is marked by the server and painted here");
  {
    const e = BOARD.entries[0];
    G.pick(0);
    "Z".repeat(e.len).split("").forEach((ch) => G.type(ch));
    t("the typed letters appear in the slot row",
      [...d.querySelectorAll("#gdSlots .gd-slot")].filter((s) => s.textContent === "Z").length === e.len);
    G.submit();
    await wait(600);
    t("the guess cost a turn, and the count came from the server",
      d.getElementById("gdTurns").textContent === String(RULES.TURNS_START - 1),
      d.getElementById("gdTurns").textContent);
    t("the marks are drawn on the board",
      cells().filter((c) => /\b(c|p|a)\b/.test(c.className)).length > 0);
    /* THE CHECK A LEAK WOULD FAIL. After a wrong guess the board shows the
       letters that were TYPED and nothing else — if the page had the answer it
       would be the obvious place for one to appear. */
    const onBoard = letters().replace(/Z/g, "");
    t("and no letter the player did not type is on the board",
      onBoard === "", onBoard || "(only the typed Zs)");
  }

  console.log("\nThe right answer solves it, and its letters cross");
  {
    const e = BOARD.entries[0];
    G.pick(0);
    e.answer.split("").forEach((ch) => G.type(ch));
    G.submit();
    await wait(600);
    const st = G.state();
    t("the entry is solved", st.solved[e.n] === true);
    t("the turn came back", d.getElementById("gdTurns").textContent === String(RULES.TURNS_START),
      d.getElementById("gdTurns").textContent);
    t("its cells are confirmed, by the server",
      e.cells.every((c) => st.confirmed[c] === e.answer[e.cells.indexOf(c)]));
    t("and the chip says so", !!d.querySelector("#gdEntries .gd-chip.done"));
    /* THE CROSSING IS THE WAY IN, and it is free: an entry that shares a cell
       with this one opens with that letter already filled. */
    const crossing = BOARD.entries.findIndex((x, i) =>
      i !== 0 && x.cells.some((c) => e.cells.includes(c)));
    if (crossing >= 0) {
      G.pick(crossing);
      const x = BOARD.entries[crossing];
      const shared = x.cells.filter((c) => e.cells.includes(c));
      t("a crossing entry opens with the shared letter already there",
        shared.every((c) => st.confirmed[c]),
        `${shared.length} shared cell(s) with entry ${e.n}`);
      t("and the player is not asked to type it again",
        shared.every((c) => G.state().typed[x.cells.indexOf(c)] === st.confirmed[c]));
    }
  }

  console.log("\nFull time");
  {
    /* Burn the budget. The page cannot end the board itself — it ends when the
       SERVER says the turns are gone, which is what this waits for. */
    const e = BOARD.entries.find((x) => !G.state().solved[x.n]);
    for (let i = 0; i < RULES.TURNS_START + 2 && !G.state().over; i++) {
      G.pick(BOARD.entries.indexOf(e));
      const typed = G.state().typed;
      for (let j = 0; j < typed.length; j++) if (!typed[j]) G.type("Q");
      G.submit();
      await wait(250);
    }
    t("the board ends when the server says the turns are gone", G.state().over === true,
      `turns ${G.state().turns}`);
    t("full time is shown", d.getElementById("gdFullTime").hidden === false);
    t("with a score out of 114",
      /\/114/.test(d.getElementById("gdFullTime").textContent),
      d.querySelector("#gdFullTime .score") && d.querySelector("#gdFullTime .score").textContent);
    /* AND ONLY NOW DO THE ANSWERS ARRIVE. Not before — the server sends them
       when the round it has been counting says the board is finished. */
    t("the answers arrive at full time, from the server", !!G.state().answers);
    t("and the grid fills in", letters().length > 0);
    t("the score the page shows is the one the server computed",
      d.querySelector("#gdFullTime .score").textContent.indexOf(String(G.state().score.total)) === 0,
      JSON.stringify(G.state().score));
  }

  w.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
