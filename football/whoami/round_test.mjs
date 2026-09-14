/* whoami/round_test.mjs — what leaves the server, and what a door costs.
 *
 * THE ASSERTION THIS FILE EXISTS FOR is the first block: no answer, and no
 * career, in anything a browser is handed before it has been paid for.
 *
 * Who Am I is the hardest secrecy problem in this family so far, and the reason
 * is arithmetic rather than principle. Only ONE door is played per person per
 * day and the other ten stay live for everyone else, so a leak does not spoil
 * one answer — it spoils ten answers for every other player that day. QuickFire
 * leaked eleven answers to one person; this would leak ten to all of them.
 *
 * AND THE CAREER IS THE ANSWER, not a hint that happens to be strong.
 * "Cobreloa, Udinese, Barcelona, Arsenal, Man United, Inter" is Sanchez to
 * anyone who can read. So `club_history` is treated here exactly as QuickFire
 * treats `answer`.
 *
 * Nothing below re-implements a rule. The ladder, its costs and what each rung
 * may reveal are read from the same config the page reads, so a test cannot
 * pass by agreeing with its own copy.
 *
 *   node football/whoami/round_test.mjs      (from the repo root)
 */
import { fold, publicDoor, SECRET_FIELDS } from "../../functions/_lib/wadata.js";
import {
  LADDER, DOORS, SUBS, stageAt, costToReach, clueBody,
  openRound, buyClue, judgeGuess, finishRound,
} from "../../functions/_lib/wa-play.js";
import CONFIG from "../../football/whoami/js/config.js";
import fs from "node:fs";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* The row as the database holds it — every secret in one object, which is what
   makes it the right fixture: anything that escapes is visible. */
const CECH = {
  id: "PETRCECH", name: "PETR CECH", search_key: "PETRCECH",
  nationality: "Czech Republic", position: "Goalkeeper",
  birth_year: 1982, birth_place: "Plzen", main_club: "Chelsea", club_count: 5,
  club_history: "1999-2001 Chmel Blsany (27) - 2001-2002 Sparta Prague (27) - " +
    "2002-2004 Rennes (70) - 2004-2015 Chelsea (333) - 2015-2019 Arsenal (110)",
  clubs: JSON.stringify([
    { club: "Chmel Blsany", from: 1999, to: 2001, apps: 27, goals: 0 },
    { club: "Sparta Prague", from: 2001, to: 2002, apps: 27, goals: 0 },
    { club: "Rennes", from: 2002, to: 2004, apps: 70, goals: 0 },
    { club: "Chelsea", from: 2004, to: 2015, apps: 333, goals: 0 },
    { club: "Arsenal", from: 2015, to: 2019, apps: 110, goals: 0 },
  ]),
  caps: "124", article: "https://en.wikipedia.org/wiki/Petr_Cech", status: "verified",
  /* the door's own columns, as doorAnswer() returns them joined */
  slot: 2, club: "Chelsea", leave_year: 2015,
};

/* A STUB THAT REFUSES THINGS. It re-applies each rule in JS rather than
   rubber-stamping — a stub that agreed with whatever it was sent would prove
   the code can talk to itself. It also hands back COPIES: an earlier stub in
   this project returned the live row, so an UPDATE mutated the object a
   response had already been computed from and a working function looked like it
   double-charged. */
function db(round, opts = {}) {
  const row = { ...round };
  const guesses = [];
  const roster = opts.roster || { CHELSEA: ["PETRCECH", "DIDIERDROGBA"] };
  return {
    env: {
      DB: {
        prepare(sql) {
          return {
            bind(...a) {
              return {
                async first() {
                  if (/FROM wa_round/.test(sql)) return { ...row };
                  if (/COUNT\(\*\)/.test(sql)) return { n: guesses.length };
                  if (/FROM wa_door/.test(sql)) {
                    return Number(a[1]) === row.slot ? { ...CECH } : null;
                  }
                  if (/SELECT clubs FROM wa_player/.test(sql)) {
                    /* Does THIS player have that club? The real query reads the
                       career; the stub answers from a roster so the test can
                       control it. */
                    const key = String(a[0]);
                    const has = Object.values(roster).some((names) => names.includes(key));
                    return has ? { clubs: CECH.clubs } : null;
                  }
                  return null;
                },
                async all() {
                  if (/FROM wa_guess/.test(sql)) return { results: guesses.map((g) => ({ ...g })) };
                  return { results: [] };
                },
                async run() {
                  if (/INSERT OR REPLACE INTO wa_guess/.test(sql)) {
                    guesses.push({ n: a[1], guess: a[2], verdict: a[3] });
                  } else if (/UPDATE wa_round SET subs_used = \?, finished/.test(sql)) {
                    row.subs_used = a[0]; row.finished = a[1];
                  } else if (/UPDATE wa_round SET finished = 1, solved = 1/.test(sql)) {
                    row.finished = 1; row.solved = 1;
                  } else if (/UPDATE wa_round SET subs_used = \? WHERE/.test(sql)) {
                    row.subs_used = a[0];
                  }
                  return { success: true };
                },
              };
            },
          };
        },
      },
    },
    row, guesses,
  };
}

