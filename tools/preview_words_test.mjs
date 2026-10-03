/* tools/preview_words_test.mjs — the owner's preview, for the word games.
 *
 *   node tools/preview_words_test.mjs      (from the repo root)
 *
 * The owner, 3 Oct 2026: play the next days of any game "in its proper form"
 * from /admin/<theme>/<game>/<day>, recording nothing. tools/preview_test.mjs
 * proves the shared layer and QuickFire; this suite wires the rest of the
 * family's word games onto it and proves each one the same way:
 *
 *   Crossword XI, Crossword XI: Friends   (functions/_lib/cw-daily.js and the
 *     check-answer / reveal / verify / finish / source handlers)
 *   Scrambled XI, Vowels XI, and both Friends sets   (functions/api/scrambled/*,
 *     scrambled_fr/*, functions/_lib/sc-board.js, sc-round.js)
 *
 * For each: a board five days ahead is NOT served to a player (with or without
 * the preview header) or to the owner without one, and cannot be played; the
 * owner's preview IS served it as today's, without its answers; a round on it
 * is judged by the real code; and no table outside the scratch list changes --
 * not its row count and not its contents, because an UPDATE onto a real play
 * row moves no count.
 *
 * Executed, not read: the real handlers over SQLite built from every migration.
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
const { utcDay, dailyNumber } = await imp("functions/_lib/daily.js");
const DAY = 86400000;
/* ONE READING of the clock, handed to everything that needs a day. */
const NOW = Date.now();
const TODAY = utcDay(NOW);
const AHEAD = utcDay(NOW + 5 * DAY);
const TODAY_NO = dailyNumber(NOW);
const AHEAD_NO = dailyNumber(NOW + 5 * DAY);
const PAST_NO = TODAY_NO - 1;

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
const call = async (fn, r, extra) => {
  const res = await fn(ctx(r, extra));
  let j = null; try { j = await res.json(); } catch (e) {}
  return { status: res.status, j };
};
const post = (who, preview, body) => req("/api/x", { who, preview, method: "POST", body });

/* NOTHING BUT SCRATCH, counted AND read. counts() is preview_test's check;
   contents() is the stronger one this suite needs, because the crossword's
   help and finish UPDATE a real plays row, and an UPDATE moves no count.
   rate_limits is a counter of requests, not of play, and is excused. */
const scratch = new Set([...P.PREVIEW_ROUND_TABLES.map(([n]) => n), "rate_limits"]);
const tableNames = () => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
  .map((r) => r.name).filter((n) => !scratch.has(n));
function counts() {
  const out = {};
  for (const name of tableNames()) out[name] = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
  return out;
}
function contents() {
  const out = {};
  for (const name of tableNames()) {
    out[name] = JSON.stringify(db.prepare(`SELECT * FROM ${name}`).all().map((r) => JSON.stringify(r)).sort());
  }
  return out;
}
const moved = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]).map((k) =>
  typeof a[k] === "number" ? `${k} ${a[k]}->${b[k]}` : k);

console.log(`today #${TODAY_NO} (${TODAY}); previewing #${AHEAD_NO} (${AHEAD})`);

/* ======================================================================== */
/* CROSSWORDS                                                                */
/* ======================================================================== */
/* The board comes from the producer's own sample (tools/build_puzzles.js
   output, as the no-database fallback serves it), not a hand-built shape. */
