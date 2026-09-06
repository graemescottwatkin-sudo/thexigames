/* archive_test.mjs — the page that stops the board permalinks being orphans.
 *
 * WHAT WAS WRONG. Four hundred board addresses existed across the five games
 * and the only thing on the whole site pointing at one was an answers DETAIL
 * page linking the board it was about — a real path that reaches the handful
 * of boards whose answers have aged past the seal, and nothing else. The
 * sitemap covers a crawler; a reader had no way in at all.
 *
 * WHAT THIS GUARDS, and it is two properties pulling against each other, the
 * same pair sitemap_test weighs: the page must be COMPLETE — every board a
 * game actually has — and it must be TRUE, because a link to a board that
 * answers 404 spends a reader's click and a crawler's budget on nothing. So
 * every listed address here is fetched through the real route, with the same
 * schedule the page was built from.
 *
 *   node tools/archive_test.mjs        (from the repo root)
 */
import { archiveRoute } from "../functions/_lib/archive-page.js";
import { onRequestGet as sitemap } from "../functions/sitemap.xml.js";
import { onRequestGet as scrambledAnswers } from "../functions/football/scrambled/answers/[[path]].js";
import { onRequestGet as hiloAnswers } from "../functions/football/hilo/answers/[[path]].js";
import { onRequestGet as crosswordAnswers } from "../functions/football/crossword/answers/index.js";
import {
  PERMA_GAMES, boardKeys, permalinkPath, permalinkRoute, todayKeyFor, gamePath, gameDir,
} from "../functions/_lib/permalink.js";
import { dailyNoForDay, dailyDayKey } from "../functions/_lib/daily.js";
import { FREE_ARCHIVE_DAYS } from "../functions/_lib/archive.js";
import { GAMES, BUILT } from "../functions/_lib/games.js";
import fs from "node:fs";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* The same fixture shape sitemap_test uses: a schedule with HOLES in it, which
   is the case that separates "lists 1..today" from "lists what exists". The
   two suites state it separately on purpose — a shared fixture would let one
   change quietly move what the other proves. */
const RAN = {
  ws_schedule: ["2026-09-03", "2026-09-01", "2026-08-30"],
  hl_schedule: ["2026-09-03"],
};
const tableOf = (sql) => (/ws_schedule/.test(sql) ? "ws_schedule"
  : /hl_schedule/.test(sql) ? "hl_schedule" : null);
const env = {
  DB: {
    prepare: (sql) => ({
      bind: (arg) => ({
        all: async () => {
          const tbl = tableOf(sql);
          return { results: tbl ? RAN[tbl].map((day) => ({ day })) : [] };
        },
        first: async () => {
          const tbl = tableOf(sql);
          return tbl && RAN[tbl].includes(arg) ? { n: 1 } : null;
        },
      }),
    }),
  },
  ASSETS: {
    fetch: async (req) => {
      const parts = new URL(req.url || req).pathname.split("/").filter(Boolean);
      const game = parts[1] || parts[0];
      return new Response(fs.readFileSync(`${gameDir(game)}/index.html`, "utf8"),
        { headers: { "Content-Type": "text/html" } });
    },
  },
};

const page = async (game) => {
  const r = await archiveRoute({ env }, game);
  const html = await r.text();
  return { status: r.status, headers: r.headers, html,
           links: [...html.matchAll(/href="([^"]*\/daily\/[^"]+)"/g)].map((m) => m[1]) };
};

console.log("Every game has one, and it is a page");
const pages = {};
for (const game of Object.keys(PERMA_GAMES)) {
  const p = await page(game);
  pages[game] = p;
  t(`${game}: /archive/ answers`, p.status === 200, String(p.status));
  t(`${game}: named as its own game`, p.html.includes(PERMA_GAMES[game].name));
  /* THE MASTHEAD, so the page belongs to the game rather than floating beside
     it — and it is what makes the archive reachable from every other served
     page of that game, which is the whole point of the exercise. */
  t(`${game}: carries the game's masthead, with Archive in it`,
    p.html.includes(`class="site-mast" href="${gamePath(game)}"`) &&
    p.html.includes(`href="${gamePath(game)}archive/"`),
    "a page nothing links to is what this file exists to prevent");
  t(`${game}: and a share card, like every served page`,
    /property="og:image"/.test(p.html) && /name="twitter:card"/.test(p.html));
  /* IT IS MEANT TO BE INDEXED. That is the entire purpose — so the check is
     that nothing has quietly marked it noindex. */
  t(`${game}: offered to a crawler rather than hidden from one`,
    !/noindex/.test(p.html) && p.headers.get("X-Robots-Tag") === null,
    p.headers.get("X-Robots-Tag") || "no X-Robots-Tag");
}

