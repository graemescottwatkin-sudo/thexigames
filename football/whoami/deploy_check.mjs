/* football/whoami/deploy_check.mjs — Who Am I XI's gate.
 *
 *   node football/whoami/deploy_check.mjs        (from anywhere)
 *
 * WHO AM I XI IS NOT LAUNCHED. It is in GAMES and BUILT — it has to be, or a
 * result cannot be banked and the endpoints have no game to belong to — and it
 * is named nowhere in served markup outside its own folder, holds no shirt, and
 * is absent from the hub and the sitemap. The block at the bottom refuses each
 * of those the moment it stops being true, so the game cannot go live by drift:
 * launching is a decision somebody makes, not something that happens because a
 * file was edited.
 *
 * WHAT THIS GAME'S GATE HAS THAT NO OTHER ONE DOES. Every other game in the
 * family hides ONE answer per board from ONE player. This one hides eleven, and
 * only one of them is spent per person per day — the other ten stay live for
 * everybody else. So the leak checks here are the point of the file rather than
 * a section of it, and they are about the CAREER as much as the name: a club
 * history is the answer written out.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");
const GAME = "football/whoami";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const has = (p) => fs.existsSync(path.join(DIR, p));
const read = (p) => fs.readFileSync(path.join(DIR, p), "utf8");
const readRoot = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const hasRoot = (p) => fs.existsSync(path.join(ROOT, p));

/* WHAT IS LIVE. Not a sentinel — a constant nothing moves is a comparison
   against nothing, which is the fault LAST_PRESENTED was retired for. Set on
   the first deploy, and never backwards after that. */
const LAST_SHIPPED = "v001m";
/* THE HALF THAT CARRIES THE LAW, and this gate shipped without it. A version
   number can only refuse a tag that goes BACKWARDS; it cannot see changed bytes
   under a tag that has not moved, which is the common case and the dangerous
   one. Codeword launched with both constants declared and READ NEITHER — a
   sentinel in its least visible form, a constant nothing reads rather than a
   constant nothing moves. This one was worse and quieter: the constant was not
   here at all, and post_deploy reported "LAST_SHIPPED_ASSETS undefined ->
   dea4aa99f808361d" and then wrote nothing, because there was no line to
   replace. A tool that reports a write it did not make is a green line over a
   gap. */
const LAST_SHIPPED_ASSETS = "ff4be38a514e245e";

console.log("Who Am I XI — gate\n");

console.log("The files exist and agree about their version");
{
  t("css and js are present", has("css/style.css") && has("js/game.js"));
  t("and the config, which both sides read", has("js/config.js"));
  const html = has("index.html") ? read("index.html") : "";
  const js = has("js/game.js") ? read("js/game.js") : "";
  const build = (js.match(/var BUILD = "([^"]+)"/) || [])[1] || "";
  t("BUILD is set in the script", !!build, build);
  /* EVERY ONE OF THIS GAME'S ASSETS CARRIES THE SAME TAG. The word search
     shipped with one ?v= left behind and the same URL then named different
     bytes for every browser holding it cached. */
  const own = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"?]+)\?v=([^"]+)"/g)];
  t("every asset on the page carries the build tag",
    own.length > 0 && own.every((m) => m[2] === build),
    own.map((m) => m[1] + "=" + m[2]).join(" "));
  t("the tag has not gone backwards",
    build >= LAST_SHIPPED, `now ${build}, live ${LAST_SHIPPED}`);

  /* CHANGED BYTES UNDER A TAG THAT HAS NOT MOVED. Normalised to LF because what
     ships is what is in git and a Windows checkout writes CRLF — a hash of the
     working tree otherwise answers a different question on each machine. */
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

  /* AN ORPHAN IS DEAD WEIGHT SHIPPED FOREVER; a missing tag is a broken page.
     QuickFire had board_file.js sitting in js/ with no script tag, and the
     reference check asked the opposite question and passed. */
  const named = new Set(own.map((m) => m[1]));
  const onDisk = [];
  for (const d of ["css", "js"]) {
    if (!has(d)) continue;
    for (const f of fs.readdirSync(path.join(DIR, d))) {
      if (/\.(css|js)$/.test(f)) onDisk.push(`${d}/${f}`);
    }
  }
  t("every css and js file in the folder is loaded by the page", (() => {
    const orphans = onDisk.filter((f) => !named.has(f));
    const missing = [...named].filter((f) => !onDisk.includes(f));
    if (orphans.length || missing.length) {
      console.log(`        orphans: ${orphans.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}`);
      return false;
    }
    return true;
  })());
}

