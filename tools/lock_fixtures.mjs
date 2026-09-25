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

/* ---- Who Am I, football and Friends -----------------------------------------
 * Both refuse to run without a database, and a round is several endpoints of
 * server state, so the round is answered here in the shapes the games' own
 * journey suites use (football/whoami/journey_test.mjs, and the canned Friends
 * flow in .claude/static-server.js). The long case is a career of fourteen
 * clubs: the bought clue that grows the most. Made up; nobody is the answer. */
export function whoamiStub(pathname, body) {
  const fr = pathname.startsWith("/api/whoami/whoami_fr/");
  const what = pathname.replace(/^\/api\/whoami\/(whoami_fr\/)?/, "").split("?")[0];
  const day = new Date().toISOString().slice(0, 10);
  if (!fr) {
    const RULE = { curve: [[0, 114], [90, 36]], max: 114, fullTime: 90, matchMinutes: 90, rateSeconds: 20,
      ladder: [{ stage: 1, sub: 0, points: 0, label: "The spell" }, { stage: 2, sub: 1, points: 20, label: "Full career" },
               { stage: 3, sub: 2, points: 10, label: "Nationality and year of birth" }], giveUp: { label: "Give up" } };
    const clubs = ["Arsenal", "Chelsea", "Everton", "Newcastle United", "Liverpool", "Aston Villa",
      "Leeds United", "Southampton", "Fulham", "West Ham United", "Sunderland"];
    if (what === "daily") return { source: "d1", no: 21, day, lastDay: day, isToday: true, scoring: RULE,
      board: { id: "XIWA-FIXTURE", date: day, no: 21, day, doors: clubs.map((c, i) => ({ slot: i + 1, club: c, leave: 2010 + i })), careers: [2, 3, 4, 5, 7, 9] } };
    if (what === "names") return { count: 2, names: [["FIXTURE PLAYER", "FIXTUREPLAYER"], ["ANOTHER PLAYER", "ANOTHERPLAYER"]] };
    if (what === "archive") return { source: "d1", count: 1, boards: [{ day, no: 21 }] };
    if (what === "play") return { playId: "lock-wa", slot: Number(body.slot) || 1, stage: 1, pointsSpent: 0, worthNow: 114, minute: 0, day };
    if (what === "clue") {
      const stage = Number(body.stage) || 1;
      const out = { stage, label: RULE.ladder[stage - 1].label, pointsSpent: stage >= 2 ? 20 : 0, minute: 0, worthNow: stage >= 2 ? 94 : 114, replayed: false };
      if (stage === 1) out.spell = { club: "Newcastle United", from: 2004, to: 2011, apps: 233, goals: 41 };
      if (stage === 2) {
        const names = ["Sheffield Wednesday", "Wolverhampton Wanderers", "Brighton & Hove Albion", "Queens Park Rangers",
          "Newcastle United", "Nottingham Forest", "West Bromwich Albion", "Borussia Mönchengladbach", "Paris Saint-Germain",
          "Real Sociedad", "Blackburn Rovers", "Crystal Palace", "Bolton Wanderers", "Tottenham Hotspur"];
        out.spells = names.map((c, i) => ({ club: c, from: 1996 + i * 2, to: 1998 + i * 2, apps: 40 + i, goals: i, loan: i % 5 === 2, mine: c === "Newcastle United" }));
        out.career = out.spells.map((x) => x.from + "-" + x.to + " " + x.club).join(" - ");
        out.clubCount = names.length;
      }
      if (stage === 3) { out.birthYear = 1978; out.nationality = "Republic of Ireland"; out.position = "Midfielder"; }
      return out;
    }
    if (what === "guess") return { verdict: "wrong", pointsSpent: 20, minute: 0, worthNow: 94, finished: false, solved: false };
    if (what === "giveup") return { label: "Give up", minute: 0, score: 0, worthNow: 0, pointsSpent: 20, finished: true, solved: false, answer: "FIXTURE PLAYER", career: "1996-1998 Fixture FC" };
    if (what === "finish") return { day, slot: 1, solved: false, finished: true, pointsSpent: 20, subsUsed: 1, guesses: 1, minute: 0, score: 0, nearMisses: 0, answer: "FIXTURE PLAYER", career: "1996-1998 Fixture FC", club: "Newcastle United" };
    return {};
  }
  const CLUES = ["A fixture clue, the first, long enough to wrap onto a second line on a phone.",
    "A fixture clue, the second, written to be the longest of the three and wrap onto three lines on a narrow screen at the size it is set.",
    "A fixture clue, the third."];
  if (what === "daily") return { source: "dev", day, no: 5, isToday: true, lastDay: day,
    scoring: { max: 10, doors: 3, ladder: [{ stage: 1, sub: 0, points: 0, label: "First clue" }, { stage: 2, sub: 1, points: 4, label: "Second clue" }, { stage: 3, sub: 2, points: 3, label: "Third clue" }], giveUp: { label: "Tell me" } },
    board: { day, no: 5, doors: [{ slot: 1, section: "Loves & Exes", deck: "main" }, { slot: 2, section: "Family & Relatives", deck: "main" }, { slot: 3, section: "Jobs & Ambitions", deck: "expert" }] } };
  if (what === "names") return { count: 2, names: [["Fixture Character", "FIXTURECHARACTER"], ["Another Character", "ANOTHERCHARACTER"]] };
  if (what === "play") return { playId: "lock-fr", slot: Number(body.slot) || 1, startedMs: Date.now(), stage: 1, pointsSpent: 0, worthNow: 10, minute: 0, day };
  if (what === "clue") { const st = Math.max(1, Math.min(3, Number(body.stage) || 1));
    return { stage: st, label: ["First clue", "Second clue", "Third clue"][st - 1], pointsSpent: [0, 4, 7][st - 1], minute: 0, worthNow: 10 - [0, 4, 7][st - 1], replayed: false, finished: false, solved: false, step: st, of: 3, text: CLUES[st - 1], cited: st !== 2 }; }
  if (what === "guess") return { verdict: "wrong", pointsSpent: 4, minute: 0, worthNow: 6, finished: false, solved: false };
  if (what === "giveup") return { label: "Tell me", minute: 0, score: 0, worthNow: 0, pointsSpent: 7, finished: true, solved: false, answer: "Fixture Character", section: "Loves & Exes", deck: "main" };
  if (what === "finish") return { day, slot: 1, solved: false, finished: true, pointsSpent: 7, subsUsed: 2, guesses: 1, nearMisses: 0, score: 0, minute: 0, answer: "Fixture Character", section: "Loves & Exes", deck: "main" };
  return {};
}
