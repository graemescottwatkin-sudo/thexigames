/* codeword/play_test.mjs — a sitting: the helpers, the substitutions and the
 * whistle.
 *
 * EVERY RULE HERE COSTS A PLAYER SOMETHING IF IT IS WRONG, and most of them
 * cost in a way only that player would ever see: a substitution spent twice on
 * one letter, a helper charged for after it failed, a score computed from
 * today's curve instead of the one the match was played on. None of those
 * produce an error anywhere. They produce a slightly worse afternoon.
 *
 * The database is stubbed and RE-APPLIES each rule rather than rubber-stamping
 * it. What that cannot prove is the SQL — see board_test.mjs, which says the
 * same thing about the archive bound and where it IS proved.
 */
import { startRound, getRound, markRound, checkRound, revealRound, finishRound } from "../../functions/_lib/cw-play.js";
import { SUBS, COST, outcome, minuteOf } from "../../functions/_lib/cw-round.js";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const CODE = {};
"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((L, i) => { CODE[L] = i + 1; });
const BOARD = {
  no: 7, day: "2026-09-20", size: 3,
  rows: ["CAT", "ARE", "TEN"],
  words: [["CAT", 0, 0, "a"], ["ARE", 1, 0, "a"], ["TEN", 2, 0, "a"], ["CAT", 0, 0, "d"]],
  code: CODE, given: ["C", "A", "T"],
  hints: [0, 1, 2, 3].map(() => ({ text: "s c", enum: "3" })), breaks: [[], [], [], []],
};
const RIGHT = {}; for (const L of Object.keys(CODE)) RIGHT[String(CODE[L])] = L;

/* An in-memory D1 that honours the three tables' rules, primary keys included. */
function makeEnv() {
  const rounds = new Map(), reveals = new Map(), solved = new Map();
  const key = (a, b) => a + "|" + b;
  const run = (sql, args) => {
    if (/INSERT INTO cw_round/.test(sql)) {
      const [play_id, board_no, day, started_ms, rate_secs, scored] = args;
      rounds.set(play_id, {
        play_id, board_no, day, started_ms, rate_secs, scored,
        subs_used: 0, spent_minutes: 0, confirms_used: 0, finished_ms: null,
        score: null, solved: null, result: null,
      });
      return;
    }
    if (/UPDATE cw_round SET confirms_used/.test(sql)) { rounds.get(args[0]).confirms_used += 1; return; }
    if (/UPDATE cw_round SET spent_minutes/.test(sql)) { rounds.get(args[1]).spent_minutes += Number(args[0]); return; }
    if (/UPDATE cw_round SET subs_used/.test(sql)) {
      const r = rounds.get(args[1]); r.subs_used += 1; r.spent_minutes += Number(args[0]); return;
    }
    if (/UPDATE cw_round SET finished_ms/.test(sql)) {
      const [finished_ms, score, s, result, play_id] = args;
      Object.assign(rounds.get(play_id), { finished_ms, score, solved: s, result });
      return;
    }
    if (/INSERT INTO cw_reveal/.test(sql)) {
      const [play_id, n, letter, at_ms] = args;
      /* PRIMARY KEY (play_id, n) — a second insert for the same pair throws,
         the way the real table would, so a code path that stopped checking
         first would be caught rather than quietly double-charging. */
      if (reveals.has(key(play_id, n))) throw new Error("UNIQUE constraint failed: cw_reveal");
      reveals.set(key(play_id, n), { play_id, n, letter, at_ms });
      return;
    }
    if (/INSERT OR IGNORE INTO cw_solved/.test(sql)) {
      const [play_id, slot, at_ms] = args;
      if (!solved.has(key(play_id, slot))) solved.set(key(play_id, slot), { play_id, slot, at_ms });
      return;
    }
  };
  return { DB: { prepare: (sql) => ({
    bind: (...args) => ({
      run: async () => run(sql, args),
      first: async () => {
        /* A COPY, BECAUSE THAT IS WHAT D1 RETURNS. The first version of this
           stub handed back the live object out of its own map, so an UPDATE
           mutated the very row the caller had already read — and revealRound,
           which computes its response from the pre-update values, returned
           exactly double: 14 minutes charged and one substitution left instead
           of 7 and two. The CODE was right and the stub was lying, which is the
           safer direction to be wrong in and still worth fixing, because a stub
           that shares identity with its store can just as easily make a broken
           read look correct. */
        if (/SELECT \* FROM cw_round/.test(sql)) {
          const r = rounds.get(args[0]);
          return r ? { ...r } : null;
        }
        if (/COUNT\(\*\) AS n FROM cw_round/.test(sql)) {
          let n = 0; for (const r of rounds.values()) if (r.board_no === args[0] && r.finished_ms) n++;
          return { n };
        }
        if (/SELECT letter FROM cw_reveal/.test(sql)) return reveals.get(key(args[0], args[1])) || null;
        if (/COUNT\(\*\) AS n FROM cw_solved/.test(sql)) {
          let n = 0; for (const s of solved.values()) if (s.play_id === args[0]) n++;
          return { n };
        }
        return null;
      },
      all: async () => {
        if (/SELECT slot FROM cw_solved/.test(sql)) {
          return { results: [...solved.values()].filter((s) => s.play_id === args[0]) };
        }
        return { results: [] };
      },
    }),
  }) }, _rounds: rounds, _reveals: reveals, _solved: solved };
}

