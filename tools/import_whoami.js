/* tools/import_whoami.js — Who Am I XI's bank and calendar into D1.
 *
 *   node tools/import_whoami.js --source <folder> [--from=YYYY-MM-DD] [--check]
 *
 * Reads whoami-bank.json and board-schedule.json from a folder OUTSIDE this
 * repo and writes data/wa-production.sql. The bank never enters the tree: it
 * holds 3,146 careers and a career is an answer written out.
 *
 * --check parses and validates and writes nothing, which is what CI runs.
 *
 * THE CALENDAR IS RE-DATED HERE, and that is the whole reason --from exists.
 * The schedule is built as 365 consecutive days from whatever day its generator
 * ran, and the day a game LAUNCHES is not that day. Grid XI shipped with a
 * calendar starting on the day of its import and CLAUDE.md still carries the
 * note that it must be re-imported when the game goes live. Doing it at import
 * time rather than at generation time means the board CONTENT is untouched —
 * board one is board one, whichever date it lands on — and re-running with a
 * different --from is the whole fix.
 *
 * WHAT THIS REFUSES, and every refusal is a rule that has cost somebody a
 * release somewhere in this repo:
 *
 *   1. a board without exactly eleven doors
 *   2. two doors on one board showing the same club
 *   3. a door whose answer is not in the bank
 *   4. a door whose player never played for that club
 *   5. a player with no name or no search key
 *   6. two players folding to the same search key — which would make one of
 *      them unguessable, because a guess resolves by key
 *   7. a gap or a repeat in the calendar
 *   8. a board date before the launch day
 *
 * Four and six are the ones worth reading twice. Four is the "player picks the
 * right answer and is told they are wrong" failure that this family has now met
 * in three games; six is the same failure wearing a different hat, because two
 * players sharing a key means one of them can never be typed.
 */
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const srcAt = args.indexOf("--source");
const SOURCE = srcAt > -1 ? args[srcAt + 1] : null;
const fromArg = args.find((a) => a.startsWith("--from="));
const FROM = fromArg ? fromArg.slice("--from=".length) : null;

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "wa-production.sql");

const faults = [];
const fault = (m) => faults.push(m);

/* THE SAME FOLD ON BOTH SIDES. A guess is compared to a stored key, so the
   importer and the server must agree about what a name reduces to — two copies
   of this rule is a name that imports under one spelling and can never be
   typed. functions/_lib/wadata.js states it once and this is the build-time
   half; they are asserted identical by the suite rather than kept in step by
   hand. */
const FOLD_LETTERS = {
  "Ø": "O", "ø": "o",   // O-slash
  "Æ": "AE", "æ": "ae", // ash
  "Œ": "OE", "œ": "oe",
  "Ð": "D", "ð": "d",   // eth
  "Þ": "TH", "þ": "th", // thorn
  "ß": "ss",
  "Ł": "L", "ł": "l",   // L-stroke
  "Đ": "D", "đ": "d",
};

/* STRIPPING ACCENTS IS NOT ENOUGH, and the difference is a player nobody can
   guess. NFD splits a letter into a base plus a combining mark, so E-acute
   becomes E. But O-slash, ash, thorn, eth and L-stroke are not accented
   letters — they are letters in their own right and NFD leaves them whole, so
   the [^A-Z0-9] sweep DELETES them. MARTIN ODEGAARD folded to MARTINDEGAARD
   with the O missing, and a player typing his name correctly folds to
   MARTINODEGAARD and is told they are wrong.
   Nine names in this bank carry one. Caught because the bank's own searchKey
   disagreed with this function on all nine, which is the check below and the
   reason it recomputes rather than trusts. The bank was right. */
/* The ranges are written as escapes rather than as the characters themselves.
   The combining-mark class in particular is invisible when typed literally —
   a regex whose contents cannot be seen is one the next person deletes by
   accident and cannot diff. */
const NON_DECOMPOSING = /[ØøÆæŒœÐðÞþßŁłĐđ]/g;
const COMBINING = /[̀-ͯ]/g;

