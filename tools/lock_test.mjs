/* tools/lock_test.mjs — the play screen does not scroll.
 *
 * THE RULING, 24 Sep 2026, the owner on the Play build: the game should "fit
 * on the screen in whole, much like the crossword, i.e. the screen is fixed,
 * so no scrolling needed" -- for every game, at every size ("even on larger
 * screens its not needed, just change the size of elements to scale up"), and
 * the player cards "always take up a consistent amount of the pitch".
 *
 * EIGHT KINDS OF SCREEN. A PITCH (Scrambled, Vowels): eleven cards on a
 * formation. A QUIZ (QuickFire): a clue, four options and the controls, where
 * what varies is the length of the clue. A SLIDER (Ballpark): a question, a
 * value and a track, and after each lock a result that stands in for them. A
 * DUEL (HiLo): two faces and a call, with the settled calls piling up above
 * them in a panel that scrolls in itself. A CODEWORD: a square grid fitted to
 * the height that is left, a key, a keypad and the answers in a panel. A
 * GRID: a board of up to 16x16 whose squares are sized from its own box, the
 * answer row and the keys under it. A PROFILE (Who Am I, football and
 * Friends): a portrait and its facts, the guess box, the clue buttons, and the
 * clues bought scrolling in a panel of their own. A WORD SEARCH: the names
 * as chips (or a column, wider) and a 12x14 board fitted to the width and the
 * height it is left.
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
  grid: { kind: "grid", path: "/football/grid/" },
  whoami: { kind: "profile", path: "/football/whoami/" },
  whoami_fr: { kind: "profile", path: "/friends/whoami/" },
  wordsearch: { kind: "wordsearch", path: "/football/wordsearch/" },
};
/* Not locked yet, by name, so the list of what is left is a fact in the tree
   and not a memory. Moving a game from here to LOCKED is its whole test. */
