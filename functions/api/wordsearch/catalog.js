/* GET /api/wordsearch/catalog
 *
 * The Free Play index: id, theme, category, status for every RELEASED board.
 * No grids, no answers, no schedule — identity only, a few KB against the
 * 827KB the old page carried. Unreleased boards are absent rather than
 * marked, so the list cannot be read as a preview of the run-in. */
import { catalog } from "../../_lib/wsdata.js";
import { clockFor } from "../../_lib/preview.js";

export async function onRequestGet(context) {
  const { env } = context;
  /* The request's day: real, or an admin's preview day (_lib/preview.js). */
  const boards = await catalog(env, (await clockFor(context)).now);
  return new Response(JSON.stringify({ boards }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
