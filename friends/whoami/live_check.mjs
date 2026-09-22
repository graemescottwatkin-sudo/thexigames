/* friends/whoami/live_check.mjs — Who Am I XI: Friends, proved against
 * production.
 *
 *   node friends/whoami/live_check.mjs [--expect v001a]
 *
 * THE GATE READS THE TREE AND CANNOT ANSWER ANY OF THIS. Football's gate once
 * passed 38 of 38 on a tree whose daily endpoint answered 500 in production for
 * hours, because the fault was a re-export that binds at import time — and
 * nothing in the repo imports a Cloudflare Function. What a deploy actually did
 * is only knowable from outside it.
 *
 * AND THIS GAME HAS A SECOND REASON. Its tables did not exist when its server
 * was first deployed: /api/whoami/whoami_fr/daily answered
 * "no such table: fr_wa_board" in production while every suite and every gate
 * was green, because a stubbed database cannot prove a query. Migration 044,
 * the deck and the calendar are three separate things applied by hand, and
 * whether all three landed is a question only production can answer.
 *
 * WHAT THIS EXISTS TO CATCH, in order of how badly it would hurt:
 *
 *   1. a card's NAME in a payload nobody paid for. Three doors a day and one
 *      is spent per person, so the other two stay live for everybody else.
 *   2. a clue beyond the rung bought — the deck's whole tension is how few you
 *      need, and a second clue given away is the game played for you.
 *   3. an episode citation mid-round, which is a clue nobody paid for.
 *   4. a board from the future, which is the same leak with a date on it.
 *   5. the game being FOUND: it is UNLISTED, so a name on the team sheet, a
 *      sitemap entry or a missing noindex is a launch nobody decided on.
 *   6. the endpoint simply being down, which is what happened to football's.
 *
 * MIN_ASSERTIONS is the second net under the completion marker: the marker
 * catches a crash, the floor catches a block that goes quiet without crashing.
 * It is set BELOW the real count on purpose, by the number that can legitimately
 * skip — the board block skips every assertion on a day past the end of the
 * calendar, which this deck reaches after 97 days.
 */
import { gamePath } from "../../functions/_lib/permalink.js";

const BASE = "https://www.thexigames.com";
/* THE ADDRESS IS ASKED FOR, NOT WRITTEN. The theme move rewrote a hundred
   literal paths across ninety files and every one was a place the theme could
   later be wrong; a live_check with the path baked in would keep passing
   against the OLD address after a move, which is the worst way for this
   particular file to be wrong. The game's own gate refuses a hand-written one,
   and it caught this file doing it. */
const GAME = "whoami_fr";
const PATH = gamePath(GAME);
/* MEASURED, NOT GUESSED. A complete run asserts 21; the board block is 7 of
   them and skips legitimately on a day past the end of the calendar, which
   this deck reaches after 97 days. 21 - 7 = 14. Set to the exact count it
   would flap the first time the deck runs out; left alone for five releases it
   stops being able to refuse anything, so it is REVIEWED when assertions are
   added rather than raised by reflex. */
const MIN_ASSERTIONS = 14;

const expectAt = process.argv.indexOf("--expect");
const EXPECT = expectAt > -1 ? process.argv[expectAt + 1] : null;

