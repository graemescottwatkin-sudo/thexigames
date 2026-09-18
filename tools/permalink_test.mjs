/* permalink_test.mjs — one URL, one puzzle, forever.
 *
 * The rule the owner asked for is a single sentence, and everything below is
 * that sentence made checkable for all four games at once: a link posted on
 * the 3rd must still open the 3rd's board on the 10th, and no second URL may
 * open the same board.
 *
 * EXECUTED, NOT READ. The route is called with a stubbed asset binding and a
 * frozen clock, so what is asserted is what it returns — a status, a
 * Location, a title — and not the shape of its source. A regex over this file
 * could not tell a 302 to today from a 302 to yesterday.
 *
 *   node tools/permalink_test.mjs        (from the repo root)
 */
import { gameDir } from "../functions/_lib/permalink.js";
import fs from "node:fs";
import { PERMA_GAMES, todayKeyFor, validKey, keyForOldDate, permalinkPath, permalinkRoute, gamePath }
  from "../functions/_lib/permalink.js";
import { dailyDayKey } from "../functions/_lib/daily.js";

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}

const GAMES = Object.keys(PERMA_GAMES);
/* THE SUITE'S "TODAY" IS A BOARD NUMBER, and the date comes from the family's
   own arithmetic. This was `Date.parse("2026-09-03T10:00:00Z")` with every
   expectation below written against it by hand — board 9 was 3 September,
   board 5 was 30 August, board 7 was 1 September. All true while day one fell
   on 26 August 2026. When the family reset to day 1 on 18 September 2026 that
   instant landed three weeks BEFORE the epoch: there was no board 9, no
   yesterday, and thirty-odd assertions failed because the calendar had moved
   rather than because anything was wrong.
   NINE, because the fixture needs a today with several boards behind it —
   yesterday, board 5 and board 7 all have to exist and be in the past — and
   nothing above nine is required by anything here. */
const TODAY_NO = 9;
const NOW = Date.parse(dailyDayKey(TODAY_NO) + "T10:00:00Z");
const DAY_TODAY = dailyDayKey(TODAY_NO);
/* The day before day one: the case "a day before the family existed is not
   bent to board one" needs a real date that precedes the epoch. */
const DAY_BEFORE_ONE = new Date(Date.parse(dailyDayKey(1) + "T00:00:00Z") - 86400000)
  .toISOString().slice(0, 10);
/* THE EXPECTED TITLE IS BUILT HERE, NOT ASKED OF THE CODE. First attempt read
   it from keyLabel() — the very function that renders it — which made the
   check a tautology: sabotaging dayLabel to print the wrong day, and again to
   print day one for every board, left all 168 assertions green, because the
   expectation moved with the fault. Caught by sabotage, which is the only way
   this kind of hole is ever caught.
   The DAY still comes from dailyDayKey, because what day board 5 fell on is
   the family's one piece of arithmetic and must not be restated. The FORMAT is
   restated deliberately: it is the assertion's job to say what the output
   should look like, and a test that asks the code what it produces proves
   nothing about whether it is right. */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];
const labelFor = (no) => {
  const [y, m, d] = dailyDayKey(no).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
};
const LABEL_5 = labelFor(5);
const LABEL_7 = labelFor(7);

/* ONE READING OF THE CLOCK, HANDED TO BOTH SIDES. The pure resolvers take a
   `now` and the fixture passes NOW to them; permalinkRoute does not, and reads
   Date.now() itself. While the family had weeks of boards behind it that did
   not matter — board 9 was in the past either way — so the suite handed a
   fixture instant to one half and let the other half read the real clock, and
   nobody noticed they were answering different questions. On day one the two
   disagreed completely: every route call refused boards 5, 7 and 9 as the
   future while the resolvers happily named them.
   The clock is pinned for the whole run now, which is what CLAUDE.md asks for
   — take one reading and give it to both sides — and what clock_test already
   does. Restored at the end so nothing downstream inherits a fake clock. */
const REAL_NOW = Date.now;
Date.now = () => NOW;

/* THE GAME'S REAL PAGE, not a stand-in for one. The rewrites below find the
   canonical link, the og tags and the title by their shape, so a head that
   changes shape has to fail here rather than quietly serving a permalink
   whose preview still says the game's front page. A stubbed head could not
   fail that way, which is the whole reason this reads the file. */
const shellFor = (game) => fs.readFileSync(`${gameDir(game)}/index.html`, "utf8");