console.log("=== Kick off ===");
{
  const env = makeEnv();
  const r = await startRound(env, { boardNo: 7, day: "2026-09-20", rate: 3 });
  t("a round is issued with the server's clock", !!r.playId && r.startedMs > 0);
  t("the rate is stored on the round, not assumed",
    env._rounds.get(r.playId).rate_secs === 3);
  t("and a first sitting is scored", r.scored === true);
  t("three substitutions to start", r.subsLeft === SUBS);
}

console.log("\n=== A replay plays and is not recorded ===");
{
  const env = makeEnv();
  const a = await startRound(env, { boardNo: 7, day: "2026-09-20", rate: 3 });
  const abandoned = await startRound(env, { boardNo: 7, day: "2026-09-20", rate: 3 });
  t("an ABANDONED round does not make the next one unscored",
    abandoned.scored === true, "a closed tab must not cost a player their day");
  await finishRound(env, await getRound(env, a.playId));
  const b = await startRound(env, { boardNo: 7, day: "2026-09-20", rate: 3 });
  t("but a FINISHED one does",
    b.scored === false, "replaying is good to allow and bad to record");
}

console.log("\n=== Reveal is stored per number, not counted ===");
{
  const env = makeEnv();
  const { playId } = await startRound(env, { boardNo: 7, day: "2026-09-20", rate: 3 });
  const one = await revealRound(env, await getRound(env, playId), BOARD, CODE.E);
  t("it returns the letter behind the number", one.letter === "E");
  t("it spends a substitution", one.subsLeft === SUBS - 1 && one.charged === true);
  t("and charges seven minutes", one.spentMinutes === COST.reveal);

  const again = await revealRound(env, await getRound(env, playId), BOARD, CODE.E);
  t("asking the SAME number again returns the same letter", again.letter === "E");
  t("and costs nothing the second time",
    again.charged === false && again.subsLeft === SUBS - 1 &&
    again.spentMinutes === COST.reveal,
    "a refresh mid-reveal must not buy the same letter twice");

  await revealRound(env, await getRound(env, playId), BOARD, CODE.N);
  await revealRound(env, await getRound(env, playId), BOARD, CODE.R);
  const fourth = await revealRound(env, await getRound(env, playId), BOARD, CODE.T);
  t("a fourth distinct reveal is refused", !!fourth.error, fourth.error);
  t("and the substitutions are gone, not negative",
    Number(env._rounds.get(playId).subs_used) === SUBS);
}

console.log("\n=== Confirm is free, capped, and never says which letter ===");
{
  const env = makeEnv();
  const { playId } = await startRound(env, { boardNo: 7, day: "2026-09-20", rate: 3 });
  const first = await markRound(env, await getRound(env, playId), BOARD, RIGHT);
  t("a correct grid confirms every slot", first.solved.length === 4);
  t("it costs no minutes", Number(env._rounds.get(playId).spent_minutes) === 0);
  t("and it names slots, never letters", first.solved.every(Number.isInteger));

  const before = Number(env._rounds.get(playId).confirms_used);
  const again = await markRound(env, await getRound(env, playId), BOARD, RIGHT);
  t("re-asking about slots already confirmed does not count against the cap",
    Number(env._rounds.get(playId).confirms_used) === before &&
    again.solved.length === 4,
    "the page may re-ask after a reveal changes a square");
}

console.log("\n=== Check grid is the paid question ===");
{
  const env = makeEnv();
  const { playId } = await startRound(env, { boardNo: 7, day: "2026-09-20", rate: 3 });
  const wrong = { ...RIGHT, [String(CODE.C)]: "X" };
  const out = await checkRound(env, await getRound(env, playId), BOARD, wrong);
  t("it names the wrong NUMBER", JSON.stringify(out.wrong) === JSON.stringify([CODE.C]));
  t("and charges five minutes", out.spentMinutes === COST.check);
  t("which the round remembers",
    Number(env._rounds.get(playId).spent_minutes) === COST.check);
}

console.log("\n=== The whistle ===");
{
  const env = makeEnv();
  const { playId } = await startRound(env, { boardNo: 7, day: "2026-09-20", rate: 3 });
  await markRound(env, await getRound(env, playId), BOARD, RIGHT);
  const done = await finishRound(env, await getRound(env, playId));
  t("the server computes the score, it is not posted",
    Number.isInteger(done.score) && done.score > 0, String(done.score));
  t("all four slots solved on this board is a win at four of four",
    done.solved === 4);
  t("and the figures are STORED, not left derivable",
    env._rounds.get(playId).score === done.score &&
    env._rounds.get(playId).result === done.result,
    "a re-derivation would use today's curve, not the match's");

  const twice = await finishRound(env, await getRound(env, playId));
  t("blowing the whistle twice returns the first result, unchanged",
    twice.score === done.score && twice.replayed === true,
    "the score of a match is what it was, not what asking again makes it");
}

console.log("\n=== Helpers move the clock, and the clock moves the score ===");
{
  const env = makeEnv();
  const { playId } = await startRound(env, { boardNo: 7, day: "2026-09-20", rate: 3 });
  await checkRound(env, await getRound(env, playId), BOARD, RIGHT);
  const r = await getRound(env, playId);
  const atKickOff = minuteOf({ ...r, spent_minutes: 0 }, r.started_ms);
  const afterHelp = minuteOf(r, r.started_ms);
  t("five bought minutes put the clock five minutes on",
    afterHelp - atKickOff === COST.check, `${atKickOff} -> ${afterHelp}`);
  t("and that costs points, because the curve is falling",
    outcome(afterHelp, 11).score < outcome(atKickOff, 11).score,
    `${outcome(atKickOff, 11).score} -> ${outcome(afterHelp, 11).score}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
