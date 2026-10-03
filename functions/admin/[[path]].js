/* functions/admin/[[path]].js — the owner's preview of the days to come.
 *
 *   /admin/                          every game against the next fortnight
 *   /admin/<theme>/<game>/<day>      that game's own page, playing that day
 *
 * The owner, 3 Oct 2026: play the next days of any game "in its proper form",
 * from an admin area at an address like /admin/football/crossword, every game
 * at once, recording nothing. The page served is the game's real page, the
 * one players get, with the preview layer (shared/xi-preview.js) loaded in
 * front of it; functions/_lib/preview.js is the server half.
 *
 * NOT AN ADMIN, NOT A PAGE. Anyone else gets the site's ordinary 404, the
 * same bytes a mistyped address gets, so the address does not even say that
 * an admin area exists. The flag is the users row, read fresh on every
 * request (isAdmin); nothing the browser sends decides it.
 */
import { isAdmin } from "../_lib/auth.js";
import { LAUNCHED } from "../_lib/games.js";
import { dailyNumber, utcDay } from "../_lib/daily.js";
import { PERMA_GAMES, THEME_OF, gamePath, ranOn } from "../_lib/permalink.js";
import { askedDay, purgePreviewRounds, PREVIEW_MAX_DAYS } from "../_lib/preview.js";
import { SHARED_TAG } from "../_lib/site-page.js";

const DAY_MS = 86400000;
const HUB_DAYS = 14;

/* THE SITE'S OWN 404, the one a mistyped address gets: asked of the static
   handler for an address that is no page, and passed on as it came. Until 3
   Oct 2026 this was a plain-text "Not found", which a mistyped address never
   gets, so a probe could tell that /admin/ exists (seen on the live site the
   hour it shipped). The plain one stays as the fallback for a deployment
   with no static handler. */
const NO_SUCH_PAGE = "/__xi-no-such-page__";
async function notFound(env, url) {
  try {
    const miss = await env.ASSETS.fetch(new URL(NO_SUCH_PAGE, url.origin));
    return new Response(miss.body, { status: 404, headers: miss.headers });
  } catch (e) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  }
}

const PRIVATE = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, private",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* The game an address names: its theme and directory, matched against where
   each launched game actually lives (gamePath), never assembled. */
export function gameAt(theme, dir) {
  const want = `/${String(theme || "").toLowerCase()}/${String(dir || "").toLowerCase()}/`;
  return Object.keys(LAUNCHED).find((g) => LAUNCHED[g] && PERMA_GAMES[g] && gamePath(g) === want) || null;
}

/* The game's page with the preview layer in front. Plain string edits, like
   permalinkHtml, so the suite runs exactly what ships. */
export function previewHtml(html, { game, day }) {
  const conf = JSON.stringify({ game, day, back: "/admin/" }).replace(/</g, "\\u003c");
  /* THE SHARED LAYER'S TAG, from where it is kept (site-page.js): the preview
     layer is a shared file, so it moves when the others do and a browser never
     runs a stale one. */
  const tag = SHARED_TAG;
  const head = `<base href="${gamePath(game)}">` +
    `<meta name="robots" content="noindex, nofollow">` +
    `<script>window.XI_PREVIEW=${conf};</script>` +
    `<script src="/shared/xi-preview.js${tag ? "?v=" + tag : ""}"></script>`;
  return html.replace(/<head(\s[^>]*)?>/i, (m) => m + head);
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  if (!(await isAdmin(request, env))) return notFound(env, url);
  const parts = [].concat(params && params.path ? params.path : []).filter(Boolean);

  if (parts.length === 0) return hub(env, url);
  if (parts.length !== 3) return notFound(env, url);

  const game = gameAt(parts[0], parts[1]);
  const day = askedDay(parts[2]);
  if (!game || !day) return notFound(env, url);

  const shell = await env.ASSETS.fetch(new URL(gamePath(game), url.origin));
  if (!shell.ok) return notFound(env, url);
  return new Response(previewHtml(await shell.text(), { game, day }), { status: 200, headers: PRIVATE });
}

/* ---- the list ------------------------------------------------------------ */

async function hub(env, url) {
  /* A preview's scratch rounds live until the owner comes back here. */
  let purged = 0;
  try { purged = await purgePreviewRounds(env); } catch (e) { purged = 0; }

  const now = Date.now();
  const days = [];
  for (let k = 0; k < HUB_DAYS; k++) days.push(utcDay(now + k * DAY_MS));
  const games = Object.keys(LAUNCHED).filter((g) => LAUNCHED[g] && PERMA_GAMES[g])
    .sort((a, b) => (THEME_OF[a] || "").localeCompare(THEME_OF[b] || "") || a.localeCompare(b));

  const rows = [];
  for (const g of games) {
    const cells = [];
    for (const d of days) {
      /* THE GAME'S OWN ANSWER to "is there a board that day", the one its
         archive and its permalinks ask -- a ring game always has one. */
      const has = await ranOn(env, g, dailyNumber(Date.parse(d + "T12:00:00Z")));
      const href = `/admin${gamePath(g)}${d}`;
      cells.push(has
        ? `<td><a href="${esc(href)}">Play</a></td>`
        : `<td class="none" title="No board scheduled">none</td>`);
    }
    rows.push(`<tr><th scope="row">${esc(PERMA_GAMES[g].name || g)}<small>${esc(gamePath(g))}</small></th>${cells.join("")}</tr>`);
  }
  const head = days.map((d) => {
    const t = new Date(d + "T12:00:00Z");
    return `<th scope="col">${t.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}<br>` +
      `${t.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</th>`;
  }).join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Previews · The XI Games</title>
<style>
:root{color-scheme:light dark;--ink:#182219;--soft:#5A675D;--line:#d9dfd6;--card:#fff;--paper:#F4F5F2;--go:#1d6b35;--warn:#9a3412}
@media (prefers-color-scheme:dark){:root{--ink:#EAF0E8;--soft:#A9B5A9;--line:#2c3a2b;--card:#1B231A;--paper:#121711;--go:#7bd88f;--warn:#fdba74}}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.4 system-ui,sans-serif}
main{max-width:1200px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:4px 0 2px}p{color:var(--soft);margin:0 0 12px}
.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:center;white-space:nowrap}
thead th{position:sticky;top:0;background:var(--card);font-weight:600;color:var(--soft)}
tbody th{text-align:left;position:sticky;left:0;background:var(--card)}
tbody th small{display:block;color:var(--soft);font-weight:400}
td a{display:inline-block;min-width:44px;min-height:32px;line-height:32px;border-radius:8px;color:var(--go);font-weight:600;text-decoration:none;border:1px solid var(--line)}
td.none{color:var(--warn)}
</style></head><body><main>
<h1>Previews</h1>
<p>The next ${HUB_DAYS} days of every game, played as players will get them. Nothing you do in a preview is saved.
${purged ? `Cleared ${purged} scratch row(s) from earlier previews.` : ""}</p>
<div class="wrap"><table><thead><tr><th scope="col">Game</th>${head}</tr></thead><tbody>
${rows.join("\n")}
</tbody></table></div>
<p>Up to ${PREVIEW_MAX_DAYS} days ahead: change the date at the end of any preview's address.</p>
</main></body></html>`;
  return new Response(html, { status: 200, headers: PRIVATE });
}
