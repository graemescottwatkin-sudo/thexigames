/* journey_test.mjs — a whole QuickFire round, played.
 *
 * WHY THIS EXISTS, and it is the plainest reason in the repo: on 15 September
 * 2026 this game's client was rewritten from a typing game to a four-option
 * picker — some six hundred lines — and nothing had executed a line of it. The
 * gates check the SHAPE of a tree and the round suite checks the SERVER's
 * rules; between them sat the entire page, proved by reading. Codeword shipped
 * a live bug through exactly that gap two days earlier: its daily reported one
 * number and its play endpoint expected another, every handler began
 * `if (!round) return;`, and the game recognised nothing while erroring
 * nowhere. A page that fails silently is the failure mode this family has, so
 * the page gets driven rather than read.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. The markup, the stylesheet and game.js are
 * the shipped bytes. The endpoints are stubbed — but they are stubbed to
 * ANSWER, not to rubber-stamp: the stub keeps a round, refuses a question that
 * was not served, and marks against an answer the page is never given. A stub
 * that agreed with whatever it was sent would prove the page can talk to
 * itself.
 *
 * THE ANSWER IS HELD BY THE STUB AND NEVER PUT IN A PAYLOAD, which is also the
 * point: if the page could only work by being told the answer, this file could
 * not be written without handing it one.
 *
 *   npm install -D jsdom --no-save
 *   node football/quickfire/journey_test.mjs      (from the repo root)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const DIR = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const game = fs.readFileSync(path.join(DIR, "js", "game.js"), "utf8");
const config = fs.readFileSync(path.join(DIR, "js", "config.js"), "utf8");

const PER_DAILY = 11;

/* The board the stub serves. Eleven questions and a bench of three, each with
   four options — and the ANSWER kept out here, where the page cannot reach it,
   exactly as the server keeps it. */
function makeBoard() {
  const questions = [];
  for (let i = 1; i <= PER_DAILY; i++) {
    questions.push({
      id: "q" + i, clue: "Question " + i,
      options: ["Right" + i, "Wrong" + i + "a", "Wrong" + i + "b", "Wrong" + i + "c"],
      answerType: "club", difficulty: "medium",
    });
  }
  const bench = [1, 2, 3].map((i) => ({
    id: "b" + i, clue: "Bench " + i,
    options: ["BRight" + i, "BWrong" + i + "a", "BWrong" + i + "b", "BWrong" + i + "c"],
    answerType: "club", difficulty: "medium",
  }));
  return { id: "XIQF-20260914", date: "2026-09-14", no: 20, questions, bench };
}

/* The truth the page is never told. Keyed by question id. */
function answerOf(id) {
  return id.startsWith("b") ? "BRight" + id.slice(1) : "Right" + id.slice(1);
}

/* ---- the stub server -------------------------------------------------- */

function server(board, opts = {}) {
  const calls = [];
  const round = { playId: null, servedIdx: 0, answers: new Map(), subsUsed: 0, minute: opts.minute || 0 };
  const slot = board.questions.slice();
  let benchAt = 0;

  async function handle(pathname, body) {
    calls.push({ pathname, body });

    if (pathname.startsWith("/api/quickfire/daily")) {
      /* SHAPED EXACTLY AS daily.js SHAPES IT — `{ ...daily, no, day }`, not the
         raw board. The first version of this stub returned the board as
         getDaily() builds it, which carries `date` and not `day`, and three
         assertions failed at once: the date read "undefined", the round was
         opened against an undefined day, and the banked result had no day to be
         keyed on. All three were the stub's fault and none were the page's —
         but they are what the page would do if the endpoint ever dropped the
         field, which is the argument for a stub mirroring the contract rather
         than approximating it. */
      return [200, { source: "d1", no: board.no, day: board.date, lastDay: board.date,
                     isToday: true,
                     daily: { ...board, no: board.no, day: board.date },
                     week: null }];
    }
    if (pathname === "/api/quickfire/archive") {
      return [200, { source: "d1", today: board.date, lastDay: board.date, count: 2,
                     boards: [{ day: "2026-09-14", no: 20 }, { day: "2026-09-13", no: 19 }] }];
    }
    if (pathname === "/api/quickfire/play") {
      round.playId = "round-1";
      return [200, { playId: round.playId, startedMs: Date.now(), subsLeft: 3, questions: PER_DAILY }];
    }
    if (pathname === "/api/quickfire/next") {
      if (body.playId !== round.playId) return [400, { error: "no round" }];
      /* REFUSES A REWIND, like the real one. */
      if (body.idx < round.servedIdx) return [400, { error: "that question has already been played" }];
      round.servedIdx = body.idx;
      return [200, { idx: body.idx, startedMs: Date.now(), minute: round.minute }];
    }
    if (pathname === "/api/quickfire/answer") {
      if (body.playId !== round.playId) return [400, { error: "no round" }];
      /* THE GUARD THAT MATTERS: a question nobody served cannot be answered. */
      if (round.servedIdx !== body.idx) return [400, { error: "that question has not been served" }];
      const q = slot[body.idx - 1];
      if (body.pick === null || body.pick === undefined) {
        if (round.minute < 90) return [400, { error: "there is still time on the clock" }];
        round.answers.set(body.idx, 0);
        return [200, { idx: body.idx, correct: false, points: 0, minute: 90, timedOut: true }];
      }
      if (!q.options.includes(body.pick)) return [400, { error: "that was not one of the options" }];
      const correct = body.pick === answerOf(q.id);
      const points = correct ? 100 : 0;
      round.answers.set(body.idx, points);
      return [200, { idx: body.idx, correct, points, minute: round.minute,
                     penaltyMinutes: correct ? 0 : 5 }];
    }
    if (pathname === "/api/quickfire/sub") {
      if (round.subsUsed >= 3) return [400, { error: "no substitutions left" }];
      round.subsUsed += 1;
      slot[round.servedIdx - 1] = board.bench[benchAt++];
      return [200, { subsLeft: 3 - round.subsUsed, startedMs: Date.now(), minute: 0 }];
    }
    if (pathname === "/api/quickfire/finish") {
      let score = 0;
      for (const p of round.answers.values()) score += p;
      score = Math.max(0, score - round.subsUsed * 20);
      const correct = [...round.answers.values()].filter((p) => p > 0).length;
      return [200, { score, answered: round.answers.size, correct,
                     questions: PER_DAILY, subsUsed: round.subsUsed, minute: round.minute }];
    }
    return [404, { error: "not found" }];
  }

  return { handle, calls, round, slot };
}

