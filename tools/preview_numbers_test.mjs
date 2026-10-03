/* tools/preview_numbers_test.mjs — the owner's preview, for the two games whose
 * answer is a number: HiLo XI and Ballpark XI.
 *
 *   node tools/preview_numbers_test.mjs      (from the repo root)
 *
 * The owner, 3 Oct 2026: play the next days of any game "in its proper form"
 * from /admin/, recording nothing. Both games are server-judged, so a preview
 * has to be able to open a future board AND have every call or guess on it
 * judged by the real code -- and nobody else may do either. The shared layer
 * (functions/_lib/preview.js) is proved by tools/preview_test.mjs; this suite
 * proves that HiLo's and Ballpark's endpoints ask it, at every door.
 *
 * Executed, not read: the real handlers over SQLite built from every
 * migration, with the round's id minted by the real page layer
 * (shared/xi-preview.js + shared/xi-plays.js in jsdom) rather than written
 * here, because the id is the one thing the server takes on trust.
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
if (!JSDOM) { console.log("jsdom is required: the round's id comes from the real page layer. Not a pass."); process.exit(1); }

const P = await imp("functions/_lib/preview.js");
const { utcDay, dailyNumber } = await imp("functions/_lib/daily.js");
const { HL_SAMPLE_BOARDS } = await imp("functions/_lib/hl-sample.js");
const { BP_SAMPLE_BOARDS } = await imp("functions/_lib/bp-sample.js");
const DAY = 86400000;
const NOW = Date.now();
const TODAY = utcDay(NOW);
const AHEAD = utcDay(NOW + 5 * DAY);
const EVE = utcDay(NOW + 4 * DAY);         // a day between today and the preview's
const AHEAD_NO = dailyNumber(NOW + 5 * DAY);

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
const ctx = (request) => ({ request, env, data: {}, params: {} });
const call = async (fn, r) => { const res = await fn(ctx(r)); let j = null; try { j = await res.json(); } catch (e) {} return { status: res.status, j }; };

const scratch = new Set([...P.PREVIEW_ROUND_TABLES.map(([n]) => n), "rate_limits"]);
function counts() {
  const out = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
    if (!scratch.has(name)) out[name] = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
  }
  return out;
}
const moved = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]).map((k) => `${k} ${a[k]}->${b[k]}`);

/* THE ROUND'S ID, AS THE PAGE MINTS IT. Both games take their id from
   XIPlays.current(), and in a preview XIPlays lends a scratch one. Asked of
   the real files rather than written here, so a page layer that stopped
   prefixing would fail this suite rather than be papered over by it. */
function pageId(game, day) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>",
    { url: `https://www.thexigames.com/admin/football/${game}/${day}`, runScripts: "outside-only" });
  const w = dom.window;
  w.Response = Response; w.Headers = Headers; w.Request = Request;
  w.fetch = async () => new Response("{}", { status: 200 });
  if (day) w.eval(`window.XI_PREVIEW = ${JSON.stringify({ game, day })};`);
  w.eval(read("shared/xi-preview.js"));
  w.eval(read("shared/xi-plays.js"));
  w.eval(`XIPlays.start({ game: ${JSON.stringify(game)}, mode: 'daily' })`);
  return w.eval("XIPlays.current().playId");
}

/* ---- the banks: seeded before anything loads them (bank-cache.js keeps a
   bank per database for five minutes, so a seed after a load is unseen) ---- */
