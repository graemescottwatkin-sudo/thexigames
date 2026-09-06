/* GET /api/hilo/daily            today's board
   GET /api/hilo/daily?day=YYYY-MM-DD   a past day's board, as free play
   GET /api/hilo/daily?no=9             the same board, said the family's way

   The SERVER decides what day it is, in UTC. A day sent up is checked against
   today here rather than trusted: the past is open so a missed day can be
   caught up, the future is shut because opening it gives away everything.
   The board leaves through publicBoard(): names and context for the twelve,
   the first value only, no sources. */
import { json, bad } from "../../_lib/puzzle.js";
/* The board NUMBER, which is what a permalink says since 6 September 2026.
   The page must not do this arithmetic: the server decides what day it is and
   therefore what board a number means, and a browser that worked it out for
   itself would be a second answer to that question. So the number comes in and
   the day goes back out, both through here. */
import { dailyDayKey, dailyNoForDay } from "../../_lib/daily.js";
import { loadBank, boardById, todayKey, publicBoard, dayToken } from "../../_lib/hl-board.js";
import {
  mayOpenArchive, archiveRefusal, daysBack, FREE_ARCHIVE_DAYS,
} from "../../_lib/archive.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const today = todayKey();
  /* A BOARD NUMBER OR A DAY, and the number is what the address uses now. Both
     are accepted: the archive list still works in days, because a schedule
     does, and a permalink works in numbers, because the family does. They
     resolve to the same day here rather than in two places. */
  const askedNo = url.searchParams.get("no");
  const askedDay = url.searchParams.get("day");
  let day;
  if (askedNo !== null) {
    if (!/^0*[1-9][0-9]{0,5}$/.test(String(askedNo))) return bad("Not a board number.");
    day = dailyDayKey(Number(askedNo));
    if (!day) return bad("Not a board number.");
  } else {
    day = askedDay === null ? today : String(askedDay);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return bad("Not a day.");
  if (day > today) return bad("That day has not come.", 403);

  /* This game schedules by date, so the distance is a date subtraction rather
     than a board number — the same question, asked in this game's own terms.
     Refused before the bank is read: a board nobody may open is a board there
     is no reason to load. */
  const back = daysBack(day, today);
  if (!(await mayOpenArchive(request, env, back))) {
    return json(archiveRefusal(back), 401);
  }

  const bank = await loadBank(env);
  const id = (bank.schedule || {})[day];
  const board = id ? boardById(bank, id) : null;
  /* No row for the day: the calendar has run out or has not begun. Said
     plainly, with no board, so the page degrades to the club boards rather
     than to an error. */
  /* THE NUMBER GOES BACK WITH THE DAY, so the page can write the address
     without knowing when day one was. `todayNo` too, because the page's other
     question is "is this today's board", and asking it in the same units as
     the address is one comparison rather than two. */
  const no = dailyNoForDay(day);
  const todayNo = dailyNoForDay(today);
  if (!board) return json({ day, no, today, todayNo, board: null, source: bank.source, freeArchiveDays: FREE_ARCHIVE_DAYS });
  return json({ day, no, today, todayNo, board: publicBoard(board, dayToken(day)), source: bank.source, freeArchiveDays: FREE_ARCHIVE_DAYS });
}

export async function onRequestHead(ctx) {
  const r = await onRequestGet(ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
