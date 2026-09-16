/* tools/import_whoami.js — Who Am I XI's bank and calendar into D1.
 *
 *   node tools/import_whoami.js --source <folder> [--from=YYYY-MM-DD] [--check]
 *
 * Reads whoami-bank.json and board-schedule.json from a folder OUTSIDE this
 * repo and writes data/wa-production.sql. The bank never enters the tree: it
 * holds a career for every player in the bank, and a career is an answer
 * written out. (It said "3,146" until 16 Sep 2026, by which time it was 3,232 —
 * see the derived line further down.)
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
 *   9. a day before today that the previous calendar cannot account for
 *  10. a day at or before today whose board would CHANGE — gone, or different
 *
 * Nine and ten are the two halves of one rule and neither implies the other: a
 * served day that vanishes and a served day that becomes a different board are
 * both "the archive now lies", arrived at from opposite directions.
 * --rewrite-history overrides both, loudly, because a guard with no override
 * meets the case where the override was right and then gets deleted in a hurry
 * by whoever is blocked.
 *
 * Four and six are the ones worth reading twice. Four is the "player picks the
 * right answer and is told they are wrong" failure that this family has now met
 * in three games; six is the same failure wearing a different hat, because two
 * players sharing a key means one of them can never be typed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/* THE FOLD IS IMPORTED, NOT COPIED. The importer stores a key and the server
   matches a guess against it; two copies of that rule is a name that imports
   under one spelling and can never be typed. It WAS written twice, and the two
   copies disagreed about O-slash within the hour. This file is .mjs rather than
   .js for exactly this reason — a CommonJS tool could not import it. */
import { fold } from "../functions/_lib/wadata.js";

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const srcAt = args.indexOf("--source");
const SOURCE = srcAt > -1 ? args[srcAt + 1] : null;
const fromArg = args.find((a) => a.startsWith("--from="));
const FROM = fromArg ? fromArg.slice("--from=".length) : null;
/* WHERE THE SQL GOES. Defaults to data/wa-production.sql; a suite passes
   somewhere disposable so it can generate real output and read it back without
   overwriting five megabytes of the real thing. */
const outArg = args.find((a) => a.startsWith("--out="));

/* ---- WHAT HAS ALREADY BEEN SERVED -----------------------------------------
 *
 * This importer wipes the calendar and rewrites it — DELETE FROM wa_door,
 * DELETE FROM wa_board — and until now nothing stopped it rewriting a day a
 * player had already been shown. Who Am I has been live since 2026-09-15.
 *
 * Three ways that went wrong, all of them silent:
 *
 *   --from defaulted to today, so a bare run started the calendar this morning
 *     and orphaned every day behind it while reporting success
 *   boards are re-dated BY POSITION, so the dates the generator chose are
 *     discarded and a different --from silently moves every board
 *   the one check that looked like it covered this, `b.date < launch`, runs
 *     over the ALREADY RE-DATED array, so it is true zero times in 365 — a
 *     guard that cannot fire, which is worse than none because it reassures
 *     whoever reads the file looking for exactly this protection
 *
 * The pair below is the family's, from import_grid.js and import_hilo.js:
 * uncoveredPast asks whether the past is COVERED, servedClash asks whether it
 * has CHANGED. Two questions — a day that vanishes and a day that turns into a
 * different board are both faults, and neither implies the other.
 *
 * The comparison is against the last SQL this importer emitted, which is the
 * only record of the calendar outside the database. */

/* Every day from `from` up to (not including) today that the previous calendar
   does not account for. Deliberately NOT conditional on the previous file
   existing: the case it refuses is the one where that file tells us nothing,
   and a guard that disappears when its input does is not a guard. */
export function uncoveredPast(prev, fromDay, today) {
  if (!fromDay || !(fromDay < today)) return [];
  const start = Date.parse(String(fromDay) + "T00:00:00Z");
  const end = Date.parse(String(today) + "T00:00:00Z");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const out = [];
  for (let t = start; t < end; t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10);
    if (!(prev || {})[day]) out.push(day);
  }
  return out;
}

/* A day at or before today that the previous calendar served and this import
   would change. Both halves: gone entirely, or present with different doors.
   Compared slot by slot on club, leave year and player id — the same triple the
   rows are written from, so a difference here is a difference a player sees. */
