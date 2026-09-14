/* GET /api/whoami/names — every name a player may type.
 *
 * THIS IS THE ANSWER SPACE, NOT AN ANSWER, and the distinction is the reason it
 * can be shipped whole. The same 3,146 names back all 365 boards, so holding
 * the list tells you nothing about today: it is the dictionary, not the puzzle.
 * A game that filtered it server-side per keystroke would be slower, no more
 * secret, and wrong on a type-ahead budget.
 *
 * CACHEABLE, WHICH NOTHING ELSE IN THIS GAME IS. It does not change between
 * days, so it is the one endpoint here that may sit in a cache — and it must,
 * because it is fetched on every visit and is the largest thing the page loads.
 */
import { hasDB, allNames } from "../../_lib/wadata.js";

export async function onRequestGet({ env }) {
  if (!hasDB(env)) {
    return new Response(JSON.stringify({ error: "no database binding" }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  let names = [];
  try { names = await allNames(env); }
  catch (err) {
    return new Response(JSON.stringify({ error: "query failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new Response(JSON.stringify({ count: names.length, names }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      /* An hour, because a name entering the bank should reach players the same
         day without anybody clearing anything. */
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}

export const onRequestHead = onRequestGet;
