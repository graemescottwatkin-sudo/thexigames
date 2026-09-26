/* renumbered_test.mjs — a crossword result from before the numbering restarted
 * is not a result for the board that holds its number now.
 *
 * THE FAULT (owner, 26 Sep 2026). Every game went back to board 1 on 18
 * September (c2c8ffc). The owner had finished the OLD #9 on 3 September, 36
 * points; a device still holding it posted it to the account on 24 September
 * as daily:9. On the 26th a different #9 ran, and the crossword said "You have
 * already played this one and scored 36", the hub ticked Crossword as
 * completed, and the account would have refused the real #9 as a duplicate.
 *
 * WHAT THIS PROVES, by execution:
 *   1. the server's rule (beforeItsBoard in functions/_lib/games.js) and the
 *      browser's (XIPlayed.beforeItsBoard in shared/xi-played.js) agree, over
 *      the owner's five real rows and the honest rows either side of them;
 *   2. /api/account/migrate writes none of the five and every honest row;
 *   3. in the real page in jsdom, a stale row for today's number no longer
 *      raises the "already played" confirm, is set aside once under
 *      fcw.results.retired, and is not pushed — while an honest row for today
 *      still raises the confirm, so the stub is proved able to see one;
 *   4. the hub's probe reads it as not played, and every caller hands the
 *      probe the payload it needs to say so;
 *   5. while the account still holds it, a pull through the real
 *      /api/account/results does not let it overwrite a real result for the
 *      same number — "the account's row wins outright" would otherwise replace
 *      today's real #9 with the #9 of 3 September.
 *
 *   node football/crossword/renumbered_test.mjs        (from the repo root)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { localResources } from "../../tools/local_resources.js";

import { beforeItsBoard } from "../../functions/_lib/games.js";
import { dailyDayKey, dailyNumber } from "../../functions/_lib/daily.js";
import { onRequestPost as migrate } from "../../functions/api/account/migrate.js";
import { onRequestGet as accountResults } from "../../functions/api/account/results.js";
import { onRequestGet as apiDaily } from "../../functions/api/daily.js";
import { onRequestGet as apiCategories } from "../../functions/api/categories.js";
import { onRequestGet as apiStatus } from "../../functions/api/status.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const shift = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

/* THE BROWSER'S RULE, loaded as the page loads it. */
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "shared/xi-played.js"), "utf8"), { window: win });
const XIPlayed = win.XIPlayed;
t("shared/xi-played.js exports beforeItsBoard", !!(XIPlayed && typeof XIPlayed.beforeItsBoard === "function"));

/* The owner's five rows as production holds them (read 26 Sep 2026), and the
   honest rows either side: the old-rule row a day late (board 3 at 00:20 BST,
   on the account as 21 Sep), a row a day early (a device west of UTC dated it
   by its own evening), a row on its day, an archive board played later, and
   rows with no date or a malformed one. */
const STALE = [
  { mode: "daily", dailyNo: 7, date: "2026-09-01", score: 74 },
  { mode: "daily", dailyNo: 9, date: "2026-09-03", score: 36 },
  { mode: "daily", dailyNo: 10, date: "2026-09-04", score: 96 },
  { mode: "daily", dailyNo: 12, date: "2026-09-06", score: 63 },
  { mode: "daily", dailyNo: 14, date: "2026-09-08", score: 94 },
];
const HONEST = [
  { mode: "daily", dailyNo: 3, date: "2026-09-21", score: 80 },
  { mode: "daily", dailyNo: 4, date: shift(dailyDayKey(4), -1), score: 70 },
  { mode: "daily", dailyNo: 5, date: dailyDayKey(5), score: 60 },
  { mode: "daily", dailyNo: 6, date: shift(dailyDayKey(6), 10), score: 50 },
  { mode: "daily", dailyNo: 8, score: 40 },
  { mode: "daily", dailyNo: 11, date: "yesterday", score: 30 },
];