console.log("\nNothing that ships is an answer");
{
  const html = read("index.html");
  const js = read("js/game.js");
  /* GUARDED — see the same note in the crossword's gate. An unguarded read
     here threw ENOENT when this game's CSS was moved, killing the gate before
     it could report the move. Red by crashing is still red, but the checks
     that would have named the cause never ran. */
  const css = has("css/style.css") ? read("css/style.css") : "";
  const config = read("js/config.js");
  const all = html + js + css + config;

  /* STRIPPED, because half this game's comments are about the answer not
     travelling and a check that read them would trip on its own explanation.
     This project's own rule, met in four files now. */
  const code = js.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

  t("no bank, no board and no schedule is committed in this folder", (() => {
    const FORBIDDEN = [/\.xlsx?$/i, /\.sql$/i, /\.zip$/i, /bank.*\.json$/i,
      /schedule.*\.json$/i, /players?.*\.json$/i];
    const walk = (d) => {
      for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) { if (walk(p)) return true; continue; }
        if (FORBIDDEN.some((re) => re.test(f))) { console.log("        " + f); return true; }
      }
      return false;
    };
    return !walk(DIR);
  })(), "3,146 careers, and a career is an answer written out");

  /* THE PAGE MUST NOT READ A CAREER OFF A BOARD. It legitimately renders one
     when a clue endpoint sends it, so the check is about the BOARD: nothing in
     the doors it draws may carry a player. */
  t("the page never reads a player id", !/player_id/.test(code),
    "a door is a club and a year");
  t("and never reads a name off the board",
    !/board[^.]*\.(?:answer|name)\b/.test(code) && !/doors?\[[^\]]*\]\.answer/.test(code));

  /* THE TYPE-AHEAD'S FOLD IS NOT A SECOND JUDGE. The page folds to MATCH what
     somebody is typing against the name list; it must not decide whether a
     guess is right, because deciding that needs the answer. */
  t("the page does not decide whether a guess is right", (() => {
    /* A comparison against the answer would have to name it. There is no answer
       on the page until the door closes, so the only safe shape is: send it. */
    return /\/api\/whoami\/guess/.test(code) &&
      !/===\s*fold\(\s*(?:door|answer|BOARD)/.test(code);
  })(), "the marking is the server's, including the near miss");

  t("no absolute or machine-specific paths",
    !/\/home\/|C:\\\\/.test(all) && !/\/Users\//.test(all));
  t("API calls are relative", !/fetch\("https?:\/\//.test(code));
  t("the board is fetched with the family CSRF header",
    /X-XI-Games/.test(code) && /\/api\/whoami\/daily/.test(code));
}

console.log("\nOne fact, one place");
{
  const js = read("js/game.js");
  const config = read("js/config.js");
  const code = js.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

  t("the eleven rule is stated once", (() => {
    const per = (config.match(/DOORS_PER_BOARD:\s*(\d+)/) || [])[1];
    if (per !== "11") return false;
    return !/(?:length|count|doors?)\s*(?:===|!==|<|>)\s*11\b/.test(code);
  })(), "DOORS_PER_BOARD in js/config.js, and nowhere else");

  /* THE PAGE HOLDS NEITHER THE LADDER NOR THE CURVE. Both arrive with the
     board, from functions/api/whoami/daily.js, which reads them from the game's
     own config and from the family's xi-score.js. The page needs them — to draw
     the prices and to tick a live "worth now" — and a copy here would agree
     today and disagree the first time anybody tuned one.
     A FALLBACK IS A COPY TOO. The first draft defaulted to a two-point curve if
     the server sent none, which would have shown every player a wrong number
     rather than no number. */
  t("the page takes the scoring rule from the server rather than holding one",
    /DATA\.scoring/.test(code) && !/114/.test(code) &&
    !/maxMinute|SCORE_BANDS/.test(code),
    "the curve and the prices arrive with the board");

  t("and draws the ladder from what arrived, not from its own config",
    /RULE\.ladder/.test(code) && !/points:\s*\d+\s*,/.test(code));

  t("the substitution count is derived from the ladder",
    /SUBS_PER_BOARD\(\)\s*\{[\s\S]*filter/.test(config),
    "change a rung and it follows");

  /* TWO SUBSTITUTIONS, AND GIVING UP IS NOT ONE. The third rung was "give up",
     borrowed from the family's bench-of-three without asking what a third would
     buy — and the answer was nothing: the spell, the career and the bio are
     everything this game knows about a player that is not his name. */
  t("there are two substitutions and giving up is not one of them",
    /GIVE_UP:/.test(config) &&
    (config.match(/points:\s*[1-9]/g) || []).length === 2,
    "leaving the pitch is not a clue you buy");

  /* THE SERVER READS THE GAME'S OWN CONFIG rather than keeping its own, the way
     qf-round.js reads QuickFire's bands. Two tables would agree the day they
     were written and disagree the first time anybody tuned one. */
  t("and the server reads that same file",
    /football\/whoami\/js\/config\.js/.test(readRoot("functions/_lib/wa-play.js")));

  t("progress is stored under this game's own prefix", (() => {
    const prefix = (js.match(/var PREFIX = "([^"]+)"/) || [])[1] || "";
    if (prefix !== "xiwa.") return false;
    return !/["'](?:fcw|xiws|xisc|xihl|xivw|xigd|xicw|qfx)\./.test(js);
  })(), "writing another game's prefix is what this check refuses");

  /* THE FOLD IS ONE FACT ON THE SERVER SIDE. The importer imports it rather
     than carrying a copy — two copies is a name that imports under one spelling
     and can never be typed, and they had already disagreed about O-slash. */
  t("the importer imports the fold rather than restating it",
    /import \{ fold \} from "\.\.\/functions\/_lib\/wadata\.js"/
      .test(readRoot("tools/import_whoami.mjs")));
}

console.log("\nThe shared layer is used, not copied");
{
  const html = read("index.html");
  /* GUARDED — see the same note in the crossword's gate. An unguarded read
     here threw ENOENT when this game's CSS was moved, killing the gate before
     it could report the move. Red by crashing is still red, but the checks
     that would have named the cause never ran. */
  const css = has("css/style.css") ? read("css/style.css") : "";
  t("the page loads the shared tokens, chrome and landing",
    /shared\/xi-tokens\.css/.test(html) && /shared\/xi-chrome\.css/.test(html) &&
    /shared\/xi-landing\.css/.test(html));
  t("and places the shared bar and footer",
    /class="xic-bar"/.test(html) && /class="xic-foot"/.test(html));
  t("the game defines no .xic- rule of its own", !/\.xic-/.test(css));
  t("and restates no shared class", !/\.sr-only\s*\{/.test(css),
    "shared/xi-landing.css already defines it");
  t("it resets the body margin, so it does not sit in a gutter",
    /body\s*\{[^}]*margin:\s*0/.test(css));
  t("no token is redefined", !/--(?:paper|ink|pitch|gold|line)\s*:/.test(css));
}

console.log("\nIt counts plays and banks results, like every built game");
{
  const code = read("js/game.js").replace(/\/\*[\s\S]*?\*\//g, " ");
  t("it starts and ends a play", /XIPlays\.start/.test(code) && /XIPlays\.end/.test(code));
  t("it banks a result to the account", /\/api\/account\/migrate/.test(code),
    "QuickFire shipped playable and banked nothing for a day");
  t("and tells the season which day was played", /XISeason/.test(code));
  /* ONE RESULT A DAY, NOT ELEVEN, which is the owner's exception of 11 Sep
     2026: this game's eleven are the CLUBS. */
  t("a run is counted as one door rather than eleven",
    /total:\s*1\b/.test(code),
    "the eleven are the clubs, and a person plays one of them");
}

console.log("\nAnd it IS launched, which every one of these makes true");
{
  /* THIS BLOCK USED TO ASSERT THE OPPOSITE, and that was its job: while the
   * game was dark it refused the squad entry, the hub mention, the sitemap
   * line and the archive route, so it could not go live by drift — by a stray
   * edit, by a sweep that touched every game, or by somebody adding a row to a
   * list because the other ten had one.
   *
   * Launching is the deliberate act that turns them round. It is written this
   * way rather than deleted because the list of things a launch must include IS
   * the list of things that were refused, and a game that half-launches — named
   * on the hub, absent from the sitemap — is a game nobody can find twice.
   */
  const chrome = readRoot("shared/xi-chrome.js");
  const hub = readRoot("index.html");
  const sitemap = readRoot("functions/sitemap.xml.js");
  const games = readRoot("functions/_lib/games.js");

  t("it wears the ninth shirt", /n: 9,[^}]*name: "Who Am I XI"/.test(chrome),
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

  t("the hub names it, now that it is out", /Who Am I XI/.test(hub));
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
  const cardWhoami = (() => {
    const at = hub.indexOf('data-game="whoami"');
    if (at < 0) return "";
    const start = hub.lastIndexOf("<article", at);
    const end = hub.indexOf("</article>", at);
    return start < 0 || end < 0 ? "" : hub.slice(start, end);
  })();
  t("the hub carries a card for it, found by its id",
    cardWhoami.length > 0, cardWhoami.length + " chars");
  /* THE PICTURE, AND NOT MERELY A LINK TO THE HOME PAGE. Written as
     `card.includes('href="/football/whoami/"')` first, which the TITLE link
     satisfies just as well — so replacing the picture with a dead span left
     this green under a name that says "picture". Proven by sabotage on
     17 Sep 2026. It now demands an anchor to the home that WRAPS THE IMAGE. */
  t("and gives it a card whose picture opens its home",
    /<a[^>]+href="\/football\/whoami\/"[^>]*>\s*<img/.test(cardWhoami));
  t("and a Play today that goes to the board, not back to the home page",
    cardWhoami.includes('href="/football/whoami/?play=1"'),
    "a plain compare, not a pattern: the ? in ?play=1 is a regex quantifier and "
    + "was silently eaten writing this check, which then passed on the wrong thing");
  t("and the play link names the game, for a screen reader",
    /Play[\s\S]{0,120}Who\s*Am\s*I\s*XI/.test(cardWhoami) || cardWhoami.includes('aria-label="Play Who Am I XI today"'));
  t("and an archive to open",
    cardWhoami.includes('href="/football/whoami/archive/"'))    /* THE TABLE MOVED to shared/xi-played.js on 21 September 2026, out of
       index.html, because the full-time panel needs the same fact and a
       second copy is this project's oldest fault. The hub reads it now, so
       this asks the file that HOLDS the row rather than the file that uses
       it. The question is unchanged: the front door must be able to tell
       that this game was played today. */
    t("and a row in the played table, so the front door knows it was played today",
      /id: "whoami",\s*key: "xiwa\.results\.v1"/.test(readRoot("shared/xi-played.js")));

  t("it is in the sitemap, offered to a crawler", /football\/whoami/.test(sitemap));

  /* THE ROUTES THE CARD LINKS TO. A launch that names a game on the hub and
     leaves its archive a 404 is worse than no launch: the link is the promise. */
  t("the archive route exists, because the hub links to it",
    hasRoot("functions/football/whoami/archive/index.js"));
  t("and the permalink route, so a board has one address forever",
    hasRoot("functions/football/whoami/daily/[[path]].js"));

  t("LAUNCHED records the day, which is what board numbers count from",
    /whoami: "2026-09-18"/.test(games));

  /* AND THE THINGS THAT WERE ALREADY TRUE STAY TRUE, so this block cannot pass
     by the game quietly ceasing to exist. */
  t("it is still in the server's game list", /"whoami"/.test(games) &&
    /whoami: "Who Am I XI"/.test(games));
  t("its results key is still the day, one a day", /"wa:" \+ d/.test(games));
  t("and _headers still knows its paths",
    /\/football\/whoami\/css\/\*/.test(readRoot("_headers")));
}


/* ============ THE GATE MUST NOT PASS ON NOTHING ============
 *
 * EVERY RULE ABOUT THIS STYLESHEET IS A PROHIBITION — no .xic- rule, no
 * restated shared class, no redefined token — and a prohibition is satisfied
 * completely by an empty file. Measured on 15 September 2026: emptying
 * css/style.css and moving the build tag so the asset hash could not be the
 * thing that caught it, five of the nine gates passed with 0 failed. Codeword
 * passed 60 of 60. The page would have shipped with no styling at all and
 * every check would have agreed it was correct.
 *
 * The general form, which is what makes these one bug rather than several:
 * A GATE BUILT ENTIRELY OUT OF PROHIBITIONS PASSES ON AN EMPTY INPUT. It is
 * the same fault as a grep that skipped a binary file, a verifier that skipped
 * an unparseable board, and a historyClash with no day to examine — a check
 * whose input is absent must not report a pass. Reported in this form by the
 * Connection session, which found it in its own design-law gate, and
 * reproduced here against all nine before it was believed.
 *
 * TWO CHECKS, AND THE SECOND IS THE ONE WITHOUT A HOLE. The first is a
 * liveness floor: the file must actually hold rules. The second asserts what
 * the family law has only ever said in the negative — that a game CONSUMES
 * shared tokens. A stylesheet can be long, clean, literal-free and have
 * stopped taking a single value from the family, and nothing here noticed.
 * A check shaped as presence has no empty-input hole by construction.
 *
 * THE FLOORS ARE DELIBERATELY FAR BELOW THE TRUTH. The smallest stylesheet in
 * the family holds 90 rules and 94 token uses; the largest holds 766 and 617.
 * Twenty is low enough that ordinary editing can never reach it, because a
 * threshold near the truth fails during normal work, gets raised until it
 * means nothing, and is then still there looking like a guard. It is not
 * measuring craft. It is refusing an empty string. */
{
  /* ASK THE PAGE WHAT TO CHECK, rather than trusting a constant in here.
     The first version of this block read css/style.css by name. That catches
     an empty or truncated stylesheet and not the likelier accident: the
     game's CSS is renamed or moved, a stale style.css is left behind with
     real content in it, and the gate goes on examining a file nobody serves —
     every prohibition green, every floor green, honestly answering about the
     wrong input, forever. Predicted by the Connection session from the shape
     alone rather than found by being bitten, and confirmed here: with the
     page moved to css/main.css and style.css deleted, this block did not
     refuse, it THREW ENOENT — which is red, but red by crashing, and a crash
     mid-gate is not a verdict.
     So the file under test is whatever index.html actually loads. Fonts and
     the shared layer are somebody else's; what is left is this game's own. */
  const pageHtml = fs.readFileSync(new URL("index.html", import.meta.url), "utf8");
  const ownCss = [...pageHtml.matchAll(/<link[^>]+href="([^"]+\.css)(?:\?[^"]*)?"/g)]
    .map((m) => m[1])
    .filter((h) => !h.startsWith("http") && !h.startsWith("/shared/"));
  t("the page loads a stylesheet of this game's own",
    ownCss.length > 0,
    ownCss.length ? ownCss.join(", ") : "none — every CSS rule below would check nothing");
  /* A NAMED FILE THAT IS NOT THERE IS A REFUSAL, not an exception. */
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
    rules >= 20, `${rules} rule(s) — every other rule about this file is a`
      + " prohibition, and an empty file breaks none of them");
  t("and it still takes its values from the family, rather than merely not fighting it",
    tokens >= 20, `${tokens} use(s) of var(--) — said in the positive, because`
      + " a rule that forbids cannot notice an absence");
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
