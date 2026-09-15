/* functions/_lib/cw-play.js — a Codeword sitting, in the database.
 *
 * The rules live in cw-round.js; this is where a round is kept, so the four
 * routes are thin and cannot each invent their own idea of what a round is.
 *
 * EVERY WRITE HERE EXISTS BECAUSE THE CLIENT MAY NOT BE TRUSTED WITH IT. The
 * page cannot hold the solution, so it cannot mark, reveal or score — and the
 * moment the server does those, it must also own the clock, the substitutions
 * and what has already been given away, or each of them is free.
 */
import {
  SUBS, COST, SLOTS, minuteOf, outcome, confirmSlots, wrongNumbers, letterFor,
} from "./cw-round.js";

const now = () => Date.now();
const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

export async function getRound(env, playId) {
  if (!env || !env.DB || !playId) return null;
  return await env.DB.prepare("SELECT * FROM cw_round WHERE play_id = ?").bind(playId).first();
}

/* KICK OFF. Idempotent per board per day is NOT what this does — a player may
   legitimately start a second sitting of a board they finished — so what it
   does instead is mark the second one UNSCORED. Replaying a board you have
   finished is a good thing to allow and a bad thing to record: refusing it
   would make showing somebody the grid indistinguishable from re-running the
   board with the answers you just learned. */
export async function startRound(env, { boardNo, day, rate, replay }) {
  const playId = id();
  const started = now();
  /* WHOSE REPLAY IS IT? The rule used to read the BOARD's history:
       SELECT COUNT(*) FROM cw_round WHERE board_no = ? AND finished_ms IS NOT NULL
     with no player in it — and cw_round has no player column to put in it. So
     the first person to finish a board made it unscored for everyone who
     played it afterwards. The second player of every day was told their first
     sitting did not count, which is the opposite of what the rule is for.
     It is the DEVICE that says so now. The page keeps its own results under
     xicw.results and knows perfectly well whether it has finished this board;
     it says so when it kicks off.
     AND A LIE COSTS NOTHING, which is what makes trusting the client safe here
     rather than merely convenient. Claiming a replay is a first sitting gains
     no record: the page's own recordResult() refuses a board already in its
     list, and /api/account/migrate inserts with INSERT OR IGNORE against a
     uniqueness rule that lives in the schema. The worst a liar achieves is a
     duplicate row that is dropped on the way in. What `scored` actually decides
     is whether the page says "Replay — this one is not recorded", and that is
     not worth wiring a session into the kick-off path to protect.
     A ROUND THAT WAS ABANDONED IS STILL A FIRST SITTING. The client's list
     holds finished boards only, so a closed tab does not cost anybody a day —
     which was true of the old rule too and is the half worth keeping. */
  const scored = replay ? 0 : 1;
  await env.DB.prepare(
    "INSERT INTO cw_round (play_id, board_no, day, started_ms, rate_secs, scored) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(playId, boardNo, day, started, rate, scored).run();
  return { playId, startedMs: started, rate, scored: !!scored, subsLeft: SUBS };
}

/* WHICH SLOTS ARE DONE. Costs nothing and is capped at eleven asks a round —
   the cap is enforced here rather than trusted to the page, because a bound the
   client keeps is a bound the client can drop.
 *
 * A slot already recorded does not count against the cap and is returned
 * anyway: the page may legitimately re-ask after a reveal changes a square, and
 * charging for that would be charging for the same helper twice. */
export async function markRound(env, round, board, guess) {
  const already = await env.DB
    .prepare("SELECT slot FROM cw_solved WHERE play_id = ?").bind(round.play_id).all();
  const had = new Set((already.results || []).map((r) => Number(r.slot)));

  const hit = confirmSlots(board, guess || {});
  const fresh = hit.filter((s) => !had.has(s));

  if (fresh.length) {
    if (Number(round.confirms_used) >= SLOTS) {
      /* Out of asks. The slots already banked still come back — refusing to
         report what is already recorded would lose a player their board. */
      return { solved: [...had].sort((a, b) => a - b), capped: true };
    }
    const at = now();
    for (const s of fresh) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO cw_solved (play_id, slot, at_ms) VALUES (?, ?, ?)"
      ).bind(round.play_id, s, at).run();
    }
    await env.DB.prepare("UPDATE cw_round SET confirms_used = confirms_used + 1 WHERE play_id = ?")
      .bind(round.play_id).run();
  }
  const all = [...new Set([...had, ...hit])].sort((a, b) => a - b);
  return { solved: all, capped: false };
}

