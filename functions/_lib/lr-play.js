/* functions/_lib/lr-play.js — a Lightning Round sitting, in the database.
 *
 * The rules are in lr-round.js; this is where a run is kept, so the routes
 * stay thin. The shape is QuickFire's (qf-play.js): the server deals, the
 * server holds the clock, the server marks, and an answer leaves only with the
 * verdict on its own question, once that question is settled.
 *
 * ONE CLOCK FOR THE RUN, NOT ONE PER QUESTION. QuickFire stamps each question
 * as it is served; here the run's time (config RUN_MS) starts when the run is
 * written and every wrong answer moves the end WRONG_PENALTY_MS closer. The next question travels
 * back with the verdict on the last, so a run costs one round trip an answer.
 */
import { utcDay, dailyNumber, dailyDayKey, dailyNoForDay } from "./daily.js";
import { launchNumber } from "./games.js";
import {
  RUN_MS, WRONG_PENALTY_MS, LATE_GRACE_MS, POINTS, RECENT_KEEP,
  deal, shape, msLeft, judge,
} from "./lr-round.js";

const ID_RE = /^[A-Z]{3}\d{4}$/;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

export const today = utcDay;

/* WHICH BOARD A NUMBER IS. The family's daily number (functions/_lib/daily.js),
   bounded by this game's launch and by today: a number before the launch was
   never a Lightning daily, and one after today has not happened. Past boards
   are real sittings -- dealt from their own date, the same run everybody got
   that day -- which is what the family promises a board's address. */
export function boardFor(no, now = Date.now()) {
  const todayNo = dailyNumber(now);
  const first = launchNumber("lightning_fr") || todayNo;
  const n = no === undefined || no === null || no === "" ? todayNo : Number(no);
  if (!Number.isInteger(n) || n < first || n > todayNo) return null;
  return { no: n, day: dailyDayKey(n), isToday: n === todayNo };
}

export async function getRun(env, runId) {
  if (!env || !env.DB || !runId || typeof runId !== "string") return null;
  return await env.DB.prepare("SELECT * FROM fr_lr_run WHERE run_id = ?").bind(runId).first();
}

async function loadPool(env) {
  const q = await env.DB.prepare("SELECT id, diff, pgk FROM fr_lr_question").all();
  const p = await env.DB.prepare("SELECT a, b FROM fr_lr_pair").all();
  return { pool: q.results || [], pairs: (p.results || []).map((r) => [r.a, r.b]) };
}

/* THE DAY'S RUN, dealt from the date the first time anyone asks and stored,
   so everyone that day gets the list the first player got even if the pool is
   rebuilt in between. INSERT OR IGNORE and read back: two first players at
   once both deal the same list, and whichever lands is the one kept. */
export async function dailySeq(env, day, loaded) {
  const row = await env.DB.prepare("SELECT seq FROM fr_lr_daily WHERE play_date = ?").bind(day).first();
  if (row) return JSON.parse(row.seq);
  const { pool, pairs } = loaded || await loadPool(env);
  const seq = deal(pool, pairs, "daily:" + day);
  if (!seq.length) return seq;
  await env.DB.prepare("INSERT OR IGNORE INTO fr_lr_daily (play_date, seq) VALUES (?, ?)")
    .bind(day, JSON.stringify(seq)).run();
  const kept = await env.DB.prepare("SELECT seq FROM fr_lr_daily WHERE play_date = ?").bind(day).first();
  return kept ? JSON.parse(kept.seq) : seq;
}

/* Ids the player's browser says it has seen, most recent first. Checked for
   shape and capped: a list sent up is a preference, and a preference is all
   it can buy. */
export function cleanRecent(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const id of list) {
    if (typeof id !== "string" || !ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= RECENT_KEEP) break;
  }
  return out;
}

async function markSeen(env, userId, questionId, at) {
  if (!userId) return;
  await env.DB.prepare(
    "INSERT INTO fr_lr_seen (user_id, question_id, seen_ms) VALUES (?, ?, ?) " +
    "ON CONFLICT(user_id, question_id) DO UPDATE SET seen_ms = excluded.seen_ms"
  ).bind(userId, questionId, at).run();
}

async function questionRow(env, id) {
  return await env.DB.prepare(
    "SELECT id, clue, answer, option_1, option_2, option_3, option_4 FROM fr_lr_question WHERE id = ?"
  ).bind(id).first();
}

