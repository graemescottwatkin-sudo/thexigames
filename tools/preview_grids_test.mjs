/* tools/preview_grids_test.mjs — the owner's preview, for the four board games
 * whose judging happens on the server: Wordsearch XI, Wordsearch XI: Friends,
 * Grid XI and Codeword XI.
 *
 *   node tools/preview_grids_test.mjs      (from the repo root)
 *
 * The owner, 3 Oct 2026: play the next days of any game "in its proper form"
 * from /admin/, recording nothing, with scratch round rows ("Temporary rows,
 * wiped"). tools/preview_test.mjs proves the shared layer and QuickFire; this
 * proves the same four things for each of these games, by executing the real
 * handlers over SQLite built from every migration:
 *
 *   a player, with the preview header or without it, and the owner without
 *   it, are not served a board whose day has not come, and cannot open a
 *   round on it;
 *   the owner's preview IS served it, as today's, with nothing in it a
 *   player's board would not carry;
 *   the preview's round has a scratch id and is judged by the real code;
 *   and no table outside the scratch list moves.
 *
 * THE BOARDS COME FROM THEIR PRODUCERS, not from this file: the word search's
 * from ws-sample.js (the importer's own sample), Grid's from gd-sample.js
 * (written by tools/import_grid.js), Codeword's through tools/import_codeword.js
 * sqlFor(), the SQL production is loaded with.
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
const call = async (fn, r) => {
  const res = await fn(ctx(r));
  let j = null; try { j = await res.json(); } catch (e) {}
  return { status: res.status, j, text: JSON.stringify(j) };
};
/* The owner previewing AHEAD, a player trying the same with and without the
   header, and the owner without it: the four callers every game is asked by. */
const OWNER = { who: "owner", preview: AHEAD };
const STRANGERS = [
  ["a player with the header", { who: "player", preview: AHEAD }],
  ["a player without it", { who: "player" }],
  ["the owner without it", { who: "owner" }],
  ["nobody signed in, with the header", { preview: AHEAD }],
];

/* NOTHING BUT SCRATCH (preview_test's check): every table outside the purge's
   list, so a preview that wrote a play, a result or a schedule row shows up as
   a table whose count moved. rate_limits counts requests, not play. */
const scratch = new Set([...P.PREVIEW_ROUND_TABLES.map(([n]) => n), "rate_limits"]);
function counts() {
  const out = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
    if (!scratch.has(name)) out[name] = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
  }
  return out;
}
const moved = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]).map((k) => `${k} ${a[k]}->${b[k]}`);
/* A plays row for the preview's id would be the play counter leaking; the
   word search's /finish UPDATEs plays by play id, which must touch nothing. */
const playsFor = (id) => db.prepare("SELECT COUNT(*) AS n FROM plays WHERE play_id = ?").get(String(id)).n;

const { SAMPLE_PUZZLES } = await imp("functions/_lib/ws-sample.js");
const dummyPlayer = "0123456789abcdef0123456789abcdef";   // a UUID-shaped id, as XIPlays mints for a player

/* ---- 1. the word search, both sets ---------------------------------------- */
const NEARER = utcDay(NOW + 4 * DAY);
/* A Friends board is football's shape with a clue per answer (migration 048's
   payload comment), and its list is the clues: the names are the secret, so
   `display` must not travel either. */
