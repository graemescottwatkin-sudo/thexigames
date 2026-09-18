/* hilo/live_check.mjs — what production is actually serving.
 *
 *   node hilo/live_check.mjs --expect v001
 *
 * Run AFTER a deploy. The deploy gate reads the tree; this reads the site.
 *
 * THE FLOOR. MIN_ASSERTIONS is the second net under the completion marker,
 * set BELOW the run's real count by the assertions that can legitimately
 * skip (the tag is reported and not judged without --expect; the four club
 * checks only when the index links a club). Review it when assertions are
 * added — REVIEW, not raise: a floor set to the exact count refuses nothing
 * and flaps on every honest skip.
 */
const BASE = "https://www.thexigames.com";
const expectArg = process.argv.indexOf("--expect");
const EXPECT = expectArg > -1 ? process.argv[expectArg + 1] : null;

let pass = 0, fail = 0, warn = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const w = (n, d) => { warn++; console.log(`  ??  ${n}${d ? "  — " + d : ""}`); };

/* FORTY-FOUR assertions run with --expect, a club page with a chip on it and
   a theme page with a board on it; thirty-four is the honest floor.

   THE NUMBER IN THIS COMMENT WAS WRONG UNTIL 14 SEPTEMBER 2026. It said
   twenty-five when thirty-seven were running, so the floor of twenty was not
   set below the count by what could skip — it was a number nobody had checked
   against the run, which is the sentinel fault wearing a floors clothes: it
   could not have refused a block going quiet because seventeen assertions
   could vanish before it noticed. Counted from an actual run this time.
   Skippable: one for the tag without --expect, four in the club block when
   the index links no club, five in the theme block when it links no theme.
   44 - 10 = 34. THE FLOOR DID NOT MOVE WHEN TWO WERE ADDED,
   and that is arithmetic rather than inertia: both new ones are inside the
   club block, so the worst legitimate run — no --expect, no club linked —
   skips four there and one tag, and 25 - 5 is the number below. Raising it to
   22 by reflex would flap on any day the clubs index came back empty. */
const MIN_ASSERTIONS = 34;
let finished = false;
process.on("exit", () => {
  if (!finished) { console.log("\nTHE RUN DID NOT REACH THE END."); process.exit(1); }
});
process.on("uncaughtException", (e) => { console.log("\nCRASHED: " + (e && e.message)); process.exit(1); });

const get = (path, opts) => fetch(BASE + path, { redirect: "manual", ...opts });

