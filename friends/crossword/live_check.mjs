/* friends/crossword/live_check.mjs — Crossword XI: Friends, proved against
 * production.
 *
 *   node friends/crossword/live_check.mjs [--expect v001a]
 *
 * THE GATE READS THE TREE AND CANNOT ANSWER ANY OF THIS. Who Am I's gate passed
 * 38 of 38 on a tree whose daily endpoint answered 500 in production for hours,
 * because the fault was a re-export that binds at import time and nothing in the
 * repository imports a Cloudflare Function. What a deploy actually did is only
 * knowable from outside it.
 *
 * WHAT THIS EXISTS TO CATCH, in order of how badly it would hurt:
 *
 *   1. AN ANSWER IN THE PAYLOAD. Every Friends clue row carries a sourceQuote,
 *      the sentence its answer was verified against, and the bank refuses any
 *      row whose answer is not literally in it — so the quote contains the
 *      answer in 3,035 of 3,053 rows. A board that shipped its rows whole would
 *      arrive solved. publicPuzzle() is an allowlist and cannot carry a letter,
 *      but that is a claim about the code; this is the claim about the wire.
 *
 *   2. THE WRONG BOARD. The public number is the FAMILY's daily number and the
 *      bank stores 1..120; fr-board.js converts. Getting that offset wrong
 *      serves a real puzzle that is not today's — silently, because the board
 *      it serves exists. Nothing offline can see it: the suites stub D1 and
 *      never ask what the site advertises.
 *
 *   3. A BOARD THAT IS NOT OUT YET.
 *
 *   4. THE GAME BECOMING FINDABLE. It launched UNLISTED — live, playable, and
 *      advertised nowhere — so the two assertions this file first carried were
 *      backwards: it demanded the noindex be GONE and the sitemap advertise the
 *      boards, which are precisely the two things that must not be true. Both
 *      are now asserted in the direction the site is actually in, and both say
 *      what would have to change to flip them, so the day it is announced this
 *      file says what is left to do rather than going quietly green.
 *
 * VALUES, NEVER THE SERIALISED PAYLOAD. Normalising JSON.stringify turns KEY
 * NAMES into searchable letters — "acROSS" contains ROSS, which is an answer in
 * 131 bank rows — so a scan built that way reports a leak on any board that
 * holds one. The route's own first scan did exactly that and would have refused
 * 24 of the 120 boards. Every check below walks values.
 */