const { SAMPLE_PUZZLES } = await imp("functions/_lib/sample-puzzles.js");
const { storedNo } = await imp("functions/_lib/fr-board.js");
const { normalise } = await imp("functions/_lib/puzzle.js");
const fixture = (i) => {
  const p = JSON.parse(JSON.stringify(SAMPLE_PUZZLES.daily[i % SAMPLE_PUZZLES.daily.length]));
  /* A citation a player may be shown, so /api/source has something to hand
     over: the row's own fields, with an allowlisted host. */
  p.puzzle.entries[0].row.source = "https://en.wikipedia.org/wiki/Preview_test";
  p.puzzle.entries[0].row.sourceName = "Wikipedia";
  return p;
};
const cwDaily = (await imp("functions/_lib/cw-daily.js")).dailyHandler;
const { checkAnswerHandler } = await imp("functions/api/check-answer.js");
const { revealHandler } = await imp("functions/api/reveal.js");
const { verifyHandler } = await imp("functions/api/verify.js");
const { finishHandler } = await imp("functions/api/finish.js");
const source = (await imp("functions/api/source.js")).onRequestPost;
const legacyFr = (await imp("functions/api/crossword_fr/daily.js")).onRequestGet;

const crosswords = [
  { name: "Crossword XI", game: "crossword", seed: (no, payload) =>
      db.prepare("INSERT INTO puzzles (mode, daily_no, payload) VALUES ('daily', ?, ?)").run(no, JSON.stringify(payload)) },
  { name: "Crossword XI: Friends", game: "crossword_fr", seed: (no, payload) =>
      db.prepare("INSERT INTO fr_puzzles (mode, daily_no, payload) VALUES ('daily', ?, ?)").run(storedNo(no), JSON.stringify(payload)) },
];

