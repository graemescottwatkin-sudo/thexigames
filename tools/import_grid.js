#!/usr/bin/env node
/* tools/import_grid.js — Grid XI's boards, from the emitter into D1.
 *
 *   node tools/import_grid.js               gate, write data/gd-production.sql and the sample
 *   node tools/import_grid.js --check       gate only, write nothing
 *   node tools/import_grid.js --from=2026-09-20   start the calendar on that day
 *   node tools/import_grid.js --source <dir>
 *
 * THE BANK IS NOT IN THIS REPOSITORY and must never be. The boards live in
 * ..\Other\GridXI\boards, the SQL this writes is gitignored, and D1 is the
 * authoritative copy — the same arrangement the crossword, the word search and
 * HiLo keep. What travels with the repository is the two-board sample, which
 * exists so an offline suite and a fresh clone can open a real board.
 *
 * WHY THIS GATES AGAIN, when the emitter already did. They are two different
 * questions asked at two different boundaries. The emitter asks "is this a
 * board" — eleven entries, a loop in the grid, no two answers the same. This
 * asks "is this safe to put in production" — which includes the emitter's
 * question, because a board can reach this directory by any route and the
 * emitter is not one of them once a file is on disk, and includes one the
 * emitter cannot ask: that the PUBLIC projection this repository will serve
 * carries no answer. The emitter greps its own projection; this greps the one
 * functions/_lib/gd-board.js actually builds.
 *
 * THE CALENDAR IS BUILT HERE, because the emitter does not produce one. It
 * writes boards; which board is which day is a scheduling decision, kept in its
 * own table so the run-in can be regenerated without touching a board. Order is
 * the emitter's index order for now, which is a placeholder and is SAID to be
 * one: the first board a game ever serves is a launch decision and belongs to
 * the owner, not to whatever order a directory listing came back in.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicText, boardToken } from "../functions/_lib/gd-board.js";
import { dailyDayKey, dailyNumber } from "../functions/_lib/daily.js";
import { LAUNCHED } from "../functions/_lib/games.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK_ONLY = process.argv.includes("--check");
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};
const SOURCE = arg("source") || path.join(ROOT, "..", "Other", "GridXI", "boards");
const OUT = path.join(ROOT, "data", "gd-production.sql");
const SAMPLE = path.join(ROOT, "functions", "_lib", "gd-sample.js");
const XI = 11;
const CAP = 16;

/* ---- the gate, exported so a suite can sabotage it ---------------------- */

export function gate(board) {
  const p = [];
  if (!board || !board.id) return ["no id"];
  if (!board.title) p.push("no title — the title IS the clue");
  if (!Array.isArray(board.entries) || board.entries.length !== XI) {
    p.push(`${(board.entries || []).length} entries, not ${XI}`);
    return p;                                   // nothing below is meaningful
  }
  if (!(board.rows > 0) || !(board.cols > 0)) p.push("no grid size");

  const seen = new Set();
  for (const e of board.entries) {
    if (!e.answer) { p.push(`entry ${e.n} has no answer`); continue; }
    if (!/^[A-Z]+$/.test(e.answer)) p.push(`entry ${e.n}: answer is not plain A-Z`);
    if (e.answer.length !== e.len) p.push(`entry ${e.n}: len ${e.len} but answer is ${e.answer.length}`);
    if (e.answer.length > CAP) p.push(`entry ${e.n}: ${e.answer.length} characters, over the ${CAP} cap`);
    if (!Array.isArray(e.cells) || e.cells.length !== e.len) {
      p.push(`entry ${e.n}: ${(e.cells || []).length} cells for a ${e.len}-letter answer`);
    }
    if (seen.has(e.answer)) p.push(`two entries answer ${e.answer}`);
    seen.add(e.answer);
  }

  /* EVERY ENTRY CROSSES SOMETHING, AND THE GRID HOLDS A LOOP. Eleven words
     need ten crossings to be connected at all, so an eleventh is the first
     that closes one — and with no clues and nothing given at the start, a bare
     tree is eleven separate guesses rather than a puzzle. */
  const per = new Map(board.entries.map((e) => [e.n, 0]));
  for (const x of (board.crossings || [])) {
    for (const n of (x.entries || [])) per.set(n, (per.get(n) || 0) + 1);
  }
  const lonely = [...per.entries()].filter(([, n]) => n === 0).map(([n]) => n);
  if (lonely.length) p.push(`entries ${lonely.join(", ")} cross nothing`);
  if ((board.crossings || []).length < XI) {
    p.push(`${(board.crossings || []).length} crossings: a bare tree, no loop`);
  }

  /* AND THE CELLS AGREE WITH THE ANSWERS. Two entries sharing a cell must hold
     the same letter there, or no set of guesses can satisfy both and the player
     is asked for the impossible. */
  const letter = new Map();
  for (const e of board.entries) {
    (e.cells || []).forEach((cell, i) => {
      const ch = (e.answer || "")[i];
      if (letter.has(cell) && letter.get(cell) !== ch) {
        p.push(`cell ${cell} is ${letter.get(cell)} and ${ch} at once`);
      }
      letter.set(cell, ch);
    });
  }

  /* THE CHECK THE EMITTER CANNOT MAKE: the projection THIS repository serves.
     The emitter greps its own publicBoard; between there and here the board is
     written, read, imported and rebuilt from a database row, and the thing that
     will actually go on the wire is functions/_lib/gd-board.js's. Asked of the
     real strings rather than of the shape, because the shape is what a refactor
     changes. */
  const pub = publicText(board, boardToken(board.id));
  const leaked = board.entries.filter((e) => e.answer && pub.includes(e.answer));
  if (leaked.length) p.push(`PUBLIC BOARD LEAKS ${leaked[0].answer}`);

  return p;
}

