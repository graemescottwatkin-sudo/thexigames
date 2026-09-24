/* tools/lock_test.mjs — the play screen does not scroll.
 *
 * THE RULING, 24 Sep 2026, the owner on the Play build: the game should "fit
 * on the screen in whole, much like the crossword, i.e. the screen is fixed,
 * so no scrolling needed" -- for every game, at every size ("even on larger
 * screens its not needed, just change the size of elements to scale up"), and
 * the player cards "always take up a consistent amount of the pitch".
 *
 * FIVE KINDS OF SCREEN. A PITCH (Scrambled, Vowels): eleven cards on a
 * formation. A QUIZ (QuickFire): a clue, four options and the controls, where
 * what varies is the length of the clue. A SLIDER (Ballpark): a question, a
 * value and a track, and after each lock a result that stands in for them. A
 * DUEL (HiLo): two faces and a call, with the settled calls piling up above
 * them in a panel that scrolls in itself. A CODEWORD: a square grid fitted to
 * the height that is left, a key, a keypad and the answers in a panel.
 *
 * WHAT IT PROVES FOR A PITCH, in real Chromium, on every sample board, at five
 * sizes (three of them touch, with the family's keyboard up):
 *   - the page is locked (body.locked) and the document does not scroll,
 *     either way;
 *   - no tile overlaps another, none spills off the pitch, and every tile is
 *     the same size;
 *   - on touch, the answer row sits above the keys rather than behind them;
 *   - Full Time is locked too, the result in its own panel;
 *   - and the one way out works: large text that cannot fit unlocks the page
 *     rather than cutting anything off, and relocks when it goes.
 *
 * WHAT IT REFUSES: a game directory that is in none of LOCKED, PENDING or
 * ELSEWHERE. A registry that a new game is simply absent from reports a pass
 * for the game it never reached.
 *
 * AND FOR A QUIZ, at the same five sizes, on a clue longer than any in the
 * bank: locked, no document scroll, the clue whole (never cut off), every
 * option and the controls on screen; a short clue the same; Full Time locked
 * with the result scrolling inside its panel; and the same way out.
 *
 * It serves the tree itself -- static files, and functions/api/<path>.js run
 * with env {} so Scrambled and Vowels fall back to their committed sample
 * boards, and QuickFire (which refuses to run on samples, by design) gets a
 * real SQLite built from the repo's migrations and seeded with made-up
 * questions by tools/lock_fixtures.mjs. So it needs Chromium and nothing else:
 * no wrangler, and nothing from production.
 *
 *   node tools/lock_test.mjs            (from the repo root; needs playwright)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const done = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };

let chromium;
try { ({ chromium } = await import("playwright")); } catch (e) { chromium = null; }
/* ABSENT IS NOT A PASS. */
if (!chromium) { t("playwright is available", false, "npm install -D playwright"); done(); }

/* ---- which games, and where each one's lock is proved -------------------- */
const LOCKED = {
  scrambled: { kind: "pitch", path: "/football/scrambled/", api: "/api/scrambled/daily", boards: [1, 2, 3, 4] },
  vowels: { kind: "pitch", path: "/football/vowels/", api: "/api/scrambled/daily", boards: [1, 2, 3, 4] },
  quickfire: { kind: "quiz", path: "/football/quickfire/" },
  ballpark: { kind: "slider", path: "/football/ballpark/" },
  hilo: { kind: "duel", path: "/football/hilo/" },
  codeword: { kind: "codeword", path: "/football/codeword/" },
};
/* Not locked yet, by name, so the list of what is left is a fact in the tree
   and not a memory. Moving a game from here to LOCKED is its whole test. */
const PENDING = {
  "football/wordsearch": true,
  "football/grid": true,
  "football/whoami": true, "friends/whoami": true,
};
/* Locked already, and measured by their own browser suite. */
const ELSEWHERE = {
  "football/crossword": "football/crossword/render_test.mjs",
  "friends/crossword": "football/crossword/render_test.mjs",
};

console.log("The roster");
{
  const dirs = [];
  for (const theme of ["football", "friends"]) {
    for (const g of fs.readdirSync(path.join(ROOT, theme))) {
      if (fs.existsSync(path.join(ROOT, theme, g, "deploy_check.mjs"))) dirs.push(theme + "/" + g);
    }
  }
  const locked = Object.values(LOCKED).map((g) => g.path.replace(/^\/|\/$/g, ""));
  const known = new Set([...locked, ...Object.keys(PENDING), ...Object.keys(ELSEWHERE)]);
  const missing = dirs.filter((d) => !known.has(d));
  const stale = [...known].filter((d) => !dirs.includes(d));
  t("the walk found the games (a walk that finds nothing passes everything)", dirs.length >= 10, dirs.length + " games");
  t("every game is locked, pending or proved elsewhere", missing.length === 0, missing.join(", ") || "all placed");
  t("and nothing is listed that does not exist", stale.length === 0, stale.join(", ") || "none");
  const both = locked.filter((d) => PENDING[d] || ELSEWHERE[d]);
  t("and no game is in two lists at once", both.length === 0, both.join(", ") || "none");
}

/* ---- the server ----------------------------------------------------------- */
const { quickfireEnv, codewordRawBoard } = await import(pathToFileURL(path.join(ROOT, "tools", "lock_fixtures.mjs")).href);
const { publicBoard: cwPublic } = await import(pathToFileURL(path.join(ROOT, "functions", "_lib", "cw-board.js")).href);
/* Codeword refuses to run without a database, and its round endpoints write
   to one, so the board is the fixture through the real publicBoard() and the
   round is answered here -- the shapes are the ones its own journey suite
   (football/codeword/round_test.mjs) answers with. Layout is what is under
   test, not the round. */