for (const cw of crosswords) {
  console.log(`\n=== ${cw.name}: board #${AHEAD_NO}, five days ahead ===`);
  const ahead = fixture(0), past = fixture(1);
  cw.seed(AHEAD_NO, ahead);
  cw.seed(PAST_NO, past);
  const G = cw.game;
  const daily = (r) => call((c) => cwDaily(c, G), r);
  const grids = ahead.puzzle.entries.map((e) => normalise(e.row.grid));
  const token = `daily:${AHEAD_NO}`;
  /* A real attempt on the previewed board, as if a player had one: the
     preview must not charge, score or touch it. */
  const realId = `real-${G}-ahead`;
  db.prepare("INSERT INTO plays (id, play_id, mode, daily_no, game, board_key) VALUES (?, ?, 'daily', ?, ?, ?)")
    .run(realId, realId, AHEAD_NO, G, `daily:${AHEAD_NO}`);

  const leaks = (j) => { const s = JSON.stringify(j || {}); return /"ch"/.test(s) || grids.some((g) => s.includes(g)); };
  const notAhead = (r) => !(r.status === 200 && (r.j.dailyNo === AHEAD_NO)) && !leaks(r.j);

  const p1 = await daily(req(`/api/daily?no=${AHEAD_NO}`, { who: "player", preview: AHEAD }));
  const p2 = await daily(req(`/api/daily?no=${AHEAD_NO}`, { who: "player" }));
  const p3 = await daily(req(`/api/daily?no=${AHEAD_NO}`));
  const o1 = await daily(req(`/api/daily?no=${AHEAD_NO}`, { who: "owner" }));
  t("a player asking for it, with or without the header, is answered with today (and today has no board)",
    notAhead(p1) && notAhead(p2) && notAhead(p3) && p1.status === 404 && p2.status === 404, `${p1.status} ${p2.status} ${p3.status}`);
  t("so is the owner without a preview", notAhead(o1) && o1.status === 404, String(o1.status));
  const pastOk = await daily(req(`/api/daily?no=${PAST_NO}`, { who: "player", preview: AHEAD }));
  t("  and a past board is still served to that player as before", pastOk.status === 200 && pastOk.j.dailyNo === PAST_NO);

  const shown = await daily(req(`/api/daily?no=${AHEAD_NO}`, { who: "owner", preview: AHEAD }));
  const bare = await daily(req(`/api/daily`, { who: "owner", preview: AHEAD }));
  t("the owner's preview is served that day's board, as today's",
    shown.status === 200 && shown.j.dailyNo === AHEAD_NO && shown.j.token === token && shown.j.day === AHEAD &&
    bare.status === 200 && bare.j.dailyNo === AHEAD_NO,
    `${shown.status} #${shown.j && shown.j.dailyNo}, unasked #${bare.j && bare.j.dailyNo}`);
  t("  without its answers, exactly as a player's would be",
    shown.j && shown.j.puzzle && shown.j.puzzle.entries.length === grids.length && !leaks(shown.j) &&
    leaks(ahead) /* and the scan does see answers where they are */);
  if (G === "crossword_fr") {
    const lp = await call(legacyFr, req(`/api/crossword_fr/daily?no=${AHEAD_NO}`, { who: "player", preview: AHEAD }));
    const lo = await call(legacyFr, req(`/api/crossword_fr/daily?no=${AHEAD_NO}`, { who: "owner", preview: AHEAD }));
    t("  the older /api/crossword_fr/daily keeps the future shut, and opens it for the preview alone",
      lp.status === 403 && lo.status === 200 && lo.j.no === AHEAD_NO && lo.j.today === AHEAD_NO && lo.j.board && !leaks(lo.j),
      `${lp.status} / ${lo.status}`);
  }

  /* Playing it. The crossword's judges refuse a token past today for a
     player; the owner's older ?n= preview (/api/admin/daily) keeps its own
     admin bypass there, so "the owner without a header" is not refused at
     these doors and is not asserted. */
  const refusedReveal = await call((c) => revealHandler(c, G), post("player", AHEAD, { token, entry: 0, playId: realId }));
  const refusedCheck = await call((c) => checkAnswerHandler(c, G), post("player", null, { token, entry: 0, guess: grids[0], playId: realId }));
  const refusedFinish = await call((c) => finishHandler(c, G), post(null, AHEAD, { token, playId: realId, letters: {} }));
  t("a player cannot check, reveal or finish on that board, header or not",
    refusedReveal.status === 403 && refusedCheck.status === 403 && refusedFinish.status === 403,
    `${refusedReveal.status} ${refusedCheck.status} ${refusedFinish.status}`);

  const snapN = counts(), snapC = contents();
  /* The page's own id in a preview: XIPlays hands out pv- ids, and the
     crossword's own newPlayId() a UUID that no plays row carries. Both. */
  for (const [label, pid] of [["a scratch id", P.previewId()], ["the page's own id, which no play row has", "3f1c2a9e-0000-4000-8000-00000000abcd"]]) {
    const rv = await call((c) => revealHandler(c, G), post("owner", AHEAD, { token, entry: 1, playId: pid }));
    const rl = await call((c) => revealHandler(c, G), post("owner", AHEAD, { token, entry: 2, index: 0, playId: pid }));
    const press = await call((c) => checkAnswerHandler(c, G), post("owner", AHEAD,
      { token, playId: pid, guesses: grids.map((g, i) => (i === 3 ? "X".repeat(g.length) : g)) }));
    t(`the owner's preview is helped with ${label}, and nothing is charged`,
      rv.status === 200 && rv.j.answer === grids[1] && rl.status === 200 && rl.j.letter === grids[2][0] &&
      press.status === 200 && press.j.results[0].correct === true && press.j.results[3].correct === false,
      `${rv.status} ${rl.status} ${press.status}`);
  }
  const one = await call((c) => checkAnswerHandler(c, G), post("owner", AHEAD, { token, entry: 0, guess: grids[0], playId: realId }));
  const wrong = await call((c) => checkAnswerHandler(c, G), post("owner", AHEAD, { token, entry: 0, guess: "Q".repeat(grids[0].length), playId: realId, detail: 1 }));
  const fullGrid = await call((c) => checkAnswerHandler(c, G), post("owner", AHEAD, { token, grid: "A", playId: realId }));
  const ver = await call((c) => verifyHandler(c, G), post("owner", AHEAD, { token, entry: 4, guess: grids[4] }));
  const helpOnReal = await call((c) => revealHandler(c, G), post("owner", AHEAD, { token, entry: 5, playId: realId }));
  t("  and judged by the same code a player's is: right is right, wrong is wrong",
    one.status === 200 && one.j.correct === true && wrong.j.correct === false && Array.isArray(wrong.j.wrong) &&
    fullGrid.status === 200 && fullGrid.j.correct === false && ver.j.correct === true && helpOnReal.j.answer === grids[5]);
  /* The full grid, typed: finish marks it complete and writes nothing. */
  const letters = {};
  for (const [k, cell] of Object.entries(ahead.puzzle.cells)) if (cell && cell.ch) letters[k] = cell.ch;
  const fin = await call((c) => finishHandler(c, G), post("owner", AHEAD, { token, playId: realId, letters }));
  const half = await call((c) => finishHandler(c, G), post("owner", AHEAD, { token, playId: realId, letters: {} }));
  t("a finished preview is marked complete and not scored onto any play",
    fin.status === 200 && fin.j.complete === true && fin.j.verified === false && fin.j.preview === true && half.j.complete === false,
    JSON.stringify(fin.j));
  if (G === "crossword") {
    const src = await call(source, post("owner", AHEAD, { token, entry: 0, guess: grids[0] }));
    t("a source opened in the preview is shown and spends no press",
      src.status === 200 && src.j.source && /wikipedia/.test(src.j.source.url) && src.j.preview === true, JSON.stringify(src.j));
  }
  const changeN = moved(snapN, counts()), changeC = moved(snapC, contents());
  t("  and nothing outside the scratch tables was written: no row added, none changed",
    changeN.length === 0 && changeC.length === 0, [...changeN, ...changeC].join(", ") || "every other table unchanged");

  /* THE GUARD IS THE PREVIEW, NOT THE OWNER: the same help, asked by a
     player on a board that is out, is charged exactly as it always was. */
  const pastId = `real-${G}-past`;
  db.prepare("INSERT INTO plays (id, play_id, mode, daily_no, game, board_key) VALUES (?, ?, 'daily', ?, ?, ?)")
    .run(pastId, pastId, PAST_NO, G, `daily:${PAST_NO}`);
  const pr = await call((c) => revealHandler(c, G), post("player", AHEAD, { token: `daily:${PAST_NO}`, entry: 0, playId: pastId }));
  const noRow = await call((c) => revealHandler(c, G), post("player", AHEAD, { token: `daily:${PAST_NO}`, entry: 0, playId: "3f1c2a9e-0000-4000-8000-00000000ffff" }));
  const charged = db.prepare("SELECT srv_reveal_answers AS n FROM plays WHERE play_id = ?").get(pastId).n;
  t("a player's help on a board that is out is still charged, header or not -- and refused when it cannot be",
    pr.status === 200 && charged === 1 && noRow.status === 409, `${pr.status}, charged ${charged}, unchargeable ${noRow.status}`);
}

