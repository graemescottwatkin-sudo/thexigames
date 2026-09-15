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
const LAST_SHIPPED = "v001";

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

  t("the ladder is the config's, not a second copy in the script",
    /CONFIG\.LADDER/.test(code) && !/stage:\s*[234],\s*cost:/.test(code),
    "the owner is play-testing what a substitution buys");

  t("the substitution count is derived from the ladder",
    /SUBS_PER_BOARD\(\)\s*\{[\s\S]*reduce/.test(config),
    "change a rung and it follows");

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

console.log("\nAnd it is NOT launched, which a launch must change deliberately");
{
  const chrome = readRoot("shared/xi-chrome.js");
  const hub = readRoot("index.html");
  const sitemap = readRoot("functions/sitemap.xml.js");

  t("it holds no shirt on the squad", !/name: "Who Am I XI"/.test(chrome),
    "a shirt is taken at LAUNCH, and only then");
  t("it is named nowhere on the hub", !/Who Am I/i.test(hub),
    "an unreleased game is named nowhere in served markup");
  t("it is not offered to a crawler", !/football\/whoami/.test(sitemap));
  t("and it has no archive route yet", !hasRoot("functions/football/whoami"),
    "the archive advertises boards, and there is nothing to advertise yet");

  /* THE OTHER HALF, so this block cannot pass by the game simply not existing:
     the things that ARE true now must stay true. */
  const games = readRoot("functions/_lib/games.js");
  t("but it IS in the server's game list, so a result has somewhere to go",
    /"whoami"/.test(games) && /whoami: "Who Am I XI"/.test(games));
  t("and its results key is the day, one a day",
    /"wa:" \+ d/.test(games));
  t("and _headers knows its paths",
    /\/football\/whoami\/css\/\*/.test(readRoot("_headers")));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
