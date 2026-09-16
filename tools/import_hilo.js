#!/usr/bin/env node
/* tools/import_hilo.js — HiLo XI's boards and calendar into SQL for D1, and
 * the three-board sample the Worker falls back to.
 *
 *   node tools/import_hilo.js            gate, write data/hl-production.sql and the sample
 *   node tools/import_hilo.js --check    gate and compare the sample, write nothing
 *   node tools/import_hilo.js --source <dir>
 *
 * THE SOURCE lives outside this repository, like every bank: the research
 * side's folder, ../Other/HiLoXI from the repo root, holding boards/*.json,
 * boards-index.json and schedule.json. Nothing there is committed here except
 * the sample.
 *
 * WHAT THIS GATE SEES. Shape, not truth: twelve rows, numeric values, no two
 * neighbours equal, a source on every row, a calendar whose every day names a
 * daily board that exists. The research side's own gate and audit prove the
 * facts against their sources; a green run here is a well-formed bank, not a
 * correct one, and every board carries the URLs that back it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/* THE CLUB RULE IS THE SERVER'S, ASKED FOR RATHER THAN COPIED. This file
   kept its own CLUB_CATEGORY, identical to the one in hl-board.js on the
   day both were written and stale in both on the day the content side
   added three families. Two statements of "what is a club board" is the
   fault this project pays for most often, and here it would have buried
   220 boards. One place now: functions/_lib/hl-board.js. */
import { clubOf, isClubBoard } from "../functions/_lib/hl-board.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK_ONLY = process.argv.includes("--check");
const SOURCE_ARG = (() => { const i = process.argv.indexOf("--source"); return i > -1 ? process.argv[i + 1] : null; })();
const SOURCE = SOURCE_ARG || path.join(ROOT, "..", "Other", "HiLoXI");
const OUT = path.join(ROOT, "data", "hl-production.sql");
const SAMPLE = path.join(ROOT, "functions", "_lib", "hl-sample.js");

/* EXPORTED so the page's formatter can be held to it. The unit decides how a
   value is RENDERED, and until 16 Sep 2026 this list and football/hilo/js/game.js
   were two lists with nothing between them: the importer knew four units and
   fmt() named two, agreeing only because String() happens to be right for
   "year". A unit accepted here and unknown there does not error — fmt falls
   through to String(v) — so it ships as a bare number on a game where the
   number IS the puzzle. football/hilo/units_test.mjs now pins one against the
   other; adding a unit here goes red until somebody decides how it reads. */
export const UNITS = ["year", "count", "pounds", "date", "cm"];
const VALUE_CLASSES = ["fixed-by-nature", "retired-only", "snapshot"];

