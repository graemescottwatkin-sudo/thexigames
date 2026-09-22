/* functions/_lib/wa-play.js — a Who Am I sitting: the door, the ladder, the
 * marking. Every rule the browser is not allowed to decide.
 *
 * THE NUMBERS ARE NOT IN THIS FILE. The ladder is in
 * football/whoami/js/config.js — "every tunable lives here and nowhere else" —
 * and it is IMPORTED rather than restated, the same way qf-round.js imports
 * QuickFire's scoring bands. The owner is play-testing what a substitution
 * should buy, and a ladder baked into these functions would make every answer
 * to that question a code change.
 *
 * WHY THE MARKING IS HERE AT ALL. Three things, and each is a leak if it moves
 * to the page:
 *
 *   the answer      — eleven of them a day, ten of which stay live for other
 *                     players after you have finished with yours
 *   the career      — which IS the answer, spelled out
 *   "right club"    — because deciding it on the page needs the club's full
 *                     roster, and a roster is a candidate list for the door
 */
import CONFIG from "../../football/whoami/js/config.js";
import { fold, clueBody } from "./wadata.js";
import { whoamiOf, LEGACY_GAME } from "./wa-registry.js";

/* clueBody LIVES IN wadata.js NOW, because it shapes a FOOTBALL row and this
   file no longer knows which game it is running. It is re-exported here so the
   address football/whoami/round_test.mjs imports it from does not move. */
export { clueBody };

/* WHICH GAME THIS ROUND BELONGS TO, and everything that follows from it.
 *
 * This file was written when there was one Who Am I: it named wa_round and
 * wa_guess in its SQL and called wadata's doorAnswer directly. All three are
 * per-game facts now.
 *
 * THE ROUND TABLE IS THE ONE THAT MATTERED. wa_round carries no `game`, and a
 * round's answer is resolved by (play_date, slot) against the door table -- so
 * a Friends round stored in wa_round would have been judged against FOOTBALL's
 * door for that slot. A well-formed row, marked against a footballer. Separate
 * tables make that unrepresentable rather than merely unlikely.
 *
 * Omitted, the game is football's, so every existing caller behaves exactly as
 * it did. */
const of_ = (game) => whoamiOf(game || LEGACY_GAME);
const T = (game, which) => {
  const w = of_(game);
  return w ? w.tables[which] : null;
};
const doorOf = (env, game, date, slot) => of_(game).data.doorAnswer(env, date, slot);
import { MAX_SCORE } from "./xi-score.js";

export const LADDER = CONFIG.LADDER;
export const DOORS = CONFIG.DOORS_PER_BOARD;
export const MATCH_MINUTES = CONFIG.MATCH_MINUTES;
export const RATE_SECONDS = CONFIG.RATE_SECONDS;
export { MAX_SCORE };

/* THE MATCH MINUTE, FROM THIS SERVER'S OWN CLOCK. A minute the client reports
   is a score the client chooses — the rule every game in this family arrived at
   the hard way. Elapsed real time divided by the rate, capped at full time:
   past 90 the score is 36 either way, but a STORED minute reading 4,000 is a
   number nobody can read as "they left the tab open overnight". */
export function minuteOf(round, now) {
  const elapsed = Math.max(0, Number(now) - Number(round.started_ms));
  const mins = Math.floor(elapsed / (RATE_SECONDS * 1000));
  return Math.min(MATCH_MINUTES, mins);
}

/* WHAT A BOARD IS WORTH RIGHT NOW, ASKED OF THE GAME.
 *
 * Football's is the curve at this minute less what the clues cost, never below
 * nothing — spending every clue on a board you were slow at should leave you
 * with nothing, not a debt. The Friends deck has no clock and counts down from
 * ten. Both are one line in wa-registry.js, which is where a rule that differs
 * per game belongs; this asks.
 *
 * OMITTED, THE GAME IS FOOTBALL'S, and football's row holds exactly the
 * expression that used to be here. */
export function scoreFor(minute, pointsSpent, game) {
  const w = of_(game);
  return w ? w.scoreFor(minute, pointsSpent) : 0;
}

const now = () => Date.now();
const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

