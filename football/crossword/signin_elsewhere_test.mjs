/* signin_elsewhere_test.mjs — a guest's crossword results reach the account
 * however the player signed in.
 *
 * THE FAULT (owner, Play build, 24 Sep 2026). He finished daily 6 as a guest
 * (86, verified by the server), then signed in from the account sheet on
 * another page. The crossword sent a device's results to the account only from
 * afterSignIn, which runs when the sign-in happens WITH A CROSSWORD PAGE OPEN.
 * Every later visit, signed in, only pulled. The result never left the phone,
 * and a reinstall wiped the only copy. Every other game pushes on every
 * signed-in load; the crossword was the one that did not.
 *
 * WHAT THIS DRIVES, in the real page in jsdom: a device already signed in (the
 * sign-in happened elsewhere) holding a guest result opens the crossword. The
 * result must go to /api/account/migrate, before the pull, with the CSRF
 * header. A signed-out device must send nothing.
 *
 *   node football/crossword/signin_elsewhere_test.mjs        (from the repo root)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import { onRequestGet as apiDaily } from "../../functions/api/daily.js";
import { onRequestGet as apiCategories } from "../../functions/api/categories.js";
import { onRequestGet as apiStatus } from "../../functions/api/status.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css",
  ".js": "text/javascript", ".json": "application/json", ".txt": "text/plain" };
const REAL = { "/api/daily": apiDaily, "/api/categories": apiCategories, "/api/status": apiStatus };
const SERVER_DATE = new Date().toUTCString();

let user = null;
const log = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const send = (obj) => { res.writeHead(200, { "Content-Type": "application/json", Date: SERVER_DATE }); res.end(JSON.stringify(obj)); };
  if (url.pathname.startsWith("/api/")) {
    let raw = ""; for await (const c of req) raw += c;
    log.push({ path: url.pathname, method: req.method, headers: req.headers, body: raw ? JSON.parse(raw) : null });
  }
  if (url.pathname === "/api/auth/session") return send({ user, googleClientId: null });
  if (url.pathname === "/api/account/migrate") return send({ added: 1, skipped: 0 });
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

/* The owner's result, in the shape the crossword itself banks (fcw.results.v1). */
const GUEST = [{ dailyNo: 6, score: 86, elapsedSeconds: 131, checks: 0, checkAlls: 0,
  revealedLetters: 0, revealedAnswers: 0, club: "Aston Villa", completedAt: "2026-09-23T23:31:02.000Z" }];

async function open() {
  const dom = await JSDOM.fromURL(origin + "/", {
    runScripts: "dangerously", pretendToBeVisual: true, resources: "usable",
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      w.scrollTo = () => {}; w.scrollBy = () => {};
      w.fetch = (u, o) => fetch(String(u).startsWith("http") ? u : origin + u, o);
      w.localStorage.clear();
      w.localStorage.setItem("fcw.results.v1", JSON.stringify(GUEST));
    },
  });
  await wait(5000);
  return dom;
}

console.log("Signed in elsewhere, then the crossword opened");
{
  user = { id: "u-owner", displayName: "Graeme" }; log.length = 0;
  const dom = await open();
  const pushes = log.filter((e) => e.path === "/api/account/migrate");
  t("THE REPORTED FAULT: the device's guest result goes to the account on load",
    pushes.length === 1 && pushes[0].body && (pushes[0].body.results || []).some((r) => r.dailyNo === 6 && r.score === 86),
    `${pushes.length} upload(s)`);
  t("with the CSRF header", pushes[0] && (pushes[0].headers["x-xi-games"] === "1" || pushes[0].headers["x-crossword-xi"] === "1"));
  const iPush = log.findIndex((e) => e.path === "/api/account/migrate");
  const iPull = log.findIndex((e) => e.path.startsWith("/api/account/") && e.path !== "/api/account/migrate" && e.method === "GET");
  t("pushed before the pull, so the pull brings back what was just sent",
    iPush > -1 && (iPull === -1 || iPush < iPull), `push #${iPush}, pull #${iPull}`);
  dom.window.close();
}

console.log("\nSigned out");
{
  user = null; log.length = 0;
  const dom = await open();
  t("a signed-out device sends nothing: its results stay on the device",
    !log.some((e) => e.path === "/api/account/migrate"));
  dom.window.close();
}

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
