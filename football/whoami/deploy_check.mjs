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
const LAST_SHIPPED = "v001e";
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
const LAST_SHIPPED_ASSETS = "cf6b47f5428394a2";

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
  const css = read("css/style.css");
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
  const css = read("css/style.css");
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
    const rows = [...chrome.matchAll(/\{\s*n:\s*(\d+),([^}]*)\}/g)];
    if (rows.length !== 11) return false;      // eleven shirts, never a twelfth
    return rows.every(([, , body]) => /name:/.test(body) !== /status:/.test(body));
  })(), "an unreleased game is named nowhere until it launches");

  t("the hub names it, now that it is out", /Who Am I XI/.test(hub));
  t("and gives it a card that can be played and an archive to open",
    /href="\/football\/whoami\/"[^>]*aria-label="Play Who Am I XI today"/.test(hub) &&
    /href="\/football\/whoami\/archive\/"/.test(hub));
  t("and a row in the hub's table, so the front door knows it was played today",
    /id: "whoami"[\s\S]*key: "xiwa\.results\.v1"/.test(hub));

  t("it is in the sitemap, offered to a crawler", /football\/whoami/.test(sitemap));

  /* THE ROUTES THE CARD LINKS TO. A launch that names a game on the hub and
     leaves its archive a 404 is worse than no launch: the link is the promise. */
  t("the archive route exists, because the hub links to it",
    hasRoot("functions/football/whoami/archive/index.js"));
  t("and the permalink route, so a board has one address forever",
    hasRoot("functions/football/whoami/daily/[[path]].js"));

  t("LAUNCHED records the day, which is what board numbers count from",
    /whoami: "2026-09-15"/.test(games));

  /* AND THE THINGS THAT WERE ALREADY TRUE STAY TRUE, so this block cannot pass
     by the game quietly ceasing to exist. */
  t("it is still in the server's game list", /"whoami"/.test(games) &&
    /whoami: "Who Am I XI"/.test(games));
  t("its results key is still the day, one a day", /"wa:" \+ d/.test(games));
  t("and _headers still knows its paths",
    /\/football\/whoami\/css\/\*/.test(readRoot("_headers")));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
