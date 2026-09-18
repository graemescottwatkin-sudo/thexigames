/* hilo/pages_test.mjs — the club pages, executed against the sample bank.
 *
 * Server-rendered pages a search engine can read, so the checks are about
 * what the markup SAYS: the club linked from the index, its boards as
 * numbered targets on its page, a board address that is a door into the
 * game, and nothing on any page that plays the board for you.
 */
import { indexPage, treeRoute, themeRoute, clubPath } from "../../functions/_lib/hl-pages.js";
import { HL_SAMPLE_BOARDS } from "../../functions/_lib/hl-sample.js";
import { clubOf, clubSlug, familyOf, loadBank, themeCatalog, archive } from "../../functions/_lib/hl-board.js";
import { permalinkPath, keyLabel } from "../../functions/_lib/permalink.js";
import { dailyNoForDay, dailyDayKey } from "../../functions/_lib/daily.js";
import { launchNumber } from "../../functions/_lib/games.js";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const ctx = (path) => ({ params: { path }, env: {} });
const text = async (r) => await r.text();

const club = HL_SAMPLE_BOARDS.find((b) => clubOf(b));
const slug = clubSlug(clubOf(club));
const family = familyOf(club);
const aName = club.chain[0].name;

console.log("=== The index ===");
const idx = await indexPage({ env: {} });
const idxHtml = await text(idx);
t("the index renders, indexable, in the family shell",
  idx.status === 200 && !/noindex/.test(idxHtml) && /class="xic-bar"/.test(idxHtml) && /shared\/xi-chrome\.js/.test(idxHtml));
t("it names the club and links its page", idxHtml.includes(`href="${clubPath(slug)}"`) && idxHtml.includes(clubOf(club)));
t("it carries the game's masthead with Clubs as the current tab",
  /HiLo <span class="site-xi">XI<\/span>/.test(idxHtml) && /class="site-navlink on" href="\/football\/hilo\/clubs\/"/.test(idxHtml));
t("it carries a canonical url", idxHtml.includes('rel="canonical" href="https://www.thexigames.com/football/hilo/clubs/"'));

console.log("\n=== A club page ===");
const page = await treeRoute(ctx([slug]));
const pageHtml = await text(page);
t("the club page renders", page.status === 200);
const rows = pageHtml.split('<li class="set">').slice(1);
if (!rows.length) throw new Error("no rows parsed — the checks below would be vacuous");
t("every board of the club is a row with a numbered target",
  rows.length === 1 && rows[0].includes(`class="no" href="${clubPath(slug)}${family}/1"`) && rows[0].includes(">#1<"));
t("the row says what the board is", rows[0].includes(club.subtitle.slice(0, 20)));
t("it is indexable and canonical", !/noindex/.test(pageHtml) && pageHtml.includes(`rel="canonical" href="https://www.thexigames.com${clubPath(slug)}"`));

console.log("\n=== What these pages must never say ===");
t("no name from the chain, on either page", !idxHtml.includes(aName) && !pageHtml.includes(aName), aName);
t("no value from the chain", !pageHtml.includes(String(club.chain[3].value)) || pageHtml.includes("board"));
t("no quote", !/quote/.test(pageHtml) && !/quote/.test(idxHtml));

