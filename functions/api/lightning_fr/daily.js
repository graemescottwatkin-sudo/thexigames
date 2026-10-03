/* GET /api/lightning_fr/daily[?no=N] — which board a number is, and whether
 * it is today's.
 *
 * Two callers. The family's played-today probe (shared/xi-played.js) asks
 * every game the same question here and reads `day`. And the game's own page
 * asks it for the board its address names, so /friends/lightning/daily/N is
 * headed with board N before a run starts. The run itself is dealt by /start,
 * so there are no questions here and nothing to keep secret. */
import { boardFor } from "../../_lib/lr-play.js";
import { clockFor, PREVIEW_HEADER } from "../../_lib/preview.js";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

/* SYNCHRONOUS UNLESS A PREVIEW IS ASKED FOR. Only a request carrying the
   preview header can be anything but today (functions/_lib/preview.js), and
   deciding whether it is one means reading the users row; every other request
   is answered at once, exactly as before -- the family's probe and this game's
   gate both call it with no request and read the Response straight back. */
export function onRequestGet(context = {}) {
  const { request } = context;
  if (request && request.headers.get(PREVIEW_HEADER)) {
    return clockFor(context).then((clock) => answer(request, clock.now));
  }
  return answer(request, Date.now());
}
function answer(request, now) {
  const asked = request ? new URL(request.url).searchParams.get("no") : null;
  const board = boardFor(asked, now);
  if (!board) {
    return new Response(JSON.stringify({ error: "no such board" }), { status: 404, headers: HEADERS });
  }
  return new Response(JSON.stringify({ game: "lightning_fr", ...board }), { headers: HEADERS });
}
export const onRequestHead = onRequestGet;