function codewordStub(what, body) {
  if (what === "daily") return { board: cwPublic(codewordRawBoard(21, utcDay())) };
  if (what === "play") return { playId: "lock-1", startedMs: Date.now(), rate: 3, scored: true, subsLeft: 3 };
  if (what === "mark") return body && body.check ? { wrong: [], spentMinutes: 5 } : { solved: [] };
  if (what === "reveal") return { letter: "A", subsLeft: 2, spentMinutes: 7, charged: true };
  if (what === "finish") return { score: 100, result: "W" };
  return {};
}
const { utcDay } = await import(pathToFileURL(path.join(ROOT, "functions", "_lib", "daily.js")).href);
/* One reading of the day, handed to the fixture and (through the real
   functions) to the page, so the two cannot disagree across midnight. */
const QF_ENV = await quickfireEnv(utcDay());
const envFor = (p) => (p.startsWith("/api/quickfire/") ? QF_ENV : {});
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff2": "font/woff2" };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const p = decodeURIComponent(url.pathname);
  try {
    if (p.startsWith("/api/codeword/")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      let body = {};
      try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; } catch (e) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(codewordStub(p.slice("/api/codeword/".length).split("/")[0], body)));
    }
    if (p.startsWith("/api/")) {
      const file = path.join(ROOT, "functions", p.replace(/\/$/, "") + ".js");
      if (!fs.existsSync(file)) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end("{}"); }
      const mod = await import(pathToFileURL(file).href);
      const fn = mod["onRequest" + req.method[0] + req.method.slice(1).toLowerCase()] || mod.onRequest;
      if (!fn) { res.writeHead(405); return res.end(); }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url.href, { method: req.method, headers: req.headers,
        body: req.method === "GET" || req.method === "HEAD" || !chunks.length ? undefined : Buffer.concat(chunks) });
      const out = await fn({ request, env: envFor(p), params: {}, waitUntil() {}, next() {} });
      res.writeHead(out.status, Object.fromEntries(out.headers));
      return res.end(Buffer.from(await out.arrayBuffer()));
    }
    let file = path.join(ROOT, p);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = "http://127.0.0.1:" + server.address().port;

