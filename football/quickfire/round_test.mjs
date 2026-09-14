/* quickfire/round_test.mjs — what leaves the server, and what a round costs.
 *
 * THE ASSERTION THIS FILE EXISTS FOR is the first one: no answer in the
 * payload. QuickFire went live on 14 September 2026 serving eleven answers a
 * day in plain text, because the page was a typing game that revealed letters
 * out of the string and genuinely could not draw a board without it. That made
 * it load-bearing rather than careless, and it is why removing the field and
 * rewriting the page are one change rather than two.
 *
 * Nothing here re-implements a scoring rule. The bands, the substitution
 * penalty and the question count are read from the same config the page reads,
 * so a test that "passes" because it agrees with its own copy is not possible.
 */
import { SECRET_FIELDS, shapeQuestion } from "../../functions/_lib/qfdata.js";
import { serveQuestion, answerRound } from "../../functions/_lib/qf-play.js";
import {
  BANDS, PER_DAILY, SUBS, SUB_PENALTY, WRONG_PICK_MINUTES,
  pointsFor, minuteOf, norm, judge, totalFor, QUESTION_MS, MATCH_MINUTES,
} from "../../functions/_lib/qf-round.js";
import CONFIG from "../../football/quickfire/js/config.js";
import fs from "node:fs";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