const env = {
  ASSETS: {
    fetch: async (req) => {
      /* THE GAME IS NOT THE FIRST SEGMENT ANY MORE. /football/crossword/ —
         the theme leads, so the stub took "football" as the game and looked
         for football/football/index.html. */
      const parts = new URL(req.url || req).pathname.split("/").filter(Boolean);
      const game = parts[1] || parts[0];
      return new Response(shellFor(game), { headers: { "Content-Type": "text/html" } });
    },
  },
};
const call = (game, path) => permalinkRoute({
  request: new Request("https://www.thexigames.com" + (path === null ? `/${game}/daily` : `/${game}/daily/${path}`)),
  env,
  params: { path: path === null ? [] : String(path).split("/") },
}, game);

console.log("Every game has the same shape");
for (const game of GAMES) {
  const today = todayKeyFor(game, NOW);
  t(`${game}: today's key is the server's idea of today`, !!today, today);
  /* THE THEME LEADS. /football/crossword/daily/12 since 5 Sep 2026 — other
     kinds of quiz are coming, and XI never meant football. Built from
     gamePath rather than written out, so this asserts the SHAPE holds rather
     than restating the theme and having to be edited when it changes. */
  t(`${game}: the path is ${gamePath(game)}daily/<key>`,
    permalinkPath(game, today) === `${gamePath(game)}daily/${today}`);
}

console.log("\n/<game>/daily IS today, and today does not wear a number");
for (const game of GAMES) {
  const r = await call(game, null);
  /* It used to 302 to /daily/9, which put a board number in front of
     somebody who had asked for today. The number belongs to the archive,
     where it is the thing being pointed at. */
  t(`${game}: serves today rather than bouncing to a numbered address`,
    r.status === 200, String(r.status));
  t(`${game}: and is never cached, because today changes at midnight`,
    r.headers.get("Cache-Control") === "no-store");
  /* The permanent address of what it just served, readable without parsing
     any HTML: a bot records this and it still means this board next week. */
  t(`${game}: naming today's permanent address in a Link header`,
    (r.headers.get("Link") || "").includes(permalinkPath(game, todayKeyFor(game))),
    r.headers.get("Link"));
  const html = await r.text();
  t(`${game}: and in the canonical, so a crawler consolidates on it`,
    html.includes('href="https://www.thexigames.com' + permalinkPath(game, todayKeyFor(game)) + '"'));
}

console.log("\nA permalink opens that board and nothing else");
for (const game of GAMES) {
  const key = todayKeyFor(game, NOW);
  const r = await call(game, key);
  const html = await r.text();
  t(`${game}: 200, and the game's own page`, r.status === 200 && html.includes("js/game.js"));
  /* The page lives at /<game>/ and every asset in it is relative. Without
     this tag they would resolve against /<game>/daily/ and 404 — the board
     would be a blank screen. */
  t(`${game}: carries a base so its relative assets still resolve`,
    html.includes(`<base href="${gamePath(game)}">`));
  t(`${game}: is not cached, like the page it is`, r.headers.get("Cache-Control") === "no-store");
}

console.log("\nWhat a share preview says names the board");
{
  const r = await call("crossword", "5");
  const html = await r.text();
  /* THE DAY, NOT THE NUMBER. "Matchday 5" was the first draft: the crossword
     keeps that word for boards inside a season and calls the rest "Today's
     puzzle", so a preview saying Matchday 5 named something the page never
     says. Board 5 ran on 30 August 2026 — the family epoch is 26 August. */
  t("the title names the day the board ran", html.includes(`<title>${LABEL_5} · Crossword XI</title>`),
    (html.match(/<title>([^<]*)</) || [])[1]);
  /* Proof the rewrite did something: the page it started from carries a
     different title, so this cannot pass on a page that was never touched. */
  const shellTitle = (shellFor("crossword").match(/<title>([^<]*)</) || [])[1];
  t("which is not what the page it started from said", shellTitle !== `${LABEL_5} · Crossword XI`, shellTitle);
  t("the canonical is the permalink itself, so it is the address of the board",
    html.includes('href="https://www.thexigames.com/football/crossword/daily/5"'));
  t("og:url and og:title follow it",
    html.includes('content="https://www.thexigames.com/football/crossword/daily/5"') &&
    html.includes(`content="${LABEL_5} · Crossword XI"`));
  /* INDEXED, on the owner's call. What a page offered to a crawler must at
     least have is something of its own, and for these that is the title and
     the description — the board itself arrives by script, so the HTML is the
     same shell every time. Nothing here is asserted about ranking; what is
     asserted is that the page is not blocked and is not word-for-word the
     page beside it. */
  t("the page is not held back from a crawler", !/noindex/.test(html));
  t("and says something of its own, not the game's front page line", (() => {
    const d = (html.match(/name="description" content="([^"]*)"/) || [])[1] || "";
    const shellDesc = (shellFor("crossword").match(/name="description" content="([^"]*)"/) || [])[1] || "";
    return d.includes(LABEL_5) && d !== shellDesc;
  })());
  t("and its social description says the same",
    new RegExp(`property="og:description" content="[^"]*${LABEL_5}`).test(html));
  /* AND A GAME WITH A SCHEDULE TABLE SAYS THE SAME KIND OF THING, at the same
     kind of address. Board 7 is 1 September 2026 in every game — the number is
     the family's day count, so it names the same day whichever game is asked,
     which is the whole reason the two date-keyed games moved onto it. */
  const w = await call("wordsearch", "7");
  const wh = await w.text();
  t("and a game with a schedule says the same kind of thing",
    wh.includes(`<title>${LABEL_7} · Wordsearch XI</title>`),
    (wh.match(/<title>([^<]*)</) || [])[1]);
  t("and board 7 is the same DAY in every game, which is the point of one scheme",
    (await Promise.all(GAMES.map(async (g) =>
      ((await (await call(g, "7")).text()).match(/<title>([^<]*)</) || [])[1])))
      .every((title) => new RegExp(`^${LABEL_7} · `).test(title)),
    `every game's board 7 must be titled ${LABEL_7}`);
}