/* ---- the source -------------------------------------------------------- */

function loadSource() {
  const index = JSON.parse(fs.readFileSync(path.join(SOURCE, "index.json"), "utf8"));
  const boards = (index.list || []).map((row) =>
    JSON.parse(fs.readFileSync(path.join(SOURCE, row.id + ".json"), "utf8")));
  return { boards, generated: index.generated };
}

/* ---- the calendar ------------------------------------------------------- */

/* One board a day, in order, from a start day. Written as DAYS rather than as
   board numbers because a schedule table is keyed by day — the address a player
   sees is a board number, and permalink.js reconciles the two in one place. */
function buildSchedule(boards, fromDay) {
  const startNo = fromDay
    ? dailyNumber(Date.parse(fromDay + "T00:00:00Z"))
    : dailyNumber();
  const schedule = {};
  boards.forEach((b, i) => {
    const day = dailyDayKey(startNo + i);
    if (day) schedule[day] = b.id;
  });
  return schedule;
}

/* ---- the sample --------------------------------------------------------- */

/* Two real boards, and the calendar as OFFSETS from today rather than as dates:
   a fixture with a date written into it stops being today, and then reports a
   fault in the code when the fault is in the fixture. */
function sampleModule(boards) {
  const bySize = [...boards].sort((a, b) => a.rows * a.cols - b.rows * b.cols);
  const sample = [bySize[0], bySize[bySize.length - 1]];
  return `/* gd-sample.js — two Grid XI boards, so the game runs with no database.
 *
 * The same arrangement HiLo and the word search keep: the BANK is ${boards.length} boards
 * and lives outside the repository, and this is a sample small enough to commit
 * and complete enough for a suite to play. Every offline run — every check in
 * CI, and \`wrangler pages dev\` on a machine with no D1 — sees these two and
 * says so, rather than a game that will not open.
 *
 * YES, THE ANSWERS ARE IN HERE, and that is the same trade the other two make.
 * A sample carrying no answers could not be played and so could not be tested,
 * and two boards out of ${boards.length} is not the bank. What must never happen is a
 * board reaching a BROWSER with its letters, which is a different question and
 * is what gd-board.js publicBoard and football/grid/api_test.mjs are for.
 *
 * GENERATED by tools/import_grid.js. Hand-editing it would make it a third
 * statement of what a board is, after the emitter and the D1 rows.
 */
export const GD_SAMPLE_BOARDS = ${JSON.stringify(sample, null, 1)};

/* The calendar, as OFFSETS from today. -1 is yesterday, so the archive has one
   board and today has the other. */
export const GD_SAMPLE_SCHEDULE = ${JSON.stringify({ "-1": sample[0].id, 0: sample[1].id })};
`;
}