/* CHECK GRID — the paid helper. Names the NUMBERS carrying a wrong letter and
   never the squares, because a codeword's mistake is a mapping rather than a
   cell: naming the square would also say where to look. */
export async function checkRound(env, round, board, guess) {
  const wrong = wrongNumbers(board, guess || {});
  await env.DB.prepare("UPDATE cw_round SET spent_minutes = spent_minutes + ? WHERE play_id = ?")
    .bind(COST.check, round.play_id).run();
  return { wrong, spentMinutes: Number(round.spent_minutes) + COST.check };
}

/* REVEAL — a substitution and seven minutes.
 *
 * STORED PER NUMBER, NOT COUNTED. Revealing 14 twice returns the same letter
 * and charges once. A counter would make a refresh mid-reveal cost a
 * substitution for a letter the player already had, which is a fault only the
 * person it happened to would ever see. */
export async function revealRound(env, round, board, n) {
  const seen = await env.DB
    .prepare("SELECT letter FROM cw_reveal WHERE play_id = ? AND n = ?")
    .bind(round.play_id, n).first();
  if (seen) {
    return {
      letter: seen.letter, subsLeft: SUBS - Number(round.subs_used),
      spentMinutes: Number(round.spent_minutes), charged: false,
    };
  }
  if (Number(round.subs_used) >= SUBS) return { error: "no substitutions left" };
  const letter = letterFor(board, n);
  if (!letter) return { error: "no such number" };
  const at = now();
  await env.DB.prepare(
    "INSERT INTO cw_reveal (play_id, n, letter, at_ms) VALUES (?, ?, ?, ?)"
  ).bind(round.play_id, n, letter, at).run();
  await env.DB.prepare(
    "UPDATE cw_round SET subs_used = subs_used + 1, spent_minutes = spent_minutes + ? WHERE play_id = ?"
  ).bind(COST.reveal, round.play_id).run();
  return {
    letter, subsLeft: SUBS - Number(round.subs_used) - 1,
    spentMinutes: Number(round.spent_minutes) + COST.reveal, charged: true,
  };
}

/* THE WHISTLE. The server computes the score because the page posting it is
   the forgery hole that server-side checking was chosen to close — locking the
   front door and leaving the back one open.
 *
 * The figures are STORED rather than left derivable: a re-derivation would use
 * today's curve, so the day anybody tunes the decay every past round would
 * silently become a different round. */
/* WHICH BOARD THIS WAS, on every response. It carried neither, and the cost was
   that a finished round could not be BANKED: the page's recordResult reads
   d.day and d.no, got undefined for both, and stored a row with no day and no
   number. entryKey() then had nothing to key on — and the local record deduped
   on `no`, so board one and board two both being undefined meant the second
   finish was discarded as a duplicate of the first.
   Two faults, one cause, and neither announces itself: the page believes it has
   banked, and every check that asks the ENDPOINT what it returned is satisfied,
   because what it returned was a correct score. `day` is the identity that
   matters — it is unambiguous, where `no` has two meanings in this game — and
   `no` is sent as well because the page dedupes its own list on it. */
function identify(round) {
  return { day: round.day, no: Number(round.board_no) };
}

export async function finishRound(env, round) {
  if (round.finished_ms) {
    return {
      ...identify(round),
      score: round.score, solved: round.solved, minute: round.minute || null,
      result: round.result, scored: !!round.scored, replayed: true,
    };
  }
  const solvedRows = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM cw_solved WHERE play_id = ?").bind(round.play_id).first();
  const solved = solvedRows ? Number(solvedRows.n) : 0;
  const at = now();
  const minute = minuteOf(round, at);
  const o = outcome(minute, solved);
  await env.DB.prepare(
    "UPDATE cw_round SET finished_ms = ?, score = ?, solved = ?, result = ? WHERE play_id = ?"
  ).bind(at, o.score, o.solved, o.result, round.play_id).run();
  return { ...identify(round), ...o, scored: !!round.scored, replayed: false };
}
