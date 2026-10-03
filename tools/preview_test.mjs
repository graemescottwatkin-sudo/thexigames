/* tools/preview_test.mjs — the owner's preview of the days to come.
 *
 *   node tools/preview_test.mjs      (from the repo root)
 *
 * The owner, 3 Oct 2026: play the next days of any game "in its proper form"
 * from /admin/, every game, recording nothing. The preview lifts the one
 * bound that keeps a future board private, so this suite is mostly about who
 * it is NOT lifted for: no header, a header without an admin session, a day
 * out of range -- each must be served exactly as the real day, and the admin
 * pages must answer a stranger with the site's ordinary 404.
 *
 * Executed, not read: the real handlers over SQLite built from every
 * migration, the real middleware, the real admin route, and the page layer in
 * jsdom. Games are added to the QuickFire block's shape as they are wired.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const done = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };

let sqlite = null, JSDOM = null;
try { sqlite = await import("node:sqlite"); } catch (e) { sqlite = null; }
try { ({ JSDOM } = await import("jsdom")); } catch (e) { JSDOM = null; }
if (!sqlite) { console.log("node:sqlite is required: this suite executes real SQL. Not a pass."); process.exit(1); }

const P = await imp("functions/_lib/preview.js");
const { utcDay } = await imp("functions/_lib/daily.js");
const DAY = 86400000;
const NOW = Date.now();
const TODAY = utcDay(NOW);
const AHEAD = utcDay(NOW + 5 * DAY);

/* ---- the database, as production has it -------------------------------- */
const db = new sqlite.DatabaseSync(":memory:");
const MIG = path.join(ROOT, "data", "migrations");
for (const f of fs.readdirSync(MIG).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort()) {
  const text = fs.readFileSync(path.join(MIG, f), "utf8").split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
  for (const st of text.split(/;\s*(?:\n|$)/).map((x) => x.trim()).filter(Boolean)) {
    try { db.exec(st); } catch (e) { if (!/duplicate column/i.test(e.message)) throw new Error(`${f}: ${e.message}`); }
  }
}
const env = {
  DB: { prepare(sql) {
    const make = (args) => ({
      bind: (...a) => make(a),
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    });
    return make([]);
  } },
  ASSETS: { fetch: async (u) => {
    const p = new URL(String(u)).pathname;
    const file = path.join(ROOT, p, p.endsWith("/") ? "index.html" : "");
    return fs.existsSync(file) ? new Response(fs.readFileSync(file, "utf8"), { status: 200 }) : new Response("no", { status: 404 });
  } },
};
db.prepare("INSERT INTO users (id, provider, provider_id, display_name, is_admin) VALUES ('owner', 'email', 'o', 'Owner', 1)").run();
db.prepare("INSERT INTO users (id, provider, provider_id, display_name, is_admin) VALUES ('player', 'email', 'p', 'Player', 0)").run();
db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('s-owner', 'owner', '2999-01-01')").run();
db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('s-player', 'player', '2999-01-01')").run();

const req = (url, { who = null, preview = null, method = "GET", body = null } = {}) => {
  const h = new Headers({ "Content-Type": "application/json", "X-XI-Games": "1" });
  if (who) h.set("Cookie", `cxi_session=s-${who}`);
  if (preview) h.set(P.PREVIEW_HEADER, preview);
  return new Request("https://www.thexigames.com" + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
};
const ctx = (request, extra = {}) => ({ request, env, data: {}, params: {}, ...extra });

/* NOTHING BUT SCRATCH. Every table's row count outside the purge's list, so
   a preview that wrote a play, a result, a season day or anything else shows
   up as a table whose count moved. rate_limits is a counter of requests, not
   of play, and is the only table excused. */
const scratch = new Set([...P.PREVIEW_ROUND_TABLES.map(([n]) => n), "rate_limits"]);
function counts() {
  const out = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
    if (!scratch.has(name)) out[name] = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
  }
  return out;
}
const moved = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]).map((k) => `${k} ${a[k]}->${b[k]}`);

