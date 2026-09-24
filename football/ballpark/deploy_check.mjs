/* football/ballpark/deploy_check.mjs — Ballpark XI's gate.
 *
 *   node football/ballpark/deploy_check.mjs        (from the repo root)
 *
 * WRITTEN ON THE DAY IT LAUNCHED, 16 September 2026, and later than it should
 * have been: this game had no gate at all while it was reachable, playable and
 * being played. Every other game in the family had one. A game with no gate can
 * go live by drift in either direction — nothing refused its absence from GAMES
 * while it was dark, and nothing would have refused a half-launch afterwards.
 *
 * AND ITS LAUNCH WAS UNUSUAL, which several checks below exist to pin. Ballpark
 * was serving at its own address from the family's epoch, with a working API
 * and ten rounds played, holding no shirt and linked from nowhere. So LAUNCHED
 * is 2026-08-26 — the day it began serving — and not the day the line was
 * added. The rule is games.js's own: a later date hides boards already run.
 */
/* The football hub moved to football/index.html on 21 Sep 2026, when the
   root became the theme picker. Asked, never assembled: see permalink.js. */
import { themeHubFile } from "../../functions/_lib/permalink.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const has = (p) => fs.existsSync(path.join(DIR, p));
const read = (p) => fs.readFileSync(path.join(DIR, p), "utf8");
const hasRoot = (p) => fs.existsSync(path.join(ROOT, p));
const readRoot = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/* WHAT IS LIVE. Not a sentinel — a constant nothing moves is a comparison
   against nothing. Set on the first deploy after launch and never backwards. */
const LAST_SHIPPED = "v001v";
/* THE HALF THAT CARRIES THE LAW. A version number can only refuse a tag that
   goes BACKWARDS; it cannot see changed bytes under a tag that has not moved,
   which is the common case and the dangerous one.
   NULL UNTIL THE FIRST POST-DEPLOY, AND NOT ZEROES. Sixteen zeroes would be a
   constant nothing moves — the sentinel fault Codeword's gate was criticised
   for having written directly beneath a comment forbidding it. null is the
   shape tools/post_deploy.mjs recognises and overwrites with the real hash of
   the bytes it has just confirmed live, and until then the tag comparison
   above carries the law on its own because the tree is ahead of live. */
const LAST_SHIPPED_ASSETS = "4cca55bd89e68279";

console.log("Ballpark XI — gate\n");

console.log("The files exist and agree about their version");
{
  t("a page, a stylesheet and a script", has("index.html") && has("css/style.css") && has("js/game.js"));
  t("and the rules, which the server reads too", has("js/rules.js"));

  const html = has("index.html") ? read("index.html") : "";
  const js = has("js/game.js") ? read("js/game.js") : "";
  const build = (js.match(/var BUILD = "([^"]+)"/) || [])[1] || "";
  t("BUILD is set in the script", !!build, build);

  /* EVERY ONE OF THIS GAME'S ASSETS ON ONE TAG. Before launch this page carried
     css on v001c, game.js on v001b and rules.js on v001 — three tags for one
     deploy, so the same URL could name different bytes for every browser
     holding one of them cached. */
  const own = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"?]+)\?v=([^"]+)"/g)];
  t("every asset on the page carries the build tag",
    own.length > 0 && own.every((m) => m[2] === build),
    own.map((m) => m[1] + "=" + m[2]).join(" "));
  t("the tag has not gone backwards",
    build >= LAST_SHIPPED, `now ${build}, live ${LAST_SHIPPED}`);

  /* Normalised to LF because what ships is what is in git and a Windows
     checkout writes CRLF — a hash of the working tree otherwise answers a
     different question on each machine. */
  const assetsNow = (() => {
    const paths = own.map((m) => m[1]).sort();
    if (!paths.length) return null;
    const h = crypto.createHash("sha256");
    for (const f of paths) {
      if (!has(f)) return null;
      h.update(f); h.update("\0");
      h.update(read(f).replace(/\r\n/g, "\n"));
    }
    return h.digest("hex").slice(0, 16);
  })();
  t("the game's own assets cannot change without its build tag moving",
    !!assetsNow && (assetsNow === LAST_SHIPPED_ASSETS || build !== LAST_SHIPPED),
    assetsNow === LAST_SHIPPED_ASSETS
      ? "unchanged since " + LAST_SHIPPED
      : build !== LAST_SHIPPED
        ? "changed, and the tag moved " + LAST_SHIPPED + " -> " + build
        : "CHANGED with the tag still on " + build +
          " — bump the tag, then set LAST_SHIPPED_ASSETS to " + assetsNow);
}

