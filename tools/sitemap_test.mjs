/* sitemap_test.mjs — what the sitemap lists, and what it must never list.
 *
 *   node tools/sitemap_test.mjs        (from the repo root)
 *
 * A sitemap is the only route search has into a board page: nothing on the
 * site links to one except an answers page, and only a handful of those are
 * published. The file this replaced held thirteen URLs and not one board,
 * months after the permalinks shipped, because a hand-kept list of pages that
 * appear DAILY was never going to hold them.
 *
 * The two properties that matter pull against each other. It must be COMPLETE
 * — every board that exists — and it must be TRUE: a sitemap listing a URL
 * that answers 404 spends crawl budget on nothing and teaches a crawler to
 * trust it less. So every check here is one or the other.
 */
import { gameDir } from "../functions/_lib/permalink.js";
import { onRequestGet as sitemap } from "../functions/sitemap.xml.js";
import { permalinkRoute, todayKeyFor, PERMA_GAMES, gamePath, permalinkPath }
  from "../functions/_lib/permalink.js";
import fs from "node:fs";
/* The fixture below states which DAYS each schedule holds, because that is
   what a schedule table holds. The addresses are board numbers now, so the
   test converts — through the same function the route converts with, since a
   second copy of the arithmetic is the thing this whole file guards. */
import { dailyNoForDay } from "../functions/_lib/daily.js";
import { GAMES, BUILT, launchNumber } from "../functions/_lib/games.js";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* A schedule with holes in it, which is the shape that matters: the days a
   dated game ran are not every day since it started. */
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

const res = await sitemap({ env });
const xml = await res.text();
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

console.log("It is a sitemap");
t("served as XML", (res.headers.get("Content-Type") || "").includes("xml"));
t("and cached at the edge rather than rebuilt per hit",
  /s-maxage=\d+/.test(res.headers.get("Cache-Control") || ""),
  res.headers.get("Cache-Control"));
t("one urlset, well formed enough to parse as pairs",
  /<urlset[^>]*>/.test(xml) && /<\/urlset>/.test(xml) &&
  locs.length === (xml.match(/<url>/g) || []).length, locs.length + " urls");
t("every url is absolute and on the site",
  locs.length > 0 && locs.every((u) => u.startsWith("https://www.thexigames.com/")));
t("and no url is listed twice", new Set(locs).size === locs.length,
  locs.length - new Set(locs).size + " duplicates");

console.log("\nComplete: every board that exists is in it");
for (const game of Object.keys(PERMA_GAMES)) {
  /* A RING game contributes every board from the day it LAUNCHED to today —
     not from board 1, which is the family's day one and only the crossword's
     launch. Vowels launched on board 10, so nine of the twelve numbers a ring
     answers to are days it did not exist. A SCHEDULED one contributes only
     the boards whose day it ran, and those days start at its launch anyway. */
  const from = launchNumber(game);
  const want = PERMA_GAMES[game].schedule === "ring"
    ? Array.from({ length: Number(todayKeyFor(game)) - from + 1 }, (_, i) => String(from + i))
    : RAN[game === "wordsearch" ? "ws_schedule" : "hl_schedule"]
        .map((day) => String(dailyNoForDay(day)))
        .filter((no) => Number(no) >= from);
  const missing = want.filter((k) => !locs.includes(`https://www.thexigames.com${permalinkPath(game, k)}`));
  t(`${game}: all ${want.length} of its boards are listed`, missing.length === 0,
    missing.length ? "missing " + missing.slice(0, 4).join(", ") : want.length + " boards");
}
t("and each game's own front page is there",
  Object.keys(PERMA_GAMES).every((g) => locs.includes(`https://www.thexigames.com${gamePath(g)}`)));

console.log("\nTrue: nothing in it answers 404");
/* THE CHECK THAT PULLS THE OTHER WAY. Every board URL listed is fetched
   through the real route with the same schedule the sitemap was built from —
   so a sitemap that listed a day the game never ran would be caught here
   rather than by a crawler. */
{
  const boards = locs.filter((u) => u.includes("/daily/"));
  const bad = [];
  for (const u of boards) {
    /* /football/<game>/daily/<key> — the theme leads, so the game is the
       second segment and the key the fourth. */
    const [, , game, , key] = new URL(u).pathname.split("/");
    const r = await permalinkRoute({
      request: new Request(u), env, params: { path: [key] },
    }, game);
    if (r.status !== 200) bad.push(`${gameDir(game)}/${key} -> ${r.status}`);
  }
  t(`every one of the ${boards.length} board urls is served by the route`,
    bad.length === 0, bad.slice(0, 4).join(", ") || "all 200");
}

console.log("\nAnd what it must never carry");
{
  const future = Object.keys(PERMA_GAMES).map((g) => {
    const k = todayKeyFor(g);
    return `https://www.thexigames.com${permalinkPath(g, String(Number(k) + 1))}`;
  });
  t("tomorrow's board is not named", future.every((u) => !locs.includes(u)),
    "the future is shut, and a sitemap naming it leaks the schedule");
  /* A day inside the range but not scheduled: the hole in RAN above. */
  /* THE HOLE IN THE SCHEDULE. 2026-09-02 sits between two days the fixture
     DID run, so it is a board number in range with nothing behind it — the
     case that separates "lists 1..today" from "lists what exists". Named by
     its day and converted, so the fixture and the assertion cannot drift. */
  const hole = permalinkPath("wordsearch", String(dailyNoForDay("2026-09-02")));
  t("a board whose day a scheduled game did not run is not named",
    !locs.includes("https://www.thexigames.com" + hole), hole);
  /* AND THE BOARDS BEFORE A GAME LAUNCHED. HiLo's fixture runs on one day
     only, so boards 1 to 8 are days it had no board — eight 404s a sitemap
     would otherwise invite a crawler to spend its budget on. */
  t("nor are the boards from before a scheduled game began",
    ![1, 2, 3, 4, 5, 6, 7, 8].some((n) =>
      locs.includes("https://www.thexigames.com" + permalinkPath("hilo", String(n)))));
  /* AND NOTHING FROM BEFORE A GAME LAUNCHED, for every game rather than for
     the scheduled ones only. The ring games are the case that was wrong: they
     answer to any number, so the sitemap offered Vowels boards 1 to 9 —
     addresses for days the game did not exist. */
  for (const g of Object.keys(PERMA_GAMES)) {
    const before = launchNumber(g) - 1;
    t(`${g}: no board from before it launched (#${launchNumber(g)})`,
      before < 1 || !locs.includes("https://www.thexigames.com" + permalinkPath(g, String(before))),
      before < 1 ? "launched on day one" : "#" + before + " is the day before");
  }
  /* DERIVED, not written down — the same fix chrome_test needed on the same
     day and for the same reason. This list named quickfire and five ideas, and
     Grid XI got a bank, two endpoints and a page without ever joining it, so
     the check that keeps an unreleased game out of the sitemap was not
     watching the newest one. BUILT minus GAMES is exactly "built and not
     launched"; the ideas stay written down because they are not code. */
  const UNRELEASED = [...BUILT.filter((g) => GAMES.indexOf(g) === -1),
                      "missing", "transfer", "kit", "manager", "stadium"];
  t("no unreleased game appears",
    !UNRELEASED.some((g) => locs.some((u) => u.includes("/" + g + "/"))));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
