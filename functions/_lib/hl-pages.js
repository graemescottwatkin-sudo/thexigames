/* The club pages: /football/hilo/clubs/ and /football/hilo/club/<club>/…
 *
 * THE SAME SHAPE AS THE CROSSWORD'S CLUBS AND THE WORD SEARCH'S THEMES: an
 * index that names the clubs, one page per club with every board a numbered
 * target, and a board address that is a DOOR into the game — the board's
 * card, with the first call waiting for Kick off — rather than a page of its
 * own. Starting eleven clocks because somebody followed a link is the fault
 * the landing screen was built to remove.
 *
 * WHAT THESE PAGES MAY SAY. Everything comes from clubCatalog(), which is
 * identity only: a board's subtitle and the date its values are true as of.
 * No names on the chain, no values, no sources. A page that listed the
 * twelve would let the board be read without being played.
 */
import { loadBank, clubCatalog, themeCatalog } from "./hl-board.js";
import { sitePage, htmlResponse, esc } from "./site-page.js";
/* WHERE A BOARD LIVES IS ONE FACT IN ONE PLACE. permalinkPath builds the
   address and dailyNoForDay turns a day into the number a board is addressed
   by; neither is restated here, and neither is date-shaped. */
import { permalinkPath, keyLabel } from "./permalink.js";
import { dailyNoForDay } from "./daily.js";

const SITE = "https://www.thexigames.com";
const INDEX = "/football/hilo/clubs/";
const SLUG = /^[a-z0-9][a-z0-9-]{0,48}$/;

export function clubPath(slug) { return `/football/hilo/club/${slug}/`; }