const BASE = "https://www.thexigames.com";
const EXPECT = (() => {
  const i = process.argv.indexOf("--expect");
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();

/* THE FLOOR IS THE SECOND NET UNDER THE COMPLETION MARKER. The end-of-run line
   catches a crash; this catches a block that goes quiet without crashing. It is
   set BELOW the real count on purpose, by the number of assertions that can
   legitimately skip — so when assertions are added, REVIEW it rather than
   raising it by reflex. A floor equal to the count flaps on the first skip. */
const MIN_ASSERTIONS = 23;
/* REVIEWED, NOT RAISED BY REFLEX, on 21 September 2026 when the unlisted launch
   added six assertions. 27 t() calls exist. Two of them sit inside
   `if (links.length)` and CANNOT run while the game is unlisted, because that
   block reads board links out of the sitemap and the sitemap must carry none —
   so they are a legitimate skip today and become reachable on the day the game
   is announced. One more is `if (EXPECT)`, skipped when the run is not given a
   tag to check.
   MEASURED against production on 21 Sep 2026, not counted by eye: 26 run on a
   --expect run and 0 fail. The floor sits at 23: below the real
   count by the branches that can legitimately vary, and above anything a
   block going quiet would leave behind. The five inside `if (d.board)` are NOT
   counted as skippable — a day with no board is a day the assertion above it
   has already failed on, which is a red run, not a short one.
   A floor equal to the count flaps on the first legitimate skip; a floor left
   alone for five releases stops being able to refuse anything. Both have
   happened in this project. */

let pass = 0, fail = 0;
const t = (name, ok, note) => {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
};

const get = (path, opts) => fetch(BASE + path, { redirect: "manual", ...opts });
const norm = (s) => String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");

/* Every string VALUE in a structure, keys never read. */
function values(v, out) {
  out = out || [];
  if (v == null) return out;
  if (typeof v === "string") { out.push(v); return out; }
  if (typeof v !== "object") return out;
  for (const k of Object.keys(v)) values(v[k], out);
  return out;
}

console.log(BASE + "/friends/crossword/");

/* ---- the page ----------------------------------------------------------- */

const page = await get("/friends/crossword/");
const html = await page.text();
t("the page is served", page.status === 200, "HTTP " + page.status);
t("index.html is not stored, so nobody is pinned to an old build",
  /no-store/.test(page.headers.get("cache-control") || ""),
  page.headers.get("cache-control"));

const tag = (html.match(/js\/game\.js\?v=([^"]+)"/) || [])[1];
t("the game script carries a build tag", !!tag, tag);
if (EXPECT) t("the build is " + EXPECT, tag === EXPECT, "serving " + tag);

/* NOINDEX, BECAUSE IT IS UNLISTED. This is the live half of what
   friends/crossword/deploy_check.mjs asserts about the tree — and the tree is
   not the deploy. Who Am I's gate passed 38 of 38 on a tree whose daily
   endpoint answered 500 in production for hours.
   WHEN THE GAME IS ANNOUNCED this assertion inverts: delete crossword_fr from
   UNLISTED in functions/_lib/games.js and the meta must be GONE, because a
   noindex nobody removes is a live game that never appears in a search
   result. */
t("the page is noindex, because the game is unlisted",
  /<meta\s+name="robots"\s+content="noindex">/.test(html),
  "live and playable, findable by nobody — the owner's call on 21 Sep 2026");
t("and it names itself the same way everywhere",
  (html.match(/Crossword XI: Friends/g) || []).length >= 3,
  "title, og:title and h1");

/* ---- today's board ------------------------------------------------------ */

const daily = await get("/api/crossword_fr/daily", {
  headers: { accept: "application/json", "X-XI-Games": "1" },
});
t("the daily endpoint answers", daily.status === 200, "HTTP " + daily.status);
const d = daily.status === 200 ? await daily.json() : null;

if (d) {
  t("it is launched, so there is a board today", d.launched === true && !!d.board,
    `no ${d.no}, today ${d.today}`);
  t("and today's number is the one it serves", d.no === d.today,
    `${d.no} vs ${d.today}`);

  if (d.board) {
    const b = d.board;
    t("the board has eleven entries", (b.entries || []).length === 11,
      (b.entries || []).length + " entries");

    /* NOT ONE CELL MAY CARRY A LETTER. This is the leak that matters most and
       the one a value scan can never see, because a solution letter is a single
       character and matches everything. Asked separately, of the projection. */
    t("no cell carries a solution letter",
      Object.keys(b.cells || {}).every((k) => !("ch" in b.cells[k])),
      Object.keys(b.cells || {}).length + " cells");

    t("no entry carries answer, grid, aliases, notes or sourceQuote",
      (b.entries || []).every((e) =>
        !("answer" in e.row) && !("grid" in e.row) && !("aliases" in e.row) &&
        !("notes" in e.row) && !("sourceQuote" in e.row)));

    t("but every entry carries its clue, because a crossword without clues is not one",
      (b.entries || []).every((e) => typeof e.row.clue === "string" && e.row.clue.length > 0));

    /* THE SOURCE QUOTE IS THE SHARPEST THING THE BANK HOLDS. It cannot be
       checked against the answer from out here — the answer never arrives,
       which is the point — so what is checked is that no served value is long
       enough to be one. A clue is a question; a quote is a sentence of prose
       from an article, and the difference shows in length. */
    const served = values(b).filter((s) => !(b.entries || []).some((e) => e.row.clue === s));
    t("and no served value outside a clue looks like prose",
      served.every((s) => s.length < 60),
      served.filter((s) => s.length >= 60).slice(0, 1).join("") || `${served.length} values`);
  }

  /* ---- the numbering, which nothing offline can prove -------------------- */

  /* THE SITEMAP IS WHAT THE SITE ADVERTISES, and the route must agree with it.
     They disagreed by construction until 21 September 2026: boardKeys lists
     launchNumber..today while the route counted from the launch, so the sitemap
     linked a number the route read as a different board — and served it, because
     that board exists. A 404 would have been the kinder failure. */
  const map = await get("/sitemap.xml");
  const xml = map.status === 200 ? await map.text() : "";
  const links = [...xml.matchAll(/\/friends\/crossword\/daily\/(\d+)</g)].map((m) => Number(m[1]));

  /* THE SITEMAP MUST NOT MENTION THIS GAME AT ALL, in any form, while it is
     unlisted — not the front page, not the archive index, not one board. The
     boards are the half that matters: they resolve for anyone holding one, and
     this file is what would hand a crawler all of them.
     CHECKED AGAINST THE SERVED XML, not against the generator. The generator is
     what deploy_check reads; a filter that is right in the tree and a sitemap
     that is stale in the CDN are the same page to a crawler. */
  t("the sitemap does not advertise this game at all", !/\/friends\//.test(xml),
    links.length ? `ADVERTISED: ${links.length} board link(s)`
                 : "no /friends/ anywhere in the served sitemap");
  t("PRECONDITION: the sitemap is a real one, so the check above is not passing on an empty file",
    /\/football\/crossword\/daily\//.test(xml) && xml.length > 2000,
    `${xml.length} bytes — a prohibition cannot notice an empty document`);

  /* THE ARCHIVE, WHICH IS THE FULLEST DISCLOSURE THE SITE COULD MAKE: a list of
     every board this game has run, each at its own address. It is served — the
     route exists — and it must tell a crawler to keep out, by BOTH routes,
     because one half without the other publishes it to whichever crawler uses
     the other. */
  const arch = await get("/friends/crossword/archive/");
  const archHtml = arch.status === 200 ? await arch.text() : "";
  t("the archive page is served", arch.status === 200, "HTTP " + arch.status);
  t("and tells a crawler to keep out, by both routes",
    /noindex/.test(archHtml) && /noindex/.test(arch.headers.get("x-robots-tag") || ""),
    `meta ${/noindex/.test(archHtml)}, header ${arch.headers.get("x-robots-tag")}`);

  /* AND A PERMALINK RESOLVES, which is the thing PERMA_GAMES promises and which
     nothing served until 1006eb8: there was no functions/friends/ directory, so
     every board address 404'd while the data said the game had permanent ones.
     Unlisted is not unreachable, and a link somebody has been given must work. */
  const perma = await get(`/friends/crossword/daily/${d.today}`);
  t("a board permalink resolves, because unlisted is not unreachable",
    perma.status === 200, `daily/${d.today} -> ${perma.status}`);

  if (links.length) {
    const highest = Math.max(...links);
    t("and never a board beyond today", highest <= d.today, `highest ${highest}, today ${d.today}`);

    const one = await get(`/api/crossword_fr/daily?no=${highest}`, {
      headers: { accept: "application/json", "X-XI-Games": "1" },
    });
    const ob = one.status === 200 ? await one.json() : null;
    t("and the highest one it advertises actually serves a board",
      one.status === 200 && !!(ob && ob.board),
      `?no=${highest} -> ${one.status}`);
  }

  t("tomorrow is refused, because opening it gives the board away",
    (await get(`/api/crossword_fr/daily?no=${d.today + 1}`,
      { headers: { accept: "application/json", "X-XI-Games": "1" } })).status === 403);
  t("and so is a number far in the future",
    (await get(`/api/crossword_fr/daily?no=${d.today + 400}`,
      { headers: { accept: "application/json", "X-XI-Games": "1" } })).status === 403);
  t("a board number that is not one is refused",
    (await get("/api/crossword_fr/daily?no=abc",
      { headers: { accept: "application/json", "X-XI-Games": "1" } })).status === 400);
}

/* ---- HEAD, and the robots rule on /api ---------------------------------- */

const head = await get("/api/crossword_fr/daily", { method: "HEAD" });
t("HEAD answers", head.status === 200 || head.status === 403, "HTTP " + head.status);
t("and carries no body", (await head.text()) === "");
t("the API is not indexed",
  /noindex/.test(head.headers.get("x-robots-tag") || ""),
  head.headers.get("x-robots-tag"));

/* ---- the marking endpoint refuses what it must -------------------------- */

const noCsrf = await fetch(BASE + "/api/crossword_fr/check", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ no: 1, filled: {} }),
});
t("marking without the family header is refused", noCsrf.status === 403,
  "HTTP " + noCsrf.status);

console.log(`\n${pass} passed, ${fail} failed`);
if (pass + fail < MIN_ASSERTIONS) {
  console.log(`INCOMPLETE — only ${pass + fail} assertions ran, floor is ${MIN_ASSERTIONS}. ` +
    `A run that stops early is a failed run, not a quiet pass.`);
  process.exit(1);
}
console.log("live_check complete");
process.exit(fail ? 1 : 0);
