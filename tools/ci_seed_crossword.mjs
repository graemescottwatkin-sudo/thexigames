#!/usr/bin/env node
/* tools/ci_seed_crossword.mjs — give CI's local D1 one crossword board.
 *
 * WHY THIS EXISTS. The viewport job runs `wrangler pages dev` with no D1
 * binding, so getDailyPuzzle() falls through to SAMPLE_PUZZLES and returns
 * `list[(dailyNo - 1) % list.length]` — a THREE-BOARD ROTATION keyed on the
 * date. There are three samples, 14x12, 15x15 and 11x9, so which board the
 * sixteen viewports are measured against depends on what day the run happens.
 *
 * That is exactly what bit on 21 September 2026. The 23:38 run drew the 11x9
 * and passed; the 00:00 run drew the 14x12 and failed on the two narrowest
 * phones. Same commit, same code, opposite results, twenty-two minutes apart —
 * and it would have gone green again on its own two days later, which is worse
 * than staying red, because a red that heals itself teaches you to ignore the
 * next one.
 *
 * MEASURED AGAINST PRODUCTION THE SAME NIGHT, all sixteen viewports passed:
 * phone-360 at 56.7px and phone-small at 50px against a floor of 32, because
 * the follow-word default fires on a coarse pointer. So the failure was never
 * about the product. CI was measuring a code path no player reaches — the
 * fallback for an unbound database.
 *
 * WHAT THIS SEEDS, AND WHAT IT IS NOT. One board, for today's daily number,
 * written into the local miniflare D1 that `wrangler pages dev --d1` creates.
 * It is SAMPLE_PUZZLES.daily[1], the 15x15 — the WIDEST of the three, because
 * a legibility floor should be measured against the hardest board rather than
 * whichever one the calendar offers.
 *
 * IT IS NOT A BANK BOARD AND MUST NEVER BECOME ONE. The samples are already in
 * the tree and already served to anyone whose D1 is unbound; they are not
 * secret. The real bank lives outside the repo and D1 is its only authoritative
 * copy — never seed CI from it, and never commit a file that came from it.
 *
 *   node tools/ci_seed_crossword.mjs
 *
 * Run AFTER `wrangler pages dev` has started and answered one request, because
 * the database file does not exist until the binding is first touched.
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { SAMPLE_PUZZLES } from "../functions/_lib/sample-puzzles.js";
import { dailyNumber } from "../functions/_lib/daily.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const D1_DIR = path.join(ROOT, ".wrangler", "state", "v3", "d1",
  "miniflare-D1DatabaseObject");

function die(msg) {
  console.error("REFUSED: " + msg);
  process.exit(1);
}

/* THE DATABASE FILE IS NAMED BY A HASH, so it is found rather than known. The
   metadata database sits beside it and is not the one. */
if (!fs.existsSync(D1_DIR)) {
  die(`no local D1 at ${D1_DIR}. Start wrangler pages dev with --d1 and let it ` +
      `answer one request first — the file is not created until the binding is touched.`);
}
const files = fs.readdirSync(D1_DIR)
  .filter((f) => f.endsWith(".sqlite") && !f.includes("metadata"))
  .map((f) => path.join(D1_DIR, f));
if (!files.length) die(`no .sqlite in ${D1_DIR}`);
const dbPath = files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];

/* THE WIDEST SAMPLE, ON PURPOSE. A floor is worth measuring against the board
   most likely to breach it; picking the narrowest would make the check pass by
   choosing an easy case, which is how a guard stops guarding. */
const samples = SAMPLE_PUZZLES.daily || [];
if (samples.length < 2) die(`expected several daily samples, found ${samples.length}`);
const widest = samples.reduce((a, b) => {
  const wa = (a.puzzle || a).width || 0, wb = (b.puzzle || b).width || 0;
  return wb > wa ? b : a;
});
const board = widest.puzzle ? widest : { puzzle: widest };
const size = `${(widest.puzzle || widest).width}x${(widest.puzzle || widest).height}`;

const no = dailyNumber(Date.now());

const db = new DatabaseSync(dbPath);

/* EVERY TABLE THE SCHEMA DEFINES, EMPTY, BEFORE THE BOARD GOES IN.
   Binding D1 at all is what makes this necessary, and it was not obvious until
   it ran: with NO binding, every endpoint took its "there is no database" path
   and answered from a fallback. With a binding and only `puzzles` in it, the
   others reach D1 and fail on a missing table — so the first run of this seeder
   turned sixteen graceful pages into sixteen pages logging a 500, and the
   viewport job, which refuses runtime console errors, failed on ALL of them
   rather than two. The board was right and the page was broken.

   An EMPTY table is the point. The queries return no rows and the code takes
   the same "nothing here" branch it takes in the fallback, instead of throwing.
   Nothing is seeded into them and nothing should be: this job measures layout,
   not data.

   Statement failures are tolerated ONE AT A TIME rather than per file. The
   migrations include ALTER TABLE on tables that predate them and are created
   outside this directory, and an ALTER that cannot apply must not abandon the
   CREATEs after it in the same file. */
const migDir = path.join(ROOT, "data", "migrations");
let applied = 0, skipped = 0;
if (fs.existsSync(migDir)) {
  for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith(".sql")).sort()) {
    /* COMMENTS STRIPPED BEFORE SPLITTING, and this was wrong first. The split
       is on ";", and a chunk that begins with a comment line was skipped as
       though the whole chunk were a comment — but in this repository almost
       every statement is preceded by one, often a long one. So it discarded the
       CREATEs it was there for and reported them as "skipped ALTERs", and the
       tables it needed most (plays, users, season_play) were never made. The
       count looked like tolerance working; it was the check throwing away its
       own input. */
    const sql = fs.readFileSync(path.join(migDir, f), "utf8")
      .replace(/^\s*--.*$/gm, "");
    for (const stmt of sql.split(";")) {
      const s = stmt.trim();
      if (!s) continue;
      try { db.exec(s + ";"); applied++; } catch { skipped++; }
    }
  }
}

db.exec(`CREATE TABLE IF NOT EXISTS puzzles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mode       TEXT NOT NULL,
  daily_no   INTEGER,
  payload    TEXT NOT NULL
);`);

/* EVERY NUMBER THE RUN COULD ASK FOR, not just today's. A job that starts at
   23:59 and measures at 00:01 asks for two different days, and seeding only one
   of them would put the date-dependence straight back in — which is the whole
   fault being fixed. Cheap: it is the same board under every number. */
db.exec("DELETE FROM puzzles WHERE mode = 'daily';");
const insert = db.prepare(
  "INSERT INTO puzzles (mode, daily_no, payload) VALUES ('daily', ?, ?)");
const payload = JSON.stringify(board);
for (let n = Math.max(1, no - 2); n <= no + 2; n++) insert.run(n, payload);

const count = db.prepare("SELECT COUNT(*) AS n FROM puzzles").get().n;
db.close();

console.log(`schema: ${applied} statement(s) applied, ${skipped} skipped ` +
  `(ALTERs on tables that predate the migrations)`);
console.log(`seeded ${count} row(s) into ${path.basename(dbPath)}`);
console.log(`  board ${size}, the widest of ${samples.length} samples`);
console.log(`  daily numbers ${Math.max(1, no - 2)}..${no + 2} (today is ${no})`);
console.log("  the same board under every number, so a run that straddles " +
            "midnight measures the same thing twice");