console.log("\nOne board, one address");
{
  const r = await call("crossword", "007");
  t("a padded number is corrected with a 301, not served twice",
    r.status === 301 && r.headers.get("Location") === "/football/crossword/daily/7",
    `${r.status} -> ${r.headers.get("Location")}`);
  const deep = await call("crossword", "5/6");
  t("a key with more path after it is refused", deep.status === 404, String(deep.status));
}

console.log("\nThe future is refused, and so is nonsense");
{
  const today = Number(todayKeyFor("crossword", NOW));
  /* ONE SHAPE, ALL FIVE. Until 6 September 2026 the crossword took a number
     and HiLo took a date, and validKey refused the other for each. The owner
     asked for one shape while the site still had no users; this is that,
     asserted for every game rather than for the two that happened to have it. */
  for (const game of GAMES) {
    t(`${game}: today's number is a page`,
      validKey(game, String(today), NOW) === String(today));
    t(`${game}: yesterday's is`,
      validKey(game, String(today - 1), NOW) === String(today - 1));
    t(`${game}: tomorrow's is not`,
      validKey(game, String(today + 1), NOW) === null);
    /* THE DATE FORM IS NOT A KEY ANY MORE — not for the games that never took
       one, and not for the two that did. It resolves through keyForOldDate and
       a 301, and nowhere else, because two ways in is two addresses. */
    t(`${game}: and a date is not a key, for any game now`,
      validKey(game, dailyDayKey(7), NOW) === null);
  }
  t("zero and negative are not board numbers",
    validKey("crossword", "0", NOW) === null && validKey("crossword", "-1", NOW) === null);
  t("nor is a number with anything else in it",
    validKey("crossword", "5x", NOW) === null && validKey("crossword", "5 6", NOW) === null);
}

/* ---- THE OLD DATE FORM, WHICH IS SOMEBODY'S LINK ----
 *
 * The word search and HiLo were addressed as /daily/2026-09-06 until 6
 * September 2026. The project's law is that old paths 301 and always will —
 * /crossword/daily/5 is somebody's link — so these do too, onto the number
 * that day is now called. */
console.log("\nThe date form a link was posted with still lands");
{
  /* 3 September 2026 is board 9: the epoch is 26 August and the count starts
     at one. Read from the resolver rather than written down, so this cannot
     drift from the arithmetic it is checking. */
  const nine = keyForOldDate(DAY_TODAY, NOW);
  t("a date resolves to the number that day is called",
    nine === String(TODAY_NO), String(nine));
  for (const game of GAMES) {
    const r = await call(game, DAY_TODAY);
    t(`${game}: the date form 301s to the number`,
      r.status === 301 && r.headers.get("Location") === `${gamePath(game)}daily/${TODAY_NO}`,
      `${r.status} -> ${r.headers.get("Location")}`);
  }
  /* A DAY BEFORE THE FAMILY EXISTED IS NOT BENT TO BOARD ONE. The word
     search's schedule reaches back to 1 January 2026, eight months before day
     one, and every one of those days would otherwise redirect to the same
     board — hundreds of addresses claiming to be board 1. */
  t("a day before day one resolves to nothing",
    keyForOldDate(DAY_BEFORE_ONE, NOW) === null &&
    keyForOldDate("2026-01-01", NOW) === null);
  const early = await call("wordsearch", "2026-01-01");
  t("and is refused rather than redirected", early.status === 404, String(early.status));
  t("a day that does not exist resolves to nothing",
    keyForOldDate("2026-02-31", NOW) === null);
  t("a day in the wrong shape is not a date at all",
    keyForOldDate("3-9-2026", NOW) === null && keyForOldDate("2026-9-3", NOW) === null);
  const future = await call("hilo", "2099-01-01");
  t("and a date after today is refused, not redirected",
    future.status === 404, String(future.status));
}
console.log("\nA refusal says nothing about what it refused");
{
  const future = await call("crossword", "99999");
  const junk = await call("crossword", "nonsense");
  t("the future and the nonsensical get the same 404",
    future.status === 404 && junk.status === 404 &&
    (await future.text()) === (await junk.text()));
  t("and a 404 is never indexed or cached",
    future.headers.get("X-Robots-Tag") === "noindex" &&
    future.headers.get("Cache-Control") === "no-store");
}

