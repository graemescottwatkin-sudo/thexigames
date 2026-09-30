/* friends/wordsearch/journey_test.mjs — the Wordsearch XI: Friends page,
 * played through, against the REAL server code.
 *
 *   npm install -D jsdom --no-save
 *   node friends/wordsearch/journey_test.mjs      (from the repo root)
 *
 * THE PAYLOADS ARE THE PRODUCER'S. The page's fetch is routed into the actual
 * route handlers (functions/api/wordsearch_fr/*), and those run their real SQL
 * against migration 048 in node:sqlite — see fixture.mjs. Nothing the page
 * sees is a hand-written copy of what somebody thought the server sent, which
 * is how the Friends Who Am I page once shipped reading a clue field that did
 * not exist.
 *
 * A DRAG IS A DRAG. jsdom has no layout, so document.elementFromPoint is the
 * one thing stubbed: (x, y) is read as (column, row) and answers that square.
 * Everything after it — the pointer handlers, the line, the request, the
 * verdict — is the page's own code.
 */
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { clock, BOARDS, WORDS, freshEnv, call, ROUTES, ROOT, TODAY, YESTERDAY, LONG_AGO } from "./fixture.mjs";
import { LAUNCHED } from "../../functions/_lib/games.js";

const DIR = path.join(ROOT, "friends", "wordsearch");
const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const game = fs.readFileSync(path.join(DIR, "js", "game.js"), "utf8");
const scoring = fs.readFileSync(path.join(ROOT, "football", "wordsearch", "js", "scoring.js"), "utf8");
const fulltime = fs.readFileSync(path.join(ROOT, "shared", "xi-fulltime.js"), "utf8");

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

async function open(env, opts = {}) {
  const calls = [];
  const dom = new JSDOM(html, {
    url: "https://www.thexigames.com/friends/wordsearch/" + (opts.search || ""),
    runScripts: "outside-only", pretendToBeVisual: true,
  });
  const w = dom.window;
  /* ONE CLOCK for the page and the server: the fixture's. */
  w.Date.now = () => clock.now();
  if (opts.keep) for (const [k, v] of Object.entries(opts.keep)) w.localStorage.setItem(k, v);
  w.fetch = async (url, init) => {
    const u = new URL(String(url), "https://www.thexigames.com");
    const m = /^\/api\/wordsearch_fr\/([a-z]+)$/.exec(u.pathname);
    calls.push(u.pathname);
    if (!m || !ROUTES[m[1]]) {
      return { ok: false, status: 404, json: async () => ({ error: "not this game's" }), text: async () => "" };
    }
    const method = init && init.method ? init.method : "GET";
    const csrf = !!(init && init.headers && init.headers["X-XI-Games"] === "1");
    const r = await call(env, m[1], { method, query: u.search, csrf,
      body: init && init.body ? JSON.parse(init.body) : undefined });
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body, text: async () => r.text };
  };
  w.eval(scoring);
  w.eval(fulltime);
  w.eval(game);
  const $ = (id) => w.document.getElementById(id);
  const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0)); };
  await settle();
  const cells = () => [...w.document.querySelectorAll("#grid .cell")];
  w.document.elementFromPoint = (x, y) => cells()[y * 12 + x] || null;
  const pe = (type, r, c) => {
    const e = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: c, clientY: r });
    Object.defineProperty(e, "pointerId", { value: 1 });
    $("grid").dispatchEvent(e);
  };
  const drag = async (from, to) => { pe("pointerdown", ...from); pe("pointermove", ...to); pe("pointerup", ...to); await settle(); };
  const dragWord = (board, n) => {
    const pl = n === "bonus" ? board.bonus.placement : board.answers[n].placement;
    return drag([pl.start_row, pl.start_col], [pl.end_row, pl.end_col]);
  };
  const click = async (el) => { el.dispatchEvent(new w.Event("click", { bubbles: true })); await settle(); };
  const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const word = (n) => w.document.querySelector(`#wordList .word[data-n="${n}"]`);
  const store = () => Object.fromEntries(Object.keys(w.localStorage).map((k) => [k, w.localStorage.getItem(k)]));
  return { w, $, settle, drag, dragWord, click, text, word, calls, store, cells };
}
/* The answers of the fixture board, in the forms the page could show them. */
const ANSWERS = BOARDS.today.answers.map((a) => a.display).concat(["Lima"]);
const shows = (s) => ANSWERS.filter((a) => s.includes(a));