/* ---- the measurement, taken in the page ----------------------------------- */
function measure() {
  const rect = (el) => el.getBoundingClientRect();
  const pitch = document.getElementById("pitch");
  const box = rect(pitch);
  const all = [...pitch.querySelectorAll(".slot")];
  /* The tile being read may grow -- it carries clubs or a career -- and is
     drawn over its row on purpose. It must stay on the pitch; it is not held
     to the one size or to the no-overlap rule. */
  const flat = all.filter((e) => !e.querySelector(".clubs, .hint")).map(rect);
  let overlaps = 0;
  flat.forEach((a, i) => flat.forEach((b, j) => {
    if (j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++;
  }));
  const spill = all.map(rect).filter((a) => a.left < box.left - 1 || a.right > box.right + 1 || a.top < box.top - 1 || a.bottom > box.bottom + 1).length;
  /* A card that cannot hold its name, which neither of the two above can see:
     every card is one height with its overflow hidden, so text too large for
     it is cut off inside the card rather than spilling. */
  const clipped = all.filter((e) => !e.querySelector(".clubs, .hint")).filter((e) => {
    const name = e.querySelector(".letters");
    return e.scrollHeight > e.clientHeight + 1 || (name && name.scrollWidth > name.clientWidth + 1);
  }).length;
  const w = flat.map((r) => r.width), h = flat.map((r) => r.height);
  const osk = document.getElementById("osk");
  const oskBox = osk && getComputedStyle(osk).display !== "none" ? rect(osk) : null;
  const entry = document.querySelector("#screenGame .entry");
  const results = document.getElementById("screenResults");
  return {
    locked: document.body.classList.contains("locked"),
    fulltime: document.body.classList.contains("fulltime"),
    scrollY: document.documentElement.scrollHeight - innerHeight,
    scrollX: document.documentElement.scrollWidth - innerWidth,
    tiles: all.length, overlaps, spill, clipped,
    spread: flat.length ? [Math.max(...w) - Math.min(...w), Math.max(...h) - Math.min(...h)] : [0, 0],
    tile: flat.length ? Math.round(w[0]) + "x" + Math.round(h[0]) : "-",
    pitchH: Math.round(box.height),
    osk: oskBox ? Math.round(oskBox.top) : null,
    entryBottom: entry && getComputedStyle(entry).display !== "none" ? Math.round(rect(entry).bottom) : null,
    results: results && !results.hidden ? [Math.round(rect(results).top), Math.round(rect(results).bottom)] : null,
    vh: innerHeight,
  };
}

const VIEWPORTS = [
  ["phone-360", { width: 360, height: 640 }, true],
  ["phone-412", { width: 412, height: 860 }, true],
  ["tablet", { width: 768, height: 1024 }, true],
  ["desktop", { width: 1440, height: 900 }, false],
  ["wide", { width: 1920, height: 1080 }, false],
];

const browser = await chromium.launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(game, board, [name, viewport, touch]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  /* The board, pinned: the sample the day would pick depends on the date, and
     a check whose board changes with the calendar passes or fails by date. */
  await page.route("**" + game.api + "*", (route) => {
    const u = new URL(route.request().url());
    u.searchParams.set("no", String(board));
    route.continue({ url: u.href });
  });
  await page.goto(ORIGIN + game.path, { waitUntil: "networkidle" });
  await page.click("#homeDaily");
  await page.waitForSelector("#pitch .slot", { timeout: 10000 });
  await wait(400);
  return { page, context };
}

/* THE OLD-LINK BANNER, on a locked screen and off one. It is the shared
   chrome's, inserted under the bar when a page is opened at an old board, and
   every pixel of it is a pixel the board does not get: as a sentence it took
   114px of a 412x860 phone. Locked, it must be one line with the short
   wording; on a page that scrolls, the sentence. Raised here through the
   chrome's own public call, exactly as each game raises it. */
async function bannerCheck(page, gameId, label, okFn, sayFn, measureFn) {
  const b = await page.evaluate(async (g) => {
    window.XIChrome.permalink.aged(g, 4);
    dispatchEvent(new Event("resize"));
    await new Promise((r) => setTimeout(r, 400));
    const box = document.querySelector(".xic-aged");
    const vis = (sel) => { const e = box && box.querySelector(sel); return !!e && getComputedStyle(e).display !== "none"; };
    return { there: !!box, h: box ? Math.round(box.getBoundingClientRect().height) : 0,
      short: vis(".xic-aged-short"), long: vis(".xic-aged-long"),
      text: box ? (box.querySelector(".xic-aged-short") || {}).textContent : "" };
  }, gameId);
  const m = await page.evaluate(measureFn);
  t(`${label}: an old-link banner on the locked screen is one short line, and the screen still fits`,
    b.there && b.short && !b.long && b.h <= 50 && /4 days old/.test(b.text || "") && okFn(m), JSON.stringify(b) + " | " + sayFn(m));
}
async function bannerOffLock(page, gameId, label) {
  const b = await page.evaluate(async (g) => {
    window.XIChrome.permalink.aged(g, 4);
    await new Promise((r) => setTimeout(r, 200));
    const box = document.querySelector(".xic-aged");
    const vis = (sel) => { const e = box && box.querySelector(sel); return !!e && getComputedStyle(e).display !== "none"; };
    return { locked: document.body.classList.contains("locked"), short: vis(".xic-aged-short"), long: vis(".xic-aged-long") };
  }, gameId);
  t(`${label}: and on the landing, which scrolls, it is the full sentence`, !b.locked && b.long && !b.short, JSON.stringify(b));
}

/* HOW TO PLAY, MID-GAME. The bar's link goes to #how, which a locked screen
   hides with the rest of the landing -- so it did nothing mid-game until it
   opened as a panel over the game. It must open inside the screen, leave the
   page unscrolled and locked under it, and close again from its own link. */
async function howCheck(page, label) {
  const opened = await page.evaluate(async () => {
    location.hash = "#how";
    await new Promise((r) => setTimeout(r, 250));
    const h = document.getElementById("how"), r = h.getBoundingClientRect();
    return { shown: getComputedStyle(h).display !== "none", top: Math.round(r.top), bottom: Math.round(r.bottom),
      vh: innerHeight, back: !!h.querySelector(".how-back") && getComputedStyle(h.querySelector(".how-back")).display !== "none",
      locked: document.body.classList.contains("locked"), scroll: document.documentElement.scrollHeight - innerHeight };
  });
  t(`${label}: "How to play" opens over the locked game, inside the screen, with a way back`,
    opened.shown && opened.top >= 0 && opened.bottom <= opened.vh + 1 && opened.back && opened.locked && opened.scroll <= 1,
    JSON.stringify(opened));
  const closed = await page.evaluate(async () => {
    document.querySelector("#how .how-back").click();
    await new Promise((r) => setTimeout(r, 250));
    return { shown: getComputedStyle(document.getElementById("how")).display !== "none",
      locked: document.body.classList.contains("locked") };
  });
  t(`${label}: and "Back to the game" closes it`, !closed.shown && closed.locked, JSON.stringify(closed));
}

const ok = (m) => m.locked && m.scrollY <= 1 && m.scrollX <= 1 && m.overlaps === 0 && m.spill === 0 && m.clipped === 0
  && m.spread[0] <= 1 && m.spread[1] <= 1;
const say = (m) => `locked ${m.locked}, scroll ${m.scrollY}/${m.scrollX}, overlaps ${m.overlaps}, spill ${m.spill}, clipped ${m.clipped}, tile ${m.tile} (spread ${m.spread}), pitch ${m.pitchH}`;

/* LOCK_ONLY=<id> narrows a run to one game, for proving a sabotage fast. */
const ONLY = process.env.LOCK_ONLY || "";
for (const [id, game] of Object.entries(LOCKED).filter(([k, g]) => g.kind === "pitch" && (!ONLY || k === ONLY))) {
  console.log(`\n${id}: in play`);
  for (const vp of VIEWPORTS) {
    for (const board of game.boards) {
      const { page, context } = await open(game, board, vp);
      const m = await page.evaluate(measure);
      t(`${vp[0]} board ${board}: locked, no scroll, eleven tiles of one size, none overlapping or off the pitch`,
        ok(m) && m.tiles === 11, say(m));
      if (vp[2]) {
        t(`${vp[0]} board ${board}: the keys are up and the answer row sits above them`,
          m.osk !== null && m.entryBottom !== null && m.entryBottom <= m.osk + 1, `entry ${m.entryBottom}, keys ${m.osk}`);
      }
      await context.close();
    }
  }

  console.log(`\n${id}: typing, and the bench`);
  for (const vp of [VIEWPORTS[0], VIEWPORTS[1]]) {
    const { page, context } = await open(game, 1, vp);
    const bench = await page.$eval("#benchRow", (b) => ({ hidden: b.hidden, shown: getComputedStyle(b).display !== "none" }));
    t(`${vp[0]}: a hidden bench is not drawn (display:flex once beat [hidden] here)`,
      bench.hidden && !bench.shown, JSON.stringify(bench));
    /* Letters a tile can supply, typed one at a time as a player would: the
       lifted line fills on the tiles that could hold them, and the page must
       not unlock under the player's thumb. */
    const word = await page.$eval("#pitch .slot .letters", (e) => e.textContent.replace(/[^A-Z]/g, "").slice(0, 4));
    for (const ch of word) { await page.type("#answer", ch); await wait(80); }
    await wait(300);
    const m = await page.evaluate(measure);
    t(`${vp[0]}: typing "${word}" keeps the page locked and every card whole`, ok(m), say(m));
    await context.close();
  }

  console.log(`\n${id}: the old-link banner`);
  for (const vp of [VIEWPORTS[0], VIEWPORTS[1]]) {
    const { page, context } = await open(game, 1, vp);
    await bannerCheck(page, id, vp[0], ok, say, measure);
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: VIEWPORTS[1][1], hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto(ORIGIN + game.path, { waitUntil: "networkidle" });
    await bannerOffLock(page, id, VIEWPORTS[1][0]);
    await context.close();
  }
  {
    const { page, context } = await open(game, 1, VIEWPORTS[1]);
    await howCheck(page, VIEWPORTS[1][0]);
    await context.close();
  }

  console.log(`\n${id}: the way out, and back`);
  {
    const { page, context } = await open(game, 1, VIEWPORTS[1]);
    const big = await page.evaluate(async (m) => {
      const st = document.createElement("style");
      st.id = "lock-test-big";
      st.textContent = ".slot .pos,.slot .enum{font-size:40px!important}.slot .letters{font-size:60px!important;min-width:200px}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 300));
      return document.body.classList.contains("locked");
    });
    t("text too large to fit unlocks the page rather than cutting it off", big === false, "locked " + big);
    const back = await page.evaluate(async () => {
      document.getElementById("lock-test-big").remove();
      dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 300));
      return document.body.classList.contains("locked");
    });
    t("and relocks when it goes", back === true, "locked " + back);
    await context.close();
  }

  console.log(`\n${id}: Full Time`);
  for (const vp of [VIEWPORTS[1], VIEWPORTS[3]]) {
    const { page, context } = await open(game, 1, vp);
    page.on("dialog", (d) => d.accept());
    for (let i = 0; i < 11; i++) {
      const open = await page.$$eval("#pitch .slot:not(.solved):not(.given)", (els) => els.map((e) => e.dataset.slot));
      if (!open.length) break;
      await page.click(`#pitch .slot[data-slot="${open[0]}"]`);
      await page.click("#buyName");
      await wait(250);
    }
    await wait(600);
    const m = await page.evaluate(measure);
    t(`${vp[0]}: Full Time is locked, the board stays and nothing scrolls`,
      m.fulltime && ok(m), say(m));
    t(`${vp[0]}: and the result is a panel inside the screen`,
      !!m.results && m.results[0] >= 0 && m.results[1] <= m.vh + 1, JSON.stringify(m.results));
    await context.close();
  }
}

