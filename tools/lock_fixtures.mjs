/* tools/lock_fixtures.mjs — databases for tools/lock_test.mjs, built from the
 * repo's own migrations in node:sqlite and seeded with MADE-UP content.
 *
 * WHY A GAME NEEDS ONE. Scrambled and Vowels fall back to committed sample
 * boards when no database is bound. QuickFire does not, on purpose: an unbound
 * binding must look broken, not like a working game running on samples
 * (functions/_lib/qfdata.js). So the only way to put a QuickFire round on a
 * screen without production is a real schema with rows in it.
 *
 * NOTHING HERE IS FROM THE BANK. The questions are fixtures, labelled as such,
 * sized from the bank's measured extremes (24 Sep 2026: the longest verified
 * clue is 114 characters, the longest option 17) and pushed past them, so the
 * lock is proved against something harder than anything a player is served.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function sqliteD1() {
  const sqlite = await import("node:sqlite");
  const db = new sqlite.DatabaseSync(":memory:");
  const dir = path.join(ROOT, "data", "migrations");
  for (const f of fs.readdirSync(dir).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort()) {
    try { db.exec(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { /* ALTERs the base already has */ }
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
    batch: async (stmts) => Promise.all(stmts.map((s) => s.run())),
  };
  return { db, d1 };
}

/* A clue of exactly n characters, so the length is the point and the words are
   plainly not a question anybody will be asked. */
const clueOf = (i, n) => {
  let s = `Fixture question ${i}: which of these four is the answer the fixture marks right?`;
  while (s.length < n) s += " And a little more filler";
  return s.slice(0, n - 1) + "?";
};

/* Q1 is the longest on purpose: it is what a round opens on, so every size in
   the test is measured against the hardest clue first. */
const LENGTHS = [150, 114, 30, 58, 90, 45, 120, 70, 24, 100, 60, 80, 40, 66];
const OPTIONS = ["Wolverhampton Wanderers", "Brighton & Hove Albion", "Nottingham Forest FC", "Sheffield Wednesday"];

/* `days` is one day or a list of them: each is published with the same
   fixture questions, so a suite can open a past board as well as today's. */
export async function quickfireEnv(days) {
  const list = Array.isArray(days) ? days : [days];
  const { db, d1 } = await sqliteD1();
  const ins = db.prepare(`INSERT INTO qf_question (id, answer, answer_norm, answer_type, clue, status,
      option_1, option_2, option_3, option_4) VALUES (?, ?, ?, 'club', ?, 'verified', ?, ?, ?, ?)`);
  const slot = db.prepare("INSERT INTO qf_daily_slot (play_date, slot, question_id, role) VALUES (?, ?, ?, ?)");
  LENGTHS.forEach((n, i) => {
    const id = "FX" + String(i + 1).padStart(3, "0");
    const answer = OPTIONS[i % 4];
    ins.run(id, answer, answer.toLowerCase(), clueOf(i + 1, n), ...OPTIONS);
    for (const day of list) slot.run(day, i < 11 ? i + 1 : i - 10, id, i < 11 ? "xi" : "bench");
  });
  for (const day of list) db.prepare("INSERT INTO qf_daily (play_date, status) VALUES (?, 'published')").run(day);
  return { DB: d1 };
}

/* ---- Codeword ---------------------------------------------------------------
 * A 13x13 board, the size of every board in the bank (measured 24 Sep 2026),
 * with eleven entries: seven across on the even rows and four down on the
 * first even columns, blocks on the odd rows between them. The letters are a
 * fixture's, not an answer anybody is asked for. Returned RAW -- with rows,
 * words and code -- so the page is served it through the real publicBoard(),
 * which is what strips the solution. */
export function codewordRawBoard(no, day) {
  const N = 13;
  const FILL = "FIXTUREBOARDSQUAREFOOTBALLCODEWORDMATCHPLAYGRID";
  let k = 0;
  const next = () => FILL[(k++) % FILL.length];
  const grid = [];
  for (let r = 0; r < N; r++) {
    grid[r] = [];
    for (let c = 0; c < N; c++) grid[r][c] = (r % 2 === 1 && c % 2 === 1) ? "." : next();
  }
  const rows = grid.map((row) => row.join(""));
  const words = [];
  for (let r = 0; r < N; r += 2) words.push([rows[r], r, 0, "a"]);
  for (let c = 0; c < 8; c += 2) words.push([grid.map((row) => row[c]).join(""), 0, c, "d"]);
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const code = {};
  ALPHA.split("").forEach((l, i) => { code[l] = ((i * 7) % 26) + 1; });
  return {
    no, day, size: N, rows, code, words,
    given: ["F", "O", "T"],
    hints: words.map((w, i) => ({ sense: "Fixture entry " + (i + 1), cat: "Club", enum: String(w[0].length) })),
  };
}
