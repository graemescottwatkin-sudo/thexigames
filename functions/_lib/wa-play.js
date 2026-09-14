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
import { fold, doorAnswer, playedFor } from "./wadata.js";

export const LADDER = CONFIG.LADDER;
export const DOORS = CONFIG.DOORS_PER_BOARD;
export const SUBS = CONFIG.SUBS_PER_BOARD;

const now = () => Date.now();
const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

/* WHAT A STAGE COSTS AND WHAT IT BUYS, read off the ladder. A stage the ladder
   does not define is not a stage. */
export function stageAt(n) {
  return LADDER.find((s) => s.stage === Number(n)) || null;
}

/* The substitutions spent to REACH a stage — stage 1 is free, and each one
   after it costs what the ladder says. Derived rather than stored: a stored
   copy would be a second answer to "how many have they spent". */
export function costToReach(stage) {
  return LADDER.filter((s) => s.stage > 1 && s.stage <= Number(stage))
    .reduce((a, s) => a + s.cost, 0);
}

export async function getRound(env, playId) {
  if (!env || !env.DB || !playId) return null;
  return await env.DB.prepare("SELECT * FROM wa_round WHERE play_id = ?").bind(playId).first();
}

/* ONE DOOR, ONE SITTING. Opening a round is choosing a club, and the choice is
   recorded here because everything after it is measured against that door. */
export async function openRound(env, playDate, slot) {
  const n = Number(slot);
  if (!Number.isInteger(n) || n < 1 || n > DOORS) return { error: "no such door" };
  const playId = id();
  await env.DB.prepare(
    "INSERT INTO wa_round (play_id, play_date, slot, started_ms, subs_used, finished, solved) " +
    "VALUES (?, ?, ?, ?, 0, 0, 0)"
  ).bind(playId, String(playDate), n, now()).run();
  return { playId, slot: n, startedMs: now(), subsLeft: SUBS, stage: 1 };
}

/* WHAT A STAGE IS ALLOWED TO SAY, and nothing else leaves on its account.
 *
 * Built from the `reveals` names in the ladder rather than from a switch, so
 * adding a rung is a config change. The player row is the whole row — it has to
 * be, to build any of this — and this function is the only place that decides
 * which parts of it are allowed out.
 */
export function clueBody(row, reveals, door) {
  const out = {};
  for (const what of reveals) {
    if (what === "spell") {
      /* THE DOOR'S OWN SPELL, and only that one. A player with six clubs has
         six spells and five of them are the career by instalments. */
      let clubs = [];
      try { clubs = JSON.parse(row.clubs || "[]"); } catch (e) { clubs = []; }
      const want = fold(door.club);
      const spell = clubs.find((c) => fold(c.club) === want);
      out.spell = spell
        ? { club: door.club, from: spell.from, to: spell.to, apps: spell.apps, goals: spell.goals }
        : { club: door.club };
    } else if (what === "career") {
      out.career = row.club_history || null;
      out.clubCount = Number(row.club_count) || 0;
    } else if (what === "bio") {
      /* AGE RATHER THAN BIRTH YEAR, because the year is a sharper clue than the
         age and the ladder says "age and country". Computed here so the page
         cannot be handed the year and asked not to look at it. */
      const year = Number(row.birth_year);
      out.age = year ? new Date().getUTCFullYear() - year : null;
      out.nationality = row.nationality || null;
      out.position = row.position || null;
    } else if (what === "answer") {
      out.answer = row.name;
      out.career = row.club_history || null;
      out.article = row.article || null;
    }
  }
  return out;
}

/* BUYING A CLUE. The stage is charged BEFORE it is served, and a stage already
   reached is served again for nothing — a reload must not be a second purchase,
   which is the shape of fault Codeword found when its demo let a clock be
   rewound for free. */
