/* GET /api/wordsearch_fr/daily — today's board, as a player may have it:
   grid, clues and lengths; no answers, no placements, no secret. The server
   decides the day. No daily is { day, puzzle: null }, not an error. */
import { dailyBoard } from "../../_lib/frws-data.js";
import { publicPuzzle } from "../../_lib/frws-public.js";
import { FREE_ARCHIVE_DAYS } from "../../_lib/archive.js";
import { dailyNoForDay } from "../../_lib/daily.js";
import { json } from "../../_lib/frws-http.js";
import { clockFor } from "../../_lib/preview.js";

export async function onRequestGet(context) {
  const { env } = context;
  /* Today is the request's day: the real one, or an admin's preview day
     (functions/_lib/preview.js). */
  const { day, puzzle } = await dailyBoard(env, (await clockFor(context)).now);
  /* The board NUMBER with the day, as football's: a permalink says /daily/N,
     and the number comes from where the day is decided. */
  return json({ day, no: dailyNoForDay(day), puzzle: publicPuzzle(puzzle), freeArchiveDays: FREE_ARCHIVE_DAYS });
}
