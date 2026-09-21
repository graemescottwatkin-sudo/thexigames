/* grid/deploy_check.mjs — the gate Grid XI ships through.
 *
 * Run from the repository root, with no node_modules, no package.json and no
 * .wrangler in the tree. Those are checked, because a gate that passes on a
 * machine with build state and fails on Pages has told you nothing.
 *
 *   node football/grid/deploy_check.mjs        expect 0 failed
 *
 * THE TAG LAW. LAST_SHIPPED is what is LIVE, and LAST_SHIPPED_ASSETS is a hash
 * of the bytes it names. A tag is burned the moment it ships and never goes
 * backwards. Equal to LAST_SHIPPED is the RESTING state and passes — the tree
 * is what is live. What carries the law is the pair below it: if the bytes
 * changed the tag must have moved, and if they did not it must not have.
 *
 * WHAT THIS GATE IS FOR THAT THE OTHER SIX ARE NOT. Every game in this family
 * has a secret, and in every other one the secret is a WORD. Here the secret is
 * the whole board: the grid starts EMPTY, so every letter in it is an answer,
 * and one board handed over is one board solved. So the checks below are
 * weighted accordingly — three of them execute the real projection against the
 * real sample and refuse if a single answer, or a stray capital, survives the
 * trip to a browser.
 *
 * WHAT IT CANNOT SEE. It reads shape, not truth. The boards are gated twice
 * before they reach D1 — by the emitter and by tools/import_grid.js — and a
 * green gate here is a well-formed release, not a correct one.
 *
 * GRID XI IS NOT LAUNCHED. It is in BUILT and not in GAMES, exactly where
 * QuickFire is, which is why this file also refuses the things a launch would
 * have to change deliberately rather than by drift.
 */
/* The football hub moved to football/index.html on 21 Sep 2026, when the
   root became the theme picker. Asked, never assembled: see permalink.js. */
import { themeHubFile } from "../../functions/_lib/permalink.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (p) => fs.existsSync(path.join(ROOT, p));

/* WHAT IS LIVE. Bump both after a deploy with tools/post_deploy.mjs, which
   derives them from the live page rather than trusting anyone's memory.
   v000z is the day before a first release: not v000, which aligned_test
   refuses as a sentinel, and below v001 so the first ship moves past it. */
const LAST_SHIPPED = "v002k";
const LAST_SHIPPED_ASSETS = "07eacb0f488199dd";

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}

const html = read("football/grid/index.html");
const js = read("football/grid/js/game.js");

/* The bytes this game ships, hashed together — the same hash the other gates
   and post_deploy compute: discovered from the page, name, NUL, bytes, in a
   stable order, and normalised to LF because what ships is what is in git. */
