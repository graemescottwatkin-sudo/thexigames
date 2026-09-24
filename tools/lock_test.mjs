/* tools/lock_test.mjs — the play screen does not scroll.
 *
 * THE RULING, 24 Sep 2026, the owner on the Play build: the game should "fit
 * on the screen in whole, much like the crossword, i.e. the screen is fixed,
 * so no scrolling needed" -- for every game, at every size ("even on larger
 * screens its not needed, just change the size of elements to scale up"), and
 * the player cards "always take up a consistent amount of the pitch".
 *
 * WHAT IT PROVES, in real Chromium, for every game in LOCKED, on every sample
 * board, at five sizes (three of them touch, with the family's keyboard up):
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
 * It serves the tree itself -- static files, and functions/api/<path>.js run
 * with env {} so every game falls back to its committed sample boards -- so it
 * needs Chromium and nothing else: no wrangler, no database, no seeding.
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
  scrambled: { path: "/football/scrambled/", api: "/api/scrambled/daily", boards: [1, 2, 3, 4] },
  vowels: { path: "/football/vowels/", api: "/api/scrambled/daily", boards: [1, 2, 3, 4] },
};
/* Not locked yet, by name, so the list of what is left is a fact in the tree
   and not a memory. Moving a game from here to LOCKED is its whole test. */
const PENDING = {
  "football/wordsearch": true, "football/hilo": true, "football/ballpark": true,
  "football/grid": true, "football/codeword": true, "football/quickfire": true,
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
      const out = await fn({ request, env: {}, params: {}, waitUntil() {}, next() {} });
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
for (const [id, game] of Object.entries(LOCKED).filter(([k]) => !ONLY || k === ONLY)) {
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

await browser.close();
server.close();
done();
