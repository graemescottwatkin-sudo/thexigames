/* friends/whoami/round_test.mjs — a whole sitting in the Friends deck, and
 * football's beside it, run against a stubbed D1.
 *
 *   node friends/whoami/round_test.mjs      (from the repo root)
 *
 * WHY A SITTING AND NOT A FUNCTION. wa-play.js was parameterised by game in two
 * passes, and the second left `${T(game, "guess")}` inside two helpers that have
 * no `game` in scope. A free identifier is valid syntax, so `node --check`
 * passed; a proof that opened a round and bought a rung passed too, because
 * neither helper is on that path. It would have thrown ReferenceError on the
 * FIRST GUESS of every sitting in both games. So this walks the whole thing:
 * open, buy, guess wrong, guess right, finish, and give up.
 *
 * AND BOTH DECKS, EVERY TIME. The point of one server running two games is that
 * football's behaviour did not change; a suite that only exercises the new deck
 * cannot say that. Football's assertions here are the regression half.
 *
 * WHAT A STUB CAN AND CANNOT PROVE. It cannot prove a query — a bound dropped
 * from real SQL passes offline, which is why the live_check exists. What it can
 * prove is that the right TABLE is named, the right binds are passed, and the
 * results are read correctly. So every statement the code prepares is recorded
 * and asserted against, rather than the stub quietly answering everything.
 */
import {
  openRound, buyClue, giveUp, judgeGuess, finishRound, getRound,
} from "../../functions/_lib/wa-play.js";
import { whoamiOf } from "../../functions/_lib/wa-registry.js";