/* ---- a quiz ---------------------------------------------------------------- */
function measureQuiz() {
  const rect = (e) => e.getBoundingClientRect();
  const game = document.getElementById("screenGame");
  const clue = document.getElementById("clue");
  const vis = (e) => e && getComputedStyle(e).display !== "none";
  const offscreen = [...document.querySelectorAll("#options .option, #passQuestion, .scoreCluster, .matchHead")]
    .filter(vis).filter((e) => { const r = rect(e); return r.top < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1; }).length;
  const results = document.getElementById("screenResults");
  /* THE SCREEN IS FILLED. Locked is not the same as fitted: the first build
     locked the page with the clue held at its own height, and a quarter of a
     phone sat empty under the score (seen on the Play build, 24 Sep 2026). */
  const cluster = document.querySelector("#screenGame .scoreCluster");
  const deadSpace = !game.hidden && cluster ? Math.round(rect(game).bottom - rect(cluster).bottom) : 0;
  return {
    locked: document.body.classList.contains("locked"),
    fulltime: document.body.classList.contains("fulltime"),
    scrollY: document.documentElement.scrollHeight - innerHeight,
    scrollX: document.documentElement.scrollWidth - innerWidth,
    deadSpace,
    clueCut: !game.hidden && clue.scrollHeight > clue.clientHeight + 1,
    screenCut: !game.hidden && game.scrollHeight > game.clientHeight + 1,
    clueLen: clue.textContent.length, clueSize: getComputedStyle(clue).fontSize,
    options: document.querySelectorAll("#options .option").length,
    optionSize: vis(document.querySelector(".option")) ? getComputedStyle(document.querySelector(".option")).fontSize : "-",
    optionH: vis(document.querySelector(".option")) ? Math.round(rect(document.querySelector(".option")).height) : 0,
    offscreen,
    results: results && !results.hidden ? [Math.round(rect(results).top), Math.round(rect(results).bottom), results.scrollHeight > results.clientHeight] : null,
    vh: innerHeight,
  };
}
const quizOk = (m) => m.locked && m.scrollY <= 1 && m.scrollX <= 1 && !m.clueCut && !m.screenCut && m.offscreen === 0 && m.options === 4
  && m.deadSpace <= 24;
const quizSay = (m) => `locked ${m.locked}, scroll ${m.scrollY}/${m.scrollX}, clue ${m.clueLen} chars at ${m.clueSize}${m.clueCut ? " CUT" : ""}, options ${m.options} at ${m.optionSize} (${m.optionH}px), off screen ${m.offscreen}, empty below ${m.deadSpace}px${m.screenCut ? ", screen overflows" : ""}`;

async function openQuiz(game, [name, viewport, touch]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(ORIGIN + game.path, { waitUntil: "networkidle" });
  await page.click("#kickOff");
  await page.waitForSelector("#options .option", { timeout: 10000 });
  await wait(500);
  return { page, context };
}
/* Answer the question on screen and wait for the next one (or Full Time). */
async function answerOne(page) {
  const before = await page.$eval("#progress", (e) => e.textContent);
  await page.click("#options .option:not([disabled])");
  await page.waitForFunction((b) => !document.getElementById("screenResults").hidden ||
    (document.getElementById("progress").textContent !== b && document.querySelector("#options .option:not([disabled])")), before, { timeout: 15000 });
  await wait(300);
}