console.log("\nNothing that ships is an answer");
{
  const rules = has("js/rules.js") ? read("js/rules.js") : "";
  const js = has("js/game.js") ? read("js/game.js") : "";
  const html = has("index.html") ? read("index.html") : "";

  /* THE WHOLE ARRANGEMENT OF THIS GAME. The page is handed a band and a slider
     and never the true value until the question is over; the server judges. A
     rules file that grew an answer table would end the game quietly. */
  const board = hasRoot("functions/_lib/bp-board.js") ? readRoot("functions/_lib/bp-board.js") : "";
  t("the public projection is built by one function", /export function publicBoard/.test(board));
  t("and there is a leak check beside it", /export function leaks/.test(board));
  t("the rules file carries no answer", !/\banswer\s*:/.test(rules),
    "the rules are read by the browser AND the server; an answer in them is in the page");
  t("the page ships no stamped board", !/"questions"\s*:\s*\[/.test(html));
  t("and the client never decides whether a guess is right",
    !/function\s+judge\b/.test(js),
    "judging lives in bp-board.js, server side, or the answer is in the browser");
}

console.log("\nThe shared layer is used, not copied");
{
  const html = read("index.html");
  /* STRIPPED, because a comment naming a thing satisfies a check meant to
     demand its absence. This file's first run went red on style.css's own
     header, which says "a game that redefines a token or writes a .xic- rule;
     the gates check both" — prose about the rule, read as the rule. Found on
     the first execution, which is the argument for running a new check rather
     than reading it. */
  const css = (has("css/style.css") ? read("css/style.css") : "")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  t("the page loads the shared tokens and chrome",
    /shared\/xi-tokens\.css/.test(html) && /shared\/xi-chrome\.css/.test(html));
  t("and places the shared bar and footer",
    /class="xic-bar"/.test(html) && /class="xic-foot"/.test(html));
  t("the game defines no .xic- rule of its own", !/\.xic-/.test(css));
  t("the theme is resolved in the head by the shared script",
    /shared\/xi-theme\.js/.test(html));
}

console.log("\nIt counts plays and banks results, like every built game");
{
  /* BOTH COMMENT FORMS. The strip used to remove block comments only, and this
     file uses line comments as well — so a line comment mentioning
     /api/account/migrate would have satisfied the check that demands it. That
     is this repo's oldest recurring fault: a comment naming a thing standing in
     for the thing.
     (Writing this comment closed itself early on the first attempt, because it
     quoted a block-comment terminator inside a block comment. Same family, one
     level sillier.) */
  const code = read("js/game.js")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

  /* THE BODY OF A NAMED FUNCTION, by brace matching. A gate runs with no
     node_modules — no acorn, no jsdom — so there is no parser here, and brace
     counting is the honest tool: it cannot be fooled by a call that merely
     appears somewhere in the file. Comments and strings are already stripped
     above, which is what makes the count safe. */
  const bodyOf = (name) => {
    const at = code.search(new RegExp("function\\s+" + name + "\\s*\\("));
    if (at < 0) return null;
    const open = code.indexOf("{", at);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < code.length; i++) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}" && --depth === 0) return code.slice(open, i + 1);
    }
    return null;
  };

  /* THE BANKING CHAIN, five links, and this estate has broken a different one
     in each of four launches. */
  t("it starts and ends a play", /XIPlays\.start/.test(code) && /XIPlays\.end/.test(code));

  const recorder = bodyOf("recordResult");
  const pusher = bodyOf("pushResults");
  t("it records a result of its own", !!recorder);
  t("and the record carries the DAY, not only the board number",
    !!recorder && /day:\s*day/.test(recorder),
    "playedOn reads the day and results.js orders by it — a row without one sorts as null");
  t("it has a function that pushes to the account",
    !!pusher && /\/api\/account\/migrate/.test(pusher));

  /* THE ROUND, NOT ONLY THE SCORE. A score of 48 cannot be turned back into a
     round by anybody, so a round not written on the day is gone for everyone
     for ever — which is why this shipped ahead of the season, a thing that IS
     recomputable from rows that exist.
     Three assertions rather than one, because the record is assembled from
     three places and any one of them going quiet leaves a list of nulls that
     still looks like a record: the guess is captured at the lock, the grade is
     kept from the server's reply, and recordResult puts both in the row. A
     check on the row alone would pass on eleven entries of {id, null, null}. */
  const locker = bodyOf("lock");
  const settler = bodyOf("settle");
  t("the guess is written down at the moment it is locked",
    !!locker && /guesses\[step\]\s*=/.test(locker),
    "the slider is not a record of anything once the round has moved on");
  t("and the grade is kept as the server AWARDED it",
    !!settler && /grades\[step\]\s*=/.test(settler),
    "derivable from guess, answer and tolerance — and therefore not a fact about the round; "
    + "change a tolerance and every recomputed grade changes with it");
  /* THE CLOCK A QUESTION INHERITS FROM THE ONE BEFORE IT.
     show() unlocks the board and the 100ms tick computes the countdown from
     clockMs, which post("open") only refreshes when the server answers. If
     show() leaves clockMs holding the PREVIOUS question's start, the first
     tick after unlocking reads an elapsed time of "however long the player
     took to answer, plus however long they read the reveal" — and the moment
     that passes R.CLOCK, tick()'s `left <= 0` auto-locks a question nobody has
     seen and submits the untouched midpoint.
     Reported live on 17 Sep 2026 by the owner: over twenty seconds on the
     reveal and the next question was dead on arrival. The threshold was the
     allowance itself.
     This is a static check on a live-only fault, which is weaker than it
     should be — Ballpark has no page-level suite at all, which is why two
     player-facing bugs in this file have now been found by playing rather
     than by testing. Written so the order cannot silently reverse; the real
     answer is a jsdom journey for this game. */
  t("showing a question clears the clock before it unlocks",
    !!bodyOf("show") && /clockMs\s*=\s*0/.test(bodyOf("show")) &&
      bodyOf("show").indexOf("clockMs = 0") < bodyOf("show").indexOf("locked = false"),
    "otherwise the first tick charges the previous question's time to this one");
  t("and the recorded row carries the eleven as asked",
    !!recorder && /asked:/.test(recorder) && /guesses\[/.test(recorder) && /grades\[/.test(recorder),
    "id, guess, grade — the question and the answer are on the board the id names");

  /* THE CHECK THIS BLOCK WAS MISSING, and the Fable review of 16 September
     proved the gap by sabotage: it deleted the `pushResults();` CALL from
     inside recordResult and all five of the old assertions still passed —
     because /\/api\/account\/migrate/ matches the DEFINITION of a function
     nobody calls any more.
     That is exactly how Codeword lost six rounds: it recorded locally and
     never pushed. The old check could not tell a wired chain from an orphaned
     one, which is the whole failure mode it existed to guard.
     AND AN ORPHAN CHECK WOULD NOT BE ENOUGH EITHER. pushResults is legitimately
     called from syncAccount as well, so "is it called anywhere" stays green
     when the call is dropped from the recorder. The question is whether THE
     RECORDER calls it — that is the link, and nothing weaker is the link. */
  t("and the recorder actually CALLS it, rather than merely defining it nearby",
    !!recorder && /\bpushResults\s*\(/.test(recorder),
    "a recorded result that is never pushed is the Codeword fault, and it is silent");

  t("and it asks the SERVER who is signed in, not the chrome",
    !!pusher && /\/api\/auth\/session/.test(code),
    "XIChrome.account() is an object and the event carries {type,user,via} — three games read the wrong one");
}

console.log("\nAnd it IS launched, which every one of these makes true");
{
  const chrome = readRoot("shared/xi-chrome.js");
  const hub = readRoot(themeHubFile("football"));
  const sitemap = readRoot("functions/sitemap.xml.js");
  const games = readRoot("functions/_lib/games.js");
  const perma = readRoot("functions/_lib/permalink.js");

  t("it wears the tenth shirt", /n: 10,[^}]*name: "Ballpark XI"/.test(chrome),
    "a launched game takes the next free number");
  t("and every slot is a launched name or a status, never both", (() => {
    /* FOOTBALL'S ELEVEN, not every slot in the file. The squad became one list
       PER THEME when the Friends crossword launched on 21 September 2026, and
       this counted every "n:" row in xi-chrome.js -- so the twelfth it refused
       was Friends' number 1, which is a different team's shirt. The rule is
       eleven shirts PER SQUAD, and scoping the read is what makes that the thing
       being checked rather than a total across every theme. */
    const fFrom = chrome.indexOf("football: [");
    const fTo = chrome.indexOf("friends: [", fFrom);
    const football = fFrom > -1 && fTo > fFrom ? chrome.slice(fFrom, fTo) : "";
    const rows = [...football.matchAll(/\{\s*n:\s*(\d+),([^}]*)\}/g)];
    if (rows.length !== 11) return false;      // eleven shirts, never a twelfth
    return rows.every(([, , body]) => /name:/.test(body) !== /status:/.test(body));
  })(), "an unreleased game is named nowhere until it launches");

  t("the hub names it, now that it is out", /Ballpark XI/.test(hub));
  /* THREE DESTINATIONS, AND THEY MUST STAY THREE. The picture opens the
     game's own home, "Play today" skips the cover and starts the daily
     (the landing reads ?play=1 — see shared/xi-chrome.js), and "Past
     puzzles" opens the archive. Asserted separately because the fault
     worth catching is two of them collapsing onto one address, which is
     what the card did before 17 Sep 2026: the picture was inert and the
     button went to the home page, so there was no route to the board. */
  /* THE THREE DESTINATIONS, READ OFF THE CARD ITSELF. This asked for
     `<a class="cap" href=...>` and a literal aria-label until 17 Sep 2026,
     which pinned a CONTRACT to two pieces of cosmetics: the homepage was
     rebuilt to an approved editorial design, the three destinations all
     survived intact, and this went red for a class name.
     Worse, the old form never checked the three were on the SAME CARD — three
     matches anywhere in a 60KB file satisfied it, so a card that had lost its
     play link passed as long as some other card had one. The card is located
     by its data-game, which is the game's id and the one fact that cannot be
     restyled, and the three hrefs are demanded INSIDE it. */
  const cardBallpark = (() => {
    const at = hub.indexOf('data-game="ballpark"');
    if (at < 0) return "";
    const start = hub.lastIndexOf("<article", at);
    const end = hub.indexOf("</article>", at);
    return start < 0 || end < 0 ? "" : hub.slice(start, end);
  })();
  t("the hub carries a card for it, found by its id",
    cardBallpark.length > 0, cardBallpark.length + " chars");
  /* THE CARD, AS THE HUB REDESIGN OF 24 SEP 2026 MADE IT. It carried three
     links (a picture to the home, a Play today straight to the board, and
     its own Past puzzles) and each had a check here. The owner's decisions
     changed all three. The card is ONE link to the game's home, because a
     card must not start a clock. Previous dailies are ONE page for every
     game, /football/archive/, rather than ten links. So the checks follow the
     decisions rather than being deleted: one link, to the home, around the
     picture; the name on it; nothing on it that starts a board; and the
     archive reachable, proven by RUNNING the page the hub links to. */
  const links = [...cardBallpark.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  t("its card is ONE link, to its home",
    links.length === 1 && links[0] === "/football/ballpark/", links.join(" ") || "no link");
  t("and that link carries the picture and the name",
    /<a[^>]+href="\/football\/ballpark\/"[^>]*>[\s\S]*<img[\s\S]*Ballpark\s*XI[\s\S]*<\/a>/.test(cardBallpark));
  t("and nothing on it starts a board: a card must not start a clock",
    !cardBallpark.includes("?play=1"), "a plain compare: ? is a regex quantifier");
  {
    const { themeArchiveRoute } = await import("../../functions/_lib/archive-page.js");
    const page = await (await themeArchiveRoute({ env: {} }, "football")).text();
    t("and its archive is reachable from the hub's Browse previous dailies",
      hub.includes('href="/football/archive/"') && page.includes('href="/football/ballpark/archive/"'),
      "the hub links /football/archive/, and that page, run, lists Ballpark XI's archive");
  }    /* THE TABLE MOVED to shared/xi-played.js on 21 September 2026, out of
       index.html, because the full-time panel needs the same fact and a
       second copy is this project's oldest fault. The hub reads it now, so
       this asks the file that HOLDS the row rather than the file that uses
       it. The question is unchanged: the front door must be able to tell
       that this game was played today. */
    t("and a row in the played table, so the front door knows it was played today",
      /id: "ballpark",\s*key: "xibp\.results"/.test(readRoot("shared/xi-played.js")));
  t("it is in the sitemap, offered to a crawler", /football\/ballpark\//.test(sitemap));

  t("the archive route exists, because the hub links to it",
    hasRoot("functions/football/ballpark/archive/index.js"));
  t("and the permalink route, so a board has one address forever",
    hasRoot("functions/football/ballpark/daily/[[path]].js"));
  /* THE ROUTE FILE EXISTING IS NOT THE ROUTE RESOLVING. Who Am I launched with
     both files present and both 404ing, because permalink.js had no entry for
     it and the gate checked only that the file was there. */
  t("and permalink.js knows the game, or both of those 404",
    /ballpark:\s*\{\s*name:/.test(perma) && /ballpark:\s*"bp_schedule"/.test(perma));

  t("LAUNCHED records the day it began SERVING", /ballpark:\s*"2026-09-18"/.test(games),
    "not the day the line was added — a later date hides boards already run");
  t("it is in the server's game list", /"ballpark"/.test(games.slice(0, games.indexOf("];"))),
    "GAMES is whose rows the account system may write");
  t("and _headers knows its paths",
    readRoot("_headers").indexOf("/football/ballpark/css/*") > -1);
}

/* ============ THE GATE MUST NOT PASS ON NOTHING ============
 * Every rule above about the stylesheet is a prohibition, and a prohibition is
 * satisfied completely by an empty file. Measured across the family on 15
 * September 2026: five of nine gates passed with 0 failed on a game with no
 * stylesheet at all. The floors are far below the truth on purpose. */
{
  const pageHtml = fs.readFileSync(new URL("index.html", import.meta.url), "utf8");
  const ownCss = [...pageHtml.matchAll(/<link[^>]+href="([^"]+\.css)(?:\?[^"]*)?"/g)]
    .map((m) => m[1])
    .filter((h) => !h.startsWith("http") && !h.startsWith("/shared/"));
  t("the page loads a stylesheet of this game's own",
    ownCss.length > 0,
    ownCss.length ? ownCss.join(", ") : "none — every CSS rule above would check nothing");
  const missingCss = ownCss.filter((h) => !fs.existsSync(new URL(h, import.meta.url)));
  t("and every stylesheet it names is a file that exists",
    missingCss.length === 0, missingCss.join(", ") || `${ownCss.length} checked`);
  const cssBytes = ownCss
    .filter((h) => fs.existsSync(new URL(h, import.meta.url)))
    .map((h) => fs.readFileSync(new URL(h, import.meta.url), "utf8"))
    .join("\n");
  const rules = (cssBytes.match(/\{/g) || []).length;
  const tokens = (cssBytes.match(/var\(--/g) || []).length;
  t("the stylesheet this gate has been checking is actually there",
    rules >= 20, `${rules} rule(s)`);
  t("and it still takes its values from the family, rather than merely not fighting it",
    tokens >= 20, `${tokens} use(s) of var(--)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