/* ---- the run ------------------------------------------------------------ */

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

function main() {
  if (!fs.existsSync(path.join(SOURCE, "index.json"))) {
    if (CHECK_ONLY && fs.existsSync(SAMPLE)) {
      /* NO BANK ON THIS MACHINE — CI, a fresh clone. Gate the committed sample
         itself, so --check is never a silent pass: a check that passes when it
         finds no problems also passes when it finds nothing at all. */
      import(`file://${SAMPLE.split(path.sep).join("/")}`).then((m) => {
        let refused = 0;
        for (const b of m.GD_SAMPLE_BOARDS) {
          const p = gate(b);
          if (p.length) { refused++; console.error(`REFUSED sample board ${b.id}: ${p[0]}`); }
        }
        console.log(`${m.GD_SAMPLE_BOARDS.length} sample boards gated, no bank on this machine`);
        process.exit(refused ? 1 : 0);
      });
      return;
    }
    console.error(`REFUSED: no boards at ${SOURCE}. Pass --source <dir>.`);
    process.exit(1);
  }

  const { boards, generated } = loadSource();
  let refused = 0;
  const ids = new Set();
  for (const b of boards) {
    const p = gate(b);
    if (ids.has(String(b.id))) p.push("duplicate id");
    ids.add(String(b.id));
    if (p.length) { refused++; console.error(`REFUSED ${b.id} (${b.title}):\n  x ${p.join("\n  x ")}`); }
  }
  if (refused) { console.error(`\n${refused} board(s) refused. Nothing written.`); process.exit(1); }

  /* THE CALENDAR STARTS ON THE DAY THE GAME LAUNCHES, and that day is one
     fact: LAUNCHED.grid in functions/_lib/games.js, which is null until the
     launch and is the same line that has to be written anyway. --from still
     wins, for a re-import that moves the calendar deliberately; what has gone
     is the third place the launch day would have been typed. Without either,
     the calendar starts today, which is the placeholder this repo has now and
     is why the import must be run again at launch. */
  const from = arg("from") || LAUNCHED.grid || null;
  const schedule = buildSchedule(boards, from);
  const days = Object.keys(schedule).sort();

  if (CHECK_ONLY) {
    console.log(`\n${boards.length} boards gated, ${days.length} days; emitted ${generated}`);
    console.log(`calendar would run ${days[0]} to ${days[days.length - 1]}`);
    return;
  }

  const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  const now = new Date().toISOString();
  const lines = [
    "-- Grid XI: the boards and the calendar. GENERATED by tools/import_grid.js.",
    "-- Never commit this file: it holds every answer. Apply 033-grid.sql first.",
    `-- ${boards.length} boards, ${days.length} days, from ${days[0]} to ${days[days.length - 1]}.`,
    "",
    "DELETE FROM gd_schedule;",
    "",
  ];
  for (const b of boards) {
    /* The payload is the board MINUS what has its own column, so a fact is not
       stored twice and then allowed to disagree with itself. */
    const payload = { entries: b.entries, crossings: b.crossings, quality: b.quality };
    lines.push("INSERT OR REPLACE INTO gd_board (id, set_id, kind, title, rows, cols, payload, updated_at) VALUES (" +
      [q(b.id), q(b.set_id || ""), q("daily"), q(b.title), Number(b.rows), Number(b.cols),
       q(JSON.stringify(payload)), q(now)].join(", ") + ");");
  }
  lines.push("");
  for (const day of days) {
    lines.push(`INSERT INTO gd_schedule (day, board_id) VALUES (${q(day)}, ${q(schedule[day])});`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  fs.writeFileSync(SAMPLE, sampleModule(boards));
  console.log(`\n${boards.length} boards, ${days.length} days -> data/gd-production.sql`);
  console.log(`calendar runs ${days[0]} to ${days[days.length - 1]}`);
  console.log(`sample rewritten -> functions/_lib/gd-sample.js`);
  console.log("\nApply with:\n  npx wrangler d1 execute crosswordxi --remote --file=data/gd-production.sql\n");
}