console.log("One rule, stated twice, agreeing");
{
  const server = (r) => beforeItsBoard("crossword", r);
  const browser = (r) => XIPlayed.beforeItsBoard(r, dailyDayKey(r.dailyNo));
  t("the server refuses all five of the owner's rows", STALE.every(server),
    STALE.filter((r) => !server(r)).map((r) => r.dailyNo).join(",") || "all");
  t("the browser sets aside all five", STALE.every(browser),
    STALE.filter((r) => !browser(r)).map((r) => r.dailyNo).join(",") || "all");
  t("the server keeps every honest row", !HONEST.some(server),
    HONEST.filter(server).map((r) => r.dailyNo).join(",") || "none refused");
  t("the browser keeps every honest row", !HONEST.some(browser),
    HONEST.filter(browser).map((r) => r.dailyNo).join(",") || "none set aside");
  t("only the crossword is judged: another game's row with the same fields passes",
    !beforeItsBoard("scrambled", STALE[1]));
}

console.log("/api/account/migrate, executed");
{
  const inserted = [];
  const DB = {
    prepare(sql) {
      let binds = [];
      const st = {
        bind(...a) { binds = a; return st; },
        async first() { return /FROM sessions/.test(sql) ? { id: "u-owner", club: "Aston Villa" } : null; },
        async run() { if (/INSERT OR IGNORE INTO results/.test(sql)) inserted.push(binds); return {}; },
      };
      return st;
    },
  };
  const body = { game: "crossword", results: [...STALE, ...HONEST] };
  const res = await migrate({
    request: new Request("http://127.0.0.1/api/account/migrate", {
      method: "POST", body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", "X-XI-Games": "1", Cookie: "cxi_session=s1" } }),
    env: { DB },
  });
  const out = await res.json();
  const keys = inserted.map((b) => b[3]);
  t("it answers", res.status === 200, `status ${res.status}`);
  t("THE REPORTED FAULT: none of the five reaches the account",
    !STALE.some((r) => keys.includes("daily:" + r.dailyNo)), keys.join(","));
  t("every honest row does", HONEST.every((r) => keys.includes("daily:" + r.dailyNo)),
    `${keys.length} written of ${HONEST.length}`);
  t("and it counts them as skipped", out.added === HONEST.length && out.skipped === STALE.length,
    JSON.stringify(out));
}

console.log("The hub's probe");
{
  const probe = XIPlayed.PROBE.find((p) => p.id === "crossword");
  const n = 9, payload = { dailyNo: n, day: dailyDayKey(n) };
  t("the old #9 is not today's #9", probe.done(STALE[1], n, payload) === false);
  t("a #9 dated its own day is", probe.done({ mode: "daily", dailyNo: n, date: dailyDayKey(n) }, n, payload) === true);
  t("a #9 with no date is (a row from before rows were dated)", probe.done({ dailyNo: n }, n, payload) === true);
  /* The probe needs the payload's day; a caller that does not pass it reads
     every stale row as played, which is the fault again. Every call site,
     from the code with comments stripped. */
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const sites = [
    ["shared/xi-played.js", strip(fs.readFileSync(path.join(ROOT, "shared/xi-played.js"), "utf8"))],
    ["football/index.html", strip(fs.readFileSync(path.join(ROOT, "football/index.html"), "utf8"))],
  ];
  for (const [f, src] of sites) {
    const calls = src.match(/\.done\(([^)]*)\)/g) || [];
    t(`${f}: every call of done() passes the payload`,
      calls.length > 0 && calls.every((c) => /,\s*payload\s*\)$/.test(c)), calls.join(" ") || "no call found");
  }
}

/* ---------- the real page ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css",
  ".js": "text/javascript", ".json": "application/json", ".txt": "text/plain" };
const REAL = { "/api/daily": apiDaily, "/api/categories": apiCategories, "/api/status": apiStatus };
/* ONE reading of the day, handed to both sides: the page takes its day from
   this Date header, and the fixture's rows are built from the same instant. */
