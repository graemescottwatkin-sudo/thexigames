/* friends/quickfire/journey_test.mjs — QuickFire XI: Friends, played through.
 *
 * THE GENERATED PAGE AGAINST THE REAL SERVER. The page is football's with the
 * Friends rewrites (tools/build_friendsquickfire.js); its fetch is routed into
 * the real /api/quickfire_fr/* handlers over a SQLite built from every
 * migration, so the round is opened, served, skipped, answered and totalled by
 * the code that ships, in the Friends set's own tables. Nothing about the
 * server is re-stated here.
 *
 * What it holds the page to, the owner's rulings of 30 Sep 2026:
 *   - "Seconds, same pace": a countdown in seconds; what a right answer took
 *     and a wrong one cost, in seconds; never a 90' clock or a minute.
 *   - "Skip": the three substitutions, in those words, free, and a skipped
 *     question answered as the question the skip brought on.
 *   - Friends words, not football's; its own storage prefix and result key; no
 *     season.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const done = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };

let JSDOM, sqlite;
try { ({ JSDOM } = await import("jsdom")); } catch (e) { JSDOM = null; }
try { sqlite = await import("node:sqlite"); } catch (e) { sqlite = null; }
/* ABSENT IS NOT A PASS. */
if (!JSDOM || !sqlite) { t("jsdom and node:sqlite are available", false, `jsdom ${!!JSDOM}, sqlite ${!!sqlite}`); done(); }

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const html = read("friends/quickfire/index.html");
const game = read("friends/quickfire/js/game.js");
const config = read("friends/quickfire/js/config.js");
const fulltime = read("shared/xi-fulltime.js");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { today } = await imp("functions/_lib/qfdata.js");
const routes = {};
for (const name of ["daily", "archive", "play", "next", "sub", "answer", "finish"]) {
  routes["/api/quickfire_fr/" + name] = await imp(`functions/api/quickfire_fr/${name}.js`);
}

