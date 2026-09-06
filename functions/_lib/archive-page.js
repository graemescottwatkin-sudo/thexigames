/* archive-page.js — every board a game has ever had, as a page you can reach.
 *
 * WHY THIS EXISTS. The board permalinks shipped and then sat there: /football/
 * crossword/daily/12 is the permanent address of a board, four hundred of them
 * exist across the five games, and until the sitemap was generated NOTHING
 * pointed at a single one. The sitemap fixed that for a crawler. It did not
 * fix it for a person, and it did not give the boards what an internal link
 * gives them — an answers DETAIL page links the board it is about, which is a
 * real path and reaches exactly the handful of boards whose answers have aged
 * past the seal. Hundreds of addresses, five links in.
 *
 * So this is the page the sitemap has always implied: one per game, listing
 * every board that game actually has, at the address that will still mean that
 * board next year.
 *
 * IT LISTS WHAT EXISTS, NOT WHAT COULD BE ASKED FOR. The set comes from
 * boardKeys() in permalink.js — the same function the sitemap uses and the
 * same rule the route enforces — so a scheduled game's gaps are gaps here too.
 * A page advertising a board that 404s would be worse than no page: it spends
 * a crawler's budget and a reader's click on nothing.
 *
 * NEWEST FIRST, GROUPED BY MONTH, PILLS INSIDE IT. A board a day means 365 rows a year, and
 * a flat list of them is unreadable by the second year. The month is the
 * heading and the days are the chips — the shape the club and theme pages
 * already use, so it arrives styled and looks like the rest of the site. It
 * will want paging eventually; a game would need several years of boards
 * before that mattered, and inventing the paging now would be inventing the
 * shape of a problem nobody has yet.
 *
 * WHAT IT DOES NOT DO IS PROMISE THE BOARD IS FREE. Boards older than the free
 * window need an account to play, which is archive.js's rule, and the page
 * says so in the game's own words rather than restating the number.
 */
import { PERMA_GAMES, boardKeys, permalinkPath, gamePath } from "./permalink.js";
import { dailyDayKey } from "./daily.js";
import { FREE_ARCHIVE_DAYS } from "./archive.js";
import { sitePage, htmlResponse, esc } from "./site-page.js";

const SITE = "https://www.thexigames.com";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];

/* The month a board belongs to, and the day inside it. Built from the day
   key's own parts rather than from a Date: a Date made from an ISO day is UTC
   midnight, and any formatter that applies a timezone moves it to the day
   before. The same reasoning, and the same fix, as dayLabel in permalink.js. */
function partsOf(key) {
  const day = dailyDayKey(key);
  if (!day) return null;
  const [y, m, d] = String(day).split("-");
  const month = MONTHS[Number(m) - 1];
  return month ? { month, year: y, day: String(Number(d)), full: `${Number(d)} ${month} ${y}` } : null;
}

/* Newest month first, and newest board first inside it — the order somebody
   looking for "the one from last week" reads in. */
function months(game, keys) {
  const rows = [];
  const byMonth = new Map();
  for (const key of keys.slice().reverse()) {
    const p = partsOf(key);
    if (!p) continue;
    const label = `${p.month} ${p.year}`;
    if (!byMonth.has(label)) { byMonth.set(label, { label, boards: [] }); rows.push(byMonth.get(label)); }
    byMonth.get(label).boards.push({ key, ...p });
  }
  return rows.map((row) => {
    /* THE PILL SAYS THE DAY AND THE LINK SAYS THE DATE. A month of chips
       reading "6 September 2026" over and over is a wall; a chip reading "6"
       under a heading reading "September 2026" is the same fact, said once.
       The full date is on the link for anything that cannot see the heading —
       a screen reader jumping link to link, and a crawler reading them out of
       context. */
    const chips = row.boards.map((b) =>
      `<a class="no" href="${esc(permalinkPath(game, b.key))}" ` +
      `aria-label="${esc(b.full)}" title="${esc(b.full)}">${esc(b.day)}</a>`).join("");
    return `<li class="set"><span class="name">${esc(row.label)}</span>` +
           `<span class="chips">${chips}</span></li>`;
  }).join("");
}

/* ---- the page ----------------------------------------------------------- */

export function archiveIndex({ game, name, keys }) {
  const base = SITE + gamePath(game) + "archive/";
  const newest = keys.length ? partsOf(keys[keys.length - 1]) : null;
  const body = keys.length
    ? `<h1>${esc(name)} — every board</h1>
<p class="sub">All ${keys.length} ${name} board${keys.length === 1 ? "" : "s"}, newest first,
each at its own permanent address. Today's is ${esc(newest ? newest.full : "")}.</p>
<ul>${months(game, keys)}</ul>
<p class="sub">Today and the ${FREE_ARCHIVE_DAYS} days behind it are open to everybody.
Older boards ask for a free account, so the archive is worth keeping.</p>
<a class="cta" href="${esc(gamePath(game))}">Play today's board</a>
<a class="cta ghost" href="${esc(gamePath(game))}answers/">Answers</a>`
    : `<h1>${esc(name)} — every board</h1>
<p class="sub">The boards will be listed here, each at its own permanent
address, as soon as there are any.</p>
<a class="cta" href="${esc(gamePath(game))}">Play today's board</a>`;

  /* An hour. A board joins this list on the morning it runs and never changes
     after, so an hour behind is a board appearing by breakfast rather than
     instantly, and it keeps a crawler from rebuilding the list on every hit. */
  return htmlResponse(sitePage({
    title: `${name} archive — every board, by date`,
    description: `Every ${name} board that has run, newest first, each at its own ` +
      `permanent address. Today and the ${FREE_ARCHIVE_DAYS} days behind it are free to play.`,
    canonical: base,
    current: gamePath(game) + "archive/",
    game,
    body,
  }), { maxAge: 3600 });
}

/* The whole route, for every game. A game's file under functions/football/
   <game>/archive/ is three lines and this is the behaviour, so five games
   cannot grow five archives. */
export async function archiveRoute({ env }, game) {
  const g = PERMA_GAMES[game];
  if (!g) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  }
  return archiveIndex({ game, name: g.name, keys: await boardKeys(env, game) });
}
