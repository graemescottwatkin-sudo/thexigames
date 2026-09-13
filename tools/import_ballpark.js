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
 *
 * THE SEQUENCE, IN ORDER, AND THE SECOND CAPTURE IS THE ONE PEOPLE SKIP:
 *
 *   0. VERIFY this side matches theirs before touching anything:
 *        node tools/db_archive.mjs --check data/bp-production.sql   (their repo)
 *      It compares BOARD ROWS and ignores the generation header, which moves on
 *      every run — a check that fires on every regeneration gets switched off
 *      within a week and is then still there, meaning nothing.
 *   1. ask the content side to FREEZE and wait for its confirmation
 *   2. CAPTURE the current dump into their dated archive (tools/db_archive.mjs
 *      on their side, or send them data/bp-production.sql)
 *   3. run this tool, then apply the SQL
 *   4. CAPTURE AGAIN
 *
 * Step 4 exists because an archive only answers for days AFTER it is taken. If
 * the import lands and nobody captures, the first day that passes afterwards
 * becomes unprovable in exactly the way bp-0001..bp-0013 already are — they ran
 * before the only import this database has had, so what they served is not in
 * the seed and is nowhere else.
 *
 * AND ONE OBLIGATION THAT RUNS THE OTHER WAY, which is not optional:
 *
 *   IF AN IMPORT LANDS INSIDE A DAY THAT HAS BEEN SERVED, the content side
 *   cannot tell whether the copy played was the old one or the new one — it
 *   has no access to D1, and "no play recorded" and "no play happened" are the
 *   same string to it. Send it the play times:
 *
 *       SELECT board_id, started_ms, datetime(started_ms/1000,'unixepoch')
 *       FROM bp_round ORDER BY started_ms;
 *
 *   Their register fails closed on an unresolved straddle rather than assuming
 *   the day is clean, so silence from here reads as unresolved — which is the
 *   correct behaviour and the reason the obligation is written down here, at
 *   the point somebody runs the import, rather than in a note nobody opens.
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

/* ---- the calendar, and the days it must not rewrite --------------------
 *
 * THE PAST IS NOT REBUILDABLE. A re-import is generated from a bank that has
 * moved, and if the day somebody played now names a different board, their
 * result is filed against a board they never saw. Grid XI shipped that fault
 * and had to grow these three functions to close it; this is the same shape
 * for the same reason, and the reason it is here BEFORE it was needed is that
 * on 13 September the bank had gained five boards and the question "does any
 * played day move" could not be answered by reading the importer.
 */

/* The calendar as it was last written, read back out of the SQL this tool
   emits — the only record of it that lives outside D1. */
function scheduleFromSql(sql) {
  const out = {};
  const re = /INSERT INTO bp_schedule \(day, board_id\) VALUES \('([^']+)', '([^']+)'\);/g;
  for (const m of String(sql || "").matchAll(re)) out[m[1]] = m[2];
  return out;
}

/* Everything before the start day, kept exactly as it was. Without this a
   `--from` of tomorrow leaves yesterday with no board at all — the emitted SQL
   clears the table and writes only what it built — which is a rewrite by
   omission and the history guard below refuses it as one. */
function carryForward(prev, fromDay) {
  const keep = {};
  for (const day of Object.keys(prev || {})) {
    if (!fromDay || day < fromDay) keep[day] = prev[day];
  }
  return keep;
}

/* The BOARDS as last written, id -> payload, read back out of the same SQL.
   Needed because the schedule guard below compares ids, and an id is not a
   board. */
