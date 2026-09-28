/* functions/_lib/lr-http.js — shared by the three Lightning Round routes: one refusal shape, one success
 * shape, the family's CSRF header, and nothing cached. */
import { csrfOk } from "./auth.js";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

export const ok = (body) => new Response(JSON.stringify(body), { headers: HEADERS });
export const no = (msg = "no", status = 400, extra) =>
  new Response(JSON.stringify({ error: msg, ...(extra || {}) }), { status, headers: HEADERS });

/* The body, or an empty object; a POST without the family's header is
   refused before anything is read. */
export async function readPost(request) {
  if (!csrfOk(request)) return null;
  try { return (await request.json()) || {}; } catch (e) { return {}; }
}