/* WHAT A STAGE COSTS AND WHAT IT BUYS, read off THIS GAME'S ladder. A stage
   the ladder does not define is not a stage — and football's three rungs and
   the Friends deck's three are different rungs at different prices. */
export function stageAt(n, game) {
  const w = of_(game);
  if (!w) return null;
  return w.ladder.find((s) => s.stage === Number(n)) || null;
}

/* THE POINTS SPENT TO REACH A STAGE. Stage one is free and each rung after it
   costs what the ladder says. Derived rather than stored, and it can be:
   rungs are bought in order, so the stage reached IS the set bought.
   THE REVEAL IS NOT A PRICE. Its `points` is -1, a marker rather than a cost,
   because giving up does not deduct from a score — it ends the board at
   nothing. Summing it as a number would make the reveal cost less than the
   career, which is the wrong way round. */
export function costToReach(stage, game) {
  const w = of_(game);
  if (!w) return 0;
  return w.ladder
    .filter((s) => s.stage > 1 && s.stage <= Number(stage) && s.points > 0)
    .reduce((a, s) => a + s.points, 0);
}

export const GIVE_UP = CONFIG.GIVE_UP;
export const SUBS = CONFIG.SUBS_PER_BOARD;

export async function getRound(env, playId, game) {
  const t = T(game, "round");
  if (!env || !env.DB || !playId || !t) return null;
  return await env.DB.prepare(`SELECT * FROM ${t} WHERE play_id = ?`).bind(playId).first();
}

/* ONE DOOR, ONE SITTING. Opening a round is choosing a club, and the choice is
   recorded here because everything after it is measured against that door. */
export async function openRound(env, playDate, slot, game) {
  const w = of_(game);
  const t = T(game, "round");
  if (!w || !t) return { error: "no such game" };
  const n = Number(slot);
  /* THE DOOR COUNT IS THE GAME'S. football deals eleven, Friends three --
     a slot of 7 is a real door in one game and nonsense in the other. */
  const doors = w.data.DOORS || DOORS;
  if (!Number.isInteger(n) || n < 1 || n > doors) return { error: "no such door" };
  const playId = id();
  const started = now();
  await env.DB.prepare(
    `INSERT INTO ${t} (play_id, play_date, slot, started_ms, subs_used, finished, solved) ` +
    "VALUES (?, ?, ?, ?, 0, 0, 0)"
  ).bind(playId, String(playDate), n, started).run();
  /* THE CLOCK STARTS HERE, not when the page says so. It is the same started_ms
     the score is struck against, and it never goes up.
     WHAT AN UNTOUCHED DOOR IS WORTH IS THE GAME'S CEILING: football's curve
     starts at MAX_SCORE and the Friends deck's door is flatly ten. */
  return { playId, slot: n, startedMs: started, stage: 1, pointsSpent: 0,
           worthNow: w.doorMax == null ? MAX_SCORE : w.doorMax, minute: 0 };
}

/* BUYING A CLUE. The stage is charged BEFORE it is served, and a stage already
   reached is served again for nothing — a reload must not be a second purchase,
   which is the shape of fault Codeword found when its demo let a clock be
   rewound for free. */
export async function buyClue(env, round, stage, game) {
  const w = of_(game);
  if (!w) return { error: "no such game" };
  const want = stageAt(stage, game);
  if (!want) return { error: "no such stage" };
  if (Number(round.finished)) return { error: "that door is closed" };

  const need = costToReach(want.stage, game);
  const spent = Number(round.subs_used) || 0;   // points spent so far
  const at = now();
  const minute = minuteOf(round, at);

  const door = await doorOf(env, game, round.play_date, round.slot);
  if (!door) return { error: "no such door" };

  /* WHAT THE RUNG SAYS IS THE GAME'S TO DECIDE. football shapes an attribute
     off the player row it already holds; the Friends deck goes and fetches the
     round's next written clue, which is why this is awaited and why it can come
     back empty. */
  const body = await w.data.reveal(env, door, want);
  /* NOTHING TO SERVE IS A REFUSAL, AND IT COMES BEFORE THE CHARGE. A rung that
     cannot produce what was bought must not take the points for it. */
  if (!body) return { error: "no clue" };

  /* ALREADY PAID FOR: serve it, charge nothing. A reload must not be a second
     purchase, which is the shape of fault Codeword found in its own demo where
     a clock could be rewound for free. */
  if (need <= spent) {
    return {
      stage: want.stage, label: want.label, pointsSpent: spent,
      minute, worthNow: scoreFor(minute, spent, game), replayed: true,
      ...body,
    };
  }

  await env.DB.prepare(`UPDATE ${T(game, "round")} SET subs_used = ? WHERE play_id = ?`)
    .bind(need, round.play_id).run();

  return {
    stage: want.stage, label: want.label, pointsSpent: need, minute,
    worthNow: scoreFor(minute, need, game), finished: false, solved: false,
    replayed: false,
    ...body,
  };
}