/* ---- the page --------------------------------------------------------- */

async function open(opts = {}) {
  const board = makeBoard();
  const srv = server(board, opts);

  const dom = new JSDOM(html, {
    url: "https://www.thexigames.com/football/quickfire/" + (opts.hash || ""),
    runScripts: "outside-only", pretendToBeVisual: true,
  });
  const w = dom.window;

  /* EACH RUN STARTS EMPTY. jsdom shares localStorage between windows on the
     same origin, so a row banked by one block was still there for the next —
     and the banking assertion passed or failed depending on which block ran
     first. It failed for a real reason the first time (the stub's missing day),
     and would have gone on failing after that was fixed, because the stale row
     from the earlier run had a day of undefined and the first-banked-wins merge
     rule correctly refused to replace it. A suite whose result depends on the
     order of its own blocks is a suite that will one day be "fixed" by
     reordering them. */
  try { w.localStorage.clear(); } catch (e) { /* no storage, nothing to clear */ }

  w.fetch = (url, init) => {
    const u = String(url);
    const body = init && init.body ? JSON.parse(init.body) : {};
    return srv.handle(u, body).then(([status, json]) => ({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(json),
    }));
  };
  /* XIPlays and XISeason belong to shared/ and are proved by their own suites;
     here they are recorded so the page's use of them can be asserted without
     pulling the whole family in. */
  const played = [];
  w.XIPlays = {
    start: (meta) => played.push(["start", meta]),
    end: (done) => played.push(["end", done]),
    active: () => true,
  };
  const seasons = [];
  w.XISeason = { record: (day) => seasons.push(day) };

  w.eval(config);
  w.eval(game);
  await settle(w);
  return { w, srv, board, played, seasons, doc: w.document };
}

const settle = (w, ms = 0) => new Promise((r) => setTimeout(r, ms));

const visible = (doc, id) => {
  const el = doc.getElementById(id);
  return !!el && !el.hidden;
};

/* ---- the run ---------------------------------------------------------- */

console.log("=== The page comes up on a board ===");
{
  const { doc, w } = await open();
  t("the start screen is shown, not the loader", visible(doc, "screenStart") && !visible(doc, "screenLoading"));
  t("it names the board by its family number",
    /No\. 20/.test(doc.getElementById("startDate").textContent),
    doc.getElementById("startDate").textContent);
  t("and calls it today's Daily",
    /Today/i.test(doc.getElementById("startKicker").textContent));
  t("the past-boards button is offered", visible(doc, "showArchive"),
    "the owner's standard: boards that have gone can be selected");
  t("the build tag is the one the page loads", /v001e/.test(w.BUILD || ""), w.BUILD);
}

