/* GET /api/quickfire/archive — the boards that have been.
 *
 * DAYS AND NUMBERS AND NOTHING ELSE. Not a clue, not an option, not a count of
 * anything that could be read back to a question. An archive index is the
 * easiest place in a game to publish tomorrow by accident — the word search did
 * exactly that on 6 September 2026, listing 233 boards out of a schedule that
 * held two years of inventory, complete with names, placements and the secret
 * bonus word — and the reason it is easy is that the index feels like metadata
 * right up until you notice the metadata IS the board.
 *
 * So the bound lives in the query (play_date <= today, status published) rather
 * than in a filter applied after, and what comes back carries nothing worth
 * leaking even if the bound were wrong.
 */
import { hasDB, noStore, today } from "../../_lib/qfdata.js";
import { archive, lastPlayableDay } from "../../_lib/qf-board.js";

export async function onRequestGet({ env }) {
  if (!hasDB(env)) {
    return noStore({ error: "no database binding", source: "none" }, 503);
  }

  let boards = [], last = null;
  try {
    boards = await archive(env);
    last = await lastPlayableDay(env);
  } catch (err) {
    return noStore({ error: "query failed", detail: String(err), source: "d1" }, 500);
  }

  return noStore({
    source: "d1",
    today: today(),
    lastDay: last,
    count: boards.length,
    boards,
  });
}

export const onRequestHead = onRequestGet;