console.log("=== The answer does not leave the server ===");
{
  /* shape() is not exported — it is the private half of qfdata — so this reads
     the file and asserts about what it BUILDS, then the endpoint proves the
     rest live. A regex over source is weak evidence on its own; it is here
     because the alternative is exporting an internal for a test's benefit. */
  /* STRIPPED, because a comment naming a thing satisfies — or here, trips — a
     check meant to be about the code. The first version of this read the raw
     slice and failed on the sentence explaining why aliases had been removed.
     That is this project's own rule arriving in a test written the same hour it
     was quoted. */
  const src = fs.readFileSync("functions/_lib/qfdata.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
  /* AND THE SLICE ENDS AT THE OBJECT, not at the next function. Reaching to
     `function split(` swept up the SECRET_FIELDS declaration that sits between
     them — which names all three fields, legitimately, and is the very list
     this check reads. So the check failed on the list of things it was checking
     for. A check whose window is wider than its subject is measuring the
     neighbourhood. */
  const shaped = src.slice(src.indexOf("function shape(row)"), src.indexOf("function split("));
  const open = shaped.indexOf("return {");
  const returned = shaped.slice(open, shaped.indexOf("};", open) + 2);
  for (const field of SECRET_FIELDS) {
    t(`shape() returns no ${field}`, !new RegExp("\\b" + field + ":").test(returned),
      field === "answer" ? "eleven a day, in plain text, until today" : "");
  }
  t("and it returns the options instead", /options:/.test(returned));
  t("the three secret fields are named once, for a check to read",
    SECRET_FIELDS.length === 3 && SECRET_FIELDS.includes("answer") &&
      SECRET_FIELDS.includes("aliases") && SECRET_FIELDS.includes("answer_norm"),
    SECRET_FIELDS.join(", "));
  /* ALIASES WAS THE QUIETER HALF. They exist only to match a typed answer, so
     they are useless to a four-option page — and a list of ways to spell the
     answer is a list of the answer. */
  t("aliases is gone as well, which a four-option game has no use for",
    !/aliases/.test(returned));
}

console.log("\n=== Four options, or none ===");
{
  /* EXECUTED, not read. A regex can see the guard and cannot see whether it
     fires — a sabotage that deleted it went unnoticed by the source-reading
     checks above, which is how this block came to exist.
     A row mid-pivot must render as a question with NO options rather than as
     two blank buttons, because two buttons is a question a player can get
     wrong for a reason that is not theirs. */
  const full = { id: "1", clue: "c", answer: "A", option_1: "A", option_2: "B",
    option_3: "C", option_4: "D" };
  t("a complete row ships its four", shapeQuestion(full).options.length === 4);
  t("a row with two ships none, not two",
    shapeQuestion({ ...full, option_3: null, option_4: null }).options.length === 0,
    "two buttons is a question a player can lose for nothing");
  t("a row with none ships none", shapeQuestion({ id: "1", clue: "c" }).options.length === 0);
  t("blank strings do not count as options",
    shapeQuestion({ ...full, option_4: "   " }).options.length === 0,
    "an empty column is not a fourth choice");
  t("and the answer is not among what ships, even on a complete row",
    !JSON.stringify(shapeQuestion(full)).includes('"answer"'));
}

console.log("\n=== The numbers come from the game's own config ===");
{
  t("the bands are the config's, not a copy",
    BANDS === CONFIG.SCORE_BANDS, "one table, read by both sides");
  t("and so are the substitutions and their penalty",
    SUBS === CONFIG.SUBS_PER_DAILY && SUB_PENALTY === CONFIG.SUB_POINT_PENALTY);
  t("and the question count", PER_DAILY === CONFIG.QUESTIONS_PER_DAILY, String(PER_DAILY));
  /* A SERVER COPY AND A PAGE COPY would agree the day they were written and
     disagree the first time anybody tuned one — and the symptom would be a
     player's score changing when they refreshed. */
  t("the ceiling is derived from the bands rather than stated",
    Math.max(...BANDS.map((b) => b.points)) * PER_DAILY === 1100,
    "eleven questions at a hundred, and it moves if the bands move");
}

console.log("\n=== What a question is worth, by the minute ===");
{
  t("full marks inside the first band", pointsFor(0) === 100 && pointsFor(9) === 100);
  t("and a step down at its edge", pointsFor(10) === 85, "9 -> 100, 10 -> 85");
  t("the last band is worth 36 at eighty-nine", pointsFor(89) === 36);
  /* PAST THE WHISTLE IS NOTHING, and that is the config's shape rather than a
     decision here: the bands stop at 89 and there is no ninetieth. */
  t("and nothing past the whistle", pointsFor(90) === 0 && pointsFor(200) === 0);
  t("every band boundary steps down and never up",
    BANDS.every((b, i) => i === 0 || b.points < BANDS[i - 1].points));
}

console.log("\n=== The clock is the server's ===");
{
  const perMinute = QUESTION_MS / MATCH_MINUTES;
  t("a full question's real time is the whole match",
    minuteOf({ started_ms: 0, penalty_minutes: 0 }, QUESTION_MS) === MATCH_MINUTES,
    `${QUESTION_MS}ms across ${MATCH_MINUTES} minutes`);
  t("half of it is half the match",
    minuteOf({ started_ms: 0, penalty_minutes: 0 }, QUESTION_MS / 2) === MATCH_MINUTES / 2);
  t("and a fresh round is at nought",
    minuteOf({ started_ms: 1000, penalty_minutes: 0 }, 1000) === 0);
  /* A clock that could run backwards would be a score a player could choose. */
  t("a clock that has gone backwards reads nought, not negative",
    minuteOf({ started_ms: 5000, penalty_minutes: 0 }, 1000) === 0);
  t("minutes bought by wrong picks are added to it",
    minuteOf({ started_ms: 0, penalty_minutes: 5 }, perMinute) === 6, "one elapsed, five bought");
}

console.log("\n=== A wrong pick costs time, not points ===");
{
  /* NOT "it is ten". What this asserts is the WIRING — that the server reads
     the game's own config rather than keeping a second copy — because that is
     what can silently come apart, and a test pinned to the literal would just
     enforce today's value against tomorrow's tuning. It sat at 0 until the
     four-option client landed, because the value was read by the LIVE typing
     game where a wrong guess clears the cells and you type again by design;
     nothing on the page reads it now, so it could move. */
  t("the penalty is whatever the config says, and nothing else",
    WRONG_PICK_MINUTES === CONFIG.WRONG_GUESS_MINUTE_PENALTY,
    `${WRONG_PICK_MINUTES} minutes, from the game's own config`);
  /* AND IT IS THE CONFIG'S, not a second copy beside it. config.js already had
     WRONG_GUESS_MINUTE_PENALTY, at 0 for the typing game, and this was very
     nearly declared as a new constant next to it — a second home for a setting
     that already had one, in the file whose header says every tunable lives
     there and nowhere else. */
  t("and the config is where a tunable lives, not beside it",
    typeof CONFIG.WRONG_GUESS_MINUTE_PENALTY === "number",
    "a second home was very nearly built for a setting that already had one");
  /* THE SAME FIVE MINUTES IS WORTH DIFFERENT AMOUNTS depending where the clock
     sits, because the bands are unequal — fifteen points between the first two
     and three between the last two. That is the argument for it being a
     constant somebody can move rather than a number anybody can reason to. */
  /* PROBED WITH A FIXED FIVE, not with the configured penalty. The claim is
     about the CURVE — that a minute costs more early than late — and it has to
     hold whatever the penalty is set to. Using WRONG_PICK_MINUTES made this
     assertion evaporate the moment the penalty went back to 0 for the live
     typing game: 0 > 0 is false, and the test failed for saying nothing rather
     than for being wrong. A check that only works at one setting is a check
     that disappears when somebody tunes it. */
  const early = pointsFor(5) - pointsFor(10);
  const late = pointsFor(80) - pointsFor(85);
  t("five minutes costs more early than late, because the curve is steepest there",
    early > late, `${early} points at 5', ${late} at 80'`);
}

console.log("\n=== The clock is per QUESTION, not per sitting ===");
{
  /* THE FAULT THIS BLOCK EXISTS FOR, found before it ran rather than after.
     qf_round carried one started_ms for the whole sitting and minuteOf() read
     it, so every question was measured from kick-off. Question one scored;
     question two landed at 99' and was worth nothing, and so were the nine
     after it. Eleven questions with at most one of them scoring — and the
     symptom, "everything after the first is zero", reads as a scoring bug.

     The assertions above could not catch it: every one of them passes a round
     with no question_ms, which is the fallback path. A check that only exercises
     the state a fresh round is in cannot see a rule about the eleventh. */
  const perMinute = QUESTION_MS / MATCH_MINUTES;
  t("a question served late is at nought, not at the sitting's minute",
    minuteOf({ started_ms: 0, question_ms: QUESTION_MS * 5, penalty_minutes: 0 },
      QUESTION_MS * 5) === 0,
    "five questions into the sitting, and this one has just started");
  t("the eleventh question is worth a hundred if answered at once",
    pointsFor(minuteOf({ started_ms: 0, question_ms: QUESTION_MS * 10, penalty_minutes: 0 },
      QUESTION_MS * 10)) === 100,
    "it was worth 0 when the clock ran from kick-off");
  /* WHOLE MILLISECONDS, because that is what a clock hands over and because
     the first version of this line computed its own instant as perMinute * 20
     — 6666.666ms — and read 19'. The code was dividing by 333.333…, a repeating
     decimal, so the floor dropped a minute at the edge. Both sides of a band
     edge decide points, so that is fifteen of them at the top of the curve. The
     fix was in minuteOf; the fixture is integers now because a real one is. */
  t("and the question's own elapsed time still runs",
    minuteOf({ started_ms: 0, question_ms: QUESTION_MS * 5, penalty_minutes: 0 },
      QUESTION_MS * 5 + 6700) === 20, "6700ms into a 30s question");
  /* THERE IS NO ASSERTION HERE ABOUT THE REPEATING DECIMAL, and the absence is
     deliberate. One was written — minuteOf(..., 10000) === 30 — and sabotage
     showed it passed against both spellings of the arithmetic, because for
     whole-millisecond inputs they never disagree. A check that cannot fail is
     worse than no check: it reports a guard where there is none. */
  t("a third of the real time is a third of the match",
    minuteOf({ started_ms: 0, question_ms: 0, penalty_minutes: 0 }, 10000) === 30,
    "the plain reading of the clock, not a rounding guard");
  /* CAPPED AT FULL TIME. Past 90' a question is worth nothing either way — the
     bands stop at 89 — but the minute is STORED, and a row reading 4,000'
     is a number nobody can read as "they left the tab open overnight". */
  t("a round left open reads full time, not four thousand minutes",
    minuteOf({ started_ms: 0, question_ms: 0, penalty_minutes: 0 },
      QUESTION_MS * 50) === MATCH_MINUTES,
    "stored, and read by a person");
  t("the sitting's clock is still the fallback before anything is served",
    minuteOf({ started_ms: 0, question_ms: 0, penalty_minutes: 0 }, 0) === 0,
    "a round that throws is a round that takes the page down");
}

console.log("\n=== Serving a question, which is what starts its clock ===");
{
  /* EXECUTED against a stub, because the rule is about what the UPDATE does and
     a regex cannot see whether a guard fires.
     THE STUB HANDS BACK COPIES. An earlier stub in this project returned the
     live row object, so an UPDATE mutated the very row a response had already
     been computed from, and a working function looked like it double-charged.
     A stub that shares state with the code under test proves nothing about
     either. */
  function db(round, answers = []) {
    const rows = { ...round };
    const marks = answers.slice();
    return {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                if (/FROM qf_round/.test(sql)) return { ...rows };
                if (/FROM qf_answer/.test(sql)) {
                  const hit = marks.find((m) => m.idx === args[1]);
                  return hit ? { ...hit } : null;
                }
                return null;
              },
              async all() { return { results: marks.map((m) => ({ ...m })) }; },
              async run() {
                if (/UPDATE qf_round SET question_idx/.test(sql)) {
                  rows.question_idx = args[0];
                  rows.question_ms = args[1];
                  rows.penalty_minutes = 0;
                }
                return { success: true };
              },
            };
          },
        };
      },
    };
  }

  const base = { play_id: "p", play_date: "2026-09-14", started_ms: 1000,
    subs_used: 0, question_idx: 0, question_ms: 0, penalty_minutes: 0 };

  const env1 = { DB: db(base) };
  const first = await serveQuestion(env1, { ...base }, 1);
  t("serving the first question stamps a clock", first.restamped === true && first.minute === 0);

  /* THE ONE THAT MATTERS. A player sitting on a hard question reloads; if the
     serve restamped, they would be back at 0' and full marks. That is Codeword's
     own demo fault — the clock rate switchable mid-round, seventeen minutes
     handed back for one click — arriving in a different game. */
  const served = { ...base, question_idx: 3, question_ms: 5000 };
  const again = await serveQuestion({ DB: db(served) }, served, 3);
  t("asking for the SAME question again does not rewind the clock",
    again.restamped === false && again.startedMs === 5000,
    "a reload must not hand back the decay");
  /* AND IT REPORTS THE MINUTE THE QUESTION IS ACTUALLY AT, which is the half a
     reload would otherwise get wrong — coming back must not read 0'.
     THIS ASSERTION WAS VACUOUS ON ITS FIRST WRITING: `again.minute > 0 || true`
     cannot fail, which is the sixth of its kind in this project's history and
     the reason every check here is sabotaged before it is trusted. It passed,
     reported 90', and proved nothing. */
  const held = { ...base, question_idx: 3,
    question_ms: Date.now() - Math.round((30 * QUESTION_MS) / MATCH_MINUTES) };
  const back30 = await serveQuestion({ DB: db(held) }, held, 3);
  t("and a reload picks the clock up where it was, not at nought",
    back30.minute >= 29 && back30.minute <= 31, `${back30.minute}' of an expected 30`);

  const back = await serveQuestion({ DB: db(served) }, served, 2);
  t("a question already gone by cannot be served again",
    !!back.error, back.error || "no refusal");

  const answered = { ...base, question_idx: 4, question_ms: 5000 };
  const replay = await serveQuestion(
    { DB: db(answered, [{ idx: 6, correct: 1, points: 100, minute: 2 }]) }, answered, 6);
  t("nor can one that has already been answered", !!replay.error,
    replay.error || "no refusal");
}

