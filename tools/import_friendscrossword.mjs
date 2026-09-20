#!/usr/bin/env node
/* tools/import_friendscrossword.mjs — the Friends crossword's boards, from the
 * bank into D1.
 *
 *   node tools/import_friendscrossword.mjs            gate, write data/fr-production.sql
 *   node tools/import_friendscrossword.mjs --check    gate only, write nothing
 *   node tools/import_friendscrossword.mjs --source <dir>
 *
 * THE BANK IS NOT IN THIS REPOSITORY and must never be. 3,053 validated clues
 * live in ..\Other\FriendsCrosswordXI\work\handover, the SQL this writes is
 * gitignored, and D1 is the authoritative copy — the arrangement the crossword,
 * the word search, HiLo and Grid all keep.
 *
 * WHAT THE BANK HANDS OVER, and why this can be so short. Two files:
 *
 *   data.json                      3,053 clue rows
 *   rehearsal-manifest-...json     120 boards, each 11 clue ids and a SEED
 *
 * The manifest does not contain a single grid. It contains the INPUTS to one,
 * because the bank session rehearsed its boards against this repository's own
 * football/crossword/js/engine.js — byte-identical, commit c2c8ffce. So a board
 * is not copied here, it is REGENERATED, and generating it again from the same
 * seed is what proves the two sides still agree. A manifest that recorded
 * finished grids would have hidden the day the engine changed under it.
 *
 * WHY THIS GATES AT ALL, when the bank gated first. Same reason Grid's importer
 * does: two questions at two boundaries. The bank asks "is this a good clue" —
 * sourced, quote-matched, read. This asks "is this safe to put in production",
 * which includes a question the bank cannot ask, because it does not own the
 * serving code: does the PUBLIC PROJECTION THIS REPOSITORY WILL SERVE carry an
 * answer? That is checked by running functions/_lib/puzzle.js publicPuzzle()
 * over every generated board, not by reading it.
 *
 * AND THAT QUESTION IS SHARPER HERE THAN ANYWHERE. Every Friends row carries a
 * sourceQuote, the sentence its answer was verified against, and the bank's
 * loader REFUSES any row whose answer is not literally in that sentence. So the
 * quote contains the answer in 3,028 of 3,053 rows as a whole word and 3,035
 * letters-only. There is no safe subset. If a quote ever reached a browser, 99%
 * of boards would arrive solved.
 *
 * THE CLUE IS THE ONE PLACE AN ANSWER MAY APPEAR, and the check says so rather
 * than failing on it. Three clues of 3,053 contain their own answer as letters:
 * BTS0173 (MONKEY, "two monkeys"), QUO0071 (MONICA, quoting her), EVT0509
 * (HANDLER, inside "Chandler"). All three are legitimate and all three would
 * trip a naive "the answer appears nowhere" scan. So the scan reads the public
 * row with `clue` REMOVED: the clue is public by definition, everything else
 * must be free of the answer.
 *
 * AND THE SCAN PAIRS BY CLUE ID, NEVER BY ARRAY POSITION. The engine returns
 * entries in GRID order, not in the order it was handed the rows, so walking
 * the two lists together compares each answer with somebody else's entry. That
 * mistake refused eight good boards here before it was caught, and the reason
 * it is called out this high up is that it fails in both directions: it can
 * miss the leak it exists to find. See the comment at the scan itself.
 *
 * PROVEN TO FAIL, 20 September 2026, by sabotaging the real publicPuzzle() and
 * watching this refuse — seven ways, each restored and each confirmed restored
 * by git before the next. The split matters more than the count:
 *
 *   answer / sourceQuote / grid / notes copied into the served row
 *        -> caught by the ALLOWLIST, on the key name, before content is read.
 *   answer written into `era`, source quote written into `cat`
 *        -> allowlist sees nothing wrong; caught by the BYTE SCAN.
 *   the clue id corrupted so no bank row resolves
 *        -> caught by the pairing guard, rather than scanning an empty answer.
 *
 * The first four alone would have been a bad proof. They all fire on the same
 * half of the check, so a byte scan that did nothing at all would have passed
 * that set — the failure this project keeps finding, where the evidence never
 * touches the thing being trusted. Sabotages 5 and 6 exist to reach the other
 * half, and 7 to reach the guard that makes the other two meaningful.
 * (6 reports "carries its answer" rather than the quote: correct, since the
 * quote contains the answer in 3,035 of 3,053 rows. It is the same leak.)
 *
 * THIS TOOL IS NOT IN checks.yml AND MUST NOT BE. It cannot run without the
 * bank, and no CI runner has one — the same reason import_quickfire.js and the
 * other bank-fed importers stay out. Putting it in the workflow would buy a
 * check that fails on every runner, and the cure for that is always to make it
 * pass vacuously.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { publicPuzzle } from "../functions/_lib/puzzle.js";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FCW = require(path.join(ROOT, "football/crossword/js/engine.js"));

const CHECK_ONLY = process.argv.includes("--check");
const arg = (name) => {
  const i = process.argv.indexOf("--" + name);
  if (i > -1 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith("--" + name + "="));
  return eq ? eq.slice(name.length + 3) : null;
};
const SOURCE = arg("source") ||
  path.join(ROOT, "..", "Other", "FriendsCrosswordXI", "work", "handover");
const OUT = arg("out") || path.join(ROOT, "data", "fr-production.sql");

const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

let refused = 0;
const refuse = (msg) => { console.error("REFUSED: " + msg); refused++; };

/* ---- the two files the bank hands over --------------------------------- */

