/* GET /api/scrambled_fr/daily            today's Friends board, as an anagram
   GET /api/scrambled_fr/daily?cy=1       the same boards, vowels blanked (Vowels XI: Friends)
   GET /api/scrambled_fr/daily?no=12      board twelve, if it is not in the future

   Scrambled XI: Friends and Vowels XI: Friends (the owner, 29 Sep 2026:
   "start the Friends Scrambled and Vowels build"). The body is football's --
   functions/api/scrambled/daily.js -- run against the Friends board set, so
   the future is shut, the cypher is chosen and the payload is shaped by the
   one rule both games share. Guess, reveal, round and finish need no Friends
   route of their own: the play token this returns (frsc:…) says which set its
   board is in, and those routes read it from there. */
import { dailyFor } from "../scrambled/daily.js";

export function onRequestGet(ctx) { return dailyFor(ctx, "frsc", "scrambled_fr"); }

export async function onRequestHead(ctx) {
  const r = await onRequestGet(ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
