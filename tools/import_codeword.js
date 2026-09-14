/* tools/import_codeword.js — Codeword XI's queue into D1.
 *
 *   node tools/import_codeword.js --source <drop dir>
 *   node tools/import_codeword.js --source <drop dir> --verify-staged
 *
 * Reads a staged package, gates it WHOLE, and writes data/cw-production.sql.
 * It never touches D1 itself; a human runs the wrangler execute.
 *
 * BUILT AGAINST drop/CONTRACT.md, NOT AGAINST A SNAPSHOT OF THE FILES. That is
 * the producing side's own instruction and it earned it: adding one constant to
 * their page broke ten of twelve of their loader checks at once, because that
 * harness lifts real functions out of the page rather than testing a copy of
 * them. Every refusal below is numbered against section 5 of that contract so
 * the two can be read side by side, and 9.3's freeze rule is the ninth.
 *
 * THE SOURCE FOLDER IS IMPORTER INPUT AND MUST NEVER BE SERVED. Every board
 * file carries the filled grid, all eleven answers and the whole cipher, and
 * the package holds a year of them. Anyone could have fetched daily/0200.json
 * and read the solution to April 2027; the producing session confirmed it by
 * doing it. This tool exists so that year lands in D1 and the route serves one
 * board by the server's clock instead.
 *
 * REFUSALS ARE WHOLE-IMPORT, NEVER PER-ROW. A partial queue is worse than no
 * queue: the gap shows on the day it is served and not before, to a player,
 * with nobody watching.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.findIndex((a) => a === name || a.startsWith(name + "="));
  if (i === -1) return null;
  const a = argv[i];
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[i + 1] || null;
};
/* SOURCE_GIVEN, the same guard import_ballpark.js carries. A --source pointing
   somewhere wrong must REFUSE rather than fall back to a sample: two games lost
   hours on 13 September to a fallback that gated a different bank and reported
   a clean pass. */
const SOURCE_GIVEN = argv.some((a) => a === "--source" || a.startsWith("--source="));
const SOURCE = argOf("--source");
const VERIFY_STAGED = argv.includes("--verify-staged");
const OUT = path.join(process.cwd(), "data", "cw-production.sql");

/* THE EPOCH IS READ FROM THE PACKAGE, NEVER HELD HERE.
 *
 * The first version of this file hardcoded Date.UTC(2026, 8, 14) because
 * CONTRACT.md section 3 said so. Within the hour the package was restaged with
 * epoch 2026-09-13 and the whole queue moved a day: every board's date changed,
 * the contract changed, INDEX.json changed, and a constant copied out of a
 * document would have refused all 365 boards while being the only thing in the
 * world that was wrong. That is this project's oldest fault — one fact in two
 * places — reaching across a repository boundary, where it is worse, because
 * the other copy can move without anything here being touched.
 *
 * So the calendar is DERIVED and then CORROBORATED. INDEX.json declares the
 * epoch; manifest.json declares it independently, having been written by a
 * different step of their build; the two must agree or the package is refused.
 * Two generated artefacts agreeing is evidence. A document agreeing with itself
 * is not.
 *
 * COUNTED IN UTC, which is the one part that is not negotiable and not derived.
 * The same arithmetic in local time moves the boundary for everyone ahead of
 * UTC — the bug the crossword shipped once, and the reason this id scheme
 * exists at all. */
const DAY_MS = 86400000;

