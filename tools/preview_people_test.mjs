/* tools/preview_people_test.mjs — the owner's preview, for the games about
 * people: Who Am I XI, Who Am I XI: Friends and Lightning Round XI: Friends.
 *
 *   node tools/preview_people_test.mjs      (from the repo root)
 *
 * The owner, 3 Oct 2026: play the next days of any game "in its proper form"
 * from /admin/, recording nothing. tools/preview_test.mjs proves the shared
 * layer (whose clock moves, the admin pages, the page shim) and QuickFire;
 * this proves the three servers below were taught to ask that clock, and that
 * a preview of them writes nothing outside the scratch round tables.
 *
 * For each game: a board five days ahead and none today; a player, with or
 * without the preview header, and the owner without it, are not served it and
 * cannot open a round on it; the owner's preview is served it as today's,
 * without its answers; the round it opens is a scratch one (pv-) and is judged
 * by the real code; and no table outside PREVIEW_ROUND_TABLES and rate_limits
 * changes its row count across the whole flow.
 *
 * Executed, not read: the real route handlers, over SQLite built from every
 * migration, the same fake D1 as preview_test.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const done = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };

let sqlite = null;
try { sqlite = await import("node:sqlite"); } catch (e) { sqlite = null; }
if (!sqlite) { console.log("node:sqlite is required: this suite executes real SQL. Not a pass."); process.exit(1); }

const P = await imp("functions/_lib/preview.js");
const { utcDay, dailyNoForDay } = await imp("functions/_lib/daily.js");
const { fold } = await imp("functions/_lib/wadata.js");
const { answerKey } = await imp("functions/_lib/frwa-data.js");
const { RUN_MS, SECRET_FIELDS, deal } = await imp("functions/_lib/lr-round.js");
const DAY = 86400000;
const NOW = Date.now();
const TODAY = utcDay(NOW);
const AHEAD = utcDay(NOW + 5 * DAY);
const AHEAD_NO = dailyNoForDay(AHEAD);

/* ---- the database, as production has it (preview_test's loader) ---------- */
const db = new sqlite.DatabaseSync(":memory:");
const MIG = path.join(ROOT, "data", "migrations");
for (const f of fs.readdirSync(MIG).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort()) {
  const text = fs.readFileSync(path.join(MIG, f), "utf8").split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
  for (const st of text.split(/;\s*(?:\n|$)/).map((x) => x.trim()).filter(Boolean)) {
    try { db.exec(st); } catch (e) { if (!/duplicate column/i.test(e.message)) throw new Error(`${f}: ${e.message}`); }
  }
}
const stmt = (sql, args = []) => ({
  sql, args,
  bind: (...a) => stmt(sql, a),
  first: async () => db.prepare(sql).get(...args) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...args) }),
  run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
});
const env = {
  DB: {
    prepare: (sql) => stmt(sql),
    /* Lightning marks an answer in one transaction (lr-play.js answerRun). */
    batch: async (list) => {
      db.exec("BEGIN");
      try { for (const s of list) db.prepare(s.sql).run(...s.args); db.exec("COMMIT"); }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  },
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
const ctx = (request, params = {}) => ({ request, env, data: {}, params });
const call = async (fn, r, params) => {
  const res = await fn(ctx(r, params));
  let j = null; try { j = await res.json(); } catch (e) {}
  return { status: res.status, j };
};

/* NOTHING BUT SCRATCH: preview_test's measure, unchanged. */
const scratch = new Set([...P.PREVIEW_ROUND_TABLES.map(([n]) => n), "rate_limits"]);
function counts() {
  const out = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
    if (!scratch.has(name)) out[name] = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
  }
  return out;
}
const moved = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]).map((k) => `${k} ${a[k]}->${b[k]}`);

/* =========================================================================
   WHO AM I XI (football) and WHO AM I XI: FRIENDS — one server, two decks
   ========================================================================= */

/* Football: eleven doors, each a verified player who left that club. */
const FB_NAME = (i) => `Preview Striker ${["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven"][i - 1]}`;
for (let i = 1; i <= 11; i++) {
  const name = FB_NAME(i);
  const clubs = JSON.stringify([{ club: `Door Club ${i}`, from: 2001, to: 2005, apps: 100, goals: 20 },
                                { club: `Other Club ${i}`, from: 2005, to: 2009, apps: 80, goals: 10 }]);
  db.prepare(`INSERT INTO wa_player (id, name, search_key, nationality, position, birth_year, club_count, club_history, clubs, status)
    VALUES (?, ?, ?, 'England', 'Forward', 1980, 2, ?, ?, 'verified')`)
    .run(fold(name), name, fold(name), `2001-2005 Door Club ${i} - 2005-2009 Other Club ${i}`, clubs);
  db.prepare("INSERT INTO wa_door (play_date, slot, club, leave_year, player_id) VALUES (?, ?, ?, 2005, ?)")
    .run(AHEAD, i, `Door Club ${i}`, fold(name));
}
db.prepare("INSERT INTO wa_board (play_date, status) VALUES (?, 'published')").run(AHEAD);

