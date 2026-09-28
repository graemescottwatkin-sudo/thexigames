/* frws-round.js — the clock, the finds and the fouls the server keeps for a
 * Wordsearch XI: Friends round, and the score it computes from them.
 *
 * Football's ws-round.js over the fr_ws_ tables. The judging (which squares a
 * drag covers, and which word that is) and the scoring rule are football's
 * own, IMPORTED rather than copied (judge from ws-round.js, by the routes): it is the same game, and two copies of
 * the geometry would be two answers about what a drag found.
 *
 * Without a database every function answers null and the round is simply
 * not verified, as in football.
 */
import XIWS_SCORING from "../../football/wordsearch/js/scoring.js";
import { boardById } from "./frws-data.js";

export function hasDB(env) { return !!(env && env.DB); }

const okPlay = (v) => (/^[A-Za-z0-9_-]{6,64}$/.test(String(v || "")) ? String(v) : null);

export async function startRound(env, playId, puzzleId, day, now) {
  const id = okPlay(playId);
  if (!hasDB(env) || !id || !puzzleId) return null;
  try {
    const row = await env.DB.prepare("SELECT started_ms, puzzle_id FROM fr_ws_round WHERE play_id = ?")
      .bind(id).first();
    /* A round keeps its first clock — and its board. An id reused on another
       day's board is not this round, and is refused rather than re-timed. */
    if (row) return row.puzzle_id === String(puzzleId) ? Number(row.started_ms) : null;
    await env.DB.prepare(
      "INSERT INTO fr_ws_round (play_id, puzzle_id, day, started_ms) VALUES (?, ?, ?, ?)")
      .bind(id, String(puzzleId), String(day || ""), Number(now) || Date.now()).run();
    return Number(now) || Date.now();
  } catch (e) { return null; }
}

/* The round, if it exists and is on this board. */
export async function roundOn(env, playId, puzzleId) {
  const id = okPlay(playId);
  if (!hasDB(env) || !id) return null;
  try {
    const row = await env.DB.prepare("SELECT * FROM fr_ws_round WHERE play_id = ?").bind(id).first();
    return row && (!puzzleId || row.puzzle_id === String(puzzleId)) ? row : null;
  } catch (e) { return null; }
}

export async function recordFind(env, playId, word, isBonus, now) {
  const id = okPlay(playId);
  if (!hasDB(env) || !id || !word) return null;
  try {
    await env.DB.prepare(
      `INSERT INTO fr_ws_find (play_id, word, is_bonus, at_ms) VALUES (?, ?, ?, ?)
       ON CONFLICT(play_id, word) DO NOTHING`)
      .bind(id, String(word), isBonus ? 1 : 0, Number(now) || Date.now()).run();
    return true;
  } catch (e) { return null; }
}

export async function recordFoul(env, playId, now) {
  const id = okPlay(playId);
  if (!hasDB(env) || !id) return null;
  try {
    const row = await env.DB.prepare(
      "SELECT COALESCE(MAX(idx), 0) AS n FROM fr_ws_foul WHERE play_id = ?").bind(id).first();
    const idx = Number(row && row.n) + 1;
    await env.DB.prepare(
      `INSERT INTO fr_ws_foul (play_id, idx, at_ms) VALUES (?, ?, ?)
       ON CONFLICT(play_id, idx) DO NOTHING`)
      .bind(id, idx, Number(now) || Date.now()).run();
    return idx;
  } catch (e) { return null; }
}

export async function foundWords(env, playId) {
  const id = okPlay(playId);
  if (!hasDB(env) || !id) return [];
  try {
    const { results } = await env.DB.prepare(
      "SELECT word, is_bonus, at_ms FROM fr_ws_find WHERE play_id = ? ORDER BY at_ms").bind(id).all();
    return results || [];
  } catch (e) { return []; }
}

async function foulTimes(env, id) {
  const { results } = await env.DB.prepare(
    "SELECT at_ms FROM fr_ws_foul WHERE play_id = ? ORDER BY idx").bind(id).all();
  return (results || []).map((r) => Number(r.at_ms));
}

/* Over means every word found, or the match clock past ninety. Asked before
   anything the round has not found is named. */
export async function roundIsOver(env, playId, now) {
  const id = okPlay(playId);
  if (!hasDB(env) || !id) return false;
  try {
    const round = await roundOn(env, id);
    if (!round) return false;
    const puzzle = await boardById(env, round.puzzle_id);
    if (!puzzle) return false;
    const finds = await foundWords(env, id);
    if (finds.filter((f) => !Number(f.is_bonus)).length >= (puzzle.answers || []).length) return true;
    const penalty = XIWS_SCORING.penaltyFor(await foulTimes(env, id));
    const elapsed = Math.max(0, ((Number(now) || Date.now()) - Number(round.started_ms)) / 1000);
    return XIWS_SCORING.matchMinute(elapsed, penalty) >= 90;
  } catch (e) { return false; }
}

/* WHAT A FINISHED ROUND LEARNS: every answer it missed, and the secret.
   Football names only the secret, because its list already names the eleven;
   here the list is clues, and a player who ran out of time is owed the
   answers to them. Only once the round is over, decided from these rows. */
export async function reveal(env, playId, now) {
  const id = okPlay(playId);
  if (!hasDB(env) || !id) return null;
  if (!(await roundIsOver(env, id, now))) return null;
  try {
    const round = await roundOn(env, id);
    const puzzle = round && await boardById(env, round.puzzle_id);
    if (!puzzle) return null;
    return {
      answers: (puzzle.answers || []).map((a) => a.display),
      secret: puzzle.bonus ? puzzle.bonus.display : null,
    };
  } catch (e) { return null; }
}

export async function verifiedScore(env, playId) {
  const id = okPlay(playId);
  if (!hasDB(env) || !id) return null;
  try {
    const round = await roundOn(env, id);
    if (!round) return null;
    const puzzle = await boardById(env, round.puzzle_id);
    if (!puzzle || !Array.isArray(puzzle.answers) || !puzzle.answers.length) return null;
    const finds = await foundWords(env, id);
    const words = finds.filter((f) => !Number(f.is_bonus));
    if (words.length !== puzzle.answers.length) return null;
    const fouls = await foulTimes(env, id);
    const penalty = XIWS_SCORING.penaltyFor(fouls);
    /* Timed to the last word found, not to now. */
    const lastMs = Math.max(...finds.map((f) => Number(f.at_ms)));
    const elapsed = Math.max(0, Math.round((lastMs - Number(round.started_ms)) / 1000));
    const bonusFound = finds.some((f) => Number(f.is_bonus) === 1);
    const res = XIWS_SCORING.computeScore(elapsed, penalty, bonusFound);
    return {
      score: res.score, base: res.base, bonus: res.bonus, minute: res.minute,
      found: words.length, bonusFound, penaltyMinutes: penalty,
      fouls: fouls.length, elapsedSecs: elapsed,
    };
  } catch (e) { return null; }
}
