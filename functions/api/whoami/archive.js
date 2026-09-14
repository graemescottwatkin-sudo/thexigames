/* GET /api/whoami/archive — the boards that have been.
 *
 * DAYS AND NUMBERS AND NOTHING ELSE. Not a club, not a door, not a count of
 * anything that could be read back to an answer. An archive index is the
 * easiest place in a game to publish tomorrow by accident — the word search did
 * exactly that on 6 September 2026, listing 233 boards out of a schedule that
 * held two years of inventory — and it is easy because the index feels like
 * metadata right up until you notice the metadata IS the board.
 */
import { hasDB, noStore, today } from "../../_lib/wadata.js";
import { archive, lastPlayableDay } from "../../_lib/wa-board.js";

export async function onRequestGet({ env }) {
  if (!hasDB(env)) return noStore({ error: "no database binding", source: "none" }, 503);
  let boards = [], last = null;
  try {
    boards = await archive(env);
    last = await lastPlayableDay(env);
  } catch (err) {
    return noStore({ error: "query failed", detail: String(err), source: "d1" }, 500);
  }
  return noStore({ source: "d1", today: today(), lastDay: last, count: boards.length, boards });
}

export const onRequestHead = onRequestGet;