function ownAssetHash() {
  const paths = [...html.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)\?v=[^"]*"/g)]
    .map((m) => m[1]).sort();
  if (!paths.length) return null;
  const h = crypto.createHash("sha256");
  for (const p of paths) {
    if (!has("football/grid/" + p)) return null;
    h.update(p); h.update("\0");
    h.update(fs.readFileSync(path.join(ROOT, "football", "grid", p), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 16);
}

console.log("The tag law");
const tag = (html.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1];
t("asset URLs carry a build tag so a cached copy cannot be reused", !!tag, tag);
t("LAST_SHIPPED is a real version, not a sentinel",
  !!LAST_SHIPPED && LAST_SHIPPED !== "v000", `shipped ${LAST_SHIPPED}`);
t("the build tag never goes backwards", tag >= LAST_SHIPPED,
  `now ${tag}, live ${LAST_SHIPPED}`);
const nowHash = ownAssetHash();
/* THE PAIRING, with the one honest exception: nothing has shipped, so there is
   no hash to compare against and no claim to make. Written as null rather than
   as a made-up value, because a constant that stands for nothing is the
   sentinel fault — and the moment the first release records a hash, this
   becomes the check it is on every other game. */
t("the game's own assets cannot change without its build tag moving",
  LAST_SHIPPED_ASSETS === null
    ? !!nowHash
    : (nowHash === LAST_SHIPPED_ASSETS ? tag === LAST_SHIPPED : tag > LAST_SHIPPED),
  LAST_SHIPPED_ASSETS === null
    ? `nothing shipped yet; this tree hashes to ${nowHash}`
    : (nowHash === LAST_SHIPPED_ASSETS ? "unchanged since the last ship" : `changed, and the tag moved ${LAST_SHIPPED} -> ${tag}`));
t("the build tag matches the one the script reports",
  (js.match(/var BUILD = "([^"]+)"/) || [])[1] === tag, tag);
t("every asset the page pulls carries the same tag", (() => {
  const tags = [...html.matchAll(/(?:css|js)\/[a-z_]+\.(?:css|js)\?v=(v[0-9a-z]+)"/g)].map((m) => m[1]);
  return tags.length > 0 && tags.every((x) => x === tag);
})());
t("every relative file reference resolves, exact case", (() => {
  const refs = [...html.matchAll(/(?:src|href)="(?!data:|#|https?:|mailto:|\/)([^"?]+)"?/g)]
    .map((m) => m[1].split("?")[0]).filter((r) => !r.endsWith("/"));
  return refs.every((r) => fs.existsSync(path.join(HERE, r)));
})());

console.log("\nThe tree is clean enough to be Pages");
for (const junk of ["node_modules", "package.json", "package-lock.json", ".wrangler"]) {
  t(`no ${junk} in the repository root`, !has(junk));
}
t("no forbidden files in the game folder", (() => {
  const bad = fs.readdirSync(path.join(ROOT, "football", "grid"))
    .filter((f) => /\.(zip|sql|bak)$/i.test(f) || f.endsWith(".json"));
  return bad.length === 0;
})(), "a bank or a zip in a served folder is the answer key on the web");
t("no board source is served from the game folder",
  !has("football/grid/boards") && !has("football/grid/bank"));
t("the production SQL is not in the tree, or is gitignored",
  !has("data/gd-production.sql") || read(".gitignore").includes("data/gd-production.sql"),
  "568kB of answers");

console.log("\nTHE ANSWERS DO NOT REACH A BROWSER");
/* EXECUTED, not pattern-matched, and against the real sample. A regex cannot
   tell what a function returns; calling it can. This is the check the whole
   game is arranged around, so it is asked three ways: no whole answer, no
   stray letter, and no field that could carry one next year. */
const { publicBoard, publicText, boardToken } = await import("../../functions/_lib/gd-board.js");
const { GD_SAMPLE_BOARDS } = await import("../../functions/_lib/gd-sample.js");
const sample = GD_SAMPLE_BOARDS[0];
const pub = publicBoard(sample, boardToken(sample.id));
const text = publicText(sample, boardToken(sample.id));
t("not one answer survives the projection", (() => {
  const leaked = sample.entries.filter((e) => e.answer && text.includes(e.answer));
  return leaked.length === 0;
})(), `${sample.entries.length} answers withheld`);
t("and not a letter of one, in any field", (() => {
  /* Every string a board legitimately carries is removed first; what is left
     is anything that should not be there at all. */
  const stripped = text
    .replace(/"(token|id|title|dir|cell|entries|crossings|rows|cols|len|n|r|c)"/g, "")
    .replace(/"gd:[^"]*"/g, "")
    .replace(new RegExp('"' + sample.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"', "g"), "")
    .replace(/"(across|down)"/g, "");
  return !/[A-Z]{2,}/.test(stripped);
})());
t("a public entry carries no field beyond the shape", (() => {
  /* `breaks` WAS ADDED HERE ON PURPOSE, and this list is the reason it had to
     be: publicBoard is a whitelist, so a field added to the stored board stays
     invisible to the client until somebody widens both deliberately. That is
     what has kept every letter of every answer on the server side.
     WHAT IT IS: the zero-based letter offsets into the answer at which a new
     WORD begins. LEWISSKELLY is eleven letters with nothing to say the name is
     Lewis-Skelly, which the owner hit playing day one.
     IT IS A DISCLOSURE AND A DELIBERATE ONE — knowing an eleven-letter answer
     breaks after five is a real hint, and it is the hint that was asked for.
     This line is where to argue with it if that ever stops being wanted. */
  const allowed = ["n", "dir", "r", "c", "len", "cells", "breaks"];
  return pub.entries.every((e) => Object.keys(e).every((k) => allowed.includes(k)));
})(), "`answer` and `member` must never be here");
/* AND WHAT breaks MAY CONTAIN, proved by executing the projection rather than
   by reading it. Integers only, inside the entry's own length, in order. A
   string arriving in this field would be the leak the whole projection exists
   to prevent wearing a numeric name, and the letter check above strips the
   field NAME rather than its contents. */
/* ASKED OF A BOARD THAT ACTUALLY BREAKS. Written against GD_SAMPLE_BOARDS[0]
   first, whose eleven entries are all single words: every array came back
   empty and every() over nothing is true, so the check passed without ever
   looking at an offset. The sample carries a second board precisely because
   one board cannot show both states, and the one with breaks is found here
   rather than indexed, so a regenerated sample cannot silently reorder it
   back to vacuous. If NEITHER board has one, that is said out loud instead of
   passing quietly. */
const brkBoard = GD_SAMPLE_BOARDS.find((bd) =>
  (bd.entries || []).some((e) => (e.breaks || []).length));
const brkPub = brkBoard ? publicBoard(brkBoard, boardToken(brkBoard.id)) : null;
t("and breaks carry offsets, never letters", (() => {
  if (!brkPub) return false;
  return brkPub.entries.every((e) =>
    Array.isArray(e.breaks) &&
    e.breaks.every((k) => Number.isInteger(k) && k > 0 && k < e.len) &&
    e.breaks.every((k, i) => i === 0 || k > e.breaks[i - 1])) &&
    brkPub.entries.some((e) => e.breaks.length);
})(), brkPub
  ? `${brkBoard.id}: ${JSON.stringify(brkPub.entries.map((e) => e.breaks))}`
  : "no sample board carries a break — this check can prove nothing");
t("nothing is given at the start, so a board opens on its title alone",
  !("given" in pub) && !("opening" in pub),
  "the owner's ruling, 6 Sep 2026");

console.log("\nThe page cannot mark a guess");
const stripComments = (src) => {
  let out = "";
  for (let k = 0; k < src.length; k++) {
    if (src[k] === "/" && src[k + 1] === "*") {
      const end = src.indexOf("*/", k + 2); if (end < 0) break; k = end + 1; continue;
    }
    out += src[k];
  }
  return out;
};
const code = stripComments(js);
t("every guess goes up to be marked", /\/api\/grid\/|api\("guess"/.test(code));
/* THE RULE FILE IS SHARED WITH THE WORKER, and that is safe: the algorithm is
   public and the answer is not. What would NOT be safe is the page calling
   mark(), which needs an answer — so it must not, and this says so of the
   stripped source rather than of a comment that mentions it. */
t("and the page never calls the marker itself",
  !/\bR\.mark\(|XIGR_RULES\.mark\(/.test(code),
  "mark() needs an answer; the browser has none");
t("the CSRF header is the family's", /"X-XI-Games"/.test(code));
t("the rules the page draws with are the module the server imports",
  /js\/rules\.js/.test(html) &&
  read("functions/_lib/gd-board.js").includes("football/grid/js/rules.js"));

console.log("\nIt is part of the family");
t("the page loads the shared tokens before the shared chrome", (() => {
  const tok = html.indexOf("xi-tokens.css"), chr = html.indexOf("xi-chrome.css");
  return tok > -1 && chr > -1 && tok < chr;
})());
t("it defines no .xic- rules of its own", (() => {
  return stripComments(read("football/grid/css/style.css")).indexOf(".xic-") === -1;
})());
t("the shared layer is on the shared tag, not this game's", (() => {
  const shared = [...html.matchAll(/\/shared\/[a-z-]+\.(?:css|js)\?v=(v\d+)"/g)].map((m) => m[1]);
  return shared.length > 0 && shared.every((x) => x === shared[0] && x !== tag);
})());

console.log("\nAnd it IS launched, which is a thing to state rather than assume");
/* THESE WERE THE REFUSALS. Until 7 September 2026 this block asserted the
   opposite of every line below — not in GAMES, no shirt, named nowhere but
   its own page — so that the game could not go live by drift. Launching was
   the deliberate edit they existed to demand, and they are the assertions
   that it was made COMPLETELY: a launch half done is a game whose results
   nobody may write, or whose shirt nobody can see. */
const games = read("functions/_lib/games.js");
t("grid is in BUILT, so a round can have a play id",
  /"quickfire", "grid"|"grid", "quickfire"/.test(games));
t("and in GAMES, so its results are the account's to carry",
  games.slice(games.indexOf('export const GAMES ='), games.indexOf('];')).indexOf('"grid"') > -1,
  "a game people can play whose rows nobody may write is half a launch");
t("and has a launch day, which is what every list counts from",
  /grid: "[0-9]{4}-[0-9]{2}-[0-9]{2}"/.test(games),
  "boardKeys, the archive index and the sitemap all start there");
/* FOOTBALL'S SQUAD, NOT EVERY SQUAD. This sliced from `var SQUAD` to
   `var PAGES`, which is the whole SQUADS map — both themes — and the rules
   below are about who wears which FOOTBALL shirt. It was harmless only while
   football was the sole theme with entries in it.
   It failed on 21 September 2026, the first time a second theme had an
   unsigned slot: the Friends crossword launched UNLISTED, its slot carries a
   shirt number and a status and no name, and this read that as a football game
   in testing sitting on shirt 1 — at or below Grid's six — and refused a squad
   that was entirely correct. A shirt is a TEAM's, and comparing two teams'
   numbers is comparing nothing. */
const squad = (() => {
  const s = read("shared/xi-chrome.js");
  const at = s.indexOf("football: [");
  if (at < 0) return "";
  let depth = 0;
  for (let i = s.indexOf("[", at); i < s.length; i++) {
    if (s[i] === "[") depth++;
    else if (s[i] === "]" && --depth === 0) return s.slice(at, i);
  }
  return "";
})();
/* SAID IN THE POSITIVE, because every rule below is a prohibition and all of
   them pass on an empty string. The slice must have found the football squad
   AND must be narrower than the file it came from — a slice that silently
   returned everything is the bug being fixed here wearing a different hat. */
t("PRECONDITION: the football squad was found, and it is not the whole map", (() => {
  const whole = read("shared/xi-chrome.js");
  return squad.length > 200 && squad.length < whole.length &&
         !/friends:/.test(squad) && /name: "Grid XI"/.test(squad);
})(), `${squad.length} chars, football only`);
t("it wears the sixth shirt", /n: 6,[^}]*name: "Grid XI"/.test(squad),
  "a launched game takes the next free number");
/* AND THE TAIL MOVED DOWN, which is the rule rather than a fact about any one
   game. This asserted `n: 7 ... "In testing"` — true on 7 September, when the
   seven was the next unsigned slot behind Grid. Codeword XI launched on
   14 September and took it, so the seven now carries a NAME and the unsigned
   games are one place further down. Pinning the assertion to whoever happened
   to be sitting at seven made it a fact about QuickFire's position rather than
   about the rule, and it went red the moment the rule was obeyed. What is
   asserted now is the rule: no unlaunched game holds a number at or below
   Grid's, and the shirts below it are unsigned or named by a launched game. */
t("and no game in testing sits on a shirt at or below Grid's", (() => {
  /* ENTRY BY ENTRY, because scanning misreads the roster. The first version
     swept the text for `n: (\d+),[^}]*status:` and read the eleventh shirt as
     the first — `n: 11` matched as `n: 1` once the scan drifted across an entry
     boundary — so it reported an unsigned game sitting on shirt one and failed
     a squad that was correct. A check that cannot parse the thing it judges
     fails honest data, which is how a check gets deleted rather than fixed. */
  return squad.split("{").slice(1).every((entry) => {
    const n = Number((entry.match(/n:\s*(\d+)\s*,/) || [])[1]);
    if (!Number.isInteger(n)) return true;
    return n > 6 || !/status:/.test(entry.split("}")[0]);
  });
})(), "a game that is not out does not hold a shirt, and moves when one ships past it");
t("its own page still says its name", /Grid XI/.test(html));
t("and the hub says it too, now that it is out", (() => {
  const hub = read(themeHubFile("football"));
  return /Grid XI/.test(hub) && /id="shirt6"/.test(hub);
})(), "the front door is where a launch is visible");


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
