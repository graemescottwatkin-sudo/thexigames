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
import { scoreAt, MAX_SCORE } from "./xi-score.js";

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

/* WHAT A BOARD IS WORTH RIGHT NOW: the curve at this minute, less what the
   clues cost. Never below nothing — spending every clue on a board you were
   slow at should leave you with nothing, not a debt. */
export function scoreFor(minute, pointsSpent) {
  return Math.max(0, Math.round(scoreAt(minute) - (Number(pointsSpent) || 0)));
}

const now = () => Date.now();
const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

/* WHAT A STAGE COSTS AND WHAT IT BUYS, read off the ladder. A stage the ladder
   does not define is not a stage. */
export function stageAt(n) {
  return LADDER.find((s) => s.stage === Number(n)) || null;
}

/* THE POINTS SPENT TO REACH A STAGE. Stage one is free and each rung after it
   costs what the ladder says. Derived rather than stored, and it can be:
   rungs are bought in order, so the stage reached IS the set bought.
   THE REVEAL IS NOT A PRICE. Its `points` is -1, a marker rather than a cost,
   because giving up does not deduct from a score — it ends the board at
   nothing. Summing it as a number would make the reveal cost less than the
   career, which is the wrong way round. */
export function costToReach(stage) {
  return LADDER
    .filter((s) => s.stage > 1 && s.stage <= Number(stage) && s.points > 0)
    .reduce((a, s) => a + s.points, 0);
}

