/* tools/push_test.mjs — reminders on a phone, end to end, against real SQL.
 *
 * WHY A REAL DATABASE. A stubbed D1 re-applies each rule in JS, so it cannot
 * prove a query: a COALESCE dropped from the upsert, or a WHERE that selects
 * nobody, passes against a stub. This suite builds an in-memory SQLite from
 * the repo's own migration files with node:sqlite, and runs the endpoint and
 * the sender's whole run against it. What it cannot prove is D1 itself. The
 * SQL is plain SQLite and D1 is SQLite, which is as close as offline gets.
 *
 * WHAT IT PROVES
 *   the rules      every time zone the runtime knows, across both 2026 clock
 *                  changes: each board day's morning and streak nudge fall
 *                  inside that day and at a sane local time
 *   the endpoint   refusals (bad zone, unknown platform, no CSRF header),
 *                  the upsert keeping preferences a start-up post leaves out,
 *                  the account link set and cleared by the session
 *   the sender     three simulated days of quarter-hour runs over six phones
 *                  in five zones: exact send times, one morning per UTC day,
 *                  the UTC+10 morning waiting for the reset, the streak
 *                  nudge only for a live run, dead tokens pruned, failures
 *                  retried and then given up
 *   the queue      a challenge entry queues exactly one message, and never
 *                  for an unlisted game
 *   the key        a JWT signed by fcm.js verifies against the public half
 *
 * THE CLOCK IS PINNED. The sender takes `now` as an argument and every day
 * here is written out. The endpoint stamps real time; where the simulation
 * needs a row to start from a known state, that is set explicitly, and it
 * says so.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let sqlite;
try { sqlite = await import("node:sqlite"); } catch (e) { sqlite = null; }

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = (p) => import(new URL("file:///" + path.join(ROOT, p).replace(/\\/g, "/")).href);

let pass = 0, fail = 0;
const t = (n, ok, d) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`);
};

/* ABSENT IS NOT A PASS. A runtime without node:sqlite cannot run most of
   this, and saying so as a failure is the only honest answer. */
if (!sqlite || !sqlite.DatabaseSync) {
  t("node:sqlite is available (Node 22.13 or later)", false, "this runtime has none");
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}

const push = await lib("functions/_lib/push.js");
const games = await lib("functions/_lib/games.js");
const { utcDay } = await lib("functions/_lib/daily.js");
const { noteFinish } = await lib("functions/_lib/season-store.js");
const device = await lib("functions/api/push/device.js");
const entry = await lib("functions/api/challenge/entry.js");
const { run } = await lib("workers/push/run.js");
const fcm = await lib("workers/push/fcm.js");

const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const at = (s) => Date.parse(s);
const hhmm = (ms, tz) => {
  const m = push.localMinute(ms, tz);
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
};

/* ---- a D1 over node:sqlite ---------------------------------------------
   The three calls the code makes, with D1's shapes: first() is a row or
   null, all() is { results }, run() is { meta: { changes } }. */
function d1(db) {
  return {
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
}

/* The whole migration history, in order. 000-base already carries columns
   that later ALTERs add, so those ALTERs fail here as they would on a fresh
   D1 built from the base. Only 046 must apply cleanly, and it is applied
   twice, because the migration says it is safe to re-run. */
function freshDb() {
  const db = new sqlite.DatabaseSync(":memory:");
  const dir = path.join(ROOT, "data", "migrations");
  const files = fs.readdirSync(dir).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort();
  let ours = null;
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    try { db.exec(sql); if (f.startsWith("046-")) db.exec(sql); }
    catch (e) { if (f.startsWith("046-")) ours = e.message; }
  }
  return { db, ours, files };
}