/* ---- 1. which days a preview may ask for --------------------------------- */
console.log("=== The days a preview may name ===");
t("today and a day ahead are days", P.askedDay(TODAY, NOW) === TODAY && P.askedDay(AHEAD, NOW) === AHEAD);
t("the last day in range is allowed, the one after is not",
  P.askedDay(utcDay(NOW + P.PREVIEW_MAX_DAYS * DAY), NOW) !== null && P.askedDay(utcDay(NOW + (P.PREVIEW_MAX_DAYS + 1) * DAY), NOW) === null);
t("a day already gone is not a preview", P.askedDay(utcDay(NOW - DAY), NOW) === null);
t("and nor is a date that does not exist, or anything else",
  P.askedDay("2026-02-30", NOW) === null && P.askedDay("tomorrow", NOW) === null && P.askedDay("", NOW) === null && P.askedDay(null, NOW) === null);

/* ---- 2. whose clock moves ------------------------------------------------- */
console.log("\n=== Whose clock moves ===");
const c0 = await P.clockFor(ctx(req("/x")));
t("no header: the real day", !c0.preview && c0.day === TODAY);
const c1 = await P.clockFor(ctx(req("/x", { preview: AHEAD })));
t("a header and no session: the real day, as if the header were absent", !c1.preview && c1.day === TODAY);
const c2 = await P.clockFor(ctx(req("/x", { who: "player", preview: AHEAD })));
t("a header from a player who is not the owner: the real day", !c2.preview && c2.day === TODAY);
const c3 = await P.clockFor(ctx(req("/x", { who: "owner", preview: AHEAD })));
t("the owner's header: that day, at the same time of day", c3.preview && c3.day === AHEAD &&
  Math.abs((c3.now - Date.now()) - 5 * DAY) < 60000, `${c3.day}`);
const c4 = await P.clockFor(ctx(req("/x", { who: "owner", preview: utcDay(NOW + 90 * DAY) })));
t("the owner's header for a day out of range: the real day", !c4.preview && c4.day === TODAY);
{
  const data = {};
  await P.clockFor({ request: req("/x", { who: "owner", preview: AHEAD }), env, data });
  db.prepare("UPDATE users SET is_admin = 0 WHERE id = 'owner'").run();
  const again = await P.clockFor({ request: req("/x", { who: "owner", preview: AHEAD }), env, data });
  const fresh = await P.clockFor(ctx(req("/x", { who: "owner", preview: AHEAD })));
  db.prepare("UPDATE users SET is_admin = 1 WHERE id = 'owner'").run();
  t("decided once per request, and read fresh for the next one", again.preview && !fresh.preview);
}

/* ---- 3. the middleware's Date header --------------------------------------- */
console.log("\n=== The middleware ===");
const { onRequest: middleware } = await imp("functions/_middleware.js");
/* A Date the handler could never have written, so an overwrite shows. */
const realDate = "Thu, 01 Jan 2026 00:00:00 GMT";
const through = async (request) => middleware({ ...ctx(request), next: async () => new Response("ok", { headers: { Date: realDate } }) });
const m1 = await through(req("/api/x", { who: "owner", preview: AHEAD }));
t("an owner's preview answer carries that day in its Date header",
  utcDay(Date.parse(m1.headers.get("Date"))) === AHEAD && /no-store/.test(m1.headers.get("Cache-Control") || ""), m1.headers.get("Date"));
const m2 = await through(req("/api/x", { who: "player", preview: AHEAD }));
{
  /* THE SERVER'S HALF OF "scratch rounds only": an owner's preview POST that
     names a round id not starting pv- is refused before any handler runs. */
  let reached = 0;
  const post = (who, preview, body) => middleware({ ...ctx(req("/api/hilo/clock", { who, preview, method: "POST", body })),
    next: async () => { reached++; return new Response("{}", { headers: { Date: realDate } }); } });
  const r1 = await post("owner", AHEAD, { playId: "a-real-looking-id", token: "hl:x" });
  const r2 = await post("owner", AHEAD, { runId: "abc" });
  const n1 = reached;
  const r3 = await post("owner", AHEAD, { playId: "pv-123", token: "hl:x" });
  const r4 = await post("owner", AHEAD, { token: "no id at all" });
  const r5 = await post("player", AHEAD, { playId: "a-real-looking-id" });
  t("an owner's preview that names a round id not starting pv- is refused before any handler",
    r1.status === 400 && r2.status === 400 && n1 === 0, `${r1.status} ${r2.status}, ${n1} handler call(s)`);
  t("  a pv- id, or no id, goes through; and a player's request is not touched",
    r3.status === 200 && r4.status === 200 && r5.status === 200 && reached === 3, `${r3.status} ${r4.status} ${r5.status}`);
}
t("a player's does not, and is not marked private", m2.headers.get("Date") === realDate && !/private/.test(m2.headers.get("Cache-Control") || ""),
  m2.headers.get("Date"));