console.log("=== Today's board opens as clues ===");
let env = freshEnv();
let p = await open(env);
{
  t("the landing loads the day", p.calls.includes("/api/wordsearch_fr/daily"));
  await p.click(p.$("homeDaily"));
  const words = [...p.w.document.querySelectorAll("#wordList .word")];
  t("eleven clues in the list", words.length === 11, String(words.length));
  t("each is the SERVER'S clue text, numbered", p.text(words[0]).includes(BOARDS.today.answers[0].clue) &&
    p.text(words[0]).startsWith("1"), p.text(words[0]));
  t("the board's title is the server's", p.text(p.$("themeTitle")) === BOARDS.today.theme);
  t("the grid is drawn, 14 by 12", p.cells().length === 168);
  t("no answer is written anywhere in the list or the bonus box",
    shows(p.text(p.$("side"))).length === 0, shows(p.text(p.$("side"))).join(", ") || "none shown");
  t("the bonus shows its clue and its length",
    p.text(p.$("bonusState")) === BOARDS.today.bonus.clue && p.text(p.$("bonusSub")).startsWith("4 letters"));
  t("kick off told the server", p.calls.includes("/api/wordsearch_fr/round"));
}

console.log("\n=== A drag, judged by the server ===");
{
  await p.dragWord(BOARDS.today, 0);
  t("the drag was sent to the server, not judged here", p.calls.filter((c) => c.endsWith("/find")).length === 1);
  t("clue 1 is ticked off and now shows its answer", p.word(0).classList.contains("done") &&
    p.text(p.word(0)).includes("Alpha"), p.text(p.word(0)));
  t("the progress says one found", p.text(p.$("count")) === "1");
  t("and the line is drawn through the word", p.w.document.querySelectorAll("#highlightLayer .hl").length === 1);
  t("the next clue is the one written out", p.text(p.$("clueNow")).startsWith("2."), p.text(p.$("clueNow")));
  const before = p.text(p.$("clock"));
  await p.drag([13, 0], [13, 5]);
  /* THE POP IS SHOWN, not merely present: its text is "+1'" in the markup
     before any foul, so reading its text proves nothing (a first version did). */
  t("a wrong drag costs a minute, and says so", p.$("penaltyPop").classList.contains("show") &&
    p.text(p.$("clock")) === "1'" && before === "0'", `${before} -> ${p.text(p.$("clock"))}`);
  await p.dragWord(BOARDS.today, 3);
  t("a word written backwards is found", p.word(3).classList.contains("done"));
  t("still no answer shown for a clue not found", shows(p.text(p.word(5))).length === 0);
}

console.log("\n=== A reload resumes the same round ===");
{
  const kept = p.store();
  const q = await open(env, { keep: kept });
  await q.click(q.$("homeDaily"));
  t("the two found clues come back, with their answers",
    q.word(0).classList.contains("done") && q.word(3).classList.contains("done") && q.text(q.word(3)).includes("Delta"));
  t("under the same round id", q.store()["xifws.play." + TODAY] === kept["xifws.play." + TODAY]);
  const rows = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM fr_ws_round").get().n;
  t("and the server kept one round, not two", rows === 1, String(rows));
  p = q;
}

console.log("\n=== All eleven and the secret: full time ===");
{
  for (let n = 0; n < 11; n++) { clock.advance(8000); if (!p.word(n).classList.contains("done")) await p.dragWord(BOARDS.today, n); }
  t("PRECONDITION: all eleven are ticked", p.text(p.$("count")) === "11");
  t("the free thirty seconds for the secret start", p.$("finishPrompt").classList.contains("show"));
  await p.dragWord(BOARDS.today, "bonus");
  await p.settle();
  t("finding the secret ends the board", p.$("result").classList.contains("show"));
  const ft = p.text(p.$("ftPanel"));
  t("full time says 11 of 11 and the bonus", ft.includes("11 of 11 found") && ft.includes("Bonus +10"), ft.slice(0, 120));
  t("and the server verified it", ft.includes("Verified by the server"));
  const rec = JSON.parse(p.store()["xifws.results"] || "[]");
  t("the result is banked on the device, with day and finish time", rec.length === 1 && rec[0].day === TODAY &&
    typeof rec[0].at === "number" && rec[0].status === "complete", JSON.stringify(rec[0] || {}));
  const q = await open(env, { keep: p.store() });
  await q.click(q.$("homeDaily"));
  t("coming back to a finished daily shows the result, not a fresh board", q.$("result").classList.contains("show"));
  clock.reset();
}