console.log("\nComplete: every board the game has is on it");
for (const game of Object.keys(PERMA_GAMES)) {
  const want = await boardKeys(env, game);
  const missing = want.filter((k) => !pages[game].links.includes(permalinkPath(game, k)));
  t(`${game}: all ${want.length} of its boards are linked`, missing.length === 0 && want.length > 0,
    missing.length ? "missing " + missing.slice(0, 4).join(", ") : want.length + " boards");
  t(`${game}: and none is linked twice`,
    new Set(pages[game].links).size === pages[game].links.length,
    pages[game].links.length + " links");
}

console.log("\nTrue: nothing it links answers 404");
{
  /* THE CHECK THAT PULLS THE OTHER WAY, and the reason this suite imports the
     route at all. Every address the page offers is fetched through the real
     permalink route with the same schedule the page was built from, so a page
     listing a day a game never ran is caught here rather than by a reader. */
  let checked = 0; const bad = [];
  for (const game of Object.keys(PERMA_GAMES)) {
    for (const href of pages[game].links) {
      const key = href.split("/").pop();
      const r = await permalinkRoute({
        request: new Request("https://www.thexigames.com" + href), env, params: { path: [key] },
      }, game);
      checked++;
      if (r.status !== 200) bad.push(`${gameDir(game)}/${key} -> ${r.status}`);
    }
  }
  t(`every one of the ${checked} addresses is served by the route`, bad.length === 0,
    bad.slice(0, 4).join(", ") || "all 200");
}

console.log("\nAnd what it must never carry");
{
  const future = Object.keys(PERMA_GAMES).map((g) =>
    permalinkPath(g, String(Number(todayKeyFor(g)) + 1)));
  t("tomorrow's board is not linked",
    Object.keys(PERMA_GAMES).every((g, i) => !pages[g].links.includes(future[i])),
    "the future is shut, and a page naming it leaks the schedule");
  /* THE HOLE IN THE SCHEDULE. 2026-09-02 sits between two days the fixture DID
     run, so it is a board number in range with nothing behind it. */
  const hole = permalinkPath("wordsearch", String(dailyNoForDay("2026-09-02")));
  t("a day a scheduled game did not run is not linked",
    !pages.wordsearch.links.includes(hole), hole);
  /* AND THE BOARDS BEFORE A GAME LAUNCHED. HiLo's fixture runs one day only,
     so boards 1 to 8 are days it had no board at all. */
  t("nor are the boards from before a scheduled game began",
    ![1, 2, 3, 4, 5, 6, 7, 8].some((n) => pages.hilo.links.includes(permalinkPath("hilo", String(n)))));
  /* DERIVED, not written down — the fault chrome_test and sitemap_test both
     had on the same day. BUILT minus GAMES is exactly "built and not
     launched", so a new game cannot slip past by not being on a list. */
  const UNRELEASED = BUILT.filter((g) => GAMES.indexOf(g) === -1);
  t("no unreleased game has one of these pages",
    UNRELEASED.every((g) => !PERMA_GAMES[g]),
    UNRELEASED.join(", ") || "none built and unlaunched");
}

console.log("\nWhat it says about a board it cannot promise is free");
{
  const p = pages.crossword;
  /* NOT RESTATED. The free window is FREE_ARCHIVE_DAYS in _lib/archive.js —
     a separate decision from the answers window, which daily.js keeps, and
     the two are deliberately not written in terms of each other. The page
     asks; it does not type the number. */
  t("the free window in the prose is the constant, not a number typed twice",
    new RegExp("the " + FREE_ARCHIVE_DAYS + " days behind it").test(p.html),
    FREE_ARCHIVE_DAYS + " days");
  t("and the newest board is named by its date, not its number",
    p.html.includes(dayText(todayKeyFor("crossword"))),
    dayText(todayKeyFor("crossword")));
  /* THE PILL IS THE DAY AND THE LINK CARRIES THE DATE. A chip reading "6" is
     only meaningful under its month; anything reading links out of context —
     a screen reader, a crawler — gets the whole date from the label. */
  t("every board link says its full date to anything reading out of context",
    (p.html.match(/class="no" href="[^"]+" aria-label="[^"]+"/g) || []).length ===
      p.links.length, p.links.length + " links");
}
function dayText(key) {
  const M = ["January", "February", "March", "April", "May", "June", "July",
             "August", "September", "October", "November", "December"];
  const [y, m, d] = String(dailyDayKey(key)).split("-");
  return `${Number(d)} ${M[Number(m) - 1]} ${y}`;
}