export function epochOf(index, manifest) {
  const a = index && index.dates && index.dates.epoch;
  const b = manifest && manifest.epoch;
  if (!a) throw new Error("INDEX.json declares no dates.epoch");
  if (b && b !== a) {
    throw new Error(`INDEX.json says epoch ${a}, manifest.json says ${b}`);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(a));
  if (!m) throw new Error(`epoch ${a} is not YYYY-MM-DD`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export const dayForNo = (epochUtc, no) =>
  new Date(epochUtc + no * DAY_MS).toISOString().slice(0, 10);

/* Today's ordinal, by the SAME arithmetic against the SAME epoch. Contract
   9.3's one condition on the freeze rule. */
export const ordinalToday = (epochUtc, now = Date.now()) => {
  const d = new Date(now);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((midnight - epochUtc) / DAY_MS);
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/* Read an answer off the grid at its stated position and direction, so
   refusal 7 EXECUTES rather than trusting the file's own word for it. */
export function readsOff(rows, answer, r, c, dir) {
  const n = String(answer || "").length;
  if (!n || !Number.isInteger(r) || !Number.isInteger(c)) return null;
  let got = "";
  for (let i = 0; i < n; i++) {
    const rr = dir === "d" ? r + i : r;
    const cc = dir === "d" ? c : c + i;
    if (rr < 0 || cc < 0 || rr >= rows.length) return null;
    const row = rows[rr];
    if (typeof row !== "string" || cc >= row.length) return null;
    got += row[cc];
  }
  return got;
}

/* Every refusal in contract section 5, numbered as it is numbered there. A
   board is checked WHOLE and all its faults reported — stopping at the first
   would make a bad package take nine runs to fix. */
export function gateBoard(board, { digest, expectDigest, epochUtc } = {}) {
  const found = [];
  const bad = (m) => found.push(m);
  const at = `board ${board && board.no !== undefined ? board.no : "?"}`;

  if (!board || !Number.isInteger(board.no) || board.no < 1) {
    bad(`${at}: no must be a positive integer`);
    return found;
  }

  /* (2) a date that disagrees with its id, under UTC arithmetic */
  const want = dayForNo(epochUtc, board.no);
  if (board.date !== want) bad(`${at}: date ${board.date} but id ${board.no} is ${want}`);

  /* (6) the grid is size x size and holds only A-Z and a block */
  const size = board.size;
  const rows = board.rows;
  let gridOk = false;
  if (!Number.isInteger(size) || size < 1) {
    bad(`${at}: size is not a positive integer`);
  } else if (!Array.isArray(rows) || rows.length !== size) {
    bad(`${at}: ${Array.isArray(rows) ? rows.length : "no"} rows, expected ${size}`);
  } else {
    gridOk = true;
    for (const [i, row] of rows.entries()) {
      if (typeof row !== "string" || row.length !== size) {
        gridOk = false;
        bad(`${at}: row ${i + 1} is ${typeof row === "string" ? row.length : "not a string"}, expected ${size}`);
      } else if (/[^A-Z.]/.test(row)) {
        bad(`${at}: row ${i + 1} holds something other than A-Z and a block`);
      }
    }
  }

  /* (5) the cipher is a bijection of A-Z onto 1..26. A repeated number does not
     make the puzzle harder, it makes it unsolvable. */
  const code = board.code || {};
  if (Object.keys(code).length !== 26 || !LETTERS.every((L) => Number.isInteger(code[L]))) {
    bad(`${at}: code must map all 26 letters to integers, has ${Object.keys(code).length}`);
  } else {
    const nums = LETTERS.map((L) => code[L]);
    if (new Set(nums).size !== 26) bad(`${at}: code repeats a number, so the grid cannot be solved`);
    else if (nums.some((n) => n < 1 || n > 26)) bad(`${at}: code uses a number outside 1..26`);
  }

  /* (3) hints and breaks are per-entry and in the SAME ORDER as words */
  const words = Array.isArray(board.words) ? board.words : null;
  if (!words) {
    bad(`${at}: words is not an array`);
  } else {
    for (const k of ["hints", "breaks"]) {
      const v = board[k];
      if (!Array.isArray(v) || v.length !== words.length) {
        bad(`${at}: ${Array.isArray(v) ? v.length : "no"} ${k} for ${words.length} words`);
      }
    }
    /* (7) every answer reads off the grid where it says it does */
    if (gridOk) {
      for (const w of words) {
        if (!Array.isArray(w) || w.length < 4) { bad(`${at}: a word entry is malformed`); continue; }
        const [answer, r, c, dir] = w;
        if (dir !== "a" && dir !== "d") { bad(`${at}: ${answer} has direction ${dir}`); continue; }
        const got = readsOff(rows, answer, r, c, dir);
        if (got === null) bad(`${at}: ${answer} runs off the grid at ${r},${c}${dir}`);
        else if (got !== String(answer).toUpperCase()) {
          bad(`${at}: ${answer} does not read off the grid at ${r},${c}${dir} — found ${got}`);
        }
      }
    }
  }

  /* (4) exactly three givens, each a letter that is actually in the grid */
  const given = board.given;
  if (!Array.isArray(given) || given.length !== 3) {
    bad(`${at}: ${Array.isArray(given) ? given.length : "no"} given letters, expected 3`);
  } else if (gridOk) {
    const inGrid = new Set(rows.join("").split(""));
    for (const g of given) {
      if (typeof g !== "string" || !/^[A-Z]$/.test(g)) bad(`${at}: given "${g}" is not a letter`);
      else if (!inGrid.has(g)) bad(`${at}: given ${g} does not appear in the grid`);
    }
  }

  /* (8) the file is the file that was staged */
  if (expectDigest && digest && digest !== expectDigest) {
    bad(`${at}: digest ${digest} but INDEX.json staged ${expectDigest}`);
  }
  return found;
}

/* ------------------------------------------------------------ the read --- */

export function readPackage(dir) {
  const daily = path.join(dir, "daily");
  const indexPath = path.join(dir, "INDEX.json");
  if (!fs.existsSync(indexPath)) throw new Error(`no INDEX.json at ${dir}`);
  if (!fs.existsSync(daily)) throw new Error(`no daily/ at ${dir}`);
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  /* manifest.json is written by a different step of their build than
     INDEX.json, which is what makes it worth reading: two generated artefacts
     agreeing about the epoch is corroboration, where a document agreeing with
     itself is not. The contract says an importer does not need it — it does not
     need it to IMPORT, but it needs it to be sure. */
  const manPath = path.join(daily, "manifest.json");
  const manifest = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, "utf8")) : null;
  const names = fs.readdirSync(daily).filter((f) => /^\d{4}\.json$/.test(f)).sort();
  const boards = [];
  for (const name of names) {
    const raw = fs.readFileSync(path.join(daily, name));
    const digest = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
    boards.push({ name, digest, board: JSON.parse(raw) });
  }
  return { index, manifest, boards };
}

/* The digest table, whatever shape its keys take. Looked up by SUFFIX as well
   as exactly, because a producing side is free to rename its keys and a lookup
   that silently missed would turn every digest check into a skip. That exact
   failure — a check keyed on a field that was not there — has been found five
   times in the Ballpark repo and twice in this one today. */
export function digestFor(index, name) {
  const table = (index && index.sha256_16) || {};
  if (Object.prototype.hasOwnProperty.call(table, name)) return table[name];
  const key = Object.keys(table).find((k) => k === name || k.endsWith("/" + name) || k.endsWith("\\" + name));
  return key === undefined ? null : table[key];
}

/* meta is build noise — the contract calls it deliberately unstable — so it is
   stripped before anything is stored or hashed. An import must never fail
   because a seed or a timing changed. */
export function payloadOf(board) {
  const { meta, ...rest } = board || {};
  return rest;
}
/* Key order must not decide a digest: two readers of one board would otherwise
   disagree about whether it had changed. */
export function stableJson(v) {
  if (Array.isArray(v)) return "[" + v.map(stableJson).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stableJson(v[k])).join(",") + "}";
  }
  return JSON.stringify(v === undefined ? null : v);
}
export function payloadDigest(board) {
  return crypto.createHash("sha256").update(stableJson(payloadOf(board))).digest("hex").slice(0, 16);
}

