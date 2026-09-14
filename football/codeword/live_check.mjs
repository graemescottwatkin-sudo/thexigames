/* football/codeword/live_check.mjs — Codeword XI, against production.
 *
 * Run AFTER a deploy. The deploy gate reads the tree; this reads the site.
 *
 * WHAT ONLY THIS FILE CAN PROVE. Codeword's whole integration is about what
 * does NOT come back: the board files carry the filled grid, every answer and
 * the cipher, and publicBoard sends none of them. A suite proves the function
 * strips them; only this proves the endpoint that calls it does. And the
 * archive bound — a board is reachable when its day has come — lives in SQL,
 * which a stubbed database cannot test at all: board_test.mjs says so in its
 * own header and defers the clause to here.
 *
 * THE FLOOR. MIN_ASSERTIONS is the second net under the completion marker, set
 * BELOW the run's real count by the number that can legitimately skip. Review
 * it when assertions are added — REVIEW, not raise: a floor set to the exact
 * count flaps on an honest skip, and one left alone stops being able to refuse.
 */
const BASE = "https://www.thexigames.com";
const expectArg = process.argv.indexOf("--expect");
const EXPECT = expectArg > -1 ? process.argv[expectArg + 1] : null;

let pass = 0, fail = 0, warn = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const w = (n, d) => { warn++; console.log(`  ??  ${n}${d ? "  — " + d : ""}`); };

/* Twenty-two run against a launched game with a board today. The archive block
   skips when the game has had only one day, which is true on its launch day and
   for nobody afterwards. */
const MIN_ASSERTIONS = 16;
let finished = false;
process.on("exit", () => {
  if (!finished) {
    console.log("\nFAIL  the run did not reach the end — something threw");
    process.exitCode = 1;
  }
});

const get = (p, opts) => fetch(BASE + p, { redirect: "manual", ...(opts || {}) });

console.log("Codeword XI, live\n");

console.log("The page");
const page = await get("/football/codeword/");
const html = page.status === 200 ? await page.text() : "";
t("the page is served", page.status === 200, String(page.status));
t("and it names itself, because it is out", /Codeword XI/.test(html));
t("it loads the shared chrome rather than drawing its own",
  /shared\/xi-chrome\.js/.test(html) && /class="xic-bar"/.test(html),
  "the drawer, the squad, the theme and the season all live behind that file");
t("and it stamps no board into the bytes a browser receives",
  !/var ROWS = \[[^\]]/.test(html) && !/var CODE = \{[^}]/.test(html),
  "a stamped fallback board is the whole solution in view-source");

console.log("\nToday's board, and what does not come with it");
const daily = await get("/api/codeword/daily");
t("the daily endpoint answers", daily.status === 200, String(daily.status));
let board = null, body = null;
if (daily.status === 200) {
  body = await daily.json();
  board = body && body.board;
}
t("it hands over a board", !!board && Array.isArray(board.cells));

/* THE ASSERTION THIS FILE EXISTS FOR. Three fields end the puzzle: rows is the
   filled grid, words is every answer with its position, and code plus the
   numbers a player can already see inverts to rows in one pass. None may
   appear anywhere in the response, at any depth. */
if (body) {
  const blob = JSON.stringify(body);
  t("and none of rows, words or code is anywhere in the response",
    !/"rows"/.test(blob) && !/"words"/.test(blob) && !/"code"/.test(blob),
    "any one of the three is the puzzle solved");
  t("the numbers are there, which are the puzzle",
    !!board && board.cells.some((r) => r.some((c) => Number.isInteger(c))));
  t("three given letters, and not a letter more of the cipher",
    !!board && Array.isArray(board.given) && board.given.length === 3,
    board && board.given ? String(board.given.length) : "none");
  t("the clues are there and carry no answer",
    !!board && Array.isArray(board.slots) && board.slots.length > 0 &&
      board.slots.every((s) => s.answer === undefined && typeof s.len === "number"));
  t("and the day it is for is the server's, not a number the client chose",
    /^\d{4}-\d{2}-\d{2}$/.test(String(body.day)), String(body.day));
}

console.log("\nThe past opens and the future does not");
/* DERIVED, NOT PINNED. Today's family board number comes from the page that
   serves today — asked of the site rather than computed here, because a
   live_check that does its own date arithmetic is a second opinion about what
   day it is. */
const todayPage = await get("/football/crossword/daily");
const todayNo = Number(((await todayPage.text())
  .match(/rel="canonical" href="[^"]*\/football\/crossword\/daily\/(\d+)"/) || [])[1]) || null;
t("today's family board number is discoverable, so the checks below can run",
  !!todayNo, String(todayNo));

if (todayNo) {
  /* TOMORROW IS THE CASE THAT MATTERS. A board a year out is refused by almost
     any bug; the one that becomes reachable tomorrow is what an off-by-one
     serves, and it is the first thing to break if an epoch moves. */
  const tomorrow = await get(`/api/codeword/daily?no=${todayNo + 1}`);
  t("TOMORROW's board is refused", tomorrow.status === 404, String(tomorrow.status));
  const far = await get(`/api/codeword/daily?no=${todayNo + 300}`);
  t("and so is one much further out", far.status === 404, String(far.status));
  /* The same 404 for a reason that is not the same. A player who mistypes and a
     crawler probing the queue must not be able to tell each other's answer
     apart, or the difference IS the answer. */
  const rubbish = await get("/api/codeword/daily?no=not-a-number");
  t("a malformed number is refused identically, not coerced to today",
    rubbish.status === 404, String(rubbish.status));
  const before = await get("/api/codeword/daily?no=1");
  t("and a number from before this game existed is refused",
    before.status === 404,
    "family board 1 is 26 August, three weeks before the queue starts");

  /* A board that HAS gone, if there is one. On launch day there is not, and
     that is a legitimate skip rather than a failure. */
  if (body && body.no > 1) {
    const past = await get(`/api/codeword/daily?no=${todayNo - 1}`);
    t("yesterday's board opens, because its day has gone", past.status === 200,
      String(past.status));
  } else {
    w("no board has gone yet, so the archive has nothing to open", "launch day");
  }
}

console.log("\nHeaders and the refusals");
const head = await get("/api/codeword/daily", { method: "HEAD" });
t("HEAD answers without a body", head.status === 200, String(head.status));
t("and the API is not indexed",
  (daily.headers.get("x-robots-tag") || "").includes("noindex"));
t("nor cached, because the board it returns changes with the day",
  (daily.headers.get("cache-control") || "").includes("no-store"),
  daily.headers.get("cache-control") || "none");

console.log("\nIt is part of the family");
t("the hub links to it", (await (await get("/")).text()).indexOf('href="/football/codeword/"') > -1);
const map = await get("/sitemap.xml");
t("the sitemap lists it", (await map.text()).indexOf("/football/codeword/") > -1);

console.log("\nThe build tag");
const tag = (html.match(/buildTag['"]?\s*[:=]\s*['"]([a-z0-9]+)['"]/) || [])[1] ||
  (html.match(/js\/game\.js\?v=([a-z0-9]+)/) || [])[1] || null;
if (!EXPECT) w("the live tag is reported and not judged", String(tag));
else t("and it is the version expected (" + EXPECT + ")", tag === EXPECT, "live " + tag);

t(`the run made at least ${MIN_ASSERTIONS} assertions`, pass + fail >= MIN_ASSERTIONS,
  `${pass + fail} ran`);

finished = true;
console.log(`\n${pass} passed, ${fail} failed, ${warn} unjudged`);
process.exit(fail ? 1 : 0);