console.log("\nA game with no schedule to read promises nothing");
{
  /* THE OPPOSITE DEFAULT FROM ranOn, and it is deliberate: asked whether to
     REFUSE a player who followed a link, the safe answer is to serve; asked
     what to ADVERTISE, the safe answer is to promise nothing it cannot keep.
     Offline suites and a database-less preview take this path. */
  const r = await archiveRoute({ env: {} }, "hilo");
  const html = await r.text();
  t("a scheduled game with no database lists no boards",
    r.status === 200 && !/\/daily\//.test(html),
    "a list of addresses that 404 is worse than an empty page");
  t("and says so rather than looking broken", /as soon as there are any/.test(html));
  /* A RING game needs nothing but the clock, so it still lists everything. */
  const ring = await archiveRoute({ env: {} }, "scrambled");
  const ringHtml = await ring.text();
  t("a ring game still lists its boards without one",
    (ringHtml.match(/\/daily\//g) || []).length === Number(todayKeyFor("scrambled")),
    (ringHtml.match(/\/daily\//g) || []).length + " boards");
}

console.log("\nThe pages that link to it");
{
  const map = await (await sitemap({ env })).text();
  for (const game of Object.keys(PERMA_GAMES)) {
    t(`${game}: its archive is in the sitemap`,
      map.includes(`<loc>https://www.thexigames.com${gamePath(game)}archive/</loc>`));
  }
  /* AND THE ANSWERS INDEXES NOW LINK BOARDS THEMSELVES. This is the check the
     backlog's own verification asked for: an answers index with zero links to
     a board was the state on production. All three shapes are covered — the
     shared module, the crossword's own copy, and a game whose answers are
     addressed by DAY while its boards are addressed by number. */
  const sc = await (await scrambledAnswers({ env, params: { path: [] } })).text();
  t("scrambled's answers index links the boards themselves",
    /href="\/football\/scrambled\/daily\/\d+"/.test(sc) &&
    sc.includes('href="/football/scrambled/archive/"'));
  const cw = await (await crosswordAnswers({ env })).text();
  t("the crossword's own answers index does too",
    /href="\/football\/crossword\/daily\/\d+"/.test(cw) &&
    cw.includes('href="/football/crossword/archive/"'));
  /* HILO NEEDS ITS OWN FIXTURE AND THIS IS WHY. Its answers index lists only
     boards past the seal, and the schedule fixture above holds one recent day,
     so the page comes back EMPTY and any assertion about its links passes
     without reading one — a check whose name is broader than its behaviour,
     which is the fault this project has found six times. So a bank and a
     schedule are built here with a board old enough to be published. */
  const hlDay = dailyDayKey(2);
  const hlEnv = {
    DB: {
      prepare: (sql) => ({
        all: async () => (/hl_board/.test(sql)
          ? { results: [{ payload: JSON.stringify({ id: "b1", category: "Transfer fees" }) }] }
          : { results: [{ day: hlDay, board_id: "b1" }] }),
      }),
    },
  };
  const hl = await (await hiloAnswers({ env: hlEnv, params: { path: [] } })).text();
  t("HiLo's index is showing a published board at all",
    hl.includes(`/football/hilo/answers/${hlDay}`), hlDay);
  /* THE TWO KEY SHAPES IN ONE ROW. HiLo's answers are addressed by the day
     the board ran and its board is addressed by the family's number; the row
     has to carry both, from the one loop that knows both. */
  t("and HiLo's, whose answers are keyed by day and whose boards are not",
    /href="\/football\/hilo\/daily\/2"/.test(hl) &&
    hl.includes('href="/football/hilo/archive/"'),
    "a day in one address and a number in the other, from one loop");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