/* LEAVING THE PITCH, which is not a substitution.
 *
 * There were three substitutions and the third was "give up" — borrowed from
 * the family's bench-of-three without asking what a third would BUY. The
 * honest answer was nothing: the spell, the career and the bio are everything
 * this game knows about a player that is not his name. So there are two, and
 * this is an exit.
 *
 * IT IS NOT PRICED. Giving up does not deduct from a score, it ends the board
 * at nothing — which is an accounting rather than a penalty: a board you were
 * told the answer to scored nothing. Pricing it instead would make the reveal
 * a cheap route to a number, which is the one thing a clue ladder must not be.
 */
export async function giveUp(env, round, game) {
  const w = of_(game);
  if (!w) return { error: "no such game" };
  if (Number(round.finished)) return { error: "that door is closed" };
  const door = await doorOf(env, game, round.play_date, round.slot);
  if (!door) return { error: "no such door" };
  const minute = minuteOf(round, now());
  await env.DB.prepare(
    `UPDATE ${T(game, "round")} SET finished = 1, solved = 0, score = 0, minute = ? WHERE play_id = ?`
  ).bind(minute, round.play_id).run();
  /* THE EXIT IS A RUNG-SHAPED THING WITHOUT BEING A RUNG, which is why it goes
     through the same reveal: it carries `reveals: ["answer"]` and no stage, and
     both decks read it that way. */
  return {
    label: w.giveUp.label, minute, score: 0, worthNow: 0,
    pointsSpent: Number(round.subs_used) || 0,
    finished: true, solved: false,
    ...(await w.data.reveal(env, door, w.giveUp)),
  };
}

/* A NAME. Three outcomes, and the middle one is the reason this is a server
 * call rather than a string comparison on the page:
 *
 *   right        — the door is closed and solved
 *   right-club   — somebody who really did play for that club, but not him.
 *                  Costs nothing by default: it is a near miss rather than a
 *                  mistake, and it is the one wrong answer that proves the
 *                  player understood the door. Deciding it on the page would
 *                  need the club's whole roster, which is a candidate list.
 *   wrong        — anybody else
 */
export async function judgeGuess(env, round, guess, game) {
  const w = of_(game);
  if (!w) return { error: "no such game" };
  if (Number(round.finished)) return { error: "that door is closed" };

  /* FOLDED ONCE, HERE, and handed to the game folded. Both decks stored their
     keys with this same fold; folding again inside each judge would be two
     copies of the rule that agree until one of them is tuned. */
  const key = fold(guess);
  if (!key) return { error: "no guess" };

  const door = await doorOf(env, game, round.play_date, round.slot);
  if (!door) return { error: "no such door" };

  const n = await nextGuessNumber(env, game, round.play_id);
  const at = now();
  const minute = minuteOf(round, at);
  const spent = Number(round.subs_used) || 0;

  /* WHETHER IT IS RIGHT IS THE GAME'S ANSWER. football asks whether the name
     is the player's and, failing that, whether he ever played for that club;
     the Friends deck asks its accept list and can also come back with a
     handful of cards one word surfaces. The VERDICT WORDS ARE THE FAMILY'S in
     both, because the column they go into is read across games. */
  const call = await w.data.judge(env, door, key);
  await record(env, game, round.play_id, n, key, call.verdict, at);

  if (call.solved) {
    /* THE SCORE IS STRUCK HERE AND STORED, not recomputed at finish. A
       re-derivation would use TODAY's curve, so the day anybody tunes one every
       past board would silently become a different board. QuickFire's session
       made the same call about its bands for the same reason. */
    const score = scoreFor(minute, spent, game);
    await env.DB.prepare(
      `UPDATE ${T(game, "round")} SET finished = 1, solved = 1, score = ?, minute = ? WHERE play_id = ?`
    ).bind(score, minute, round.play_id).run();
    return { verdict: call.verdict, ...w.data.solveBody(door),
             pointsSpent: spent, minute, score,
             finished: true, solved: true };
  }

  /* NO ANSWER IN THIS RESPONSE, on any branch. A near miss says it was a near
     miss and stops there; saying who it actually was would end the game for the
     price of a wrong guess.
     A WRONG NAME COSTS NOTHING BUT THE CLOCK, which is already running. The
     points are spent on SUBSTITUTIONS; the tension is how many you need, not
     how many names you waste.
     `options` IS NOT AN ANSWER EITHER: it is the set of cards one ambiguous
     word surfaces, offered so the player can pick — the judge deliberately
     does not pick for them. */
  return { verdict: call.verdict,
           ...(call.options ? { options: call.options } : {}),
           pointsSpent: spent, minute,
           worthNow: scoreFor(minute, spent, game), finished: false, solved: false };
}