for (const [id, game] of Object.entries(LOCKED).filter(([k, g]) => g.kind === "quiz" && (!ONLY || k === ONLY))) {
  console.log(`\n${id}: in play`);
  for (const vp of VIEWPORTS) {
    const { page, context } = await openQuiz(game, vp);
    const long = await page.evaluate(measureQuiz);
    t(`${vp[0]}: the longest clue -- locked, no scroll, clue whole, four options and the controls on screen`,
      quizOk(long) && long.clueLen >= 140, quizSay(long));
    /* The next question, shorter, on the same screen: the clue's size is set
       afresh per question, not left at whatever the long one needed. */
    await answerOne(page);
    const next = await page.evaluate(measureQuiz);
    t(`${vp[0]}: the next, shorter clue -- the same, and no smaller than the long one`,
      quizOk(next) && next.clueLen < long.clueLen && parseFloat(next.clueSize) >= parseFloat(long.clueSize), quizSay(next));
    await context.close();
  }

  console.log(`\n${id}: the old-link banner`);
  for (const vp of [VIEWPORTS[0], VIEWPORTS[1]]) {
    const { page, context } = await openQuiz(game, vp);
    await bannerCheck(page, id, vp[0], quizOk, quizSay, measureQuiz);
    await context.close();
  }

  console.log(`\n${id}: the way out, and back`);
  {
    const { page, context } = await openQuiz(game, VIEWPORTS[1]);
    const big = await page.evaluate(async () => {
      const st = document.createElement("style");
      st.id = "lock-test-big";
      st.textContent = ".option{font-size:44px!important;padding:40px!important}.clue{min-height:500px!important}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 400));
      return document.body.classList.contains("locked");
    });
    t("a question too large to fit unlocks the page rather than cutting it off", big === false, "locked " + big);
    const back = await page.evaluate(async () => {
      document.getElementById("lock-test-big").remove();
      dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 400));
      return document.body.classList.contains("locked");
    });
    t("and relocks when it goes", back === true, "locked " + back);
    /* THE FIT, made to work. The longest clue in the fixture fits at its
       stylesheet size at every size above, so none of those checks needs the
       shrink at all. Here the clue starts far too big for its box: the page
       must bring it down until it is whole, and stay locked while it does. */
    const fitted = await page.evaluate(async () => {
      const st = document.createElement("style");
      st.id = "lock-test-huge-clue";
      st.textContent = "body.locked .clue{font-size:72px}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 400));
      const c = document.getElementById("clue");
      return { locked: document.body.classList.contains("locked"), cut: c.scrollHeight > c.clientHeight + 1,
        size: parseFloat(getComputedStyle(c).fontSize) };
    });
    t("a clue too big for its box is brought down until it is whole, and the page stays locked",
      fitted.locked && !fitted.cut && fitted.size < 72, JSON.stringify(fitted));
    await context.close();
  }

  console.log(`\n${id}: Full Time`);
  for (const vp of [VIEWPORTS[1], VIEWPORTS[3]]) {
    const { page, context } = await openQuiz(game, vp);
    for (let i = 0; i < 11; i++) {
      if (!(await page.$eval("#screenResults", (e) => e.hidden))) break;
      await answerOne(page);
    }
    await wait(500);
    const m = await page.evaluate(measureQuiz);
    t(`${vp[0]}: Full Time is locked and the page does not scroll`,
      m.fulltime && m.locked && m.scrollY <= 1 && m.scrollX <= 1, `fulltime ${m.fulltime}, locked ${m.locked}, scroll ${m.scrollY}/${m.scrollX}`);
    t(`${vp[0]}: and the result is a panel inside the screen, scrolling in itself`,
      !!m.results && m.results[0] >= 0 && m.results[1] <= m.vh + 1, JSON.stringify(m.results));
    await context.close();
  }
}

/* ---- a slider ------------------------------------------------------------- */
function measureSlider() {
  const rect = (e) => e.getBoundingClientRect();
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== "none";
  const stage = document.querySelector("#screenGame .stage");
  const q = document.getElementById("q");
  const offscreen = [...document.querySelectorAll("#lock, #next, #narrow, #track, .board, #result")]
    .filter(vis).filter((e) => { const r = rect(e); return r.top < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1; }).length;
  /* THE STAGE IS FILLED: what is below its last visible child is dead space. */
  const kids = [...stage.children].filter(vis);
  const last = kids.length ? Math.max(...kids.map((e) => rect(e).bottom)) : rect(stage).top;
  const pad = parseFloat(getComputedStyle(stage).paddingBottom) || 0;
  const ftCard = document.querySelector("#ft .ftCard");
  return {
    locked: document.body.classList.contains("locked"),
    scrollY: document.documentElement.scrollHeight - innerHeight,
    scrollX: document.documentElement.scrollWidth - innerWidth,
    qCut: q.scrollHeight > q.clientHeight + 1,
    stageCut: stage.scrollHeight > stage.clientHeight + 1,
    qLen: q.textContent.length, qSize: getComputedStyle(q).fontSize,
    offscreen,
    deadSpace: Math.round(rect(stage).bottom - pad - last),
    result: vis(document.getElementById("result")),
    ft: vis(document.getElementById("ft")) && ftCard ? [Math.round(rect(ftCard).top), Math.round(rect(ftCard).bottom)] : null,
    vh: innerHeight,
  };
}
const sliderOk = (m) => m.locked && m.scrollY <= 1 && m.scrollX <= 1 && !m.qCut && !m.stageCut && m.offscreen === 0 && m.deadSpace <= 24;
const sliderSay = (m) => `locked ${m.locked}, scroll ${m.scrollY}/${m.scrollX}, question ${m.qLen} chars at ${m.qSize}${m.qCut ? " CUT" : ""}${m.stageCut ? ", stage overflows" : ""}, off screen ${m.offscreen}, empty below ${m.deadSpace}px`;

/* THE LONGEST QUESTION, made longer. The bank's longest question plus detail
   is 274 characters (measured 24 Sep 2026); the samples stop at 215. The
   first question of the board is padded to 290, in the response the page
   reads, so the lock is proved on something harder than a player is served. */
const PAD = " And a clause more, to make the question longer than any in the bank so far.";
async function openSlider(game, [name, viewport, touch]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.route("**/api/ballpark/daily*", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    const q = body && body.board && body.board.questions && body.board.questions[0];
    if (q) {
      while ((q.question + (q.detail || "")).length < 290) q.question += PAD;
      q.question = q.question.slice(0, 290 - (q.detail || "").length);
    }
    await route.fulfill({ response: res, json: body });
  });
  await page.goto(ORIGIN + game.path, { waitUntil: "networkidle" });
  await page.click("#homeDaily");
  await page.waitForFunction(() => (document.getElementById("q").textContent || "").length > 20, null, { timeout: 10000 });
  await wait(500);
  return { page, context };
}
/* A guess and the lock, as a player makes them: the slider moved, then Lock
   it in, then the result. */
