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
import { execFileSync } from "node:child_process";
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
  /* Eleven doors a board, and the same player twice on purpose: Cech holds
     Chelsea and Arsenal, which the importer must ACCEPT. */
  const door = (club, leave, answer) => ({ club, leave, answer });
  const eleven = [
    door("Newcastle United", 2006, "ALAN SHEARER"),
    door("Chelsea", 2015, "PETR CECH"),
    door("Arsenal", 2019, "PETR CECH"),
    door("Real Madrid", 2021, "MARTIN ØDEGAARD"),
    door("Blackburn Rovers", 1996, "ALAN SHEARER"),
    door("Newcastle United", 2006, "ALAN SHEARER"),
    door("Chelsea", 2015, "PETR CECH"),
    door("Arsenal", 2019, "PETR CECH"),
    door("Real Madrid", 2021, "MARTIN ØDEGAARD"),
    door("Blackburn Rovers", 1996, "ALAN SHEARER"),
    door("Newcastle United", 2006, "ALAN SHEARER"),
  ];
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
      [path.join(ROOT, "tools", "import_whoami.js"), "--source", dir, "--from=2026-10-01", "--check"],
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