/* THE GAME IS AN ARGUMENT HERE, and it was not: both of these read `game` off
   a scope that has none. That parses — a free identifier is valid syntax — so
   `node --check` passed and a routing proof that never guessed passed too. It
   would have thrown ReferenceError on the first guess of every sitting in both
   games. Proven by execution now, which is this project's rule and was the
   rule the day it was written. */
async function nextGuessNumber(env, game, playId) {
  const row = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM ${T(game, "guess")} WHERE play_id = ?`).bind(playId).first();
  return (Number(row && row.n) || 0) + 1;
}

async function record(env, game, playId, n, guess, verdict, at) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO ${T(game, "guess")} (play_id, n, guess, verdict, at_ms) VALUES (?, ?, ?, ?, ?)`
  ).bind(playId, n, guess, verdict, at).run();
}

/* WHAT THE SITTING CAME TO. Read from the rows rather than from anything the
   page reports, and the answer is included ONLY once the door is closed. */
export async function finishRound(env, round, game) {
  const w = of_(game);
  if (!w) return { error: "no such game" };
  const { results } = await env.DB
    .prepare(`SELECT n, guess, verdict FROM ${T(game, "guess")} WHERE play_id = ? ORDER BY n`)
    .bind(round.play_id).all();
  const guesses = results || [];
  const closed = !!Number(round.finished);
  const spent = Number(round.subs_used) || 0;

  const out = {
    day: round.play_date,
    slot: Number(round.slot),
    solved: !!Number(round.solved),
    finished: closed,
    pointsSpent: spent,
    /* THE SUBSTITUTIONS TAKEN, derived from the points spent rather than
       counted separately. Rungs are bought in order, so what was paid says
       which were taken — and two records of one fact is how they drift. */
    subsUsed: w.ladder.filter((r) => r.points > 0 && costToReach(r.stage, game) <= spent).length,
    guesses: guesses.length,
    /* WHICH WORD MEANS NEAR MISS IS THE GAME'S, read off the registry rather
       than written here: these rows were stored weeks ago and the counting must
       use the vocabulary they were stored in. */
    nearMisses: guesses.filter((g) => g.verdict === w.nearVerdict).length,
  };

  if (closed) {
    /* THE STORED SCORE AND MINUTE, struck when the board closed. Not recomputed
       — a re-derivation would use today's curve. */
    out.score = Number(round.score) || 0;
    out.minute = round.minute == null ? null : Number(round.minute);
    const door = await doorOf(env, game, round.play_date, round.slot);
    if (door) Object.assign(out, w.data.doorBody(door));
  } else {
    /* STILL IN PLAY: what it is worth at this moment, which is not a score and
       is not stored. No answer, because asking to finish must not be a way to
       read one. */
    const minute = minuteOf(round, now());
    out.minute = minute;
    out.worthNow = scoreFor(minute, spent, game);
  }
  return out;
}