async function guessAndLock(page) {
  await page.evaluate(() => {
    const s = document.getElementById("slider");
    s.value = String(Math.round((Number(s.min) + Number(s.max)) / 2));
    s.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() => !document.getElementById("lock").disabled, null, { timeout: 5000 });
  await page.click("#lock");
  await page.waitForFunction(() => !document.getElementById("result").hidden || !document.getElementById("ft").hidden, null, { timeout: 10000 });
  await wait(400);
}

for (const [id, game] of Object.entries(LOCKED).filter(([k, g]) => g.kind === "slider" && (!ONLY || k === ONLY))) {
  console.log(`\n${id}: in play`);
  for (const vp of VIEWPORTS) {
    const { page, context } = await openSlider(game, vp);
    const before = await page.evaluate(measureSlider);
    t(`${vp[0]}: a question past the bank's longest -- locked, no scroll, question whole, the track and the buttons on screen`,
      sliderOk(before) && before.qLen >= 285, sliderSay(before));
    await guessAndLock(page);
    const after = await page.evaluate(measureSlider);
    t(`${vp[0]}: after the lock, the result fits the same screen with the question still whole`,
      sliderOk(after) && after.result, sliderSay(after));
    await context.close();
  }

  console.log(`\n${id}: the old-link banner`);
  for (const vp of [VIEWPORTS[0], VIEWPORTS[1]]) {
    const { page, context } = await openSlider(game, vp);
    await bannerCheck(page, id, vp[0], sliderOk, sliderSay, measureSlider);
    await context.close();
  }
  {
    const { page, context } = await openSlider(game, VIEWPORTS[1]);
    await howCheck(page, VIEWPORTS[1][0]);
    await context.close();
  }

  console.log(`\n${id}: the way out, and back`);
  {
    const { page, context } = await openSlider(game, VIEWPORTS[1]);
    const big = await page.evaluate(async () => {
      const st = document.createElement("style");
      st.id = "lock-test-big";
      st.textContent = ".q small{font-size:60px!important}.big span{font-size:120px!important}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 400));
      return document.body.classList.contains("locked");
    });
    t("a question too large to fit unlocks the page rather than cutting it off", big === false, "locked " + big);
    const back = await page.evaluate(async () => {
      document.getElementById("lock-test-big").remove();
      dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 400));
      return document.body.classList.contains("locked");
    });
    t("and relocks when it goes", back === true, "locked " + back);
    const fitted = await page.evaluate(async () => {
      const st = document.createElement("style");
      st.textContent = "body.locked .q{font-size:64px}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 400));
      const q = document.getElementById("q");
      return { locked: document.body.classList.contains("locked"), cut: q.scrollHeight > q.clientHeight + 1,
        size: parseFloat(getComputedStyle(q).fontSize) };
    });
    t("a question too big for its space is brought down until it is whole, and the page stays locked",
      fitted.locked && !fitted.cut && fitted.size < 64, JSON.stringify(fitted));
    await context.close();
  }

  console.log(`\n${id}: Full Time`);
  for (const vp of [VIEWPORTS[1], VIEWPORTS[3]]) {
    const { page, context } = await openSlider(game, vp);
    for (let i = 0; i < 11; i++) {
      if (await page.$eval("#ft", (e) => !e.hidden)) break;
      await guessAndLock(page);
      if (await page.$eval("#ft", (e) => !e.hidden)) break;
      await page.click("#next");
      await page.waitForFunction(() => document.getElementById("result").hidden || !document.getElementById("ft").hidden, null, { timeout: 10000 });
      await wait(300);
    }
    await wait(500);
    const m = await page.evaluate(measureSlider);
    t(`${vp[0]}: Full Time is locked, the page does not scroll, and the card is inside the screen`,
      m.locked && m.scrollY <= 1 && m.scrollX <= 1 && !!m.ft && m.ft[0] >= 0 && m.ft[1] <= m.vh + 1, sliderSay(m) + " | card " + JSON.stringify(m.ft));
    await context.close();
  }
}

/* ---- a duel --------------------------------------------------------------- */
function measureDuel() {
  const rect = (e) => e.getBoundingClientRect();
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== "none";
  const stage = document.querySelector("#screenGame .stage");
  const rows = document.getElementById("rows");
  const live = document.getElementById("live");
  const r = rect(rows);
  const liveBox = vis(live) ? rect(live) : null;
  const offscreen = [...document.querySelectorAll("#higher, #lower, #live, .dug .card:first-child")]
    .filter(vis).filter((e) => { const b = rect(e); return b.top < -1 || b.bottom > innerHeight + 1 || b.right > innerWidth + 1; }).length;
  const kids = [...stage.children].filter(vis);
  const last = kids.length ? Math.max(...kids.map((e) => rect(e).bottom)) : rect(stage).top;
  const pad = parseFloat(getComputedStyle(stage).paddingBottom) || 0;
  const results = document.getElementById("screenResults");
  const who = document.querySelector("#live .who");
  return {
    locked: document.body.classList.contains("locked"),
    fulltime: document.body.classList.contains("fulltime"),
    scrollY: document.documentElement.scrollHeight - innerHeight,
    scrollX: document.documentElement.scrollWidth - innerWidth,
    stageCut: stage.scrollHeight > stage.clientHeight + 1,
    /* The live pair whole inside its panel: not scrolled past, not cut. */
    liveWhole: !liveBox || (liveBox.top >= r.top - 1 && liveBox.bottom <= r.bottom + 1),
    liveH: liveBox ? Math.round(liveBox.height) : 0,
    whoSize: who ? getComputedStyle(who).fontSize : "-",
    settled: document.querySelectorAll("#rows .duel.settled").length,
    offscreen,
    deadSpace: Math.round(rect(stage).bottom - pad - last),
    results: vis(results) ? [Math.round(rect(results).top), Math.round(rect(results).bottom)] : null,
    vh: innerHeight,
  };
}
const duelOk = (m) => m.locked && m.scrollY <= 1 && m.scrollX <= 1 && !m.stageCut && m.liveWhole && m.offscreen === 0 && m.deadSpace <= 24;
const duelSay = (m) => `locked ${m.locked}, scroll ${m.scrollY}/${m.scrollX}${m.stageCut ? ", stage overflows" : ""}, live pair ${m.liveH}px${m.liveWhole ? "" : " NOT WHOLE"}, names at ${m.whoSize}, ${m.settled} settled, off screen ${m.offscreen}, empty below ${m.deadSpace}px`;