/* ------------------------------------------------------------- the gate --- */

export function gatePackage({ index, manifest, boards }, { now = Date.now(), live = null } = {}) {
  const out = [];
  const say = (m) => out.push(m);

  if (!boards || !boards.length) { say("the package holds no board files"); return out; }

  /* THE CALENDAR FIRST, because every date check below depends on it and a
     wrong epoch reports 365 faults that are all one fault wearing 365 hats. */
  let epochUtc;
  try { epochUtc = epochOf(index, manifest); }
  catch (e) { say(e.message); return out; }

  /* THE COUNT COMES FROM THE PACKAGE, not from anyone's message — the contract
     says so about its own author's messages too. */
  const claimed = index && index.counts && index.counts.boards;
  if (Number.isInteger(claimed) && claimed !== boards.length) {
    say(`INDEX.json claims ${claimed} boards, ${boards.length} files are here`);
  }

  /* A MISSING DIGEST TABLE IS A REFUSAL, NOT A SKIP. A package whose files
     cannot be proved to be the staged ones is the case refusal 8 exists for,
     and "the table was absent so nothing was checked" passes every single time
     — a check that cannot fail is not a weaker check, it is not a check. */
  const withDigest = boards.filter((b) => digestFor(index, b.name) !== null).length;
  if (withDigest !== boards.length) {
    say(`INDEX.json carries a digest for ${withDigest} of ${boards.length} board files`);
  }

  for (const { name, digest, board } of boards) {
    for (const m of gateBoard(board, { digest, expectDigest: digestFor(index, name), epochUtc })) say(m);
  }

  /* (1) the ids are contiguous from 1. A gap is a day with no game. */
  const nos = boards.map((b) => b.board && b.board.no).filter(Number.isInteger).sort((a, b) => a - b);
  if (nos.length) {
    const seen = new Set(nos);
    if (seen.size !== nos.length) say("the queue holds a duplicate id");
    if (nos[0] !== 1) say(`the queue starts at id ${nos[0]}, not 1`);
    const missing = [];
    for (let i = 1; i <= nos[nos.length - 1]; i++) if (!seen.has(i)) missing.push(i);
    if (missing.length) say(`${missing.length} id(s) missing from the queue, first ${missing[0]}`);
  }

  /* (9) CONTRACT 9.3 — A PUBLISHED BOARD IS FROZEN. The producing side's own
     guard protects its files and cannot protect D1: an importer run against an
     older package would cheerfully rewrite rows a player has already been
     served. Refuse any CHANGE at or below today's ordinal; inserting a future
     board is fine, and so is a board D1 has never held.
     `live` is a Map of no -> payload digest as D1 holds it. It is null when
     nobody has captured one, and then this says so rather than passing quietly,
     because a freeze check with nothing to compare against cannot refuse. */
  const todayNo = ordinalToday(epochUtc, now);
  if (live) {
    for (const { board } of boards) {
      if (!board || !Number.isInteger(board.no) || board.no > todayNo) continue;
      const was = live.get(board.no);
      if (was === undefined) continue;          // D1 has never held it: an insert
      if (was !== payloadDigest(board)) {
        say(`board ${board.no} is at or below today's ordinal ${todayNo} and its payload has changed`);
      }
    }
  }
  return out;
}