if (!fs.existsSync(SOURCE)) {
  console.error(`REFUSED: no bank at ${SOURCE}. Pass --source <dir>.`);
  process.exit(1);
}
const dataPath = path.join(SOURCE, "data.json");
const manifestPath = fs.readdirSync(SOURCE)
  .filter((f) => /^rehearsal-manifest.*\.json$/.test(f))
  .sort().map((f) => path.join(SOURCE, f)).pop();

/* ABSENT INPUT MUST NOT PASS. A missing file here would otherwise produce a
   run that refuses nothing, writes an empty calendar and reports success —
   which is the shape of a check that passes because it found nothing. */
if (!fs.existsSync(dataPath)) {
  console.error(`REFUSED: no data.json at ${SOURCE}.`);
  process.exit(1);
}
if (!manifestPath) {
  console.error(`REFUSED: no rehearsal-manifest-*.json at ${SOURCE}.`);
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const byId = new Map(rows.map((r) => [r.id, r]));

if (!Array.isArray(rows) || rows.length === 0) {
  console.error("REFUSED: data.json holds no rows."); process.exit(1);
}
if (!Array.isArray(manifest) || manifest.length === 0) {
  console.error("REFUSED: the manifest holds no boards."); process.exit(1);
}

console.log(`bank     ${rows.length} clues from ${path.basename(dataPath)}`);
console.log(`manifest ${manifest.length} boards from ${path.basename(manifestPath)}`);
console.log("");

/* ---- one board ---------------------------------------------------------- */

function buildBoard(entry) {
  const no = entry.boardNo;
  const where = `board ${no}`;

  if (!entry.ready) return refuse(`${where}: the manifest says it is not ready`);
  if (!Array.isArray(entry.clueIds) || entry.clueIds.length !== 11) {
    return refuse(`${where}: ${(entry.clueIds || []).length} clue ids, expected 11`);
  }
  if (new Set(entry.clueIds).size !== entry.clueIds.length) {
    return refuse(`${where}: the same clue id twice`);
  }

  const picked = [];
  for (const id of entry.clueIds) {
    const row = byId.get(id);
    if (!row) return refuse(`${where}: clue id ${id} is not in the bank`);
    picked.push(row);
  }

  /* THE SEED IS THE AGREEMENT. Same engine, same rows, same seed, same board —
     so a size that no longer matches the rehearsal means the engine has moved
     under the bank, and that is a stop rather than a warning. */
  let puzzle;
  try {
    puzzle = FCW.generate(picked, { seed: entry.seed });
  } catch (e) {
    return refuse(`${where}: the engine threw — ${String(e).split("\n")[0]}`);
  }
  if (!puzzle) return refuse(`${where}: the engine produced nothing`);

  const size = `${puzzle.width}x${puzzle.height}`;
  if (entry.size && size !== entry.size) {
    return refuse(`${where}: generated ${size}, the rehearsal recorded ${entry.size} — ` +
      `the engine and the bank no longer agree`);
  }

  const faults = FCW.validatePuzzle ? FCW.validatePuzzle(puzzle) : [];
  if (faults && faults.length) {
    return refuse(`${where}: ${faults.length} fault(s) — ${JSON.stringify(faults[0])}`);
  }
  if (!Array.isArray(puzzle.entries) || puzzle.entries.length !== 11) {
    return refuse(`${where}: ${(puzzle.entries || []).length} entries, expected 11`);
  }

  /* ---- the question the bank could not ask ----------------------------- */

  const pub = publicPuzzle(puzzle);

  /* THE ALLOWLIST, ASSERTED RATHER THAN TRUSTED. publicPuzzle rebuilds a row
     from named fields, so a new field on a clue cannot leak by being forgotten
     — but only while it keeps doing that. Pinned here so a future edit that
     turns it into a delete-list is refused at the boundary. */
  const allowed = ["id", "clue", "enum", "breaks", "cat", "era", "diff"];
  for (const e of pub.entries) {
    const keys = Object.keys(e.row).sort();
    const extra = keys.filter((k) => !allowed.includes(k));
    if (extra.length) {
      return refuse(`${where}: the public row carries ${extra.join(", ")}`);
    }
  }
  for (const k of Object.keys(pub.cells)) {
    if ("ch" in pub.cells[k]) {
      return refuse(`${where}: a public cell carries its solution letter`);
    }
  }

  /* AND THE SAME QUESTION ASKED OF THE BYTES. The allowlist above is a claim
     about shape; this is a claim about content, and they fail differently — a
     field rewritten to include an answer would pass the first and fail this.

     PAIRED BY ID, NEVER BY POSITION, and that is the whole reason this comment
     is long. The first version of this walked `picked[i]` against
     `pub.entries[i]`, which looks obviously right and is obviously wrong: the
     engine LAYS OUT a board, so it returns entries in grid order, not in the
     order the clues were handed to it. Every answer was therefore scanned
     against a different entry's row. It refused eight boards — and the tell was
     that one clue id, EVT0104, was reported three times carrying three
     DIFFERENT clues, which a single bank row cannot do.
     A mispairing does not only invent failures, it hides real ones: comparing
     answer A against entry B can miss answer A sitting in entry A. So this bug
     was a check that both cried wolf and could not see the wolf, and the noise
     was the only reason it was ever looked at. With the pairing fixed the scan
     finds nothing, which is the result that was always true underneath.

     THE CLUE IS EXEMPT, because it is public by definition and three rows of
     3,053 legitimately contain their own answer in it — BTS0173 (MONKEY, "two
     monkeys"), QUO0071 (MONICA, quoting her), EVT0509 (HANDLER, inside
     "Chandler"). MEASURED, not assumed: none of the three is used by the
     current 120 boards, so this exemption protects nothing today. It stays
     because it is a fact about the BANK, and the next manifest may draw one.

     NOTHING ELSE IS EXEMPT. `cat` was exempted for a day on the strength of the
     mispaired run above, which reported the answer "Actor" inside the category
     "Guest Role -> Actor". No bank row does that: zero of 3,053 contain their
     answer in `cat`. An exemption written for a phantom is a hole left open for
     a real one, so it is gone. */
  for (const e of pub.entries) {
    const id = e.row && e.row.id;
    const row = byId.get(id);

    /* ABSENT INPUT MUST NOT PASS. If a public entry named a row this importer
       cannot resolve, every test below would compare against an empty answer
       and pass — a scan that finds nothing because it looked at nothing. The
       generator was handed these rows, so this cannot happen without something
       upstream having changed, and it must stop rather than go quiet. */
    if (!row) {
      refuse(`${where}: public entry ${JSON.stringify(id)} matches no bank row — ` +
        `the leak scan cannot be run against it`);
      return null;
    }

    const answer = norm(row.grid || row.answer);
    const quote = norm(row.sourceQuote).slice(0, 40);

    /* VALUES, NOT THE SERIALISED ENTRY. This normalised JSON.stringify of the
       whole entry, which makes KEY NAMES and geometry into searchable letters —
       and "acROSS" contains ROSS, an answer in 131 bank rows. The route's
       equivalent scan had the same fault and would have refused 24 of the 120
       boards at serve time. Reading each served VALUE on its own removes it:
       a key is never read, and two neighbouring fields are never glued into a
       word that neither of them contains.
       The fields are WALKED rather than listed, so a field added to
       publicPuzzle is scanned without anyone remembering this file. */
    const served = Object.keys(e.row)
      .filter((k) => k !== "clue")   // public by definition; see the header
      .map((k) => norm(JSON.stringify(e.row[k])));

    if (answer && served.some((v) => v.includes(answer))) {
      return refuse(`${where}: the public entry for ${row.id} carries its answer ` +
        `${JSON.stringify(row.answer)}`);
    }
    if (quote && quote.length > 12 && served.some((v) => v.includes(quote))) {
      return refuse(`${where}: the public entry carries the source quote of ${row.id}`);
    }

    /* AND NOT ONE CELL MAY CARRY A LETTER. A value scan can never see this —
       a solution letter is one character — so it is asked separately, once. */
    if (Object.keys(pub.cells).some((k) => pub.cells[k] && "ch" in pub.cells[k])) {
      return refuse(`${where}: the public board carries solution letters`);
    }
  }

  return {
    no,
    clueIds: entry.clueIds,
    size,
    sql: "INSERT OR REPLACE INTO fr_puzzles (mode, daily_no, payload, clue_ids) VALUES (" +
      "'daily', " + no + ", " +
      sqlStr(JSON.stringify({ puzzle })) + ", " +
      sqlStr(JSON.stringify(entry.clueIds)) + ");",
  };
}

/* ---- every board -------------------------------------------------------- */

const built = [];
for (const entry of manifest) {
  const b = buildBoard(entry);
  if (b) built.push(b);
}

if (refused) {
  console.error(`\n${refused} board(s) refused. Nothing written.`);
  process.exit(1);
}

const sizes = {};
for (const b of built) sizes[b.size] = (sizes[b.size] || 0) + 1;
console.log(`${built.length} boards gated, and every one regenerated at the size ` +
  `its rehearsal recorded.`);
console.log("sizes: " + Object.entries(sizes)
  .sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}x${n}`).join("  "));

/* Every clue used, so a reader can see how much of the bank a 120-day run
   spends — and so a board that quietly reused one is visible. */
const used = new Set();
let reused = 0;
for (const b of built) for (const id of b.clueIds) {
  if (used.has(id)) reused++;
  used.add(id);
}
console.log(`clues: ${used.size} distinct of ${rows.length} in the bank` +
  (reused ? `, ${reused} reused across boards` : ", none reused"));


if (CHECK_ONLY) {
  console.log("\n--check: nothing written.");
  process.exit(0);
}

const header = [
  "-- data/fr-production.sql — generated by tools/import_friendscrossword.mjs.",
  "-- THE BANK, AND GITIGNORED. Never commit this file.",
  "-- Apply data/migrations/043-friends-crossword.sql first; it creates fr_puzzles.",
  `-- ${built.length} boards, regenerated from seeds against football/crossword/js/engine.js.`,
  "",
].join("\n");

fs.writeFileSync(OUT, header + built.map((b) => b.sql).join("\n") + "\n");
console.log(`\nwrote ${path.relative(ROOT, OUT)} — ${built.length} boards`);
console.log("apply with: npx wrangler d1 execute crosswordxi --remote --file=" +
  path.relative(ROOT, OUT).replace(/\\/g, "/"));