const NOW = new Date();
const SERVER_DATE = NOW.toUTCString();
const TODAY = dailyNumber(NOW);
const log = [];
/* What the account holds, as D1 rows, served through the real results.js. */
let accountRows = [];
const accountDB = {
  prepare(sql) {
    const st = {
      bind() { return st; },
      async first() { return /FROM sessions/.test(sql) ? { id: "u-owner" } : null; },
      async all() { return { results: /FROM results/.test(sql) ? accountRows : [] }; },
    };
    return st;
  },
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const send = (obj) => { res.writeHead(200, { "Content-Type": "application/json", Date: SERVER_DATE }); res.end(JSON.stringify(obj)); };
  if (url.pathname.startsWith("/api/")) {
    let raw = ""; for await (const c of req) raw += c;
    log.push({ path: url.pathname, method: req.method, body: raw ? JSON.parse(raw) : null });
  }
  if (url.pathname === "/api/auth/session") return send({ user: { id: "u-owner", displayName: "Owner" }, googleClientId: null });
  if (url.pathname === "/api/account/migrate") return send({ added: 0, skipped: 0 });
  if (url.pathname === "/api/account/results") {
    const out = await accountResults({ request: new Request("http://127.0.0.1" + req.url,
      { headers: { Cookie: "cxi_session=s1" } }), env: { DB: accountDB } });
    res.writeHead(out.status, { "Content-Type": "application/json", Date: SERVER_DATE });
    return res.end(await out.text());
  }
  if (url.pathname.startsWith("/api/account/")) return send({ results: [], user: null });
  const fn = REAL[url.pathname];
  if (fn) {
    const out = await fn({ request: new Request("http://127.0.0.1" + req.url, { method: req.method }), env: {} });
    res.writeHead(out.status, { "Content-Type": "application/json", Date: SERVER_DATE });
    return res.end(await out.text());
  }
  if (url.pathname.startsWith("/api/")) return send({});
  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = rel.startsWith("/shared/") ? path.join(ROOT, rel.slice(1)) : path.join(DIR, rel);
  const SHARED = path.join(ROOT, "shared");
  if ((!file.startsWith(DIR) && !file.startsWith(SHARED)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { Date: SERVER_DATE }); return res.end("not found");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", Date: SERVER_DATE });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (ok, ms = 10000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await wait(20);
  return ok();
};
const pushes = () => log.filter((e) => e.path === "/api/account/migrate");
const pulled = () => log.some((e) => e.path === "/api/account/results" && e.method === "GET");

async function open(rows) {
  log.length = 0;
  const confirms = [];
  const dom = await JSDOM.fromURL(origin + "/", {
    runScripts: "dangerously", pretendToBeVisual: true, resources: localResources(),
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      w.scrollTo = () => {}; w.scrollBy = () => {};
      w.fetch = (u, o) => fetch(String(u).startsWith("http") ? u : origin + u, o);
      w.confirm = (m) => { confirms.push(String(m)); return false; };
      w.localStorage.clear();
      w.localStorage.setItem("fcw.results.v1", JSON.stringify(rows));
    },
  });
  await until(() => dom.window.document.readyState === "complete" && pushes().length && pulled(), 30000);
  await wait(500);
  return { dom, confirms };
}
const read = (dom, k) => { try { return JSON.parse(dom.window.localStorage.getItem(k) || "null"); } catch (e) { return null; } };

