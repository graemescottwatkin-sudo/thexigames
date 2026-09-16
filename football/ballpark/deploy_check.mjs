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
const LAST_SHIPPED = "v001b";
/* THE HALF THAT CARRIES THE LAW. A version number can only refuse a tag that
   goes BACKWARDS; it cannot see changed bytes under a tag that has not moved,
   which is the common case and the dangerous one.
   NULL UNTIL THE FIRST POST-DEPLOY, AND NOT ZEROES. Sixteen zeroes would be a
   constant nothing moves — the sentinel fault Codeword's gate was criticised
   for having written directly beneath a comment forbidding it. null is the
   shape tools/post_deploy.mjs recognises and overwrites with the real hash of
   the bytes it has just confirmed live, and until then the tag comparison
   above carries the law on its own because the tree is ahead of live. */
const LAST_SHIPPED_ASSETS = null;

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
  const code = read("js/game.js").replace(/\/\*[\s\S]*?\*\//g, " ");
  /* THE BANKING CHAIN, five links, and this estate has broken a different one
     in each of four launches. Ballpark reached launch having never banked at
     all — correctly, while it was outside GAMES — so every link here is new
     and none of it has ever run in production. */
  t("it starts and ends a play", /XIPlays\.start/.test(code) && /XIPlays\.end/.test(code));
  t("it records a result of its own", /function recordResult/.test(code));
  t("and the record carries the DAY, not only the board number", /day:\s*day/.test(code),
    "playedOn reads the day and results.js orders by it — a row without one sorts as null");
  t("it banks that result to the account", /\/api\/account\/migrate/.test(code),
    "QuickFire shipped playable and banked nothing for a day; Codeword recorded and never pushed");
  t("and it asks the SERVER who is signed in, not the chrome",
    /\/api\/auth\/session/.test(code),
    "XIChrome.account() is an object and the event carries {type,user,via} — three games read the wrong one");
}

console.log("\nAnd it IS launched, which every one of these makes true");
{
  const chrome = readRoot("shared/xi-chrome.js");
  const hub = readRoot("index.html");
  const sitemap = readRoot("functions/sitemap.xml.js");
  const games = readRoot("functions/_lib/games.js");
  const perma = readRoot("functions/_lib/permalink.js");

  t("it wears the tenth shirt", /n: 10,[^}]*name: "Ballpark XI"/.test(chrome),
    "a launched game takes the next free number");
  t("and every slot is a launched name or a status, never both", (() => {
    const rows = [...chrome.matchAll(/\{\s*n:\s*(\d+),([^}]*)\}/g)];
    if (rows.length !== 11) return false;      // eleven shirts, never a twelfth
    return rows.every(([, , body]) => /name:/.test(body) !== /status:/.test(body));
  })(), "an unreleased game is named nowhere until it launches");

  t("the hub names it, now that it is out", /Ballpark XI/.test(hub));
  t("and gives it a card that can be played and an archive to open",
    /href="\/football\/ballpark\/"[^>]*aria-label="Play Ballpark XI today"/.test(hub) &&
    /href="\/football\/ballpark\/archive\/"/.test(hub));
  t("and a row in the hub's table, so the front door knows it was played today",
    /id: "ballpark"[\s\S]*?key: "xibp\.results"/.test(hub));
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

  t("LAUNCHED records the day it began SERVING", /ballpark:\s*"2026-08-26"/.test(games),
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
