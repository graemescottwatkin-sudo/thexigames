/* tools/season_join_test.mjs — a guest's season joins the account.
 *
 * THE FAULT, found on the Play build (24 Sep 2026). Signed in, the crossword
 * home read "Crossword streak: Not started" beside "Your form: 1 day run", with
 * yesterday's board played. Form comes from results, which the account gets at
 * sign-in (/api/account/migrate). The streak comes from season_play, which only
 * /api/play wrote, and only for a player already signed in. Everything played
 * as a guest stayed on the device and the account's season began from nothing.
 *
 * WHAT IT PROVES
 *   the server   POST /api/season against a real SQLite built from the repo's
 *                migrations: the reported case (a guest's yesterday becomes the
 *                account's streak of 1, by xi-season's own rule), and the
 *                refusals (a future day, an unknown game, a game outside the
 *                season, a day before a game launched, no CSRF header, no
 *                account); rows only ever gain; sending twice changes nothing
 *   the page     the chrome sends the device's record once an account is known,
 *                with the CSRF header, never for a signed-out player, and the
 *                game menu asks for the season again when it lands
 *
 *   node tools/season_join_test.mjs        (from the repo root)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let sqlite;
try { sqlite = await import("node:sqlite"); } catch (e) { sqlite = null; }
let jsdom;
try { jsdom = await import("jsdom"); } catch (e) { jsdom = null; }

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = (p) => import(new URL("file:///" + path.join(ROOT, p).replace(/\\/g, "/")).href);

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* ABSENT IS NOT A PASS. */
if (!sqlite || !sqlite.DatabaseSync || !jsdom) {
  t("node:sqlite and jsdom are available", false, `sqlite ${!!sqlite}, jsdom ${!!jsdom}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}

const season = await lib("functions/api/season.js");
const games = await lib("functions/_lib/games.js");
const { utcDay } = await lib("functions/_lib/daily.js");
const XI_SEASON = (await lib("shared/xi-season.js")).default;

/* ---- a D1 over node:sqlite, built from the real migrations ---- */
const db = new sqlite.DatabaseSync(":memory:");
for (const f of fs.readdirSync(path.join(ROOT, "data", "migrations")).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort()) {
  try { db.exec(fs.readFileSync(path.join(ROOT, "data", "migrations", f), "utf8")); } catch (e) { /* ALTERs the base already has */ }
}
const d1 = {
  prepare(sql) {
    const make = (args) => ({
      bind: (...a) => make(a),
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    });
    return make([]);
  },
};
const env = { DB: d1 };
db.exec(`INSERT INTO users (id, provider, provider_id, email, display_name) VALUES ('u-guest', 'google', 'g1', NULL, 'Guest');
         INSERT INTO sessions (id, user_id, expires_at) VALUES ('s-guest', 'u-guest', '2099-01-01T00:00:00Z');`);

const req = (method, body, { csrf = true, cookie = "s-guest" } = {}) => new Request("https://www.thexigames.com/api/season", {
  method,
  headers: { "Content-Type": "application/json", ...(csrf ? { "X-XI-Games": "1" } : {}), ...(cookie ? { Cookie: "cxi_session=" + cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const rows = () => db.prepare("SELECT day, game, finished_at IS NOT NULL AS done FROM season_play WHERE user_id = 'u-guest' ORDER BY day, game").all();
const dayBefore = (d) => new Date(Date.parse(d + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
const TODAY = utcDay();
const YESTERDAY = dayBefore(TODAY);

/* ======================================================================
   1. THE SERVER
   ====================================================================== */
{
  const before = await (await season.onRequestGet({ request: req("GET"), env })).json();
  const runBefore = XI_SEASON.streaks(before.dayGames || [], "crossword", before.today);
  t("the reported state: signed in, and the account's streak has not started",
    before.account === true && runBefore.game === 0 && runBefore.daily === 0, JSON.stringify(runBefore));

  /* The device's record, as xi-season.js holds it: yesterday's crossword. */
  let r = await season.onRequestPost({ request: req("POST", { days: [{ day: YESTERDAY, s: ["crossword"], f: ["crossword"] }] }), env });
  let j = await r.json();
  t("the device's season is accepted", r.status === 200 && j.added === 1, JSON.stringify(j));

  const after = await (await season.onRequestGet({ request: req("GET"), env })).json();
  const runAfter = XI_SEASON.streaks(after.dayGames || [], "crossword", after.today);
  t("THE REPORTED FAULT: the account's streaks now read 1, by xi-season's own rule",
    runAfter.game === 1 && runAfter.daily === 1, JSON.stringify(runAfter));
  t("and the day counts in the season record too", after.season && after.season.played >= 1, JSON.stringify(after.season));

  const n = rows().length;
  r = await season.onRequestPost({ request: req("POST", { days: [{ day: YESTERDAY, s: ["crossword"], f: ["crossword"] }] }), env });
  t("sending it again changes nothing", rows().length === n);

  r = await season.onRequestPost({ request: req("POST", { days: [{ day: YESTERDAY, s: ["crossword"], f: [] }] }), env });
  t("a start never takes a finish away", rows().find((x) => x.day === YESTERDAY && x.game === "crossword").done === 1);

  const d2 = dayBefore(YESTERDAY);
  await season.onRequestPost({ request: req("POST", { days: [{ day: d2, s: ["hilo"], f: [] }] }), env });
  await season.onRequestPost({ request: req("POST", { days: [{ day: d2, s: ["hilo"], f: ["hilo"] }] }), env });
  t("a day held as started is topped up to finished", rows().find((x) => x.day === d2 && x.game === "hilo").done === 1);

  /* The refusals, each of which must write nothing. */
  const unlisted = games.GAMES.find((g) => !games.inSeason(g));
  const late = games.GAMES.filter((g) => games.LAUNCHED[g] && games.inSeason(g))
    .sort((a, b) => (games.LAUNCHED[a] < games.LAUNCHED[b] ? 1 : -1))[0];
  const beforeLaunch = dayBefore(games.LAUNCHED[late]);
  const tomorrow = new Date(Date.parse(TODAY + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  const cases = [
    ["a day in the future", { day: tomorrow, s: ["crossword"], f: ["crossword"] }],
    ["an unknown game", { day: YESTERDAY, s: ["tiddlywinks"], f: ["tiddlywinks"] }],
    [`a game outside the season (${unlisted})`, { day: YESTERDAY, s: [unlisted], f: [unlisted] }],
    [`a day before the game launched (${late}, ${beforeLaunch})`, { day: beforeLaunch, s: [late], f: [late] }],
    ["a malformed day", { day: "yesterday", s: ["crossword"], f: ["crossword"] }],
  ];
  for (const [label, d] of cases) {
    const count = rows().length;
    const rr = await season.onRequestPost({ request: req("POST", { days: [d] }), env });
    const jj = await rr.json();
    t(`refused and nothing written: ${label}`, rows().length === count && jj.added === 0 && jj.skipped >= 1, JSON.stringify(jj));
  }
  const count = rows().length;
  r = await season.onRequestPost({ request: req("POST", { days: [{ day: YESTERDAY, s: ["vowels"], f: ["vowels"] }] }, { csrf: false }), env });
  t("no CSRF header: 403 and nothing written", r.status === 403 && rows().length === count);
  r = await season.onRequestPost({ request: req("POST", { days: [{ day: YESTERDAY, s: ["vowels"], f: ["vowels"] }] }, { cookie: null }), env });
  t("no account: 401 and nothing written", r.status === 401 && rows().length === count);
}

/* ======================================================================
   2. THE PAGE
   ====================================================================== */
{
  const { JSDOM } = jsdom;
  const themeJs = fs.readFileSync(path.join(ROOT, "shared/xi-theme.js"), "utf8");
  const seasonJs = fs.readFileSync(path.join(ROOT, "shared/xi-season.js"), "utf8");
  const chromeJs = fs.readFileSync(path.join(ROOT, "shared/xi-chrome.js"), "utf8");
  const menuJs = fs.readFileSync(path.join(ROOT, "shared/xi-menu.js"), "utf8");
  const settle = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0)); };

  async function page({ user, record }) {
    const dom = new JSDOM('<!doctype html><html data-game="crossword"><head></head><body><header class="xic-bar"></header>' +
      '<div id="homeStreaks" hidden><span id="streakGame"><b id="streakGameN"></b></span><span id="streakDaily"><b id="streakDailyN"></b></span></div></body></html>',
      { runScripts: "outside-only", url: "https://www.thexigames.com/football/crossword/" });
    const w = dom.window;
    const calls = [];
    let added = 1;
    w.fetch = async (url, init = {}) => {
      const u = String(url);
      calls.push({ url: u, method: init.method || "GET", headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null });
      let body = {};
      if (u === "/api/auth/session") body = { user, googleClientId: null };
      else if (u === "/api/season" && (init.method || "GET") === "POST") body = { ok: true, added, skipped: 0 };
      else if (u === "/api/season") body = { account: !!user, today: TODAY, dayGames: [] };
      return new w.Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    if (!w.Response) w.Response = Response;
    if (record) w.localStorage.setItem("xi.season.v1", JSON.stringify({ v: 1, days: record }));
    w.eval(themeJs); w.eval(seasonJs); w.eval(chromeJs);
    w.XIChrome.init();
    w.eval(menuJs);
    await settle();
    return { w, calls };
  }
  const record = { [YESTERDAY]: { s: ["crossword"], f: ["crossword"] } };

  let p = await page({ user: { id: "u-guest", displayName: "Guest" }, record });
  const posts = p.calls.filter((c) => c.url === "/api/season" && c.method === "POST");
  t("signed in, the chrome sends the device's season once",
    posts.length === 1 && JSON.stringify(posts[0].body.days) === JSON.stringify([{ day: YESTERDAY, s: ["crossword"], f: ["crossword"] }]),
    JSON.stringify(posts.map((c) => c.body)));
  t("with the CSRF header", posts[0] && posts[0].headers["X-XI-Games"] === "1");
  /* After the merge, not in total: the chrome makes a read of its own for
     "played today", so a total counts things this check is not about. */
  const at = p.calls.findIndex((c) => c.url === "/api/season" && c.method === "POST");
  const after = p.calls.slice(at + 1).filter((c) => c.url === "/api/season" && c.method === "GET");
  t("and the menu asks for the season again once it has landed", at >= 0 && after.length >= 1, `${after.length} read(s) after the merge`);

  p = await page({ user: null, record });
  t("signed out, nothing is sent: a guest's season stays on the device",
    !p.calls.some((c) => c.url === "/api/season" && c.method === "POST"));

  p = await page({ user: { id: "u-guest", displayName: "Guest" }, record: null });
  t("a device with no season sends nothing", !p.calls.some((c) => c.url === "/api/season" && c.method === "POST"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
