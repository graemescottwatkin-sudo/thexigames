/* functions/_lib/cw-daily.js — today's board, for any crossword.
 *
 * This is functions/api/daily.js with the football crossword taken out of it.
 * Every comment below was written about that game and every one of them is
 * still the reason the code is shaped this way; what has changed is that the
 * game is now an argument.
 *
 * TWO ADDRESSES, ONE IMPLEMENTATION:
 *
 *   /api/daily                        -> dailyHandler(ctx, "crossword")
 *   /api/crossword/<game>/daily       -> dailyHandler(ctx, game)
 *
 * The first is what every live football client is calling right now and it
 * does not change. The second is how a second crossword gets the same server
 * without a second copy of these rules.
 */
import { publicPuzzle, json, bad } from "./puzzle.js";
import { makeToken } from "./db.js";
import { dailyNumber, dailyDayKey, ANSWERS_AFTER_DAYS } from "./daily.js";
import { mayOpenArchive, archiveRefusal, backForBoard, FREE_ARCHIVE_DAYS } from "./archive.js";
import { crosswordOf } from "./cw-registry.js";
import { launchNumber } from "./games.js";

export async function dailyHandler({ request, env }, game) {
  const cw = crosswordOf(game);
  /* AN UNKNOWN CROSSWORD IS REFUSED, NEVER DEFAULTED. Falling back to football
     would serve one game's board under another game's address, which is the
     quietest failure this endpoint could have. */
  if (!cw) return bad("Unknown crossword.", 404);

  /* ?no= asks for an earlier board. Without it you get today's.

     A number above today is ANSWERED WITH TODAY, not refused. The refusal
     dead-ended a real player, nightly: the server's day flips at midnight
     UTC, the browser's at local midnight, so every UK summer night between
     twelve and one the client computed tomorrow's number, asked for it, got
     403 "not available yet", and the daily was a toast on an empty pitch.
     The client-side recovery for a number disagreement — adoptServerBoard,
     "the server owns the calendar, so its answer wins" — was already written
     and already right, but it only runs when a BOARD comes back; a 403
     carries nothing to adopt. Clamping the ask is what lets the stated
     principle actually operate.

     Nothing leaks: the clamped answer is today's board, which is what the
     asker is entitled to. And this is the ASK only — check, reveal, verify
     and finish still validate tokens through playableDailyNo, where a claim
     about a future board stays refused. Asking is a question; a token is a
     claim. */
  let asked = NaN;
  /* Guarded because the endpoint took no request at all until ?no= arrived, and
     callers that never needed one still exist — functions_test invokes it as
     daily({ env }). An endpoint that throws when asked for its default is worse
     than one that ignores a parameter it cannot read. */
  try { asked = Number(new URL(request.url).searchParams.get("no")); } catch (e) {}

  const today = dailyNumber();

  /* THE FLOOR IS THE GAME'S LAUNCH, NOT 1. Football launched on board one so
     the two have always been the same number, which is exactly why this was
     written as 1 and nobody noticed. A crossword that launched later has no
     board below its launch number, and clamping such an ask down to 1 would
     hand back a board from before the game existed — or, with a bank indexed
     from the launch, somebody else's board entirely. */
  const first = launchNumber(game) || 1;
  const wanted = Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : today;
  const no = Math.min(Math.max(first, wanted), today);

  /* HOW FAR BACK IS THIS. Board numbers ARE days here — #1 is the epoch and
     each one after it is a day later — so the distance is subtraction, and no
     date arithmetic is needed to ask the shared question. Asked through
     backForBoard, which also answers "never a daily at all" for a board from
     before the game launched. */
  if (cw.archive) {
    const back = backForBoard(game, no, today);
    if (!(await mayOpenArchive(request, env, back))) {
      return json(archiveRefusal(back), 401);
    }
  }

  const stored = await cw.load(env, no);
  if (!stored) {
    /* PAST THE END OF A FINITE BANK IS NOT AN ERROR, it is a day the bank does
       not cover, and it must not read as a broken deploy. Only a game that
       states a last board can be past it. */
    const last = cw.lastNo ? cw.lastNo() : null;
    if (last != null && no > last) {
      return json({ mode: "daily", dailyNo: no, day: dailyDayKey(no),
        answersAfter: ANSWERS_AFTER_DAYS, lastBoardNo: last, puzzle: null });
    }
    return bad("No daily puzzle is stored for #" + no + ".", 404);
  }

  return json({
    mode: "daily",
    dailyNo: no,
    /* THE DAY THIS BOARD IS, named by the server that decides it. The hub used
       to write its own date from the device clock, and an independent review
       read "Tuesday 8 September" on the front page beside "Mon 7 Sept" in the
       game — a UK evening after local midnight and before UTC midnight, which
       is an hour of every summer night. The number was already here; the day
       it stands for was not, so the only way to name it on the client was a
       second copy of the epoch. This is the first fact, said once. */
    day: dailyDayKey(no),
    /* How many days until a board's answers page is published. The client
       needs the number for the calendar badges and the strap link, and this
       payload is how it learns it — copying the constant into game.js would
       be a second seven, drifting from the first the day one of them
       changes. The server remains the only place the rule LIVES;
       the client only displays it. */
    answersAfter: ANSWERS_AFTER_DAYS,
    /* How far back the archive is open without an account, sent for the same
       reason as answersAfter and on the same terms. Omitted entirely for a
       game with no archive: sending a number that governs nothing invites a
       client to draw a calendar lock on a game that has no calendar. */
    ...(cw.archive ? { freeArchiveDays: FREE_ARCHIVE_DAYS } : {}),
    ...(cw.lastNo ? { lastBoardNo: cw.lastNo() } : {}),
    token: makeToken("daily", no),
    puzzle: publicPuzzle(stored.puzzle),
  });
}
