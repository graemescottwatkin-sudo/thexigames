/* Word Search data access — the one place the release rule lives.
 *
 * THE RULE: a board is released once its first scheduled day is today or
 * earlier. Unreleased boards are refused with a 404 that carries not one word
 * of the board — the refusal is the security property, same as the crossword's
 * answers pages. Everything else (daily, free play, catalog) is a lookup.
 *
 * THE DAY: the server decides what day it is, in UTC, exactly as
 * /api/daily does for the crossword. The browser never computes a date and
 * sends it up; it asks. Changing a device clock changes nothing.
 */
import { SAMPLE_PUZZLES, samplePuzzleForDay, sampleFirstDay } from "./ws-sample.js";
import { utcDay } from "./daily.js";
/* WHEN THIS GAME LAUNCHED. One fact, in games.js with the family list —
   the schedule cannot answer it, because the schedule starts eight months
   before the game did. */
import { LAUNCHED } from "./games.js";

export function hasDB(env) { return !!(env && env.DB); }

/* The family's, not this game's: see utcDay in daily.js. Kept as a name this
   file already used so nothing that calls it has to change. */
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

/* Today's board. Returns { day, puzzle } or null if the schedule has no row
   for today — which the client must treat as "no daily", not an error, so the
   day the schedule runs out degrades to Free Play rather than a broken page. */
export async function dailyBoard(env, now) {
  const day = utcDayKey(now);
  if (!hasDB(env)) return { day, puzzle: samplePuzzleForDay(day), sample: true };
  const row = await env.DB.prepare(
    `SELECT p.* FROM ws_schedule s JOIN ws_puzzles p ON p.id = s.puzzle_id
      WHERE s.day = ?`).bind(day).first();
  return { day, puzzle: row ? parsePayload(row) : null };
}

/* When a board first appears as a daily. Null means it is never scheduled,
   which counts as released — an unscheduled board has no date to protect.

   THIS IS THE CATALOGUE'S QUESTION, not the archive's: may this board be
   opened in free play. It reads every row in the schedule on purpose,
   including the two years of inventory pre-filled from 1 January 2026, and
   that is why free play offers the whole catalogue rather than the eleven
   boards that have run. Do not narrow it — see firstRunDay below, which is
   the archive's question and a different one. */
export async function firstScheduledDay(env, id) {
  if (!hasDB(env)) return sampleFirstDay(id);
  const row = await env.DB.prepare(
    `SELECT MIN(day) AS d FROM ws_schedule WHERE puzzle_id = ?`).bind(id).first();
  return row && row.d ? row.d : null;
}

/* When a board first RUNS as the daily — the first scheduled day on or after
   the game LAUNCHED. Null means it never does, which is a catalogue board
   with no date to protect.
 *
 * THE DIFFERENCE BETWEEN THIS AND firstScheduledDay WAS A LEAK, and it was
 * live. ws_schedule holds 730 days of inventory from 1 January 2026 and the
 * word search launched on 27 August, so 233 boards had a first row from
 * months before the game existed — and the answers seal, which asks whether
 * that first day is more than ANSWERS_AFTER_DAYS old, said yes to every one
 * of them. All 233 are scheduled to run in the FUTURE: XIWS-0127 is the daily
 * on 1 January 2027 and its answers page was serving the eleven names, every
 * placement and the secret bonus word on 6 September 2026. Found while
 * writing down the launch dates, which is the fact that was missing.
 *
 * A day before the game launched is not a day it ran. The launch is games.js's
 * fact — the schedule cannot answer it, because the schedule starts first. */
export async function firstRunDay(env, id) {
  const from = LAUNCHED.wordsearch;
  if (!from) return null;
  if (!hasDB(env)) {
    const d = sampleFirstDay(id);
    return d && d >= from ? d : null;
  }
  const row = await env.DB.prepare(
    `SELECT MIN(day) AS d FROM ws_schedule WHERE puzzle_id = ? AND day >= ?`)
    .bind(id, from).first();
  return row && row.d ? row.d : null;
}

/* The most recent day this board WAS the daily, on or before today, or null
   if it has never had one.
 *
 * Not firstScheduledDay. That one answers "may this be shown at all", where
 * the first appearance is the right question — a board is a secret until its
 * first day. This answers "how old is this to a player", and a board that ran
 * again last Tuesday is a week old however long ago it debuted. Asking the
 * first day for the age would lock a board that is currently in rotation.
 *
 * A board that has never been scheduled has no age. That is not a gap: the
 * free-play catalogue is a catalogue, not a set of back issues, and it is not
 * what the archive gate is about. */
export async function lastScheduledDay(env, id, now) {
  const today = utcDayKey(now);
  if (!hasDB(env)) {
    const first = sampleFirstDay(id);
    return first && first <= today ? first : null;
  }
  const row = await env.DB.prepare(
    `SELECT MAX(day) AS d FROM ws_schedule WHERE puzzle_id = ? AND day <= ?`)
    .bind(id, today).first();
  return row && row.d ? row.d : null;
}

export async function boardById(env, id) {
  if (!hasDB(env)) {
    return SAMPLE_PUZZLES.find((p) => p.id === id) || null;
  }
  const row = await env.DB.prepare(`SELECT * FROM ws_puzzles WHERE id = ?`)
    .bind(id).first();
  return row ? parsePayload(row) : null;
}