const ROUND = { play_id: "p1", play_date: "2026-09-15", slot: 2,
  started_ms: 1000, subs_used: 0, finished: 0, solved: 0 };

console.log("=== A door, as a browser may see it ===");
{
  const shown = publicDoor({ slot: 2, club: "Chelsea", leave_year: 2015, player_id: "PETRCECH" });
  t("a door is a club and a year", shown.club === "Chelsea" && shown.leave === 2015);
  t("and carries no player_id", !("player_id" in shown),
    "eleven of these a day, ten still live for other players when you finish");
  t("nothing in a door names the answer",
    !JSON.stringify(shown).toUpperCase().includes("CECH"));
  t("the secret list names the career as well as the answer",
    SECRET_FIELDS.includes("clubs") && SECRET_FIELDS.includes("club_history") &&
    SECRET_FIELDS.includes("name"),
    "the career IS the answer, written out");
}

console.log("\n=== getBoard sends doors and unattributed counts ===");
{
  /* STRIPPED, because a comment naming a thing trips a check meant to be about
     the code — this project's own rule, met in three files now. */
  const src = fs.readFileSync("functions/_lib/wadata.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
  const fn = src.slice(src.indexOf("export async function getBoard"),
                       src.indexOf("export async function doorAnswer"));
  t("the board's own SELECT does not read the career",
    !/club_history/.test(fn) && !/p\.clubs/.test(fn),
    "a column not selected cannot be sent by accident");
  t("and the counts it returns are sorted, not in slot order",
    /careers[\s\S]*sort\(/.test(fn),
    "in slot order they would be attributed, which narrows eleven doors to a handful");
  t("a short board is refused rather than served",
    /!== 11\) return null/.test(fn),
    "ten doors is a board whose eleventh answer failed to resolve");
}

console.log("\n=== The ladder is the config's, not a copy ===");
{
  t("the rungs are the config's", LADDER === CONFIG.LADDER, "one table, read by both sides");
  t("and the door count", DOORS === CONFIG.DOORS_PER_BOARD, String(DOORS));
  t("the substitutions are derived from the ladder, not stated",
    SUBS === LADDER.reduce((a, s) => a + s.cost, 0), String(SUBS));
  t("the first rung is free", stageAt(1).cost === 0);
  t("and reaching it costs nothing", costToReach(1) === 0);
  t("each later rung costs one more than the last",
    costToReach(2) === 1 && costToReach(3) === 2 && costToReach(4) === 3,
    `${costToReach(2)}, ${costToReach(3)}, ${costToReach(4)}`);
  t("a rung the ladder does not define is not a rung", stageAt(9) === null);
}

console.log("\n=== What each rung may say, and nothing more ===");
{
  const door = { club: "Chelsea", leave_year: 2015 };
  const one = clueBody(CECH, stageAt(1).reveals, door);
  t("stage one gives the door's own spell", !!one.spell && one.spell.apps === 333);
  /* THE SHARPEST ASSERTION IN THIS FILE. A player with five clubs has five
     spells, and four of them are the career by instalments. */
  t("and not the other four spells", !JSON.stringify(one).includes("Rennes") &&
    !JSON.stringify(one).includes("Sparta"),
    "five spells is the career delivered one clue at a time");
  t("stage one names nobody", !JSON.stringify(one).toUpperCase().includes("CECH"));
  t("stage one gives no age and no country",
    !("age" in one) && !("nationality" in one));

  const two = clueBody(CECH, stageAt(2).reveals, door);
  t("stage two is the career, once it is paid for", /Rennes/.test(two.career));
  t("and still names nobody", !JSON.stringify(two).toUpperCase().includes("PETR"));

  const three = clueBody(CECH, stageAt(3).reveals, door);
  t("stage three is age and country", three.nationality === "Czech Republic" && three.age > 0);
  /* THE YEAR IS SHARPER THAN THE AGE and the ladder says age, so the year must
     not travel — a page cannot be handed it and asked not to look. */
  t("and the birth YEAR does not travel, only the age",
    !JSON.stringify(three).includes("1982"), `age ${three.age}`);
  t("stage three does not give the birthplace either",
    !JSON.stringify(three).includes("Plzen"));

  const four = clueBody(CECH, stageAt(4).reveals, door);
  t("stage four is the reveal, which is what it costs a substitution for",
    four.answer === "PETR CECH");
}

console.log("\n=== Buying a rung ===");
{
  const { env, row } = db(ROUND);
  const two = await buyClue(env, { ...ROUND }, 2);
  t("stage two charges one substitution", two.subsUsed === 1 && row.subs_used === 1);
  t("and leaves the rest", two.subsLeft === SUBS - 1, String(two.subsLeft));

  /* A RELOAD IS NOT A SECOND PURCHASE. Codeword found this shape in its own
     demo, where a clock could be rewound for free. */
  const again = await buyClue(env, { ...ROUND, subs_used: 2 }, 2);
  t("a rung already paid for is served again for nothing",
    again.replayed === true && again.subsUsed === 2,
    "a reload must not be a second purchase");

  const closed = await buyClue(env, { ...ROUND, finished: 1 }, 2);
  t("a closed door sells nothing", !!closed.error, closed.error || "no refusal");

  const nope = await buyClue(env, { ...ROUND }, 9);
  t("and neither does a rung that does not exist", !!nope.error, nope.error || "no refusal");
}

console.log("\n=== Giving up closes the door ===");
{
  const { env, row } = db(ROUND);
  const out = await buyClue(env, { ...ROUND }, 4);
  t("the reveal names him", out.answer === "PETR CECH");
  t("and the door is closed, so it cannot be bought twice",
    out.finished === true && row.finished === 1);
  t("and it is not recorded as solved", out.solved === false && !row.solved);
}

console.log("\n=== Naming him ===");
{
  const { env, row } = db(ROUND);
  const right = await judgeGuess(env, { ...ROUND }, "Petr Cech");
  t("the right name is right", right.verdict === "right" && right.solved === true);
  t("case and spacing do not decide it", fold("  petr  cech ") === "PETRCECH");
  t("and the door closes", row.finished === 1 && row.solved === 1);
  t("the answer comes back only now that it is over", right.answer === "PETR CECH");
}

console.log("\n=== The near miss, which only this side can judge ===");
{
  /* NAMING SOMEBODY WHO REALLY DID PLAY FOR THAT CLUB is its own outcome. It is
     the one wrong answer that proves the player understood the door, and
     deciding it on the page would need the club's whole roster — which is a
     candidate list for the door. */
  const { env } = db(ROUND, { roster: { CHELSEA: ["DIDIERDROGBA"] } });
  const near = await judgeGuess(env, { ...ROUND }, "Didier Drogba");
  t("a Chelsea player who is not him is a near miss", near.verdict === "right-club",
    "the roster is never sent, so the page could not decide this");
  t("and it costs nothing by default",
    near.subsUsed === 0 && CONFIG.WRONG_PLAYER_SAME_CLUB_COSTS_SUB === false);
  /* THE ASSERTION THAT MATTERS MOST HERE. */
  t("a near miss does not say who it actually was",
    !JSON.stringify(near).toUpperCase().includes("CECH") && !("answer" in near),
    "or the game ends for the price of a wrong guess");
  t("and does not close the door", near.finished === false);
}

console.log("\n=== A plain wrong name ===");
{
  const { env } = db(ROUND, { roster: {} });
  const out = await judgeGuess(env, { ...ROUND }, "Alan Shearer");
  t("somebody who never played there is simply wrong", out.verdict === "wrong");
  t("and is told nothing else",
    !("answer" in out) && !("career" in out) &&
    !JSON.stringify(out).toUpperCase().includes("CECH"));
  const empty = await judgeGuess(env, { ...ROUND }, "   ");
  t("an empty guess is refused rather than marked wrong", !!empty.error,
    empty.error || "no refusal");
}

console.log("\n=== What the sitting came to ===");
{
  const { env } = db(ROUND);
  const open = await finishRound(env, { ...ROUND });
  t("a door still in play reports no answer", !("answer" in open),
    "asking to finish must not be a way to read it");
  t("and says so", open.finished === false && open.solved === false);

  const done = await finishRound(env, { ...ROUND, finished: 1, solved: 1, subs_used: 2 });
  t("a closed door reports the answer and what it cost",
    done.answer === "PETR CECH" && done.subsUsed === 2 && done.solved === true);
  t("and the day and door it was", done.day === "2026-09-15" && done.slot === 2);
}

console.log("\n=== Opening a door ===");
{
  const { env } = db(ROUND);
  const bad = await openRound(env, "2026-09-15", 0);
  t("door nought is not a door", !!bad.error, bad.error || "no refusal");
  const past = await openRound(env, "2026-09-15", DOORS + 1);
  t("nor is one past the eleventh", !!past.error, past.error || "no refusal");
  const ok = await openRound(env, "2026-09-15", 2);
  t("and a real door opens at stage one with every substitution intact",
    !ok.error && ok.stage === 1 && ok.subsLeft === SUBS);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