const friendsOf = (p, id) => ({ ...p, id, answers: p.answers.map((a, i) => ({ ...a, clue: `Clue ${i + 1}` })) });
const wordsearches = [
  { name: "Wordsearch XI", api: "functions/api/wordsearch", pre: "ws_", board: SAMPLE_PUZZLES[0], near: SAMPLE_PUZZLES[2],
    hidden: ["placement", '"GOLDEN"'] },
  { name: "Wordsearch XI: Friends", api: "functions/api/wordsearch_fr", pre: "fr_ws_",
    board: friendsOf(SAMPLE_PUZZLES[1], "FRWS-0001"), near: friendsOf(SAMPLE_PUZZLES[2], "FRWS-0002"),
    hidden: ["placement", '"display"', '"FIFTH"'] },
];
for (const s of wordsearches) {
  console.log(`\n=== ${s.name}: a day ahead ===`);
  const b = s.board;
  db.prepare(`INSERT INTO ${s.pre}puzzles (id, theme, category, status, hash, version, share_key, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(b.id, b.theme, b.category, b.status, b.hash, b.version, b.share_key,
      JSON.stringify({ grid: b.grid, answers: b.answers, bonus: b.bonus }));
  db.prepare(`INSERT INTO ${s.pre}schedule (day, puzzle_id) VALUES (?, ?)`).run(AHEAD, b.id);
  /* AND THE DAY BEFORE IT, so the preview's free play and archive can be told
     apart from a player's: on the preview's day that board has run, and on
     the real day it is still to come. */
  const nb = s.near;
  db.prepare(`INSERT INTO ${s.pre}puzzles (id, theme, category, status, hash, version, share_key, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(nb.id, nb.theme, nb.category, nb.status, nb.hash, nb.version, nb.share_key,
      JSON.stringify({ grid: nb.grid, answers: nb.answers, bonus: nb.bonus }));
  db.prepare(`INSERT INTO ${s.pre}schedule (day, puzzle_id) VALUES (?, ?)`).run(NEARER, nb.id);

  const daily = (await imp(`${s.api}/daily.js`)).onRequestGet;
  const catalog = (await imp(`${s.api}/catalog.js`)).onRequestGet;
  const archive = (await imp(`${s.api}/archive.js`)).onRequestGet;
  const round = (await imp(`${s.api}/round.js`)).onRequestPost;
  const find = (await imp(`${s.api}/find.js`)).onRequestPost;
  const finish = (await imp(`${s.api}/finish.js`)).onRequestPost;
  const puzzle = (await imp(`${s.api}/puzzle.js`)).onRequestGet;
  const snap = counts();

  for (const [who, as] of STRANGERS) {
    const d = await call(daily, req("/api/d", as));
    t(`${who}: today has no daily, and nothing of that day's board is served`,
      d.status === 200 && d.j.day === TODAY && d.j.puzzle === null && !d.text.includes(b.id), `${d.status} ${d.j && d.j.day}`);
  }
  const byId = await call(puzzle, req(`/api/p?id=${b.id}`, { who: "player" }));
  t("a player cannot have it whole from free play either", byId.status === 404 && !byId.text.includes(b.grid[0]));
  const pRound = await call(round, req("/api/r", { who: "player", preview: AHEAD, method: "POST", body: { playId: dummyPlayer } }));
  t("a player cannot open a round on it", pRound.status === 200 && pRound.j.verified === false &&
    db.prepare(`SELECT COUNT(*) AS n FROM ${s.pre}round WHERE play_id = ?`).get(dummyPlayer).n === 0);
  const a0 = b.answers[0].placement;
  const pFind = await call(find, req("/api/f", { who: "player", preview: AHEAD, method: "POST",
    body: { playId: dummyPlayer, from: [a0.start_row, a0.start_col], to: [a0.end_row, a0.end_col] } }));
  t("  nor have a drag judged against it", pFind.status === 404 && !pFind.text.includes(b.answers[0].grid), pFind.text);

  const shown = await call(daily, req("/api/d", OWNER));
  t("the owner's preview is served that day's board, as today's",
    shown.status === 200 && shown.j.day === AHEAD && shown.j.no === AHEAD_NO && shown.j.puzzle && shown.j.puzzle.id === b.id,
    `${shown.status} ${shown.j && shown.j.day}`);
  t("  without what a player's is not given", !!(shown.j && shown.j.puzzle) && s.hidden.every((x) => !shown.text.includes(x)) &&
    shown.j.puzzle.answers.length === b.answers.length, s.hidden.filter((x) => shown.text.includes(x)).join(", ") || "placements and the secret withheld");

  /* The page's id, which in a preview XIPlays hands out as a scratch one. */
  const pid = P.previewId();
  const opened = await call(round, req("/api/r", { ...OWNER, method: "POST", body: { playId: pid } }));
  const row = db.prepare(`SELECT * FROM ${s.pre}round WHERE play_id = ?`).get(pid);
  t("the owner's preview opens a round on it, its id a scratch one",
    opened.j.verified === true && row && row.puzzle_id === b.id && row.day === AHEAD && P.isPreviewId(row.play_id), opened.text);
  const miss = await call(find, req("/api/f", { ...OWNER, method: "POST", body: { playId: pid, from: [0, 0], to: [0, 1] } }));
  const hits = [];
  for (const a of b.answers) {
    const p = a.placement;
    hits.push(await call(find, req("/api/f", { ...OWNER, method: "POST",
      body: { playId: pid, from: [p.start_row, p.start_col], to: [p.end_row, p.end_col] } })));
  }
  t("  and a drag on it is judged by the real code: a miss is a foul, every name is a hit",
    miss.j.foul === true && miss.j.fouls === 1 && hits.every((h, i) => h.j.hit && h.j.hit.grid === b.answers[i].grid),
    `${hits.filter((h) => h.j.hit).length}/${b.answers.length} hits`);
  const whistle = await call(finish, req("/api/x", { ...OWNER, method: "POST", body: { playId: pid } }));
  t("  and scored at the whistle from the rows it wrote", whistle.j.verified === true && whistle.j.found === b.answers.length &&
    whistle.j.fouls === 1, whistle.text.slice(0, 90));
  /* FREE PLAY AND THE ARCHIVE, AS THEY WILL STAND ON THAT DAY. Not judged by
     the server, but the page lists and opens them, and a preview that showed
     today's catalogue beside a future daily would not be the page in its
     proper form. */
  const cP = await call(catalog, req("/api/c", { who: "player", preview: AHEAD }));
  const cO = await call(catalog, req("/api/c", OWNER));
  t("free play: the day before is in the preview's catalogue and not in a player's",
    !cP.j.boards.some((x) => x.id === nb.id) && cO.j.boards.some((x) => x.id === nb.id) &&
    !cO.j.boards.some((x) => x.id === b.id), `${cP.j.boards.length} / ${cO.j.boards.length} boards`);
  const wP = await call(puzzle, req(`/api/p?id=${nb.id}`, { who: "player", preview: AHEAD }));
  const wO = await call(puzzle, req(`/api/p?id=${nb.id}`, OWNER));
  const wT = await call(puzzle, req(`/api/p?id=${b.id}`, OWNER));
  t("  opened whole for the preview, refused to a player, and the preview's own daily refused to both",
    wP.status === 404 && wO.status === 200 && wO.j.puzzle.id === nb.id && wT.status === 404, `${wP.status}/${wO.status}/${wT.status}`);
  const rP = await call(archive, req("/api/a", { who: "player", preview: AHEAD }));
  const rO = await call(archive, req("/api/a", OWNER));
  t("the archive: the preview's lists the day before as gone, a player's does not",
    rP.j.today === TODAY && !rP.j.days.some((d) => d.day === NEARER) &&
    rO.j.today === AHEAD && rO.j.todayNo === AHEAD_NO && rO.j.days.some((d) => d.day === NEARER && d.id === nb.id),
    `${rP.j.today} / ${rO.j.today}`);
  if (s.pre === "fr_ws_") {
    /* THE ONE NEW GUARD IN THIS GAME. Friends judges a round on the board it
       kicked off on when that was an earlier day; a preview round's day is a
       LATER one, and without the preview's clock it must not be judged. */
    const later = await call(find, req("/api/f", { who: "player", method: "POST",
      body: { playId: pid, from: [a0.start_row, a0.start_col], to: [a0.end_row, a0.end_col] } }));
    t("  and that round, asked about without the preview, is void rather than judged",
      later.j && later.j.stale === true && !later.j.hit, later.text);
  }
  const change = moved(snap, counts());
  t("  and nothing outside the scratch tables was written", change.length === 0 && playsFor(pid) === 0,
    change.join(", ") || "every other table unchanged");
}

/* ---- 2. Grid XI ------------------------------------------------------------ */
console.log("\n=== Grid XI: a day ahead ===");
{
  const { GD_SAMPLE_BOARDS } = await imp("functions/_lib/gd-sample.js");
  const g = GD_SAMPLE_BOARDS.find((x) => x.kind === "daily") || GD_SAMPLE_BOARDS[0];
  db.prepare("INSERT INTO gd_board (id, set_id, kind, title, rows, cols, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(g.id, g.set_id || "s", g.kind, g.title, g.rows, g.cols,
      JSON.stringify({ entries: g.entries, crossings: g.crossings }), new Date(NOW).toISOString());
  db.prepare("INSERT INTO gd_schedule (day, board_id) VALUES (?, ?)").run(AHEAD, g.id);
  const daily = (await imp("functions/api/grid/daily.js")).onRequestGet;
  const guess = (await imp("functions/api/grid/guess.js")).onRequestPost;
  const answers = g.entries.map((e) => e.answer);
  const token = "gd:" + g.id;
  const snap = counts();

  for (const [who, as] of STRANGERS) {
    const d = await call(daily, req("/api/g", as));
    const n = await call(daily, req(`/api/g?no=${AHEAD_NO}`, as));
    t(`${who}: today has no board, and that day's number is not out yet`,
      d.status === 200 && d.j.board === null && d.j.day === TODAY && n.status === 403 && !n.text.includes(g.id),
      `${d.status}/${n.status}`);
  }
  const e0 = g.entries[0];
  const pGuess = await call(guess, req("/api/q", { who: "player", preview: AHEAD, method: "POST",
    body: { token, playId: dummyPlayer, n: e0.n, guess: e0.answer } }));
  t("a player cannot open a round on it by guessing into it", pGuess.status === 404 && !pGuess.j.marks &&
    db.prepare("SELECT COUNT(*) AS n FROM gd_round").get().n === 0, pGuess.text);

  const shown = await call(daily, req("/api/g", OWNER));
  t("the owner's preview is served that day's board, as today's",
    shown.status === 200 && shown.j.day === AHEAD && shown.j.no === AHEAD_NO && shown.j.today === AHEAD_NO &&
    shown.j.board && shown.j.board.id === g.id, `${shown.status} ${shown.j && shown.j.day}`);
  t("  without a letter of any answer", !shown.text.includes('"answer"') && answers.every((a) => !shown.text.includes(a)));
  const byNo = await call(daily, req(`/api/g?no=${AHEAD_NO}`, OWNER));
  t("  and by its number too", byNo.status === 200 && byNo.j.board && byNo.j.board.id === g.id);

  const pid = P.previewId();
  const wrongWord = "Z".repeat(e0.len);
  const wrong = await call(guess, req("/api/q", { ...OWNER, method: "POST", body: { token, playId: pid, n: e0.n, guess: wrongWord } }));
  const right = await call(guess, req("/api/q", { ...OWNER, method: "POST", body: { token, playId: pid, n: e0.n, guess: e0.answer } }));
  const row = db.prepare("SELECT * FROM gd_round WHERE play_id = ?").get(pid);
  t("the owner's preview opens a round on it, its id a scratch one",
    row && row.board_id === g.id && row.day === AHEAD && P.isPreviewId(row.play_id));
  t("  and a guess on it is judged by the real code", wrong.status === 200 && wrong.j.correct === false && wrong.j.misses === 1 &&
    right.status === 200 && right.j.correct === true && right.j.solved === 1 && !right.text.includes(g.entries[1].answer),
    right.text.slice(0, 90));
  const change = moved(snap, counts());
  t("  and nothing outside the scratch tables was written", change.length === 0 && playsFor(pid) === 0,
    change.join(", ") || "every other table unchanged");
}

/* ---- 3. Codeword XI -------------------------------------------------------- */
console.log("\n=== Codeword XI: a day ahead ===");
{
  const { sqlFor } = await imp("tools/import_codeword.js");
  const { leaksSolution } = await imp("functions/_lib/cw-board.js");
  /* The importer's own SQL, with an epoch that puts board 1 on AHEAD. */
  const code = {};
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((L, i) => { code[L] = i + 1; });
  const board = {
    no: 1, size: 3, rows: ["CAT", "ARE", "TEN"],
    words: [["CAT", 0, 0, "a"], ["ARE", 1, 0, "a"], ["TEN", 2, 0, "a"], ["CAT", 0, 0, "d"]],
    code, given: ["C", "A", "T"],
    hints: [1, 2, 3, 4].map((i) => ({ sense: "s" + i, cat: "c" + i, enum: "3", text: "s" + i + " c" + i })),
    breaks: [[], [], [], []],
  };
  const epoch = Date.parse(AHEAD + "T00:00:00Z") - DAY;
  const sql = sqlFor([{ board }], "STAMP", epoch, "preview_grids_test");
  for (const st of sql.split(/\r?\n/).filter((l) => l && !/^\s*--/.test(l))) db.exec(st);
  t("the importer put board 1 on the day ahead", db.prepare("SELECT day FROM cw_schedule WHERE board_no = 1").get().day === AHEAD);

  const daily = (await imp("functions/api/codeword/daily.js")).onRequestGet;
  const play = (await imp("functions/api/codeword/play.js")).onRequestPost;
  const mark = (await imp("functions/api/codeword/mark.js")).onRequestPost;
  const reveal = (await imp("functions/api/codeword/reveal.js")).onRequestPost;
  const finish = (await imp("functions/api/codeword/finish.js")).onRequestPost;
  const snap = counts();

  for (const [who, as] of STRANGERS) {
    const d = await call(daily, req("/api/c", as));
    const n = await call(daily, req(`/api/c?no=${AHEAD_NO}`, as));
    t(`${who}: neither today nor that day's number is a board`, d.status === 404 && n.status === 404 &&
      !n.text.includes("cells"), `${d.status}/${n.status}`);
  }
  const pPlay = await call(play, req("/api/c", { who: "player", preview: AHEAD, method: "POST", body: { rate: 20, no: AHEAD_NO } }));
  const pPlay2 = await call(play, req("/api/c", { who: "player", preview: AHEAD, method: "POST", body: { rate: 20 } }));
  t("a player cannot open a round on it", pPlay.status === 400 && pPlay2.status === 400 &&
    db.prepare("SELECT COUNT(*) AS n FROM cw_round").get().n === 0);

  const shown = await call(daily, req("/api/c", OWNER));
  t("the owner's preview is served that day's board, as today's",
    shown.status === 200 && shown.j.day === AHEAD && shown.j.no === AHEAD_NO && shown.j.board && shown.j.board.day === AHEAD,
    `${shown.status} ${shown.j && shown.j.day}`);
  t("  without the grid, the answers or the cipher", leaksSolution(shown.j).length === 0 && !shown.text.includes("TEN"),
    leaksSolution(shown.j || {}).join(", "));

  const opened = await call(play, req("/api/c", { ...OWNER, method: "POST", body: { rate: 20, no: AHEAD_NO } }));
  const pid = opened.j && opened.j.playId;
  const row = pid && db.prepare("SELECT * FROM cw_round WHERE play_id = ?").get(pid);
  t("the owner's preview opens a round on it, its id minted as a scratch one",
    opened.status === 200 && P.isPreviewId(pid) && row && row.day === AHEAD, String(pid));
  const right = {}; for (const L of Object.keys(code)) right[String(code[L])] = L;
  const marked = await call(mark, req("/api/m", { ...OWNER, method: "POST", body: { playId: pid, guess: right } }));
  const shownLetter = await call(reveal, req("/api/r", { ...OWNER, method: "POST", body: { playId: pid, n: code.E } }));
  const whistle = await call(finish, req("/api/f", { ...OWNER, method: "POST", body: { playId: pid } }));
  t("  and it is judged by the real code: marked, revealed, scored",
    marked.status === 200 && JSON.stringify(marked.j.solved) === "[0,1,2,3]" &&
    shownLetter.status === 200 && shownLetter.j.letter === "E" && whistle.status === 200 && whistle.j.day === AHEAD,
    `${marked.text} ${shownLetter.text}`.slice(0, 120));
  const change = moved(snap, counts());
  t("  and nothing outside the scratch tables was written", change.length === 0 && playsFor(pid) === 0,
    change.join(", ") || "every other table unchanged");
}

/* ---- 4. the purge clears every scratch round these games wrote ------------- */
console.log("\n=== The purge ===");
const tables = ["ws_round", "ws_find", "ws_foul", "fr_ws_round", "fr_ws_find", "fr_ws_foul", "gd_round", "gd_guess", "cw_round", "cw_solved", "cw_reveal"];
const scratchRows = () => tables.reduce((n, x) => n + db.prepare(`SELECT COUNT(*) AS n FROM ${x} WHERE play_id LIKE 'pv-%'`).get().n, 0);
const before = scratchRows();
await P.purgePreviewRounds(env);
t("opening /admin/ deletes every scratch row these games wrote", before >= 11 && scratchRows() === 0, `${before} rows before`);

done();
