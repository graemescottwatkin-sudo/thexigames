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

/* EVERY BODY THE PAGE SENDS TO /api/play, kept so the END row can be read.
   The gate can see that a progress function is PASSED; only a played board can
   show what it returns, and a function returning nothing useful would satisfy
   the gate exactly as well as this one does. */
const playPosts = [];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/play" || url.pathname.startsWith("/api/grid/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (url.pathname === "/api/play" && chunks.length) {
      try { playPosts.push(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (e) { /* a body that is not JSON is not a play row */ }
    }
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
  /* WAIT FOR THE THING, NOT FOR A NUMBER OF MILLISECONDS. Every guess was
     followed by a fixed sleep, 600ms or 250ms, and a loaded machine loses that
     race: the end row had not reached the server when it was read, and one
     sweep of the full roster went red on it on 24 Sep 2026 while eight reruns
     passed. Twelve copies at once turned half the suite red — a submit made
     while the last was still in flight returns early and burns no turn, so
     the loops that play the board out stopped short — and heavier load beat
     the 3000ms boot sleep too, leaving no board to play at all. The page says
     when it is ready (the document is complete, the board has arrived and the
     play's start row has reached the server) and when a guess has settled
     (state().busy clears when the server answers), so those are what is
     waited on. The deadline is the guard against a wait that cannot end: a
     condition that never comes true returns false, and the assertion after
     it fails as it always would have. */
  const until = async (ok, ms = 10000) => {
    const end = Date.now() + ms;
    while (!ok() && Date.now() < end) await wait(20);
    return ok();
  };
  await until(() => d.readyState === "complete" && !!w.__grid && !!w.__grid.state().board &&
    playPosts.some((r) => r && r.event === "start"), 30000);
  const G = w.__grid;
  const settled = () => until(() => !G.state().busy);
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

    /* ---- where one word ends and the next begins --------------------- */
    /* LEWISSKELLY WAS ELEVEN LETTERS WITH NOTHING TO SAY IT WAS TWO WORDS,
       which the owner hit playing day one. The server sends the offsets; the
       grid draws a divider on the LEADING edge of the cell at each one.
       NOT ON THE EMPTY GRID — owner's call, 20 Sep 2026, reversing the rule
       this block used to assert. A grid ruled into words before a stroke is
       played gives away the shape of all eleven answers at once. The divider
       arrives per CELL as that cell fills, so it is still a hint while
       guessing rather than after.
       BOTH HALVES ARE CHECKED, and they were not before: this proved the
       dividers were drawn and never that they could be absent, so a board that
       drew them always would have passed. Empty here, present once solved,
       further down. The assertions just above have proved not one letter is on
       the board, which is what makes the first half mean anything. */
    const expected = [];
    BOARD.entries.forEach((e) => {
      (e.breaks || []).forEach((k) => {
        expected.push({ cell: e.cells[k], cls: e.dir === "down" ? "brk-t" : "brk-l" });
      });
    });
    t("this board is one that actually breaks, or the rest proves nothing",
      expected.length > 0,
      expected.length + " break(s) across " +
        BOARD.entries.filter((e) => (e.breaks || []).length).length + " entries");
    t("no break is drawn while the grid is empty",
      expected.every(({ cell, cls }) => {
        const el = d.querySelector('.gd-cell[data-cell="' + cell + '"]');
        return el && !el.classList.contains(cls);
      }),
      expected.map((x) => x.cell + ":" + x.cls).join(" "));
    /* AND NOWHERE ELSE. A divider on a cell that does not start a word is a
       lie about the answer's shape, and worse than none at all. */
    /* NOT ONE ANYWHERE, which is the positive form of the new rule and the
       thing that would catch a board still drawing them early. */
    t("and the grid carries no divider at all yet",
      d.querySelectorAll(".gd-cell.brk-l, .gd-cell.brk-t").length === 0,
      d.querySelectorAll(".gd-cell.brk-l, .gd-cell.brk-t").length + " marked");
    /* THE STRAY CHECK AND THE DIRECTION CHECK MOVED to the solved board below.
       Both ask what the drawn classes are, and on an empty grid there are none
       to ask about — they passed here by finding nothing, which is the shape
       of a check that cannot fail. */
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
    await settled();
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
    await settled();
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

  console.log("\nSolving the board out ends it too");
  {
    /* THE OTHER WAY A BOARD ENDS, and the one the owner reported: "Grid didn't
       pop up a complete when finished". The block below reaches full time by
       BURNING THE TURN BUDGET, so the only ending ever exercised was the losing
       one. Solving all eleven is the ending a player actually wants, and
       nothing drove it.
       RULES.isOver is `solved >= ENTRIES || turns <= 0`, and the two halves are
       reached by different roads: the second by turnsAfter counting down, the
       first from the server's `solved` set, which is built only from guesses it
       has RECORDED as correct. A board can be complete on screen without that
       set being full, because green propagates across crossings — an entry can
       have every cell confirmed without ever having been guessed. This asks for
       the ending directly rather than reasoning about which road it took. */
    const remaining = BOARD.entries.filter((x) => !G.state().solved[x.n]);
    for (const x of remaining) {
      if (G.state().over) break;
      G.pick(BOARD.entries.indexOf(x));
      const typed = G.state().typed;
      for (let j = 0; j < typed.length; j++) if (!typed[j]) G.type(x.answer[j]);
      G.submit();
      await settled();
    }
    const st = G.state();
    /* AND NOW THE DIVIDERS ARE THERE. The other half of the rule: absent on an
       empty grid, present on a filled one. Without this the check above is
       satisfied by a board that never draws them at all. */
    {
      const late = [];
      BOARD.entries.forEach((e) => {
        (e.breaks || []).forEach((k) => {
          late.push({ cell: e.cells[k], cls: e.dir === "down" ? "brk-t" : "brk-l" });
        });
      });
      t("every break is drawn once its cell has a letter",
        late.length > 0 && late.every(({ cell, cls }) => {
          const el = d.querySelector('.gd-cell[data-cell="' + cell + '"]');
          return el && el.classList.contains(cls) && (el.textContent || "").trim() !== "";
        }),
        late.map((x) => x.cell + ":" + x.cls).join(" "));
      const want = new Set(late.map((x) => x.cell + ":" + x.cls));
      /* AND NOWHERE ELSE. A divider on a cell that does not start a word is a
         lie about the answer's shape, and worse than none at all. */
      const marked = [...d.querySelectorAll(".gd-cell.brk-l, .gd-cell.brk-t")];
      const stray = marked.flatMap((el) => {
        const cell = el.getAttribute("data-cell");
        return ["brk-l", "brk-t"]
          .filter((c) => el.classList.contains(c) && !want.has(cell + ":" + c))
          .map((c) => cell + ":" + c);
      });
      t("and no divider is drawn where no word begins", stray.length === 0,
        stray.join(" ") || marked.length + " cells carry one, all of them earned");
      /* THE DIRECTION IS THE ENTRY'S, NOT THE CELL'S. A cell belongs to an
         across entry and a down entry at once, and a break in one says nothing
         about the other — so an across break must never arrive as a top edge. */
      t("an across break is a left edge and a down break is a top one",
        late.every(({ cell, cls }) => {
          const el = d.querySelector('.gd-cell[data-cell="' + cell + '"]');
          const other = cls === "brk-l" ? "brk-t" : "brk-l";
          return el && (!el.classList.contains(other) || want.has(cell + ":" + other));
        }));
    }
    t("every entry is solved", Object.keys(st.solved).length === RULES.ENTRIES,
      Object.keys(st.solved).length + " of " + RULES.ENTRIES);
    t("the server calls the board over on a completed grid", st.over === true,
      "solved " + Object.keys(st.solved).length + ", turns " + st.turns);
    t("and full time is on screen without the turns running out",
      d.getElementById("gdFullTime").hidden === false && st.turns > 0,
      "turns left " + st.turns);
    /* HOW FAR THE PLAY GOT, as the plays table will hold it.
       Grid passed no progress function to XIPlays.start until 19 Sep 2026, so
       every field xi-plays.js reads at the end defaulted to 0 and a finished
       board wrote solved=0 and elapsed_secs=0 beside completed=1 — the
       finish recorded and nothing about the finishing. Read off the request
       the page actually sent rather than off the page's own state, because the
       fault was entirely in what was SENT.
       `elapsed` is asserted only to be a number and not negative: jsdom plays
       a board in well under a second, so demanding it be positive would be a
       check that fails on a fast machine and passes on a slow one. */
    await until(() => playPosts.some((r) => r && r.event === "end"));
    const ended = playPosts.filter((r) => r && r.event === "end");
    const last = ended[ended.length - 1] || null;
    t("the play's end says how far it got", !!last && last.solved === RULES.ENTRIES,
      last ? "solved " + last.solved + " of " + RULES.ENTRIES : "no end row was sent");
    t("and carries an elapsed time and the board's misses",
      !!last && typeof last.elapsed === "number" && last.elapsed >= 0 &&
      !!last.detail && last.detail.misses === st.misses,
      last ? "elapsed " + last.elapsed + "s, detail " + JSON.stringify(last.detail) : "none");
    /* NOT THE MAXIMUM, AND SAYING SO. Written as "the full score for a clean
       board" first, and it failed at 113: this run is not clean — a block above
       deliberately guesses wrong to prove a miss is marked, so the efficiency
       points are down one. The score is the SERVER'S arithmetic for what this
       round actually did, which is what should be asserted; expecting 114 here
       was expecting a different game to have been played. */
    t("and the score is the server's, for a board solved rather than lost",
      !!st.score && st.score.solved === RULES.ENTRIES &&
      st.score.total === RULES.score({ solved: st.score.solved, misses: st.misses,
                                       hints: st.score.hints || 0 }).total,
      st.score ? st.score.total + " with " + st.misses + " miss(es)" : "no score");
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
      await settled();
    }
    t("the board ends when the server says the turns are gone", G.state().over === true,
      `turns ${G.state().turns}`);
    t("full time is shown", d.getElementById("gdFullTime").hidden === false);
    t("with a score out of 114",
      /\/114/.test(d.getElementById("gdFullTime").textContent),
      d.querySelector("#gdFullTime .score") && d.querySelector("#gdFullTime .score").textContent);
    /* AND ONLY NOW DO THE ANSWERS ARRIVE. Not before — the server sends them
       when the round it has been counting says the board is finished. */
    /* ---- the share row, and the community line, on the finished card ----
       THIS GAME HAD NO SHARE AT ALL: no row, no copy button, no text. Every
       other game offers one, so a player who had just finished a Grid had
       nothing to do with it.
       PROVED BY EXECUTION, because the source check in aligned_test cannot see
       this. That one reads that the row is placed, the script is loaded and
       mount is called; wrapping the call in `if (false && ...)` leaves all
       three strings intact and it stays green. Sabotage said so. What cannot
       be faked is the row being in the card after a board has actually been
       played to the whistle, which is what is asserted here.
       BOTH ELEMENTS ARE WRITTEN BY THE SAME innerHTML that builds the card, so
       neither exists until this moment and both are destroyed by the next
       full time — that is why the game mounts and fills them after the write
       rather than placing them in index.html. */
    /* THE ROW MUST BE FILLED, NOT MERELY PRESENT. First written as "the box
       exists", and the box is written into the card by the same string either
       way — disabling the mount left this green. What mount() actually does is
       add .xis to the target and put a Share button inside it, so that is what
       is asked for. Caught by sabotage. */
    const shareRow = d.querySelector("#gdFullTime #shareRow");
    t("the finished card carries the family's share row",
      !!shareRow && shareRow.classList.contains("xis") &&
      !!shareRow.querySelector("button"),
      shareRow ? "row is " + (shareRow.className || "(unfilled)")
               : "a player with nothing to send it with is the fault this closes");
    t("and the community line, pointing at the subreddit",
      !!d.querySelector("#gdFullTime .xic-community"),
      "placed by the game, filled by the chrome");
    /* AND THE SHARE TEXT NAMES THE BOARD AND THE SCORE, WITHOUT NAMING AN
       ANSWER. A share is read by people who have not played it yet. */
    t("the share text is the score, never an answer", (() => {
      const row = d.querySelector("#gdFullTime #shareRow");
      if (!row) return false;
      const txt = row.textContent || "";
      const answers = (BOARD.entries || []).map((e) => e.answer).filter(Boolean);
      return !answers.some((ans) => txt.indexOf(ans) >= 0);
    })(), "eleven answers checked against the row");
    t("the answers arrive at full time, from the server", !!G.state().answers);
    t("and the grid fills in", letters().length > 0);
    t("the score the page shows is the one the server computed",
      d.querySelector("#gdFullTime .score").textContent.indexOf(String(G.state().score.total)) === 0,
      JSON.stringify(G.state().score));
  }

  /* ---- coming back to a board you have already finished ----------------
   * Grid banked its result in xigd.results and NOTHING ON BOOT READ IT: a
   * finished board reopened as an empty grid with a full turn budget and no
   * sign it had been played. Codeword had the same fault, found the same day,
   * and for the same reason — every suite either game had drove a FIRST visit.
   * A device that has finished nothing behaves identically either way, which
   * is why nothing caught it.
   * A SECOND PAGE, with the record already on the device. */
  {
    const banked = { no: G.state().no, title: "x", score: 97, solved: 11,
                     misses: 1, hints: 0, at: Date.now() };
    const dom2 = await JSDOM.fromURL(origin + "/", {
      runScripts: "dangerously", pretendToBeVisual: true, resources: "usable",
      beforeParse(w2) {
        w2.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
        w2.scrollTo = () => {}; w2.scrollBy = () => {};
        w2.fetch = (u, o) => fetch(String(u).startsWith("http") ? u : origin + u, o);
        w2.Element.prototype.scrollIntoView = function () {};
        try { w2.localStorage.setItem("xigd.results", JSON.stringify([banked])); } catch (e) {}
      },
    });
    const d2 = dom2.window.document;
    await until(() => d2.readyState === "complete" && !!dom2.window.__grid &&
      !!dom2.window.__grid.state().board, 30000);
    const ft2 = d2.getElementById("gdFullTime");
    t("a board this device finished opens on its Full Time card",
      !!ft2 && ft2.hidden === false, ft2 ? "hidden=" + ft2.hidden : "no #gdFullTime");
    /* THE BANKED FIGURES, NOT RECOMPUTED ONES. Nothing of the round is stored,
       so a card that worked its score out from the grid in front of it would
       read zero — the number has to come from the record. */
    t("and it shows the score that was banked",
      !!ft2 && ft2.textContent.indexOf(String(banked.score)) >= 0,
      ft2 && ft2.textContent.replace(/\s+/g, " ").slice(0, 80));
    /* AND THE BOARD IS STILL THERE. This restores a record, not a round: the
       grid stays playable and the server decides whether a replay scores. */
    /* AND IT CAN BE SENT. The restore drew the community line and no share
       row, so a finished board gave you something to read and no way to share
       it — the one thing a finished board is most wanted for. Asked of the
       FILLED row, not the container: mount() adds .xis and a button, and the
       empty div is written by the same string either way. */
    const shareRow2 = d2.querySelector("#gdFullTime #shareRow");
    t("and the restored card can be shared",
      !!shareRow2 && shareRow2.classList.contains("xis") &&
      !!shareRow2.querySelector("button"),
      shareRow2 ? "row is " + (shareRow2.className || "(unfilled)") : "no share row");
    t("with the grid still playable underneath",
      d2.querySelectorAll("#gdBoard .gd-cell.on").length > 0,
      d2.querySelectorAll("#gdBoard .gd-cell.on").length + " cells");
    dom2.window.close();
  }

  w.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