/* ======================================================================== */
/* SCRAMBLED XI, VOWELS XI, AND BOTH FRIENDS SETS                            */
/* ======================================================================== */
const SB = await imp("functions/_lib/sc-board.js");
const { SC_BOARDS } = await imp("functions/_lib/sc-boards.js");
const { FR_SC_BOARDS } = await imp("functions/_lib/fr-sc-boards.js");
const scDaily = (await imp("functions/api/scrambled/daily.js")).onRequestGet;
const frDaily = (await imp("functions/api/scrambled_fr/daily.js")).onRequestGet;
const scRound = (await imp("functions/api/scrambled/round.js")).onRequestPost;
const scGuess = (await imp("functions/api/scrambled/guess.js")).onRequestPost;
const scReveal = (await imp("functions/api/scrambled/reveal.js")).onRequestPost;
const scFinish = (await imp("functions/api/scrambled/finish.js")).onRequestPost;

const words = [
  { name: "Scrambled XI", daily: scDaily, path: "/api/scrambled/daily", set: "sc", cy: false, bank: SC_BOARDS, game: "scrambled" },
  { name: "Vowels XI", daily: scDaily, path: "/api/scrambled/daily", set: "sc", cy: true, bank: SC_BOARDS, game: "vowels" },
  { name: "Scrambled XI: Friends", daily: frDaily, path: "/api/scrambled_fr/daily", set: "frsc", cy: false, bank: FR_SC_BOARDS, game: "scrambled_fr" },
  { name: "Vowels XI: Friends", daily: frDaily, path: "/api/scrambled_fr/daily", set: "frsc", cy: true, bank: FR_SC_BOARDS, game: "vowels_fr" },
];
const scratchRows = (id) => db.prepare("SELECT COUNT(*) AS n FROM sc_round WHERE play_id = ?").get(id).n +
  db.prepare("SELECT COUNT(*) AS n FROM sc_solve WHERE play_id = ?").get(id).n;