/* ---- the gate, exported so board_test can sabotage it ---- */
export function gate(board) {
  const p = [];
  if (!board || typeof board !== "object") return ["not an object"];
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(board.id || ""))) p.push("no id, or an id that is not an id");
  if (!board.category || typeof board.category !== "string") p.push("no category");
  if (!board.subtitle || typeof board.subtitle !== "string") p.push("no subtitle — the line that says what the number is");
  /* A CLUB BOARD MUST SAY WHEN ITS NUMBERS WERE TRUE. The subtitles used to
     carry the date — "as at 2 September 2026" written into all 274 of them —
     and the owner took it out on 4 Sep so a title says what the number is and
     nothing else. The date did not stop mattering: an appearance count is a
     snapshot and an undated snapshot is a claim with no date on it. It moved
     to trueAsOf, shown once at the top of the club page, so this is where the
     board is refused for not carrying one. */
  if (isClubBoard(board) && !/^\d{4}-\d{2}-\d{2}$/.test(String(board.trueAsOf || ""))) {
    p.push("a club board needs trueAsOf as YYYY-MM-DD — the club page states it and cannot invent it");
  }
  if (!UNITS.includes(board.unit)) p.push(`unit must be one of ${UNITS.join(", ")}, not ${JSON.stringify(board.unit)}`);
  if (board.valueClass !== undefined && !VALUE_CLASSES.includes(board.valueClass)) p.push(`unknown valueClass ${JSON.stringify(board.valueClass)}`);
  if (board.direction != null) {
    const d = board.direction;
    if (typeof d !== "object" || typeof d.higher !== "string" || typeof d.lower !== "string" || !d.higher || !d.lower) {
      p.push("direction must be { higher, lower } with both faces named, or absent");
    }
  }
  const chain = Array.isArray(board.chain) ? board.chain : [];
  if (chain.length !== 12) p.push(`${chain.length} rows — a board is twelve items, eleven calls, and nothing else fits the ladder`);
  chain.forEach((r, i) => {
    const where = `row ${i + 1}`;
    if (!r || typeof r !== "object") { p.push(`${where}: not a row`); return; }
    if (!r.name || typeof r.name !== "string") p.push(`${where}: no name`);
    if (typeof r.value !== "number" || !Number.isFinite(r.value)) p.push(`${where}: value must be a number`);
    if (board.unit === "date" && typeof r.value === "number" && !Number.isInteger(r.value)) p.push(`${where}: a date value is a whole count of days`);
    if (r.precision !== undefined && !["day", "month", "year"].includes(r.precision)) p.push(`${where}: unknown precision`);
    if (!r.source || typeof r.source !== "object" || !r.source.url || !r.source.quote) {
      p.push(`${where}: no source with a url and a quote — a value is a claim and must carry what backs it`);
    }
    if (i > 0 && chain[i - 1] && typeof chain[i - 1].value === "number" && r.value === chain[i - 1].value) {
      p.push(`${where}: equal to the row before it — a call with no answer`);
    }
  });
  return p;
}

export const isClub = isClubBoard;

function readJSON(f) { return JSON.parse(fs.readFileSync(f, "utf8")); }

/* THE INDEX AND THE FOLDER MUST AGREE BEFORE A SINGLE BOARD IS READ.
 *
 * This used to map straight over the index and let readJSON throw on the first
 * file that was not there — which is red, but red by CRASHING, and a crash is
 * not a verdict. Worse, it is a crash that can arrive AFTER a green --check:
 * measured on 15 September 2026, --check passed against this bank at 22:14 and
 * the write crashed with ENOENT at 22:2x, because the producing side was
 * rebuilding the folder between the two runs. The index claimed 282 boards, 223
 * files were present, 70 entries named files that did not exist, and id 1019
 * was `1019-season-goals.json` in the index and `1019-standings.json` on disk.
 *
 * A source being rewritten while it is read is not a corrupt source and not a
 * bug in the producing side — it is a folder mid-build, and the only correct
 * response is to refuse and say so rather than to import whichever half was
 * there. Read the whole list, name everything missing, refuse once. */
function loadSource() {
  const idx = readJSON(path.join(SOURCE, "boards-index.json"));
  const list = idx.list || [];
  const missing = list.filter((e) => !fs.existsSync(path.join(SOURCE, e.file)));
  if (missing.length) {
    console.error(`REFUSED: boards-index.json names ${list.length} board(s) and ` +
      `${missing.length} of them are not in the folder.`);
    for (const e of missing.slice(0, 6)) console.error(`  x ${e.file}`);
    if (missing.length > 6) console.error(`  x ...and ${missing.length - 6} more`);
    console.error("");
    console.error("The bank is mid-build, or the index is ahead of the files. Nothing is");
    console.error("read and nothing is written: importing whichever half is present would");
    console.error("put a partial calendar into a live game. Ask for the build to finish.");
    process.exit(1);
  }
  const boards = list.map((e) => readJSON(path.join(SOURCE, e.file)));
  const sched = readJSON(path.join(SOURCE, "schedule.json"));
  const schedule = {};
  for (const e of sched.schedule || []) schedule[e.date] = String(e.id);
  return { boards, schedule };
}