let pass = 0, fail = 0, ran = 0;
const t = (n, ok, d) => {
  ran++; ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`);
};

const get = async (path, opts = {}) => {
  const r = await fetch(BASE + path, {
    headers: { "X-XI-Games": "1" }, cache: "no-store", ...opts,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* a page, not an endpoint */ }
  return { status: r.status, headers: r.headers, text, json };
};

console.log("Who Am I XI: Friends — live\n");

/* ---- the page ---- */
const page = await get(PATH);
t("the page answers", page.status === 200, String(page.status));
if (EXPECT) {
  t("the build tag is what was expected",
    new RegExp(`js/game\\.js\\?v=${EXPECT}\\b`).test(page.text), EXPECT);
}
const tags = [...page.text.matchAll(/(?:href|src)="(?:css|js)\/[^"?]+\?v=([^"]+)"/g)]
  .map((m) => m[1]);
t("every one of this game's assets carries the same tag",
  tags.length > 0 && new Set(tags).size === 1, tags.join(" "));

/* UNLISTED, PROVED FROM OUTSIDE. The gate can only say the tree does not
   advertise it; this says the SERVED site does not.
   ASKED ONLY OF A PAGE THAT ANSWERED. The first version asked it
   unconditionally and PASSED on a 404 — the site's 404 page is noindexed too,
   so the assertion was true about a page that was not this game's. A check
   that is satisfied by the absence of the thing it is checking is the shape
   this project has found six of; the 404 above is the failure, and this must
   not quietly report a second success on top of it. */
if (page.status === 200) {
  t("the served page is noindexed while the game is unlisted",
    /<meta[^>]+name="robots"[^>]+noindex/i.test(page.text));
} else {
  console.log("  --  noindex NOT checked: the page did not answer 200, so there " +
              "is no page of ours to check. This is not a pass.");
}

const sitemap = await get("/sitemap.xml");
t("the sitemap answers", sitemap.status === 200, String(sitemap.status));
t("and it advertises no address of this game",
  sitemap.text.indexOf(PATH) === -1);

/* THE SHIPPED CHROME, AS THE BROWSER RECEIVES IT. Not the file in the tree —
   this is the one place that can prove what is actually being downloaded by
   every page on the site, comments and all, and an href or a name in it is the
   site stating that this game exists. */
const chrome = await get("/shared/xi-chrome.js");
t("the shared chrome is served", chrome.status === 200, String(chrome.status));
t("and it names neither this game nor its address",
  chrome.text.indexOf(PATH) === -1 &&
  chrome.text.indexOf("Who Am I XI: Friends") === -1);

/* ---- the board ---- */
const daily = await get("/api/whoami/whoami_fr/daily");
t("the daily answers 200 rather than a 500", daily.status === 200,
  daily.status === 200 ? "" : daily.text.slice(0, 160));

/* THE THREE APPLIED-BY-HAND THINGS, TOLD APART. A 500 naming a table is a
   migration that never ran; a 404 is tables with no rows in them. They need
   different fixes, so they are reported differently rather than both reading
   as "the daily is broken". */
if (daily.status === 500 && /no such table/i.test(daily.text)) {
  console.log("      ^ migration 044 has not been applied to production");
}
if (daily.status === 404) {
  console.log("      ^ the tables exist but today has no board: the deck or the " +
              "calendar has not been imported, or the calendar has run out");
}

if (daily.json && daily.json.board) {
  const b = daily.json.board;
  const flat = JSON.stringify(b);

  t("the board deals three doors, not football's eleven",
    Array.isArray(b.doors) && b.doors.length === 3,
    b.doors ? String(b.doors.length) : "no doors");

  /* WHAT A DOOR MAY SAY: a slot, a section and a deck. Checked by walking the
     KEYS rather than looking for forbidden names, because a field added to the
     projection is the way this leaks and a blocklist cannot see a new one. */
  const keys = [...new Set((b.doors || []).flatMap((d) => Object.keys(d)))].sort();
  t("and a door carries only its slot, its section and its deck",
    JSON.stringify(keys) === JSON.stringify(["deck", "section", "slot"]),
    keys.join(", "));

  t("no card id and no round letter travels with the board",
    !/card_id|round_letter/.test(flat));

  /* NOT A CLUE, NOT AN EPISODE. The board is the choice of doors; every
     sentence costs something, and a citation is a clue nobody paid for. */
  t("and no clue text and no episode is in it",
    !/"text"/.test(flat) && !/\bS\d+E\d+\b/.test(flat));

  t("the scoring rule travels with the board, so the page draws the real prices",
    !!daily.json.scoring && Array.isArray(daily.json.scoring.ladder) &&
    daily.json.scoring.ladder.length === 3,
    "three rungs");
  t("and it carries NO curve, because this deck has no clock",
    !daily.json.scoring.curve && daily.json.scoring.max === 10,
    "max " + (daily.json.scoring && daily.json.scoring.max));

  t("the day is today's and not the future",
    !daily.json.day || daily.json.day <= new Date().toISOString().slice(0, 10),
    daily.json.day);
}

/* AN UNKNOWN GAME IS REFUSED RATHER THAN DEFAULTED TO FOOTBALL'S, proved in
   production because this is the one that would be silent: every response
   would be well-formed, just about the wrong deck. */
const bogus = await get("/api/whoami/nope/daily");
t("an unknown game is refused at the namespaced address", bogus.status === 404,
  String(bogus.status));

/* AND FOOTBALL'S OWN ADDRESS STILL SERVES FOOTBALL. The whole namespacing
   move is only safe if the legacy address never moved; every live football
   client is calling it. */
const legacy = await get("/api/whoami/daily");
t("football's legacy daily still answers", legacy.status === 200, String(legacy.status));
t("and it is football's board, with eleven doors",
  !!legacy.json && !!legacy.json.board && Array.isArray(legacy.json.board.doors) &&
  legacy.json.board.doors.length === 11,
  legacy.json && legacy.json.board && legacy.json.board.doors
    ? String(legacy.json.board.doors.length) : "no doors");

/* ---- HEAD, which is production proof of functions/_middleware.js ---- */
const head = await get("/api/whoami/whoami_fr/daily", { method: "HEAD" });
t("HEAD on the daily answers the same status with no body",
  head.status === daily.status && head.text === "", String(head.status));
t("and /api/* carries X-Robots-Tag: noindex",
  /noindex/.test(daily.headers.get("x-robots-tag") || ""),
  daily.headers.get("x-robots-tag") || "absent");

/* ---- the floor and the marker ---- */
t("this run reached the end without a block going quiet", ran >= MIN_ASSERTIONS,
  `${ran} assertion(s), floor ${MIN_ASSERTIONS}`);

console.log(`\n${pass} passed, ${fail} failed  (live check complete)`);
process.exit(fail ? 1 : 0);
