/* GET /api/lightning_fr/daily[?no=N] — which board a number is, and whether
 * it is today's.
 *
 * Two callers. The family's played-today probe (shared/xi-played.js) asks
 * every game the same question here and reads `day`. And the game's own page
 * asks it for the board its address names, so /friends/lightning/daily/N is
 * headed with board N before a run starts. The run itself is dealt by /start,
 * so there are no questions here and nothing to keep secret. */
import { boardFor } from "../../_lib/lr-play.js";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

export function onRequestGet({ request } = {}) {
  const asked = request ? new URL(request.url).searchParams.get("no") : null;
  const board = boardFor(asked);
  if (!board) {
    return new Response(JSON.stringify({ error: "no such board" }), { status: 404, headers: HEADERS });
  }
  return new Response(JSON.stringify({ game: "lightning_fr", ...board }), { headers: HEADERS });
}
export const onRequestHead = onRequestGet;