/* ======================================================================
   1. THE RULES, across every zone
   ====================================================================== */
{
  t("a real zone is accepted", push.validZone("Europe/London") === "Europe/London");
  t("an old zone name a phone may still send is accepted",
    !!push.validZone("Asia/Calcutta"), String(push.validZone("Asia/Calcutta")));
  for (const bad of ["Mars/Olympus", "", "../etc/passwd", "Europe/London; DROP", "x".repeat(80)]) {
    t(`a bad zone is refused: ${JSON.stringify(bad.slice(0, 24))}`, push.validZone(bad) === null);
  }
  t("a minute past the end of the day is refused, not clamped", push.validMinute(1500) === undefined);
  t("a missing minute is null, so the stored one is kept", push.validMinute(undefined) === null);

  /* Known answers, worked out by hand from each zone's offset on the day. */
  const D = "2026-09-20";
  const cases = [
    ["Europe/London", "2026-09-20T08:00:00.000Z", "09:00 BST: the reset (01:00) comes before the morning"],
    ["America/New_York", "2026-09-20T13:00:00.000Z", "09:00 EDT, not 20:00 the evening before at the reset"],
    ["America/Los_Angeles", "2026-09-20T16:00:00.000Z", "09:00 PDT"],
    ["Australia/Sydney", "2026-09-20T00:00:00.000Z", "UTC+10: 9am local precedes the boards, so it waits for the reset at 10:00"],
    ["Asia/Kolkata", "2026-09-20T03:30:00.000Z", "09:00 IST"],
  ];
  for (const [tz, want, why] of cases) {
    const got = new Date(push.morningAt(D, tz, 540)).toISOString();
    t(`morning ${tz}`, got === want, `${why}; got ${got}`);
  }
  const s = [
    ["Europe/London", "2026-09-20T18:00:00.000Z", "19:00 BST: 22:00 is past the evening limit"],
    ["Europe/London", "2026-12-01T19:00:00.000Z", "19:00 GMT"],
    ["America/New_York", "2026-09-20T21:00:00.000Z", "17:00 EDT, three hours before the reset at 20:00"],
    ["America/Los_Angeles", "2026-09-20T21:00:00.000Z", "14:00 PDT, before the reset at 17:00"],
    ["Australia/Sydney", "2026-09-20T09:00:00.000Z", "19:00 AEST, not 07:00 the next morning"],
  ];
  for (const [tz, want, why] of s) {
    const day = want.slice(0, 10);
    const got = new Date(push.streakAt(day, tz)).toISOString();
    t(`streak nudge ${tz} ${day}`, got === want, `${why}; got ${got}`);
  }

  /* THE SWEEP. Every zone this runtime knows, five morning minutes, the days
     either side of both 2026 clock changes. The local time must be exact,
     except within two hours of a clock change, where the minute asked for may
     not exist that day; there it may be an hour out and no more. */
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  t("the runtime lists its zones, so the sweep is not empty", zones.length > 300, zones.length + " zones");
  const days = [];
  for (const [from, n] of [["2026-03-25", 12], ["2026-09-20", 3], ["2026-10-21", 14]]) {
    for (let i = 0; i < n; i++) days.push(new Date(at(from + "T00:00:00Z") + i * DAY).toISOString().slice(0, 10));
  }
  /* A clock change within two hours of `ms`: four hours of wall clock that
     are not four hours of local time. */
  const nearChange = (ms, tz) =>
    (push.localMinute(ms + 2 * HOUR, tz) - push.localMinute(ms - 2 * HOUR, tz) + 1440) % 1440 !== 240;
  const offBy = (lm, want) => { const d = Math.abs(lm - want) % 1440; return Math.min(d, 1440 - d); };
  let checked = 0, outside = [], oddLocal = [], streakOut = [], streakOdd = [], slack = 0;
  for (const tz of zones) {
    for (const day of days) {
      const r = at(day + "T00:00:00Z");
      for (const m of [0, 360, 540, 1020, 1439]) {
        const x = push.morningAt(day, tz, m);
        checked++;
        if (!(x >= r && x < r + DAY)) outside.push(`${tz} ${day} ${m}`);
        const lm = push.localMinute(x, tz);
        const atReset = x === r && (lm - m + 1440) % 1440 < push.MORNING_SPAN;
        if (!atReset && lm !== m) {
          if (nearChange(x, tz) && offBy(lm, m) <= 60) slack++;
          else oddLocal.push(`${tz} ${day} ${m} -> ${hhmm(x, tz)}`);
        }
      }
      const y = push.streakAt(day, tz);
      if (!(y >= r && y <= r + DAY - push.STREAK_LEAD)) streakOut.push(`${tz} ${day}`);
      const ly = push.localMinute(y, tz);
      const inDay = ly >= push.STREAK_EARLY && ly <= push.STREAK_LATE;
      if (!inDay && !(nearChange(y, tz) && (offBy(ly, push.STREAK_EARLY) <= 60 || offBy(ly, push.STREAK_LATE) <= 60))) {
        streakOdd.push(`${tz} ${day} -> ${hhmm(y, tz)}`);
      }
    }
  }
  t("every morning falls inside its own board day, so none is skipped and none is doubled",
    checked === zones.length * days.length * 5 && checked > 50000 && outside.length === 0,
    `${checked} checked; ${outside.slice(0, 3).join(", ")}`);
  t("every morning is at the chosen minute exactly, or at the reset when it waits for the boards",
    oddLocal.length === 0, oddLocal.slice(0, 3).join(", ") || `${slack} an hour out beside a clock change`);
  /* The slack is for a minute that does not exist, which is rare. If it
     became common, the rule would be wrong and the slack would be hiding it. */
  t("the clock-change slack is used rarely", slack < checked / 1000, slack + " of " + checked);
  t("every streak nudge leaves at least three hours before the reset",
    streakOut.length === 0, streakOut.slice(0, 3).join(", "));
  t("every streak nudge is in the daytime, 08:00 to 19:00 local",
    streakOdd.length === 0, streakOdd.slice(0, 3).join(", "));

  /* The streak is xi-season's, asked. */
  t("a run that ended yesterday is at risk today",
    push.streakAtRisk([{ day: "2026-09-19", games: ["hilo"] }, { day: "2026-09-18", games: ["grid"] }], "2026-09-20") === 2);
  t("a run already extended today is not at risk",
    push.streakAtRisk([{ day: "2026-09-20", games: ["hilo"] }, { day: "2026-09-19", games: ["hilo"] }], "2026-09-20") === 0);
  t("a run broken two days ago has nothing to lose",
    push.streakAtRisk([{ day: "2026-09-18", games: ["hilo"] }], "2026-09-20") === 0);

  /* Which games may be named: derived from games.js, not written here. */
  const listed = games.GAMES.filter((g) => games.isListed(g));
  const hidden = games.GAMES.filter((g) => games.LAUNCHED[g] && !games.isListed(g));
  t("games.js has both listed and unlisted games to test against", listed.length > 0 && hidden.length > 0,
    `${listed.length} listed, ${hidden.length} unlisted`);
  t("a challenge in an unlisted game makes no message at all",
    hidden.every((g) => push.challengeMessage(g, "abc123", "Sam", 80) === null), hidden.join(", "));
  const cm = push.challengeMessage("crossword", "abc123", "Sam", 80);
  t("a challenge message links the game's own path",
    games.isListed("crossword") && cm && cm.url === "/football/crossword/?c=abc123", cm && cm.url);
  t("an address outside the app's path becomes the hub",
    push.addressOf("/friends/whoami/") === push.SITE + "/football/" &&
    push.addressOf("//evil.example/football/") === push.SITE + "/football/" &&
    push.addressOf("/football/crossword/?c=x1") === push.SITE + "/football/crossword/?c=x1");
}