/* THE LONGEST OF EVERYTHING. Measured in the bank on 24 Sep 2026: a name of 41
   characters, a context line of 77, a category of 53 and a subtitle of 101.
   The served board is padded to those, in the response the page reads. */
const longest = (t, n, fill) => { let v = String(t || ""); while (v.length < n) v += fill; return v.slice(0, n); };
async function openDuel(game, [name, viewport, touch]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.route("**/api/hilo/daily*", async (route) => {
    /* The samples hold boards 1 and 2 and nothing for today, so board 1 is
       served AS today's: the page plays it as the daily it opened for. */
    const u = new URL(route.request().url());
    u.search = "?no=1";
    const res = await route.fetch({ url: u.href });
    const body = await res.json();
    if (body && body.board) { body.day = body.today; body.no = body.todayNo; }
    const b = body && body.board;
    if (b) {
      b.category = longest(b.category, 53, " Club");
      b.subtitle = longest(b.subtitle, 101, " and more");
      for (const row of b.rows || b.chain || []) {
        if (row.name) row.name = longest(row.name, 41, "-Longname");
        if (row.context !== undefined) row.context = longest(row.context, 77, " and so on");
      }
    }
    await route.fulfill({ response: res, json: body });
  });
  await page.goto(ORIGIN + game.path, { waitUntil: "networkidle" });
  await page.click("#homeDaily");
  /* Today's board starts from the hero with no cover; a board from anywhere
     else waits on the cover's Kick off. Either way, play is on when the calls
     are live. */
  await page.waitForFunction(() => !document.getElementById("higher").disabled ||
    !document.getElementById("kickCover").classList.contains("hidden"), null, { timeout: 10000 });
  if (await page.$eval("#kickCover", (e) => !e.classList.contains("hidden"))) await page.click("#kickBtn");
  await page.waitForFunction(() => !document.getElementById("higher").disabled, null, { timeout: 10000 });
  await wait(500);
  return { page, context };
}
/* One call, as a player makes it, and the next pair (or Full Time). */
async function callOne(page) {
  const before = await page.$$eval("#rows .duel.settled", (e) => e.length);
  await page.click("#higher");
  await page.waitForFunction((n) => document.querySelectorAll("#rows .duel.settled").length > n, before, { timeout: 10000 });
  await page.waitForFunction(() => !document.getElementById("screenResults").hidden ||
    !document.getElementById("nextRow").classList.contains("hidden") ||
    !document.getElementById("higher").disabled, null, { timeout: 10000 });
  if (await page.$eval("#nextRow", (e) => !e.classList.contains("hidden"))) await page.click("#nextBtn");
  await wait(300);
}

for (const [id, game] of Object.entries(LOCKED).filter(([k, g]) => g.kind === "duel" && (!ONLY || k === ONLY))) {
  console.log(`\n${id}: in play`);
  for (const vp of VIEWPORTS) {
    const { page, context } = await openDuel(game, vp);
    const first = await page.evaluate(measureDuel);
    t(`${vp[0]}: the longest names -- locked, no scroll, the live pair whole, the calls and the clock on screen`,
      duelOk(first), duelSay(first));
    for (let i = 0; i < 4; i++) await callOne(page);
    const later = await page.evaluate(measureDuel);
    t(`${vp[0]}: four calls later -- the settled rows scroll in their panel and the live pair is still whole`,
      duelOk(later) && later.settled >= 4, duelSay(later));
    await context.close();
  }

  console.log(`\n${id}: the old-link banner`);
  for (const vp of [VIEWPORTS[0], VIEWPORTS[1]]) {
    const { page, context } = await openDuel(game, vp);
    await bannerCheck(page, id, vp[0], duelOk, duelSay, measureDuel);
    await context.close();
  }
  {
    const { page, context } = await openDuel(game, VIEWPORTS[1]);
    await howCheck(page, VIEWPORTS[1][0]);
    await context.close();
  }

  console.log(`\n${id}: the way out, and back`);
  {
    const { page, context } = await openDuel(game, VIEWPORTS[1]);
    const big = await page.evaluate(async () => {
      const st = document.createElement("style");
      st.id = "lock-test-big";
      st.textContent = ".ask{font-size:60px!important}.cat{font-size:70px!important}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 400));
      return document.body.classList.contains("locked");
    });
    t("a board too large to fit unlocks the page rather than cutting it off", big === false, "locked " + big);
    const back = await page.evaluate(async () => {
      document.getElementById("lock-test-big").remove();
      dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 400));
      return document.body.classList.contains("locked");
    });
    t("and relocks when it goes", back === true, "locked " + back);
    await context.close();
  }

  console.log(`\n${id}: Full Time`);
  for (const vp of [VIEWPORTS[1], VIEWPORTS[3]]) {
    const { page, context } = await openDuel(game, vp);
    for (let i = 0; i < 11; i++) {
      if (await page.$eval("#screenResults", (e) => !e.hidden)) break;
      await callOne(page);
    }
    await wait(600);
    const m = await page.evaluate(measureDuel);
    t(`${vp[0]}: Full Time is locked, the board stays and the page does not scroll`,
      m.fulltime && m.locked && m.scrollY <= 1 && m.scrollX <= 1, duelSay(m));
    t(`${vp[0]}: and the result is a panel inside the screen`,
      !!m.results && m.results[0] >= 0 && m.results[1] <= m.vh + 1, JSON.stringify(m.results));
    await context.close();
  }
}