/* ---- the database, as production has it -------------------------------- */
const db = new sqlite.DatabaseSync(":memory:");
const mig = path.join(ROOT, "data", "migrations");
for (const f of fs.readdirSync(mig).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort()) {
  try { db.exec(fs.readFileSync(path.join(mig, f), "utf8")); } catch (e) { /* ALTERs the base already has */ }
}
const env = { DB: { prepare(sql) {
  const make = (args) => ({
    bind: (...a) => make(a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return make([]);
} } };
/* One reading of the day, handed to the seed; the server asks the same today(). */
const DAY = today();
{
  const ins = db.prepare(`INSERT INTO fr_qf_question (id, answer, answer_norm, answer_type, clue, status,
    option_1, option_2, option_3, option_4) VALUES (?, ?, ?, 'person', ?, 'verified', ?, ?, ?, ?)`);
  const slot = db.prepare("INSERT INTO fr_qf_daily_slot (play_date, slot, question_id, role) VALUES (?, ?, ?, ?)");
  for (let i = 1; i <= 14; i++) {
    const id = "EVT" + String(i).padStart(4, "0");
    ins.run(id, `Answer ${i}`, `answer ${i}`, `Friends question ${i}`, `Answer ${i}`, `Wrong ${i}a`, `Wrong ${i}b`, `Wrong ${i}c`);
    slot.run(DAY, i <= 11 ? i : i - 11, id, i <= 11 ? "xi" : "bench");
  }
  db.prepare("INSERT INTO fr_qf_daily (play_date, status) VALUES (?, 'published')").run(DAY);
}

/* ---- the page ------------------------------------------------------------ */
const calls = [];
const dom = new JSDOM(html, { url: "https://www.thexigames.com/friends/quickfire/", runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window, doc = w.document;
w.fetch = async (url, init) => {
  const u = new URL(String(url), "https://www.thexigames.com");
  calls.push(u.pathname);
  const r = routes[u.pathname];
  if (!r) return { ok: false, status: 404, json: async () => ({ error: "not found" }) };
  const request = new Request(u.href, init && init.body ? { method: "POST", body: init.body } : undefined);
  const res = await (init && init.body ? r.onRequestPost : r.onRequestGet)({ request, env });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json: async () => json };
};
w.XIPlays = { start() {}, end() {}, active: () => true };
w.eval(fulltime);
w.eval(config);
/* The pause between questions, shortened for the suite; nothing else moved. */
w.QFX_CONFIG.INTER_QUESTION_MS = 30;
w.eval(game);
const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const until = async (ok, ms = 8000) => { const end = Date.now() + ms; while (!ok() && Date.now() < end) await settle(20); return ok(); };
const click = (el) => el.dispatchEvent(new w.Event("click", { bubbles: true }));
const visible = (id) => { const e = doc.getElementById(id); return !!e && !e.hidden; };
const options = () => [...doc.querySelectorAll("#options .option")];
const pick = async (text) => {
  const b = options().find((x) => x.textContent === text);
  if (!b) return false;
  click(b);
  await until(() => /RIGHT|NO —/.test(doc.getElementById("feedback").textContent));
  return true;
};
const next = async (n) => until(() => doc.getElementById("clue").textContent === `Friends question ${n}`);

console.log("The card");
await until(() => visible("screenStart"));
t("it opens on today's board, from the Friends route", visible("screenStart") && calls.includes("/api/quickfire_fr/daily"), calls.join(","));
t("its button says Start, not Kick off", doc.getElementById("kickOff").textContent.trim() === "Start", doc.getElementById("kickOff").textContent);
t("and the card promises seconds, not a 90' clock", /thirty seconds/.test(doc.getElementById("startBlurb").textContent) &&
  !/90|minute/.test(doc.getElementById("startBlurb").textContent), doc.getElementById("startBlurb").textContent.trim());

console.log("\nA round");
click(doc.getElementById("kickOff"));
await next(1);
t("the first Friends question is on screen, four options", options().length === 4, doc.getElementById("clue").textContent);
const clock = doc.getElementById("clockValue").textContent;
t("the clock counts seconds down from thirty", Number(clock) > 25 && Number(clock) <= 30 &&
  doc.querySelector(".clock .prime").textContent === "s", `${clock}${doc.querySelector(".clock .prime").textContent}`);
await pick("Answer 1");
const fb1 = doc.getElementById("feedback").textContent;
t("a right answer says RIGHT and the seconds it took, not GOAL and a minute", /^RIGHT — \d+s\s+\+10 points$/.test(fb1), fb1);

await next(2);
t("the skip button says Skip", /Skip/.test(doc.getElementById("passQuestion").textContent) &&
  !/Sub/.test(doc.getElementById("passQuestion").textContent), doc.getElementById("passQuestion").textContent.trim());
click(doc.getElementById("passQuestion"));
await until(() => doc.getElementById("clue").textContent === "Friends question 12");
t("a skip says SKIPPED and brings a fresh question on", /^SKIPPED/.test(doc.getElementById("feedback").textContent) &&
  doc.getElementById("clue").textContent === "Friends question 12", doc.getElementById("feedback").textContent);
const skipped = await pick("Answer 12");
const fb2 = doc.getElementById("feedback").textContent;
t("and the skipped-on question is judged as itself: its right answer is RIGHT", skipped && /^RIGHT/.test(fb2), fb2);

await next(3);
await pick("Wrong 3a");
const fb3 = doc.getElementById("feedback").textContent;
/* No time is taken for a wrong pick while football's penalty is 0
   (WRONG_GUESS_MINUTE_PENALTY); the page says so, and names the answer. */
t("a wrong answer scores nothing, costs no time, and names the answer", /^NO — not that one — it was Answer 3$/.test(fb3), fb3);

for (let n = 4; n <= 11; n++) {
  await next(n);
  await pick(`Answer ${n}`);
}
await until(() => visible("screenResults"));

console.log("\nFull time");
const panel = doc.getElementById("ftPanel");
t("the round ends on Full Time, totalled by the Friends route", visible("screenResults") && calls.includes("/api/quickfire_fr/finish"));
const boxes = [...panel.querySelectorAll(".xft-boxes .xft-b")];
t("eleven boxes, ticks where a minute was, no minute anywhere", boxes.length === 11 &&
  boxes.every((b) => !/'/.test(b.textContent)) && boxes.filter((b) => b.textContent === "✓").length === 10,
  boxes.map((b) => b.textContent).join(" "));
t("the skip is the help it used, in its own word", /1 of 3 skip\b/.test(panel.textContent) && !/substitution/.test(panel.textContent),
  (panel.querySelector(".xft-help") || {}).textContent);
t("the average is in seconds", /Average \d+s/.test(panel.textContent), (panel.textContent.match(/Average[^·]*/) || [""])[0]);
t("and it is QuickFire XI: Friends", /QuickFire XI: Friends/.test(panel.querySelector(".xft-name").textContent), panel.querySelector(".xft-name").textContent);

console.log("\nIts own record");
const keys = Object.keys(w.localStorage);
let banked = null;
try { banked = JSON.parse(w.localStorage.getItem("xifq.results.v1") || "null"); } catch (e) { banked = null; }
t("the result is banked under xifq., never football's qfx.", !!banked && !keys.some((k) => k.startsWith("qfx.")), keys.join(","));
t("and the page loads no season: that is football's", !/xi-season\.js/.test(html));
const words = doc.body.textContent;
t("no football word reaches the player: no GOAL, FULL TIME, sub or kick-off",
  !/\bGOAL\b|FULL TIME|SUBBED|substitution|Sub it off|Kick off|football/i.test(words.replace(/Full time/g, "")),
  (words.match(/\bGOAL\b|FULL TIME|SUBBED|substitution|Sub it off|Kick off|football/i) || ["none"])[0]);

done();