/* ======================================================================
   2. THE ENDPOINT, against real SQL
   ====================================================================== */
const { db, ours, files } = freshDb();
t("046 applies cleanly, twice", ours === null, ours || files.length + " migrations read");
const env = { DB: d1(db) };
const row = (token) => db.prepare("SELECT * FROM push_device WHERE token = ?").get(token);

db.exec(`INSERT INTO users (id, provider, provider_id, email, display_name) VALUES
  ('u-ny', 'test', 'ny', NULL, 'New York'), ('u-la', 'test', 'la', NULL, 'Los Angeles');
  INSERT INTO sessions (id, user_id, expires_at) VALUES
  ('s-ny', 'u-ny', '2099-01-01T00:00:00Z'), ('s-la', 'u-la', '2099-01-01T00:00:00Z');`);

let ip = 0;
function req(method, body, { csrf = true, cookie = null, headers = {} } = {}) {
  const h = { "Content-Type": "application/json", "CF-Connecting-IP": "10.0.0." + (++ip), ...headers };
  if (csrf) h["X-XI-Games"] = "1";
  if (cookie) h.Cookie = "cxi_session=" + cookie;
  return new Request("https://www.thexigames.com/api/push/device", {
    method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const TOK = (s) => "tok_" + s + "_" + "x".repeat(24);
const good = (s, extra = {}) => ({ token: TOK(s), platform: "android", tz: "Europe/London", ...extra });

{
  let r = await device.onRequestPost({ request: req("POST", good("nocsrf"), { csrf: false }), env });
  t("no CSRF header: 403, and nothing stored", r.status === 403 && !row(TOK("nocsrf")));
  r = await device.onRequestPost({ request: req("POST", good("badtz", { tz: "Mars/Olympus" })), env });
  t("a bad time zone: 400, and nothing stored", r.status === 400 && !row(TOK("badtz")));
  r = await device.onRequestPost({ request: req("POST", good("badplat", { platform: "blackberry" })), env });
  t("an unknown platform: 400, and nothing stored", r.status === 400 && !row(TOK("badplat")));
  r = await device.onRequestPost({ request: req("POST", good("badmin", { morningMinute: 1500 })), env });
  t("an impossible minute: 400, and nothing stored", r.status === 400 && !row(TOK("badmin")));
  r = await device.onRequestPost({ request: req("POST", { ...good("x"), token: "short" }), env });
  t("a malformed token: 400", r.status === 400);

  r = await device.onRequestPost({ request: req("POST", good("anon", { tz: "Asia/Calcutta" })), env });
  const a = row(TOK("anon"));
  t("a signed-out phone is stored with no account", r.status === 200 && a && a.user_id === null);
  t("the zone is stored in its canonical spelling", a && a.tz === push.validZone("Asia/Calcutta"), a && a.tz);
  t("defaults: 09:00, every switch on", a && a.morning_minute === 540 && a.want_morning === 1 &&
    a.want_streak === 1 && a.want_challenge === 1);
  t("a new phone owes no morning today, because the player has just finished a game",
    a && a.sent_morning === utcDay(), a && a.sent_morning);

  await device.onRequestPost({ request: req("POST", good("anon", { morningMinute: 420, wantStreak: false })), env });
  await device.onRequestPost({ request: req("POST", good("anon", { tz: "Europe/Paris" })), env });
  const b = row(TOK("anon"));
  t("a start-up post that leaves preferences out keeps the stored ones",
    b.morning_minute === 420 && b.want_streak === 0 && b.want_morning === 1 && b.tz === "Europe/Paris",
    `${b.morning_minute} ${b.want_streak} ${b.tz}`);

  await device.onRequestPost({ request: req("POST", good("anon"), { cookie: "s-ny" }), env });
  t("posting with a session links the account", row(TOK("anon")).user_id === "u-ny");
  r = await device.onRequestPost({ request: req("POST", good("anon")), env });
  const j = await r.json();
  t("posting signed out clears it again", row(TOK("anon")).user_id === null && j.prefs && j.prefs.account === false);

  r = await device.onRequestGet({ request: req("GET", undefined, { headers: { "X-XI-Push-Token": TOK("anon") } }), env });
  const g = await r.json();
  t("GET reads the preferences from the header token", r.status === 200 && g.prefs.morningMinute === 420);
  const q = new Request("https://www.thexigames.com/api/push/device?token=" + TOK("anon"));
  r = await device.onRequestGet({ request: q, env });
  t("GET ignores a token in the query string", r.status === 400);
  r = await device.onRequestGet({ request: req("GET", undefined, { headers: { "X-XI-Push-Token": TOK("nobody") } }), env });
  t("GET for an unknown phone is 404", r.status === 404);

  r = await device.onRequestDelete({ request: req("DELETE", { token: TOK("anon") }, { csrf: false }), env });
  t("DELETE without the CSRF header is refused and deletes nothing", r.status === 403 && !!row(TOK("anon")));
  r = await device.onRequestDelete({ request: req("DELETE", { token: TOK("anon") }), env });
  t("DELETE forgets the phone", r.status === 200 && !row(TOK("anon")));
}

/* ======================================================================
   3. THE QUEUE: a challenge entry, through the real route
   ====================================================================== */
{
  db.exec(`INSERT INTO plays (play_id, game, mode, board_key, srv_score, started_at, srv_verified_at, srv_elapsed_secs)
             VALUES ('p-made', 'crossword', 'challenge', 'arsenal-1', 90, '2026-09-20 10:00:00', '2026-09-20 10:05:00', 300),
                    ('p-sam',  'crossword', 'challenge', 'arsenal-1', 77, '2026-09-20 11:00:00', '2026-09-20 11:06:00', 360),
                    ('p-own',  'crossword', 'challenge', 'arsenal-1', 60, '2026-09-20 12:00:00', '2026-09-20 12:06:00', 360);
           INSERT INTO challenges (id, theme_id, board_no, created_by, creator_name, play_id)
             VALUES ('abc123', 'arsenal', 1, 'u-ny', 'New York', 'p-made');`);
  const post = (playId, key, cookie) => entry.onRequestPost({
    request: new Request("https://www.thexigames.com/api/challenge/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-XI-Games": "1", "CF-Connecting-IP": "10.1.0." + (++ip),
                 ...(cookie ? { Cookie: "cxi_session=" + cookie } : {}) },
      body: JSON.stringify({ id: "abc123", playId, name: "Sam", entrantKey: key }),
    }), env });
  const outbox = () => db.prepare("SELECT * FROM push_outbox").all();

  let r = await post("p-sam", "entrant-key-sam");
  const j = await r.json();
  t("an entry lands", r.status === 200 && j.added === true, JSON.stringify(j));
  const o = outbox();
  t("and queues one message for the creator", o.length === 1 && o[0].user_id === "u-ny", o.length + " queued");
  t("naming the entrant and their score, linking the challenge",
    o[0] && /^Sam /.test(o[0].title) && /77/.test(o[0].body) && o[0].url === "/football/crossword/?c=abc123",
    o[0] && `${o[0].title} / ${o[0].url}`);
  r = await post("p-sam", "entrant-key-sam");
  t("a second finish by the same entrant queues nothing", outbox().length === 1);
  r = await post("p-own", "entrant-key-own", "s-ny");
  t("the creator entering their own challenge is not told about it", (await r.json()).added === true && outbox().length === 1);
  const hidden = games.GAMES.find((g) => games.LAUNCHED[g] && !games.isListed(g));
  const q = await push.queueChallengeResult(env, { creatorId: "u-ny", game: hidden, challengeId: "zzz999", name: "X", score: 1 });
  t("a result in an unlisted game is never queued", q === false && outbox().length === 1, hidden);
}

/* ======================================================================
   4. THE SENDER: three days of quarter-hour runs
   ====================================================================== */
{
  const T0 = at("2026-09-20T00:00:00Z");
  /* Five phones registered through the endpoint (the producer), one per case. */
  const phones = [
    ["london", "Europe/London", null],
    ["sydney", "Australia/Sydney", null],
    ["ny", "America/New_York", "s-ny"],
    ["la", "America/Los_Angeles", "s-la"],
    ["gone", "Europe/London", null],
    ["flaky", "Europe/London", null],
    ["stale", "Europe/London", null],
  ];
  for (const [k, tz, cookie] of phones) {
    await device.onRequestPost({ request: req("POST", { token: TOK(k), platform: "android", tz }, { cookie }), env });
  }
  /* The endpoint stamps real time. The simulation starts on a pinned day, so
     every morning is made owed from the start, and one phone is aged past
     STALE_DAYS. Both said here rather than hidden in a fixture. */
  db.prepare("UPDATE push_device SET sent_morning = NULL, sent_streak = NULL").run();
  db.prepare("UPDATE push_device SET seen_at = ? WHERE token = ?")
    .run(new Date(T0 - (push.STALE_DAYS + 1) * DAY).toISOString(), TOK("stale"));
  t("the sender has its seven phones", db.prepare("SELECT COUNT(*) n FROM push_device").get().n === 7);

  /* Their games, written by season-store itself. New York finished the day
     before the run began. Los Angeles finished that day and the first day. */
  await noteFinish(env, { id: "u-ny" }, "hilo", at("2026-09-19T15:00:00Z"));
  await noteFinish(env, { id: "u-la" }, "hilo", at("2026-09-19T15:00:00Z"));
  await noteFinish(env, { id: "u-la" }, "grid", at("2026-09-20T15:00:00Z"));

  const log = [];
  const send = async (token, msg) => {
    log.push({ token, at: sim, ...msg });
    if (token === TOK("gone")) return fcm.GONE;
    if (token === TOK("flaky")) return fcm.FAILED;
    return fcm.SENT;
  };
  let sim = T0, runs = 0, first = null;
  for (; sim < T0 + 3 * DAY; sim += 15 * MIN) {
    const st = await run(env, sim, send);
    if (!first) first = st;
    runs++;
  }

  const sends = (k, title) => log.filter((e) => e.token === TOK(k) && (!title || e.title === title));
  const MORN = push.morningMessage().title;
  const STREAK = push.streakMessage(1).title;
  const times = (k, title, tz) => sends(k, title).map((e) => new Date(e.at).toISOString().slice(0, 16) + " " + hhmm(e.at, tz));

  const expect = (label, k, title, tz, want) => {
    const got = sends(k, title).map((e) => new Date(e.at).toISOString().slice(0, 16));
    t(label, JSON.stringify(got) === JSON.stringify(want), times(k, title, tz).join(" | ") || "nothing sent");
  };
  expect("London: 09:00 local on each of the three days", "london", MORN, "Europe/London",
    ["2026-09-20T08:00", "2026-09-21T08:00", "2026-09-22T08:00"]);
  expect("Sydney (UTC+10): at the reset, 10:00 local, never at 9am before the boards exist", "sydney", MORN, "Australia/Sydney",
    ["2026-09-20T00:00", "2026-09-21T00:00", "2026-09-22T00:00"]);
  expect("New York: 09:00 local, not at the 8pm reset", "ny", MORN, "America/New_York",
    ["2026-09-20T13:00", "2026-09-21T13:00", "2026-09-22T13:00"]);
  expect("Los Angeles: no morning on a day already played", "la", MORN, "America/Los_Angeles",
    ["2026-09-21T16:00", "2026-09-22T16:00"]);
  expect("New York: one streak nudge, on the day the run was at risk, 17:00 local", "ny", STREAK, "America/New_York",
    ["2026-09-20T21:00"]);
  expect("Los Angeles: nudged once, 14:00 local, on the day after two played", "la", STREAK, "America/Los_Angeles",
    ["2026-09-21T21:00"]);
  const laNudge = sends("la", STREAK)[0];
  t("the nudge counts the run from the season rule", laNudge && /^2 days/.test(laNudge.body), laNudge && laNudge.body);
  t("a signed-out phone never gets a streak nudge", sends("london", STREAK).length === 0 && sends("sydney", STREAK).length === 0);

  /* The law the design asked for, over everything the run sent. */
  const perDay = new Map();
  for (const e of log) {
    if (e.token === TOK("flaky")) continue;          // failures, counted separately below
    const k = e.token + " " + e.title + " " + utcDay(e.at);
    perDay.set(k, (perDay.get(k) || 0) + 1);
  }
  const doubles = [...perDay].filter(([, n]) => n > 1);
  t("no phone got two of the same message on one UTC day", doubles.length === 0, doubles.map(([k]) => k).slice(0, 3).join(", "));

  t("a token FCM calls gone is tried once and deleted", sends("gone").length === 1 && !row(TOK("gone")));
  const flaky = sends("flaky", MORN);
  const flakyDays = new Set(flaky.map((e) => utcDay(e.at)));
  t("a failing phone is retried through the morning window, then left until tomorrow",
    flaky.length === 3 * (push.MORNING_LATE / (15 * MIN)) && flakyDays.size === 3, flaky.length + " attempts");
  t("and is never marked sent", row(TOK("flaky")).sent_morning === null);
  t("a phone not seen for STALE_DAYS is pruned on the first run, unsent",
    !row(TOK("stale")) && sends("stale").length === 0 && first.pruned >= 1, "first run pruned " + first.pruned);

  const ch = log.filter((e) => e.channel === "challenges");
  t("the queued challenge result went to the creator's phone, once, on the challenges channel",
    ch.length === 1 && ch[0].token === TOK("ny") && ch[0].address === push.SITE + "/football/crossword/?c=abc123",
    ch.map((e) => e.address).join(", "));
  t("and the queue is empty afterwards", db.prepare("SELECT COUNT(*) n FROM push_outbox").get().n === 0);

  const rr = db.prepare("SELECT COUNT(*) n, MAX(ran_at) last FROM push_run").get();
  t("every run is written down, for the check that watches the sender",
    rr.n === runs && rr.last === new Date(T0 + 3 * DAY - 15 * MIN).toISOString(), `${rr.n} of ${runs}; last ${rr.last}`);
  const bad = log.filter((e) => !String(e.address || "").startsWith(push.SITE + push.APP_PATH));
  t("every message carries an address inside the app's path", log.length > 0 && bad.length === 0, bad.length + " outside");
}

/* ======================================================================
   5. THE KEY: fcm.js signs, and Google's side would accept the signature
   ====================================================================== */
{
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"]);
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
  const pem = "-----BEGIN PRIVATE KEY-----\n" + der.match(/.{1,64}/g).join("\n") + "\n-----END PRIVATE KEY-----\n";
  const sa = JSON.stringify({ client_email: "sender@example.iam.gserviceaccount.com", private_key: pem, project_id: "xi-test" });

  const calls = [];
  let fcmReply = { status: 200, body: { name: "projects/xi-test/messages/1" } };
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3599 }), { status: 200 });
    }
    return new Response(JSON.stringify(fcmReply.body), { status: fcmReply.status });
  };
  const clock = () => at("2026-09-20T08:00:00Z");
  const send = fcm.fcmSender(sa, fakeFetch, clock);
  const msg = { channel: "reminders", title: "T", body: "B", address: push.SITE + "/football/" };
  const out = await send(TOK("key"), msg);
  t("a message is sent", out === fcm.SENT);

  const form = new URLSearchParams(calls[0].init.body);
  const jwt = form.get("assertion") || "";
  const [h, p, sig] = jwt.split(".");
  const un = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const verified = !!sig && await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, un(sig), new TextEncoder().encode(h + "." + p));
  const claims = p ? JSON.parse(un(p).toString()) : {};
  t("the JWT verifies against the key's public half", verified);
  t("its claims are the ones Google asks for",
    claims.iss === "sender@example.iam.gserviceaccount.com" && claims.aud === "https://oauth2.googleapis.com/token" &&
    claims.scope === "https://www.googleapis.com/auth/firebase.messaging" && claims.exp - claims.iat === 3600 &&
    claims.iat === Math.floor(clock() / 1000), JSON.stringify(claims));
  t("the grant type is the JWT bearer grant", form.get("grant_type") === "urn:ietf:params:oauth:grant-type:jwt-bearer");

  const sent = calls[1];
  const body = sent ? JSON.parse(sent.init.body) : {};
  t("sent to the project's v1 endpoint with the access token",
    sent && sent.url === "https://fcm.googleapis.com/v1/projects/xi-test/messages:send" &&
    sent.init.headers.Authorization === "Bearer ya29.test");
  t("on the app's channel, with the address as data",
    body.message && body.message.android.notification.channel_id === "reminders" &&
    body.message.data.url === push.SITE + "/football/" && body.message.token === TOK("key"));
  await send(TOK("key"), msg);
  t("the access token is reused, not fetched per message",
    calls.filter((c) => c.url.startsWith("https://oauth2")).length === 1);

  const o = (status, body) => fcm.outcomeOf(status, body);
  t("UNREGISTERED is gone", o(404, { error: { details: [{ errorCode: "UNREGISTERED" }] } }) === fcm.GONE);
  t("a token FCM cannot parse is gone",
    o(400, { error: { message: "The registration token is not a valid FCM registration token", details: [{ errorCode: "INVALID_ARGUMENT" }] } }) === fcm.GONE);
  t("a malformed MESSAGE does not delete the phone",
    o(400, { error: { message: "Invalid value at 'message.android'", details: [{ errorCode: "INVALID_ARGUMENT" }] } }) === fcm.FAILED);
  t("a server error is retried, not deleted", o(503, null) === fcm.FAILED);

  let msgText = "";
  try { fcm.readServiceAccount(JSON.stringify({ client_email: "a@b", project_id: "p", secret_bit: "SHOULD-NOT-PRINT" })); }
  catch (e) { msgText = e.message; }
  t("a key with a part missing says which, and prints none of it",
    /private_key/.test(msgText) && !/SHOULD-NOT-PRINT/.test(msgText), msgText);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
