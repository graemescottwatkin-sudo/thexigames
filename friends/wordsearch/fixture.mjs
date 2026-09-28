/* friends/wordsearch/fixture.mjs — made-up boards, a real database, and a
 * clock, shared by round_test.mjs and journey_test.mjs.
 *
 * THE DATABASE IS REAL SQL. node:sqlite with data/migrations/048 applied, so
 * every statement frws-data.js and frws-round.js send is executed rather than
 * matched by a stub; a column named wrongly fails here, not in production.
 *
 * THE BOARDS ARE INVENTED. The real bank never enters this repository, so the
 * words below are placeholders laid out where a test can find them:
 * clue n is row n, read left to right — except clue 3, which is written right
 * to left, so a board that only judged forwards would fail. The bonus is on
 * row 12. Every other square is Q, and no word has a Q in it, so each word
 * occurs exactly once.
 *
 * ONE CLOCK. Date.now is pinned to noon UTC of the day the run starts and only
 * moves when a test moves it, so the server's "today" cannot roll over midnight
 * halfway through a suite.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, "..", "..");

/* ---- the clock ----------------------------------------------------------- */
const REAL_NOW = Date.now.bind(Date);
const NOON = Math.floor(REAL_NOW() / 86400000) * 86400000 + 12 * 3600000;
let offset = 0;
Date.now = () => NOON + offset;
export const clock = {
  now: () => NOON + offset,
  advance: (ms) => { offset += ms; },
  reset: () => { offset = 0; },
};
const dayAt = (d) => new Date(NOON + d * 86400000).toISOString().slice(0, 10);
export const TODAY = dayAt(0), YESTERDAY = dayAt(-1), LONG_AGO = dayAt(-30), TOMORROW = dayAt(1);

/* ---- the boards ---------------------------------------------------------- */
const WORDS = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIETT", "KILO"];
const BONUS = "LIMA";

export function makeBoard(id, theme) {
  const grid = Array.from({ length: 14 }, () => Array(12).fill("Q"));
  const answers = WORDS.map((w, n) => {
    const backwards = n === 3;
    for (let k = 0; k < w.length; k++) grid[n][backwards ? w.length - 1 - k : k] = w[k];
    const placement = backwards
      ? { direction: "W", start_row: n, start_col: w.length - 1, end_row: n, end_col: 0 }
      : { direction: "E", start_row: n, start_col: 0, end_row: n, end_col: w.length - 1 };
    return { clue: `Clue number ${n + 1} for ${theme} (${w.length})`, display: w[0] + w.slice(1).toLowerCase(),
             grid: w, placement };
  });
  for (let k = 0; k < BONUS.length; k++) grid[12][k] = BONUS[k];
  const bonus = { clue: `The secret for ${theme} (${BONUS.length})`, display: "Lima", grid: BONUS,
                  category: "Bonus clue",
                  placement: { direction: "E", start_row: 12, start_col: 0, end_row: 12, end_col: BONUS.length - 1 } };
  return { id, theme, category: "Test boards", status: "ready", hash: id.toLowerCase().padEnd(16, "0"),
           version: 1, share_key: id + "-v1", grid: grid.map((r) => r.join("")), answers, bonus };
}
export { WORDS, BONUS };

/* The drag that finds clue n (0-based), from its first letter to its last. */
export function dragFor(board, n) {
  const pl = n === "bonus" ? board.bonus.placement : board.answers[n].placement;
  return { from: [pl.start_row, pl.start_col], to: [pl.end_row, pl.end_col] };
}

/* ---- D1, over node:sqlite ------------------------------------------------ */
export function makeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(ROOT, "data/migrations/048-friends-wordsearch.sql"), "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args),
  });
  return { raw: db, prepare: (sql) => stmt(sql) };
}

/* Today's board, yesterday's, one from a month ago, tomorrow's (unreleased)
   and one that is never scheduled — every case the release rule has. */
export const BOARDS = {
  today: makeBoard("FRWS-9001", "Today's board"),
  yesterday: makeBoard("FRWS-9002", "Yesterday's board"),
  old: makeBoard("FRWS-9003", "An old board"),
  tomorrow: makeBoard("FRWS-9004", "Tomorrow's board"),
  never: makeBoard("FRWS-9005", "A board never scheduled"),
};
export function seed(env, schedule) {
  const ins = env.DB.raw.prepare(
    "INSERT INTO fr_ws_puzzles (id, theme, category, status, hash, version, share_key, payload) VALUES (?,?,?,?,?,?,?,?)");
  for (const b of Object.values(BOARDS)) {
    ins.run(b.id, b.theme, b.category, b.status, b.hash, b.version, b.share_key,
      JSON.stringify({ grid: b.grid, answers: b.answers, bonus: b.bonus }));
  }
  const days = schedule || { [LONG_AGO]: BOARDS.old.id, [YESTERDAY]: BOARDS.yesterday.id,
                             [TODAY]: BOARDS.today.id, [TOMORROW]: BOARDS.tomorrow.id };
  const sch = env.DB.raw.prepare("INSERT INTO fr_ws_schedule (day, puzzle_id) VALUES (?, ?)");
  for (const [d, id] of Object.entries(days)) sch.run(d, id);
}
export function freshEnv(schedule) {
  const env = { DB: makeD1() };
  seed(env, schedule);
  return env;
}

/* ---- the routes ---------------------------------------------------------- */
import * as daily from "../../functions/api/wordsearch_fr/daily.js";
import * as round from "../../functions/api/wordsearch_fr/round.js";
import * as find from "../../functions/api/wordsearch_fr/find.js";
import * as finish from "../../functions/api/wordsearch_fr/finish.js";
import * as puzzle from "../../functions/api/wordsearch_fr/puzzle.js";
import * as catalog from "../../functions/api/wordsearch_fr/catalog.js";
import * as archive from "../../functions/api/wordsearch_fr/archive.js";
export const ROUTES = { daily, round, find, finish, puzzle, catalog, archive };

/* One request to one route, as Pages would make it. */
export async function call(env, name, { method = "GET", body, query = "", csrf = true } = {}) {
  const url = "https://www.thexigames.com/api/wordsearch_fr/" + name + query;
  const headers = { "Content-Type": "application/json" };
  if (csrf) headers["X-XI-Games"] = "1";
  const request = new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const mod = ROUTES[name];
  const fn = method === "POST" ? mod.onRequestPost : mod.onRequestGet;
  if (typeof fn !== "function") return { status: 405, body: null, text: "" };
  const res = await fn({ request, env });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) {}
  return { status: res.status, body: parsed, text, headers: res.headers };
}
