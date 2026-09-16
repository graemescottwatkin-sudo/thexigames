/* import_whoami_test.mjs — the Who Am I importer's contract, proved by running it.
 *
 * AGAINST FIXTURES IN A TEMP DIRECTORY, never the real bank. Two reasons and
 * both are load-bearing. A CI runner has no bank beside the checkout — the
 * source lives outside the repo, as every bank in this family does — so a suite
 * that read the real one would pass here and fail there for a reason that has
 * nothing to do with the code. And the importer WRITES data/wa-production.sql
 * relative to its own root, so a passing case run carelessly would overwrite
 * five megabytes of generated SQL; every case here runs --check, which writes
 * nothing.
 *
 * SPAWNED RATHER THAN IMPORTED. The file is a program that reads two files and
 * exits; there is nothing to call. What can be proved is what it REFUSES, which
 * is the whole point of it — an importer that accepts everything is a copy
 * step.
 *
 * Each refusal below was a decision about the data, and two of them were
 * decisions I got wrong first:
 *
 *   - "the same player behind two doors" was refused, and rejected all 365
 *     real boards. Every one has between one and five, because a player with
 *     two doors can hold both: Distin left Manchester City in 2007 and Everton
 *     in 2015. Two doors, two years, one correct answer each, and nobody is
 *     told they are wrong for being right. The real invariant is a repeated
 *     CLUB, which would be two identical doors.
 *   - the fold deleted O-slash, ash and thorn instead of folding them, because
 *     NFD does not decompose a letter that is not an accented one. Odegaard
 *     folded to MARTINDEGAARD and could never have been guessed.
 *
 *   node tools/import_whoami_test.mjs      (from the repo root)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* A minimal bank and a two-day calendar that the importer must ACCEPT. Every
   case below is this, with one thing broken. */
function fixture() {
  const players = [
    { name: "ALAN SHEARER", searchKey: "ALANSHEARER", nationality: "England",
      position: "Forward", birthYear: 1970, mainClub: "Newcastle United",
      clubCount: 2, clubHistory: "1992-1996 Blackburn (138) - 1996-2006 Newcastle (303)",
      clubs: [{ club: "Blackburn Rovers", from: 1992, to: 1996, apps: 138, goals: 112, loan: false },
              { club: "Newcastle United", from: 1996, to: 2006, apps: 303, goals: 148, loan: false }],
      caps: "63", doors: [{ club: "Newcastle United", leave: 2006 }] },
    { name: "PETR CECH", searchKey: "PETRCECH", nationality: "Czech Republic",
      position: "Goalkeeper", birthYear: 1982, mainClub: "Chelsea",
      clubCount: 2, clubHistory: "2004-2015 Chelsea (333) - 2015-2019 Arsenal (110)",
      clubs: [{ club: "Chelsea", from: 2004, to: 2015, apps: 333, goals: 0, loan: false },
              { club: "Arsenal", from: 2015, to: 2019, apps: 110, goals: 0, loan: false }],
      caps: "124", doors: [{ club: "Chelsea", leave: 2015 }, { club: "Arsenal", leave: 2019 }] },
    /* THE ACCENTED ONE, and the reason this fixture is not all plain ASCII.
       O-slash is a letter rather than an accented O, so NFD leaves it whole and
       a naive strip deletes it. */
    { name: "MARTIN ØDEGAARD", searchKey: "MARTINODEGAARD", nationality: "Norway",
      position: "Midfielder", birthYear: 1998, mainClub: "Arsenal",
      clubCount: 2, clubHistory: "2015-2021 Real Madrid (11) - 2021- Arsenal (150)",
      clubs: [{ club: "Real Madrid", from: 2015, to: 2021, apps: 11, goals: 1, loan: false },
              { club: "Arsenal", from: 2021, to: 2024, apps: 150, goals: 30, loan: false }],
      caps: "60", doors: [{ club: "Real Madrid", leave: 2021 }] },
  ];
  /* Eleven doors a board, and the same player behind two of them on purpose:
     Cech holds Chelsea and Arsenal, which the importer must ACCEPT. */
  const door = (club, leave, answer) => ({ club, leave, answer });
  /* The clubs must be distinct within a board, so give each slot its own. */
  const clubs = ["Newcastle United", "Chelsea", "Arsenal", "Real Madrid", "Blackburn Rovers"];
  const doors = [];
  const owner = { "Newcastle United": "ALAN SHEARER", "Blackburn Rovers": "ALAN SHEARER",
    "Chelsea": "PETR CECH", "Arsenal": "PETR CECH", "Real Madrid": "MARTIN ØDEGAARD" };
  const leave = { "Newcastle United": 2006, "Blackburn Rovers": 1996, "Chelsea": 2015,
    "Arsenal": 2019, "Real Madrid": 2021 };
  /* Eleven distinct clubs are needed; the five real ones plus six invented
     doors owned by Shearer via an extra club each. */
  for (const c of clubs) doors.push(door(c, leave[c], owner[c]));
  for (let i = 1; i <= 6; i++) {
    const c = "Club " + i;
    players[0].clubs.push({ club: c, from: 1990, to: 1991, apps: 1, goals: 0, loan: false });
    doors.push(door(c, 1991, "ALAN SHEARER"));
  }
  const boards = [
    { date: "2026-10-01", day: 1, doors: doors.map((d) => ({ ...d })) },
    { date: "2026-10-02", day: 2, doors: doors.map((d) => ({ ...d })) },
  ];
  return { bank: { players }, sched: { boards } };
}