for (const w of words) {
  console.log(`\n=== ${w.name}: board #${AHEAD_NO}, five days ahead ===`);
  const mode = w.cy ? "consonants" : null;
  const q = (s) => w.path + s + (w.cy ? (s ? "&" : "?") + "cy=1" : "");
  /* A ring game: every day has a board, so "seeding" it is the ring itself.
     The board the ring holds for that day, read from the same bank the
     handlers fall back to with no rows in the table. */
  const board = SB.boardForNumber(AHEAD_NO, w.bank, mode, w.set);
  const token = SB.scKey(AHEAD_NO, mode, w.set);
  const hidden = (board.slots || []).filter((s) => !(w.cy && s.presolved));
  const names = hidden.map((s) => SB.revealName(s)).filter((n) => n.length >= 4);
  /* A presolved consonant tile carries its name on purpose (publicBoard says
     so out loud); every other slot must carry no name, alias or hint value. */
  const leaks = (j) => {
    const o = JSON.parse(JSON.stringify(j || {}));
    if (Array.isArray(o.slots)) o.slots = o.slots.filter((s) => !s.presolved);
    const s = JSON.stringify(o);
    return names.some((n) => s.includes(n)) || /"(?:aliases|clubs|club|nationality|name|display)":/.test(s);
  };

  const p1 = await call(w.daily, req(q(`?no=${AHEAD_NO}`), { who: "player", preview: AHEAD }));
  const p2 = await call(w.daily, req(q(`?no=${AHEAD_NO}`), { who: "player" }));
  const o1 = await call(w.daily, req(q(`?no=${AHEAD_NO}`), { who: "owner" }));
  const today = await call(w.daily, req(q(""), { who: "player", preview: AHEAD }));
  t("a player asking for it, with or without the header, is refused, and the owner without a preview too",
    p1.status === 403 && p2.status === 403 && o1.status === 403 && !leaks(p1.j), `${p1.status} ${p2.status} ${o1.status}`);
  t("  and a player's unasked board is today's", today.status === 200 && today.j.no === TODAY_NO && today.j.today === TODAY_NO,
    `#${today.j && today.j.no}`);

  const shown = await call(w.daily, req(q(""), { who: "owner", preview: AHEAD }));
  const asked = await call(w.daily, req(q(`?no=${AHEAD_NO}`), { who: "owner", preview: AHEAD }));
  t("the owner's preview is served that day's board, as today's",
    shown.status === 200 && shown.j.no === AHEAD_NO && shown.j.today === AHEAD_NO && shown.j.day === AHEAD &&
    shown.j.token === token && shown.j.title === board.title && asked.status === 200 && asked.j.no === AHEAD_NO,
    `${shown.status} #${shown.j && shown.j.no} ${shown.j && shown.j.token}`);
  t("  without its answers, exactly as a player's would be",
    shown.status === 200 && Array.isArray(shown.j.slots) && today.status === 200 &&
    !leaks(shown.j) && shown.j.slots.length === board.slots.length && names.length >= 3 &&
    leaks(board) /* and the scan does see names where they are */ &&
    JSON.stringify(Object.keys(shown.j).sort()) === JSON.stringify(Object.keys(today.j).sort()));

  const refused = await call(scGuess, post("player", AHEAD, { token, guess: SB.revealName(hidden[0]), playId: P.previewId() }));
  const refused2 = await call(scGuess, post("owner", null, { token, guess: SB.revealName(hidden[0]) }));
  const refused3 = await call(scReveal, post("player", null, { token, slotId: hidden[0].id, kind: "letter", known: 0 }));
  t("a player cannot play it, header or not, and nor can the owner without a preview",
    refused.status === 403 && refused2.status === 403 && refused3.status === 403 && !(refused.j && refused.j.name),
    `${refused.status} ${refused2.status} ${refused3.status}`);

  const snapN = counts(), snapC = contents();
  const pid = P.previewId();
  const kick = await call(scRound, post("owner", AHEAD, { playId: pid, token }));
  const rowStarted = db.prepare("SELECT play_id FROM sc_round WHERE play_id = ?").get(pid);
  t("the owner's preview opens a scratch round, its id marked for deletion",
    kick.status === 200 && kick.j.verified === true && rowStarted && P.isPreviewId(rowStarted.play_id), pid);
  const wrong = await call(scGuess, post("owner", AHEAD, { token, guess: "Nobody At All", playId: pid }));
  const letter = await call(scReveal, post("owner", AHEAD, { token, slotId: hidden[0].id, kind: w.cy ? "vowel" : "letter", known: 0, playId: pid }));
  const solved = [];
  for (const s of hidden) {
    const g = await call(scGuess, post("owner", AHEAD, { token, guess: s.name, playId: pid, solved }));
    if (g.status === 200 && String(g.j.solvedId) === String(s.id)) solved.push(String(s.id));
  }
  t("  and it is judged by the same code a player's is",
    wrong.status === 200 && wrong.j.solvedId === null && letter.status === 200 && solved.length === hidden.length,
    `${solved.length}/${hidden.length} named, reveal ${letter.status} ${JSON.stringify(letter.j).slice(0, 60)}`);
  const fin = await call(scFinish, post("owner", AHEAD, { playId: pid }));
  t("  and full time is scored from the scratch round, and recorded nowhere",
    fin.status === 200 && fin.j.verified === true && fin.j.preview === true && typeof fin.j.score === "number" &&
    fin.j.solved === hidden.length, JSON.stringify(fin.j));

  /* An id without the mark, sent in a preview, writes nothing at all. */
  const plain = "plainid-" + w.game;
  const k2 = await call(scRound, post("owner", AHEAD, { playId: plain, token }));
  const g2 = await call(scGuess, post("owner", AHEAD, { token, guess: hidden[0].name, playId: plain }));
  const r2 = await call(scReveal, post("owner", AHEAD, { token, slotId: hidden[1].id, kind: "name", playId: plain }));
  const f2 = await call(scFinish, post("owner", AHEAD, { playId: plain }));
  t("an unmarked id in a preview opens no round and writes no solve, though the board is still judged",
    k2.j.verified === false && g2.status === 200 && g2.j.solvedId !== null && r2.status === 200 && f2.j.verified === false &&
    scratchRows(plain) === 0, `${scratchRows(plain)} rows`);

  const changeN = moved(snapN, counts()), changeC = moved(snapC, contents());
  t("  and nothing outside the scratch tables was written: no row added, none changed",
    changeN.length === 0 && changeC.length === 0, [...changeN, ...changeC].join(", ") || "every other table unchanged");

  /* And a player's own round, today, is untouched by any of this. */
  const real = "realround-" + w.game;
  const todayToken = SB.scKey(TODAY_NO, mode, w.set);
  const pk = await call(scRound, post("player", AHEAD, { playId: real, token: todayToken }));
  t("a player's round on today's board still opens under its own id, header or not",
    pk.j.verified === true && scratchRows(real) === 1);
}
const scratchBefore = db.prepare("SELECT COUNT(*) AS n FROM sc_round WHERE play_id LIKE 'pv-%'").get().n;
await P.purgePreviewRounds(env);
const scratchAfter = db.prepare("SELECT COUNT(*) AS n FROM sc_round WHERE play_id LIKE 'pv-%'").get().n +
  db.prepare("SELECT COUNT(*) AS n FROM sc_solve WHERE play_id LIKE 'pv-%'").get().n;