/* ---- THE DAYS THAT HAVE ALREADY BEEN PLAYED ----------------------------
 *
 * THIS TOOL HAD NO SERVED-DAY PROTECTION OF ANY KIND. Not a weak one — none.
 * It takes the calendar wholesale out of schedule.json, opens its SQL with
 * DELETE FROM hl_board; DELETE FROM hl_schedule; and rewrites every board and
 * every day. It gates BOARDS carefully and nothing at all guarded WHICH DAY
 * GETS WHICH BOARD, over a game that has been live since 3 September 2026.
 *
 * Ballpark's and Grid's importers had a subtler version of this — a comparison
 * that was empty rather than absent — and both were fixed on 15 September.
 * This is the same fault in its complete form, found by checking the other
 * importers for the shape rather than waiting for it to cost a day.
 *
 * TWO QUESTIONS, AND THE SECOND IS THE ONE PEOPLE SKIP.
 *
 *   Did the day change hands? Board 785 was Monday's; is it still Monday's.
 *   Did the board itself change? An id keeping its place does NOT mean the
 *   board is the same — Ballpark's bp-0014 and bp-0015 kept their ids while
 *   six of eleven questions moved off each. Since every payload is rewritten
 *   here, a served day can be quietly replaced under an unchanged id.
 *
 * The comparison is against the last SQL this tool emitted, which is the only
 * record of the previous calendar outside the database. Its absence is
 * REFUSED rather than assumed clean, for a calendar that covers days already
 * played: no record is not the same as no clash.
 */