/* ---- 4. the admin pages ------------------------------------------------------ */
console.log("\n=== The admin pages ===");
const admin = await imp("functions/admin/[[path]].js");
const page = (who, parts) => admin.onRequestGet(ctx(req("/admin/" + parts.join("/"), { who }), { params: { path: parts } }));
const missing = await page(null, ["football", "quickfire", AHEAD]);
const stranger = await page("player", []);
const bodyOf = async (r) => (r ? await r.text() : "");
const missingBody = await bodyOf(missing), strangerBody = await bodyOf(stranger);
/* THE SITE'S OWN 404: what the static handler gives an address that is no
   page, byte for byte, so /admin/ cannot be told from a mistyped address. */
const ordinary = await env.ASSETS.fetch(new URL("https://www.thexigames.com/some-mistyped-address"));
const ordinaryBody = await ordinary.text();
t("a stranger gets exactly what a mistyped address gets, for the list and for a preview",
  missing.status === 404 && stranger.status === 404 && ordinary.status === 404 &&
  missingBody === ordinaryBody && strangerBody === ordinaryBody, JSON.stringify(strangerBody.slice(0, 40)));
const hub = await page("owner", []);
const hubHtml = await bodyOf(hub);
t("the owner gets the list: every game against the next fortnight",
  hub.status === 200 && (hubHtml.match(/<tr><th scope="row">/g) || []).length >= 17 && hubHtml.includes(`/admin/football/crossword/${TODAY}`),
  `${(hubHtml.match(/<tr><th scope="row">/g) || []).length} games`);
t("  never indexed and never cached", /noindex/.test(hub.headers.get("X-Robots-Tag") || "") && /no-store/.test(hub.headers.get("Cache-Control") || ""));
const prev = await page("owner", ["football", "quickfire", AHEAD]);
const prevHtml = await bodyOf(prev);
const headStart = prevHtml.slice(prevHtml.search(/<head[\s>]/i), prevHtml.search(/<head[\s>]/i) + 400);
t("a preview is the game's own page, the preview layer first in its head",
  prev.status === 200 && /<base href="\/football\/quickfire\/">/.test(headStart) &&
  headStart.indexOf("XI_PREVIEW") > 0 && headStart.indexOf("/shared/xi-preview.js") > headStart.indexOf("XI_PREVIEW") &&
  prevHtml.includes(`"day":"${AHEAD}"`) && /QuickFire/.test(prevHtml));
const { SHARED_TAG } = await imp("functions/_lib/site-page.js");
t("  the layer carries the shared tag, so a browser never runs a stale one",
  prevHtml.includes(`/shared/xi-preview.js?v=${SHARED_TAG}"`), SHARED_TAG);
t("  and every other script comes after it",
  prevHtml.indexOf("/shared/xi-preview.js") < prevHtml.indexOf("js/game.js"));
t("an address that names no game, or a day out of range, is the same 404",
  (await page("owner", ["football", "nonsense", AHEAD])).status === 404 &&
  (await page("owner", ["football", "quickfire", utcDay(NOW + 90 * DAY)])).status === 404 &&
  (await page("owner", ["football", "quickfire"])).status === 404);
t("the address is found by where the game lives, never assembled",
  admin.gameAt("friends", "quickfire") === "quickfire_fr" && admin.gameAt("football", "crossword") === "crossword" && admin.gameAt("x", "y") === null);

