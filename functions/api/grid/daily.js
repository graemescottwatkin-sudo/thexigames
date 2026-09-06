/* GET /api/grid/daily         today's board
   GET /api/grid/daily?no=12   that board, if it is not in the future

   THE SERVER DECIDES WHAT DAY IT IS, in UTC, and therefore which board today
   is. A number sent up is checked against today here rather than trusted: the
   past is open so a missed day can be caught up, the future is shut because
   opening it gives away everything.

   THE BOARD LEAVES THROUGH publicBoard(), WHICH IS THE POINT OF THIS ENDPOINT.
   The grid starts empty, so every letter in it is an answer and a board sent
   whole is the board solved. What goes out is the title, the shape, and where
   the entries cross. Not one letter. See functions/_lib/gd-board.js. */
import { json, bad } from "../../_lib/puzzle.js";
import {
  loadBank, boardForDay, boardById, publicBoard, publicText, boardToken,
  todayKey, todayNo, dayForNo,
} from "../../_lib/gd-board.js";
import {
  mayOpenArchive, archiveRefusal, daysBack, FREE_ARCHIVE_DAYS,
} from "../../_lib/archive.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const now = Date.now();
  const today = todayNo(now);

  /* A BOARD NUMBER, which is what every game in the family is addressed by
     since 6 September 2026 — see functions/_lib/permalink.js. The schedule is
     keyed by DAY because a calendar is, so the two are reconciled in one place
     and never here. */
  const asked = url.searchParams.get("no");
  const no = asked === null ? today : Number(asked);
  if (!Number.isInteger(no) || no < 1) return bad("Not a board number.");
  if (no > today) return bad("That board is not out yet.", 403);

  const day = dayForNo(no);
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
     plainly, with no board, so the page can degrade rather than error — the
     same shape HiLo answers with, and the reason its boards 1 to 8 are not
     pages either. */
  if (!board) {
    return json({ no, day, today, board: null, source: bank.source,
                  freeArchiveDays: FREE_ARCHIVE_DAYS });
  }

  const token = boardToken(board.id);
  /* THE LAST CHECK BEFORE IT GOES OUT, and it is not decoration. The emitter
     greps every board's public projection for every answer before writing it;
     this asks the same question of the thing actually being serialised, on the
     actual response, because between the emitter and here the board has been
     through a database and a JSON round trip. A leak that only appears in
     production is the one shape of leak nothing offline can see. */
  const pub = publicBoard(board, token);
  const text = publicText(board, token);
  const leaked = (board.entries || []).filter((e) => e.answer && text.includes(e.answer));
  if (leaked.length) {
    /* FAIL CLOSED, LOUDLY IN THE LOG AND QUIETLY TO THE PLAYER. Serving the
       board anyway would be serving the answers; saying which answer leaked
       would be leaking it a second time. */
    console.error("grid: public board leaked an answer", board.id);
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