console.log("\n=== Out of time: the answers are named ===");
{
  env = freshEnv();
  p = await open(env);
  await p.click(p.$("homeDaily"));
  await p.dragWord(BOARDS.today, 2);
  clock.advance(601000);
  await new Promise((r) => setTimeout(r, 400));   // one tick of the page's clock
  await p.settle();
  t("the whistle goes at ninety", p.$("result").classList.contains("show"));
  const det = p.w.document.querySelector("#ftPanel details");
  const said = p.text(det);
  t("each clue is named with its answer, once the server says the round is over",
    said.includes("1. ALPHA") && said.includes("11. KILO") && said.includes("Secret bonus: Lima"), said.slice(0, 160));
  clock.reset();
}

console.log("\n=== The schedule reloaded under a round ===");
{
  env = freshEnv();
  p = await open(env);
  await p.click(p.$("homeDaily"));
  const oldId = p.store()["xifws.play." + TODAY];
  env.DB.raw.prepare("UPDATE fr_ws_schedule SET puzzle_id = ? WHERE day = ?").run(BOARDS.never.id, TODAY);
  const q = await open(env, { keep: p.store() });
  await q.click(q.$("homeDaily"));
  t("PRECONDITION: the page now has the new board", q.text(q.$("themeTitle")) === BOARDS.never.theme);
  await q.dragWord(BOARDS.never, 4);
  const fouls = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM fr_ws_foul").get().n;
  t("a right drag on it is found, not called a foul", q.word(4).classList.contains("done") &&
    !q.$("penaltyPop").classList.contains("show") && fouls === 0, `${q.text(q.word(4))}; ${fouls} foul(s)`);
  t("because the page started a fresh round", q.store()["xifws.play." + TODAY] !== oldId);
}
{
  /* AND WHILE THE PAGE IS OPEN: it still shows the old board, so a drag must
     not be resent against the new one — the page swaps boards instead. */
  env = freshEnv();
  p = await open(env);
  await p.click(p.$("homeDaily"));
  env.DB.raw.prepare("UPDATE fr_ws_schedule SET puzzle_id = ? WHERE day = ?").run(BOARDS.never.id, TODAY);
  await p.dragWord(BOARDS.today, 1);
  const fouls = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM fr_ws_foul").get().n;
  t("a drag on the old board, after the change, costs nothing", fouls === 0 &&
    !p.$("penaltyPop").classList.contains("show"), fouls + " foul(s)");
  t("and the page opens the new board in its place, saying why",
    p.text(p.$("themeTitle")) === BOARDS.never.theme && p.text(p.$("toast")) === "Today's board has changed",
    p.text(p.$("themeTitle")));
  await p.dragWord(BOARDS.never, 2);
  t("where the next drag is judged normally", p.word(2).classList.contains("done"));
}

console.log("\n=== Free play judges on the page ===");
{
  env = freshEnv();
  p = await open(env, { search: "?b=" + BOARDS.yesterday.id });
  t("a shared board opens on its start card", !p.$("kickCover").classList.contains("hidden") &&
    p.text(p.$("kickTitle")) === BOARDS.yesterday.theme);
  await p.click(p.$("kickBtn"));
  const finds = p.calls.filter((c) => c.endsWith("/find")).length;
  await p.dragWord(BOARDS.yesterday, 6);
  t("a find in free play asks nobody", p.word(6).classList.contains("done") &&
    p.calls.filter((c) => c.endsWith("/find")).length === finds);
  t("and free play still shows no answer until it is found", shows(p.text(p.word(7))).length === 0);
  t("help is offered here, and not on the daily", !p.w.document.querySelector('#helpMenu [data-help="first"]').disabled);
  t("nothing is banked for a free-play board", !p.store()["xifws.results"]);
}

console.log("\n=== The landing's lists ===");
{
  env = freshEnv();
  p = await open(env);
  await p.click(p.$("homeThemed"));
  const rows = [...p.w.document.querySelectorAll("#catalogList .arch-row")];
  t("every board lists what the catalogue allows", rows.length === 3, rows.map((r) => r.getAttribute("data-id")).join(", "));
  await p.click(p.$("homePrevious"));
  const days = [...p.w.document.querySelectorAll("#archiveList .arch-row")];
  const want = [LONG_AGO, YESTERDAY].filter((d) => d >= LAUNCHED.wordsearch_fr && d < TODAY);
  t("previous dailies list the days since the launch and before today, or say the first day is today",
    days.length === want.length && days.every((d) => d.getAttribute("data-day") < TODAY) &&
      (want.length > 0 || /first day is today/.test(p.text(p.$("archiveList")))), want.length + " expected");
  const readable = p.text(p.w.document.body);
  t("nothing on the page reads 'undefined' or 'null'", !/\bundefined\b|\bnull\b/.test(readable));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
