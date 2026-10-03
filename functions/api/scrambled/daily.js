/* GET /api/scrambled/daily            today's board
   GET /api/scrambled/daily?no=12      board twelve, if it is not in the future

   The SERVER decides what day it is, in UTC. A number sent up from a browser
   is a number off a clock the player controls, so `no` is checked against
   today here rather than trusted — the past is open so a missed day can be
   caught up, the future is shut because opening it gives away everything.
*/
import {
  publicBoard, boardForNumber, scKey, json, bad, loadBoards, playableTokenNo,
  consonantsPublic, SETS,
} from "../../_lib/sc-board.js";
import { dailyNumber, dailyDayKey } from "../../_lib/daily.js";
import { mayOpenArchive, archiveRefusal, backForBoard, FREE_ARCHIVE_DAYS } from "../../_lib/archive.js";
import { clockFor } from "../../_lib/preview.js";

/* ONE BODY, TWO BOARD SETS. Football's route is this file; Scrambled XI:
   Friends and Vowels XI: Friends answer at /api/scrambled_fr/daily, which
   calls the same body with the Friends set and its own game id (for the
   archive's launch rule). Everything else about a board -- the future shut,
   the cypher, the payload -- is the one rule for both. */
export function onRequestGet(ctx) { return dailyFor(ctx, "sc", "scrambled"); }

export async function dailyFor(context, set, game) {
  const { request, env } = context;
  const url = new URL(request.url);
  /* TODAY IS THE REQUEST'S (functions/_lib/preview.js): the real day for every
     player, and the previewed day for the owner's preview alone -- so the
     future stays shut below for everyone else. */
  const now = (await clockFor(context)).now;
  const today = dailyNumber(now);
  const asked = url.searchParams.get("no");
  const no = asked === null ? today : Number(asked);

  if (!Number.isInteger(no) || no < 1) return bad("Not a board number.");
  /* ONE RULE, ONE PLACE. This read `no > today` and returned 403 — the same
     rule playableTokenNo already implements for the guess and reveal routes,
     written a second time. They agreed until the archive was opened for
     testing, and then this endpoint refused board twelve while the guess route
     happily marked a name against it. Two statements of one fact, exactly the
     fault this codebase keeps paying for.
     Asked through the shared predicate now, so the mode governs every route or
     none of them. */
  if (playableTokenNo(scKey(no, null, set), now) === false) return bad("That board is not out yet.", 403);

  /* And how far back it is. A board number is a day here, the same as the
     crossword's, so the distance is subtraction. The finals are not asked
     this at all — they are a catalogue rather than a back issue, and they
     come through /api/scrambled/iconic.
     BOARDS 1 TO 6 ARE NOT BACK ISSUES EITHER, and until 6 September 2026 they
     were charged for as though they were: Scrambled launched on #7, the ring
     answers to every number below it, and its calendar offers them. Same rule
     as the finals, asked through backForBoard. */
  const back = backForBoard(game, no, today);
  if (!(await mayOpenArchive(request, env, back))) {
    return json(archiveRefusal(back), 401);
  }

  /* D1 when bound, the generated module when not. `source` rides in the
     payload so a live_check can refuse a run that quietly fell back. */
  const { boards, source } = await loadBoards(env, set);
  /* THE CONSONANT DAILY, ASKED FOR WITH ?cy=1 AND NOT PUBLIC YET.
     While consonantsPublic() is false it is served only to a signed-in admin,
     re-checked against the database on THIS request — a query string is not
     authority. The refusal is the 403 an unreleased board already gets, and
     says the same thing, because that is what it is. */
  let mode = null;
  if (url.searchParams.get("cy") === "1") {
    if (!consonantsPublic()) {
      const { isAdmin } = await import("../../_lib/auth.js");
      if (!(await isAdmin(request, env))) return bad("That board is not out yet.", 403);
    }
    mode = "consonants";
  }

  const board = boardForNumber(no, boards, mode, set);
  if (!board) return bad("No board.", 404);

  return json({
    ...publicBoard(board, no, scKey(no, mode, set)), today, token: scKey(no, mode, set), source,
    /* The board's own day. The page drew every date by counting back from
       the DEVICE's date, so a phone with a wrong clock, or a tab open across
       UTC midnight, slid the whole calendar a day. A number and its day is a
       fact that never goes stale, so the page counts from this instead. */
    day: dailyDayKey(no),
    /* THE FRIENDS RING'S FIRST DAY, for its calendar and its "so far": its
       boards begin at launch, not at the family's board 1. Football's payload
       is unchanged. */
    ...(set !== "sc" ? { first: SETS[set].first() } : {}),
    /* For the calendar's locked days; the rule stays here, the page draws it. */
    freeArchiveDays: FREE_ARCHIVE_DAYS,
  });
}

export async function onRequestHead(ctx) {
  const r = await onRequestGet(ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