function fold(name) {
  return String(name == null ? "" : name)
    .replace(NON_DECOMPOSING, (c) => FOLD_LETTERS[c] || c)
    .normalize("NFD").replace(COMBINING, "")
    .toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

const q = (v) => (v === null || v === undefined || v === ""
  ? "NULL"
  : "'" + String(v).replace(/'/g, "''") + "'");
const n = (v) => (Number.isFinite(Number(v)) ? String(Math.trunc(Number(v))) : "NULL");

function main() {
  if (!SOURCE) {
    console.error("usage: node tools/import_whoami.js --source <folder> [--from=YYYY-MM-DD] [--check]");
    process.exit(2);
  }
  const bankPath = path.join(SOURCE, "whoami-bank.json");
  const schedPath = path.join(SOURCE, "board-schedule.json");
  for (const p of [bankPath, schedPath]) {
    if (!fs.existsSync(p)) {
      console.error("missing: " + p);
      process.exit(2);
    }
  }

  const bank = JSON.parse(fs.readFileSync(bankPath, "utf8"));
  const sched = JSON.parse(fs.readFileSync(schedPath, "utf8"));
  const players = bank.players || [];
  const boards = sched.boards || sched.schedule || [];

  /* ---- the bank ---- */
  const byName = new Map();
  const byKey = new Map();
  for (const p of players) {
    if (!p.name || !String(p.name).trim()) { fault("a player with no name"); continue; }
    const key = fold(p.name);
    if (!key) { fault(`${p.name}: folds to nothing, so it could never be typed`); continue; }
    /* THE STORED KEY MUST BE THE FOLD OF THE NAME. The bank carries its own
       searchKey and this recomputes it rather than trusting it: a key that
       disagrees with its name is a player who cannot be guessed, and it would
       be invisible until somebody tried. */
    if (p.searchKey && fold(p.searchKey) !== key) {
      fault(`${p.name}: stored searchKey "${p.searchKey}" is not the fold of the name`);
    }
    if (byKey.has(key)) {
      fault(`${p.name} and ${byKey.get(key)} fold to the same key "${key}" — one of them could never be guessed`);
      continue;
    }
    byKey.set(key, p.name);
    byName.set(p.name, p);
  }

  /* ---- the calendar ---- */
  const dates = boards.map((b) => b.date).filter(Boolean).sort();
  for (let i = 1; i < dates.length; i++) {
    const gap = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86400000;
    if (gap !== 1) fault(`calendar: ${dates[i - 1]} to ${dates[i]} is ${gap} days, not one`);
  }

  const launch = FROM || utcToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(launch)) {
    console.error("--from must be YYYY-MM-DD");
    process.exit(2);
  }

  /* RE-DATED FROM THE LAUNCH DAY, keeping the order the generator chose. Board
     one is board one; only which morning it appears on changes. */
  const ordered = boards.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const dated = ordered.map((b, i) => ({ ...b, date: addDays(launch, i) }));

  /* ---- the boards ---- */
  for (const b of dated) {
    const doors = b.doors || [];
    if (doors.length !== 11) {
      fault(`${b.date}: ${doors.length} doors, and a board is eleven`);
      continue;
    }
    if (b.date < launch) fault(`${b.date}: before the launch day ${launch}`);
    /* THE SAME CLUB TWICE IS THE FAULT; the same PLAYER twice is not.
       This refused a repeated player and rejected all 365 boards — every one of
       them has between one and five, averaging four, because a player with two
       doors can legitimately hold both: Sylvain Distin left Manchester City in
       2007 and Everton in 2015, and those are two different doors with two
       different years and one correct answer each. Nobody is told they are
       wrong for being right, which is the test that matters.
       A repeated CLUB would be two identical doors, and there are none. */
    const seenClub = new Set();
    for (const d of doors) {
      const p = byName.get(d.answer);
      if (!p) { fault(`${b.date}: "${d.answer}" is not in the bank`); continue; }
      const ck = fold(d.club);
      if (seenClub.has(ck)) {
        fault(`${b.date}: ${d.club} is behind two doors on one board`);
      }
      seenClub.add(ck);
      /* HE MUST HAVE PLAYED THERE. The door says a club and the bank says a
         career; if they disagree, a player who names him correctly is told he
         is wrong. Compared on the folded club name so punctuation cannot
         separate "Man Utd" from itself. */
      const played = (p.clubs || []).some((c) => fold(c.club) === fold(d.club));
      if (!played) {
        fault(`${b.date}: ${d.answer} never played for ${d.club}`);
      }
    }
  }

  if (faults.length) {
    console.error(`REFUSED — ${faults.length} contract failure(s):`);
    for (const f of faults.slice(0, 25)) console.error("  " + f);
    if (faults.length > 25) console.error(`  … and ${faults.length - 25} more`);
    process.exit(1);
  }

  console.log(`${byName.size} players, ${dated.length} boards, ` +
    `${dated[0].date} to ${dated[dated.length - 1].date}, no gaps`);
  console.log(`every door's player is in the bank and played for that club`);

  if (CHECK) {
    console.log("--check: nothing written");
    return;
  }

  /* ---- the SQL ---- */
  const lines = [];
  lines.push("-- wa-production.sql — generated by tools/import_whoami.js. Do not edit.");
  lines.push("-- GENERATED AND GITIGNORED: it carries 3,146 careers, and a career is");
  lines.push("-- an answer written out. It must never be committed.");
  lines.push("BEGIN TRANSACTION;");
  /* The boards are cleared and rewritten; the bank is upserted. Re-running with
     a new --from must not leave yesterday's calendar behind it. */
  lines.push("DELETE FROM wa_door;");
  lines.push("DELETE FROM wa_board;");

  for (const p of byName.values()) {
    const id = fold(p.name);
    lines.push("INSERT OR REPLACE INTO wa_player (id, name, search_key, full_name, " +
      "nationality, position, birth_year, birth_place, main_club, club_count, " +
      "club_history, clubs, caps, article, status) VALUES (" +
      [q(id), q(p.name), q(id), q(p.fullName), q(p.nationality), q(p.position),
       n(p.birthYear), q(p.birthPlace), q(p.mainClub), n(p.clubCount || (p.clubs || []).length),
       q(p.clubHistory), q(JSON.stringify(p.clubs || [])), q(p.caps), q(p.article),
       "'verified'"].join(", ") + ");");
  }

  for (const b of dated) {
    lines.push(`INSERT OR REPLACE INTO wa_board (play_date, status) VALUES (${q(b.date)}, 'published');`);
    b.doors.forEach((d, i) => {
      lines.push("INSERT OR REPLACE INTO wa_door (play_date, slot, club, leave_year, player_id) VALUES (" +
        [q(b.date), String(i + 1), q(d.club), n(d.leave), q(fold(d.answer))].join(", ") + ");");
    });
  }
  lines.push("COMMIT;");

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  console.log(`wrote ${path.relative(ROOT, OUT)} — ${lines.length} statements`);
}

main();
