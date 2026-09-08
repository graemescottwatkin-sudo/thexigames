/* GET /api/ballpark/daily         today's board
   GET /api/ballpark/daily?no=12   that board, if it is not in the future

   THE SERVER DECIDES WHAT DAY IT IS, in UTC, and therefore which board today
   is. A number sent up is checked against today here rather than trusted: the
   past is open so a missed day can be caught up, the future is shut because
   opening it gives away eleven answers.

   THE BOARD LEAVES THROUGH publicBoard(), WHICH IS THE POINT OF THIS ENDPOINT.
   Every question is a number and the number is the answer, so what goes out is
   the question, its detail line, the slider's ends, its step, its unit, the
   WIDTH of the ballpark and whether it is graded strictly. Not the answer. See
   functions/_lib/bp-board.js, which explains why the guard here is structural
   rather than a grep for the answers: numbers coincide and words do not. */
import { json, bad } from "../../_lib/puzzle.js";
import { dailyNumber, dailyDayKey } from "../../_lib/daily.js";
import {
  loadBank, boardForDay, publicBoard, boardToken, todayKey, leaks,
} from "../../_lib/bp-board.js";
import {
  mayOpenArchive, archiveRefusal, daysBack, FREE_ARCHIVE_DAYS,
} from "../../_lib/archive.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const now = Date.now();
  const today = dailyNumber(now);

  /* A BOARD NUMBER, which is what every game in the family is addressed by
     since 6 September 2026 — see functions/_lib/permalink.js. The schedule is
     keyed by DAY because a calendar is, so the two are reconciled in one place
     and never here. */
  const asked = url.searchParams.get("no");
  const no = asked === null ? today : Number(asked);
  if (!Number.isInteger(no) || no < 1) return bad("Not a board number.");
  if (no > today) return bad("That board is not out yet.", 403);

  const day = dailyDayKey(no);
  if (!day) return bad("Not a board number.");

  /* Refused before the bank is read: a board nobody may open is a board there
     is no reason to load. The rule LIVES in _lib/archive.js and is not
     restated — today and the week behind it are free, older needs an account. */
  const back = daysBack(day, todayKey(now));
  if (!(await mayOpenArchive(request, env, back))) {
    return json(archiveRefusal(back), 401);
  }

  const bank = await loadBank(env);
  const board = boardForDay(bank, day);
  /* No row for the day: the calendar has not begun or has run out. Said
     plainly, with no board, so the page can degrade rather than error. */
  if (!board) {
    return json({ no, day, today, board: null, source: bank.source,
                  freeArchiveDays: FREE_ARCHIVE_DAYS });
  }

  const pub = publicBoard(board, boardToken(board.id));
  /* THE LAST CHECK BEFORE IT GOES OUT, and it is not decoration. It asks the
     thing actually being serialised, on the actual response, because between
     the bank and here the board has been through a database and a JSON round
     trip. A leak that only appears in production is the one shape of leak
     nothing offline can see. */
  const leaked = leaks(pub);
  if (leaked.length) {
    /* FAIL CLOSED, LOUDLY IN THE LOG AND QUIETLY TO THE PLAYER. Serving it
       anyway would be serving the answers; naming the field to the player
       would describe the leak to the person best placed to use it. */
    console.error("ballpark: public board carried an unexpected field", board.id, leaked.join(", "));
    return bad("That board is unavailable.", 500);
  }

  return json({
    no, day, today, board: pub, source: bank.source,
    freeArchiveDays: FREE_ARCHIVE_DAYS,
  });
}

export async function onRequestHead(ctx) {
  const r = await onRequestGet(ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
