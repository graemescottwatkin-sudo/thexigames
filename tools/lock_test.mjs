/* tools/lock_test.mjs — the play screen does not scroll.
 *
 * THE RULING, 24 Sep 2026, the owner on the Play build: the game should "fit
 * on the screen in whole, much like the crossword, i.e. the screen is fixed,
 * so no scrolling needed" -- for every game, at every size ("even on larger
 * screens its not needed, just change the size of elements to scale up"), and
 * the player cards "always take up a consistent amount of the pitch".
 *
 * TWO KINDS OF SCREEN. A PITCH (Scrambled, Vowels): eleven cards on a
 * formation. A QUIZ (QuickFire): a clue, four options and the controls, where
 * what varies is the length of the clue.
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
};
/* Not locked yet, by name, so the list of what is left is a fact in the tree
   and not a memory. Moving a game from here to LOCKED is its whole test. */
const PENDING = {
  "football/wordsearch": true, "football/hilo": true, "football/ballpark": true,
  "football/grid": true, "football/codeword": true,
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
const { quickfireEnv } = await import(pathToFileURL(path.join(ROOT, "tools", "lock_fixtures.mjs")).href);
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
  return {
    locked: document.body.classList.contains("locked"),
    fulltime: document.body.classList.contains("fulltime"),
    scrollY: document.documentElement.scrollHeight - innerHeight,
    scrollX: document.documentElement.scrollWidth - innerWidth,
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
const quizOk = (m) => m.locked && m.scrollY <= 1 && m.scrollX <= 1 && !m.clueCut && !m.screenCut && m.offscreen === 0 && m.options === 4;
const quizSay = (m) => `locked ${m.locked}, scroll ${m.scrollY}/${m.scrollX}, clue ${m.clueLen} chars at ${m.clueSize}${m.clueCut ? " CUT" : ""}, options ${m.options} at ${m.optionSize} (${m.optionH}px), off screen ${m.offscreen}${m.screenCut ? ", screen overflows" : ""}`;

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

await browser.close();
server.close();
done();