let pass = 0, fail = 0;
const t = (n, ok, d) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`);
};

const FOOTBALL_DOOR = {
  slot: 3, club: "Chelsea", leave_year: 2015, name: "Petr Cech",
  club_history: "Chelsea, Arsenal", article: "/x", club_count: 2,
  clubs: JSON.stringify([{ club: "Chelsea", from: 2004, to: 2015, apps: 333, goals: 0 },
                         { club: "Arsenal", from: 2015, to: 2019, apps: 110, goals: 0 }]),
  birth_year: 1982, nationality: "Czech", position: "GK",
};
const FRIENDS_DOOR = {
  slot: 2, round_letter: "B", card_id: "main-07", name: "Rachel Green",
  section: "Loves & Exes", deck: "main", depth: 12, rounds: 4,
};

/* THE STUB RE-APPLIES EACH RULE IN JS rather than rubber-stamping, which is
   this project's standing rule for stubbed databases: a stub that said yes to
   everything would prove nothing at all. */
function makeEnv(fr) {
  const R = fr ? "fr_wa_round" : "wa_round";
  const G = fr ? "fr_wa_guess" : "wa_guess";
  const rounds = new Map();
  const guesses = [];
  const sql = [];
  const env = { DB: { prepare(text) {
    const q = text.replace(/\s+/g, " ").trim();
    sql.push(q);
    return { bind(...a) { return {
      first: async () => {
        if (/^SELECT \* FROM \w+ WHERE play_id/.test(q)) return rounds.get(a[0]) || null;
        if (/COUNT\(\*\) AS n FROM \w*wa_guess/.test(q)) return { n: guesses.length };
        if (/FROM fr_wa_door/.test(q)) return { ...FRIENDS_DOOR };
        if (/FROM wa_door/.test(q)) return { ...FOOTBALL_DOOR };
        if (/COUNT\(\*\) AS n FROM fr_wa_clue/.test(q)) return { n: 3 };
        if (/FROM fr_wa_clue/.test(q))
          return { n: 5, step: a[2], text: "clue " + a[2], vs: "ep", ep: "S2E14" };
        if (/SELECT clubs FROM wa_player/.test(q)) return { clubs: FOOTBALL_DOOR.clubs };
        return null;
      },
      all: async () => {
        if (/FROM fr_wa_answer/.test(q)) {
          return { results: a[0] === "RACHELGREEN"
            ? [{ card_id: "main-07", kind: "accept", name: "Rachel Green" }]
            : a[0] === "MONICAGELLER"
            ? [{ card_id: "main-01", kind: "accept", name: "Monica Geller" }]
            : [] };
        }
        if (/FROM \w*wa_guess WHERE play_id/.test(q))
          return { results: guesses.map((g, i) => ({ n: i + 1, ...g })) };
        return { results: [] };
      },
      run: async () => {
        if (/^INSERT INTO \w+ \(play_id/.test(q))
          rounds.set(a[0], { play_id: a[0], play_date: a[1], slot: a[2],
                             started_ms: a[3], subs_used: 0, finished: 0, solved: 0 });
        else if (/INSERT OR REPLACE INTO \w*wa_guess/.test(q))
          guesses.push({ guess: a[2], verdict: a[3] });
        else if (/SET subs_used/.test(q)) rounds.get(a[1]).subs_used = a[0];
        else if (/SET finished = 1, solved = 1/.test(q))
          Object.assign(rounds.get(a[2]), { finished: 1, solved: 1, score: a[0], minute: a[1] });
        else if (/SET finished = 1, solved = 0/.test(q))
          Object.assign(rounds.get(a[1]), { finished: 1, solved: 0, score: 0, minute: a[0] });
        return {};
      },
    }; } };
  } } };
  return { env, sql, tables: { R, G } };
}

/* ---- a whole sitting, in each deck --------------------------------------- */

async function sitting(game, slot, wrong, right) {
  const { env, sql } = makeEnv(game === "whoami_fr");
  const open = await openRound(env, "2026-09-22", slot, game);
  const r1 = await getRound(env, open.playId, game);
  const rung1 = await buyClue(env, r1, 1, game);
  const r2 = await getRound(env, open.playId, game);
  const rung2 = await buyClue(env, r2, 2, game);
  const r3 = await getRound(env, open.playId, game);
  const missed = await judgeGuess(env, r3, wrong, game);
  const r4 = await getRound(env, open.playId, game);
  const got = await judgeGuess(env, r4, right, game);
  const r5 = await getRound(env, open.playId, game);
  const done = await finishRound(env, r5, game);
  return { open, rung1, rung2, missed, got, done, sql };
}

console.log("The Friends deck");
{
  const s = await sitting("whoami_fr", 2, "Monica Geller", "Rachel Green");

  t("a door opens and is worth ten before anything is spent",
    s.open.playId && s.open.worthNow === 10, String(s.open.worthNow));
  t("the first clue is free", s.rung1.pointsSpent === 0 && s.rung1.text === "clue 1",
    s.rung1.text);
  t("the second costs four, leaving the door worth six",
    s.rung2.pointsSpent === 4 && s.rung2.worthNow === 6,
    `spent ${s.rung2.pointsSpent}, worth ${s.rung2.worthNow}`);
  t("and a rung says only THAT it has a source, never the episode",
    s.rung2.cited === true && JSON.stringify(s.rung2).indexOf("S2E14") === -1);

  /* THE MIDDLE VERDICT. A name that IS an answer, but to another card — told
     apart from "no such answer" because they are different things to a player.
     NO ANSWER COMES BACK WITH IT: saying who it actually was would end the
     game for the price of a wrong guess, and the door stays live for others. */
  t("naming another card is a near miss, not a mistake", s.missed.verdict === "other",
    s.missed.verdict);
  t("and a wrong guess carries no answer",
    !("answer" in s.missed) && JSON.stringify(s.missed).indexOf("Rachel") === -1);
  t("a wrong guess costs nothing", s.missed.pointsSpent === 4 && s.missed.worthNow === 6);

  t("the right name closes the door and scores what it was worth",
    s.got.verdict === "right" && s.got.solved === true && s.got.score === 6,
    `score ${s.got.score}`);
  t("and the reveal names the card and the door it was behind",
    s.got.answer === "Rachel Green" && s.got.section === "Loves & Exes");
  t("but not the clues still to come, which belong to later outings",
    !("text" in s.got) && !("depth" in s.got) && !("rounds" in s.got));

  t("finish reads the STORED score rather than recomputing it",
    s.done.score === 6 && s.done.solved === true, String(s.done.score));
  t("and counts the near miss under this deck's own word for it",
    s.done.guesses === 2 && s.done.nearMisses === 1,
    `${s.done.guesses} guess(es), ${s.done.nearMisses} near miss`);

  /* THE TABLES, WHICH IS THE CORRECTNESS FIX. wa_round carries no game and a
     round's answer is resolved by (play_date, slot), so a Friends round in
     wa_round would be judged against FOOTBALL's door for that slot. */
  const named = s.sql.join(" ");
  t("every statement it ran named a fr_wa_ table",
    /fr_wa_round/.test(named) && /fr_wa_guess/.test(named) && /fr_wa_door/.test(named));
  t("and not one of them named football's",
    !/\bwa_round\b/.test(named) && !/\bwa_guess\b/.test(named) &&
    !/\bwa_door\b/.test(named) && !/\bwa_player\b/.test(named));
}

console.log("\nGiving up, which is not a substitution");
{
  const { env } = makeEnv(true);
  const open = await openRound(env, "2026-09-22", 2, "whoami_fr");
  const r = await getRound(env, open.playId, "whoami_fr");
  const out = await giveUp(env, r, "whoami_fr");
  t("it ends the door at nothing rather than deducting a price",
    out.score === 0 && out.worthNow === 0 && out.pointsSpent === 0);
  t("and it tells you the card, because that is the whole of what it buys",
    out.answer === "Rachel Green" && out.finished === true && out.solved === false);
}

console.log("\nThe doors this deck deals");
{
  const { env } = makeEnv(true);
  const seven = await openRound(env, "2026-09-22", 7, "whoami_fr");
  t("slot seven is not a door here, though it is one in football",
    seven.error === "no such door", JSON.stringify(seven));
  const nil = await openRound(env, "2026-09-22", 1, "nope");
  t("and an unknown game is refused rather than defaulted to football's",
    nil.error === "no such game", JSON.stringify(nil));
  t("the registry agrees there are three", whoamiOf("whoami_fr").data.DOORS === 3);
}

console.log("\nFootball, unchanged");
{
  const s = await sitting(undefined, 3, "Thibaut Courtois", "Petr Cech");

  t("its door still opens on the family curve, not on ten",
    s.open.worthNow > 100, String(s.open.worthNow));
  t("its first rung is still the spell", !!s.rung1.spell && s.rung1.spell.club === "Chelsea");
  t("its second still costs twenty", s.rung2.pointsSpent === 20, String(s.rung2.pointsSpent));
  t("and still returns the career as spells rather than a sentence",
    Array.isArray(s.rung2.spells) && s.rung2.spells.length === 2);
  t("a right answer still reads answer, career and article",
    s.got.verdict === "right" && s.got.answer === "Petr Cech" &&
    s.got.career === "Chelsea, Arsenal" && s.got.article === "/x");
  t("and finish still adds the club, which only it has ever carried",
    s.done.club === "Chelsea");

  const named = s.sql.join(" ");
  t("every statement it ran named football's tables",
    /\bwa_round\b/.test(named) && /\bwa_guess\b/.test(named) && /\bwa_door\b/.test(named));
  t("and not one of them named the Friends deck's",
    !/fr_wa_/.test(named));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
