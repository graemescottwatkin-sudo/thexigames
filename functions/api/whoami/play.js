/* POST /api/whoami/play — open a door.
 *
 * Choosing a club IS the sitting: everything after it is measured against that
 * door, so the choice is recorded here rather than carried by the page.
 *
 * A PAST BOARD IS A REAL SITTING, not a practice mode — scored the same, banked
 * the same. The owner's standard is that boards which have gone can be selected
 * and played properly, and a second lesser code path for old boards would be a
 * second set of rules to keep in step.
 */
import { hasDB, today, noStore } from "../../_lib/wadata.js";
import { playableDay } from "../../_lib/wa-board.js";
import { openRound } from "../../_lib/wa-play.js";

const NO = (msg = "no") => noStore({ error: msg }, 400);

export async function onRequestPost({ request, env }) {
  if (!hasDB(env)) return NO();
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  /* WHICH DAY, checked against the table rather than believed. Without this a
     round could be opened against next July's board and its doors answered one
     at a time — the board-early leak from a different direction, since "was I
     right" is most of a door. */
  let day = today();
  if (body.date !== undefined && body.date !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) return NO("no such board");
    if (!(await playableDay(env, String(body.date)))) return NO("no such board");
    day = String(body.date);
  }

  const out = await openRound(env, day, body.slot);
  if (out.error) return NO(out.error);
  return noStore({ ...out, day });
}