export async function buyClue(env, round, stage) {
  const want = stageAt(stage);
  if (!want) return { error: "no such stage" };
  if (Number(round.finished)) return { error: "that door is closed" };

  const need = costToReach(want.stage);
  const spent = Number(round.subs_used) || 0;

  /* ALREADY PAID FOR: serve it, charge nothing. */
  if (need <= spent) {
    const door = await doorAnswer(env, round.play_date, round.slot);
    if (!door) return { error: "no such door" };
    return { stage: want.stage, label: want.label, subsUsed: spent,
             subsLeft: SUBS - spent, replayed: true, ...clueBody(door, want.reveals, door) };
  }

  if (need > SUBS) return { error: "no substitutions left" };

  const door = await doorAnswer(env, round.play_date, round.slot);
  if (!door) return { error: "no such door" };

  const givingUp = want.reveals.includes("answer");
  await env.DB.prepare(
    "UPDATE wa_round SET subs_used = ?, finished = ? WHERE play_id = ?"
  ).bind(need, givingUp ? 1 : 0, round.play_id).run();

  return {
    stage: want.stage, label: want.label, subsUsed: need, subsLeft: SUBS - need,
    finished: givingUp, solved: false, replayed: false,
    ...clueBody(door, want.reveals, door),
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
export async function judgeGuess(env, round, guess) {
  if (Number(round.finished)) return { error: "that door is closed" };

  const key = fold(guess);
  if (!key) return { error: "no guess" };

  const door = await doorAnswer(env, round.play_date, round.slot);
  if (!door) return { error: "no such door" };

  const n = await nextGuessNumber(env, round.play_id);
  const at = now();

  if (key === fold(door.name)) {
    await record(env, round.play_id, n, key, "right", at);
    await env.DB.prepare("UPDATE wa_round SET finished = 1, solved = 1 WHERE play_id = ?")
      .bind(round.play_id).run();
    return { verdict: "right", answer: door.name, career: door.club_history || null,
             article: door.article || null, subsUsed: Number(round.subs_used) || 0,
             finished: true, solved: true };
  }

  const alsoPlayedThere = await playedFor(env, key, door.club);
  const verdict = alsoPlayedThere ? "right-club" : "wrong";
  await record(env, round.play_id, n, key, verdict, at);

  const charge = verdict === "right-club"
    ? CONFIG.WRONG_PLAYER_SAME_CLUB_COSTS_SUB
    : CONFIG.WRONG_GUESS_COSTS_SUB;
  let spent = Number(round.subs_used) || 0;
  if (charge && spent < SUBS) {
    spent += 1;
    await env.DB.prepare("UPDATE wa_round SET subs_used = ? WHERE play_id = ?")
      .bind(spent, round.play_id).run();
  }

  /* NO ANSWER IN THIS RESPONSE, on either branch. A near miss says it was a
     near miss and stops there; saying who it actually was would end the game
     for the price of a wrong guess. */
  return { verdict, subsUsed: spent, subsLeft: SUBS - spent, finished: false, solved: false };
}

async function nextGuessNumber(env, playId) {
  const row = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM wa_guess WHERE play_id = ?").bind(playId).first();
  return (Number(row && row.n) || 0) + 1;
}

async function record(env, playId, n, guess, verdict, at) {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO wa_guess (play_id, n, guess, verdict, at_ms) VALUES (?, ?, ?, ?, ?)"
  ).bind(playId, n, guess, verdict, at).run();
}

/* WHAT THE SITTING CAME TO. Read from the rows rather than from anything the
   page reports, and the answer is included ONLY once the door is closed. */
export async function finishRound(env, round) {
  const { results } = await env.DB
    .prepare("SELECT n, guess, verdict FROM wa_guess WHERE play_id = ? ORDER BY n")
    .bind(round.play_id).all();
  const guesses = results || [];
  const closed = !!Number(round.finished);

  const out = {
    day: round.play_date,
    slot: Number(round.slot),
    solved: !!Number(round.solved),
    finished: closed,
    subsUsed: Number(round.subs_used) || 0,
    guesses: guesses.length,
    nearMisses: guesses.filter((g) => g.verdict === "right-club").length,
  };

  if (closed) {
    const door = await doorAnswer(env, round.play_date, round.slot);
    if (door) {
      out.answer = door.name;
      out.career = door.club_history || null;
      out.article = door.article || null;
      out.club = door.club;
    }
  }
  return out;
}