function notFound(what) {
  const page = sitePage({
    title: "Not found — HiLo XI",
    description: "That page does not exist.",
    canonical: SITE + "/football/hilo/",
    game: "hilo", current: INDEX,
    noindex: true,
    body: `<h1>Not found</h1>
<p class="sub">There is no ${esc(what)} here. It may not have been released yet.</p>
<a class="cta" href="${INDEX}">Clubs and themes</a>`,
  });
  return new Response(page, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ---- /football/hilo/clubs/ ---- */
export async function indexPage({ env, now = Date.now() }) {
  let clubs = [], themes = [];
  /* ONE READ, TWO CATALOGUES, so the counts on this page cannot disagree with
     the pages they link to. */
  try {
    const bank = await loadBank(env);
    clubs = clubCatalog(bank);
    themes = themeCatalog(bank, now);
  } catch (e) { clubs = []; themes = []; }
  const themeItems = themes.map((t) =>
    `<li><a href="${esc(themePath(t.slug))}">${esc(t.name)}</a>` +
    `<span class="meta">${plural(t.boards.length, "board", "boards")}</span></li>`).join("");
  const items = clubs.map((c) =>
    `<li><a href="${esc(clubPath(c.slug))}">${esc(c.name)}</a>` +
    `<span class="meta">${plural(c.boards.length, "board", "boards")}</span></li>`).join("");
  /* THE HEADING PROMISED THEMES BEFORE THERE WERE ANY. It has read "Clubs and
     themes" since the page was written, and listed clubs alone — the quietest
     kind of wrong, because nothing fails and the reader simply never finds the
     half that was advertised. The themes half now exists.
     THE TWO HALVES ARE NOT THE SAME KIND OF THING, and the page says so rather
     than leaving it to be inferred from a heading. A club board is free play
     and has never been a daily; a theme board is a daily that has already run.
     One list under one heading with no such sentence would invite a reader to
     go looking for today's board in it. */
  const body = `<h1>Clubs and themes</h1>
<p class="sub">A club's managers by the year they took charge: twelve names, eleven calls,
earlier or later. Every board here is free to play, and none of them touch your run.</p>
${themeItems ? `<h2>By theme</h2>
<p class="sub">Dailies that have already run, grouped by what they rank.</p>
<ul>${themeItems}</ul>` : ""}
${items ? `<h2>By club</h2>
<ul>${items}</ul>` : `<p class="sub">No club boards have been released yet.</p>`}
<a class="cta" href="/football/hilo/">Play today's board</a>`;
  return htmlResponse(sitePage({
    title: "HiLo XI by club and theme | The XI Games",
    description: "HiLo XI boards by club and by theme: a club's managers by the year " +
      "they took charge, and every daily that has run, grouped by what it ranks.",
    canonical: SITE + INDEX,
    game: "hilo", current: INDEX,
    body,
  }));
}

/* ---- /football/hilo/club/<club>/ and /<n> ---- */
export async function treeRoute({ params, env }) {
  const parts = (params && params.path) || [];
  const list = Array.isArray(parts) ? parts.filter(Boolean) : [parts].filter(Boolean);
  if (!list.length) return Response.redirect(SITE + INDEX, 301);
  const slug = String(list[0]).toLowerCase();
  if (!SLUG.test(slug) || list.length > 3) return notFound("club");
  let clubs = [];
  try { clubs = clubCatalog(await loadBank(env)); } catch (e) { return notFound("club"); }
  const club = clubs.find((c) => c.slug === slug);
  if (!club) return notFound("club");
  /* /club/<slug>/<family>/<n> is the address. /club/<slug>/<n> is the form it
     replaced and cannot be resolved — see staleBoardDoor. */
  if (list.length === 3) return boardDoor(club, list[1], list[2]);
  if (list.length === 2) return staleBoardDoor(club);
  return clubPage(club);
}

/* ---- a row is a SET of boards, not one board ----
 *
 * A row used to be a single board, so a label repeated down the page: 43 of
 * the 47 clubs had duplicate rows and one had eight identical ones, because a
 * club has three boards of Premier League appearances and they are all called
 * "Most Premiership appearances". Now the label is written once and every
 * board wearing it is a numbered target beside it.
 *
 * THE NUMBER IS THE ADDRESS, AND IT IS THE ORDINAL WITHIN A FAMILY — not the
 * position in the club's whole list. The number a player presses is the number
 * in the URL it opens, which is the rule the word search's theme pages hold as
 * well: a chip reading "#2" that opens ".../3" is one thing with two numbers,
 * and it is the fault this project pays for most often.
 *
 * IT COUNTED ACROSS THE WHOLE CLUB UNTIL 14 SEPTEMBER 2026, and this comment
 * said so as though that were the safe choice. It was the bug. "The third
 * board" meant the third when this club's boards are sorted by id, and BOTH of
 * those inputs move at every international break: HiLo re-snapshots the club
 * stat boards and REASSIGNS THEIR IDS, and the rebuild yields a different count
 * — that day took appearances 95 to 88 and assists 18 to 16. So /club/arsenal/3
 * did not break at a refresh. It silently began opening a DIFFERENT BOARD, the
 * page still rendered, and nothing reported anything. A dead link tells you it
 * is dead; that does not.
 *
 * Scoped to the family, an address moves only when that family's own membership
 * changes, which is honest and rare. familyOf() already computed it and
 * clubCatalog() already carried it on every board, so the data was there before
 * the bug was.
 */
export function boardRows(club) {
  const rows = [];
  const byLabel = new Map();
  const seen = new Map();
  (club.boards || []).forEach((b) => {
    const family = b.family || "other";
    const n = (seen.get(family) || 0) + 1;
    seen.set(family, n);
    const label = b.subtitle;
    if (!byLabel.has(label)) { byLabel.set(label, { label, chips: [] }); rows.push(byLabel.get(label)); }
    byLabel.get(label).chips.push({ family, n });
  });
  return rows;
}

/* The same numbering, for a caller that wants to resolve one rather than draw
   them all. Derived from the identical walk so the page and the route cannot
   disagree about which board is which — the fault this file already carries a
   comment about, where a chip reading "#2" opens ".../3". */
export function boardAt(club, family, n) {
  let seen = 0;
  for (const b of club.boards || []) {
    if ((b.family || "other") !== family) continue;
    if (++seen === n) return b;
  }
  return null;
}

function boardRow(club, row) {
  const chips = row.chips.map(({ family, n }) =>
    `<a class="no" href="${esc(clubPath(club.slug))}${esc(family)}/${n}" ` +
    `aria-label="${esc(club.name)}, ${esc(family)} board ${n}">#${n}</a>`)
    .join("");
  return `<li class="set"><span class="name">${esc(row.label)}</span><span class="chips">${chips}</span></li>`;
}

/* ---- what the numbers mean, said once ----
 *
 * The rules used to be written into the titles, all 274 of them. The owner
 * took them out on 4 Sep so a title says what the number is and nothing else,
 * which puts them here: one statement per family, on the page that shows the
 * family, and only for the families this club actually has. A club with no
 * assists boards is not told how assists are counted.
 *
 * The three stat families share one rule, because it is one rule. */
const FAMILY_RULE = [
  ["managers", "Managers in order is the year he first took charge — caretaker spells " +
    "included — going back to 1960."],
  ["longest-spell", "Longest spell is the end year less the start year, and counts " +
    "departed permanent managers only."],
  ["stats", "Appearances, goals and assists are Premier League figures for this club " +
    "alone, since 1992. They are not the club's all-time record."],
];
const STAT_FAMILIES = ["appearances", "goals", "assists"];

function rulesFor(boards) {
  const here = new Set(boards.map((b) => b.family).filter(Boolean));
  if (STAT_FAMILIES.some((f) => here.has(f))) here.add("stats");
  const lines = FAMILY_RULE.filter(([k]) => here.has(k)).map(([, text]) => text);
  return lines.length ? `<p class="note">${lines.map(esc).join(" ")}</p>` : "";
}

/* ---- when the numbers were true ----
 *
 * WRITTEN ONCE, AND ONLY WHERE IT IS TRUE. Every club board carries trueAsOf
 * and most of a club's agree, so one line covers the page. They do not always:
 * the assists tables were read two days after the rest, and a single line over
 * boards with two dates would be wrong about one of them. So the dates are
 * counted, the commonest leads, and any other is named with the families it
 * covers. Nothing is invented — a board with no date contributes no claim. */
function monthName(iso) {
  const M = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  const mi = Number(m[2]) - 1;
  if (!M[mi]) return null;
  return `${Number(m[3])} ${M[mi]} ${m[1]}`;
}
const FAMILY_NOUN = { managers: "managers", "longest-spell": "longest spell",
  appearances: "appearances", goals: "goals", assists: "assists" };

/* The families a club has, in reading order, for the page's description. */
function familyList(boards) {
  const order = ["managers", "longest-spell", "appearances", "goals", "assists"];
  const here = new Set(boards.map((b) => b.family).filter(Boolean));
  const named = order.filter((f) => here.has(f)).map((f) => FAMILY_NOUN[f]);
  if (!named.length) return "boards";
  if (named.length === 1) return named[0];
  return named.slice(0, -1).join(", ") + " and " + named[named.length - 1];
}

function asAtLine(boards) {
  const byDate = new Map();
  for (const b of boards) {
    if (!b.trueAsOf || !monthName(b.trueAsOf)) continue;
    if (!byDate.has(b.trueAsOf)) byDate.set(b.trueAsOf, new Set());
    if (b.family) byDate.get(b.trueAsOf).add(b.family);
  }
  if (!byDate.size) return "";
  const dates = [...byDate.entries()].sort((a, b) => b[1].size - a[1].size ||
    (a[0] < b[0] ? -1 : 1));
  const [main] = dates;
  let line = `Figures as at ${monthName(main[0])}`;
  for (const [iso, fams] of dates.slice(1)) {
    const named = [...fams].map((f) => FAMILY_NOUN[f] || f).sort();
    line += `; ${named.join(" and ")} as at ${monthName(iso)}`;
  }
  return `<p class="note">${esc(line + ".")}</p>`;
}

function clubPage(club) {
  const rows = boardRows(club);
  const body = `<p class="crumb"><a href="${INDEX}">Clubs and themes</a></p>
<h1>${esc(club.name)}</h1>
<p class="sub">${plural(club.boards.length, "board", "boards")} in
${plural(rows.length, "set", "sets")}. Pick one — it opens on the
board, and the first clock starts when you kick off.</p>
${rulesFor(club.boards)}
${asAtLine(club.boards)}
<ul>${rows.map((r) => boardRow(club, r)).join("")}</ul>
<a class="cta" href="/football/hilo/">Play today's board</a>`;
  return htmlResponse(sitePage({
    title: `${club.name} — HiLo XI`,
    /* IT IS NOT ALL MANAGERS ANY MORE. This said "boards of <club> managers"
       from the day the only club family WAS managers; there are now four, and
       a description naming one of them is wrong on most pages. Named from the
       families the club actually has, so it cannot go stale again. */
    description: `${plural(club.boards.length, "board", "boards")} of ${club.name} ` +
      `${familyList(club.boards)}, earlier or later. Free to play, nothing given away.`,
    canonical: SITE + clubPath(club.slug),
    game: "hilo", current: INDEX,
    body,
  }));
}

/* The board itself: a redirect into the game with the board named, and the
   game shows its card and waits for Kick off. */
function boardDoor(club, family, raw) {
  const n = parseInt(String(raw), 10);
  if (!Number.isInteger(n) || n <= 0) return notFound("board");
  const board = boardAt(club, String(family), n);
  if (!board) return notFound("board");
  return Response.redirect(`${SITE}/football/hilo/?b=${encodeURIComponent(board.id)}`, 302);
}

/* THE OLD TWO-SEGMENT FORM — /club/<slug>/<n> — CANNOT BE HONOURED, and this is
 * the part that is a judgement rather than a fix.
 *
 * Those URLs meant "the nth board when this club's boards are sorted by id",
 * and the ids were reassigned on 14 September. There is no mapping back: the
 * board that address used to open may not exist, and the board it would open
 * now is a different one. Resolving it would silently hand somebody the wrong
 * board, which is exactly the fault being removed.
 *
 * So it goes to the club page. A reader who followed a stale link lands on the
 * club they wanted, sees every board it has, and picks — which is worse than
 * the right board and much better than a confident wrong one. 302 rather than
 * 301 on purpose: this is not a permanent statement about where that address
 * belongs, it is an admission that we cannot know. */
function staleBoardDoor(club) {
  return Response.redirect(`${SITE}${clubPath(club.slug)}`, 302);
}

/* ---- /football/hilo/theme/<theme>/ ----
 *
 * THE DAILIES, GROUPED BY WHAT THEY RANK. A club board is reached from its
 * club; a daily board had no address but the day it ran, so 103 of them sat
 * behind a reverse-chronological list and nothing else. The heading on the
 * index has said "Clubs and themes" since it was written, which was a promise
 * the page could not keep.
 *
 * EVERY BOARD HERE HAS ALREADY RUN, and that is the whole safety of the page
 * rather than a detail of it. These are dailies: on 14 September 2026 eleven
 * of the 103 had run and the rest run through to 14 December. A page built
 * from the board table would have listed ninety-two boards that are dailies
 * still to come — the word search's fault of 6 September exactly, where a
 * schedule pre-filled with inventory published 233 unrun boards. themeCatalog
 * asks archive(), which is bounded by LAUNCHED.hilo and by today, so an unrun
 * board cannot appear here even by accident.
 *
 * AND EVERY LINK IS AN ADDRESS THAT ALREADY EXISTED. A board that has run is
 * /football/hilo/daily/<no>, built by permalinkPath from the number
 * dailyNoForDay derives. Nothing is numbered here — no new ordinal, no new
 * list to index into, and therefore none of the drift the club addresses were
 * fixed for this morning. Asking permalink.js rather than assembling the path
 * is the same rule: where a board lives is one fact in one place.
 *
 * NOT date-shaped. /football/hilo/daily/2026-09-03 was the address until
 * 6 September 2026 and now 301s to /daily/9 — every game is addressed by a
 * board number counted from the family's day one. A link built the old way
 * would work, via a redirect, and would be wrong on every page. */
export function themePath(slug) { return `/football/hilo/theme/${slug}/`; }

function dailyHref(day) { return permalinkPath("hilo", dailyNoForDay(day)); }

/* THE DAY IS IN THE LINK, NOT ONLY BESIDE IT. A subtitle is a description of
   what the number means, so boards of the same kind share one word for word:
   of the eleven that had run on 14 September, two pairs were identical — the
   year a club was founded, twice, and the year a ground opened, twice. Four
   links reading the same thing and going to different places, told apart only
   by a span the link text does not include, which for anyone moving between
   links rather than reading the page is four links that all say the same and
   no way to choose. The visible text stays short; the accessible name carries
   the date that makes it unique. */
function themeEntry(e) {
  const no = dailyNoForDay(e.day);
  const label = keyLabel("hilo", no);
  const what = e.subtitle || e.category;
  return `<li><a href="${esc(dailyHref(e.day))}" aria-label="${esc(what)} — the board from ${esc(label)}">` +
    `${esc(what)}</a><span class="meta">${esc(label)}</span></li>`;
}

function themePage(theme) {
  const body = `<p class="crumb"><a href="${INDEX}">Clubs and themes</a></p>
<h1>${esc(theme.name)}</h1>
<p class="sub">${plural(theme.boards.length, "board", "boards")} that have already
run as the daily. Each one opens at its own address, free to play, and none of
them touch your run.</p>
<p class="note">${esc(theme.rule)}</p>
<ul>${theme.boards.map(themeEntry).join("")}</ul>
<a class="cta" href="/football/hilo/">Play today's board</a>`;
  return htmlResponse(sitePage({
    title: `${theme.name} — HiLo XI`,
    description: `${plural(theme.boards.length, "HiLo XI board", "HiLo XI boards")} of ` +
      `${theme.name.toLowerCase()}, higher or lower. Every one has already run as the ` +
      `daily, and all of them are free to play.`,
    canonical: SITE + themePath(theme.slug),
    game: "hilo", current: INDEX,
    body,
  }));
}

export async function themeRoute({ params, env, now = Date.now() }) {
  const parts = (params && params.path) || [];
  const list = Array.isArray(parts) ? parts.filter(Boolean) : [parts].filter(Boolean);
  if (!list.length) return Response.redirect(SITE + INDEX, 301);
  const slug = String(list[0]).toLowerCase();
  if (!SLUG.test(slug) || list.length > 1) return notFound("theme");
  let themes = [];
  try { themes = themeCatalog(await loadBank(env), now); } catch (e) { return notFound("theme"); }
  const theme = themes.find((t) => t.slug === slug);
  /* A theme with nothing in it yet is NOT FOUND rather than an empty page, and
     it comes back on its own the day a board of that kind runs. themeCatalog
     drops the empty ones, so this is one decision in one place. */
  if (!theme) return notFound("theme");
  return themePage(theme);
}
