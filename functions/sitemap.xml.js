/* /sitemap.xml — every page that exists, built when it is asked for.
 *
 * WHY A FUNCTION AND NOT A FILE. The static sitemap.xml carried thirteen URLs
 * and not one of them was a board, months after the board permalinks shipped:
 * hundreds of pages with no route in from search. A hand-kept file was never
 * going to hold them, because a new board appears EVERY DAY and the file only
 * changes when somebody deploys. A build step would be stale by the next
 * morning. So this is derived at request time from the same rules the pages
 * themselves keep.
 *
 * WHAT IS IN IT, and nothing else:
 *   the static pages          the hub, each game, the answers and club indexes
 *   every board that exists   /<game>/daily/<key>, for the five live games
 *
 * WHAT IS NOT, and why each absence is deliberate:
 *   tomorrow's board          the future is shut; naming it leaks the schedule
 *   a day a game did not run  those 404 now, and a sitemap listing a 404 is
 *                             worse than one listing nothing
 *   unreleased games          an unbuilt game is named nowhere served
 *
 * ONE RULE, ASKED NOT RESTATED. Which boards are public is permalink.js's
 * answer — todayKeyFor for the count, the schedule for whether a game ran that
 * day — and this calls it rather than keeping a second copy that would drift
 * the first time either changed.
 */
import { PERMA_GAMES, todayKeyFor, permalinkPath } from "./_lib/permalink.js";
import { dailyDayKey } from "./_lib/daily.js";

const SITE = "https://www.thexigames.com";

/* The pages that are not boards. Ordered as a reader would meet them, and
   listed rather than derived because that is what they are: a fixed set. */
const STATIC = [
  ["/", "daily", "1.0"],
  ["/football/crossword/", "daily", "0.9"],
  ["/football/wordsearch/", "daily", "0.9"],
  ["/football/scrambled/", "daily", "0.9"],
  ["/football/vowels/", "daily", "0.9"],
  ["/football/hilo/", "daily", "0.9"],
  ["/football/crossword/answers/", "daily", "0.7"],
  ["/football/wordsearch/answers/", "daily", "0.7"],
  ["/football/crossword/clubs/", "weekly", "0.6"],
  ["/football/wordsearch/themes/", "weekly", "0.6"],
  ["/football/hilo/clubs/", "weekly", "0.6"],
  ["/football/crossword/how-to-play", "monthly", "0.5"],
  ["/football/crossword/privacy", "yearly", "0.3"],
];

/* THE DAYS EACH DATED GAME ACTUALLY RAN, newest first and never past today.
   Read straight from the schedule, which is the same table permalink.js asks
   before it will serve one of these pages — so the sitemap cannot list a URL
   the route would refuse. */
async function ranDays(env, game, today) {
  if (!env || !env.DB) return [];
  const table = game === "wordsearch" ? "ws_schedule" : game === "hilo" ? "hl_schedule" : null;
  if (!table) return [];
  try {
    const { results } = await env.DB
      .prepare(`SELECT day FROM ${table} WHERE day <= ? ORDER BY day DESC`)
      .bind(today).all();
    return (results || []).map((r) => String(r.day)).filter(Boolean);
  } catch (e) {
    /* No schedule table, or unreadable. An empty list means this game
       contributes no boards to the sitemap, which is a smaller wrong than a
       list of URLs that answer 404. */
    return [];
  }
}

/* A board's own address for every game, in one place.

   Every game is numbered 1..today now. A RING game contributes all of them,
   because the ring generates a board for any number. A SCHEDULED game
   contributes only the numbers whose day it actually ran: HiLo's schedule
   begins on 3 September 2026, which is board 9, so boards 1 to 8 are days it
   had not launched and the route refuses them. Listing those would put eight
   404s in the sitemap, which this file's own rule forbids.

   The schedule is read ONCE per game and turned into a set of days, rather
   than asking ranOn per board: that is one query instead of one per day of the
   game's life, and the number of those grows by one every morning. */
async function boardPaths(env) {
  const out = [];
  for (const game of Object.keys(PERMA_GAMES)) {
    const today = Number(todayKeyFor(game));
    if (!Number.isFinite(today) || today < 1) continue;
    if (PERMA_GAMES[game].schedule === "ring") {
      for (let i = 1; i <= today; i++) out.push(permalinkPath(game, String(i)));
      continue;
    }
    const ran = new Set(await ranDays(env, game, dailyDayKey(today)));
    for (let i = 1; i <= today; i++) {
      if (ran.has(dailyDayKey(i))) out.push(permalinkPath(game, String(i)));
    }
  }
  return out;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function onRequestGet({ env }) {
  const rows = [
    ...STATIC.map(([path, freq, pri]) =>
      `  <url><loc>${esc(SITE + path)}</loc><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`),
    /* A board never changes once it has run — that is the entire promise of a
       permalink — so a crawler is told not to come back for it. */
    ...(await boardPaths(env)).map((path) =>
      `  <url><loc>${esc(SITE + path)}</loc><changefreq>never</changefreq><priority>0.5</priority></url>`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by functions/sitemap.xml.js. A new board appears every day, so
     this is derived when it is asked for rather than kept by hand: the file it
     replaced listed thirteen URLs and no boards at all. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join("\n")}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      /* Cached at the edge for an hour. A board joins the sitemap the day it
         runs and never changes after, so an hour behind is nothing — and it
         keeps a crawler from rebuilding this on every hit. */
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