console.log("\n=== Answering a question nobody served ===");
{
  /* WITHOUT THIS GUARD a page could skip the serve entirely and answer all
     eleven against question one's stamp — which is to say, answer the whole
     board at 0' for a hundred apiece. The serve is what starts a question, so
     answering an unserved one is not a late answer, it is not an answer. */
  const q = { id: "1", answer: "A", option_1: "A", option_2: "B", option_3: "C", option_4: "D" };
  const stub = {
    DB: { prepare: () => ({ bind: () => ({
      async first() { return null; }, async all() { return { results: [] }; },
      async run() { return { success: true }; },
    }) }) },
  };
  const out = await answerRound(stub, { play_id: "p", question_idx: 1, question_ms: 1000,
    started_ms: 1000, penalty_minutes: 0 }, q, 7, "A");
  t("an answer to a question that was never served is refused", !!out.error,
    out.error || "no refusal");
  const ok = await answerRound(stub, { play_id: "p", question_idx: 7, question_ms: Date.now(),
    started_ms: 1000, penalty_minutes: 0 }, q, 7, "A");
  t("and the same answer is taken once the question has been served",
    !ok.error && ok.correct === true, ok.error || `${ok.points} points`);
}

console.log("\n=== Running out of time, which must not be free ===");
{
  /* A NULL PICK IS FULL TIME, and the server checks its own clock before it
     believes one. The reason is the substitution: passing costs twenty points,
     so if "I ran out of time" were instant and free, nobody would ever spend a
     sub — they would time out of every hard question at 0' and lose only what
     that question was worth, which is what they were going to lose anyway. A
     free escape priced against a paid one empties the paid one. */
  const q = { id: "1", answer: "A", option_1: "A", option_2: "B", option_3: "C", option_4: "D" };
  const writes = [];
  const stub = {
    DB: { prepare: (sql) => ({ bind: (...a) => ({
      async first() { return null; },
      async all() { return { results: [] }; },
      async run() { writes.push([sql, a]); return { success: true }; },
    }) }) },
  };

  const early = await answerRound(stub,
    { play_id: "p", question_idx: 1, question_ms: Date.now(), started_ms: 1, penalty_minutes: 0 },
    q, 1, null);
  t("a timeout claimed with time still on the clock is refused", !!early.error,
    early.error || "no refusal");
  t("and nothing is written for it", writes.length === 0,
    "a refused timeout must not leave a row");

  const done = await answerRound(stub,
    { play_id: "p", question_idx: 1, question_ms: Date.now() - QUESTION_MS - 1000,
      started_ms: 1, penalty_minutes: 0 }, q, 1, null);
  t("a timeout at full time is taken, and scores nothing",
    !done.error && done.timedOut === true && done.points === 0 && done.correct === false,
    done.error || `${done.minute}'`);
  t("and it is recorded with a null pick, which the schema always expected",
    writes.some(([sql]) => /INSERT INTO qf_answer/.test(sql) && /NULL/.test(sql)),
    "037 said NULL on a timeout, and nothing had ever written one");
}