/* ---- A DAY THE GAME DID NOT RUN IS NOT A BOARD ----
 *
 * /football/wordsearch/daily/2020-01-01 and /football/hilo/daily/1999-12-31
 * both answered 200 with a self-referencing canonical, for any past date at
 * all: an unbounded set of near-identical pages each claiming to be the
 * permanent address of a board that never existed.
 *
 * Numbering bounded that space by itself — 1 to today is a few dozen
 * addresses, not every date in history — but it did NOT answer the question,
 * and moving to numbers made the question louder rather than quieter. HiLo's
 * schedule begins on 3 September 2026, which is board 9. Boards 1 to 8 are
 * days it had not launched, and a page reading "27 August 2026 · HiLo XI" for
 * board 2 would be a page about a board that never was.
 *
 * So the number is translated back to the day the schedule is keyed on and the
 * schedule is asked. The env above has no DB, which is how every check before
 * this one passes — and it is also why none of them could see this. Without a
 * database there is no schedule to ask and the honest answer is yes, so
 * proving the rule needs a database that answers. */
console.log("\n=== A board whose day the game never ran ===");
{
  /* Both games ran on 3 September 2026, which is board 9, and on nothing else.
     Written as the DAY because that is what a schedule table holds: the
     translation from board number back to day is the thing under test, so
     stating the fixture in numbers would have assumed it. */
  const RAN = { wordsearch: [DAY_TODAY], hilo: [DAY_TODAY] };
  const dbEnv = {
    ASSETS: env.ASSETS,
    DB: {
      prepare: (sql) => ({
        bind: (day) => ({
          first: async () => {
            const game = /ws_schedule/.test(sql) ? "wordsearch"
              : /hl_schedule/.test(sql) ? "hilo" : null;
            return game && RAN[game].includes(day) ? { n: 1 } : null;
          },
        }),
      }),
    },
  };
  const callDb = (game, key) => permalinkRoute({
    request: new Request(`https://www.thexigames.com/${game}/daily/${key}`),
    env: dbEnv,
    params: { path: [String(key)] },
  }, game);

  for (const game of ["wordsearch", "hilo"]) {
    /* Board 9 IS 3 September 2026, the one day the fixture ran. */
    const ran = await callDb(game, "9");
    t(`${game}: a board whose day it DID run is served`, ran.status === 200, String(ran.status));
    /* Board 2 is 27 August 2026 — a real, past, well-formed board number that
       this game has no board behind, which is exactly HiLo's first eight. */
    const never = await callDb(game, "2");
    t(`${game}: a past board whose day it never ran is refused`,
      never.status === 404, String(never.status));
    /* The SAME refusal a future key gets, so a probe cannot tell a day with no
       board from a day that has not come — the rule the answers pages keep. */
    const future = await callDb(game, "99999");
    t(`${game}: and refused identically to a board that has not come`,
      never.status === future.status &&
      never.headers.get("X-Robots-Tag") === future.headers.get("X-Robots-Tag") &&
      never.headers.get("Cache-Control") === future.headers.get("Cache-Control"),
      `${never.status} / ${future.status}`);
  }
  /* A NUMBERED GAME ASKS NOTHING, because for it there was never a question:
     the ring wraps, so every key from 1 to today resolves. If this started
     querying, every crossword and Scrambled permalink would take a database
     read to answer something already known.
     TWO THINGS KEEP THAT TRUE — an early return on `kind === "number"`, and a
     query scoped to the two games that have a schedule — and breaking either
     one alone leaves the BEHAVIOUR unchanged, so this check stays green.
     Recorded rather than filed as a weakness: it asserts what the route does,
     not how, and it goes red the moment both guards are gone. */
  let asked = 0;
  const countEnv = {
    ASSETS: env.ASSETS,
    DB: { prepare: () => { asked++; return { bind: () => ({ first: async () => ({ n: 1 }) }) }; } },
  };
  await permalinkRoute({
    request: new Request("https://www.thexigames.com/football/crossword/daily/1"),
    env: countEnv, params: { path: ["1"] },
  }, "crossword");
  t("a numbered game reads no schedule to serve a board", asked === 0, asked + " queries");
}

console.log(`\n${pass} passed, ${fail} failed`);
Date.now = REAL_NOW;
process.exit(fail ? 1 : 0);