/* Friends: five cards, one daily round (letter A) of three clues each. */
const FR_NAME = (i) => `Preview Character ${["Alpha", "Bravo", "Charlie", "Delta", "Echo"][i - 1]}`;
for (let i = 1; i <= 5; i++) {
  const id = "PVCARD" + i;
  db.prepare("INSERT INTO fr_wa_card (id, name, deck, section, card_no, depth, rounds, status) VALUES (?, ?, 'main', 'People', ?, 3, 1, 'published')")
    .run(id, FR_NAME(i), i);
  for (let s = 1; s <= 3; s++) {
    db.prepare("INSERT INTO fr_wa_clue (card_id, n, round_letter, step, text, vs) VALUES (?, ?, 'A', ?, ?, 'none')")
      .run(id, s, s, `Secret clue ${s} for card ${i}`);
    db.prepare("INSERT INTO fr_wa_daily_clue (card_id, round_letter, step, n) VALUES (?, 'A', ?, ?)").run(id, s, s);
  }
  db.prepare("INSERT INTO fr_wa_answer (card_id, answer, kind) VALUES (?, ?, 'accept')").run(id, answerKey(FR_NAME(i)));
  db.prepare("INSERT INTO fr_wa_door (play_date, slot, card_id, round_letter) VALUES (?, ?, ?, 'A')").run(AHEAD, i, id);
}
db.prepare("INSERT INTO fr_wa_board (play_date, status) VALUES (?, 'published')").run(AHEAD);

