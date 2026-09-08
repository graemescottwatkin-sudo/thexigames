/* import_ballpark.js — Ballpark XI's bank, gated and turned into SQL.
 *
 *   node tools/import_ballpark.js --check         gate only, write nothing
 *   node tools/import_ballpark.js                 write data/bp-production.sql
 *   node tools/import_ballpark.js --from=2026-09-14   start the calendar there
 *
 * WHERE THE BANK LIVES: outside this repository, at ..\Other\BallparkXI\boards,
 * because it holds every answer. The same arrangement as the crossword's, the
 * word search's, HiLo's and Grid XI's — banks are gitignored and never
 * committed, and the SQL this writes is gitignored for the same reason.
 *
 * WHAT THIS REFUSES, and why each one is here rather than trusted to the
 * content side's own gate. Their gate is good and it has caught more than mine
 * will; but a bank crosses a boundary here, and the rule this project keeps
 * relearning is that the second door must not inherit the first door's
 * assumptions. Two gates on one silent fault is right when the cost is a
 * scored day.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};
const CHECK_ONLY = process.argv.includes("--check");
const SOURCE = arg("source") || path.join(ROOT, "..", "Other", "BallparkXI", "boards");
const OUT = path.join(ROOT, "data", "bp-production.sql");
const SAMPLE = path.join(ROOT, "functions", "_lib", "bp-sample.js");
const QUESTIONS = 11;

/* The keys a question may carry, and no others. A board that arrived with a
   `score` or a `grade` on it would be the content side computing something this
   game's server is the only thing allowed to compute — so an unknown key is a
   refusal rather than a field to ignore. */
const ALLOWED = new Set(["id", "question", "detail", "answer", "lo", "hi",
  "tolerance", "step", "unit", "kind", "family", "strict"]);
const REQUIRED = ["id", "question", "answer", "lo", "hi", "tolerance", "step"];

function gate(board, seenQuestionIds, warn = []) {
  const p = [];
  const qs = board.questions || [];
  if (!/^bp-\d{4,}$/.test(String(board.id || ""))) p.push(`id ${board.id} is not bp-NNNN`);
  if (qs.length !== QUESTIONS) p.push(`${qs.length} questions, not ${QUESTIONS}`);

  const answers = new Set();
  for (const q of qs) {
    const at = `${q && q.id ? q.id : "a question"}`;
    if (!q || typeof q !== "object") { p.push("a question is not an object"); continue; }
    for (const k of REQUIRED) {
      if (q[k] === undefined || q[k] === null || q[k] === "") p.push(`${at}: no ${k}`);
    }
    for (const k of Object.keys(q)) {
      if (!ALLOWED.has(k)) p.push(`${at}: unknown field ${k} — nothing computed may travel with a board`);
    }
    const a = Number(q.answer), lo = Number(q.lo), hi = Number(q.hi);
    const tol = Number(q.tolerance), step = Number(q.step);
    if (!Number.isFinite(a) || !Number.isFinite(lo) || !Number.isFinite(hi)) {
      p.push(`${at}: answer, lo and hi must be numbers`);
    } else {
      if (lo >= hi) p.push(`${at}: lo ${lo} is not below hi ${hi}`);
      if (a < lo || a > hi) p.push(`${at}: answer ${a} is outside ${lo}..${hi}`);
      /* AN ANSWER ON AN END OF THE SLIDER, and the two ends are NOT the same
         case — which took a round trip with the content side to establish.
         The reason is not that the slider opens on an end. It opens in the
         MIDDLE — slider.value = (lo + hi) / 2 in the reference demo, on show
         and again after a narrow — and this comment said otherwise until it was
         checked on 9 September 2026. A check whose stated reason is false is a
         check the next person cannot maintain.
         `lo` IS A REFUSAL, flat and with no exception for a genuine zero. The
         content side runs two gates of its own: their bank gate ALLOWS an
         answer of zero sitting at a natural floor (nothing goes below nought,
         and the owner likes that shape of question), and their scheduler then
         refuses every answer == lo, zeros included, so no such question can
         reach a board. This is the third check on the same fault, and it is
         flat because a board is what it sees.
         BUT IT IS COUPLED TO THEIR PLACEMENT TABLE, and that is worth saying
         out loud: they derive each slider from a table of 18 placements and
         have REMOVED the 0.00 entry. If it is ever restored, this line refuses
         about one question in eighteen and blocks the whole import. That is the
         correct failure — loud, not silent — but it is a tripwire, not a bug.
         `hi` IS NOT REFUSED AND NOT WARNED PER QUESTION. The 1.00 placement is
         deliberate: 80 of 1,925 answers sit there, 4.2%, against the 5.6% a
         1-in-18 table predicts. Verified here rather than taken on trust — the
         answers fall on 322 distinct fractions of their ranges rather than the
         ~1,900 a free choice would give, 1.00 is the commonest single fraction,
         and 0.00 does not occur. Live ends are deliberate for a good reason: if
         an answer were never at an end, the ends become dead space and the real
         slider is narrower than it looks, which is MORE learnable, not less.
         And it does not pay — dragging fully right is bang-on 4.2% of the time
         and way out 95.8%, averaging 0.97 of 10 against the middle's 2.54. */
      if (a === lo) p.push(at + ": answer " + a + " sits on the slider's bottom end");
    }
    if (!Number.isFinite(tol) || tol <= 0) p.push(`${at}: tolerance must be above zero`);
    if (!Number.isFinite(step) || step <= 0) p.push(`${at}: step must be above zero`);
    if (q.strict !== undefined && q.strict !== true) {
      p.push(`${at}: strict may only be true or absent, not ${JSON.stringify(q.strict)}`);
    }
    /* Two questions on one board with the same answer would let one slider
       position take both. */
    if (answers.has(Number(q.answer))) p.push(`${at}: two questions share the answer ${q.answer}`);
    answers.add(Number(q.answer));
    /* A question used twice in the run is a board somebody has already played,
       arriving again under a different day. */
    if (seenQuestionIds.has(q.id)) p.push(`${at}: question id used on more than one board`);
    seenQuestionIds.add(q.id);
  }
  return p;
}