console.log(`The page, on today's board #${TODAY}`);
{
  const old = { mode: "daily", dailyNo: TODAY, date: shift(dailyDayKey(TODAY), -23), score: 36,
    elapsedSeconds: 20064, complete: true };
  const prev = { mode: "daily", dailyNo: Math.max(1, TODAY - 1), date: dailyDayKey(Math.max(1, TODAY - 1)),
    score: 88, elapsedSeconds: 300, complete: true };
  const { dom, confirms } = await open([old, prev]);
  const body = (pushes()[0] || {}).body || {};
  t("the push carries the honest row", (body.results || []).some((r) => r.dailyNo === prev.dailyNo && r.score === 88),
    `${pushes().length} push(es)`);
  t("THE REPORTED FAULT: the push does not carry the old #" + TODAY,
    !(body.results || []).some((r) => r.dailyNo === TODAY));
  const kept = read(dom, "fcw.results.v1") || [];
  const retired = read(dom, "fcw.results.retired") || [];
  t("it is gone from the results list", !kept.some((r) => r && r.dailyNo === TODAY) && kept.some((r) => r && r.dailyNo === prev.dailyNo),
    JSON.stringify(kept.map((r) => r && r.dailyNo)));
  t("and kept, once, under fcw.results.retired",
    retired.filter((r) => r && r.dailyNo === TODAY && r.score === 36).length === 1, `${retired.length} retired`);
  dom.window.document.getElementById("homeDaily").click();
  await wait(300);
  t("THE REPORTED FAULT: today's board opens without \"already played\"", confirms.length === 0,
    confirms[0] ? JSON.stringify(confirms[0].slice(0, 60)) : "");
  dom.window.close();
}
{
  /* THE CONTROL: the same stub has to be able to see the confirm, or the
     absence above proves nothing. */
  const mine = { mode: "daily", dailyNo: TODAY, date: dailyDayKey(TODAY), score: 77, complete: true };
  const { dom, confirms } = await open([mine]);
  dom.window.document.getElementById("homeDaily").click();
  await wait(300);
  t("control: an honest result for today still raises it, with its score",
    confirms.length === 1 && /scored 77/.test(confirms[0]), `${confirms.length} confirm(s)`);
  t("control: and nothing honest is set aside", !(read(dom, "fcw.results.retired") || []).length);
  dom.window.close();
}

{
  /* THE PULL. The owner's old #9 as production holds it, and a real #9 on
     this device. */
  accountRows = [{ mode: "daily", daily_no: TODAY, played_on: shift(dailyDayKey(TODAY), -23), score: 36,
    elapsed_seconds: 20064, checks: 0, check_alls: 0, revealed_letters: 0, revealed_answers: 0,
    substitutions: 0, pauses: 0, paused_seconds: 0, club: null, season: null, solved: 1,
    completed_at: null, source: "migrated", detail: null }];
  /* And a row this device has not got, played on another. Without one the
     pull finds nothing new and saves nothing (pullAccountResults returns when
     the lengths match), so the overwrite never lands and a guard against it
     cannot be seen working — that is how the first version of this case
     passed with the guard removed. */
  const other = Math.max(1, TODAY - 1);
  accountRows.push({ ...accountRows[0], daily_no: other, played_on: dailyDayKey(other), score: 55,
    elapsed_seconds: 400, source: null });
  const mine = { mode: "daily", dailyNo: TODAY, date: dailyDayKey(TODAY), score: 77, complete: true };
  const { dom, confirms } = await open([mine]);
  await wait(500);
  const kept = (read(dom, "fcw.results.v1") || []).filter((r) => r && r.dailyNo === TODAY);
  t("the pull really landed (the other device's row reached this one)",
    (read(dom, "fcw.results.v1") || []).some((r) => r && r.dailyNo === other && r.score === 55));
  t("THE SECOND HOLE: the account's old #" + TODAY + " does not replace the real one on a pull",
    kept.length === 1 && kept[0].score === 77, JSON.stringify(kept.map((r) => r.score)));
  dom.window.document.getElementById("homeDaily").click();
  await wait(300);
  t("and the confirm reports the real score", confirms.length === 1 && /scored 77/.test(confirms[0]),
    confirms[0] ? JSON.stringify(confirms[0].slice(0, 60)) : "none");
  dom.window.close();
  accountRows = [];
}

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