const decks = [
  { name: "Who Am I XI", game: "whoami", api: "functions/api/whoami", params: {}, doors: 11,
    secret: FB_NAME, url: "/api/whoami" },
  { name: "Who Am I XI: Friends", game: "whoami_fr", api: "functions/api/whoami/[game]", params: { game: "whoami_fr" }, doors: 5,
    secret: FR_NAME, url: "/api/whoami/whoami_fr" },
];
for (const d of decks) {
  console.log(`\n=== ${d.name}: a board five days ahead ===`);
  const snap = counts();
  const route = async (n) => (await imp(`${d.api}/${n}.js`));
  const daily = (await route("daily")).onRequestGet;
  const archive = (await route("archive")).onRequestGet;
  const play = (await route("play")).onRequestPost;
  const clue = (await route("clue")).onRequestPost;
  const guess = (await route("guess")).onRequestPost;
  const finish = (await route("finish")).onRequestPost;
  const C = (fn, r) => call(fn, r, d.params);
  const leaks = (j) => { const s = JSON.stringify(j || {}); return [1, 2, 3].some((i) => s.includes(d.secret(i))); };

  const asPlayer = await C(daily, req(d.url + "/daily", { who: "player", preview: AHEAD }));
  const byDate = await C(daily, req(d.url + `/daily?date=${AHEAD}`, { who: "player", preview: AHEAD }));
  const byNo = await C(daily, req(d.url + `/daily?no=${AHEAD_NO}`, { who: "player", preview: AHEAD }));
  const stranger = await C(daily, req(d.url + `/daily?date=${AHEAD}`, { preview: AHEAD }));
  t("a player, header or none, gets today (and there is no board today) -- by day, by date, by number",
    asPlayer.status === 404 && byDate.status === 404 && byNo.status === 404 && stranger.status === 404 && !leaks(asPlayer.j),
    [asPlayer.status, byDate.status, byNo.status, stranger.status].join(" "));
  const ownerPlain = await C(daily, req(d.url + `/daily?date=${AHEAD}`, { who: "owner" }));
  const ownerNo = await C(daily, req(d.url + `/daily?no=${AHEAD_NO}`, { who: "owner" }));
  t("so does the owner without a preview", ownerPlain.status === 404 && ownerNo.status === 404);
  const arch = await C(archive, req(d.url + "/archive", { who: "player", preview: AHEAD }));
  t("and a player's archive does not list it", arch.status === 200 && !(arch.j.boards || []).some((b) => b.day === AHEAD) && arch.j.today === TODAY);

  const shown = await C(daily, req(d.url + "/daily", { who: "owner", preview: AHEAD }));
  t("the owner's preview is served that day's board, as today's",
    shown.status === 200 && shown.j.day === AHEAD && shown.j.isToday === true && shown.j.no === AHEAD_NO &&
    shown.j.board && shown.j.board.doors.length === d.doors,
    shown.status + " " + (shown.j && shown.j.day));
  t("  without its answers, exactly as a player's would be",
    !leaks(shown.j) && !/player_id|card_id|Secret clue/.test(JSON.stringify(shown.j)));
  const shownNo = await C(daily, req(d.url + `/daily?no=${AHEAD_NO}`, { who: "owner", preview: AHEAD }));
  const shownDate = await C(daily, req(d.url + `/daily?date=${AHEAD}`, { who: "owner", preview: AHEAD }));
  t("  and by its number and its date too", shownNo.status === 200 && shownNo.j.day === AHEAD && shownDate.status === 200 && shownDate.j.day === AHEAD);
  const ownArch = await C(archive, req(d.url + "/archive", { who: "owner", preview: AHEAD }));
  t("  and the preview's archive reads as that day", ownArch.status === 200 && ownArch.j.today === AHEAD && ownArch.j.lastDay === AHEAD);

  const refused = await C(play, req(d.url + "/play", { who: "player", preview: AHEAD, method: "POST", body: { date: AHEAD, slot: 1 } }));
  const refused2 = await C(play, req(d.url + "/play", { who: "owner", method: "POST", body: { date: AHEAD, slot: 1 } }));
  t("a player cannot open a round on that day, nor the owner without a preview",
    refused.status === 400 && !(refused.j && refused.j.playId) && refused2.status === 400 && !(refused2.j && refused2.j.playId));

  /* EVERY DOOR of the day, each its own round: Friends plays all five. */
  let allPv = true, allRight = true, firstClue = null, fin = null;
  const tries = d.game === "whoami_fr" ? d.doors : 1;
  for (let slot = 1; slot <= tries; slot++) {
    const round = await C(play, req(d.url + "/play", { who: "owner", preview: AHEAD, method: "POST", body: { date: AHEAD, slot } }));
    if (!(round.status === 200 && P.isPreviewId(round.j.playId) && round.j.day === AHEAD)) { allPv = false; continue; }
    const id = round.j.playId;
    const c2 = await C(clue, req(d.url + "/clue", { who: "owner", preview: AHEAD, method: "POST", body: { playId: id, stage: 2 } }));
    if (slot === 1) firstClue = c2;
    const wrong = await C(guess, req(d.url + "/guess", { who: "owner", preview: AHEAD, method: "POST", body: { playId: id, guess: "Nobody At All" } }));
    const right = await C(guess, req(d.url + "/guess", { who: "owner", preview: AHEAD, method: "POST", body: { playId: id, guess: d.secret(slot) } }));
    if (!(wrong.status === 200 && wrong.j.verdict === "wrong" && !leaks(wrong.j) &&
          right.status === 200 && right.j.solved === true && right.j.verdict === "right")) allRight = false;
    if (slot === 1) fin = await C(finish, req(d.url + "/finish", { who: "owner", preview: AHEAD, method: "POST", body: { playId: id } }));
  }
  t(`the owner's preview opens a scratch round on ${tries === 1 ? "a door" : "every card of the day"}, its id marked for deletion`, allPv);
  t("  a clue is bought by the real ladder", firstClue && firstClue.status === 200 && firstClue.j.stage === 2,
    firstClue && JSON.stringify(firstClue.j).slice(0, 80));
  t("  and the guesses are judged by the same code a player's are: wrong, then right", allRight);
  t("  and finishing it names the answer, as a player's does", fin && fin.status === 200 && fin.j.solved === true && fin.j.answer === d.secret(1),
    fin && JSON.stringify(fin.j).slice(0, 80));
  const change = moved(snap, counts());
  t("  and nothing outside the scratch tables was written", change.length === 0, change.join(", ") || "every other table unchanged");
  const tbl = d.game === "whoami" ? "wa_round" : "fr_wa_round";
  const real = db.prepare(`SELECT COUNT(*) AS n FROM ${tbl} WHERE play_id NOT LIKE 'pv-%'`).get().n;
  t("  and no round under a player's kind of id", real === 0, `${real}`);
}

/* =========================================================================
   LIGHTNING ROUND XI: FRIENDS — every day's run is dealt from its date
   ========================================================================= */