function run(mutate, label, expect, shouldPass = false) {
  const { bank, sched } = fixture();
  const b = JSON.parse(JSON.stringify(bank));
  const s = JSON.parse(JSON.stringify(sched));
  if (mutate) mutate(b, s);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-import-"));
  fs.writeFileSync(path.join(dir, "whoami-bank.json"), JSON.stringify(b));
  fs.writeFileSync(path.join(dir, "board-schedule.json"), JSON.stringify(s));
  let out = "", code = 0;
  try {
    out = execFileSync(process.execPath,
      /* --out TO A DISPOSABLE PATH, even for --check. The importer reads the
         previous calendar from --out to see whether this import would rewrite
         a day that has been served; left at the default it reads the REAL
         data/wa-production.sql, and these two-board fixtures would then be
         asked why they do not cover the days the live game has served. A
         contract test should not depend on what production happens to hold. */
      [path.join(ROOT, "tools", "import_whoami.mjs"), "--source", dir, "--from=2026-10-01",
       "--out=" + path.join(dir, "check.sql"), "--check"],
      { encoding: "utf8", stdio: "pipe", cwd: ROOT });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "");
    code = e.status || 1;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  if (shouldPass) {
    t(label, code === 0, code === 0 ? out.split("\n")[0] : out.split("\n").slice(0, 2).join(" | "));
  } else {
    t(label, code !== 0 && out.includes(expect),
      code === 0 ? "ACCEPTED — the refusal did not fire" : (out.match(/^\s+.*$/m) || [""])[0].trim().slice(0, 70));
  }
}

console.log("=== A good bank is accepted ===");
run(null, "a clean bank and calendar import", null, true);

console.log("\n=== What it refuses ===");
run((b, s) => { s.boards[0].doors.pop(); },
  "a board with ten doors", "a board is eleven");
run((b, s) => { s.boards[0].doors[1].club = s.boards[0].doors[0].club; },
  "the same club behind two doors on one board", "behind two doors");
run((b, s) => { s.boards[0].doors[0].answer = "NOBODY AT ALL"; },
  "a door whose answer is not in the bank", "is not in the bank");
run((b, s) => { s.boards[0].doors[0].club = "Juventus"; },
  "a door whose player never played for that club", "never played for");
run((b, s) => { b.players.push({ ...b.players[0], name: b.players[0].name + "!" }); },
  "two names that fold to one key", "fold to the same key");
run((b, s) => { s.boards[1].date = "2099-01-01"; },
  "a gap in the calendar", "not one");
run((b, s) => { b.players[2].searchKey = "MARTINDEGAARD"; },
  "a stored key that is not the fold of its name", "is not the fold of the name");

