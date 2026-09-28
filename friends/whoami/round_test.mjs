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
        /* DAILY ROUNDS ARE READ THROUGH fr_wa_daily_clue, joined to the full
           card for the sentence — verified clues only, since 23 Sep 2026. A
           daily door reading fr_wa_clue by its letter is the wrong table, and
           answers nothing here so the sitting fails rather than passing on it. */
        if (/COUNT\(\*\) AS n FROM fr_wa_daily_clue/.test(q)) return { n: 3 };
        if (/FROM fr_wa_daily_clue d JOIN fr_wa_clue c/.test(q))
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
            : a[0] === "APARTMENT"
            ? [{ card_id: "main-07", kind: "suggest", name: "Rachel Green" },
               { card_id: "main-01", kind: "suggest", name: "Monica Geller" }]
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

  /* THE OWNER'S RULES, 28 Sep 2026: a card is worth 18 untouched, the second
     and third clues cost 5 each, and a wrong guess costs 1. */
  t("a card opens and is worth eighteen before anything is spent",
    s.open.playId && s.open.worthNow === 18, String(s.open.worthNow));
  t("the first clue is free", s.rung1.pointsSpent === 0 && s.rung1.text === "clue 1",
    s.rung1.text);
  t("the second costs five, leaving the card worth thirteen",
    s.rung2.pointsSpent === 5 && s.rung2.worthNow === 13,
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
  t("a wrong guess costs a point: thirteen becomes twelve",
    s.missed.pointsSpent === 5 && s.missed.worthNow === 12 && s.missed.wrongs === 1 && s.missed.ring === 1,
    `worth ${s.missed.worthNow}, wrongs ${s.missed.wrongs}, ring ${s.missed.ring}`);

  t("the right name closes the door and scores what it was worth",
    s.got.verdict === "right" && s.got.solved === true && s.got.score === 12,
    `score ${s.got.score}`);
  t("and the reveal names the card and the door it was behind",
    s.got.answer === "Rachel Green" && s.got.section === "Loves & Exes");
  t("but not the clues still to come, which belong to later outings",
    !("text" in s.got) && !("depth" in s.got) && !("rounds" in s.got));

  t("finish reads the STORED score rather than recomputing it",
    s.done.score === 12 && s.done.solved === true, String(s.done.score));
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

/* ---- the ring: three wrong guesses reveal the next clue ------------------
   The owner, 28 Sep 2026: "let them guess 2 or 3 times then reveal the next
   clue automatically ... a piece fills in for each wrong guess then the 3rd
   fills it and reveals the clue / if you get a guess right or click reveal
   yourself it resets", and on the last clue a full ring loses the card. */
console.log("\nThe ring");
{
  const G = "whoami_fr";
  const { env } = makeEnv(true);
  const open = await openRound(env, "2026-09-22", 2, G);
  const at = () => getRound(env, open.playId, G);
  await buyClue(env, await at(), 1, G);
  const w1 = await judgeGuess(env, await at(), "Nobody At All", G);
  const w2 = await judgeGuess(env, await at(), "Nobody Else", G);
  t("two wrong guesses fill two pieces and cost two points",
    w1.ring === 1 && w2.ring === 2 && w2.worthNow === 16 && !w2.autoClue, JSON.stringify({ ring: w2.ring, worth: w2.worthNow }));
  const amb = await judgeGuess(env, await at(), "apartment", G);
  t("a word that names several cards is a choice offered, not a wrong guess",
    amb.verdict === "ambiguous" && amb.ring === 2 && amb.worthNow === 16, JSON.stringify({ v: amb.verdict, ring: amb.ring }));
  const w3 = await judgeGuess(env, await at(), "Still Nobody", G);
  t("the third fills the ring and reveals the second clue by itself, at its price",
    w3.autoClue === true && w3.clue && w3.clue.stage === 2 && w3.clue.text === "clue 2" &&
      w3.worthNow === 18 - 5 - 3 && w3.ring === 0 && !w3.finished,
    JSON.stringify({ auto: w3.autoClue, stage: w3.clue && w3.clue.stage, worth: w3.worthNow, ring: w3.ring }));
  const w4 = await judgeGuess(env, await at(), "Nobody Again", G);
  t("and the ring starts again from empty", w4.ring === 1 && !w4.autoClue, String(w4.ring));
  const bought = await buyClue(env, await at(), 3, G);
  t("revealing a clue yourself empties it too",
    bought.stage === 3 && bought.ring === 0 && bought.worthNow === 18 - 10 - 4, JSON.stringify({ ring: bought.ring, worth: bought.worthNow }));
  const again = await buyClue(env, await at(), 3, G);
  t("asking again for a clue already shown charges nothing and does not empty the ring twice",
    again.replayed === true && again.pointsSpent === 10, JSON.stringify(again.pointsSpent));
  await judgeGuess(env, await at(), "One", G);
  await judgeGuess(env, await at(), "Two", G);
  const lost = await judgeGuess(env, await at(), "Three", G);
  t("on the last clue a full ring loses the card: nought, closed, and the answer shown",
    lost.lost === true && lost.finished === true && lost.solved === false && lost.score === 0 && lost.answer === "Rachel Green",
    JSON.stringify({ lost: lost.lost, score: lost.score, answer: lost.answer }));
  const closed = await judgeGuess(env, await at(), "Rachel Green", G);
  t("and a lost card cannot then be solved", !!closed.error, JSON.stringify(closed));
  const done = await finishRound(env, await at(), G);
  t("finish counts the guesses without the clue markers, and says how many were wrong",
    done.guesses === 8 && done.wrongs === 7 && done.score === 0, `${done.guesses} guesses, ${done.wrongs} wrong`);
}
{
  const G = "whoami_fr";
  const { env } = makeEnv(true);
  const open = await openRound(env, "2026-09-22", 2, G);
  const at = () => getRound(env, open.playId, G);
  await buyClue(env, await at(), 1, G);
  await judgeGuess(env, await at(), "Nobody", G);
  const got = await judgeGuess(env, await at(), "Rachel Green", G);
  t("one wrong guess, then right on the first clue: seventeen", got.solved && got.score === 17, String(got.score));
}

/* A LEADING "THE" OR "A" IS IGNORED (the owner, 28 Sep 2026: "yes ignore the
   and a"), on the Friends deck only. */
console.log("\nThe and a");
{
  const { answerKey } = await import("../../functions/_lib/frwa-data.js");
  t("a leading the or a is dropped before the fold",
    answerKey("The Apartment") === "APARTMENT" && answerKey("a pizza") === "PIZZA" &&
      answerKey("  THE   Rachel Green ") === "RACHELGREEN", answerKey("The Apartment"));
  t("but only from the front, and a lone word stays",
    answerKey("Rachel the Waitress") === "RACHELTHEWAITRESS" && answerKey("A") === "A" && answerKey("the") === "THE");
  for (const typed of ["The Rachel Green", "a rachel green"]) {
    const { env } = makeEnv(true);
    const open = await openRound(env, "2026-09-22", 2, "whoami_fr");
    await buyClue(env, await getRound(env, open.playId, "whoami_fr"), 1, "whoami_fr");
    const got = await judgeGuess(env, await getRound(env, open.playId, "whoami_fr"), typed, "whoami_fr");
    t(`"${typed}" is Rachel Green`, got.solved === true, got.verdict);
  }
  const { env: fenv } = makeEnv(false);
  const fopen = await openRound(fenv, "2026-09-22", 3, undefined);
  const fg = await judgeGuess(fenv, await getRound(fenv, fopen.playId, undefined), "The Petr Cech", undefined);
  t("football's judge is unchanged: no article is dropped there", fg.solved !== true, fg.verdict);
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
  t("the registry agrees there are five", whoamiOf("whoami_fr").data.DOORS === 5);
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

/* A CLUE CHECKED AGAINST A WEB PAGE IS CITED TOO (the owner, 27 Sep 2026: "yes,
   show web-checked clues as cited"). clueBody is asked directly: every clue in
   the sitting above is an episode clue, and this is about the other kind. The
   page is told WHICH kind so it can word it, and nothing of the source itself
   leaves the server mid-round. */
{
  const { clueBody } = await import("../../functions/_lib/frwa-data.js");
  const web = clueBody({ text: "x", vs: "web", web: { url: "https://en.wikipedia.org/wiki/X", quote: "q" } }, 3, 11);
  const ep = clueBody({ text: "x", vs: "ep", ep: "S2E14" }, 3, 11);
  const none = clueBody({ text: "x", vs: null }, 3, 11);
  t("a web-checked clue is cited, and says it is the web kind",
    web.cited === true && web.citedBy === "web", JSON.stringify(web));
  t("an episode clue is cited as before, as the episode kind",
    ep.cited === true && ep.citedBy === "ep", JSON.stringify(ep));
  t("an unsourced clue is not cited", none.cited === false && none.citedBy === null, JSON.stringify(none));
  t("and neither the page, the quote nor the episode leaves with a rung",
    !/wikipedia|S2E14|"q"/.test(JSON.stringify([web, ep])), JSON.stringify([web, ep]));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