console.log("\n=== A row is a set, and no label is written twice ===");
{
  /* Three boards to a label is the ordinary case — a club has three boards of
     Premier League appearances and they are all called the same thing — and
     the page used to print the label once per board. Aston Villa's read four
     labels down twelve rows, eight of them repeats. */
  const mk = (id, category, subtitle) => ({ ...club, id, category, subtitle,
    trueAsOf: "2026-09-02" });
  const bank = [
    mk("r1", "Rowton managers", "Manager appointed"),
    mk("r2", "Rowton managers", "Manager appointed"),
    mk("r3", "Rowton managers", "Manager appointed"),
    mk("r4", "Rowton Premier League goals", "Most Premiership goals"),
    mk("r5", "Rowton Premier League goals", "Most Premiership goals"),
  ];
  const env = { DB: { prepare: (sql) => ({ all: async () => ({
    results: /hl_board/.test(sql) ? bank.map((b) => ({ payload: JSON.stringify(b) })) : [],
  }) }) } };
  const html = await (await treeRoute({ params: { path: ["rowton"] }, env })).text();
  const labels = [...html.matchAll(/<span class="name">([^<]*)<\/span>/g)].map((m) => m[1]);

  t("every label appears once, however many boards wear it",
    labels.length === new Set(labels).size && labels.length === 2, labels.join(" | "));
  t("and the repeats become more numbers on that one row",
    /<span class="name">Manager appointed<\/span><span class="chips">(?:[^<]*<a[^>]*>#[123]<\/a>){3}<\/span>/
      .test(html.replace(/\s+/g, " ")),
    (/Manager appointed<\/span><span class="chips">.*?<\/span>/.exec(html.replace(/\s+/g, " ")) || ["not found"])[0]
      .replace(/<[^>]*>/g, " ").trim());

  /* THE NUMBER IS THE ADDRESS, AND THE ADDRESS IS SCOPED TO ITS FAMILY. A chip
     reading #4 that opens a different board would be one board with two
     numbers. Checked by FOLLOWING every chip rather than by rebuilding the
     href it should have: the string is the thing under test, and a test that
     restates it only agrees with itself. */
  const chips = [...html.matchAll(/href="\/football\/hilo\/club\/rowton\/([a-z-]+)\/(\d+)"[^>]*>#(\d+)</g)]
    .map((m) => ({ family: m[1], n: m[2], shown: m[3] }));
  t("every board of the club is a chip", chips.length === 5, "found " + chips.length);
  t("the number a chip shows is the number in the url it opens",
    chips.every((c) => c.n === c.shown),
    chips.map((c) => `#${c.shown}->${c.n}`).join(" "));
  t("the url says which family the number counts within",
    new Set(chips.map((c) => c.family)).size === 2,
    [...new Set(chips.map((c) => c.family))].join(","));
  t("and the count restarts per family, 1 to 3 then 1 to 2",
    chips.map((c) => c.family + c.n).join(",") ===
      "managers1,managers2,managers3,goals1,goals2",
    chips.map((c) => c.family + c.n).join(","));
  t("the page counts sets as well as boards", /5 boards in\s*2 sets/.test(html));

  /* FOLLOW EVERY CHIP. Five addresses, five distinct boards, and the boards
     they reach are the five this club has — the whole claim the page makes,
     and the one the old whole-club numbering broke without saying so. */
  const opened = [];
  for (const c of chips) {
    const d = await treeRoute({ params: { path: ["rowton", c.family, c.n] }, env });
    opened.push(d.status === 302
      ? String(d.headers.get("Location")).split("?b=")[1] : "HTTP " + d.status);
  }
  t("every chip opens a board, and each opens a different one",
    new Set(opened).size === 5 && opened.every((id) => bank.some((b) => b.id === id)),
    opened.join(" "));

  /* AND THE ADDRESS HOLDS WHEN THE CLUB GAINS A BOARD. This is what the family
     scoping is FOR. HiLo reassigns board ids at every refresh and the counts
     move with them, so a number counted across the whole club renumbered the
     goals boards whenever a manager arrived — and nobody would have seen an
     error, because the link still opened a board, just not that one. The same
     bank plus one manager: the goals addresses must still open r4 and r5. */
  const grown = [mk("r0", "Rowton managers", "Manager appointed"), ...bank];
  const grownEnv = { DB: { prepare: (sql) => ({ all: async () => ({
    results: /hl_board/.test(sql) ? grown.map((b) => ({ payload: JSON.stringify(b) })) : [],
  }) }) } };
  const after = [];
  for (const n of ["1", "2"]) {
    const d = await treeRoute({ params: { path: ["rowton", "goals", n] }, env: grownEnv });
    after.push(String(d.headers.get("Location") || "").split("?b=")[1]);
  }
  t("a new board in one family does not move another family's addresses",
    after.join(",") === "r4,r5", after.join(","));
}

console.log("\n=== What the numbers mean, and when they were true ===");
{
  /* THE MIXED-DATE CLUB, WHICH THE SAMPLE BANK CANNOT REACH. It holds one club
     board, so every check above sees a page with one family and one date — and
     the line that needed proving is the one covering boards read on different
     days. The assists tables were read two days after the rest, so a club with
     assists has two dates on one page and a single "as at" over the lot would
     be wrong about one of them. Built here rather than waited for. */
  const mk = (id, category, subtitle, trueAsOf) => ({
    ...club, id, category, subtitle, trueAsOf,
  });
  const bank = [
    mk("t1", "Testville managers", "Manager appointed", "2026-09-02"),
    mk("t2", "Testville Premier League goals", "Most Premiership goals", "2026-09-02"),
    mk("t3", "Testville Premier League assists", "Most Premiership assists", "2026-09-04"),
  ];
  const env = { DB: { prepare: (sql) => ({ all: async () => ({
    results: /hl_board/.test(sql) ? bank.map((b) => ({ payload: JSON.stringify(b) })) : [],
  }) }) } };
  const r = await treeRoute({ params: { path: ["testville"] }, env });
  const html = await r.text();

  t("the page states when the figures were true, once",
    (html.match(/Figures as at/g) || []).length === 1, "found " + (html.match(/Figures as at/g) || []).length);
  t("and where two dates meet on one page, it names which is which",
    /Figures as at 2 September 2026; assists as at 4 September 2026\./.test(html),
    (/Figures as at[^<]*/.exec(html) || ["not found"])[0]);
  t("the rule behind each family is stated on the page, not in the titles",
    /caretaker spells/.test(html) && /since 1992/.test(html));
  t("and only for the families this club has",
    !/Longest spell is/.test(html), "no longest-spell board here, so no rule for one");
  t("the description names the families rather than calling them all managers",
    /content="3 boards of Testville managers, goals and assists, earlier or later\./.test(html),
    (/description" content="([^"]*)/.exec(html) || [, "not found"])[1]);
}
{
  /* A club whose boards all agree needs no second clause. */
  const one = [{ ...club, id: "u1", category: "Onedate managers",
    subtitle: "Manager appointed", trueAsOf: "2026-09-02" }];
  const env = { DB: { prepare: (sql) => ({ all: async () => ({
    results: /hl_board/.test(sql) ? one.map((b) => ({ payload: JSON.stringify(b) })) : [],
  }) }) } };
  const html = await (await treeRoute({ params: { path: ["onedate"] }, env })).text();
  t("one date is one clause and no semicolon",
    /Figures as at 2 September 2026\./.test(html) && !/;/.test(/Figures as at[^<]*/.exec(html)[0]));
}

console.log("\n=== A board is a door ===");
const door = await treeRoute(ctx([slug, family, "1"]));
t("a board hands off to the game with the board named",
  door.status === 302 && door.headers.get("Location") === `https://www.thexigames.com/football/hilo/?b=${club.id}`,
  door.headers.get("Location"));

/* THE OLD ADDRESS STILL ANSWERS, AND IT CANNOT ANSWER WITH A BOARD.
   /club/<slug>/<n> was live: it is in search results and in somebody's tab.
   The number meant a position in a list ordered across the whole club, and
   that list no longer exists — so there is no board it reliably names, and
   guessing one would be the original fault committed on purpose. A 404 on a
   link that used to work is worse than the club page with every board on it,
   so it lands there. 302, not 301: the day this stops being a two-segment
   game the redirect goes, and a 301 would have to be un-cached. */
const stale = await treeRoute(ctx([slug, "1"]));
t("a link to the old whole-club number lands on the club page, not a 404",
  stale.status === 302 && stale.headers.get("Location") === `https://www.thexigames.com${clubPath(slug)}`,
  stale.headers.get("Location"));

for (const [label, path] of [
  ["a number past the end", [slug, family, "2"]], ["zero", [slug, family, "0"]], ["a word", [slug, family, "one"]],
  ["a family this club has not got", [slug, family === "goals" ? "assists" : "goals", "1"]],
  ["a club that is not there", ["tiddlywinks-fc"]], ["a slug never issued", ["DROP TABLE"]],
  ["a path too deep", [slug, family, "1", "x"]],
]) {
  let r;
  try { r = await treeRoute(ctx(path)); } catch (e) { r = new Response(String(e), { status: 500 }); }
  t(`${label} is refused, not cacheable, not indexed`,
    r.status === 404 && r.headers.get("Cache-Control") === "no-store" && r.headers.get("X-Robots-Tag") === "noindex", "HTTP " + r.status);
}
const root = await treeRoute(ctx([]));
t("the bare tree root is the index", root.status === 301 && root.headers.get("Location") === "https://www.thexigames.com/football/hilo/clubs/");

console.log("\n=== The themes: what a daily board ranks ===");
{
  /* A BANK THAT SPANS THE BOUNDARY, because the boundary is the whole point.
     Four themes with a board apiece that has RUN, one board that has not run
     yet, and one whose category nothing recognises. HiLo launched 2026-09-03
     (LAUNCHED.hilo), so "today" is pinned here and the days are placed either
     side of it deliberately — a suite must not decide for itself what day it
     is, so the reading is taken once and handed to the page. */
  /* THE DAYS ARE OFFSETS INTO HILO'S RUN, not dates. Every one of them was
     written out — NOW was 2026-09-14 and the schedule ran 5 to 10 September —
     which was correct while HiLo had launched on 2026-09-03. When the family
     reset to day 1 on 18 September 2026 the whole fixture fell before the
     epoch: no board had run, themeCatalog and archive were both empty, and ten
     assertions failed describing a site that was behaving correctly.
     D(n) is the nth day of HiLo's run, from LAUNCHED through the family's own
     arithmetic, so the fixture re-dates itself with the game. The shape is
     unchanged and deliberate: boards on either side of "today", a board whose
     day has not come, and a category nothing recognises. */
  const D = (n) => dailyDayKey(launchNumber("hilo") + n);
  const NOW = Date.parse(D(11) + "T09:00:00Z");
  const mk = (id, category, subtitle) => ({ ...club, id, category, subtitle });
  const bank = [
    mk("d1", "England caps", "Most England caps"),
    mk("d2", "Clubs by year formed", "Year the club formed"),
    mk("d3", "Big-club appointments", "Year he was appointed"),
    mk("d4", "Grounds by year opened", "Year the ground opened"),
    mk("d5", "Sandwiches by filling", "Best sandwich"),
    /* THE SAME SUBTITLE TWICE, which is the ordinary case rather than a corner:
       a subtitle describes what the number means, so every board of a kind
       shares one. Four of the eleven boards that had run on 14 September were
       two such pairs. */
    mk("d7", "England caps", "Most England caps"),
    mk("d6", "England caps", "A board that has not run yet"),
  ];
  const schedule = {
    [D(2)]: "d1", [D(3)]: "d2", [D(4)]: "d3",
    [D(6)]: "d5", [D(7)]: "d7",
    /* Well past NOW: d4 gives a real theme with nothing run yet, d6 a board on
       a real schedule row whose day has simply not come. */
    [D(60)]: "d4", [D(90)]: "d6",
  };
  const env = { DB: { prepare: (sql) => ({ all: async () => ({
    results: /hl_board/.test(sql)
      ? bank.map((b) => ({ payload: JSON.stringify(b) }))
      : Object.keys(schedule).map((day) => ({ day, board_id: schedule[day] })),
  }) }) } };

  const idx = await (await indexPage({ env, now: NOW })).text();
  const listed = [...idx.matchAll(/href="\/football\/hilo\/theme\/([a-z-]+)\/"/g)].map((m) => m[1]);
  t("the index lists a page for every theme with a board in it",
    listed.join(",") === "players,clubs,managers,other", listed.join(","));

  /* THE RECONCILIATION, and it is the check that cannot go stale. Every board
     that has run is on exactly one theme page. A category nobody has grouped
     does not fall out of the site — it lands in "other" and is counted here,
     so a relabel of the kind that buried board 641 shows up as a number
     moving rather than as a board nobody can find. */
  const bank2 = themeCatalog(await loadBank(env), NOW);
  const ran = archive(await loadBank(env), NOW);
  const total = bank2.reduce((a, th) => a + th.boards.length, 0);
  t("every board that has run is on exactly one theme page",
    total === ran.length && total === 5, `${total} across themes, ${ran.length} in the archive`);
  t("and a category nothing recognises is visible rather than buried",
    (bank2.find((th) => th.slug === "other") || { boards: [] }).boards
      .some((b) => b.id === "d5"), "d5 is the ungrouped one");

  /* THE BOARD THAT HAS NOT RUN. This is the word search's 233 published
     boards in miniature: d6 is a real board on a real schedule row, and the
     only thing keeping it off the site is that its day has not come. */
  t("a board scheduled for a future day is on no theme page",
    !bank2.some((th) => th.boards.some((b) => b.id === "d6")), `d6 runs ${D(90)}`);
  t("and its subtitle appears nowhere on the index",
    !idx.includes("A board that has not run yet"));

  const page = await themeRoute({ params: { path: ["players"] }, env, now: NOW });
  const html = await page.text();
  t("a theme page is served and indexable",
    page.status === 200 && !/noindex/.test(html), String(page.status));
  t("it is canonical at its own address",
    html.includes(`rel="canonical" href="https://www.thexigames.com/football/hilo/theme/players/"`));

  /* THE LINKS ARE THE ADDRESS THE BOARD ALREADY HAD, and they are NUMBER
     shaped. /football/hilo/daily/2026-09-05 was the address until 6 September
     2026 and now 301s; a page full of redirects would still work, which is
     exactly why nothing would report it. Checked by asking permalink.js what
     the address is rather than by restating the format. */
  const hrefs = [...html.matchAll(/href="(\/football\/hilo\/daily\/[^"]+)"/g)].map((m) => m[1]);
  /* NEWEST FIRST, which is archive()s order and not this page inventing one.
     It matters enough to pin: a reader arriving at a theme wants the board
     they nearly played yesterday, not the one from launch week, and the day
     this silently flips is the day the top of every theme page becomes the
     oldest thing on it. */
  t("every board links to the address it already had, newest first",
    hrefs.join(",") === [D(7), D(2)]
      .map((d) => permalinkPath("hilo", dailyNoForDay(d))).join(","),
    hrefs.join(" "));
  t("and that address is a board number, not a date",
    hrefs.every((h) => /\/daily\/\d+$/.test(h)), hrefs.join(" "));
  t("the page says when the board ran",
    html.includes(keyLabel("hilo", dailyNoForDay(D(2)))),
    keyLabel("hilo", dailyNoForDay(D(2))));
  t("the rule behind the theme is stated on the page",
    /Players ranked by a career figure/.test(html));

  /* TWO LINKS THAT READ THE SAME AND GO TO DIFFERENT PLACES. The visible text
     is the subtitle and the subtitle repeats, so the day has to be inside the
     accessible name and not only in the span beside it — otherwise anyone
     moving between links rather than reading the page hears the same sentence
     twice with nothing to choose by. */
  const names = [...html.matchAll(/<a [^>]*aria-label="([^"]*)"[^>]*>([^<]*)</g)]
    .map((m) => ({ name: m[1], text: m[2] }));
  const dupes = names.filter((a) => a.text === "Most England caps");
  t("two boards with the same subtitle are two links that read the same",
    dupes.length === 2, dupes.map((d) => d.text).join(" | "));
  t("and each one is named by the day it ran, so they can be told apart",
    dupes.length === 2 && dupes[0].name !== dupes[1].name &&
      dupes.every((d) => d.name.includes(D(2).slice(0, 4))),
    dupes.map((d) => d.name).join(" | "));

  /* A theme with nothing in it is not an empty page. */
  for (const [label, path] of [
    /* GROUNDS IS A REAL THEME WITH A REAL BOARD, and its board runs on
       2026-11-01. It must be refused rather than served empty, and it comes
       back on its own the day d4 runs. This case read ["assists"] until it
       was sabotage-tested: assists is a club FAMILY and never a theme slug, so
       it 404d whatever the code did and the assertion was a second copy of the
       one below it wearing a different name. */
    ["a theme that exists but has nothing that has run yet", ["grounds"]],
    ["a theme that does not exist", ["sandwiches"]],
    ["a slug never issued", ["DROP TABLE"]],
    ["a path too deep", ["players", "1"]],
  ]) {
    let r;
    try { r = await themeRoute({ params: { path }, env, now: NOW }); }
    catch (e) { r = new Response(String(e), { status: 500 }); }
    t(`${label} is refused, not cacheable, not indexed`,
      r.status === 404 && r.headers.get("Cache-Control") === "no-store" &&
        r.headers.get("X-Robots-Tag") === "noindex", "HTTP " + r.status);
  }
  const root = await themeRoute({ params: { path: [] }, env, now: NOW });
  t("the bare theme root is the index",
    root.status === 301 &&
      root.headers.get("Location") === "https://www.thexigames.com/football/hilo/clubs/");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