console.log("\n=== The fold, which decides whether a name can be typed at all ===");
{
  /* THE IMPORTER'S FOLD AND THE SERVER'S MUST AGREE, or a name imports under
     one spelling and is guessed under another. The server's half lives in
     functions/_lib/wadata.js; this asserts the importer's by behaviour, since
     a bank whose keys disagree with it is refused above. */
  run((b, s) => { b.players[2].name = "MARTIN ØDEGAARD"; b.players[2].searchKey = "MARTINODEGAARD"; },
    "O-slash folds to O rather than being deleted", null, true);
  run((b, s) => {
    b.players[2].name = "BJARNE GOLDBÆK";
    b.players[2].searchKey = "BJARNEGOLDBAEK";
    b.players[2].doors = [{ club: "Real Madrid", leave: 2021 }];
    s.boards.forEach((bd) => bd.doors.forEach((d) => {
      if (d.answer === "MARTIN ØDEGAARD") d.answer = "BJARNE GOLDBÆK";
    }));
  }, "ash folds to AE, so the stored key matches", null, true);
}

console.log("\n=== The SQL it emits is SQL D1 will accept ===");
{
  /* GENERATED FOR REAL AND READ BACK, not asserted about the source. The first
     version of this importer wrapped its output in BEGIN TRANSACTION … COMMIT,
     which D1 refuses outright — "please use the state.storage.transaction()
     APIs instead of the SQL BEGIN TRANSACTION or SAVEPOINT statements" — and it
     refuses the WHOLE FILE, so the import died at upload with nothing written
     and a five-megabyte file that looked perfectly good on disk.
     It was the only importer in this repo that emitted them; the other seven
     had always been plain statement lists. The family had solved this before I
     invented it, and nothing was checking, because every case above runs
     --check and --check writes nothing. A generator whose OUTPUT is never
     inspected is tested up to the point that matters. */
  const { bank, sched } = fixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-sql-"));
  fs.writeFileSync(path.join(dir, "whoami-bank.json"), JSON.stringify(bank));
  fs.writeFileSync(path.join(dir, "board-schedule.json"), JSON.stringify(sched));
  const out = path.join(dir, "out.sql");
  let ok = true;
  try {
    execFileSync(process.execPath,
      [path.join(ROOT, "tools", "import_whoami.mjs"), "--source", dir,
       "--from=2026-10-01", "--out=" + out],
      { encoding: "utf8", stdio: "pipe", cwd: ROOT });
  } catch (e) { ok = false; }
  t("it writes a file when not in --check", ok && fs.existsSync(out));

  const sql = ok && fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  t("and D1 will take it: no BEGIN TRANSACTION, no COMMIT, no SAVEPOINT",
    !/\bBEGIN\s+TRANSACTION\b/i.test(sql) && !/^\s*COMMIT\s*;/im.test(sql) &&
    !/\bSAVEPOINT\b/i.test(sql),
    "D1 refuses the whole file, so the import dies at upload");
  t("the calendar is cleared before it is rewritten",
    /DELETE FROM wa_door;/.test(sql) && /DELETE FROM wa_board;/.test(sql),
    "re-running with a new --from must not leave yesterday's calendar behind");
  /* THE BANK IS STILL UPSERTED. This asserted that the word DELETE never
     appears against wa_player at all, which was the right way to say it while
     nothing deleted a player — and it is the assertion that caught the orphan
     cleanup being added, correctly, because that IS a change to this rule.
     The rule it protects is "a player row must not vanish under an archived
     board". A blanket ban is one way to guarantee that; the narrower statement
     below is another, and it also removes a player the bank has dropped — which
     the blanket version left in wa_player for ever, and wa_player is what the
     search serves. Five aliases survived a correct import that way and the live
     game went on offering two Kanus.
     So: no unconditional delete, and the conditional one must carry BOTH of its
     halves. A delete missing either half is the failure this replaces. */
  t("the bank is upserted, never wholesale deleted",
    /INSERT OR REPLACE INTO wa_player/.test(sql) && !/DELETE FROM wa_player;/.test(sql));
  const orphan = (sql.match(/DELETE FROM wa_player WHERE[^;]*;/) || [])[0] || "";
  /* THE SPARE LIST IS EXACTLY WHAT THE FILE WROTE. The delete keeps every id in
     its NOT IN list; if that list is short by one, that player is removed while
     their INSERT sits above it in the same file. Counting both sides in the
     EMITTED SQL catches a drift between them however it arises — a changed fold,
     a list built from the wrong field — which reading the source cannot. */
  const inserted = (sql.match(/INSERT OR REPLACE INTO wa_player /g) || []).length;
  const spared = (orphan.match(/'/g) || []).length / 2;
  t("the delete spares exactly the players this file inserted",
    inserted > 0 && spared === inserted, `${spared} spared, ${inserted} inserted`);
  t("and a player the bank dropped is removed only if no door points at it",
    /NOT IN \(SELECT DISTINCT player_id FROM wa_door\)/.test(orphan) &&
    /AND id NOT IN \(/.test(orphan),
    orphan ? orphan.slice(0, 96) + "…" : "no conditional delete emitted at all");
  t("every board gets eleven doors in the SQL",
    (sql.match(/INSERT OR REPLACE INTO wa_door/g) || []).length === 22,
    "two boards of eleven");
  /* AND THE APOSTROPHE, because a career string is full of them and one
     unescaped quote ends the statement and starts a syntax error 3,000 lines
     long. */
  t("a name with an apostrophe is escaped rather than ending the statement", (() => {
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "wa-quote-"));
    const b = JSON.parse(JSON.stringify(bank));
    const s2 = JSON.parse(JSON.stringify(sched));
    b.players[0].name = "SHAY O'SHEA";
    b.players[0].searchKey = "SHAYOSHEA";
    s2.boards.forEach((bd) => bd.doors.forEach((d) => {
      if (d.answer === "ALAN SHEARER") d.answer = "SHAY O'SHEA";
    }));
    fs.writeFileSync(path.join(d2, "whoami-bank.json"), JSON.stringify(b));
    fs.writeFileSync(path.join(d2, "board-schedule.json"), JSON.stringify(s2));
    const o2 = path.join(d2, "out.sql");
    try {
      execFileSync(process.execPath,
        [path.join(ROOT, "tools", "import_whoami.mjs"), "--source", d2,
         "--from=2026-10-01", "--out=" + o2], { encoding: "utf8", stdio: "pipe", cwd: ROOT });
    } catch (e) { return false; }
    const got = fs.readFileSync(o2, "utf8");
    fs.rmSync(d2, { recursive: true, force: true });
    return got.includes("'SHAY O''SHEA'");
  })(), "one unescaped quote is a syntax error three thousand lines long");

  fs.rmSync(dir, { recursive: true, force: true });
}



/* ---- (9) AND (10): THE SERVED DAYS -----------------------------------------
 *
 * TRIGGERED, NOT READ. The guard's line ordering was checked by eye first and
 * that proves the call comes before the write; it does not prove the call is
 * REACHED. So each case below runs the importer for real and asserts three
 * things: the exit code, the refusal naming the right day, and — the one that
 * caught a weaker version of this test — that the output file has not been
 * touched. Asserting the file merely EXISTS passes on a run that refused and
 * then overwrote it with identical bytes.
 */
console.log("\nThe days that have been served");
{
  const yday = (n) => {
    const d = new Date(Date.now() - n * 86400000);
    return d.toISOString().slice(0, 10);
  };
  /* A calendar that starts BEFORE today, so the guard is in scope at all: two
     days already served, then today, then tomorrow. CONSECUTIVE — the importer
     refuses a gap, and a fixture that skips today fails contract 7 before ever
     reaching the guard these cases are about. */
  const served1 = yday(2), served2 = yday(1), todayD = yday(0), future = yday(-1);
  const RUN = [served1, served2, todayD, future];

  const makeSource = (dates) => {
    const { bank, sched } = fixture();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-served-"));
    sched.boards = dates.map((date, i) => ({
      date, day: i + 1, doors: sched.boards[0].doors.map((d) => ({ ...d })),
    }));
    fs.writeFileSync(path.join(dir, "whoami-bank.json"), JSON.stringify(bank));
    fs.writeFileSync(path.join(dir, "board-schedule.json"), JSON.stringify(sched));
    return dir;
  };
  /* BOTH STREAMS, ON SUCCESS AS WELL AS ON FAILURE. execFileSync returns stdout
     only, and the override announces itself on stderr — so a test reading the
     return value alone cannot see "REWRITING HISTORY", and would pass a run
     that rewrote history silently. spawnSync gives both whatever the exit. */
  const runImport = (dir, from, out, extra = []) => {
    const r = spawnSync(process.execPath,
      [path.join(ROOT, "tools", "import_whoami.mjs"), "--source", dir,
       "--from=" + from, "--out=" + out, ...extra],
      { encoding: "utf8", cwd: ROOT });
    return { code: r.status || 0, out: (r.stdout || "") + (r.stderr || "") };
  };

  /* Establish a calendar that has served two days. */
  const base = makeSource(RUN);
  const out = path.join(base, "prod.sql");
  const first = runImport(base, served1, out, ["--rewrite-history"]);
  t("a first import of a past-dated calendar goes through with --rewrite-history",
    first.code === 0 && fs.existsSync(out), first.out.split("\n").slice(0, 2).join(" | "));

  const before = fs.statSync(out).mtimeMs;
  const bytesBefore = fs.readFileSync(out, "utf8").length;

  /* (9) the served days are simply gone: a calendar starting tomorrow. */
  const dropped = makeSource([future]);
  const r9 = runImport(dropped, future, out);
  t("REFUSES a calendar that does not reach back to the served days",
    r9.code === 1 && /REFUSED/.test(r9.out) && r9.out.includes(served1),
    r9.out.split("\n")[0]);
  t("  and writes nothing — mtime unchanged, not merely 'the file exists'",
    fs.statSync(out).mtimeMs === before && fs.readFileSync(out, "utf8").length === bytesBefore);

  /* (10) the served days are present and DIFFERENT. */
  const changed = makeSource(RUN);
  {
    const p = path.join(changed, "board-schedule.json");
    const s = JSON.parse(fs.readFileSync(p, "utf8"));
    /* SWAP TWO SLOTS rather than invent a club. Renaming a door's club also
       breaks contract 4 — that player never played for "Somewhere Else" — so
       the run refuses for the wrong reason and the test passes while proving
       nothing about the guard. A swap is a genuinely different board that is
       still entirely legal. */
    const d = s.boards[0].doors;
    [d[0], d[1]] = [d[1], d[0]];
    fs.writeFileSync(p, JSON.stringify(s));
  }
  const r10 = runImport(changed, served1, out);
  t("REFUSES a served day whose board would change",
    r10.code === 1 && /at or before today would change/.test(r10.out) && r10.out.includes(served1),
    r10.out.split("\n").find((l) => l.includes("slot")) || r10.out.split("\n")[0]);
  t("  and writes nothing", fs.statSync(out).mtimeMs === before);

  /* THE HONEST CASE IS CHECKED BEFORE THE OVERRIDE, and the order is the point:
     --rewrite-history deliberately replaces the served board, so anything run
     after it is comparing against history that has just been rewritten. Asked
     the other way round, "an unchanged re-import is allowed" failed — correctly,
     and for a reason that had nothing to do with the guard. */
  const same = makeSource(RUN);
  const r12 = runImport(same, served1, out);
  t("an import that keeps the served days unchanged is allowed",
    r12.code === 0, r12.out.split("\n").slice(0, 2).join(" | "));

  /* The override exists, says what it is doing, and lets it through. */
  const r11 = runImport(changed, served1, out, ["--rewrite-history"]);
  t("--rewrite-history lets it through and says so",
    r11.code === 0 && /REWRITING HISTORY/.test(r11.out), r11.out.split("\n")[0]);

  [base, dropped, changed, same].forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