console.log("\n=== Lightning Round XI: Friends: a run five days ahead ===");
{
  /* A synthetic pool, the shape friends/lightning/round_test.mjs builds. */
  const add = (diff, n) => {
    for (let i = 0; i < n; i++) {
      const id = diff[0] + "PV" + String(i).padStart(4, "0");
      db.prepare("INSERT INTO fr_lr_question (id, diff, clue, answer, option_1, option_2, option_3, option_4, pgk) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(id, diff, `Question ${id}?`, "Right " + id, "Right " + id, "Wrong A", "Wrong B", "Wrong C", "Subject " + (i % 25));
      db.prepare("INSERT INTO fr_lr_source (id, name, url, text) VALUES (?, ?, ?, ?)").run(id, "Source " + id, "https://example.org/" + id, "The line.");
    }
  };
  add("Easy", 60); add("Medium", 300); add("Hard", 160);
  /* A player's seen list exists, so practice reads one -- and must not add to it. */
  db.prepare("INSERT INTO fr_lr_seen (user_id, question_id, seen_ms) VALUES ('owner', 'EPV0000', ?)").run(NOW);

  const snap = counts();
  const daily = (await imp("functions/api/lightning_fr/daily.js")).onRequestGet;
  const start = (await imp("functions/api/lightning_fr/start.js")).onRequestPost;
  const answer = (await imp("functions/api/lightning_fr/answer.js")).onRequestPost;
  const finish = (await imp("functions/api/lightning_fr/finish.js")).onRequestPost;
  const source = (await imp("functions/api/lightning_fr/source.js")).onRequestPost;

  const today = await call(daily, req("/api/lightning_fr/daily", { who: "player", preview: AHEAD }));
  const byNo = await call(daily, req(`/api/lightning_fr/daily?no=${AHEAD_NO}`, { who: "player", preview: AHEAD }));
  const ownerNo = await call(daily, req(`/api/lightning_fr/daily?no=${AHEAD_NO}`, { who: "owner" }));
  t("a player, header or none, is told today's board; the day ahead is no board, to them or to the owner without a preview",
    today.status === 200 && today.j.day === TODAY && byNo.status === 404 && ownerNo.status === 404,
    `${today.j && today.j.day} ${byNo.status} ${ownerNo.status}`);
  t("  and the family's probe, called bare, is still answered at once", (() => {
    const r = daily(); return r instanceof Response;
  })());
  const refused = await call(start, req("/api/lightning_fr/start", { who: "player", preview: AHEAD, method: "POST", body: { mode: "daily", no: AHEAD_NO } }));
  const refused2 = await call(start, req("/api/lightning_fr/start", { who: "owner", method: "POST", body: { mode: "daily", no: AHEAD_NO } }));
  t("a player cannot start that day's run, nor the owner without a preview",
    refused.status === 404 && !(refused.j && refused.j.runId) && refused2.status === 404 && !(refused2.j && refused2.j.runId));

  const shown = await call(daily, req("/api/lightning_fr/daily", { who: "owner", preview: AHEAD }));
  t("the owner's preview is told that day's board, as today's",
    shown.status === 200 && shown.j.day === AHEAD && shown.j.no === AHEAD_NO && shown.j.isToday === true,
    `${shown.status} ${shown.j && shown.j.day}`);

  const run = await call(start, req("/api/lightning_fr/start", { who: "owner", preview: AHEAD, method: "POST", body: { mode: "daily", no: AHEAD_NO } }));
  const pool = db.prepare("SELECT id, diff, pgk FROM fr_lr_question").all();
  const expect = deal(pool, [], "daily:" + AHEAD);
  const stored = db.prepare("SELECT seq FROM fr_lr_run WHERE run_id = ?").get(run.j && run.j.runId || "");
  t("the owner's preview starts a scratch run on that day, its id marked for deletion",
    run.status === 200 && P.isPreviewId(run.j.runId) && run.j.day === AHEAD && run.j.isToday === true && run.j.msLeft === RUN_MS,
    run.j && `${run.j.runId} ${run.j.day}`);
  t("  dealt exactly the run a player will be dealt that day", !!stored && stored.seq === JSON.stringify(expect));
  t("  and the question comes without its answer, as a player's does",
    run.j.question && !SECRET_FIELDS.some((f) => f in run.j.question) && !JSON.stringify(run.j.question).includes('"answer"'));
  const q1 = run.j.question;
  const right1 = "Right " + expect[0];
  const a1 = await call(answer, req("/api/lightning_fr/answer", { who: "owner", preview: AHEAD, method: "POST", body: { runId: run.j.runId, idx: 1, pick: right1 } }));
  t("  an answer is marked by the real code, on the run's own clock",
    a1.status === 200 && a1.j.correct === true && a1.j.answer === right1 && a1.j.msLeft > 0 && a1.j.msLeft <= RUN_MS && !!a1.j.next,
    a1.j && `${a1.j.correct} msLeft ${a1.j.msLeft}`);
  const a2 = await call(answer, req("/api/lightning_fr/answer", { who: "owner", preview: AHEAD, method: "POST", body: { runId: run.j.runId, idx: 2, pick: "Wrong A" } }));
  t("  and a wrong one too", a2.status === 200 && a2.j.correct === false && a2.j.answer === "Right " + expect[1]);
  const early = await call(finish, req("/api/lightning_fr/finish", { who: "owner", preview: AHEAD, method: "POST", body: { runId: run.j.runId } }));
  t("  the whistle is refused while that clock has time on it, and says how much",
    early.status === 409 && early.j.msLeft > 0 && early.j.msLeft <= RUN_MS, early.j && `msLeft ${early.j.msLeft}`);
  const resumed = await call(start, req("/api/lightning_fr/start", { who: "owner", preview: AHEAD, method: "POST", body: { runId: run.j.runId } }));
  t("  a reload finds the run where it was, still that day's", resumed.status === 200 && resumed.j.isToday === true &&
    resumed.j.msLeft > 0 && resumed.j.msLeft <= RUN_MS, resumed.j && `isToday ${resumed.j.isToday} msLeft ${resumed.j.msLeft}`);
  const src = await call(source, req("/api/lightning_fr/source", { who: "owner", preview: AHEAD, method: "POST", body: { runId: run.j.runId, idx: 1 } }));
  t("  an answered question's source opens, and spends no press", src.status === 200 && src.j.source && src.j.source.name === "Source " + expect[0],
    JSON.stringify(src.j).slice(0, 80));
  const practice = await call(start, req("/api/lightning_fr/start", { who: "owner", preview: AHEAD, method: "POST", body: { mode: "practice", recent: [] } }));
  t("  and practice in a preview is a scratch run too", practice.status === 200 && P.isPreviewId(practice.j.runId) && practice.j.day === AHEAD);
  const p1 = practice.j.question;
  const pSeq = JSON.parse(db.prepare("SELECT seq FROM fr_lr_run WHERE run_id = ?").get(practice.j.runId).seq);
  const pa = await call(answer, req("/api/lightning_fr/answer", { who: "owner", preview: AHEAD, method: "POST", body: { runId: practice.j.runId, idx: 1, pick: "Right " + pSeq[0] } }));
  t("  marked by the same code", pa.status === 200 && pa.j.correct === true && !!p1);

  const deals = db.prepare("SELECT COUNT(*) AS n FROM fr_lr_daily WHERE play_date = ?").get(AHEAD).n;
  t("no deal was stored for that day: the day is not frozen to this week's pool", deals === 0, `${deals} rows`);
  const change = moved(snap, counts());
  t("and nothing outside the scratch tables was written", change.length === 0, change.join(", ") || "every other table unchanged");

  /* THE CONTROL: the same flow, today and as a player, DOES write -- so the
     preview's silence is the guard's, not a flow that never reached a write. */
  db.prepare("DELETE FROM fr_lr_daily").run();
  const before = counts();
  const prun = await call(start, req("/api/lightning_fr/start", { who: "player", method: "POST", body: { mode: "daily" } }));
  const pseq = JSON.parse(db.prepare("SELECT seq FROM fr_lr_run WHERE run_id = ?").get(prun.j.runId).seq);
  await call(answer, req("/api/lightning_fr/answer", { who: "player", method: "POST", body: { runId: prun.j.runId, idx: 1, pick: "Right " + pseq[0] } }));
  await call(source, req("/api/lightning_fr/source", { who: "player", method: "POST", body: { runId: prun.j.runId, idx: 1 } }));
  const wrote = moved(before, counts());
  t("control: a player's run today stores the deal, marks questions seen and spends a press",
    prun.status === 200 && !P.isPreviewId(prun.j.runId) && ["fr_lr_daily", "fr_lr_seen", "source_press"].every((n) => wrote.some((w) => w.startsWith(n + " "))),
    wrote.join(", "));
}

/* ---- the purge reaches every scratch row this suite made ------------------- */
const pvLeft = () => P.PREVIEW_ROUND_TABLES.reduce((a, [n, c]) => a + db.prepare(`SELECT COUNT(*) AS n FROM ${n} WHERE ${c} LIKE 'pv-%'`).get().n, 0);
const had = pvLeft();
await P.purgePreviewRounds(env);
t("\nopening /admin/ deletes every scratch round and guess these previews made", had > 0 && pvLeft() === 0, `${had} scratch rows`);

done();