/* What was scheduled last time, read back out of the emitted SQL. */
export function scheduleFromSql(sql) {
  const out = {};
  for (const m of String(sql || "").matchAll(
      /INSERT INTO hl_schedule \(day, board_id\) VALUES \('([^']+)', ?'([^']+)'\);/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

/* And what each board WAS, compared as the whole emitted row minus its
   updated_at — which moves on every run and would make every board look
   changed. Comparing the row rather than parsing the payload out of it avoids
   unquoting SQL, and the row is what actually reaches the database. */
export function boardRowsFromSql(sql) {
  const out = {};
  for (const line of String(sql || "").split(/\r?\n/)) {
    if (line.indexOf("INSERT INTO hl_board ") !== 0) continue;
    const id = (line.match(/VALUES \('([^']+)'/) || [])[1];
    if (id) out[id] = withoutStamp(line);
  }
  return out;
}
function withoutStamp(line) {
  const at = line.lastIndexOf(", '");
  return at === -1 ? line : line.slice(0, at);
}

/* ONE PLACE THAT KNOWS WHAT A BOARD ROW LOOKS LIKE. The writer built this
   string inline, so the guard could only have compared against a second copy
   of the same formatting — and two copies of a row format is two answers about
   whether a board changed. */
const sqlQ = (x) => "'" + String(x).replace(/'/g, "''") + "'";
export function boardRow(b, stamp) {
  const club = clubOf(b);
  const slug = club ? club.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : null;
  return "INSERT INTO hl_board (id, kind, club, category, subtitle, payload, updated_at) VALUES (" +
    [sqlQ(b.id), sqlQ(club ? "club" : "daily"), slug ? sqlQ(slug) : "NULL",
     sqlQ(b.category), sqlQ(b.subtitle), sqlQ(JSON.stringify(b)), sqlQ(stamp)].join(", ") + ");";
}
/* Every day at or before `today` that this run would change. Both questions,
   reported separately because they have different causes and different fixes. */
export function servedClash(prevSchedule, prevRows, nextSchedule, nextRows, today) {
  const clashes = [];
  const days = new Set([
    ...Object.keys(prevSchedule || {}),
    ...Object.keys(nextSchedule || {}),
  ]);
  for (const day of [...days].sort()) {
    if (day > today) continue;
    const was = (prevSchedule || {})[day] || null;
    const now = (nextSchedule || {})[day] || null;
    if (!was) continue;                 // never served from here; nothing to keep
    if (String(was) !== String(now)) {
      clashes.push({ day, why: `board ${was} -> ${now || "no board at all"}` });
      continue;
    }
    /* SAME ID, AND THAT IS NOT THE END OF IT. */
    const before = (prevRows || {})[String(was)];
    const after = (nextRows || {})[String(was)];
    if (before === undefined || after === undefined) continue;
    if (before !== after) clashes.push({ day, why: `board ${was} kept its place but its content changed` });
  }
  return clashes;
}

/* ---- the calendar's own rules ---- */
function gateSchedule(boards, schedule) {
  const p = [];
  const byId = new Map(boards.map((b) => [String(b.id), b]));
  const seenIds = new Set();
  for (const day of Object.keys(schedule)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) p.push(`calendar: ${day} is not a day`);
    const id = schedule[day];
    const b = byId.get(id);
    if (!b) { p.push(`calendar: ${day} names board ${id}, which is not in the bank`); continue; }
    if (isClub(b)) p.push(`calendar: ${day} names a club board (${b.category}) — club boards are never dailies`);
    if (seenIds.has(id)) p.push(`calendar: board ${id} is scheduled twice`);
    seenIds.add(id);
  }
  return p;
}

/* ---- the sample: three real boards that travel with the repository ---- */
function sampleOf(boards, schedule) {
  const days = Object.keys(schedule).sort();
  const picks = [];
  for (const d of days.slice(0, 2)) picks.push(boards.find((b) => String(b.id) === schedule[d]));
  const club = boards.find((b) => isClub(b));
  if (club) picks.push(club);
  const sampleSchedule = {};
  for (const d of days.slice(0, 2)) sampleSchedule[d] = schedule[d];
  return { boards: picks.filter(Boolean), schedule: sampleSchedule };
}

function sampleModule(sample) {
  return `/* hl-sample.js — GENERATED by tools/import_hilo.js. Do not edit.
 *
 * Three real boards and the two calendar days they stand on: what the Worker
 * falls back to with no database bound, and what the suites play. The bank
 * lives outside the repository; this is a sample of it, and small on purpose
 * so committing the bank by accident would show in a diff. */
export const HL_SAMPLE_BOARDS = ${JSON.stringify(sample.boards, null, 1)};
export const HL_SAMPLE_SCHEDULE = ${JSON.stringify(sample.schedule, null, 1)};
`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

function main() {
  if (!fs.existsSync(path.join(SOURCE, "boards-index.json"))) {
    if (CHECK_ONLY && fs.existsSync(SAMPLE)) {
      /* No bank on this machine (CI, a fresh clone): gate the committed
         sample itself, so --check is never a silent pass. */
      import(`file://${SAMPLE.split(path.sep).join("/")}`).then((m) => {
        let refused = 0;
        for (const b of m.HL_SAMPLE_BOARDS) {
          const p = gate(b);
          if (p.length) { refused++; console.error(`REFUSED sample board ${b.id}: ${p[0]}`); }
        }
        const sp = gateSchedule(m.HL_SAMPLE_BOARDS, m.HL_SAMPLE_SCHEDULE);
        sp.forEach((x) => { refused++; console.error("REFUSED " + x); });
        console.log(`${m.HL_SAMPLE_BOARDS.length} sample board(s) gated, no bank on this machine`);
        process.exit(refused ? 1 : 0);
      });
      return;
    }
    console.error(`REFUSED: no board sources at ${SOURCE}. Pass --source <dir>.`);
    process.exit(1);
  }
  const { boards, schedule } = loadSource();
  let refused = 0;
  const ids = new Set();
  for (const b of boards) {
    const p = gate(b);
    if (ids.has(String(b.id))) p.push("duplicate id");
    ids.add(String(b.id));
    if (p.length) { refused++; console.error(`REFUSED board ${b.id} (${b.category}):\n  x ${p.join("\n  x ")}`); }
  }
  for (const x of gateSchedule(boards, schedule)) { refused++; console.error("REFUSED " + x); }
  const dailies = boards.filter((b) => !isClub(b)), clubs = boards.filter(isClub);
  const scheduled = new Set(Object.values(schedule));
  const unscheduled = dailies.filter((b) => !scheduled.has(String(b.id)));
  if (unscheduled.length) console.log(`note: ${unscheduled.length} daily board(s) are not on the calendar and will not be played until they are`);
  if (refused) { console.error(`\n${refused} refusal(s). Nothing written.`); process.exit(1); }

  /* ---- AND NOTHING THAT HAS ALREADY BEEN PLAYED MAY MOVE ----------------
     Asked in --check as well as on a write, because the whole point is to
     find out BEFORE the command that touches production. */
  {
    const today = new Date().toISOString().slice(0, 10);   // UTC, read NOW
    const prevSql = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;
    const prevSchedule = scheduleFromSql(prevSql);
    const pastDays = Object.keys(schedule).filter((d) => d <= today);

    if (prevSql === null && pastDays.length && !process.argv.includes("--first-import")) {
      console.error(`REFUSED: this calendar covers ${pastDays.length} day(s) at or before ${today} ` +
        "and there is no previous calendar to check them against.");
      console.error(`  ${OUT} is missing, so what those days already served cannot be known,`);
      console.error("  and this import DELETEs every board and every day before rewriting them.");
      console.error("  If this really is the first import, pass --first-import.");
      process.exit(1);
    }

    const nextRows = {};
    for (const b of boards) nextRows[String(b.id)] = boardRow(b, "").slice(0, boardRow(b, "").lastIndexOf(", '"));
    const prevRows = boardRowsFromSql(prevSql);
    const clashes = servedClash(prevSchedule, prevRows, schedule, nextRows, today);
    if (clashes.length && !process.argv.includes("--rewrite-history")) {
      console.error(`REFUSED: this would change ${clashes.length} day(s) that have already been played.`);
      for (const c of clashes.slice(0, 8)) console.error(`  x ${c.day}: ${c.why}`);
      if (clashes.length > 8) console.error(`  x ...and ${clashes.length - 8} more`);
      console.error("");
      console.error("A day that has run is somebody's result. To change only the FUTURE,");
      console.error("rebuild the source calendar from tomorrow and leave the served days alone.");
      console.error("If you really mean to rewrite what people have played: --rewrite-history");
      process.exit(1);
    }
    console.log(`served days checked: ${pastDays.length} at or before ${today}, none moved`);
  }

  const sample = sampleOf(boards, schedule);
  const moduleText = sampleModule(sample);
  if (CHECK_ONLY) {
    const have = fs.existsSync(SAMPLE) ? fs.readFileSync(SAMPLE, "utf8") : "";
    if (have !== moduleText) {
      console.error("REFUSED: functions/_lib/hl-sample.js is not what the sources produce. Run node tools/import_hilo.js");
      process.exit(1);
    }
    console.log(`${boards.length} boards gated (${dailies.length} daily, ${clubs.length} club), ${Object.keys(schedule).length} days; sample matches`);
    process.exit(0);
  }

  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const now = new Date().toISOString();
  const lines = [
    "-- GENERATED by tools/import_hilo.js — do not edit.",
    "-- Contains every value and every source on every board. Gitignored.",
    "-- Apply migration 027-hilo.sql first.",
    "",
    "DELETE FROM hl_board;",
    "DELETE FROM hl_schedule;",
    "",
  ];
  for (const b of boards) lines.push(boardRow(b, now));
  for (const day of Object.keys(schedule).sort()) {
    lines.push(`INSERT INTO hl_schedule (day, board_id) VALUES (${q(day)}, ${q(schedule[day])});`);
  }
  lines.push("");
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n"));
  fs.writeFileSync(SAMPLE, moduleText);
  console.log(`${boards.length} boards (${dailies.length} daily, ${clubs.length} club), ${Object.keys(schedule).length} days -> data/hl-production.sql`);
  console.log(`sample: ${sample.boards.map((b) => b.id).join(", ")} -> functions/_lib/hl-sample.js`);
  console.log("\nApply with:\n  npx wrangler d1 execute crosswordxi --remote --file=data/migrations/027-hilo.sql");
  console.log("  npx wrangler d1 execute crosswordxi --remote --file=data/hl-production.sql\n");
}
