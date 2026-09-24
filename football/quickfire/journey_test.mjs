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
      if (body.idx < round.servedIdx) {
        return [400, { error: "that question has already been played", at: round.servedIdx }];
      }
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
        /* THE ANSWER COMES BACK ON A CLOCK THAT RAN OUT, as the endpoint
           does it. Re-applied here rather than rubber-stamped: a stub that
           returned whatever the page wanted would prove nothing. */
        return [200, { idx: body.idx, correct: false, points: 0, minute: 90, timedOut: true,
                       answer: answerOf(q.id) }];
      }
      if (!q.options.includes(body.pick)) return [400, { error: "that was not one of the options" }];
      const correct = body.pick === answerOf(q.id);
      const points = correct ? 100 : 0;
      round.answers.set(body.idx, points);
      /* AND ONLY WHEN THE PICK WAS WRONG. The same rule the endpoint keeps:
         a right pick already knows the answer, and a question that has not
         been settled is never told it at all. Written as the rule rather than
         as "always send it", so the page cannot pass by being handed more
         than production would hand it. */
      return [200, { idx: body.idx, correct, points, minute: round.minute,
                     penaltyMinutes: correct ? 0 : 5,
                     ...(correct ? {} : { answer: answerOf(q.id) }) }];
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
  /* opts.srv and opts.keep reopen the SAME round on a device that kept its
     save — the only way to test coming back to a game that is half played. */
  const srv = opts.srv || server(board, opts);

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
  /* A DEVICE THAT KEPT ITS SAVE, carried in explicitly. Separate JSDOM windows
     do NOT share localStorage here, whatever the note above assumed — the first
     resume block written against that assumption passed by starting a FRESH
     round (the stub reuses one round id) rather than by resuming, which proved
     the forward jump and not the resume. opts.storage is what the device had. */
  if (opts.storage) {
    for (const [k, v] of Object.entries(opts.storage)) w.localStorage.setItem(k, v);
  }

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
  /* DERIVED FROM THE PAGE, NOT PINNED. This read /v001e/ and went red the
     moment the tag moved — a test asserting a hardcoded version enforces the
     drift instead of catching it. What the assertion MEANS is that the script's
     BUILD and the page's ?v= agree, so it reads the page for the expected
     value. */
  const pageTag = (html.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1];
  t("the build tag is the one the page loads", !!pageTag && w.BUILD === pageTag,
    );
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

  /* WHAT A MISSED ROW SHOWS. This asserted the answer was NEVER on the card,
     on the reason that the page was never told it. The page IS told it now,
     for a question this round has settled and got wrong and for no other, so
     the old assertion was defending a limitation rather than a rule.
     The rule that survives is about WHICH answers: one the player answered and
     missed, never one they have not reached. */
  /* READ OFF THE ROW, NOT OUT OF THE FLATTENED TEXT. Written against `shown`
     first and it failed on a card that was correct: textContent runs the
     answer straight into the points column, so "Right2" arrives as "Right20"
     and a word boundary can never match. The same shape as the crossword's
     "3Current run" — a pattern looking for a value in concatenated text
     matches nothing however right the value is. */
  t("a missed row shows the pick AND what the answer was", (() => {
    const missed = [...doc.querySelectorAll("#resultsBody .breakdown li.missed")];
    const row = missed.find((li) => /Wrong2a/.test(li.textContent));
    const was = row && row.querySelector(".bdWas");
    return missed.length > 0 && !!was && was.textContent.includes("Right2");
  })(), "being marked wrong and not told why teaches nothing");
  t("and a scored row names no answer, having nothing to disclose", (() => {
    const hits = [...doc.querySelectorAll("#resultsBody .breakdown li.hit")];
    return hits.length > 0 && hits.every((li) => !li.querySelector(".bdWas"));
  })(), "the server sends an answer only for a settled, wrong question")

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
  /* By its OWN ADDRESS since 24 Sep 2026, /football/quickfire/daily/<no>, not
     #b=<no> and a reload on a timer: in the app's WebView the reload could
     land before the fragment and leave the page on today's board. See
     permalink_test.mjs, which proves the page reads that address. */
  t("each is addressed by its number", /\/football\/quickfire\/daily\/20$/.test(items[0].getAttribute("href")),
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

/* ---- coming back to a half-played round ------------------------------- */

/* THE BUG THESE EXIST FOR, found from the phone app on 23 Sep 2026: a player
   who left mid-question came back to "THAT DID NOT REACH US — TRY AGAIN" on
   every tap for the rest of the day. The page's saved question was behind the
   one the server had already stamped, the server rightly refused to rewind,
   and nothing moved either of them. */
const SAVE_KEY = (w) => Object.keys(w.localStorage).find((k) => /^qfx\.daily/.test(k));
const snapshot = (w) => {
  const out = {};
  for (let i = 0; i < w.localStorage.length; i++) {
    const k = w.localStorage.key(i);
    out[k] = w.localStorage.getItem(k);
  }
  return out;
};
const click = (w, el) => el.dispatchEvent(new w.Event("click", { bubbles: true }));
const pick = (p, want) => [...p.doc.querySelectorAll("#options .option")].find((b) => b.textContent === want);
const answer = async (p, want) => {
  click(p.w, pick(p, want));
  await settle(p.w);
  await settle(p.w, p.w.QFX_CONFIG.INTER_QUESTION_MS + 30);   // past the pause
};

console.log("\n=== Leaving mid-question and coming back ===");
{
  const first = await open();
  click(first.w, first.doc.getElementById("kickOff"));
  await settle(first.w);
  await answer(first, "Right1");
  await answer(first, "Right2");
  /* Question 3 is on screen and the server has stamped it. */
  t("PRECONDITION: the server is on question 3", first.srv.round.servedIdx === 3,
    String(first.srv.round.servedIdx));
  const key = SAVE_KEY(first.w);
  const saved = key ? JSON.parse(first.w.localStorage.getItem(key)) : null;
  t("the page saved question 3 BEFORE the server was told, so it cannot lag",
    !!saved && saved.index === 3, saved ? "saved index " + saved.index : "no save found");

  /* THE STUCK SHAPE, forced: the device one question behind the server, on
     question 2 with question 2 unanswered — as a save that never landed, or a
     round begun as a guest and resumed signed in, can leave it. The page will
     RESUME from this (index 2, a round id), not start afresh. */
  saved.index = 2;
  saved.results = saved.results.filter((r) => r.idx < 2);
  const device = snapshot(first.w);
  device[key] = JSON.stringify(saved);
  first.w.close();

  const back = await open({ srv: first.srv, storage: device });
  t("it offers to RESUME, at the question the device had",
    /Pick up at question 2 /.test(back.doc.getElementById("startBlurb").textContent),
    back.doc.getElementById("startBlurb").textContent);
  click(back.w, back.doc.getElementById("kickOff"));
  await settle(back.w);
  await settle(back.w);
  t("resuming behind the server does not strand the player",
    !/did not reach us/i.test(back.doc.getElementById("feedback").textContent),
    back.doc.getElementById("feedback").textContent || "no feedback");
  t("the page follows the server forward to question 3",
    back.doc.getElementById("clue").textContent === "Question 3",
    back.doc.getElementById("clue").textContent);
  t("and no second round was opened to get there",
    back.srv.calls.filter((c) => c.pathname === "/api/quickfire/play").length === 1);
  await answer(back, "Right3");
  t("and question 3 can be answered", back.srv.round.answers.has(3));
}

console.log("\n=== Answering, then leaving before the next question ===");
{
  const first = await open();
  click(first.w, first.doc.getElementById("kickOff"));
  await settle(first.w);
  click(first.w, pick(first, "Right1"));
  await settle(first.w);
  /* Leave NOW, in the pause after an answer and before question 2 is served.
     Closing the window stops its pause timer, which would otherwise serve
     question 2 on the shared server in the middle of this test. */
  const device = snapshot(first.w);
  first.w.close();
  const kept = (() => { const k = Object.keys(device).find((x) => /^qfx\.daily/.test(x)); return k ? JSON.parse(device[k]) : null; })();
  t("PRECONDITION: question 1 was answered and question 2 never served",
    first.srv.round.answers.has(1) && first.srv.round.servedIdx === 1 && !!kept,
    kept ? `saved index ${kept.index}, ${kept.results.length} result(s)` : "no save on the device");

  const back = await open({ srv: first.srv, storage: device });
  t("the resume offers question 2, not the one just answered",
    /Pick up at question 2 /.test(back.doc.getElementById("startBlurb").textContent),
    back.doc.getElementById("startBlurb").textContent);
  click(back.w, back.doc.getElementById("kickOff"));
  await settle(back.w);
  t("and serves question 2", back.doc.getElementById("clue").textContent === "Question 2",
    back.doc.getElementById("clue").textContent);
  t("without an error", !/did not reach us/i.test(back.doc.getElementById("feedback").textContent));
  t("and without opening a second round",
    back.srv.calls.filter((c) => c.pathname === "/api/quickfire/play").length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