/* ---- 5. every scratch table is one the purge knows ---------------------------- */
console.log("\n=== The purge ===");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
const withId = tables.filter((n) => db.prepare("SELECT name FROM pragma_table_info(?)").all(n).some((c) => /^(play_id|run_id)$/.test(c.name)));
const known = new Set([...P.PREVIEW_ROUND_TABLES.map(([n]) => n), ...P.PREVIEW_NEVER_WRITES]);
const unknown = withId.filter((n) => !known.has(n));
t("every table holding a play or run id is purged or named as never written",
  withId.length >= 30 && unknown.length === 0, unknown.length ? "unknown: " + unknown.join(", ") : `${withId.length} tables`);
t("and every table the purge names exists", P.PREVIEW_ROUND_TABLES.every(([n, c]) => tables.includes(n) &&
  db.prepare("SELECT name FROM pragma_table_info(?)").all(n).some((x) => x.name === c)));

/* ---- 6. QuickFire, both sets ------------------------------------------------- */
const sets = [
  { name: "QuickFire XI", api: "functions/api/quickfire", pre: "qf_" },
  { name: "QuickFire XI: Friends", api: "functions/api/quickfire_fr", pre: "fr_qf_" },
];
for (const s of sets) {
  console.log(`\n=== ${s.name}: a day ahead ===`);
  const ins = db.prepare(`INSERT OR REPLACE INTO ${s.pre}question (id, answer, answer_norm, answer_type, clue, status, option_1, option_2, option_3, option_4)
    VALUES (?, ?, ?, 'person', ?, 'verified', ?, ?, ?, ?)`);
  const slot = db.prepare(`INSERT OR REPLACE INTO ${s.pre}daily_slot (play_date, slot, question_id, role) VALUES (?, ?, ?, ?)`);
  for (let i = 1; i <= 14; i++) {
    const id = s.pre.toUpperCase() + "Q" + i;
    ins.run(id, `Answer ${i}`, `answer ${i}`, `Question ${i}`, `Answer ${i}`, `Wrong ${i}a`, `Wrong ${i}b`, `Wrong ${i}c`);
    slot.run(AHEAD, i <= 11 ? i : i - 11, id, i <= 11 ? "xi" : "bench");
  }
  db.prepare(`INSERT OR REPLACE INTO ${s.pre}daily (play_date, status) VALUES (?, 'published')`).run(AHEAD);

  const snap = counts();
  const daily = (await imp(`${s.api}/daily.js`)).onRequestGet;
  const play = (await imp(`${s.api}/play.js`)).onRequestPost;
  const next = (await imp(`${s.api}/next.js`)).onRequestPost;
  const answer = (await imp(`${s.api}/answer.js`)).onRequestPost;
  const call = async (fn, r) => { const res = await fn(ctx(r)); let j = null; try { j = await res.json(); } catch (e) {} return { status: res.status, j }; };

  const asPlayer = await call(daily, req("/api/d", { who: "player", preview: AHEAD }));
  const byDate = await call(daily, req(`/api/d?date=${AHEAD}`, { who: "player" }));
  const noHeader = await call(daily, req(`/api/d?date=${AHEAD}`, { who: "owner" }));
  t("a player asking for it, with or without the header, gets today (and there is no board today)",
    asPlayer.status === 404 && byDate.status === 404 && !JSON.stringify(asPlayer.j).includes("Question 1"));
  t("so does the owner without a preview", noHeader.status === 404);
  const shown = await call(daily, req("/api/d", { who: "owner", preview: AHEAD }));
  t("the owner's preview is served that day's board, as today's",
    shown.status === 200 && shown.j.day === AHEAD && shown.j.isToday === true && /Question \d/.test(JSON.stringify(shown.j.daily)),
    shown.status + " " + (shown.j && shown.j.day));
  t("  without its answers, exactly as a player's would be", !JSON.stringify(shown.j).includes('"answer"'));

  const refused = await call(play, req("/api/p", { who: "player", method: "POST", body: { date: AHEAD } }));
  t("a player cannot open a round on that day", refused.status === 400 && !(refused.j && refused.j.playId));
  const round = await call(play, req("/api/p", { who: "owner", preview: AHEAD, method: "POST", body: { date: AHEAD } }));
  t("the owner's preview opens a scratch round, its id marked for deletion",
    round.status === 200 && P.isPreviewId(round.j.playId), round.j && round.j.playId);
  const served = await call(next, req("/api/n", { method: "POST", body: { playId: round.j.playId, idx: 1 } }));
  const picked = await call(answer, req("/api/a", { method: "POST", body: { playId: round.j.playId, idx: 1, pick: "Answer 1" } }));
  t("  and it is judged by the same code a player's is", served.status === 200 && picked.status === 200 && picked.j.correct === true,
    JSON.stringify(picked.j).slice(0, 80));
  const change = moved(snap, counts());
  t("  and nothing outside the scratch tables was written", change.length === 0, change.join(", ") || "every other table unchanged");
  db.prepare(`INSERT INTO ${s.pre}round (play_id, play_date, started_ms, subs_used, question_idx, question_ms, penalty_minutes) VALUES ('real-round', ?, 0, 0, 0, 0, 0)`).run(TODAY);
}
const before = db.prepare("SELECT COUNT(*) AS n FROM qf_round WHERE play_id LIKE 'pv-%'").get().n +
  db.prepare("SELECT COUNT(*) AS n FROM fr_qf_round WHERE play_id LIKE 'pv-%'").get().n;