export const GIVE_UP = CONFIG.GIVE_UP;
export const SUBS = CONFIG.SUBS_PER_BOARD;

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
  const started = now();
  await env.DB.prepare(
    "INSERT INTO wa_round (play_id, play_date, slot, started_ms, subs_used, finished, solved) " +
    "VALUES (?, ?, ?, ?, 0, 0, 0)"
  ).bind(playId, String(playDate), n, started).run();
  /* THE CLOCK STARTS HERE, not when the page says so. It is the same started_ms
     the score is struck against, and it never goes up. */
  return { playId, slot: n, startedMs: started, stage: 1, pointsSpent: 0,
           worthNow: MAX_SCORE, minute: 0 };
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
      /* THE CAREER AS SPELLS, NOT AS A SENTENCE. It went out as club_history —
         one pre-rendered string — and the page printed it as a wall:
         "2017 Paris Saint-Germain B (8) · 2017-2019 Lille II (8) · …". The
         SHAPE of a career is the puzzle, and a run-on line hides it: finding
         the one big club in there takes real effort and none at all in a list.
         Sending the spells costs nothing in secrecy — it is the same
         information, which is why it is the same rung — and it lets the page
         mark the door's own club IN PLACE, which is the thing a player is
         actually looking for.  is computed here rather than on the page
         because the page folds names for a type-ahead and must not be the thing
         that decides which spell is the door's. */
      let spells = [];
      try { spells = JSON.parse(row.clubs || "[]") || []; } catch (e) { spells = []; }
      const want = fold(door.club);
      out.spells = spells.map((c) => ({
        club: c.club, from: c.from, to: c.to, apps: c.apps, goals: c.goals,
        loan: !!c.loan, mine: fold(c.club) === want,
      }));
      out.career = row.club_history || null;
      out.clubCount = Number(row.club_count) || 0;
    } else if (what === "bio") {
      /* THE BIRTH YEAR, AND NO AGE. THIS REVERSES AN EARLIER DECISION, so what
         that decision said is recorded rather than deleted: it sent the AGE and
         withheld the year, on the grounds that the year is the sharper clue,
         and it computed the age on the server precisely so the page could not
         be handed the year and asked not to look at it. That reasoning was
         sound, and the clue is now deliberately sharper at the same ten points.
         Owner's ruling, 21 September 2026. A reversed decision with its
         original reasoning left standing beside it is how the next person
         reverses it back.

         WHAT FORCED IT. The bank has no death field, so an age was this year
         minus the birth year whether or not the man was alive. It read "age 92"
         for Dave Mackay, who died in 2015, and "age 30" for Diogo Jota, who
         died in 2025 — 109 deceased players in the bank, 75 of the 365 boards
         carrying at least one. Removing the age does not CORRECT that: it
         removes the arithmetic that produced it, so no later edit can bring it
         back by forgetting that deceased players are a case.

         A YEAR, NOT A DATE. wa_player holds birth_year and there is no birth
         date in the bank, which is why the ladder says "year of birth" and must
         not say D.O.B. — a label promising a date is one somebody eventually
         satisfies by inventing a 1 January. */
      out.birthYear = Number(row.birth_year) || null;
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
  const spent = Number(round.subs_used) || 0;   // points spent so far
  const at = now();
  const minute = minuteOf(round, at);

  /* ALREADY PAID FOR: serve it, charge nothing. A reload must not be a second
     purchase, which is the shape of fault Codeword found in its own demo where
     a clock could be rewound for free. */
  if (need <= spent) {
    const door = await doorAnswer(env, round.play_date, round.slot);
    if (!door) return { error: "no such door" };
    return {
      stage: want.stage, label: want.label, pointsSpent: spent,
      minute, worthNow: scoreFor(minute, spent), replayed: true,
      ...clueBody(door, want.reveals, door),
    };
  }

  const door = await doorAnswer(env, round.play_date, round.slot);
  if (!door) return { error: "no such door" };

  await env.DB.prepare("UPDATE wa_round SET subs_used = ? WHERE play_id = ?")
    .bind(need, round.play_id).run();

  return {
    stage: want.stage, label: want.label, pointsSpent: need, minute,
    worthNow: scoreFor(minute, need), finished: false, solved: false,
    replayed: false,
    ...clueBody(door, want.reveals, door),
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
export async function giveUp(env, round) {
  if (Number(round.finished)) return { error: "that door is closed" };
  const door = await doorAnswer(env, round.play_date, round.slot);
  if (!door) return { error: "no such door" };
  const minute = minuteOf(round, now());
  await env.DB.prepare(
    "UPDATE wa_round SET finished = 1, solved = 0, score = 0, minute = ? WHERE play_id = ?"
  ).bind(minute, round.play_id).run();
  return {
    label: GIVE_UP.label, minute, score: 0, worthNow: 0,
    pointsSpent: Number(round.subs_used) || 0,
    finished: true, solved: false,
    ...clueBody(door, GIVE_UP.reveals, door),
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

  const at2 = now();
  const minute = minuteOf(round, at2);
  const spent = Number(round.subs_used) || 0;

  if (key === fold(door.name)) {
    /* THE SCORE IS STRUCK HERE AND STORED, not recomputed at finish. A
       re-derivation would use TODAY's curve, so the day anybody tunes one every
       past board would silently become a different board. QuickFire's session
       made the same call about its bands for the same reason. */
    const score = scoreFor(minute, spent);
    await record(env, round.play_id, n, key, "right", at);
    await env.DB.prepare(
      "UPDATE wa_round SET finished = 1, solved = 1, score = ?, minute = ? WHERE play_id = ?"
    ).bind(score, minute, round.play_id).run();
    return { verdict: "right", answer: door.name, career: door.club_history || null,
             article: door.article || null, pointsSpent: spent, minute, score,
             finished: true, solved: true };
  }

  const alsoPlayedThere = await playedFor(env, key, door.club);
  const verdict = alsoPlayedThere ? "right-club" : "wrong";
  await record(env, round.play_id, n, key, verdict, at);

  /* NO ANSWER IN THIS RESPONSE, on either branch. A near miss says it was a
     near miss and stops there; saying who it actually was would end the game
     for the price of a wrong guess.
     A WRONG NAME COSTS NOTHING BUT THE CLOCK, which is already running. The
     points are spent on SUBSTITUTIONS; the tension is how many you need, not
     how many names you waste. */
  return { verdict, pointsSpent: spent, minute,
           worthNow: scoreFor(minute, spent), finished: false, solved: false };
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
    subsUsed: LADDER.filter((r) => r.points > 0 && costToReach(r.stage) <= spent).length,
    guesses: guesses.length,
    nearMisses: guesses.filter((g) => g.verdict === "right-club").length,
  };

  if (closed) {
    /* THE STORED SCORE AND MINUTE, struck when the board closed. Not recomputed
       — a re-derivation would use today's curve. */
    out.score = Number(round.score) || 0;
    out.minute = round.minute == null ? null : Number(round.minute);
    const door = await doorAnswer(env, round.play_date, round.slot);
    if (door) {
      out.answer = door.name;
      out.career = door.club_history || null;
      out.article = door.article || null;
      out.club = door.club;
    }
  } else {
    /* STILL IN PLAY: what it is worth at this moment, which is not a score and
       is not stored. No answer, because asking to finish must not be a way to
       read one. */
    const minute = minuteOf(round, now());
    out.minute = minute;
    out.worthNow = scoreFor(minute, spent);
  }
  return out;
}