export function servedClash(prev, next, today) {
  const out = [];
  for (const day of Object.keys(prev || {}).sort()) {
    if (day > today) continue;
    const was = prev[day];
    const now = (next || {})[day];
    if (!now) { out.push({ day, why: `served ${was.length} doors, and this import has no board for it at all` }); continue; }
    if (now.length !== was.length) { out.push({ day, why: `${was.length} doors served, ${now.length} now` }); continue; }
    /* EVERY DIFFERING SLOT, NOT THE FIRST — see the same fix in
       import_quickfire.js, where breaking early reported one bench swap on days
       that had changed eight doors of eleven, and the override was sized against
       that report. Right for deciding IF a day clashes, wrong for saying WHAT. */
    const diff = [];
    for (let i = 0; i < was.length; i++) {
      const a = was[i], b = now[i];
      if (a.club !== b.club || String(a.leave) !== String(b.leave) || a.player !== b.player) {
        diff.push(`slot ${i + 1}: ${a.club} (${a.leave}) -> ${b.club} (${b.leave})`);
      }
    }
    if (diff.length) {
      out.push({ day, why: `${diff.length} of ${was.length} doors change — ` +
        diff.slice(0, 3).join("; ") + (diff.length > 3 ? `; and ${diff.length - 3} more` : "") });
    }
  }
  return out;
}

/* The calendar as the last emitted SQL holds it: date -> doors in slot order. */
export function calendarFromSql(sql) {
  const out = {};
  const re = /INSERT OR REPLACE INTO wa_door \(play_date, slot, club, leave_year, player_id\) VALUES \('([^']+)', (\d+), '((?:[^']|'')*)', (\d+), '((?:[^']|'')*)'\)/g;
  let m;
  while ((m = re.exec(sql))) {
    const [, day, slot, club, leave, player] = m;
    (out[day] = out[day] || []).push({ slot: Number(slot), club: club.replace(/''/g, "'"), leave: Number(leave), player });
  }
  for (const day of Object.keys(out)) out[day].sort((a, b) => a.slot - b.slot);
  return out;
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = outArg ? outArg.slice("--out=".length) : path.join(ROOT, "data", "wa-production.sql");