console.log("The page production is serving");
const page = await get("/football/hilo/");
const html = await page.text();
t("the game answers 200", page.status === 200, String(page.status));
const tag = (html.match(/js\/game\.js\?v=([^"]+)"/) || [])[1];
t("the page carries a build tag", !!tag, tag);
if (EXPECT) t(`and it is the version expected (${EXPECT})`, tag === EXPECT, `live ${tag}`);
else w("no --expect given, so the tag is reported and not judged", tag);
t("every asset on the page carries that same tag", (() => {
  const tags = [...html.matchAll(/(?:css|js)\/[a-z_]+\.(?:css|js)\?v=([^"]+)"/g)].map((m) => m[1]);
  return tags.length > 0 && tags.every((x) => x === tag);
})());
const sharedTag = (html.match(/xi-chrome\.js\?v=(v[0-9]+)"/) || [])[1];
t("the shared chrome carries its own tag, not the game's", !!sharedTag && sharedTag !== tag, `shared ${sharedTag}, game ${tag}`);

console.log("\nThe board it is serving");
const daily = await get("/api/hilo/daily");
const d = await daily.json();
t("the daily endpoint answers", daily.status === 200, String(daily.status));
t("it serves today's board from the calendar", !!(d.board && d.board.id) && !!d.day, `${d.day} -> board ${d.board && d.board.id}`);
t("the board comes from D1, not the sample", d.source === "d1", d.source);
t("twelve rows, eleven calls", !!d.board && d.board.rows.length === 12);
const wire = JSON.stringify(d);
t("only the first value rides down with the board", (wire.match(/"value"/g) || []).length === 1);
/* And only the first row's prose. A context can carry a date — "In charge
   until 2026" beside the year a coach took charge — and one did, on the live
   page, on launch day. A hidden row is its name and nothing else. */
t("and a hidden row is its name and nothing else",
  !!d.board && d.board.rows.slice(1).every((r) => Object.keys(r).join() === "name"));
t("and no source does", !/"quote"|"publisher"|"url"/.test(wire), "the source shows as a call settles, never before");

console.log("\nA call is judged on the server");
const call = await fetch(BASE + "/api/hilo/call", {
  method: "POST", headers: { "Content-Type": "application/json", "X-XI-Games": "1" },
  body: JSON.stringify({ token: d.board && d.board.token, index: 1, call: "higher" }),
});
const v = call.status === 200 ? await call.json() : null;
t("the call endpoint answers", call.status === 200, String(call.status));
t("with a verdict, the value and its source", !!v && typeof v.right === "boolean" && typeof v.value === "number" && !!(v.source && v.source.url));
t("and the row's context, released with its value", !!v && typeof v.context === "string");
const nocsrf = await fetch(BASE + "/api/hilo/call", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: d.board && d.board.token, index: 1, call: "higher" }) });
t("and refuses a call without the family's header", nocsrf.status === 403, String(nocsrf.status));

console.log("\nThe future is shut");
const tomorrow = new Date(Date.parse(d.day + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
const future = await get("/api/hilo/daily?day=" + tomorrow);
t("tomorrow's board is refused", future.status === 403 || future.status === 400, String(future.status));

console.log("\nThe clubs");
const clubs = await get("/football/hilo/clubs/");
const clubsHtml = clubs.status === 200 ? await clubs.text() : "";
t("the clubs index is served and indexable", clubs.status === 200 && !/noindex/.test(clubsHtml));
const firstClub = (clubsHtml.match(/href="\/football\/hilo\/club\/([a-z0-9-]+)\/"/) || [])[1];
t("it links a club page", !!firstClub, firstClub);
if (firstClub) {
  const cp = await get("/football/hilo/club/" + firstClub + "/");
  t("a club page is served", cp.status === 200, String(cp.status));
  const cpHtml = cp.status === 200 ? await cp.text() : "";
  /* DERIVED FROM THE PAGE, NOT PINNED. A board's address is its club, its
     family and its ordinal WITHIN that family, and which families a club has
     is a fact about the import rather than about this file. So take the first
     chip the page actually printed and follow that. A literal here would pass
     for as long as the club it named kept the family it had. */
  const chip = (cpHtml.match(/href="(\/football\/hilo\/club\/[a-z0-9-]+\/[a-z-]+\/\d+)"/) || [])[1];
  t("the club page prints a family-scoped board address", !!chip, chip);
  if (chip) {
    const door = await get(chip);
    t("a board address is a door into the game",
      door.status === 302 && /\/football\/hilo\/\?b=/.test(door.headers.get("location") || ""),
      String(door.status) + " " + (door.headers.get("location") || ""));
  }
  /* THE ADDRESS THAT WAS LIVE UNTIL TODAY, proved against production because
     that is the only place the old links are. It cannot name a board any more
     — the number counted across a list that no longer exists — but a 404 on a
     link that worked yesterday is worse than the club page with every board
     on it, so that is where it goes. */
  const stale = await get("/football/hilo/club/" + firstClub + "/1");
  t("the old whole-club number lands on the club page, not a 404",
    stale.status === 302 &&
      (stale.headers.get("location") || "").endsWith("/football/hilo/club/" + firstClub + "/"),
    String(stale.status) + " " + (stale.headers.get("location") || ""));
}

console.log("\nThe themes");
/* DERIVED FROM THE PAGE, like the club block above: which themes exist today
   is a fact about what has run, not about this file. */
const themeSlug = (clubsHtml.match(/href="\/football\/hilo\/theme\/([a-z-]+)\/"/) || [])[1];
/* A THEME PAGE EXISTS ONLY ONCE A BOARD HAS RUN, and on the family's first day
   none has. This required a theme link unconditionally, which held while HiLo
   had weeks of boards behind it; after the reset of 18 September 2026 the
   archive is empty by construction — it stops at yesterday and there is no
   yesterday — so there is nothing to group into a theme and the check failed
   for the site being right.
   How many days have run is asked of the site rather than assumed, so this
   stays a real demand from tomorrow onward: with a day in the archive a theme
   page MUST be linked, and with none the index must carry no theme link at all
   rather than half a page of dead ones. */
const arcRes = await get("/api/hilo/archive");
const arcBody = arcRes.status === 200 ? await arcRes.json().catch(() => null) : null;
const daysRun = arcBody && Array.isArray(arcBody.days) ? arcBody.days.length : null;
if (daysRun === null) {
  t("the index links a theme page", false, `archive unreadable — HTTP ${arcRes.status}`);
} else if (daysRun > 0) {
  t("the index links a theme page", !!themeSlug, `${daysRun} day(s) run -> ${themeSlug}`);
} else {
  t("the index links a theme page", !themeSlug,
    "no board has run yet, so there is no theme to link — and none is linked");
}
if (themeSlug) {
  const tp = await get("/football/hilo/theme/" + themeSlug + "/");
  const tpHtml = tp.status === 200 ? await tp.text() : "";
  t("a theme page is served and indexable",
    tp.status === 200 && !/noindex/.test(tpHtml), String(tp.status));

  /* THE SEALING CLAIM, AND IT CANNOT BE PROVED OFFLINE. A suite stubs the
     database and re-applies the rule in JS; what a theme page must never do is
     name a board that has not run, and the only place the real schedule and
     the real clock meet is here. Every link on the page is asked for its board
     number and none may exceed today's — the same DERIVED shape as the answers
     index, which may not list more boards than the game has had days, rather
     than a pinned id that stops meaning anything the next time the bank moves. */
  const nos = [...tpHtml.matchAll(/href="\/football\/hilo\/daily\/(\d+)"/g)].map((m) => Number(m[1]));
  t("every board on it has an address, and they are numbers not dates",
    nos.length > 0 && !/\/football\/hilo\/daily\/\d{4}-/.test(tpHtml), nos.length + " board(s)");
  /* TODAY'S NUMBER, FROM THE PAGE THAT SERVES TODAY — not from the game page.
     That was the first attempt and it was a check that COULD NOT FAIL: the
     game page carries no daily link at all, so the scrape found nothing,
     todayNo was null, and the comparison below skipped on every run while the
     block reported a pass. Six vacuous checks are on this project's record and
     this would have been the seventh, written the same afternoon as a rule
     about them. /football/hilo/daily serves today and its canonical names the
     number. The derivation is ASSERTED rather than assumed, so a page that
     stops carrying it is a red line instead of a silent skip. */
  const todayHtml = await (await get("/football/hilo/daily")).text();
  const todayNo = Number((todayHtml
    .match(/rel="canonical" href="[^"]*\/football\/hilo\/daily\/(\d+)"/) || [])[1]) || null;
  t("today's board number is discoverable, so the comparison below can run",
    !!todayNo, String(todayNo));
  if (todayNo && nos.length) {
    t("and not one board listed is one that has not run yet",
      Math.max(...nos) < todayNo, `highest ${Math.max(...nos)}, today ${todayNo}`);
  }

  /* The first link must actually open a board rather than 404, which is the
     difference between a page that lists and a page that works. */
  if (nos.length) {
    const board = await get("/football/hilo/daily/" + nos[0]);
    t("the first board on the theme page opens", board.status === 200, String(board.status));
  }
}
t("a theme that does not exist is refused, not indexed",
  await (async () => {
    const r = await get("/football/hilo/theme/sandwiches/");
    return r.status === 404 && (r.headers.get("x-robots-tag") || "").includes("noindex");
  })());

console.log("\nIt is part of the family");
t("the shared chrome is loaded, not a copy of it", html.indexOf("/shared/xi-chrome.js") > -1);
t("the page names the game once, as itself", /HiLo XI/.test(html));
const hub = await get("/");
t("the hub links to it", (await hub.text()).indexOf('href="/football/hilo/"') > -1);
const map = await get("/sitemap.xml");
t("the sitemap lists it", (await map.text()).indexOf("/football/hilo/</loc>") > -1);

console.log("\nHeaders");
const head = await get("/api/hilo/daily", { method: "HEAD" });
t("HEAD on the API answers without a body", head.status === 200, String(head.status));
t("and the API is not indexed", (daily.headers.get("x-robots-tag") || "").includes("noindex"));

/* ---- the permalink: one URL, one puzzle, forever ---------------------- */
/* The whole contract a linking bot depends on, checked against production:
   /football/hilo/daily lands on a dated address, that address serves the game, and a
   board that does not exist yet is not a page. Here rather than only in the
   offline suite because the route is a Function, and the offline suite runs
   in node, which has no Workers runtime to run one in. */
{
  /* /daily IS today, at the address that was asked for: a player who came
     from the site's own button must not be handed a board number, which is
     the archive's way of pointing at a board. The permanent address is named
     in the Link header instead. */
  const hop = await fetch(BASE + "/football/hilo/daily", { redirect: "manual" });
  const link = hop.headers.get("link") || "";
  const key = (link.match(/\/football\/hilo\/daily\/([^>]+)>/) || [])[1] || "";
  t("/football/hilo/daily serves today, with no number in the address",
    hop.status === 200, String(hop.status));
  t("and names today's permanent address in a Link header", !!key, link);
  t("and never lets that answer be cached",
    (hop.headers.get("cache-control") || "").includes("no-store"));

  const page = await fetch(BASE + "/football/hilo/daily/" + key, { redirect: "manual" });
  const html = page.status === 200 ? await page.text() : "";
  t("the permalink serves the game itself",
    page.status === 200 && html.includes("js/game.js"), String(page.status));
  /* Every asset on the page is relative and the page is served one level
     deeper than it lives. Without this the board is a blank screen. */
  t("with a base, so its relative assets still resolve",
    html.includes('<base href="/football/hilo/">'));
  t("naming the board in its title and its canonical",
    /<title>[^<]+ \u00b7 /.test(html) && html.includes("/football/hilo/daily/" + key + '"'));
  t("and offered to a crawler with a line of its own",
    !/noindex/.test(html) && /name="description" content="[^"]*\d{4}"?/.test(html));

  const future = await fetch(BASE + "/football/hilo/daily/2099-01-01", { redirect: "manual" });
  t("a board that does not exist yet is not a page", future.status === 404, String(future.status));
}

console.log(`\n${pass} passed, ${fail} failed, ${warn} unjudged`);
t(`the run made at least ${MIN_ASSERTIONS} assertions`, pass + fail >= MIN_ASSERTIONS, `${pass + fail} ran`);
finished = true;
process.exit(fail ? 1 : 0);