/* KICK OFF. The clock starts when this row is written. */
export async function startRun(env, { mode, no = null, userId = null, recent = [], now = Date.now() }) {
  const board = mode === "daily" ? boardFor(no, now) : boardFor(null, now);
  if (!board) return { error: "no such board" };
  const day = board.day;
  const loaded = await loadPool(env);
  if (!loaded.pool.length) return { error: "no questions" };

  let seq, seed;
  if (mode === "daily") {
    seq = await dailySeq(env, day, loaded);
    seed = "daily:" + day;
  } else {
    /* Practice avoids what this player has seen lately — the account's list
       when signed in, the browser's otherwise, both when both — and today's
       daily, so practising first does not spoil it. */
    let mine = [];
    if (userId) {
      const r = await env.DB.prepare(
        "SELECT question_id FROM fr_lr_seen WHERE user_id = ? ORDER BY seen_ms DESC LIMIT ?"
      ).bind(userId, RECENT_KEEP).all();
      mine = (r.results || []).map((x) => x.question_id);
    }
    const merged = cleanRecent([...mine, ...cleanRecent(recent)]);
    const avoid = await dailySeq(env, day, loaded);
    seed = "practice:" + newId();
    seq = deal(loaded.pool, loaded.pairs, seed, { recent: merged, avoid });
  }
  if (!seq.length) return { error: "no questions" };

  const first = await questionRow(env, seq[0]);
  if (!first) return { error: "no questions" };

  const runId = newId();
  await env.DB.prepare(
    "INSERT INTO fr_lr_run (run_id, mode, play_date, user_id, seed, seq, started_ms, penalty_ms, served, score, wrong) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, 0, 0)"
  ).bind(runId, mode, day, userId, seed, JSON.stringify(seq), now).run();
  await markSeen(env, userId, first.id, now);

  return { runId, mode, day, no: mode === "daily" ? board.no : null, isToday: board.isToday,
           msLeft: RUN_MS, score: 0, wrong: 0, question: shape(first, seed, 1) };
}

/* WHERE A RUN IS, for a page that was reloaded mid-run. The clock did not
   stop while it was away. */
export async function resumeRun(env, run, now = Date.now()) {
  if (run.finished_ms) return { over: true };
  const left = msLeft(run, now);
  const seq = JSON.parse(run.seq);
  const idx = Number(run.served);
  if (left <= 0 || idx > seq.length) return { over: true, msLeft: 0 };
  const row = await questionRow(env, seq[idx - 1]);
  if (!row) return { over: true, msLeft: 0 };
  return {
    runId: run.run_id, mode: run.mode, day: run.play_date,
    no: run.mode === "daily" ? dailyNoForDay(run.play_date) : null,
    isToday: run.play_date === today(now),
    msLeft: left, score: Number(run.score), wrong: Number(run.wrong),
    question: shape(row, run.seed, idx),
  };
}

/* ONE LOCKED PICK, and the next question with the verdict. */
export async function answerRun(env, run, idx, pick, now = Date.now()) {
  if (run.finished_ms) return { error: "that run is over", over: true };

  const seq = JSON.parse(run.seq);
  if (!Number.isInteger(idx) || idx < 1 || idx > seq.length) return { error: "no such question" };

  /* A REPLAY — a retry on a flaky connection, a double tap — gets what it got
     the first time, and changes nothing. */
  const already = await env.DB.prepare(
    "SELECT correct FROM fr_lr_answer WHERE run_id = ? AND idx = ?"
  ).bind(run.run_id, idx).first();
  if (already) return await replay(env, run, idx, seq, !!already.correct, now);

  if (Number(run.served) !== idx) return { error: "that question has not been served" };

  const left = msLeft(run, now);
  /* THE CLOCK IS THIS SERVER'S. A pick that arrives after zero is forgiven by
     LATE_GRACE_MS — it left the page in time and spent the rest in transit —
     and anything later is not marked at all. */
  if (left < -LATE_GRACE_MS) return { error: "time is up", over: true, msLeft: 0 };

  const row = await questionRow(env, seq[idx - 1]);
  if (!row) return { error: "no such question" };
  const verdict = judge(row, pick);
  if (!verdict.offered) return { error: "that was not one of the options" };

  const gained = verdict.correct ? POINTS : 0;
  const penalty = verdict.correct ? 0 : WRONG_PENALTY_MS;
  try {
    /* ONE TRANSACTION. The answer's primary key is the anti-replay rule, and
       the run moves on only if the answer landed; the `served = ?` guard means
       two requests racing for one question cannot both move it. */
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO fr_lr_answer (run_id, idx, question_id, pick, correct, at_ms) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(run.run_id, idx, row.id, String(pick), verdict.correct ? 1 : 0, now),
      env.DB.prepare(
        "UPDATE fr_lr_run SET score = score + ?, wrong = wrong + ?, penalty_ms = penalty_ms + ?, served = ? " +
        "WHERE run_id = ? AND served = ?"
      ).bind(gained, verdict.correct ? 0 : 1, penalty, idx + 1, run.run_id, idx),
    ]);
  } catch (e) {
    const won = await env.DB.prepare(
      "SELECT correct FROM fr_lr_answer WHERE run_id = ? AND idx = ?"
    ).bind(run.run_id, idx).first();
    if (won) return await replay(env, run, idx, seq, !!won.correct, now);
    throw e;
  }

  const after = { ...run, penalty_ms: Number(run.penalty_ms) + penalty };
  const leftAfter = msLeft(after, now);
  let next = null;
  if (leftAfter > 0 && idx < seq.length) {
    const nrow = await questionRow(env, seq[idx]);
    if (nrow) {
      next = shape(nrow, run.seed, idx + 1);
      await markSeen(env, run.user_id, nrow.id, now);
    }
  }
  return {
    idx, correct: verdict.correct,
    score: Number(run.score) + gained,
    wrong: Number(run.wrong) + (verdict.correct ? 0 : 1),
    penaltyMs: penalty,
    msLeft: Math.max(0, leftAfter),
    /* THE RIGHT ONE, WITH EVERY VERDICT, so the page can light it green the
       moment a pick is marked: the owner, 29 Sep 2026, "Immediately upon
       answering" -- reversing the 28 Sep hold to the end of the run. Only ever
       for the question this request has just settled; a question not yet
       answered never carries it (shape() sends none), and the cap on starts
       per hour is what stands between this and the bank read out. */
    answer: row.answer,
    next,
  };
}