const realKept = db.prepare("SELECT COUNT(*) AS n FROM sc_round WHERE play_id LIKE 'realround-%'").get().n;
t("\nopening /admin/ deletes every scratch round and keeps the players'",
  scratchBefore === words.length && scratchAfter === 0 && realKept === words.length,
  `${scratchBefore} scratch rounds, ${scratchAfter} left, ${realKept} real kept`);

/* ======================================================================== */
/* THE PAGES                                                                 */
/* ======================================================================== */
console.log("\n=== The admin pages for these games ===");
const admin = await imp("functions/admin/[[path]].js");
const page = async (who, parts) => {
  const r = await admin.onRequestGet(ctx(req("/admin/" + parts.join("/"), { who }), { params: { path: parts } }));
  return { status: r.status, html: await r.text() };
};
for (const [theme, dir, game] of [["football", "crossword", "crossword"], ["friends", "crossword", "crossword_fr"],
  ["football", "scrambled", "scrambled"], ["football", "vowels", "vowels"], ["friends", "scrambled", "scrambled_fr"], ["friends", "vowels", "vowels_fr"]]) {
  const mine = await page("owner", [theme, dir, AHEAD]);
  const theirs = await page("player", [theme, dir, AHEAD]);
  t(`/admin/${theme}/${dir}/<day>: the game's own page for the owner, the ordinary 404 for anyone else`,
    admin.gameAt(theme, dir) === game && mine.status === 200 && mine.html.includes(`<base href="/${theme}/${dir}/">`) &&
    mine.html.includes(`"day":"${AHEAD}"`) && mine.html.indexOf("/shared/xi-preview.js") < mine.html.indexOf("js/game.js") &&
    theirs.status === 404, `${mine.status} / ${theirs.status}`);
}