const PENDING = {};
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
const { dailyNumber } = await import(pathToFileURL(path.join(ROOT, "functions", "_lib", "daily.js")).href);
const { quickfireEnv, codewordRawBoard, whoamiStub } = await import(pathToFileURL(path.join(ROOT, "tools", "lock_fixtures.mjs")).href);
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
    if (p.startsWith("/api/whoami/")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      let body = {};
      try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; } catch (e) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(whoamiStub(p, body, url.searchParams.get("no"))));
    }
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
    /* A board's own address, as production's permalinkRoute serves it: the
       game's page with a <base> so its relative assets resolve. */
    const perma = /^\/(football|friends)\/([a-z]+)\/daily\/\d+\/?$/.exec(p);
    if (perma) {
      const page = path.join(ROOT, perma[1], perma[2], "index.html");
      const html = fs.readFileSync(page, "utf8").replace("<head>", `<head><base href="/${perma[1]}/${perma[2]}/">`);
      res.writeHead(200, { "Content-Type": TYPES[".html"] });
      return res.end(html);
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
/* WAIT FOR THE PAGE, NOT FOR A NUMBER OF MILLISECONDS, wherever the page says
   when it is done: the room check that follows a kick-off or a resize turns
   body.locked on or off, a reveal marks its tile, a fit writes the clue's
   size, a permalink's request reaches the server. A fixed pause loses that
   race on a loaded machine (Grid's journey suite, 24 Sep 2026). Each signal
   is false before the thing starts, so it cannot be met by the state it is
   waiting to see change. The deadline is the guard against a wait that
   cannot end: a condition that never comes true returns false, and the
   assertion after it fails as it always would have, rather than the run
   crashing and naming no check.
   WHERE A PAUSE STAYS FIXED it is one of two things: a check that something
   does NOT happen (nothing unlocks, nothing moves), which no condition can
   wait for; or a room check that changes nothing a condition could see --
   the page stays locked either way -- so there is no "done" to wait on. */
const until = (page, fn, arg = null, ms = 10000) =>
  page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const untilHere = async (ok, ms = 10000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await wait(20);
  return ok();
};
const isLocked = () => document.body.classList.contains("locked");
const isUnlocked = () => !document.body.classList.contains("locked");
/* A fit that shrinks text writes the element's inline size, so its style
   attribute changing is the fit having run -- watched from BEFORE the resize,
   so a size left by an earlier fit cannot pass for this one. */
const watchStyle = (page, id) => page.evaluate((i) => {
  window.__lockTestStyled = false;
  new MutationObserver(() => { window.__lockTestStyled = true; })
    .observe(document.getElementById(i), { attributes: true, attributeFilter: ["style"] });
}, id);
const styleWritten = () => window.__lockTestStyled === true;

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
  /* The landing is not locked; the pitch is drawn in the same task that
     queues its room check, so body.locked is that check having run. */
  await until(page, isLocked);
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
    /* Stays fixed: working, the room check this queues leaves the page locked,
       so nothing changes that a condition could wait on. */
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
    /* Stays fixed: part of the check is that the landing does NOT lock. */
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
    /* Stays fixed, both ways: :target opens and closes the panel at once, and
       the pause is for whatever the hash change sets off -- the check is that
       it neither unlocks nor scrolls the page. */
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
    /* Stays fixed: the check is that typing does NOT unlock the page. */
    await wait(300);
    const m = await page.evaluate(measure);
    t(`${vp[0]}: typing "${word}" keeps the page locked and every card whole`, ok(m), say(m));
    await context.close();
  }

  /* PICKING A TILE DOES NOT MOVE THE BOARD. The owner, 25 Sep 2026: "on
     scrambled if i select a name the sizing changes" (and Vowels the same):
     the bench and the echo took rows of the screen, and the pitch lost a third
     of its height on every pick. Picked by a real tap, top row and bottom row:
     the cards keep their size, the bench is on screen over the pitch, and it
     does not cover the tile it is for. */
  console.log(`\n${id}: picking a tile`);
  for (const vp of [VIEWPORTS[0], VIEWPORTS[1], VIEWPORTS[3]]) {
    const { page, context } = await open(game, 1, vp);
    const size = () => page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const tiles = [...document.querySelectorAll("#pitch .slot")].map(r);
      return { h: Math.round(tiles[0].height), w: Math.round(tiles[0].width), pitch: Math.round(r(document.getElementById("pitch")).height),
        scroll: document.documentElement.scrollHeight - innerHeight, locked: document.body.classList.contains("locked") };
    });
    const before = await size();
    for (const which of ["top", "bottom"]) {
      const at = await page.evaluate((w) => {
        const tiles = [...document.querySelectorAll("#pitch .slot:not(.solved)")];
        tiles.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        const el = w === "top" ? tiles[0] : tiles[tiles.length - 1];
        const q = el.getBoundingClientRect();
        return { x: q.left + q.width / 2, y: q.top + q.height / 2, slot: el.dataset.slot };
      }, which);
      if (vp[2]) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
      /* Stays fixed: the pick marks its tile at once, before the room check it
         queues, and the check is that the cards do NOT change size. */
      await wait(400);
      const after = await size();
      const bench = await page.evaluate((slot) => {
        const r = (e) => e.getBoundingClientRect();
        const b = document.getElementById("benchRow"), p = document.getElementById("pitch");
        const tile = document.querySelector(`#pitch .slot[data-slot="${slot}"]`);
        const br = r(b), pr = r(p), tr = r(tile);
        return { shown: !b.hidden && getComputedStyle(b).display !== "none",
          overPitch: br.top >= pr.top - 1 && br.bottom <= pr.bottom + 1,
          clearOfTile: br.bottom <= tr.top + 1 || br.top >= tr.bottom - 1,
          picked: tile.classList.contains("picked") };
      }, at.slot);
      t(`${vp[0]}: picking a ${which}-row tile leaves every card its size and the page locked`,
        after.locked && after.scroll <= 1 && Math.abs(after.h - before.h) <= 1 && Math.abs(after.w - before.w) <= 1 && Math.abs(after.pitch - before.pitch) <= 1,
        `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
      t(`${vp[0]}: and its bench is over the pitch, clear of the tile it is for`,
        bench.picked && bench.shown && bench.overPitch && bench.clearOfTile, JSON.stringify(bench));
      await page.evaluate(() => document.getElementById("benchClose").click());
      /* Stays fixed: the bench goes at once, before the room check it queues,
         which keeps the page locked when it works. */
      await wait(200);
    }
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
    await page.evaluate(() => {
      const st = document.createElement("style");
      st.id = "lock-test-big";
      st.textContent = ".slot .pos,.slot .enum{font-size:40px!important}.slot .letters{font-size:60px!important;min-width:200px}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
    });
    await until(page, isUnlocked);
    const big = await page.evaluate(isLocked);
    t("text too large to fit unlocks the page rather than cutting it off", big === false, "locked " + big);
    await page.evaluate(() => {
      document.getElementById("lock-test-big").remove();
      dispatchEvent(new Event("resize"));
    });
    await until(page, isLocked);
    const back = await page.evaluate(isLocked);
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
      /* Short and caught: a click something else intercepts is the board
         being wrong, which the checks below report; left to throw it killed
         the suite and named nothing (25 Sep 2026). */
      try {
        await page.click(`#pitch .slot[data-slot="${open[0]}"]`, { timeout: 3000 });
        await page.click("#buyName", { timeout: 3000 });
      } catch (e) { break; }
      /* The reveal goes to the server; its tile is marked when it lands. */
      await until(page, (s) => {
        const e = document.querySelector(`#pitch .slot[data-slot="${s}"]`);
        return !e || e.matches(".solved, .given") || document.body.classList.contains("fulltime");
      }, open[0]);
    }
    /* UNTIL FULL TIME HAS LANDED, not a fixed pause: under a full run's load
       the last reveal was still settling at 600ms and the page was measured
       mid-change (25 Sep 2026). A ceiling of ten seconds, then the lock check
       has had its frame. */
    /* A wait that never ends is this check failing, not the suite crashing:
       a crash names no check, and the prover read it as a pass (25 Sep 2026). */
    await page.waitForFunction(() => document.body.classList.contains("fulltime") &&
      !document.getElementById("screenResults").hidden, null, { timeout: 10000 }).catch(() => {});
    /* Stays fixed: Full Time's room check keeps the page locked when it works,
       so it changes nothing to wait on; this is its frame to run in. */
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
  /* The round is shown and its first question served in one task, which
     queues the one room check that locks it. */
  await until(page, isLocked);
  return { page, context };
}
/* Answer the question on screen and wait for the next one (or Full Time). */
async function answerOne(page) {
  const before = await page.$eval("#progress", (e) => e.textContent);
  await page.click("#options .option:not([disabled])");
  await page.waitForFunction((b) => !document.getElementById("screenResults").hidden ||
    (document.getElementById("progress").textContent !== b && document.querySelector("#options .option:not([disabled])")), before, { timeout: 15000 });
  /* Stays fixed: the new clue's fit keeps the page locked, so it has no
     "done" to wait on; this is its frame to run in. */
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
  {
    const { page, context } = await openQuiz(game, VIEWPORTS[1]);
    await howCheck(page, VIEWPORTS[1][0]);
    await context.close();
  }

  console.log(`\n${id}: the way out, and back`);
  {
    const { page, context } = await openQuiz(game, VIEWPORTS[1]);
    await page.evaluate(() => {
      const st = document.createElement("style");
      st.id = "lock-test-big";
      st.textContent = ".option{font-size:44px!important;padding:40px!important}.clue{min-height:500px!important}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
    });
    await until(page, isUnlocked);
    const big = await page.evaluate(isLocked);
    t("a question too large to fit unlocks the page rather than cutting it off", big === false, "locked " + big);
    await page.evaluate(() => {
      document.getElementById("lock-test-big").remove();
      dispatchEvent(new Event("resize"));
    });
    await until(page, isLocked);
    const back = await page.evaluate(isLocked);
    t("and relocks when it goes", back === true, "locked " + back);
    /* THE FIT, made to work. The longest clue in the fixture fits at its
       stylesheet size at every size above, so none of those checks needs the
       shrink at all. Here the clue starts far too big for its box: the page
       must bring it down until it is whole, and stay locked while it does. */
    await watchStyle(page, "clue");
    await page.evaluate(() => {
      const st = document.createElement("style");
      st.id = "lock-test-huge-clue";
      st.textContent = "body.locked .clue{font-size:72px}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
    });
    await until(page, styleWritten);
    const fitted = await page.evaluate(() => {
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
    /* Stays fixed: Full Time's room check keeps the page locked when it works. */
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
  /* THE CONTROL HAS A SIZE. "On screen" was all this asked, and a track of
     0px width is on screen: the slider was 0px wide at every size from the
     lock's first release until found in the app (25 Sep 2026), with this
     suite green throughout. Before the lock the track must be most of the
     stage wide; after it, the result's markers must not sit on its figures,
     and the legend's rows must carry no fill of their own. */
  const track = document.getElementById("track");
  const trackW = vis(track) ? Math.round(rect(track).width) : null;
  const stageW = Math.round(rect(stage).width);
  const facts = document.querySelector("#result .rs-facts");
  const marks = [...document.querySelectorAll("#result .rs-answer, #result .rs-guess")].filter(vis);
  const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const markOverFacts = vis(facts) ? marks.filter((m) => hit(rect(m), rect(facts))).length : 0;
  const legendFilled = [...document.querySelectorAll("#result .rs-key li")].filter(vis)
    .filter((li) => { const bg = getComputedStyle(li).backgroundColor; return bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent"; }).length;
  return {
    trackW, stageW, markOverFacts, legendFilled,
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
const sliderOk = (m) => m.locked && m.scrollY <= 1 && m.scrollX <= 1 && !m.qCut && !m.stageCut && m.offscreen === 0 && m.deadSpace <= 24
  && (m.trackW === null || m.trackW >= Math.min(300, m.stageW * 0.6)) && m.markOverFacts === 0 && m.legendFilled === 0;
const sliderSay = (m) => `locked ${m.locked}, scroll ${m.scrollY}/${m.scrollX}, question ${m.qLen} chars at ${m.qSize}${m.qCut ? " CUT" : ""}${m.stageCut ? ", stage overflows" : ""}, off screen ${m.offscreen}, empty below ${m.deadSpace}px, track ${m.trackW === null ? "hidden" : m.trackW + "px of " + m.stageW}${m.markOverFacts ? ", markers ON the figures" : ""}${m.legendFilled ? ", legend rows filled" : ""}`;

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
  /* The game screen and its first question come up in one task, which
     queues the one room check that locks it. */
  await until(page, isLocked);
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
  /* Stays fixed: the result's room check keeps the page locked when it works. */
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
    await page.evaluate(() => {
      const st = document.createElement("style");
      st.id = "lock-test-big";
      st.textContent = ".q small{font-size:60px!important}.big span{font-size:120px!important}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
    });
    await until(page, isUnlocked);
    const big = await page.evaluate(isLocked);
    t("a question too large to fit unlocks the page rather than cutting it off", big === false, "locked " + big);
    await page.evaluate(() => {
      document.getElementById("lock-test-big").remove();
      dispatchEvent(new Event("resize"));
    });
    await until(page, isLocked);
    const back = await page.evaluate(isLocked);
    t("and relocks when it goes", back === true, "locked " + back);
    await watchStyle(page, "q");
    await page.evaluate(() => {
      const st = document.createElement("style");
      st.textContent = "body.locked .q{font-size:64px}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
    });
    await until(page, styleWritten);
    const fitted = await page.evaluate(() => {
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
      /* Stays fixed: the page tells the server the question is open and
         shows nothing when the answer comes back. */
      await wait(300);
    }
    /* Stays fixed: Full Time's room check keeps the page locked when it works. */
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
    /* The owner, 25 Sep 2026: "quite a bit of white space at the top ... the
       active box is massive compared to the answered ones". The gap from the
       ladder to the first thing under it, and a settled row's height beside
       the live pair's. */
    band: (() => { const l = document.querySelector("#screenGame .ladder"), f = rows.firstElementChild;
      return l && f && vis(l) ? Math.round(rect(f).top - rect(l).bottom) : null; })(),
    settledH: (() => { const d = document.querySelector("#rows .duel.settled"); return d ? Math.round(rect(d).height) : 0; })(),
    /* And no band at the other end: packing it from the top first moved the
       spare under the game, a third of the screen (in the app, 25 Sep 2026).
       Under the live pair to the question, and under the whole game. */
    underLive: (() => { const a = document.querySelector("#screenGame .ask"); return liveBox && vis(a) ? Math.round(rect(a).top - liveBox.bottom) : null; })(),
    underGame: Math.round(innerHeight - rect(document.querySelector("#screenGame .game")).bottom),
    boxes: ["#screenGame", "#screenGame .game", "#screenGame .stage", "#rows", ".dug"].map((q) => {
      const e = document.querySelector(q); return e ? q.split(" ").pop() + ":" + Math.round(rect(e).height) + "/" + e.scrollHeight : q + ":-";
    }).join(" "),
  };
}
const duelOk = (m) => m.locked && m.scrollY <= 1 && m.scrollX <= 1 && !m.stageCut && m.liveWhole && m.offscreen === 0 && m.deadSpace <= 24;
const duelSay = (m) => `locked ${m.locked}, scroll ${m.scrollY}/${m.scrollX}${m.stageCut ? ", stage overflows" : ""}, live pair ${m.liveH}px${m.liveWhole ? "" : " NOT WHOLE"}, names at ${m.whoSize}, ${m.settled} settled, off screen ${m.offscreen}, empty below ${m.deadSpace}px${m.scrollY > 1 ? " [" + m.boxes + "]" : ""}`;

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
  /* Stays fixed: behind the cover the page is locked BEFORE the pair is
     live, so body.locked cannot say that the pair's own room check has run. */
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
  /* Stays fixed: the call's room check keeps the page locked when it works. */
  await wait(300);
}

for (const [id, game] of Object.entries(LOCKED).filter(([k, g]) => g.kind === "duel" && (!ONLY || k === ONLY))) {
  console.log(`\n${id}: in play`);
  for (const vp of VIEWPORTS) {
    const { page, context } = await openDuel(game, vp);
    const first = await page.evaluate(measureDuel);
    t(`${vp[0]}: the longest names -- locked, no scroll, the live pair whole, the calls and the clock on screen`,
      duelOk(first), duelSay(first));
    t(`${vp[0]}: the first call has no empty band above the live pair`,
      first.band !== null && first.band >= 0 && first.band <= 16, `gap under the ladder ${first.band}px`);
    t(`${vp[0]}: nor one below it: the live pair takes the spare, down to the question, and the game reaches the foot`,
      first.underLive !== null && first.underLive <= 24 && first.underGame <= 24, `under the pair ${first.underLive}px, under the game ${first.underGame}px`);
    if (process.env.LOCK_SHOTS) await page.screenshot({ path: path.join(process.env.LOCK_SHOTS, `${id}-${vp[0]}-first.png`) });
    for (let i = 0; i < 4; i++) await callOne(page);
    const later = await page.evaluate(measureDuel);
    t(`${vp[0]}: four calls later -- the settled rows scroll in their panel and the live pair is still whole`,
      duelOk(later) && later.settled >= 4, duelSay(later));
    /* Asked as a share of the screen, not against a settled row: this suite's
       names are padded to the bank's longest, so its settled rows run 126 to
       168px and a ratio passed the very 320px pair it exists to refuse. The
       owner's 280px pair was a third of the play area; this holds it under 30%
       of the screen. */
    t(`${vp[0]}: and the live pair takes 30% of the screen or less, in scale with the answered ones`,
      later.liveH > 0 && later.liveH <= later.vh * 0.3, `live ${later.liveH}px of ${later.vh}, settled ${later.settledH}px`);
    if (process.env.LOCK_SHOTS) await page.screenshot({ path: path.join(process.env.LOCK_SHOTS, `${id}-${vp[0]}-later.png`) });
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
    await page.evaluate(() => {
      const st = document.createElement("style");
      st.id = "lock-test-big";
      st.textContent = ".ask{font-size:60px!important}.cat{font-size:70px!important}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
    });
    await until(page, isUnlocked);
    const big = await page.evaluate(isLocked);
    t("a board too large to fit unlocks the page rather than cutting it off", big === false, "locked " + big);
    await page.evaluate(() => {
      document.getElementById("lock-test-big").remove();
      dispatchEvent(new Event("resize"));
    });
    await until(page, isLocked);
    const back = await page.evaluate(isLocked);
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
    /* Stays fixed: Full Time's room check keeps the page locked when it works. */
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
    /* Whole in the box that clips it. A phone board drawn the screen's width
       and panned stood half a row cut off at 412x860 on production (25 Sep
       2026): the board passed every check here while reading as broken. */
    whole: (() => { const bx = rect(grid.closest(".gridbox") || grid); return g.top >= bx.top - 1 && g.bottom <= bx.bottom + 1 && g.left >= bx.left - 1 && g.right <= bx.right + 1; })(),
    cell: Math.round(g.width / n),
    cardCut: card.scrollHeight > card.clientHeight + 1,
    offscreen,
    deadSpace: vis(keys) ? Math.round(rect(card).bottom - pad - rect(keys).bottom) : 0,
    vh: innerHeight,
  };
}
const cwOk = (m) => m.locked && m.scrollY <= 1 && m.scrollX <= 1 && m.square && m.whole && m.cell >= 18 && !m.cardCut && m.offscreen === 0 && m.deadSpace <= 24;
const cwSay = (m) => `locked ${m.locked}, scroll ${m.scrollY}/${m.scrollX}, grid ${m.square ? "square" : "NOT SQUARE"}${m.whole ? "" : " and NOT WHOLE"} at ${m.cell}px a square${m.cardCut ? ", board card overflows" : ""}, off screen ${m.offscreen}, empty below ${m.deadSpace}px`;

async function openCodeword(game, [name, viewport, touch]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(ORIGIN + game.path, { waitUntil: "networkidle" });
  await page.click("#cwToday");
  await page.waitForFunction(() => document.querySelectorAll("#grid .cell").length >= 169, null, { timeout: 10000 });
  /* Its only room check is the one showing the game queues, and it is what
     sets body.locked. */
  await until(page, isLocked);
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

  console.log(`\n${id}: the look, and the clue in hand`);
  {
    /* The owner, 25 Sep 2026: the black squares were "not in keeping with
       other games" -- the board now sits on the crossword's pitch and the
       blocked squares show it -- and "are the clues missing": the clue for
       the answer you are in is under the grid. And the final whistle, hidden
       until it may be used, must actually be hidden (display:flex beat it). */
    const { page, context } = await openCodeword(game, VIEWPORTS[1]);
    const look = await page.evaluate(() => {
      const block = document.querySelector("#grid .cell.block");
      const bg = block ? getComputedStyle(block).backgroundColor : "none";
      return { pitch: !!document.querySelector(".cw-pitch .pitch-bg"), blockBg: bg,
        whistle: getComputedStyle(document.getElementById("whistle")).display };
    });
    t("the board is on the pitch and a blocked square shows the turf, not black",
      look.pitch && (look.blockBg === "rgba(0, 0, 0, 0)" || look.blockBg === "transparent"), JSON.stringify(look));
    t("the final whistle is hidden until it may be used", look.whistle === "none", look.whistle);
    const at = await page.$eval("#grid .cell:not(.block)", (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.touchscreen.tap(at.x, at.y);
    /* Nothing is in hand before the tap, so the line under the grid is empty. */
    await until(page, () => (document.getElementById("cwHere").textContent || "").trim() !== "");
    const clue = await page.evaluate(() => {
      const li = document.querySelector("#hints li.here");
      return { line: (document.getElementById("cwHere").textContent || "").trim(),
        here: li ? li.textContent.replace(/\s+/g, " ").trim() : null,
        shown: getComputedStyle(document.getElementById("cwHere")).display !== "none" };
    });
    t("tapping a square puts that answer's clue under the grid", clue.shown && !!clue.here && clue.line === clue.here, JSON.stringify(clue));
    await context.close();
  }

  console.log(`\n${id}: the answers, on a phone`);
  {
    const { page, context } = await openCodeword(game, VIEWPORTS[1]);
    const shut = await page.evaluate(() => getComputedStyle(document.getElementById("cwAnswers")).display);
    t("the answers are not taking the screen until asked for", shut === "none", shut);
    await page.click("#cwAnswersBtn");
    await until(page, () => getComputedStyle(document.getElementById("cwAnswers")).display !== "none");
    const open = await page.evaluate(() => {
      const a = document.getElementById("cwAnswers"), r = a.getBoundingClientRect();
      return { shown: getComputedStyle(a).display !== "none", top: Math.round(r.top), bottom: Math.round(r.bottom),
        items: a.querySelectorAll("#hints li").length, scroll: document.documentElement.scrollHeight - innerHeight, vh: innerHeight };
    });
    t("opened, they are a panel inside the screen with all eleven", open.shown && open.top >= 0 && open.bottom <= open.vh + 1 && open.items === 11 && open.scroll <= 1, JSON.stringify(open));
    await page.click("#hints li");
    await until(page, () => getComputedStyle(document.getElementById("cwAnswers")).display === "none");
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
    await page.evaluate(() => {
      window.XIChrome.permalink.aged("codeword", 4);
      dispatchEvent(new Event("resize"));
    });
    await until(page, isUnlocked);
    const b = await page.evaluate(() => {
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
    await page.evaluate(() => {
      const st = document.createElement("style");
      st.id = "lock-test-big";
      st.textContent = ".keys button{height:160px!important}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
    });
    await until(page, isUnlocked);
    const big = await page.evaluate(isLocked);
    t("keys too large to leave the grid room unlock the page rather than shrink it past use", big === false, "locked " + big);
    await page.evaluate(() => {
      document.getElementById("lock-test-big").remove();
      dispatchEvent(new Event("resize"));
    });
    await until(page, isLocked);
    const back = await page.evaluate(isLocked);
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
      /* Stays fixed: the stylesheet places the card at once, and the check
         is that nothing the page does about it unlocks or scrolls. */
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

/* ---- a grid ------------------------------------------------------------------ */
function measureGrid() {
  const rect = (e) => e.getBoundingClientRect();
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== "none";
  const board = document.getElementById("gdBoard"), wrap = document.querySelector(".gd-boardwrap");
  const b = rect(board), w = rect(wrap);
  const cell = document.querySelector("#gdBoard .gd-cell.on");
  const offscreen = [...document.querySelectorAll("#gdBoard, #gdSlots, #gdKbd, .gd-budget, #gdFullTime")]
    .filter(vis).filter((e) => { const r = rect(e); return r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1; }).length;
  return {
    locked: document.body.classList.contains("locked"),
    scrollY: document.documentElement.scrollHeight - innerHeight,
    scrollX: document.documentElement.scrollWidth - innerWidth,
    boardWhole: b.top >= w.top - 1 && b.bottom <= w.bottom + 1 && b.left >= w.left - 1 && b.right <= w.right + 1,
    cell: cell ? Math.round(rect(cell).width) : 0,
    offscreen,
    ft: vis(document.getElementById("gdFullTime")),
    keys: vis(document.getElementById("gdKbd")),
    entries: vis(document.getElementById("gdEntries")),
  };
}
const gridOk = (m) => m.locked && m.scrollY <= 1 && m.scrollX <= 1 && m.boardWhole && m.cell >= 18 && m.offscreen === 0;
const gridSay = (m) => `locked ${m.locked}, scroll ${m.scrollY}/${m.scrollX}, board ${m.boardWhole ? "whole" : "NOT WHOLE"} at ${m.cell}px a square, off screen ${m.offscreen}${m.ft ? ", full time up" : ""}`;
async function openGrid(game, [name, viewport, touch], storage) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  if (storage) await context.addInitScript((kv) => { for (const k in kv) localStorage.setItem(k, kv[k]); }, storage);
  await page.goto(ORIGIN + game.path, { waitUntil: "networkidle" });
  await page.waitForSelector("#gdBoard .gd-cell.on", { timeout: 10000 });
  /* Stays fixed: the board is locked BEFORE its first draw and the room
     check after it may only take that away, so there is no "done" to see. */
  await wait(600);
  return { page, context };
}
for (const [id, game] of Object.entries(LOCKED).filter(([k, g]) => g.kind === "grid" && (!ONLY || k === ONLY))) {
  console.log(`\n${id}: in play`);
  for (const vp of VIEWPORTS) {
    const { page, context } = await openGrid(game, vp);
    const m = await page.evaluate(measureGrid);
    if (vp[0] === "phone-360") {
      /* THE ONE SIZE A 16x16 CANNOT FIT, said rather than hidden: with the keys
         up, a 360x640 phone leaves under 18px a square. It must fall back to
         scrolling with the board whole at a hittable size, not lock and cut. */
      t(`${vp[0]}: a 16x16 board fits locked, or falls back to scrolling at 18px or more (the board then scrolls sideways in its own box, as it did before the lock)`,
        (gridOk(m) && m.keys) || (!m.locked && m.cell >= 18), gridSay(m));
    } else {
      t(`${vp[0]}: a 16x16 board -- locked, no scroll, the whole board in its box at hittable squares, the answer row and keys on screen`,
        gridOk(m) && m.keys, gridSay(m));
    }
    if (vp[1].width >= 900) t(`${vp[0]}: the entries come back in the column beside the board`, m.entries, gridSay(m));
    await context.close();
  }

  console.log(`\n${id}: a board already played`);
  {
    const no = await (async () => {
      const r = await fetch(ORIGIN + "/api/grid/daily"); const j = await r.json(); return j.no;
    })();
    const rec = JSON.stringify([{ no, score: 80, solved: 9, misses: 3, result: "W", day: utcDay() }]);
    const { page, context } = await openGrid(game, VIEWPORTS[1], { "xigd.results": rec });
    const m = await page.evaluate(measureGrid);
    t("the Full Time card stands where the keys were, the board stays, and the page does not scroll",
      m.ft && !m.keys && m.locked && m.scrollY <= 1 && m.boardWhole, gridSay(m));
    await page.click("#gdReplay");
    /* Stays fixed: the card goes at once, before the room check it queues,
       and that check keeps the page locked when it works. */
    await wait(400);
    const back = await page.evaluate(measureGrid);
    t("and \"Play it again\" puts the card away and the keys back", !back.ft && back.keys && gridOk(back), gridSay(back));
    await context.close();
  }

  console.log(`\n${id}: the old-link banner`);
  {
    const { page, context } = await openGrid(game, VIEWPORTS[1]);
    await bannerCheck(page, id, VIEWPORTS[1][0], gridOk, gridSay, measureGrid);
    await context.close();
  }
  {
    const { page, context } = await openGrid(game, VIEWPORTS[1]);
    await howCheck(page, VIEWPORTS[1][0]);
    await context.close();
  }

  console.log(`\n${id}: the way out, and back`);
  {
    const { page, context } = await openGrid(game, VIEWPORTS[1]);
    await page.evaluate(() => {
      const st = document.createElement("style");
      st.id = "lock-test-big";
      st.textContent = ".gd-k{height:120px!important}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
    });
    await until(page, isUnlocked);
    const big = await page.evaluate(isLocked);
    t("keys too large to leave the board room unlock the page rather than shrink the squares past use", big === false, "locked " + big);
    await page.evaluate(() => {
      document.getElementById("lock-test-big").remove();
      dispatchEvent(new Event("resize"));
    });
    await until(page, isLocked);
    const back = await page.evaluate(isLocked);
    t("and relocks when it goes", back === true, "locked " + back);
    await context.close();
  }
}

/* ---- a profile ----------------------------------------------------------------- */
function measureProfile() {
  const rect = (e) => e.getBoundingClientRect();
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== "none";
  const play = document.getElementById("screenPlay"), done = document.getElementById("screenDone");
  const sec = vis(play) ? play : vis(done) ? done : null;
  /* Where the bought clues are: football's panel under the buttons, or the
     Friends list written into the profile (#clueStack). */
  const clues = document.getElementById("clueStack") || document.getElementById("clues");
  const offscreen = [...document.querySelectorAll("#guessInput, #guessGo, #giveUp, .profile, #ladder")]
    .filter(vis).filter((e) => { const r = rect(e); return r.top < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1; }).length;
  return {
    locked: document.body.classList.contains("locked"),
    scrollY: document.documentElement.scrollHeight - innerHeight,
    scrollX: document.documentElement.scrollWidth - innerWidth,
    screen: sec ? sec.id : null,
    secCut: !!sec && sec.scrollHeight > sec.clientHeight + 1,
    offscreen,
    cluesScroll: vis(clues) ? clues.scrollHeight > clues.clientHeight + 1 : false,
    cluesH: vis(clues) ? Math.round(rect(clues).height) : 0,
  };
}
const profileOk = (m) => m.locked && m.scrollY <= 1 && m.scrollX <= 1 && !m.secCut && m.offscreen === 0;
const profileSay = (m) => `locked ${m.locked}, scroll ${m.scrollY}/${m.scrollX}, ${m.screen}${m.secCut ? " OVERFLOWS" : ""}, off screen ${m.offscreen}, clues ${m.cluesH}px${m.cluesScroll ? " (scrolling in itself)" : ""}`;
async function openProfile(game, [name, viewport, touch]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(ORIGIN + game.path, { waitUntil: "networkidle" });
  await page.click("#waToday");
  await page.waitForSelector("#doors .door", { timeout: 10000 });
  await page.click("#doors .door");
  await page.waitForSelector("#playChoice:not([disabled])", { timeout: 5000 });
  await page.click("#playChoice");
  await page.waitForFunction(() => !document.getElementById("screenPlay").hidden, null, { timeout: 10000 });
  /* Stays fixed: the round locks as soon as it is shown, and the starting
     clue arrives on a second request after it, with no mark of its own. */
  await wait(600);
  return { page, context };
}
for (const [id, game] of Object.entries(LOCKED).filter(([k, g]) => g.kind === "profile" && (!ONLY || k === ONLY))) {
  console.log(`\n${id}: in play`);
  for (const vp of VIEWPORTS) {
    const { page, context } = await openProfile(game, vp);
    const m = await page.evaluate(measureProfile);
    t(`${vp[0]}: locked, no scroll, the profile, the guess box, the clue buttons and Give up on screen`, profileOk(m), profileSay(m));
    if (process.env.LOCK_SHOTS) await page.screenshot({ path: path.join(process.env.LOCK_SHOTS, `${id}-${vp[0]}-fresh.png`) });
    /* NO BAND BEFORE A CLUE IS BOUGHT. The clue panel is what takes the spare
       height, and with nothing in it that was a quarter of a 412 screen blank
       between the buttons and Give up (in the app, 25 Sep 2026). Until a clue
       is bought the profile takes it instead. */
    const fresh = await page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const ladder = document.getElementById("ladder"), give = document.getElementById("giveUp");
      const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== "none";
      /* And the starting clue whole while the profile takes that height: a
         portrait sized too greedily cut the numbers off the foot of it. */
      const facts = document.getElementById("startClue"), prof = document.querySelector(".profile");
      const nums = document.getElementById("playNums");
      const cut = !!facts && !!prof && (facts.scrollHeight > facts.clientHeight + 1 ||
        (nums && nums.getBoundingClientRect().height > 0 && r(nums).bottom > r(prof).bottom + 1));
      /* HOW MUCH OF THE PORTRAIT IS SHOWN, from the box and the fit rather
         than by eye: a square picture covering a box much wider than tall
         shows a band of it, and in the app at 412x839 that band was forehead
         to chin, the crown gone (25 Sep 2026). */
      const img = document.querySelector(".pf-face img");
      let shown = null;
      if (img && img.naturalWidth) {
        const bw = img.clientWidth, bh = img.clientHeight, nw = img.naturalWidth, nh = img.naturalHeight;
        const fit = getComputedStyle(img).objectFit;
        const s = fit === "cover" ? Math.max(bw / nw, bh / nh) : fit === "contain" ? Math.min(bw / nw, bh / nh) : null;
        shown = s === null ? null : { h: Math.min(1, bh / (nh * s)), w: Math.min(1, bw / (nw * s)), box: `${bw}x${bh}`, fit };
      }
      return { clues: document.querySelectorAll("#clues .clue").length, cut, shown,
        gap: vis(ladder) && vis(give) ? Math.round(r(give).top - r(ladder).bottom) : null };
    });
    /* Football only. Friends writes every clue into the profile (#clueStack)
       and its facts scroll in themselves by design, so text taller than the
       box is the panel working, not a cut; with the runner's taller fonts at
       360 this read CUT on Friends in CI (25 Sep 2026) while football's facts,
       which must never scroll, were whole everywhere. */
    if (id === "whoami") {
      t(`${vp[0]}: the starting clue is whole, nothing cut off its foot`, !fresh.cut, fresh.cut ? "CUT" : "whole");
      /* The whole height of the head, crown to chin; the sides of a profile
         silhouette can give way, which is how a narrow column shows it. */
      t(`${vp[0]}: the portrait shows the whole head, not a band of it`,
        !!fresh.shown && fresh.shown.h >= 0.9 && fresh.shown.w >= 0.5,
        fresh.shown ? `${Math.round(fresh.shown.h * 100)}% of its height, ${Math.round(fresh.shown.w * 100)}% of its width, in ${fresh.shown.box} (${fresh.shown.fit})` : "no image");
    }
    if (fresh.clues === 0 && fresh.gap !== null) {
      t(`${vp[0]}: before a clue is bought, nothing stands blank between the clue buttons and Give up`, fresh.gap <= 40, `${fresh.gap}px`);
    }
    /* Every clue there is to buy, the longest being football's fourteen-club
       career: the panel takes it and scrolls in itself, and nothing else moves
       off the screen. */
    for (let i = 0; i < 3; i++) {
      const rung = await page.$("#ladder .rung:not([disabled])");
      if (!rung) break;
      await rung.click();
      /* Stays fixed: Friends animates each clue in for half a second, and the
         measure below is of the panel once it has landed. */
      await wait(500);
    }
    const bought = await page.evaluate(measureProfile);
    t(`${vp[0]}: with every clue bought, they scroll in their own panel and the rest stays on screen`,
      profileOk(bought) && bought.cluesH > 0, profileSay(bought));
    if (process.env.LOCK_SHOTS) await page.screenshot({ path: path.join(process.env.LOCK_SHOTS, `${id}-${vp[0]}-bought.png`) });
    /* THE OWNER'S THREE, 25 Sep 2026, football only (Friends has no career
       list and draws its clues in the profile): the one-line clue above the
       career that scrolls; no empty lines holding the clue panel down; and
       the button beside the box drawn as a button, not the browser's grey. */
    if (id === "whoami") {
      const o = await page.evaluate(() => {
        const r = (e) => e.getBoundingClientRect();
        const boxes = [...document.querySelectorAll("#clues .clue")];
        const career = boxes.findIndex((b) => b.querySelector(".spells"));
        const born = boxes.findIndex((b) => /Born \d{4}/.test(b.textContent));
        const go = document.getElementById("guessGo");
        const pitch = getComputedStyle(document.documentElement).getPropertyValue("--pitch").trim();
        const probe = document.createElement("span"); probe.style.color = pitch; document.body.appendChild(probe);
        const pitchRgb = getComputedStyle(probe).color; probe.remove();
        return { career, born, gap: Math.round(r(document.querySelector(".cluesHead")).top - r(document.querySelector(".guessRow")).bottom),
          goBg: getComputedStyle(go).backgroundColor, pitchRgb, goRight: Math.round(r(go).right), vw: innerWidth };
      });
      t(`${vp[0]}: nationality and year of birth sit above the career, which is last`,
        o.born >= 0 && o.career >= 0 && o.born < o.career, `born at ${o.born}, career at ${o.career}`);
      t(`${vp[0]}: no empty lines between the box and "Need another clue?"`, o.gap >= 0 && o.gap <= 24, `${o.gap}px`);
      t(`${vp[0]}: the button beside the box is drawn as a button, and whole`,
        o.goBg === o.pitchRgb && o.goRight <= o.vw, `background ${o.goBg} against the pitch's ${o.pitchRgb}, right edge ${o.goRight} of ${o.vw}`);
    }
    await context.close();
  }

  console.log(`\n${id}: the old-link banner`);
  {
    const { page, context } = await openProfile(game, VIEWPORTS[1]);
    await bannerCheck(page, id === "whoami_fr" ? "whoami_fr" : "whoami", VIEWPORTS[1][0], profileOk, profileSay, measureProfile);
    await context.close();
  }

  console.log(`\n${id}: the way out, and back`);
  {
    const { page, context } = await openProfile(game, VIEWPORTS[1]);
    await page.evaluate(() => {
      const st = document.createElement("style");
      st.id = "lock-test-big";
      st.textContent = ".profile{min-height:900px!important}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
    });
    await until(page, isUnlocked);
    const big = await page.evaluate(isLocked);
    t("a round too large to fit unlocks the page rather than cutting it off", big === false, "locked " + big);
    await page.evaluate(() => {
      document.getElementById("lock-test-big").remove();
      dispatchEvent(new Event("resize"));
    });
    await until(page, isLocked);
    const back = await page.evaluate(isLocked);
    t("and relocks when it goes", back === true, "locked " + back);
    await context.close();
  }

  console.log(`\n${id}: Full Time`);
  /* 360x640 included: there the result is longer than the screen and must
     scroll inside itself -- the case that proves the page does not unlock
     merely because its result panel scrolls. */
  for (const vp of [VIEWPORTS[0], VIEWPORTS[1], VIEWPORTS[3]]) {
    const { page, context } = await openProfile(game, vp);
    page.on("dialog", (d) => d.accept());
    await page.click("#giveUp");
    await page.waitForFunction(() => !document.getElementById("screenDone").hidden, null, { timeout: 10000 });
    /* Stays fixed: Full Time's room check keeps the page locked when it works. */
    await wait(600);
    const m = await page.evaluate(measureProfile);
    t(`${vp[0]}: Full Time is locked and the page does not scroll; the result scrolls in itself`,
      m.locked && m.scrollY <= 1 && m.scrollX <= 1 && m.screen === "screenDone", profileSay(m));
    await context.close();
  }
}

/* ---- a word search ---------------------------------------------------------- */
function measureWS() {
  const rect = (e) => e.getBoundingClientRect();
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden";
  const grid = document.getElementById("grid"), shell = document.getElementById("gridShell");
  const g = rect(grid), sh = rect(shell);
  const cell = document.querySelector("#grid .cell");
  const words = [...document.querySelectorAll("#wordList .word")].filter(vis);
  const offscreen = [...document.querySelectorAll(".toolbar, #gridShell, .bonusBox")].concat(words)
    .filter(vis).filter((e) => { const r = rect(e); return r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1; }).length;
  return {
    locked: document.body.classList.contains("locked"),
    scrollY: document.documentElement.scrollHeight - innerHeight,
    scrollX: document.documentElement.scrollWidth - innerWidth,
    boardWhole: g.top >= sh.top - 1 && g.bottom <= sh.bottom + 1 && g.left >= sh.left - 1 && g.right <= sh.right + 1,
    cell: cell ? Math.round(rect(cell).width) : 0,
    words: words.length,
    offscreen,
    /* THE BOARD'S CARD SPANS THE COLUMN AND THE BOARD SITS IN ITS MIDDLE. On a
       phone the board is sized by its height (fourteen rows), so it is
       narrower than the screen; in the app at 412 (25 Sep 2026) its card
       hugged it against the left edge with 90px of nothing to its right. */
    spread: (() => {
      const card = rect(document.querySelector(".boardWrap")), col = rect(document.querySelector("#gameApp>main.main"));
      const side = rect(document.querySelector(".side"));
      const beside = side.height > 0 && side.top < card.bottom && side.bottom > card.top;
      /* What the names do not take, the card takes: the column's width on a
         phone, where they sit above it, and the column less the names and a
         gap where they sit beside it. */
      const free = col.width - card.width - (beside ? side.width : 0);
      const l = g.left - sh.left, r = sh.right - g.right;
      return free <= (beside ? 40 : 2) && Math.abs(l - r) <= 4;
    })(),
  };
}
const wsOk = (m) => m.locked && m.scrollY <= 1 && m.scrollX <= 1 && m.boardWhole && m.spread && m.cell >= 22 && m.words === 11 && m.offscreen === 0;
const wsSay = (m) => `locked ${m.locked}, scroll ${m.scrollY}/${m.scrollX}, board ${m.boardWhole ? "whole" : "NOT WHOLE"}${m.spread ? "" : " and NOT CENTRED IN A FULL-WIDTH CARD"} at ${m.cell}px a square, ${m.words} names, off screen ${m.offscreen}`;
async function openWS(game, [name, viewport, touch]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(ORIGIN + game.path, { waitUntil: "networkidle" });
  await page.click("#homeDaily");
  await page.waitForSelector("#grid .cell", { timeout: 10000 });
  if (await page.$eval("#kickCover", (e) => !e.classList.contains("hidden"))) await page.click("#kickBtn");
  /* Stays fixed: the round is locked BEFORE its room check, which may only
     take that away, and the board is fitted again by an observer after it. */
  await wait(800);
  return { page, context };
}
for (const [id, game] of Object.entries(LOCKED).filter(([k, g]) => g.kind === "wordsearch" && (!ONLY || k === ONLY))) {
  console.log(`\n${id}: in play`);
  for (const vp of VIEWPORTS) {
    const { page, context } = await openWS(game, vp);
    const m = await page.evaluate(measureWS);
    if (vp[0] === "phone-360") {
      /* The one size this board may not fit: eleven names and a 12x14 board
         on 360x640. It must either fit locked, or fall back to scrolling at
         the board's own width fit -- never lock with squares too small to
         drag across. */
      t(`${vp[0]}: fits locked, or falls back to scrolling with squares of 22px or more`,
        wsOk(m) || (!m.locked && m.cell >= 22), wsSay(m));
    } else {
      t(`${vp[0]}: locked, no scroll, the whole board in its card, all eleven names and the toolbar on screen`, wsOk(m), wsSay(m));
    }
    await context.close();
  }

  console.log(`\n${id}: the old-link banner and How to play`);
  {
    const { page, context } = await openWS(game, VIEWPORTS[1]);
    await bannerCheck(page, id, VIEWPORTS[1][0], wsOk, wsSay, measureWS);
    await context.close();
  }
  {
    const { page, context } = await openWS(game, VIEWPORTS[1]);
    await howCheck(page, VIEWPORTS[1][0]);
    await context.close();
  }

  console.log(`\n${id}: the way out, and back`);
  {
    const { page, context } = await openWS(game, VIEWPORTS[1]);
    await page.evaluate(() => {
      const st = document.createElement("style");
      st.id = "lock-test-big";
      st.textContent = ".word{font-size:40px!important;padding:20px!important}";
      document.head.appendChild(st);
      dispatchEvent(new Event("resize"));
    });
    await until(page, isUnlocked);
    const big = await page.evaluate(isLocked);
    t("names too large to leave the board room unlock the page rather than shrink the squares past use", big === false, "locked " + big);
    await page.evaluate(() => {
      document.getElementById("lock-test-big").remove();
      dispatchEvent(new Event("resize"));
    });
    await until(page, isLocked);
    const back = await page.evaluate(isLocked);
    t("and relocks when it goes", back === true, "locked " + back);
    await context.close();
  }

  console.log(`\n${id}: Full Time`);
  for (const vp of [VIEWPORTS[0], VIEWPORTS[3]]) {
    const { page, context } = await openWS(game, vp);
    /* The result card is shown as the game shows it, by its class: what is
       under test is where it sits, not how a board is finished. */
    const m = await page.evaluate(async () => {
      document.getElementById("result").classList.add("show");
      /* Stays fixed: the result fades in on a transition, and is read once
         it has run. */
      await new Promise((r) => setTimeout(r, 300));
      const r = document.querySelector("#result .modal").getBoundingClientRect();
      return { locked: document.body.classList.contains("locked"), scroll: document.documentElement.scrollHeight - innerHeight,
        top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight };
    });
    t(`${vp[0]}: the Full Time card sits inside the screen`, m.top >= 0 && m.bottom <= m.vh + 1, JSON.stringify(m));
    await context.close();
  }
}

/* ---- a board's own address, EVERY GAME ------------------------------------
   /<theme>/<game>/daily/<no> is what the archive pages and the sitemap give a
   board. It has regressed game by game: Ballpark kicked off TODAY'S board
   under "Today's eleven" and Codeword named the right board "Today's board"
   (24 Sep 2026); QuickFire had the first fault until v001n; and Grid and Who
   Am I played today's board at /daily/4 under "TODAY" until v002m / v001o
   (found in the app, 25 Sep 2026). So it is asked of every game at once.
   THE LIST IS THE TREE: every functions/<theme>/<game>/daily route must have
   a row here, so a new game's permalink is refused until somebody says how it
   asks for a board -- a registry that only loops its own rows would pass the
   game it never reached.
   Each row says how the page asks the server for the board (by number, and
   Word Search by the archive list it resolves the number from) and, where the
   fixture server has that board, which element names it. The day asked for is
   YESTERDAY, derived: a board every fixture has, and never today's. */
const PERMA_N = dailyNumber() - 1;
const PERMA = {
  "football/ballpark":  { start: "#homeDaily", asks: `/api/ballpark/daily?no=${PERMA_N}`, label: "#startKicker" },
  "football/codeword":  { asks: `/api/codeword/daily?no=${PERMA_N}`, label: "#cwTodayKicker" },
  "football/crossword": { asks: `/api/daily?no=${PERMA_N}` },
  "football/grid":      { asks: `/api/grid/daily?no=${PERMA_N}`, label: "#gdKicker" },
  "football/hilo":      { asks: `/api/hilo/daily?no=${PERMA_N}` },
  "football/quickfire": { asks: `/api/quickfire/daily?no=${PERMA_N}` },
  "football/scrambled": { asks: `/api/scrambled/daily?no=${PERMA_N}`, label: "#startKicker" },
  "football/vowels":    { asks: `/api/scrambled/daily?no=${PERMA_N}&cy=1`, label: "#startKicker" },
  "football/whoami":    { asks: `/api/whoami/daily?no=${PERMA_N}`, label: "#waTodayKicker", title: "#waToday .hc-title" },
  "football/wordsearch": { asks: "/api/wordsearch/archive" },
  "friends/crossword":  { asks: `/api/crossword/crossword_fr/daily?no=${PERMA_N}` },
  "friends/whoami":     { asks: `/api/whoami/whoami_fr/daily?no=${PERMA_N}`, label: "#waTodayKicker", title: "#waToday .hc-title" },
};
if (!ONLY || ONLY === "perma") {
  console.log(`\na board's own address, every game (board ${PERMA_N})`);
  const routes = [];
  for (const theme of fs.readdirSync(path.join(ROOT, "functions"))) {
    const dir = path.join(ROOT, "functions", theme);
    if (theme.startsWith("_") || theme === "api" || !fs.statSync(dir).isDirectory()) continue;
    for (const g of fs.readdirSync(dir)) {
      if (fs.existsSync(path.join(dir, g, "daily"))) routes.push(`${theme}/${g}`);
    }
  }
  t("the walk found the permalink routes (a walk that finds nothing passes everything)", routes.length >= 12, routes.length + " routes");
  const missing = routes.filter((r) => !PERMA[r]);
  t("every game with a /daily/<no> route has a row here", missing.length === 0, missing.join(", ") || "all placed");
  for (const r of routes.filter((x) => PERMA[x])) {
    const row = PERMA[r];
    const context = await browser.newContext({ viewport: VIEWPORTS[1][1], hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const asked = [];
    page.on("request", (q) => { const u = new URL(q.url()); if (u.pathname.startsWith("/api/")) asked.push(u.pathname + u.search); });
    await page.goto(ORIGIN + `/${r}/daily/${PERMA_N}`, { waitUntil: "load" });
    /* Until the page has asked for its board (a game that asks only when
       started is asked below) and named it: the label is written once, from
       the board, with the title in the same breath. */
    if (!row.start) await untilHere(() => asked.includes(row.asks));
    if (row.label) {
      await until(page, ([sel, n]) => {
        const e = document.querySelector(sel);
        return !!e && new RegExp("#\\s?" + n + "\\b").test(e.textContent);
      }, [row.label, PERMA_N]);
    }
    const said = row.label ? await page.$eval(row.label, (e) => e.textContent.replace(/\s+/g, " ").trim()).catch(() => "(no such element)") : null;
    const titled = row.title ? await page.$eval(row.title, (e) => e.textContent.replace(/\s+/g, " ").trim()).catch(() => "(no such element)") : null;
    if (row.start && !asked.includes(row.asks)) {
      await page.click(row.start);
      await untilHere(() => asked.includes(row.asks));
    }
    t(`${r}: /daily/${PERMA_N} asks the server for that board`, asked.includes(row.asks),
      asked.includes(row.asks) ? row.asks : "asked " + JSON.stringify(asked.filter((a) => !/season|auth|played/.test(a)).slice(0, 6)));
    if (row.label) {
      t(`${r}: and the page names board ${PERMA_N}, not today's`,
        new RegExp(`#\\s?${PERMA_N}\\b`).test(said) && !/today/i.test(said), said);
    }
    /* The line under the kicker too: Who Am I's said "Today's eleven" over
       board 4 after its kicker was fixed (found in the app, 25 Sep 2026). */
    if (row.title) {
      t(`${r}: and the card's title does not call it today's`, titled !== "(no such element)" && titled.length > 0 && !/today/i.test(titled), titled);
    }
    await context.close();
  }
}

/* ---- the crossword's clues, by size --------------------------------------
   The crossword was locked before this suite existed and render_test measures
   its board; what is proved here is the owner's layout rule of 24 Sep 2026 --
   the bigger screens are "upscaled versions with maybe a little change in the
   layout": a phone has the one clue under the board, a big screen has every
   clue to the right, and an iPad held upright has every clue UNDER the board
   ("lets try all clues under board"), without the squares shrinking to fit. */
async function openCrossword([name, viewport, touch]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(ORIGIN + "/football/crossword/", { waitUntil: "networkidle" });
  const via = page.locator("#dailyBtn");
  if (await via.count()) await via.evaluate((el) => el.click());
  await page.waitForSelector("#kickOffBtn:not([disabled])", { timeout: 12000 });
  await page.click("#kickOffBtn");
  await page.waitForFunction(() => !document.querySelector("#startOverlay")?.classList.contains("show"), null, { timeout: 8000 });
  /* Stays fixed: the crossword fits its board and clue panel with nothing
     here that says when it has finished. */
  await wait(800);
  return { page, context };
}
function measureClues() {
  const vis = (e) => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0;
  const r = (e) => e.getBoundingClientRect();
  const block = document.getElementById("cluesBlock"), wrap = document.querySelector(".grid-wrap");
  const cell = [...document.querySelectorAll(".cell")].find((c) => vis(c) && !c.classList.contains("block"));
  const b = vis(block) ? r(block) : null, w = r(wrap);
  return {
    shown: vis(block),
    under: !!b && b.top >= w.bottom - 1,
    right: !!b && b.left >= w.right - 1,
    inside: !!b && b.top >= 0 && b.bottom <= innerHeight + 1,
    lists: block ? block.querySelectorAll(".clue-col").length : 0,
    items: block ? block.querySelectorAll("li").length : 0,
    cell: cell ? Math.round(r(cell).width) : 0,
    nowClue: vis(document.getElementById("nowClue")),
    scroll: document.documentElement.scrollHeight - innerHeight,
  };
}
if (!ONLY || ONLY === "crossword") {
  console.log(`\ncrossword: the clues, by size`);
  for (const [label, viewport] of [["ipad-air upright", { width: 820, height: 1180 }], ["ipad upright", { width: 768, height: 1024 }], ["app tablet upright", { width: 720, height: 1055 }]]) {
    const { page, context } = await openCrossword([label, viewport, true]);
    const m = await page.evaluate(measureClues);
    t(`${label}: every clue, under the board, in a panel inside the screen, and the page does not scroll`,
      m.shown && m.under && m.inside && m.lists >= 2 && m.items >= 10 && m.scroll <= 1, JSON.stringify(m));
    t(`${label}: the squares keep their reading size (32px or more) and the current clue is still by the keys`,
      m.cell >= 32 && m.nowClue, JSON.stringify({ cell: m.cell, nowClue: m.nowClue }));
    /* THE BOARD KEEPS THE HEIGHT. Found in the app at 720x1055 (25 Sep 2026):
       the masthead, a toolbar wrapped onto two rows and the clue panel left
       the board frame 175px. The masthead goes (its strap moves into the
       bar), the toolbar is one row, and the frame has at least 40% of the
       screen. */
    const room = await page.evaluate(() => {
      const vis = (e) => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0;
      const head = document.querySelector("body > header:not(.xic-bar)");
      const tbar = document.querySelector(".tbar");
      return { masthead: vis(head), tbarH: tbar ? Math.round(tbar.getBoundingClientRect().height) : 0,
        frame: Math.round(document.querySelector(".grid-wrap").getBoundingClientRect().height), vh: innerHeight,
        barTitle: vis(document.querySelector(".cw-bartitle")),
        parts: [...document.querySelectorAll(".stage > *, .stage > * > *")].filter(vis)
          .map((e) => (e.id || e.className || e.tagName).toString().split(" ")[0] + ":" + Math.round(e.getBoundingClientRect().height)).join(" ") };
    });
    t(`${label}: the board frame keeps at least 40% of the screen; the title is in the bar and the toolbar is one row`,
      !room.masthead && room.barTitle && room.tbarH <= 64 && room.frame >= room.vh * 0.4, JSON.stringify(room));
    await context.close();
  }
  {
    const { page, context } = await openCrossword(VIEWPORTS[1]);
    const m = await page.evaluate(measureClues);
    t("phone-412: the one clue under the board, and no list", !m.shown && m.nowClue, JSON.stringify(m));
    /* FIT WORD KEEPS THE BOARD. It hid every cell outside the answer in hand,
       and the owner, 24 Sep 2026: "it looks strange if its just a single
       word ... then you can select them manually". The rest is dimmed, still
       there and still tappable, and tapping one makes it the answer in hand. */
    const fw = await page.evaluate(async () => {
      const inWord = document.body.classList.contains("focus-word");
      const other = [...document.querySelectorAll(".cell")].find((c) =>
        !c.classList.contains("block") && !c.classList.contains("in-word") && c.getBoundingClientRect().width > 0);
      if (!other) return { inWord, other: false };
      const cs = getComputedStyle(other);
      other.setAttribute("data-lock-test", "1");
      const r = other.getBoundingClientRect();
      return { inWord, other: true, opacity: Number(cs.opacity), taps: cs.pointerEvents !== "none",
        label: (document.getElementById("fxFit") || {}).textContent,
        x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    /* A REAL TAP at the square's place on the screen, not a click dispatched
       from script: a script click reaches a cell with pointer-events:none and
       would pass the very rule this is here to refuse. */
    if (fw.other) {
      await page.touchscreen.tap(fw.x, fw.y);
      /* It was picked for being outside the answer in hand. */
      await until(page, () => { const c = document.querySelector("[data-lock-test]");
        return !!c && (c.classList.contains("in-word") || c.classList.contains("active")); });
      fw.nowInWord = await page.$eval("[data-lock-test]", (c) => c.classList.contains("in-word") || c.classList.contains("active"));
    }
    t("phone-412: in Fit word the rest of the board is dimmed, not hidden, and can be tapped",
      fw.inWord && fw.other && fw.opacity > 0.2 && fw.opacity < 1 && fw.taps, JSON.stringify(fw));
    t("phone-412: tapping a dimmed square makes its answer the one in hand", fw.nowInWord, JSON.stringify(fw));
    t("phone-412: the button names the other half of the pair, Fit board", fw.label === "Fit board", String(fw.label));
    /* A LONG PRESS ON A CONTROL SELECTS NOTHING. In the app a held Fit board
       pill selected its words and raised Android's Copy / Share bar over the
       board (25 Sep 2026). */
    const sel = await page.evaluate(() => ["#fxFit", ".fx-zoom button", ".osk button", ".nc-arrow"].map((q) => {
      const e = document.querySelector(q);
      return q + ":" + (e ? getComputedStyle(e).userSelect : "missing");
    }));
    t("phone-412: the board's controls and keys cannot be selected as text", sel.every((x) => x.endsWith(":none")), sel.join(" "));
    await context.close();
  }
  {
    const { page, context } = await openCrossword(VIEWPORTS[3]);
    const m = await page.evaluate(measureClues);
    t("desktop: every clue, to the right of the board", m.shown && m.right && m.inside && m.lists >= 2, JSON.stringify(m));
    await context.close();
  }
  /* THE OLD-LINK BANNER IS ONE LINE HERE TOO. The crossword's play screen is
     body.flex-layout, not body.locked, so the shared one-line rules missed it
     and an old link's banner stood as a two-line sentence over the board
     (found in the app on an upright tablet, 25 Sep 2026). */
  for (const vp of [VIEWPORTS[1], ["app tablet upright", { width: 720, height: 1055 }, true]]) {
    const { page, context } = await openCrossword(vp);
    const b = await page.evaluate(async () => {
      window.XIChrome.permalink.aged("crossword", 4);
      dispatchEvent(new Event("resize"));
      /* Stays fixed: the check is that the board's refit does NOT scroll. */
      await new Promise((r) => setTimeout(r, 400));
      const box = document.querySelector(".xic-aged");
      const vis = (sel) => { const e = box && box.querySelector(sel); return !!e && getComputedStyle(e).display !== "none"; };
      return { there: !!box, h: box ? Math.round(box.getBoundingClientRect().height) : 0,
        short: vis(".xic-aged-short"), long: vis(".xic-aged-long"),
        scroll: document.documentElement.scrollHeight - innerHeight };
    });
    t(`${vp[0]}: an old-link banner over the crossword is one short line and the page does not scroll`,
      b.there && b.short && !b.long && b.h <= 50 && b.scroll <= 1, JSON.stringify(b));
    await context.close();
  }
}

await browser.close();
server.close();
done();