const faults = [];
const fault = (m) => faults.push(m);

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
  /* Keep each board's ORIGINAL date alongside the one it was given, so the
     check below can ask about the date the generator meant rather than the one
     this function just assigned. */
  const byPosition = new Map(dated.map((b, i) => [b, ordered[i].date]));

  /* ---- the boards ---- */
  for (const b of dated) {
    const doors = b.doors || [];
    if (doors.length !== 11) {
      fault(`${b.date}: ${doors.length} doors, and a board is eleven`);
      continue;
    }
    /* THIS RAN OVER THE RE-DATED ARRAY, where every date is addDays(launch, i)
       and so is launch-or-later by construction: true zero times in 365. It now
       asks the question of the date the GENERATOR chose, which is the one that
       can actually be wrong. */
    const meant = byPosition.get(b) || b.date;
    if (meant < launch) fault(`${meant}: the schedule dates this board before the launch day ${launch}`);
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

  /* ---- (9) AND (10): THE PAST IS COVERED, AND THE PAST HAS NOT CHANGED -----
   *
   * Runs AFTER the contract failures. A file that is malformed should be told
   * it is malformed — the first version of this reported "a served day would
   * change" for a board with ten doors, which is true and useless, and it broke
   * seven tests that were asking about ten doors.
   *
   * --check parses and writes nothing, so it does not need the history guard to
   * protect anything — but it is what CI runs, and CI is exactly where you want
   * to find out that the schedule in hand would rewrite a served day. */
  const previous = fs.existsSync(OUT) ? calendarFromSql(fs.readFileSync(OUT, "utf8")) : {};
  const nextCal = {};
  for (const b of dated) {
    nextCal[b.date] = (b.doors || []).map((d, i) => ({
      slot: i + 1, club: d.club, leave: d.leave, player: fold(d.answer),
    }));
  }
  const today = utcToday();
  const REWRITE = args.includes("--rewrite-history");

  const uncovered = uncoveredPast(previous, launch, today);
  const clashes = servedClash(previous, nextCal, today);

  if ((uncovered.length || clashes.length) && !REWRITE) {
    if (uncovered.length) {
      console.error(`REFUSED: --from=${launch} is before today and ${uncovered.length} of those days are unaccounted for.`);
      console.error(`  ${Object.keys(previous).length
        ? "The last emitted calendar records no board for them"
        : path.relative(ROOT, OUT) + " is missing entirely"}, so what they served cannot be known.`);
      console.error(`  x ${uncovered.slice(0, 8).join(", ")}` +
        (uncovered.length > 8 ? `, ...and ${uncovered.length - 8} more` : ""));
    }
    if (clashes.length) {
      console.error(`REFUSED: ${clashes.length} day(s) at or before today would change.`);
      console.error(`  Those boards have been served. Changing one shows the right date over the`);
      console.error(`  wrong puzzle, and the archive link somebody holds stops meaning what it meant.`);
      console.error(`  THIS CANNOT PRICE IT FOR YOU: whether a changed door was actually PLAYED`);
      console.error(`  lives in wa_round, which this importer never reads. The counts are the`);
      console.error(`  scope, not the cost. Check the rounds before deciding.`);
      for (const c of clashes.slice(0, 8)) console.error(`  x ${c.day}: ${c.why}`);
      if (clashes.length > 8) console.error(`  ...and ${clashes.length - 8} more`);
    }
    const first = Object.keys(previous).sort()[0];
    if (first && first !== launch) {
      console.error(``);
      console.error(`  The calendar already served starts ${first}. Try:  --from=${first}`);
    }
    console.error(`  If you really mean to rewrite what people have played: --rewrite-history`);
    process.exit(1);
  }
  if ((uncovered.length || clashes.length) && REWRITE) {
    console.warn(`REWRITING HISTORY because --rewrite-history was passed: ` +
      `${uncovered.length} uncovered day(s), ${clashes.length} changed day(s).`);
  }


  console.log(`${byName.size} players, ${dated.length} boards, ` +
    `${dated[0].date} to ${dated[dated.length - 1].date}, no gaps`);
  console.log(`every door's player is in the bank and played for that club`);

  /* --check USED TO RETURN HERE, and so never built the SQL at all. CI runs
     --check, so every guard living in the generator below — the keep list
     matching the ids actually written, the served-day comparison against the
     previous calendar — was unreachable from CI and ran only on a real write.
     Proven rather than assumed: a deliberately shortened keep list passed
     --check in silence and would have been caught only by importing for real.
     The generator now always runs; --check skips the WRITE, at the bottom. */

  /* ---- the SQL ---- */
  const lines = [];
  lines.push("-- wa-production.sql — generated by tools/import_whoami.js. Do not edit.");
  /* THE COUNT IS DERIVED, NOT WRITTEN DOWN. This said "3,146 careers" — true of
     this bank on 14 Sep, and stamped into every file generated since, including
     the one carrying 3,237. A figure in prose goes stale without failing, and
     the monorepo session found this one by counting the rows and disbelieving
     the header. Neither generator upstream puts a count in its note for exactly
     this reason. */
  lines.push(`-- GENERATED AND GITIGNORED: it carries ${byName.size} careers, and a career is`);
  lines.push("-- an answer written out. It must never be committed.");
  /* NO BEGIN TRANSACTION, AND NO COMMIT. D1 refuses both outright — "please use
     the state.storage.transaction() APIs instead of the SQL BEGIN TRANSACTION
     or SAVEPOINT statements" — and it refuses the whole file, so the import
     fails at upload with nothing written. This emitted them and was the only
     importer in the repo that did; the other seven had always been plain
     statement lists, so the family had solved this before I invented it. The
     file is applied by `wrangler d1 execute --file`, which does its own
     batching.
     The boards are cleared and rewritten; the bank is upserted. Re-running with
     a new --from must not leave yesterday's calendar behind it. */
  lines.push("DELETE FROM wa_door;");
  lines.push("DELETE FROM wa_board;");

  const emitted = new Set();
  for (const p of byName.values()) {
    const id = fold(p.name);
    emitted.add(id);
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

  /* ---- A PLAYER THE BANK NO LONGER HAS ---------------------------------
   *
   * The bank is UPSERTED and never deleted, which is right — a player row that
   * an old door still points at must not vanish under it. But it means a player
   * REMOVED from the bank stays in wa_player for ever, and wa_player is what
   * /api/whoami/names serves.
   *
   * Found by importing: five alias rows were removed from the bank this morning
   * — KANU beside NWANKWO KANU, BOJAN beside BOJAN KRKIC, and EI UR GU JOHNSEN,
   * which is Eiður Guðjohnsen with the eth deleted rather than folded. The
   * calendar came out correct and the live search still offered every one of
   * them. Typing "KANU" still returned two Kanus, which is the exact defect the
   * bank edit was made to fix.
   *
   * SO: delete a player the bank does not have AND no door points at. Both
   * halves. The second is what makes this safe — it cannot remove anybody an
   * archived board still needs, and if a door does point at a departed player
   * that is a contract-3 failure which has already refused the import above. */
  /* THE KEEP LIST IS THE IDS THIS FILE ACTUALLY WROTE, not a second derivation
     of them. Both used to come from fold(p.name) independently, which agrees
     today and is one keystroke from not agreeing: change the fold, or build the
     list from a different field, and the two drift apart silently. The DELETE
     then keeps nobody, and takes every player the CURRENT calendar does not
     reference — about 1,280 rows, since only ~1,950 distinct ids back doors.
     Nothing downstream refuses that, the counts look plausible to anyone not
     holding the bank, and the names index quietly gets shorter.
     Taking the set from the INSERT loop removes the second derivation entirely.
     The assertion below is belt and braces on top of it. */
  const keep = emitted;
  if (!keep.size || keep.size !== byName.size) {
    console.error(`REFUSED: the keep list holds ${keep.size} ids for ${byName.size} players.`);
    console.error("  These must be the same set — the DELETE below spares exactly the ids this");
    console.error("  file wrote. A short list here removes players the bank still holds.");
    process.exit(1);
  }
  lines.push(
    /* NO DOOR IN *THIS IMPORT'S* CALENDAR POINTS AT THEM, and that is a weaker
       statement than it looks. wa_door has no memory: this file empties it and
       rewrites it above, so the subquery asks the NEW 365 days and not the
       history. What makes the delete safe for a player an ARCHIVED board needs
       is that served days are pinned into that calendar — uncoveredPast and
       servedClash, earlier in this file, are what keep them there.
       So the two halves are not independent, and the consequence of the
       served-day guard failing has grown: a dropped served day used to orphan an
       archive link, which is recoverable by re-importing. It would now also
       remove that day's players in the same run. Same guard, twice the cost. */
    "/* players the bank no longer holds, that no door in this calendar points at */",
    "DELETE FROM wa_player WHERE id NOT IN (SELECT DISTINCT player_id FROM wa_door)" +
      " AND id NOT IN (" + [...keep].map((k) => q(k)).join(", ") + ");");

  if (CHECK) {
    console.log(`--check: nothing written (${lines.length} statements built)`);
    return;
  }

  /* AN OVERRIDE MUST NOT DESTROY THE RECORD IT OVERRODE.
   *
   * The guard's only memory of what was served is the last SQL this importer
   * emitted. Under --rewrite-history that file was overwritten with the very
   * calendar the guard had just refused — so the NEXT run compared against the
   * rewritten version, found no clash, and would have applied in silence.
   *
   * A guard whose memory is the file a refused run overwrites can be disarmed by
   * refusing once and running again. That is not a hypothetical: the operator
   * found it by restoring the previous file by hand, out of caution, and noticing
   * that if they had not, the next run would have gone through clean.
   *
   * So an override writes ALONGSIDE rather than over. The record survives, a
   * later bare run still refuses, and putting the new file in its place is a
   * deliberate act taken after the import has actually been applied — which is
   * the only moment at which the new calendar IS what was served. */
  /* A CLASH, NOT MERELY AN UNCOVERED PAST. uncoveredPast fires when there is no
     previous file at all — a genuine first import — and then there is no record
     to preserve and writing to OUT is right. Only a served day actually CHANGING
     means the file about to be overwritten is the last evidence of what it held. */
  const REWROTE = REWRITE && clashes.length > 0;
  const target = REWROTE ? OUT.replace(/(\.sql)?$/, ".rewritten$1") : OUT;

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, lines.join("\n") + "\n", "utf8");
  console.log(`wrote ${path.relative(ROOT, target)} — ${lines.length} statements`);
  if (REWROTE) {
    console.warn(`  ${path.relative(ROOT, OUT)} is UNCHANGED and still records what was served.`);
    console.warn(`  Apply the file above, then move it over that one — not before. Until you do,`);
    console.warn(`  another run without --rewrite-history will refuse again, which is correct.`);
  }
}

main();
