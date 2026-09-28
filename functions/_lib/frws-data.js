/* frws-data.js — Wordsearch XI: Friends, the boards and the schedule.
 *
 * Football's wsdata.js over the fr_ws_ tables, with the same release rule: a
 * board is released once its first scheduled day is today or earlier, today's
 * daily is never served whole, and the SERVER decides what day it is.
 *
 * TWO DIFFERENCES, both on purpose:
 *
 *   No sample boards. Football ships three real boards in ws-sample.js so the
 *   site runs without a database. A Friends board's list is its answers'
 *   clues, and a sample would be answers committed to the repo; without a
 *   database there is simply no daily.
 *
 *   No launch date yet. This game is not in LAUNCHED (games.js), so the
 *   archive's lower bound is the schedule's own first day — which is a
 *   placeholder until launch, when the schedule is re-dated to start then.
 */
import { utcDay } from "./daily.js";
import { LAUNCHED } from "./games.js";

export const GAME_ID = "wordsearch_fr";

export function hasDB(env) { return !!(env && env.DB); }
export function utcDayKey(now) { return utcDay(now || Date.now()); }

function parsePayload(row) {
  const body = JSON.parse(row.payload);
  return {
    id: row.id, theme: row.theme, category: row.category,
    status: row.status, hash: row.hash, version: row.version,
    share_key: row.share_key,
    grid: body.grid, answers: body.answers, bonus: body.bonus,
  };
}

export async function dailyBoard(env, now) {
  const day = utcDayKey(now);
  if (!hasDB(env)) return { day, puzzle: null };
  const row = await env.DB.prepare(
    `SELECT p.* FROM fr_ws_schedule s JOIN fr_ws_puzzles p ON p.id = s.puzzle_id
      WHERE s.day = ?`).bind(day).first();
  return { day, puzzle: row ? parsePayload(row) : null };
}

export async function boardById(env, id) {
  if (!hasDB(env)) return null;
  const row = await env.DB.prepare("SELECT * FROM fr_ws_puzzles WHERE id = ?").bind(String(id)).first();
  return row ? parsePayload(row) : null;
}

/* The first day this game counts from: its launch, or until then the first
   day of its schedule. */
async function firstDay(env) {
  if (LAUNCHED[GAME_ID]) return LAUNCHED[GAME_ID];
  const row = await env.DB.prepare("SELECT MIN(day) AS d FROM fr_ws_schedule").first();
  return (row && row.d) || "9999-12-31";
}

export async function released(env, id, now) {
  if (!hasDB(env)) return false;
  const row = await env.DB.prepare(
    "SELECT MIN(day) AS d FROM fr_ws_schedule WHERE puzzle_id = ?").bind(String(id)).first();
  const first = row && row.d ? row.d : null;
  return first === null || first <= utcDayKey(now);
}

/* Fails closed, as football's does: an unreadable schedule cannot tell
   today's board from any other, and serving it whole is the leak. */
export async function isTodaysDaily(env, id, now) {
  if (!id || !hasDB(env)) return false;
  try {
    const row = await env.DB.prepare(
      "SELECT 1 AS n FROM fr_ws_schedule WHERE day = ? AND puzzle_id = ?")
      .bind(utcDayKey(now), String(id)).first();
    return !!row;
  } catch (e) { return true; }
}

export async function lastScheduledDay(env, id, now) {
  if (!hasDB(env)) return null;
  const from = await firstDay(env);
  const row = await env.DB.prepare(
    `SELECT MAX(day) AS d FROM fr_ws_schedule WHERE puzzle_id = ? AND day <= ? AND day >= ?`)
    .bind(String(id), utcDayKey(now), from).first();
  return row && row.d ? row.d : null;
}

/* Free play's index: identity only, released boards only, and not today's. */
export async function catalog(env, now) {
  if (!hasDB(env)) return [];
  const today = utcDayKey(now);
  const rows = await env.DB.prepare(
    `SELECT p.id, p.theme, p.category, p.status
       FROM fr_ws_puzzles p
      WHERE COALESCE((SELECT MIN(day) FROM fr_ws_schedule s WHERE s.puzzle_id = p.id), '0000') <= ?
        AND p.id NOT IN (SELECT puzzle_id FROM fr_ws_schedule WHERE day = ?)
      ORDER BY p.id`).bind(today, today).all();
  return rows.results || [];
}

/* Previous days, newest first, strictly before today. */
export async function archive(env, now) {
  if (!hasDB(env)) return [];
  const today = utcDayKey(now);
  const from = await firstDay(env);
  const rows = await env.DB.prepare(
    `SELECT s.day AS day, p.id AS id, p.theme AS theme, p.category AS category
       FROM fr_ws_schedule s JOIN fr_ws_puzzles p ON p.id = s.puzzle_id
      WHERE s.day < ? AND s.day >= ?
      ORDER BY s.day DESC`).bind(today, from).all();
  return rows.results || [];
}