console.log("\n=== A round, played end to end ===");
{
  const { doc, w, srv, played, seasons } = await open();

  const click = (el) => el.dispatchEvent(new w.Event("click", { bubbles: true }));

  click(doc.getElementById("kickOff"));
  await settle(w);

  t("the game screen replaces the start screen", visible(doc, "screenGame"));
  t("a round was opened against this board's day",
    srv.calls.some((c) => c.pathname === "/api/quickfire/play" && c.body.date === "2026-09-14"));
  t("and the first question's clock was started by the server",
    srv.calls.some((c) => c.pathname === "/api/quickfire/next" && c.body.idx === 1),
    "the page does not decide when a question began");

  const options = () => [...doc.querySelectorAll("#options .option")];
  t("four options are drawn", options().length === 4, String(options().length));
  t("the clue is the server's", doc.getElementById("clue").textContent === "Question 1");
  t("and no option is the answer field, because there is no answer field",
    options().every((b) => b.textContent && b.textContent.length > 0));

  /* Play all eleven: right on the odd ones, wrong on the even. */
  let expectedCorrect = 0;
  for (let i = 1; i <= PER_DAILY; i++) {
    const want = (i % 2 === 1) ? "Right" + i : "Wrong" + i + "a";
    if (i % 2 === 1) expectedCorrect++;
    const btn = options().find((b) => b.textContent === want);
    if (!btn) { t(`question ${i} offered its options`, false, "no button matched " + want); break; }
    click(btn);
    await settle(w);
    /* INTER_QUESTION_MS is a real wait in the page; advance past it. */
    await settle(w, w.QFX_CONFIG.INTER_QUESTION_MS + 30);
  }

  t("every question was answered against the round",
    srv.round.answers.size === PER_DAILY, `${srv.round.answers.size} of ${PER_DAILY}`);
  t("each answer named the question it belonged to", (() => {
    const answers = srv.calls.filter((c) => c.pathname === "/api/quickfire/answer");
    return answers.length === PER_DAILY &&
      answers.every((c, i) => c.body.idx === i + 1);
  })(), "an off-by-one here is a whole board marked against the wrong clues");

  t("the results screen is reached", visible(doc, "screenResults"));
  t("the round was totalled by the server, not added up here",
    srv.calls.some((c) => c.pathname === "/api/quickfire/finish"));

  const shown = doc.getElementById("resultsBody").textContent;
  t("and it reports the server's count of correct answers",
    new RegExp(`${expectedCorrect}\\s*/\\s*${PER_DAILY}`).test(shown.replace(/\s+/g, " ")),
    `expected ${expectedCorrect}/${PER_DAILY}`);

  t("the breakdown shows what was PICKED, never the answer", (() => {
    /* The page cannot show the right answer to a question it got wrong,
       because it was never told it — and must not appear to. */
    return /Wrong2a/.test(shown) && !/Right2\b/.test(shown);
  })(), "a board somebody else has still to play");

  t("the result was banked under the family's key", (() => {
    const raw = w.localStorage.getItem("qfx.results.v1");
    if (!raw) return false;
    const rows = JSON.parse(raw);
    return rows.length === 1 && rows[0].day === "2026-09-14" && rows[0].game === "quickfire";
  })(), "QuickFire banked nothing at all until this rewrite");

  t("the season was told which day was played", seasons.includes("2026-09-14"));
  t("and the run was counted, start and end",
    played.some(([k]) => k === "start") && played.some(([k, v]) => k === "end" && v === true));
}

console.log("\n=== A substitution ===");
{
  const { doc, w, srv } = await open();
  const click = (el) => el.dispatchEvent(new w.Event("click", { bubbles: true }));
  click(doc.getElementById("kickOff"));
  await settle(w);

  const before = doc.getElementById("clue").textContent;
  click(doc.getElementById("passQuestion"));
  await settle(w);

  t("the question changes", doc.getElementById("clue").textContent !== before,
    `${before} -> ${doc.getElementById("clue").textContent}`);
  t("it comes off the bench", /^Bench/.test(doc.getElementById("clue").textContent));
  t("the slot does not advance — the Daily is still an XI",
    /^1 \/ 11$/.test(doc.getElementById("progress").textContent),
    doc.getElementById("progress").textContent);
  t("the substitution was spent on the server",
    srv.calls.some((c) => c.pathname === "/api/quickfire/sub") && srv.round.subsUsed === 1);
  t("and the new question's options are drawn",
    [...doc.querySelectorAll("#options .option")].length === 4);
}

console.log("\n=== Boards that have been ===");
{
  const { doc, w, srv } = await open();
  const click = (el) => el.dispatchEvent(new w.Event("click", { bubbles: true }));
  click(doc.getElementById("showArchive"));
  await settle(w);

  t("the archive screen opens", visible(doc, "screenArchive"));
  t("and it was fetched rather than assumed",
    srv.calls.some((c) => c.pathname === "/api/quickfire/archive"));
  const items = [...doc.querySelectorAll("#archiveList .archiveItem")];
  t("past boards are listed", items.length === 2, String(items.length));
  t("each is addressed by its number", /#b=20/.test(items[0].getAttribute("href")),
    items[0].getAttribute("href"));
  t("the list carries days and numbers and nothing else", (() => {
    /* An archive index is the easiest place in a game to publish tomorrow by
       accident. Nothing here may resemble a clue or an option. */
    const text = doc.getElementById("archiveList").textContent;
    return !/Question|Right|Wrong|Bench/.test(text);
  })(), "the word search published 233 unplayed boards this way");
}

console.log("\n=== A link from the old game ===");
{
  const { doc } = await open({ hash: "#x=AAAA" });
  t("an old challenge link does not break the page", visible(doc, "screenStart"));
  t("and says why it is showing today instead",
    !doc.getElementById("challengeNote").hidden &&
    /older version/i.test(doc.getElementById("challengeNote").textContent));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