console.log("\n=== Marking, which only this side can do ===");
{
  const q = { id: "003", answer: "Bournemouth", option_1: "Bournemouth",
    option_2: "Brighton", option_3: "Burnley", option_4: "Brentford" };
  t("the right option is right", judge(q, "Bournemouth").correct === true);
  t("a wrong option is wrong, and was offered",
    judge(q, "Burnley").correct === false && judge(q, "Burnley").offered === true);
  /* A PICK THAT WAS NOT ON THE PAGE IS REFUSED, not marked wrong: it did not
     come from the page, and marking it would record a guess nobody made. */
  t("a pick that was not one of the four is refused rather than marked wrong",
    judge(q, "Chelsea").offered === false);
  t("case and spacing do not decide it",
    judge(q, "  bournemouth ").correct === true);
  t("an empty pick is not one of the options", judge(q, "").offered === false);
  t("norm folds case and runs of spaces",
    norm("  A  B ") === "a b" && norm(null) === "");
}

console.log("\n=== What a finished round scored ===");
{
  const three = [{ points: 100 }, { points: 100 }, { points: 100 }];
  t("the points earned, less twenty a substitution",
    totalFor(three, 1) === 300 - SUB_PENALTY, String(totalFor(three, 1)));
  t("three substitutions cost sixty", totalFor(three, 3) === 300 - 3 * SUB_PENALTY);
  /* A SCORE CANNOT GO NEGATIVE. Spending every substitution on a board you
     scored little on should cost you the points you had, not put you in debt. */
  t("and a round cannot end below nothing",
    totalFor([{ points: 10 }], 3) === 0, "10 earned, 60 of penalties");
  t("an unanswered round is nought, not an error", totalFor([], 0) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