const removed = await P.purgePreviewRounds(env);
const left = db.prepare("SELECT COUNT(*) AS n FROM qf_round WHERE play_id LIKE 'pv-%'").get().n +
  db.prepare("SELECT COUNT(*) AS n FROM fr_qf_answer WHERE play_id LIKE 'pv-%'").get().n;
const real = db.prepare("SELECT COUNT(*) AS n FROM qf_round WHERE play_id = 'real-round'").get().n +
  db.prepare("SELECT COUNT(*) AS n FROM fr_qf_round WHERE play_id = 'real-round'").get().n;
t("\nopening /admin/ deletes every scratch row and nothing else", before === 2 && removed >= 4 && left === 0 && real === 2,
  `${before} scratch rounds, ${removed} rows removed, ${real} real rounds kept`);

/* ---- 6b. the owner's verdicts ------------------------------------------------------ */
console.log("\n=== The owner's verdicts ===");
{
  const route = (await imp("functions/api/admin/[[route]].js")).onRequest;
  const flag = async (who, body) => {
    const res = await route(ctx(req("/api/admin/review-flag", { who, method: "POST", body }), { params: { route: ["review-flag"] } }));
    let j = null; try { j = await res.json(); } catch (e) {}
    return { status: res.status, j };
  };
  const ok = await flag("owner", { game: "quickfire", day: AHEAD, verdict: "dislike", item: "  Liverpool   striker\n who won 73 caps ", note: "Three Englishmen",
    questionId: "V30500", clue: "Liverpool striker who won 73 caps for Wales,\n last appearing in 1996" });
  const row = db.prepare("SELECT game, day, verdict, question_id, clue, item, note, created_by FROM review_flags WHERE id = ?").get(ok.j && ok.j.id);
  t("the owner's flag is kept: game, day, verdict, the words tidied, the note",
    ok.status === 200 && row && row.game === "quickfire" && row.day === AHEAD && row.verdict === "dislike" &&
    row.item === "Liverpool striker who won 73 caps" && row.note === "Three Englishmen" && row.created_by === "owner" &&
    row.question_id === "V30500" && row.clue === "Liverpool striker who won 73 caps for Wales, last appearing in 1996", JSON.stringify(row));
  const stranger = await flag("player", { game: "quickfire", day: AHEAD, verdict: "like", item: "x" });
  const nobody = await flag(null, { game: "quickfire", day: AHEAD, verdict: "like", item: "x" });
  t("nobody else can flag", stranger.status === 404 && nobody.status === 401);
  t("a flag must name its game, rather than becoming the crossword's",
    (await flag("owner", { day: AHEAD, verdict: "like", item: "x" })).status === 400);
  t("and must say something: words or a note",
    (await flag("owner", { game: "quickfire", day: AHEAD, verdict: "like", item: "  ", note: "" })).status === 400 &&
    (await flag("owner", { game: "quickfire", day: AHEAD, verdict: "meh", item: "x" })).status === 400);
  t("  only one flag was kept", db.prepare("SELECT COUNT(*) AS n FROM review_flags").get().n === 1);
}

