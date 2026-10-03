/* functions/_lib/preview.js — the owner playing a day before it is served.
 *
 * The owner, 3 Oct 2026: play the next days of any game "in its proper form"
 * from an admin area, every game at once, recording nothing ("Record nothing";
 * scratch rounds "Temporary rows, wiped"). Reading clues in a table is not
 * reviewing a board; the real page drawing the real board is.
 *
 * WHAT A PREVIEW IS, ON THE SERVER: a request that carries PREVIEW_HEADER with
 * a day, from a signed-in admin. For that request, and only that request, it
 * is that day: every endpoint asks clockFor(context) instead of Date.now(), and
 * gets the real time moved forward by whole days. So a board is served, a
 * round is started and an answer is judged by the same code a player meets,
 * on the day the owner asked for. Nothing global moves: a Worker serves many
 * requests at once, and a clock patched for one would be a clock patched for
 * every visitor in the isolate -- the one leak this design exists to avoid.
 *
 * THE ADMIN TEST IS THE GUARD, so it is the strict one: the users row, read
 * fresh (isAdmin), never anything the request asserts. A header without an
 * admin session is ignored, not refused -- the request is served as the day it
 * really is, exactly as if the header were absent, so a probe learns nothing.
 *
 * A PREVIEW RECORDS NOTHING. The page's own shim (shared/xi-preview.js) keeps
 * plays, results, saves, streaks, the season and account sync from leaving the
 * tab. What a server-judged game cannot do without is a scratch round, and
 * those carry ids starting PREVIEW_PREFIX, are written nowhere else, and are
 * deleted by purgePreviewRounds().
 */
import { isAdmin } from "./auth.js";
import { utcDay } from "./daily.js";

export const PREVIEW_HEADER = "X-XI-Preview";
/* Every scratch round's id starts with this, and nothing a player can mint
   does: XIPlays' ids are UUIDs and the servers' are newId()s. */
export const PREVIEW_PREFIX = "pv-";
/* How far ahead a preview may look. Two months covers every calendar's
   review horizon; a bound at all means a stolen admin session cannot walk
   the whole bank in one sitting. */
export const PREVIEW_MAX_DAYS = 60;

const DAY_MS = 86400000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* The day a header asks for, if it is one this preview may show: a real date,
   from today to PREVIEW_MAX_DAYS ahead. Pure, so the bounds are testable
   without a database. */
export function askedDay(value, now = Date.now()) {
  const v = String(value || "");
  if (!DAY_RE.test(v)) return null;
  const at = Date.parse(v + "T00:00:00Z");
  if (!Number.isFinite(at) || utcDay(at) !== v) return null;   // 2026-02-30 is not a day
  const today = Date.parse(utcDay(now) + "T00:00:00Z");
  const ahead = Math.round((at - today) / DAY_MS);
  return ahead >= 0 && ahead <= PREVIEW_MAX_DAYS ? v : null;
}

/* What time it is FOR THIS REQUEST, and whether that is a preview.
 * { now, day, preview }: now is ms since the epoch, day is its UTC day.
 * Decided once per request and kept on context.data, which Pages hands the
 * same object to the middleware and the handler. */
export async function clockFor(context) {
  const data = context && context.data;
  if (data && data.xiClock) return data.xiClock;
  const real = Date.now();
  let clock = { now: real, day: utcDay(real), preview: false };
  const request = context && context.request;
  const asked = request ? askedDay(request.headers.get(PREVIEW_HEADER), real) : null;
  if (asked && (await isAdmin(request, context.env))) {
    const shift = Date.parse(asked + "T00:00:00Z") - Date.parse(utcDay(real) + "T00:00:00Z");
    clock = { now: real + shift, day: asked, preview: true };
  }
  if (data) data.xiClock = clock;
  return clock;
}

/* A scratch round's id. */
export function previewId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return PREVIEW_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function isPreviewId(id) {
  return String(id || "").startsWith(PREVIEW_PREFIX);
}

/* EVERY TABLE A SCRATCH ROUND CAN TOUCH, with the column holding its id.
   A game that starts writing rounds in a new table adds it here, and
   preview_test refuses a migration-created round table that is missing. */
export const PREVIEW_ROUND_TABLES = [
  ["qf_round", "play_id"], ["qf_answer", "play_id"],
  ["fr_qf_round", "play_id"], ["fr_qf_answer", "play_id"],
  ["wa_round", "play_id"], ["wa_guess", "play_id"],
  ["fr_wa_round", "play_id"], ["fr_wa_guess", "play_id"],
  ["fr_lr_run", "run_id"], ["fr_lr_answer", "run_id"],
  ["hl_round", "play_id"], ["hl_call", "play_id"],
  ["bp_round", "play_id"], ["bp_answer", "play_id"], ["bp_narrow", "play_id"],
  ["gd_round", "play_id"], ["gd_guess", "play_id"], ["gd_hint", "play_id"],
  ["cw_round", "play_id"], ["cw_solved", "play_id"], ["cw_reveal", "play_id"],
  ["ws_round", "play_id"], ["ws_find", "play_id"], ["ws_foul", "play_id"],
  ["fr_ws_round", "play_id"], ["fr_ws_find", "play_id"], ["fr_ws_foul", "play_id"],
  ["sc_round", "play_id"], ["sc_solve", "play_id"],
];
/* Tables with a play id that a preview NEVER writes, named so preview_test can
   tell "deliberately absent" from "forgotten": the play counter and the
   challenges are held in the page (shared/xi-preview.js, xi-plays.js). */
export const PREVIEW_NEVER_WRITES = ["plays", "challenges", "challenge_entries", "challenge_starts"];

/* Delete every scratch row. Run when the admin page opens, so a preview's
   rounds live only until the owner next goes back to the list. LIKE with the
   prefix and nothing a request supplies, so the statement cannot be steered. */
export async function purgePreviewRounds(env) {
  let removed = 0;
  for (const [table, column] of PREVIEW_ROUND_TABLES) {
    try {
      const r = await env.DB.prepare(`DELETE FROM ${table} WHERE ${column} LIKE ?`).bind(PREVIEW_PREFIX + "%").run();
      removed += Number((r && r.meta && r.meta.changes) || 0);
    } catch (e) { /* a table this deployment has not migrated */ }
  }
  return removed;
}