async function replay(env, run, idx, seq, correct, now) {
  const fresh = (await getRun(env, run.run_id)) || run;
  /* The same verdict the first time gave, answer and all. */
  const row = await questionRow(env, seq[idx - 1]);
  let next = null;
  const left = msLeft(fresh, now);
  if (left > 0 && Number(fresh.served) === idx + 1 && idx < seq.length) {
    const nrow = await questionRow(env, seq[idx]);
    if (nrow) next = shape(nrow, fresh.seed, idx + 1);
  }
  return {
    idx, correct, replayed: true,
    score: Number(fresh.score), wrong: Number(fresh.wrong), penaltyMs: 0,
    msLeft: Math.max(0, left),
    ...(row ? { answer: row.answer } : {}),
    next,
  };
}

/* THE WHISTLE. Refused while the server's clock still has time on it and
   there are questions left, so a page cannot end a run early to bank a score
   it likes — and the page is told how long is left, so a clock that drifted
   can pick up where the server is. */
export async function finishRun(env, run, now = Date.now()) {
  const seq = JSON.parse(run.seq);
  const left = msLeft(run, now);
  const exhausted = Number(run.served) > seq.length;
  if (!run.finished_ms) {
    if (left > 0 && !exhausted) return { error: "there is still time on the clock", msLeft: left };
    await env.DB.prepare("UPDATE fr_lr_run SET finished_ms = ? WHERE run_id = ? AND finished_ms IS NULL")
      .bind(now, run.run_id).run();
  }
  const { results } = await env.DB.prepare(
    "SELECT a.idx, a.pick, a.correct, q.clue, q.answer FROM fr_lr_answer a " +
    "LEFT JOIN fr_lr_question q ON q.id = a.question_id WHERE a.run_id = ? ORDER BY a.idx"
  ).bind(run.run_id).all();
  const answers = results || [];
  const score = answers.reduce((a, r) => a + (r.correct ? POINTS : 0), 0);
  return {
    mode: run.mode, day: run.play_date,
    no: run.mode === "daily" ? dailyNoForDay(run.play_date) : null,
    score, wrong: answers.filter((r) => !r.correct).length, answered: answers.length,
    /* What the misses took off the clock, as charged. */
    lostMs: Number(run.penalty_ms) || 0,
    marks: answers.map((r) => (r.correct ? 1 : 0)),
    /* THE ONES THEY MISSED, with their answers, gathered for the review after
       the whistle (each was also shown the moment it was missed). */
    missed: answers.filter((r) => !r.correct).map((r) => ({ clue: r.clue, pick: r.pick, answer: r.answer })),
    /* EVERY ONE, IN ORDER, for the family panel's folded "Your answers": the
       clue and whether it was got, and the answer only where it was missed --
       a right pick already is the answer. */
    answers: answers.map((r) => (r.correct ? { correct: true, clue: r.clue }
      : { correct: false, clue: r.clue, pick: r.pick, answer: r.answer })),
  };
}
