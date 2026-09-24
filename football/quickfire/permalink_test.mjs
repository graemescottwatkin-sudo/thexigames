/* permalink_test.mjs — a QuickFire board's own address opens that board.
 *
 * THE FAULT, found on the Play build, 24 Sep 2026. /football/quickfire/daily/3
 * -- the address the archive page, the sitemap and every other game use for
 * board 3 -- was served the page, and the page read only a #b= fragment, so it
 * asked for TODAY'S board: "Today's Daily ... No. 7" under a link to No. 3.
 * Kick off would have started today's round. And the in-page list of boards
 * that have been linked to #b=N and reloaded on a timer, which in the app's
 * WebView could fire before the fragment landed, leaving the page where it was.
 *
 * WHAT IT PROVES, driving the real page in jsdom against the real functions
 * and a real SQLite (tools/lock_fixtures.mjs: made-up questions, nothing from
 * the bank), with production's shape for a permalink -- the page with a
 * <base href> under /daily/<no>:
 *   - /daily/<no> asks the server for that board and says it is one that has
 *     been, not today's;
 *   - the front page still asks for today's;
 *   - a #b=<no> fragment is still honoured (challenge links, old shares);
 *   - the list of boards links to each board's /daily/<no> address, from the
 *     front page and from a board's own address alike (no /daily/daily/).
 *
 *   node football/quickfire/permalink_test.mjs        (from the repo root)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const done = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let JSDOM;
try { ({ JSDOM } = await import("jsdom")); } catch (e) { JSDOM = null; }
let sqliteOk = true;
try { await import("node:sqlite"); } catch (e) { sqliteOk = false; }
/* ABSENT IS NOT A PASS. */
if (!JSDOM || !sqliteOk) { t("jsdom and node:sqlite are available", false, `jsdom ${!!JSDOM}, sqlite ${sqliteOk}`); done(); }

const { quickfireEnv } = await import(pathToFileURL(path.join(ROOT, "tools", "lock_fixtures.mjs")).href);
const { dailyNumber, dailyDayKey } = await import(pathToFileURL(path.join(ROOT, "functions", "_lib", "daily.js")).href);

/* ONE READING OF THE CLOCK, handed to both sides. */
const NOW = Date.now();
const SERVER_DATE = new Date(NOW).toUTCString();
const TODAY_NO = dailyNumber(NOW);
const PAST_NO = TODAY_NO - 2;
t("the fixture has a past board to open", PAST_NO >= 1, `today No. ${TODAY_NO}, past No. ${PAST_NO}`);
const ENV = await quickfireEnv([0, 1, 2, 3].map((k) => dailyDayKey(TODAY_NO - k)).filter(Boolean));

const asked = [];
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const p = decodeURIComponent(url.pathname);
  try {
    if (p.startsWith("/api/")) {
      if (p === "/api/quickfire/daily") asked.push(url.search);
      const file = path.join(ROOT, "functions", p.replace(/\/$/, "") + ".js");
      if (!fs.existsSync(file)) { res.writeHead(200, { "Content-Type": "application/json", Date: SERVER_DATE }); return res.end("{}"); }
      const mod = await import(pathToFileURL(file).href);
      const fn = mod["onRequest" + req.method[0] + req.method.slice(1).toLowerCase()] || mod.onRequest;
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url.href, { method: req.method, headers: req.headers,
        body: req.method === "GET" || !chunks.length ? undefined : Buffer.concat(chunks) });
      const out = await fn({ request, env: p.startsWith("/api/quickfire/") ? ENV : {}, params: {}, waitUntil() {}, next() {} });
      res.writeHead(out.status, { ...Object.fromEntries(out.headers), Date: SERVER_DATE });
      return res.end(Buffer.from(await out.arrayBuffer()));
    }
    /* A board's own address: the page with a <base>, as permalinkRoute serves it. */
    const perma = /^\/football\/quickfire\/daily(?:\/(\d+))?\/?$/.exec(p);
    if (perma) {
      const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8").replace("<head>", '<head><base href="/football/quickfire/">');
      res.writeHead(200, { "Content-Type": TYPES[".html"], Date: SERVER_DATE });
      return res.end(html);
    }
    let file = path.join(ROOT, p);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", Date: SERVER_DATE });
    res.end(fs.readFileSync(file));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;

async function open(at) {
  asked.length = 0;
  const dom = await JSDOM.fromURL(origin + at, {
    runScripts: "dangerously", pretendToBeVisual: true, resources: "usable",
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      w.scrollTo = () => {};
      w.fetch = (u, o) => fetch(new URL(u, w.location.href), o);
    },
  });
  await wait(3000);
  return dom;
}
const txt = (d, id) => ((d.getElementById(id) || {}).textContent || "").trim();

console.log("A board's own address");
{
  const dom = await open(`/football/quickfire/daily/${PAST_NO}`);
  const d = dom.window.document;
  t(`/daily/${PAST_NO} asks the server for board ${PAST_NO}`, asked.includes(`?no=${PAST_NO}`), JSON.stringify(asked));
  t("and says it is a board that has been, not today's",
    /has been/i.test(txt(d, "startKicker")) && !/today/i.test(txt(d, "startKicker")), txt(d, "startKicker"));
  t(`and names it: No. ${PAST_NO}`, new RegExp(`No\\. ${PAST_NO}\\b`).test(txt(d, "startDate")), txt(d, "startDate"));
  /* The list of boards, from a board's own address: every link is a board's
     address, and none of them is /daily/daily/. */
  d.getElementById("showArchive").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await wait(1500);
  const hrefs = [...d.querySelectorAll("#archiveList a.archiveItem")].map((a) => new URL(a.href).pathname);
  t("from here, the list of boards links to each board's own address",
    hrefs.length >= 3 && hrefs.every((h) => /^\/football\/quickfire\/daily\/\d+$/.test(h)), hrefs.join(" "));
  dom.window.close();
}

console.log("\nThe front page");
{
  const dom = await open("/football/quickfire/");
  const d = dom.window.document;
  t("asks for today's board, with no number", asked.length >= 1 && asked.every((q) => !/no=/.test(q)), JSON.stringify(asked));
  t("and calls it today's", /today/i.test(txt(d, "startKicker")), txt(d, "startKicker"));
  d.getElementById("showArchive").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await wait(1500);
  const hrefs = [...d.querySelectorAll("#archiveList a.archiveItem")].map((a) => new URL(a.href).pathname);
  t("and its list of boards links to each board's own address",
    hrefs.length >= 3 && hrefs.every((h) => /^\/football\/quickfire\/daily\/\d+$/.test(h)) && hrefs.includes(`/football/quickfire/daily/${PAST_NO}`),
    hrefs.join(" "));
  dom.window.close();
}

console.log("\nA fragment, as a challenge link carries it");
{
  const dom = await open(`/football/quickfire/#b=${PAST_NO}`);
  t(`#b=${PAST_NO} still asks for board ${PAST_NO}`, asked.includes(`?no=${PAST_NO}`), JSON.stringify(asked));
  dom.window.close();
}

server.close();
done();