/* ---- a codeword ----------------------------------------------------------- */
function measureCodeword() {
  const rect = (e) => e.getBoundingClientRect();
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== "none";
  const grid = document.getElementById("grid");
  const g = rect(grid);
  const n = Math.round(Math.sqrt(grid.children.length)) || 13;
  const card = grid.closest(".card");
  const keys = document.getElementById("keys");
  const offscreen = [...document.querySelectorAll("#grid, #keys, #check, #reveal, #key, .cw-clockcard")]
    .filter(vis).filter((e) => { const b = rect(e); return b.top < -1 || b.bottom > innerHeight + 1 || b.left < -1 || b.right > innerWidth + 1; }).length;
  const pad = parseFloat(getComputedStyle(card).paddingBottom) || 0;
  return {
    locked: document.body.classList.contains("locked"),
    scrollY: document.documentElement.scrollHeight - innerHeight,
    scrollX: document.documentElement.scrollWidth - innerWidth,
    square: Math.abs(g.width - g.height) <= 2,
    cell: Math.round(g.width / n),
    cardCut: card.scrollHeight > card.clientHeight + 1,
    offscreen,
    deadSpace: vis(keys) ? Math.round(rect(card).bottom - pad - rect(keys).bottom) : 0,
    vh: innerHeight,
  };
}
const cwOk = (m) => m.locked && m.scrollY <= 1 && m.scrollX <= 1 && m.square && m.cell >= 18 && !m.cardCut && m.offscreen === 0 && m.deadSpace <= 24;
const cwSay = (m) => `locked ${m.locked}, scroll ${m.scrollY}/${m.scrollX}, grid ${m.square ? "square" : "NOT SQUARE"} at ${m.cell}px a square${m.cardCut ? ", board card overflows" : ""}, off screen ${m.offscreen}, empty below ${m.deadSpace}px`;

async function openCodeword(game, [name, viewport, touch]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(ORIGIN + game.path, { waitUntil: "networkidle" });
  await page.click("#cwToday");
  await page.waitForFunction(() => document.querySelectorAll("#grid .cell").length >= 169, null, { timeout: 10000 });
  await wait(500);
  return { page, context };
}

for (const [id, game] of Object.entries(LOCKED).filter(([k, g]) => g.kind === "codeword" && (!ONLY || k === ONLY))) {
  console.log(`\n${id}: in play`);
  for (const vp of VIEWPORTS) {
    const { page, context } = await openCodeword(game, vp);
    const m = await page.evaluate(measureCodeword);
    t(`${vp[0]}: locked, no scroll, a square grid of hittable squares, the key, the keys and the clock on screen`, cwOk(m), cwSay(m));
    await context.close();
  }

  console.log(`\n${id}: the answers, on a phone`);
  {
    const { page, context } = await openCodeword(game, VIEWPORTS[1]);
    const shut = await page.evaluate(() => getComputedStyle(document.getElementById("cwAnswers")).display);
    t("the answers are not taking the screen until asked for", shut === "none", shut);
    await page.click("#cwAnswersBtn");
    await wait(200);
    const open = await page.evaluate(() => {
      const a = document.getElementById("cwAnswers"), r = a.getBoundingClientRect();
      return { shown: getComputedStyle(a).display !== "none", top: Math.round(r.top), bottom: Math.round(r.bottom),
        items: a.querySelectorAll("#hints li").length, scroll: document.documentElement.scrollHeight - innerHeight, vh: innerHeight };
    });
    t("opened, they are a panel inside the screen with all eleven", open.shown && open.top >= 0 && open.bottom <= open.vh + 1 && open.items === 11 && open.scroll <= 1, JSON.stringify(open));
    await page.click("#hints li");
    await wait(200);
    const closed = await page.evaluate(() => getComputedStyle(document.getElementById("cwAnswers")).display);
    t("and picking one closes the panel, to look at it on the grid", closed === "none", closed);
    await context.close();
  }

  console.log(`\n${id}: the old-link banner`);
  {
    const { page, context } = await openCodeword(game, VIEWPORTS[1]);
    await bannerCheck(page, id, VIEWPORTS[1][0], cwOk, cwSay, measureCodeword);
    await context.close();
  }
  /* THE ONE CASE THAT DOES NOT FIT, said rather than hidden: a 360x640 phone
     opened at an old board from a link. The grid is at its 18px floor there
     already, and the banner's 45px would take it under; so the page must fall
     back to scrolling -- whole, nothing cut -- rather than shrink the squares
     past hitting. */
  {
    const { page, context } = await openCodeword(game, VIEWPORTS[0]);
    const b = await page.evaluate(async () => {
      window.XIChrome.permalink.aged("codeword", 4);
      dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 400));
      const g = document.getElementById("grid").getBoundingClientRect();
      return { locked: document.body.classList.contains("locked"), cell: Math.round(g.width / 13) };
    });
    t("phone-360 with the old-link banner: falls back to scrolling rather than shrink the squares under 18px",
      !b.locked && b.cell >= 18, JSON.stringify(b));
    await context.close();
  }

  console.log(`\n${id}: the way out, and back`);
  {
    const { page, context } = await openCodeword(game, VIEWPORTS[1]);
    const big = await page.evaluate(async () => {
      const st = document.createElement("style");
      st.id = "lock-test-big";
      st.textContent = ".keys button{height:160px!important}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 400));
      return document.body.classList.contains("locked");
    });
    t("keys too large to leave the grid room unlock the page rather than shrink it past use", big === false, "locked " + big);
    const back = await page.evaluate(async () => {
      document.getElementById("lock-test-big").remove();
      dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 400));
      return document.body.classList.contains("locked");
    });
    t("and relocks when it goes", back === true, "locked " + back);
    await context.close();
  }

  console.log(`\n${id}: Full Time`);
  for (const vp of [VIEWPORTS[0], VIEWPORTS[3]]) {
    const { page, context } = await openCodeword(game, vp);
    /* The card is shown as the game shows it, by its class; what is under
       test is where it sits, not how a round is won. */
    const m = await page.evaluate(async () => {
      document.getElementById("ft").classList.add("on");
      await new Promise((r) => setTimeout(r, 200));
      const r = document.querySelector("#ft .ftcard").getBoundingClientRect();
      return { locked: document.body.classList.contains("locked"), scroll: document.documentElement.scrollHeight - innerHeight,
        top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight };
    });
    t(`${vp[0]}: the Full Time card sits inside the screen and the page does not scroll`,
      m.locked && m.scroll <= 1 && m.top >= 0 && m.bottom <= m.vh + 1, JSON.stringify(m));
    await context.close();
  }
}

await browser.close();
server.close();
done();