/* THE CROSSWORD'S PAGE COUNTS ITS OWN DAY, from a clock synced to the Date
   header (engine.js setTrustedTime/dailyNumber). Under the preview layer the
   page clock is moved, and the middleware moves the header (preview_test
   proves that half), so the board it asks for is the previewed one. */
if (!JSDOM) { console.log("\njsdom is not installed: the page's day was NOT checked. Not a pass."); fail++; done(); }
console.log("\n=== The crossword page's day ===");
const shim = read("shared/xi-preview.js");
for (const dir of ["football/crossword", "friends/crossword"]) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>",
    { url: `https://www.thexigames.com/admin/${dir}/${AHEAD}`, runScripts: "outside-only" });
  const w = dom.window;
  w.fetch = async () => new Response("{}", { status: 200 });
  w.eval(`window.XI_PREVIEW = ${JSON.stringify({ game: dir.startsWith("friends") ? "crossword_fr" : "crossword", day: AHEAD })};`);
  w.eval(shim);
  w.eval(read(`${dir}/js/engine.js`));
  const header = new Date(NOW + 5 * DAY).toUTCString();      // what the middleware answers a preview with
  const synced = w.eval(`FCW.setTrustedTime(${JSON.stringify(header)})`);
  const no = w.eval("FCW.dailyNumber()");
  t(`${dir}: synced to the preview's Date header, the page asks for #${AHEAD_NO}`, synced === true && no === AHEAD_NO, `#${no}`);
}

done();