function loadBoards() {
  const idxFile = path.join(SOURCE, "index.json");
  if (!fs.existsSync(idxFile)) return null;
  const idx = JSON.parse(fs.readFileSync(idxFile, "utf8"));
  const boards = [];
  for (const row of idx.boards || []) {
    const f = path.join(SOURCE, row.id + ".json");
    if (!fs.existsSync(f)) { boards.push({ id: row.id, missing: true }); continue; }
    const board = JSON.parse(fs.readFileSync(f, "utf8"));
    /* The manifest and the file must agree about which board this is. */
    if (String(board.id) !== String(row.id)) board.idMismatch = row.id;
    boards.push(board);
  }
  return { idx, boards };
}

/* One board a day from a start day, in the order they were ISSUED — which is
   the ordinal the content side froze, not the order they happen to be read. */
function buildSchedule(boards, fromDay) {
  const start = Date.parse(String(fromDay) + "T00:00:00Z");
  if (!Number.isFinite(start)) return null;
  const schedule = {};
  [...boards].sort((a, b) => Number(a.ordinal || a.day) - Number(b.ordinal || b.day))
    .forEach((b, i) => {
      schedule[new Date(start + i * 86400000).toISOString().slice(0, 10)] = b.id;
    });
  return schedule;
}

function main() {
  const loaded = loadBoards();
  if (!loaded) {
    /* NO BANK ON THIS MACHINE — CI, a fresh clone. Gate the COMMITTED SAMPLE
       instead, so --check is never a silent pass: a check that passes when it
       finds no problems also passes when it finds nothing at all, and this one
       would otherwise report success on an empty directory for the rest of the
       game's life. The same arrangement tools/import_grid.js keeps, and the
       sample is the one already in functions/_lib rather than a second copy of
       two boards written out to be checked. */
    if (CHECK_ONLY && fs.existsSync(SAMPLE)) {
      import(`file://${SAMPLE.split(path.sep).join("/")}`).then((m) => {
        let refused = 0;
        const seen = new Set(), warned = [];
        for (const b of m.BP_SAMPLE_BOARDS) {
          const p = gate(b, seen, warned);
          if (p.length) { refused++; console.error("REFUSED sample board " + b.id + ": " + p.join("; ")); }
        }
        console.log(`${m.BP_SAMPLE_BOARDS.length} sample boards gated, ` +
          `${m.BP_SAMPLE_BOARDS.length * QUESTIONS} questions, no bank on this machine`);
        if (warned.length) console.log(`${warned.length} warning(s): ${warned[0]}`);
        process.exit(refused ? 1 : 0);
      });
      return;
    }
    console.error(`REFUSED: no index.json at ${SOURCE}. Pass --source <dir>.`);
    process.exit(1);
  }
  const { idx, boards } = loaded;

  /* THE GUARANTEE IS CHECKED, NOT TAKEN. The content side freezes a board once
     issued and says so in the manifest; if that line ever stops being written,
     the ids can move underneath a calendar that has already been served. */
  if (idx.idsAreStable !== true) {
    console.error("REFUSED: the manifest does not declare idsAreStable. A board id " +
      "that can change is a day that can change under somebody who has played it.");
    process.exit(1);
  }

  let refused = 0;
  const seen = new Set();
  /* Named and counted, never swallowed. A warning nobody prints is a warning
     that does not exist; see the note beside the endpoint rule in gate(). */
  const warned = [];
  for (const b of boards) {
    if (b.missing) { console.error(`REFUSED ${b.id}: named in the manifest, no file`); refused++; continue; }
    if (b.idMismatch) { console.error(`REFUSED ${b.idMismatch}: the file inside says ${b.id}`); refused++; continue; }
    const p = gate(b, seen, warned);
    if (p.length) { console.error(`REFUSED ${b.id}:\n  x ${p.join("\n  x ")}`); refused++; }
  }
  /* A RATE, NOT A ROLL CALL. Eighty warnings that are all working as intended
     is how a person learns to scroll past warnings, and then the eighty-first —
     the real one — scrolls past too. What is worth knowing is whether the SHARE
     of answers sitting on an end has moved: the content side's placement table
     puts 1.00 at one entry in eighteen, so about 5.6% is expected and 4.2% is
     what the bank has. A builder bug that started parking answers at the top
     would show here as a number two or three times that, and nothing else in
     either project would notice. Silent when the bank is healthy. */
  const atEnd = boards.reduce((n, b) => n + (b.questions || [])
    .filter((q) => Number(q.answer) === Number(q.hi)).length, 0);
  const total = boards.length * QUESTIONS;
  const share = total ? atEnd / total : 0;
  if (share > 0.12) {
    console.log(`
! ${atEnd} of ${total} answers (${(share * 100).toFixed(1)}%) sit on the` +
      ` slider's top end. The placement table predicts about 5.6%; more than` +
      ` twice that suggests the derivation has changed rather than the content.`);
  }

  if (refused) {
    console.error(`\n${refused} board(s) refused. Nothing written.`);
    process.exit(1);
  }

  /* PRINTED, ALWAYS. A warning collected and never shown is a warning that
     does not exist — and this one nearly shipped that way: the array reached
     gate() on one line and not on the other, so every warning went into a
     default parameter and vanished. Found by running it, not by reading it. */
  if (warned.length) {
    console.log(`
${warned.length} warning(s). Not refusals — nothing here stops a write:`);
    for (const w of warned.slice(0, 5)) console.log(`  ! ${w}`);
    if (warned.length > 5) console.log(`  ! ...and ${warned.length - 5} more`);
  }

  const from = arg("from") || null;
  const days = from ? Object.keys(buildSchedule(boards, from) || {}).sort() : [];

  if (CHECK_ONLY) {
    console.log(`\n${boards.length} boards gated, ${boards.length * QUESTIONS} questions; emitted ${idx.generated}`);
    if (from) console.log(`calendar would run ${days[0]} to ${days[days.length - 1]}`);
    else console.log("no --from given, so no calendar was built");
    return;
  }
  if (!from) {
    console.error("REFUSED: --from=<YYYY-MM-DD> is required to write a calendar.");
    process.exit(1);
  }

  const schedule = buildSchedule(boards, from);
  const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  const now = new Date().toISOString();
  const lines = [
    "-- Ballpark XI: the boards and the calendar. GENERATED by tools/import_ballpark.js.",
    "-- Never commit this file: it holds every answer. Apply 034-ballpark.sql first.",
    `-- ${boards.length} boards, ${Object.keys(schedule).length} days, from ${days[0]} to ${days[days.length - 1]}.`,
    "",
    "DELETE FROM bp_schedule;",
    "",
  ];
  for (const b of boards) {
    lines.push("INSERT OR REPLACE INTO bp_board (id, ordinal, payload, updated_at) VALUES (" +
      [q(b.id), Number(b.ordinal || b.day), q(JSON.stringify({ questions: b.questions })), q(now)].join(", ") + ");");
  }
  lines.push("");
  for (const day of Object.keys(schedule).sort()) {
    lines.push(`INSERT INTO bp_schedule (day, board_id) VALUES (${q(day)}, ${q(schedule[day])});`);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  fs.writeFileSync(SAMPLE, sampleModule(boards));
  console.log(`\n${boards.length} boards, ${Object.keys(schedule).length} days -> data/bp-production.sql`);
  console.log(`calendar runs ${days[0]} to ${days[days.length - 1]}`);
  console.log(`sample rewritten -> functions/_lib/bp-sample.js`);
  console.log("\nApply with:\n  npx wrangler d1 execute crosswordxi --remote --file=data/bp-production.sql\n");
}

/* Two boards, so the game runs with no database — every offline run, every
   check in CI, and `wrangler pages dev` on a machine with no D1. The same
   arrangement the other games keep, and yes the answers are in it: a sample
   carrying none could not be played and so could not be tested. What must never
   happen is a board reaching a BROWSER with its answers, which is a different
   question and is what the endpoint is for. */
function sampleModule(boards) {
  const sample = [boards[0], boards[1]].filter(Boolean);
  return `/* bp-sample.js — two Ballpark XI boards, so the game runs with no database.
 *
 * GENERATED by tools/import_ballpark.js. Hand-editing it would make it a third
 * statement of what a board is, after the content side's bank and the D1 rows.
 */
export const BP_SAMPLE_BOARDS = ${JSON.stringify(sample, null, 1)};

/* The calendar, as OFFSETS from today rather than as dates: a fixture with a
   date written into it stops being today, and then reports a fault in the code
   when the fault is in the fixture. */
export const BP_SAMPLE_SCHEDULE = ${JSON.stringify({ "-1": sample[0] && sample[0].id, 0: sample[1] && sample[1].id })};
`;
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

export { gate, buildSchedule };