export async function released(env, id, now) {
  const first = await firstScheduledDay(env, id);
  if (first === null) return true;
  return first <= utcDayKey(now);
}

/* The Free Play index: identity only, no grids, no answers. 374 rows of
   theme/category is a few KB; 374 full boards is the 827KB page this
   architecture exists to retire. Unreleased boards are simply absent, so the
   browser cannot list what it must not open. */
/* ---- IS THIS BOARD TODAY'S DAILY? ----
 *
 * The one question the free-play routes never asked, and the answer is why
 * /api/wordsearch/puzzle?id=<today's id> handed back today's board complete
 * with all eleven placements, to anybody. `released()` passes any board first
 * scheduled today or earlier, and the archive gate saw daysBack = 0, so both
 * doors opened on the board every player is currently competing on.
 *
 * Withholding the placements from /daily alone would have been theatre while
 * this route existed. Today's board is not free play, not an archive entry and
 * not a catalogue row: it is the one board in flight, and it stops being
 * special at midnight by itself.
 *
 * Asked of the schedule, which is where the answer lives — not of a list
 * somebody has to remember to update. */
export async function isTodaysDaily(env, id, now) {
  if (!id) return false;
  const today = utcDayKey(now);
  if (!hasDB(env)) return sampleFirstDay(id) === today;
  try {
    const row = await env.DB.prepare(
      "SELECT 1 AS n FROM ws_schedule WHERE day = ? AND puzzle_id = ?")
      .bind(today, String(id)).first();
    return !!row;
  } catch (e) {
    /* FAIL CLOSED. An unreadable schedule cannot tell today's board from any
       other, and the two wrong answers are not equal: a false NO serves the
       board in flight complete with its answers, which is the leak this whole
       function exists to close, while a false YES refuses a board that would
       have been fine and shows the player a 404 until the database answers
       again. An outage on one route is recoverable; a leak is not. */
    return true;
  }
}

export async function catalog(env, now) {
  const today = utcDayKey(now);
  if (!hasDB(env)) {
    const out = [];
    for (const p of SAMPLE_PUZZLES) {
      const first = sampleFirstDay(p.id);
      if (first === today) continue;          // today's board is not free play
      if (first === null || first <= today) {
        out.push({ id: p.id, theme: p.theme, category: p.category, status: p.status });
      }
    }
    return out;
  }
  /* AND NOT TODAY'S BOARD. Free play lists what a player may open whole; the
     board in flight is not that, and listing it is how its id reached the
     route that served it complete. It returns to the list tomorrow. */
  const rows = await env.DB.prepare(
    `SELECT p.id, p.theme, p.category, p.status
       FROM ws_puzzles p
      WHERE COALESCE((SELECT MIN(day) FROM ws_schedule s WHERE s.puzzle_id = p.id), '0000') <= ?
        AND p.id NOT IN (SELECT puzzle_id FROM ws_schedule WHERE day = ?)
      ORDER BY p.id`).bind(today, today).all();
  return rows.results || [];
}

/* Previous days: every day the schedule has already played, newest first,
   with the board that stood that day. STRICTLY BEFORE TODAY — today is the
   hero on the landing, and tomorrow is the one secret this game has. A day
   that has gone is released by the rule above (its first day is behind us),
   so this list can never name a board the catalog would not. Identity only:
   no grid, no names, no bonus. */
export async function archive(env, now) {
  const today = utcDayKey(now);
  if (!hasDB(env)) {
    /* One day back only. The sample schedule is a rolling fiction, and two
       days back it lands on the board the sample holds as unreleased. */
    const day = new Date(Date.parse(today + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
    const p = samplePuzzleForDay(day);
    return [{ day, id: p.id, theme: p.theme, category: p.category }];
  }
  /* NOT EVERY SCHEDULED DAY IS A PREVIOUS PUZZLE. ws_schedule was pre-filled
     from 1 January 2026 — 730 consecutive days of inventory — and this listed
     all of them that were before today. So the page offered 238 "previous
     puzzles" from before the game existed, and claimed the word search had a
     daily on 3 February 2026. Reported by the owner from outside; invisible
     from in here, because the query was correct about the table and wrong
     about what the table means.

     THE LINE IS DERIVED, NOT WRITTEN DOWN: a day before the family's day one
     has no board NUMBER, so it has no address either — dailyNoForDay returns
     null and /football/wordsearch/daily/<n> cannot name it. A row that is
     listed as a past board and cannot be linked to is the same fault twice, so
     the archive is bounded by exactly the set that is addressable and the two
     can no longer disagree.

     AND THE LAST DAY OF IT, closed on 6 September: the word search went live
     on 27 August and day one of the family is the 26th, so this listed one
     board from the day before the game served anything. That needed a
     per-game launch date, which now exists — LAUNCHED in games.js — so the
     bound is the day the game launched rather than the day the family did. */
  const firstDay = LAUNCHED.wordsearch;
  const rows = await env.DB.prepare(
    `SELECT s.day AS day, p.id AS id, p.theme AS theme, p.category AS category
       FROM ws_schedule s JOIN ws_puzzles p ON p.id = s.puzzle_id
      WHERE s.day < ? AND s.day >= ?
      ORDER BY s.day DESC`).bind(today, firstDay).all();
  return rows.results || [];
}