const now8601 = new Date().toISOString();
const hlDaily = { ...HL_SAMPLE_BOARDS[0], id: "9001" };
const hlEve = { ...HL_SAMPLE_BOARDS[1], id: "9002" };
const hlClub = { ...HL_SAMPLE_BOARDS[2], id: "9003" };
for (const [b, kind, club] of [[hlDaily, "daily", null], [hlEve, "daily", null], [hlClub, "club", "west-bromwich-albion"]]) {
  db.prepare("INSERT INTO hl_board (id, kind, club, category, subtitle, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(b.id, kind, club, b.category, b.subtitle, JSON.stringify(b), now8601);
}
db.prepare("INSERT INTO hl_schedule (day, board_id) VALUES (?, ?)").run(AHEAD, hlDaily.id);
db.prepare("INSERT INTO hl_schedule (day, board_id) VALUES (?, ?)").run(EVE, hlEve.id);

const bpBoard = { ...BP_SAMPLE_BOARDS[0], id: "bp-9001" };
db.prepare("INSERT INTO bp_board (id, ordinal, payload, updated_at) VALUES (?, ?, ?, ?)")
  .run(bpBoard.id, 1, JSON.stringify({ questions: bpBoard.questions }), now8601);
db.prepare("INSERT INTO bp_schedule (day, board_id) VALUES (?, ?)").run(AHEAD, bpBoard.id);

/* ============================== HiLo XI ============================== */
console.log("=== HiLo XI: a day ahead ===");
{
  const hlb = await imp("functions/_lib/hl-board.js");
  const daily = (await imp("functions/api/hilo/daily.js")).onRequestGet;
  const board = (await imp("functions/api/hilo/board.js")).onRequestGet;
  const archive = (await imp("functions/api/hilo/archive.js")).onRequestGet;
  const clock = (await imp("functions/api/hilo/clock.js")).onRequestPost;
  const callFn = (await imp("functions/api/hilo/call.js")).onRequestPost;
  const finish = (await imp("functions/api/hilo/finish.js")).onRequestPost;
  const secretName = hlDaily.chain[1].name;
  const snap = counts();

  const plain = await call(daily, req("/api/hilo/daily", { who: "player", preview: AHEAD }));
  const asked = await call(daily, req(`/api/hilo/daily?day=${AHEAD}`, { who: "player", preview: AHEAD }));
  const byNo = await call(daily, req(`/api/hilo/daily?no=${AHEAD_NO}`, { who: "player" }));
  t("a player, with or without the header, gets today -- and no board, because there is none today",
    plain.status === 200 && plain.j.today === TODAY && plain.j.board === null && !JSON.stringify(plain.j).includes(secretName),
    `${plain.status} ${plain.j && plain.j.today}`);
  t("  and asking for the day by date or number is refused", asked.status === 403 && byNo.status === 403 &&
    !JSON.stringify(asked.j).includes(secretName), `${asked.status} ${byNo.status}`);
  const ownerPlain = await call(daily, req(`/api/hilo/daily?day=${AHEAD}`, { who: "owner" }));
  t("so is the owner without a preview", ownerPlain.status === 403);

  const shown = await call(daily, req("/api/hilo/daily", { who: "owner", preview: AHEAD }));
  const b = shown.j && shown.j.board;
  t("the owner's preview is served that day's board, as today's",
    shown.status === 200 && shown.j.day === AHEAD && shown.j.today === AHEAD && shown.j.no === shown.j.todayNo &&
    b && b.token === hlb.dayToken(AHEAD) && b.id === hlDaily.id, `${shown.status} ${shown.j && shown.j.day}`);
  t("  through the same projection a player's board goes through: one value, no sources",
    b && JSON.stringify(b) === JSON.stringify(hlb.publicBoard(hlDaily, hlb.dayToken(AHEAD))) &&
    b.rows.slice(1).every((r) => Object.keys(r).join() === "name") && !JSON.stringify(b).includes('"source"'));

  /* The archive lists days before today; a preview's today is five days on,
     so the day between is in it for the owner and in nobody else's. */
  const arcPlayer = await call(archive, req("/api/hilo/archive", { who: "player", preview: AHEAD }));
  const arcOwner = await call(archive, req("/api/hilo/archive", { who: "owner", preview: AHEAD }));
  t("the archive: a player's stops at yesterday, the preview's at the day before its own",
    arcPlayer.status === 200 && arcPlayer.j.today === TODAY && !arcPlayer.j.days.some((d) => d.day >= TODAY) &&
    arcOwner.j.today === AHEAD && arcOwner.j.days.some((d) => d.day === EVE) && !arcOwner.j.days.some((d) => d.day === AHEAD),
    `player ${arcPlayer.j && arcPlayer.j.days.length}, owner ${arcOwner.j && arcOwner.j.days.map((d) => d.day).join(",")}`);

  const byIdPlayer = await call(board, req(`/api/hilo/board?id=${hlDaily.id}`, { who: "player", preview: AHEAD }));
  const byIdOwner = await call(board, req(`/api/hilo/board?id=${hlDaily.id}`, { who: "owner", preview: AHEAD }));
  t("free play by id: a future daily is refused to a player, served to the preview",
    byIdPlayer.status === 404 && byIdOwner.status === 200 && byIdOwner.j.board.id === hlDaily.id &&
    byIdOwner.j.board.rows.slice(1).every((r) => Object.keys(r).join() === "name"),
    `${byIdPlayer.status} ${byIdOwner.status}`);
  const club = await call(board, req(`/api/hilo/board?id=${hlClub.id}`, { who: "player" }));
  t("  a club board is still everybody's, any day", club.status === 200 && club.j.board.club);

  /* A player cannot call against the future, header or none. */
  const token = hlb.dayToken(AHEAD);
  const pId = "player-round-1";
  const pClock = await call(clock, req("/api/hilo/clock", { who: "player", preview: AHEAD, method: "POST", body: { playId: pId, token } }));
  const pCall = await call(callFn, req("/api/hilo/call", { who: "player", preview: AHEAD, method: "POST", body: { playId: pId, token, index: 1, call: "higher" } }));
  const oCall = await call(callFn, req("/api/hilo/call", { who: "owner", method: "POST", body: { playId: pId, token, index: 1, call: "higher" } }));
  const pBy = await call(callFn, req("/api/hilo/call", { who: "player", method: "POST", body: { token: hlb.boardToken(hlDaily.id), index: 1, call: "higher" } }));
  t("a player cannot call on that day's board, by day token or by id, header or none; nor the owner without a preview",
    pCall.status === 404 && oCall.status === 404 && pBy.status === 404 && pCall.j.value === undefined &&
    db.prepare("SELECT COUNT(*) AS n FROM hl_call WHERE play_id = ?").get(pId).n === 0,
    `${pCall.status} ${pBy.status} ${oCall.status}`);
  db.prepare("DELETE FROM hl_round WHERE play_id = ?").run(pId);   // /clock never checks a board: that is not new
  void pClock;
  const clubCall = await call(callFn, req("/api/hilo/call", { who: "player", method: "POST", body: { token: hlb.boardToken(hlClub.id), index: 1, call: "higher" } }));
  t("  and a club board's calls are judged for a player as before", clubCall.status === 200 && typeof clubCall.j.right === "boolean");

  /* The preview's round, end to end. */
  const playId = pageId("hilo", AHEAD);
  t("the preview's round id comes from the page, and is a scratch one", P.isPreviewId(playId), playId);
  const k = await call(clock, req("/api/hilo/clock", { who: "owner", preview: AHEAD, method: "POST", body: { playId, token } }));
  const verdicts = [];
  for (let i = 1; i <= 11; i++) {
    const truth = Number(hlDaily.chain[i].value) > Number(hlDaily.chain[i - 1].value) ? "higher" : "lower";
    const said = i === 3 ? (truth === "higher" ? "lower" : "higher") : truth;   // one wrong on purpose
    verdicts.push(await call(callFn, req("/api/hilo/call", { who: "owner", preview: AHEAD, method: "POST", body: { playId, token, index: i, call: said } })));
  }
  t("  every call on it is judged by the real judge, against the board's own values",
    k.status === 200 && k.j.verified === true && verdicts.every((v, i) => v.status === 200 && v.j.value === Number(hlDaily.chain[i + 1].value)) &&
    verdicts.filter((v) => v.j.right).length === 10 && verdicts[2].j.right === false,
    verdicts.map((v) => v.status + (v.j && v.j.right ? "+" : "-")).join(" "));
  const rows = db.prepare("SELECT elapsed_ms FROM hl_call WHERE play_id = ? ORDER BY idx").all(playId);
  t("  timed on one clock: /clock and /call agree what moment it is", rows.length === 11 && rows.every((r) => r.elapsed_ms >= 0 && r.elapsed_ms < 60000),
    rows.map((r) => r.elapsed_ms).join(","));
  const fin = await call(finish, req("/api/hilo/finish", { who: "owner", preview: AHEAD, method: "POST", body: { playId } }));
  t("  and scored by the real scorer", fin.status === 200 && fin.j.verified === true && fin.j.right === 10 && fin.j.score > 0,
    JSON.stringify(fin.j));
  /* On REAL SQL, which is the only place this can be proved: verified_test's
     stub hands back columns the SELECT never named. */
  t("  with the round's length measured, not null", Number.isInteger(fin.j.elapsedSecs) && fin.j.elapsedSecs >= 0 && fin.j.elapsedSecs < 60,
    String(fin.j.elapsedSecs));
  const change = moved(snap, counts());
  t("  and nothing outside the scratch tables was written", change.length === 0, change.join(", ") || "every other table unchanged");
  t("  and every scratch row it wrote is marked for the purge",
    db.prepare("SELECT COUNT(*) AS n FROM hl_round WHERE play_id NOT LIKE 'pv-%'").get().n === 0 &&
    db.prepare("SELECT COUNT(*) AS n FROM hl_call WHERE play_id NOT LIKE 'pv-%'").get().n === 0);
}

/* ============================== Ballpark XI ============================== */
console.log("\n=== Ballpark XI: a day ahead ===");
{
  const bpb = await imp("functions/_lib/bp-board.js");
  const daily = (await imp("functions/api/ballpark/daily.js")).onRequestGet;
  const archive = (await imp("functions/api/ballpark/archive.js")).onRequestGet;
  const open = (await imp("functions/api/ballpark/open.js")).onRequestPost;
  const narrow = (await imp("functions/api/ballpark/narrow.js")).onRequestPost;
  const answer = (await imp("functions/api/ballpark/answer.js")).onRequestPost;
  const firstQ = bpBoard.questions[0].question;
  const snap = counts();

  const plain = await call(daily, req("/api/ballpark/daily", { who: "player", preview: AHEAD }));
  const byNo = await call(daily, req(`/api/ballpark/daily?no=${AHEAD_NO}`, { who: "player", preview: AHEAD }));
  t("a player, with or without the header, gets today -- and no board, because there is none today",
    plain.status === 200 && plain.j.today === dailyNumber(NOW) && plain.j.board === null && !JSON.stringify(plain.j).includes(firstQ),
    `${plain.status} ${plain.j && plain.j.day}`);
  t("  and asking for the day by number is refused", byNo.status === 403 && !JSON.stringify(byNo.j).includes(firstQ), String(byNo.status));
  const ownerPlain = await call(daily, req(`/api/ballpark/daily?no=${AHEAD_NO}`, { who: "owner" }));
  t("so is the owner without a preview", ownerPlain.status === 403);

  const shown = await call(daily, req("/api/ballpark/daily", { who: "owner", preview: AHEAD }));
  const b = shown.j && shown.j.board;
  t("the owner's preview is served that day's board, as today's",
    shown.status === 200 && shown.j.day === AHEAD && shown.j.no === AHEAD_NO && shown.j.today === AHEAD_NO &&
    b && b.id === bpBoard.id && b.questions.length === 11, `${shown.status} ${shown.j && shown.j.day}`);
  t("  without its answers, exactly as a player's would be",
    b && bpb.leaks(b).length === 0 && !JSON.stringify(b).includes('"answer"') &&
    JSON.stringify(b) === JSON.stringify(bpb.publicBoard(bpBoard, bpb.boardToken(bpBoard.id))));

  const arcPlayer = await call(archive, req("/api/ballpark/archive", { who: "player", preview: AHEAD }));
  const arcOwner = await call(archive, req("/api/ballpark/archive", { who: "owner", preview: AHEAD }));
  t("the archive: the day is in the preview's list and in nobody else's",
    arcPlayer.status === 200 && !arcPlayer.j.days.some((d) => d.day === AHEAD) && arcOwner.j.days.some((d) => d.day === AHEAD && d.no === AHEAD_NO),
    `player ${arcPlayer.j && arcPlayer.j.days.length}, owner ${arcOwner.j && arcOwner.j.days.length}`);

  const token = bpb.boardToken(bpBoard.id);
  const pId = "player-round-2";
  const pOpen = await call(open, req("/api/ballpark/open", { who: "player", preview: AHEAD, method: "POST", body: { token, playId: pId, idx: 1 } }));
  const pNarrow = await call(narrow, req("/api/ballpark/narrow", { who: "player", preview: AHEAD, method: "POST", body: { token, playId: pId, idx: 1 } }));
  const pAnswer = await call(answer, req("/api/ballpark/answer", { who: "player", preview: AHEAD, method: "POST", body: { token, playId: pId, idx: 1, guess: 1 } }));
  const oOpen = await call(open, req("/api/ballpark/open", { who: "owner", method: "POST", body: { token, playId: pId, idx: 1 } }));
  t("a player cannot open, narrow or answer on that day's board, header or none; nor the owner without a preview",
    pOpen.status === 404 && pNarrow.status === 404 && pAnswer.status === 404 && oOpen.status === 404 &&
    !JSON.stringify(pAnswer.j).includes('"answer"') &&
    db.prepare("SELECT COUNT(*) AS n FROM bp_round WHERE play_id = ?").get(pId).n === 0,
    `${pOpen.status} ${pNarrow.status} ${pAnswer.status} ${oOpen.status}`);

  const playId = pageId("ballpark", AHEAD);
  t("the preview's round id comes from the page, and is a scratch one", P.isPreviewId(playId), playId);
  const as = (path, body) => req(path, { who: "owner", preview: AHEAD, method: "POST", body: { token, playId, ...body } });
  const o1 = await call(open, as("/api/ballpark/open", { idx: 1, touch: true }));
  const q1 = bpBoard.questions[0];
  const a1 = await call(answer, as("/api/ballpark/answer", { idx: 1, guess: q1.answer }));
  t("  it opens a round, and a guess on it is graded by the real ladder",
    o1.status === 200 && o1.j.scored === true && a1.status === 200 && a1.j.scored === true && a1.j.timedOut === false &&
    a1.j.grade === "Bang on" && a1.j.answer === Number(q1.answer) && a1.j.points > 0,
    `${o1.status} ${a1.status} ${a1.j && a1.j.grade} ${a1.j && a1.j.points}`);
  const o2 = await call(open, as("/api/ballpark/open", { idx: 2 }));
  const n2 = await call(narrow, as("/api/ballpark/narrow", { idx: 2 }));
  const q2 = bpBoard.questions[1];
  t("  and a narrow on it is dealt by the real window, around the real answer",
    o2.status === 200 && n2.status === 200 && n2.j.scored === true && n2.j.lo <= q2.answer && n2.j.hi >= q2.answer &&
    n2.j.cost && n2.j.cost.sub === 1, `${o2.status} ${n2.status} ${n2.j && n2.j.lo}..${n2.j && n2.j.hi}`);
  const a2 = await call(answer, as("/api/ballpark/answer", { idx: 2, guess: q2.answer }));
  t("  timed on one clock: /open and /answer agree what moment it is",
    a2.status === 200 && a2.j.timedOut === false && a2.j.elapsedMs >= 0 && a2.j.elapsedMs < 60000, a2.j && String(a2.j.elapsedMs));
  const change = moved(snap, counts());
  t("  and nothing outside the scratch tables was written", change.length === 0, change.join(", ") || "every other table unchanged");
  t("  and every scratch row it wrote is marked for the purge",
    ["bp_round", "bp_answer", "bp_narrow"].every((n) => db.prepare(`SELECT COUNT(*) AS n FROM ${n} WHERE play_id NOT LIKE 'pv-%'`).get().n === 0) &&
    db.prepare("SELECT COUNT(*) AS n FROM bp_answer WHERE play_id = ?").get(playId).n === 2);
}

/* ---- the purge takes both games' scratch rows ---- */
/* Counted, not pinned: a round of eleven calls plus its kick off, and a
   Ballpark round of two answers and a narrow, is what the flows above wrote. */
const ours = ["hl_round", "hl_call", "bp_round", "bp_answer", "bp_narrow"];
const rowsIn = () => ours.reduce((n, tb) => n + db.prepare(`SELECT COUNT(*) AS n FROM ${tb}`).get().n, 0);
const had = rowsIn();
const removed = await P.purgePreviewRounds(env);
const left = rowsIn();
t("\nopening /admin/ deletes both games' scratch rows", had === 12 + 4 && removed === had && left === 0,
  `${had} scratch rows, ${removed} removed, ${left} left`);

done();