function boardsFromSql(sql) {
  const out = {};
  const re = /INSERT OR REPLACE INTO bp_board \(id, ordinal, payload, updated_at\) VALUES \('([^']+)', \d+, '((?:[^']|'')*)'/g;
  for (const m of String(sql || "").matchAll(re)) out[m[1]] = m[2].replace(/''/g, "'");
  return out;
}

/* THE CHECK THE ID COMPARISON CANNOT MAKE.
 *
 * "Does the day still name the same board" and "is it still the same board" are
 * different questions, and the guard below only asked the first. On 14 September
 * the Ballpark content side reissued three times; bp-0014 and bp-0015 kept their
 * ids and SIX OF ELEVEN QUESTIONS MOVED OFF EACH. Somebody answered eleven
 * questions on bp-0014 and most of them are no longer on it. The id guard would
 * have passed that without a murmur, because the id never moved.
 *
 * So: for any board that has actually been SERVED, the payload must be
 * byte-identical to what was served. The served list cannot come from here —
 * this tool has no database — so it is passed in, and its ABSENCE is refused
 * rather than assumed, for the same reason the missing-calendar case is.
 */
function contentClash(prevBoards, nextBoards, servedIds) {
  const clashes = [];
  for (const id of servedIds || []) {
    const was = prevBoards[id], now = nextBoards[id];
    if (was === undefined) continue;          // never written here; nothing to compare
    if (now === undefined) { clashes.push({ id, why: "gone from the bank" }); continue; }
    if (was !== now) clashes.push({ id, why: "questions changed" });
  }
  return clashes;
}

/* Every day that has already happened and would now name a DIFFERENT board.
   A day that is merely gone from the new calendar counts too: a played day
   with no board is the same lie told by omission. */
function historyClash(prev, next, today) {
  const clashes = [];
  for (const day of Object.keys(prev || {}).sort()) {
    if (day >= today) continue;
    const was = prev[day], now = (next || {})[day] || null;
    if (String(was) !== String(now)) clashes.push({ day, was, now });
  }
  return clashes;
}

/* One board a day from a start day, in the order they were ISSUED — which is
   the ordinal the content side froze, not the order they happen to be read.
   Days already written are carried in and never reassigned. */
function buildSchedule(boards, fromDay, keep = {}) {
  const start = Date.parse(String(fromDay) + "T00:00:00Z");
  if (!Number.isFinite(start)) return null;
  const schedule = { ...keep };
  /* AND NOTHING THE PAST HAS ALREADY SERVED. Rebuilding from a day forward
     restarts the run at the first board, so without this the boards the
     carried-forward past already used are handed out a SECOND time — bp-0014
     played on 8 September and scheduled again for the 27th, with its content
     frozen, so the same eleven questions twice. Invisible on the day of the
     change and obvious a fortnight later, which is the shape Grid XI's
     importer carries the same guard against.
     Found by reading the emitted SQL rather than the check's summary: the
     summary said 179 boards and a sensible date range, and was right about
     both. */
  const alreadyServed = new Set(Object.values(keep).map(String));
  let i = 0;
  for (const b of [...boards].sort((a, b2) =>
      Number(a.ordinal || a.day) - Number(b2.ordinal || b2.day))) {
    if (alreadyServed.has(String(b.id))) continue;
    const day = new Date(start + i * 86400000).toISOString().slice(0, 10);
    if (!(day in schedule)) schedule[day] = b.id;
    i++;
  }
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
  /* Which boards must not be rewritten, carried from the guard down to the
     writer so the two cannot disagree about what "served" means. */
  let servedIdsForWrite = [];
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
  /* THE CALENDAR AS IT STANDS, before this run replaces it. Read from the file
     this tool last wrote, because the emitted SQL clears bp_schedule and is
     therefore the only thing that remembers what the past served. */
  const previous = fs.existsSync(OUT) ? scheduleFromSql(fs.readFileSync(OUT, "utf8")) : {};
  const kept = carryForward(previous, from);
  const schedule = from ? buildSchedule(boards, from, kept) : null;
  const days = schedule ? Object.keys(schedule).sort() : [];

  /* AND IT MUST NOT MOVE A DAY THAT HAS ALREADY RUN. Checked in --check as
     well as on a write, because the whole point is to find out BEFORE the
     command that touches production. */
  if (schedule) {
    const today = new Date().toISOString().slice(0, 10);

    /* NO RECORD IS NOT THE SAME AS NO CLASH, and this is the hole the guard
       above would otherwise have. `previous` comes from a FILE — data/
       bp-production.sql, which is gitignored and regenerated. Delete it, or run
       on a machine that never had it, and historyClash() compares against an
       empty object, finds nothing, and returns green on the one question it
       exists to answer. A check whose input is absent must not report a pass:
       that is the same fault as a grep that skipped a binary file and a
       verifier that skipped an unparseable board, both found on 12 September.
       So: no previous calendar AND a start day in the past is REFUSED, because
       days between that start and today would be written blind over whatever
       was served on them. --first-import says "there is genuinely no history",
       which is a claim a person makes, not one this tool may assume. */
    if (!Object.keys(previous).length && from < today &&
        !process.argv.includes("--first-import")) {
      console.error(`
REFUSED: no previous calendar to check against, and --from=${from} is before today.`);
      console.error(`  ${OUT} is missing, so what those days already served cannot be known.`);
      console.error("  Days between that start and today would be overwritten blind.");
      console.error("  If this really is the first import, pass --first-import.");
      process.exit(1);
    }

    /* WHICH BOARDS HAVE ACTUALLY BEEN SERVED. Not derivable here — this tool
       never touches D1 — so it is passed in and its absence is loud:
         --served bp-0014,bp-0015     ids directly
         --served-none                an explicit claim that nothing has run
       A register nobody updates is worse than no register, because it looks
       like a guard. So this one cannot be defaulted into existence. */
    const servedArg = arg("served");
    const servedIds = servedArg ? servedArg.split(",").map((x) => x.trim()).filter(Boolean) : null;
    servedIdsForWrite = servedIds || [];
    if (servedIds === null && !process.argv.includes("--served-none") && from < today) {
      console.error("");
      console.error("REFUSED: --served or --served-none is required for a calendar that starts in the past.");
      console.error("  An id keeping its place does NOT mean the board is unchanged: on 14 Sep 2026");
      console.error("  bp-0014 and bp-0015 kept their ids while six of eleven questions moved off each.");
      console.error("  Ask D1 which boards have rounds against them:");
      console.error("    SELECT DISTINCT board_id FROM bp_round;");
      process.exit(1);
    }

    if (servedIds && servedIds.length) {
      const prevBoards = boardsFromSql(fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "");
      const nextBoards = {};
      for (const b of boards) nextBoards[b.id] = JSON.stringify({ questions: b.questions });
      const cc = contentClash(prevBoards, nextBoards, servedIds);
      /* NOT A REFUSAL ANY MORE, BECAUSE THE WRITER NOW SKIPS THESE. It was a
         refusal while the writer would have overwritten them; now it is the
         report that says which boards are deliberately behind the bank and
         why, so the next person does not read them as a failed import. */
      if (cc.length) {
        console.log(`
${cc.length} served board(s) FROZEN — left as D1 holds them:`);
        for (const c of cc) console.log(`  = ${c.id}: ${c.why} in the bank, not rewritten here`);
      }
    }

    const clashes = historyClash(previous, schedule, today);
    if (clashes.length) {
      console.error(`
REFUSED: ${clashes.length} day(s) that have already run would name a different board.`);
      for (const c of clashes.slice(0, 8)) {
        console.error(`  x ${c.day}: served ${c.was}, would now serve ${c.now || "NOTHING"}`);
      }
      if (clashes.length > 8) console.error(`  x ...and ${clashes.length - 8} more`);
      console.error("A day somebody played must keep the board they played.");
      process.exit(1);
    }
  }

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

  const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  const now = new Date().toISOString();
  const lines = [
    "-- Ballpark XI: the boards and the calendar. GENERATED by tools/import_ballpark.js.",
    "-- Never commit this file: it holds every answer. Apply 034-ballpark.sql first.",
    /* THE STAMP THIS SCRIPT WILL WRITE IF IT IS EVER RUN — and the name matters.
       This was called LAST_IMPORT for one message and that was wrong in a way
       that invited a false record. THIS FILE IS NOT AN EXPORT OF THE DATABASE.
       The body is INSERT OR REPLACE; the header says GENERATED. So this value
       is what the rows WOULD carry after application, not what any row holds
       now, and a regenerated script that is never applied describes a database
       state that never existed.
       The Ballpark side needs last_import — the moment something actually
       reached D1 — and only somebody who RAN the thing knows that. Generation
       and application look identical in a text file and differ in whether they
       happened. So this is labelled as what it is, and the end-of-run message
       asks a person to confirm application rather than offering this as a
       substitute for one. */
    `-- WOULD_STAMP_IF_APPLIED: ${now}  (generation time, NOT evidence of an import)`,
    `-- ${boards.length} boards, ${Object.keys(schedule).length} days, from ${days[0]} to ${days[days.length - 1]}.`,
    "",
    "DELETE FROM bp_schedule;",
    "",
  ];
  /* A PLAYED BOARD IS A HISTORICAL RECORD, NOT CONTENT, so it is not written.
   *
   * Scores were computed against those exact eleven questions. A permalink to
   * bp-0014 that returns different questions is a different board wearing the
   * same name, and anybody who played it — or is ranked against somebody who
   * did — is misrepresented without being told. So served boards are FROZEN:
   * no INSERT is emitted for them at all and D1 keeps what it served.
   *
   * This is why `--from <a future day>` is not on its own enough. The schedule
   * is rebuilt from that day forward, but this loop writes EVERY board in the
   * bank regardless of which day it falls on — so without the skip below, a
   * calendar starting tomorrow would still overwrite the questions on a board
   * played last week. The calendar and the content are two different things and
   * only one of them is dated.
   *
   * A frozen board may point at a question the bank has since retired. That is
   * not a dangling reference: it is what was served, and the master bank holds
   * those rows as `live` so the record survives the game dropping them. */
  const frozen = new Set(servedIdsForWrite || []);
  let skipped = 0;
  for (const b of boards) {
    if (frozen.has(b.id)) {
      skipped++;
      lines.push(`-- ${b.id} FROZEN: served and played, left exactly as D1 holds it.`);
      continue;
    }
    lines.push("INSERT OR REPLACE INTO bp_board (id, ordinal, payload, updated_at) VALUES (" +
      [q(b.id), Number(b.ordinal || b.day), q(JSON.stringify({ questions: b.questions })), q(now)].join(", ") + ");");
  }
  lines.push("");
  for (const day of Object.keys(schedule).sort()) {
    lines.push(`INSERT INTO bp_schedule (day, board_id) VALUES (${q(day)}, ${q(schedule[day])});`);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  /* CAPTURE BEFORE OVERWRITING, AND DO NOT ASK ANYBODY TO REMEMBER IT.
   *
   * The file about to be replaced is the only record on this side of what the
   * live boards hold. bp-0001..bp-0013 are the standing proof of what losing it
   * costs: they ran before the only import this database has had, so what they
   * served is not in the seed and is nowhere else - unknowable, permanently,
   * because nobody captured.
   *
   * This was a line in the header telling a person to capture first. The
   * Ballpark session turned their equivalent reminder into a build that
   * refuses, and was right that a step depending on somebody reading a comment
   * is not a step. So the archive is taken here, automatically, and an existing
   * archive for the same day is NEVER overwritten - the first capture of a day
   * is the one that predates that day s changes.
   *
   * The name keeps the -production.sql suffix deliberately: .gitignore matches
   * data/*-production.sql, and an archive of the bank that did not match it
   * would be a file full of answers waiting to be committed. */
  if (fs.existsSync(OUT)) {
    const stamp = new Date().toISOString().slice(0, 10);
    const archive = path.join(path.dirname(OUT), 'bp-' + stamp + '-production.sql');
    if (fs.existsSync(archive)) {
      console.log('archive for ' + stamp + ' already exists, left untouched -> ' + path.basename(archive));
    } else {
      fs.copyFileSync(OUT, archive);
      console.log('captured the previous bank -> ' + path.basename(archive));
    }
  }

  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  fs.writeFileSync(SAMPLE, sampleModule(boards));
  console.log(`\n${boards.length} boards, ${Object.keys(schedule).length} days -> data/bp-production.sql`);
  console.log(`calendar runs ${days[0]} to ${days[days.length - 1]}`);
  console.log(`sample rewritten -> functions/_lib/bp-sample.js`);
  console.log("");
  console.log("AFTER the SQL is actually applied, SEND THIS to the Ballpark session:");
  console.log(`    last_import: ${now}   (only if the wrangler command above SUCCEEDED)`);
  console.log("  If you generated this and did not apply it, send NOTHING — the dump");
  console.log("  header records generation, not application, and they are not the same.");
  console.log("  Without it their freeze refuses every newly-past day rather than");
  console.log("  risking overwriting a correctly served board with a stale copy.");
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

/* EXPORTED SO THEY CAN BE TESTED RATHER THAN DEMONSTRATED. Every guard in this
   file was proved by hand-sabotage in a session on 13 September 2026 — which
   proves it worked that evening and nothing thereafter. The Ballpark content
   side pinned its equivalent boundary with a failing test and was right that a
   rule three sessions read three ways will eventually be "fixed" in the wrong
   direction, and that the fix will look like a tidy-up. */
export { gate, buildSchedule, carryForward, historyClash, contentClash,
         scheduleFromSql, boardsFromSql };