/* ----------------------------------------------------------- the write --- */

const sq = (v) => "'" + String(v).replace(/'/g, "''") + "'";

export function sqlFor(boards, stamp, epochUtc, staged) {
  const lines = [];
  const first = boards[0].board.no, last = boards[boards.length - 1].board.no;
  lines.push("-- Codeword XI — generated by tools/import_codeword.js. Do not hand-edit.");
  lines.push(`-- ${boards.length} boards, ids ${first}..${last}, ` +
    `${dayForNo(epochUtc, first)} to ${dayForNo(epochUtc, last)}.`);
  /* WHICH PACKAGE THIS CAME FROM, in the file rather than in somebody's memory.
     That package was restaged mid-build once already and the whole queue moved
     a day; a generated file that cannot say which staging it read is a file
     nobody can check afterwards. */
  lines.push(`-- Staged: ${staged || "the package declared no staging stamp"}`);
  lines.push("--");
  lines.push("-- The schedule is rewritten whole and the boards are written BY ID, so");
  lines.push("-- re-running this leaves the same number of rows rather than doubling them.");
  lines.push("");
  lines.push("DELETE FROM cw_schedule;");
  for (const { board } of boards) {
    lines.push("INSERT OR REPLACE INTO cw_board (no, day, payload, updated_at) VALUES " +
      `(${board.no}, ${sq(dayForNo(epochUtc, board.no))}, ` +
      `${sq(JSON.stringify(payloadOf(board)))}, ${sq(stamp)});`);
  }
  for (const { board } of boards) {
    lines.push(`INSERT INTO cw_schedule (day, board_no) VALUES ` +
      `(${sq(dayForNo(epochUtc, board.no))}, ${board.no});`);
  }
  return lines.join("\n") + "\n";
}

/* ------------------------------------------------------------- the CLI --- */

function main() {
  if (!SOURCE_GIVEN || !SOURCE) {
    console.error("\nUsage: node tools/import_codeword.js --source <drop dir> [--verify-staged]\n" +
      "The package is not in this repository and there is NO fallback: a source\n" +
      "that points somewhere wrong must refuse, not gate something else.\n");
    process.exit(1);
  }
  let pkg;
  try { pkg = readPackage(SOURCE); }
  catch (e) { console.error(`\nREFUSED: ${e.message}\n`); process.exit(1); }

  const faults = gatePackage(pkg, { now: Date.now() });
  if (faults.length) {
    console.error(`\nNothing written. ${faults.length} problem(s):\n`);
    for (const f of faults.slice(0, 40)) console.error("  - " + f);
    if (faults.length > 40) console.error(`  ... and ${faults.length - 40} more`);
    process.exit(1);
  }

  const epochUtc = epochOf(pkg.index, pkg.manifest);
  const first = pkg.boards[0].board.no, last = pkg.boards[pkg.boards.length - 1].board.no;
  const staged = pkg.index && pkg.index.staged;
  console.log(`\n${pkg.boards.length} boards gated, ids ${first}..${last}, ` +
    `${dayForNo(epochUtc, first)} to ${dayForNo(epochUtc, last)}.`);
  console.log(`Epoch ${new Date(epochUtc).toISOString().slice(0, 10)}, read from the package ` +
    `and agreed by manifest.json.`);
  console.log(`Staged ${staged || "(no stamp)"}.`);
  console.log(`Today is ordinal ${ordinalToday(epochUtc)}; boards at or below it are frozen.`);

  if (VERIFY_STAGED) {
    console.log("\n--verify-staged: gate only, nothing written.\n");
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, sqlFor(pkg.boards, new Date().toISOString(), epochUtc, staged));
  console.log(`\nWrote ${OUT}`);
  console.log("Apply it with wrangler; this tool does not touch D1.\n");
}

/* Run only when run, so a suite can import the rules without the program
   running and exiting under it. */
const invoked = process.argv[1] ? path.basename(process.argv[1]) : "";
if (invoked === "import_codeword.js") main();