/* ---- 7. the page layer ----------------------------------------------------------- */
if (!JSDOM) { console.log("\njsdom is not installed: the page layer was NOT checked. Not a pass."); fail++; done(); }
console.log("\n=== The page layer ===");
const shim = read("shared/xi-preview.js");
const plays = read("shared/xi-plays.js");
function open(conf) {
  const dom = new JSDOM("<!doctype html><html><head></head><body><p>game</p></body></html>",
    { url: "https://www.thexigames.com/admin/football/quickfire/" + AHEAD, runScripts: "outside-only" });
  const w = dom.window;
  w.Response = Response; w.Headers = Headers; w.Request = Request;
  const sent = [];
  w.fetch = async (u, o) => { sent.push({ url: String(u), method: (o && o.method) || "GET", headers: new Headers((o && o.headers) || {}), body: o && o.body }); return new Response("{}", { status: 200 }); };
  w.localStorage.setItem("qfx.results.v1", "[1]");
  const realStore = w.localStorage;          // the device's, held before the layer swaps it
  if (conf) w.eval(`window.XI_PREVIEW = ${JSON.stringify(conf)};`);
  w.eval(shim);
  w.eval(plays);
  return { w, sent, realStore };
}
{
  const { w, sent, realStore } = open({ game: "quickfire", day: AHEAD });
  t("the page's clock is that day, at the same time of day",
    w.eval("new Date().toISOString().slice(0, 10)") === AHEAD && Math.abs(w.eval("Date.now()") - (Date.now() + 5 * DAY)) < 60000);
  t("  and a date it is given is still that date", w.eval("new Date(2020, 0, 1).getFullYear()") === 2020);
  t("storage is held in the tab: the page reads the device's history",
    w.eval("localStorage.getItem('qfx.results.v1')") === "[1]" && w.XIPreview.storageHeld === true);
  w.eval("localStorage.setItem('qfx.results.v1', '[1,2]'); localStorage.setItem('qfx.daily.v1:x', 'saved');");
  const realValue = realStore.getItem("qfx.results.v1");
  t("  and what it writes never reaches the device", realValue === "[1]" && realStore.getItem("qfx.daily.v1:x") === null &&
    realStore !== w.eval("localStorage"), String(realValue));
  await w.eval("fetch('/api/quickfire/daily')");
  await w.eval("fetch('/api/report-clue', { method: 'POST', body: '{}' })");
  await w.eval("fetch('/api/account/results?game=quickfire')");
  await w.eval("fetch('/api/play', { method: 'POST', body: '{}' })");
  await w.eval("fetch('/api/account/migrate', { method: 'POST', body: '{}' })");
  await w.eval("fetch('/api/challenge', { method: 'POST', body: '{}' })");
  await w.eval("fetch('https://example.com/x')");
  const urls = sent.map((x) => x.method + " " + new URL(x.url, "https://www.thexigames.com").pathname);
  t("the game's own requests go, carrying the preview's day",
    sent.some((x) => /quickfire\/daily/.test(x.url) && x.headers.get(P.PREVIEW_HEADER) === AHEAD));
  t("  a report still goes: saying a question is wrong is the point", urls.includes("POST /api/report-clue"));
  t("  reading the account still goes", urls.includes("GET /api/account/results"));
  t("  the play counter, account sync and challenges never leave the tab",
    !urls.includes("POST /api/play") && !urls.includes("POST /api/account/migrate") && !urls.includes("POST /api/challenge"), urls.join(", "));
  t("  and another site is not sent the owner's preview header",
    sent.some((x) => /example\.com/.test(x.url) && !x.headers.has(P.PREVIEW_HEADER)));
  const before2 = sent.length;
  await w.eval("XIPlays.start({ game: 'quickfire', mode: 'daily', boardKey: 'qf:x' })");
  w.eval("XIPlays.end(true)");
  t("XIPlays sends nothing at all, and the id it lends a game is a scratch one",
    sent.length === before2 && /^pv-/.test(w.eval("XIPlays.current().playId")), w.eval("XIPlays.current().playId"));
  /* FLAGGING FROM THE BANNER: select the words, tap dislike, write why. */
  {
    const d = w.document;
    const card = d.createElement("div"); card.setAttribute("data-xi-item", "V30500");
    card.innerHTML = "<p>Liverpool striker who won 73 caps for Wales, <b>last appearing in 1996</b></p>";
    d.body.appendChild(card);
    const p = card.querySelector("p").firstChild;          // the words, not the whole card
    const range = d.createRange(); range.setStart(p, 0); range.setEnd(p, "Liverpool striker who won 73 caps for Wales".length);
    w.getSelection().removeAllRanges(); w.getSelection().addRange(range);
    d.dispatchEvent(new w.Event("selectionchange"));
    w.getSelection().removeAllRanges();          // a phone clears it as the button is tapped
    const btn = d.querySelector('#xiPreviewBar button[data-verdict="dislike"]');
    btn.dispatchEvent(new w.Event("click", { bubbles: true }));
    const box = d.getElementById("xiPreviewFlagBox");
    t("dislike opens a box holding the words selected before the tap",
      !!box && box.querySelector('textarea[name="item"]').value === "Liverpool striker who won 73 caps for Wales");
    box.querySelector('textarea[name="note"]').value = "Three Englishmen";
    const n0 = sent.length;
    box.dispatchEvent(new w.Event("submit", { cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));
    const post = sent.slice(n0).find((x) => /\/api\/admin\/review-flag$/.test(x.url));
    t("  and Save sends game, day, verdict, words and note to the admin route",
      !!post && post.method === "POST" && post.headers.get("X-XI-Games") === "1" &&
      (() => { const b = JSON.parse(post.body); return b.game === "quickfire" && b.day === AHEAD && b.verdict === "dislike" &&
        b.item === "Liverpool striker who won 73 caps for Wales" && b.note === "Three Englishmen" &&
        b.questionId === "V30500" && b.clue === "Liverpool striker who won 73 caps for Wales, last appearing in 1996"; })(), post ? post.body : "nothing sent");
  }
  t("the banner says it is a preview and that nothing is saved",
    /PREVIEW/.test(w.document.getElementById("xiPreviewBar").textContent) && /nothing is saved/.test(w.document.getElementById("xiPreviewBar").textContent));
}
{
  /* XIPLAYS' OWN GUARD, without the layer's held list behind it: the play
     count must not rest on one file's list of paths. */
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://www.thexigames.com/", runScripts: "outside-only" });
  const w = dom.window, sent = [];
  w.fetch = async (u) => { sent.push(String(u)); return new Response("{}"); };
  w.eval("window.XIPreview = { active: true };");
  w.eval(plays);
  await w.eval("XIPlays.start({ game: 'quickfire', mode: 'daily' })");
  w.eval("XIPlays.end(true)");
  t("XIPlays alone, told it is a preview, sends nothing", sent.length === 0, sent.join(", "));
}
{
  const { w, sent } = open(null);
  await w.eval("fetch('/api/quickfire/daily')");
  await w.eval("fetch('/api/play', { method: 'POST', body: '{}' })");
  t("\nwithout a preview nothing changes: today, no header, plays counted",
    w.XIPreview.active === false && w.eval("new Date().toISOString().slice(0, 10)") === TODAY &&
    !sent.some((x) => x.headers.has(P.PREVIEW_HEADER)) && sent.some((x) => /\/api\/play$/.test(x.url)) &&
    !w.document.getElementById("xiPreviewBar"));
}
{
  const { w } = open({ game: "quickfire", day: "not-a-day" });
  t("and a malformed preview is no preview", w.XIPreview.active === false && w.eval("new Date().toISOString().slice(0, 10)") === TODAY);
}

done();
