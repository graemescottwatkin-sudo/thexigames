/* clock_test.mjs — whose clock says what day it is.
 *
 * THE ANSWER IS THE SERVER'S, and this file is what makes that true rather
 * than intended. The page syncs to the Date header of its own response and
 * counts UTC days from it; the device's calendar is used only when there is no
 * server to ask.
 *
 * The gap this closes: the sync deliberately lands AFTER boot, so the Daily
 * opens instantly and offline play is unaffected. That left the landing tile
 * drawn on the device's clock with nothing to correct it — and on a device
 * whose calendar day runs ahead of UTC, which in the UK is every night of BST
 * between local midnight and UTC midnight, the hero read "TODAY · #12" for an
 * hour while the server was still serving #11. Reported from outside, by
 * somebody building against the site, which is where this kind of fault is
 * always found: it is invisible to anyone who only reads the code, because the
 * code that computes the day is correct. It is the ORDER that was wrong.
 *
 * Both halves are exercised here, and they must disagree before the fix can
 * mean anything: the engine is run at a real instant inside that window on a
 * London clock, and the two paths are watched to name different boards. Then
 * the whole page is loaded with its device clock pushed past the next UTC
 * midnight, and the tile must end up on the SERVER's board.
 *
 *   node football/crossword/clock_test.mjs        (from the repo root)
 */
/* THE ZONE IS PART OF THE FIXTURE, NOT THE MACHINE. The disagreement below
   only exists where the local calendar day can run ahead of UTC, so a suite
   that inherited the runner's zone would prove it on a London laptop and
   quietly prove nothing in CI, which runs in UTC. Set before the first Date
   is made, so it governs every one of them. */
process.env.TZ = "Europe/London";

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { dailyNumber as serverDailyNumber } from "../../functions/_lib/daily.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* ---- 1. the two clocks, and the window where they differ ---------------- */
/* An instant inside BST, after local midnight and before UTC midnight. Not a
   date this suite invents: it is the hour the report described, and the engine
   is the shipped file. */
console.log("The hour when the device and the server disagree");
{
  const WINDOW = Date.parse("2026-09-05T23:53:00Z");   // 00:53 BST on the 6th
  const realNow = Date.now;
  Date.now = () => WINDOW;
  /* Loaded after the clock is faked: the module reads nothing at load time,
     but a future one might, and the order is free. */
  const FCW = require("./js/engine.js");
  FCW.clearTrustedTime();
  const device = FCW.dailyNumber();
  FCW.setTrustedTime(WINDOW);
  const server = FCW.dailyNumber();
  Date.now = realNow;

  t("the device's calendar and the server's UTC day name different boards here",
    device !== server, `device #${device}, server #${server}`);
  t("and it is the SERVER's that agrees with functions/_lib/daily.js",
    server === serverDailyNumber(WINDOW),
    `page #${server}, server #${serverDailyNumber(WINDOW)}`);
  t("the device's is the one that runs ahead",
    device === server + 1, `#${device} vs #${server}`);
}

/* ---- 2. the whole page, with its device clock a day ahead --------------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css",
  ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const ROOT = path.join(DIR, "..", "..");
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  /* The shared layer lives beside the game, not inside it: the page links
     ../shared/, which from the served root is /shared/. Without this every
     shared script 404s and the page runs without them — which is not the page
     the site serves, so nothing measured on it would mean anything. */
  const file = rel.startsWith("/shared/") ? path.join(ROOT, rel.slice(1)) : path.join(DIR, rel);
  if (!(file.startsWith(DIR) || file.startsWith(path.join(ROOT, "shared"))) ||
      !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("not found"); return;
  }
  /* The Date header IS the server's clock as far as the page is concerned —
     the same header the shipped sync reads. Node sends it on every response. */
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  res.end(req.method === "HEAD" ? undefined : fs.readFileSync(file));
});

server.listen(0, "127.0.0.1", async () => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`\nServing ${DIR} at ${origin}`);
  /* FAR ENOUGH TO CROSS, WHATEVER THE HOUR. An hour would only cross a day
     boundary between 23:00 and 00:00 UTC, so at any other time of day the two
     clocks would agree and this check would pass while proving nothing — the
     fault this project has been caught by six times. So the device is pushed
     to one minute past the NEXT UTC midnight: it is a day ahead on every run,
     and the tile has something real to get wrong. */
  const nowMs = Date.now();
  const nextMidnight = Date.UTC(new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate() + 1);
  const AHEAD = nextMidnight - nowMs + 60000;

  const dom = await JSDOM.fromURL(origin + "/", {
    runScripts: "dangerously", pretendToBeVisual: true, resources: "usable",
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      w.scrollTo = () => {}; w.scrollBy = () => {};
      w.fetch = (u, o) => fetch(String(u).startsWith("http") ? u : origin + u, o);
      /* THE DEVICE CLOCK, PUSHED FORWARD. Not the timezone — the instant. An
         hour is enough to cross a day boundary for part of every day, and the
         page cannot tell this apart from a device whose owner set it wrong or
         whose calendar day simply runs ahead. What it CAN tell is that the
         Date header disagrees, which is the whole mechanism under test. */
      const RealDate = w.Date;
      const Fake = function (...a) {
        return a.length ? new RealDate(...a) : new RealDate(RealDate.now() + AHEAD);
      };
      Fake.now = () => RealDate.now() + AHEAD;
      Fake.parse = RealDate.parse; Fake.UTC = RealDate.UTC;
      Fake.prototype = RealDate.prototype;
      w.Date = Fake;
    },
  });
  const w = dom.window, d = w.document;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(7000);

  console.log("\nThe landing tile, on a device whose calendar day is ahead of the server's");
  const FCW = w.FCW;
  const state = FCW.timeState();
  t("the page synced to the server's clock", state.source === "server",
    `${state.source}, offset ${Math.round(state.offsetMs / 1000)}s`);
  t("and the sync undid the whole of the offset it was given",
    Math.abs(state.offsetMs + AHEAD) < 20000,
    `offset ${state.offsetMs}ms against a fake of +${AHEAD}ms`);

  const shown = (d.getElementById("homeDailyKicker") || {}).textContent || "";
  const m = /#(\d+)/.exec(shown);
  const onTile = m ? Number(m[1]) : null;
  /* What the server would say for the real instant, which is the only number
     the tile is allowed to show. */
  const truth = serverDailyNumber(Date.now());
  t("the tile shows the server's board, not the device's",
    onTile === truth, `tile ${shown.trim() || "(empty)"}, server #${truth}`);
  /* AND THE DEVICE REALLY WAS ON ANOTHER BOARD. Without this the check above
     could pass because the two clocks happened to agree, which is a pass that
     proves nothing. Asserted, not noted. */
  t("the device's own clock was on a different board, so there was something to get wrong",
    serverDailyNumber(Date.now() + AHEAD) === truth + 1,
    `device would say #${serverDailyNumber(Date.now() + AHEAD)}, server #${truth}`);

  w.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
