#!/usr/bin/env node
/* friends/crossword/deploy_check.mjs — the Friends crossword's gate.
 *
 * ONE GATE PER GAME, and the deploy sequence's list is the directory rather
 * than a number written anywhere. This is the first gate outside football/, so
 * the sweep is `for %g in (football\*, friends\*)` or, better, the output of
 * `dir *\*\deploy_check.mjs` — a count in a document is a measurement wearing
 * a law's clothes, and this project has been bitten by that one four times.
 *
 * THE TAG LAW. LAST_SHIPPED is what is LIVE and LAST_SHIPPED_ASSETS is a hash
 * of the bytes it names. A tag never goes backwards. Equal to LAST_SHIPPED is
 * the RESTING state and passes — the tree is what is live — and the paired
 * asset hash is the half that carries the law: changed bytes under a tag that
 * has not moved are refused.
 *
 * NOTHING HAS SHIPPED YET, so LAST_SHIPPED_ASSETS is null and says so, rather
 * than holding a made-up value. A constant that stands for nothing is the
 * sentinel fault, which is why LAST_PRESENTED was retired in v001v.
 *
 * AND MOST OF THIS FILE IS ABOUT NOT BEING LAUNCHED. Grid XI's gate refuses the
 * things a LAUNCH would have to change, so a game cannot go live by drift; this
 * one does the same and has one more to refuse, because Friends is the first
 * game of the second THEME. The launch checklist is therefore readable as the
 * list of assertions below that mention LAUNCHED — each one flips on the day.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { publicPuzzle } from "../../functions/_lib/puzzle.js";
import { LAUNCHED, GAMES } from "../../functions/_lib/games.js";
import { THEME_OF, SLUG_OF, gamePath, gameDir } from "../../functions/_lib/permalink.js";
import { makeBoard, answersOf } from "./fixture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (p) => fs.existsSync(path.join(ROOT, p));

const GAME = "crossword_fr";
const DIR = "friends/crossword";

/* WHAT IS LIVE. Bump both after a deploy with tools/post_deploy.mjs, which
   derives them from the live page rather than trusting anyone's memory.
   v000z is the day before a first release: not v000, which aligned_test
   refuses as a sentinel, and below v001 so the first ship moves past it. */
const LAST_SHIPPED = "v000z";
const LAST_SHIPPED_ASSETS = null;

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}

const html = read(DIR + "/index.html");
const js = read(DIR + "/js/game.js");
const css = read(DIR + "/css/style.css");
const launched = !!LAUNCHED[GAME];

/* EVERY GREP ABOUT WHAT THE PAGE LOADS READS `markup`, NOT `html`. A comment is
   not markup a browser acts on, and letting one answer a question about script
   tags fails in BOTH directions: the season check below failed on its own
   explanatory comment, which is loud and gets fixed — and the mirror, a comment
   SATISFYING a check that meant to demand a real tag, passes quietly and is the
   one that ships. `html` is kept only for questions about the file's bytes.
   noComments() is the same rule for the script files this gate reads. */
const markup = html.replace(/<!--[\s\S]*?-->/g, "");
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/* ---- the tag law -------------------------------------------------------- */

console.log("The tag law");

function ownAssetHash() {
  const paths = [...markup.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)\?v=[^"]*"/g)]
    .map((m) => m[1]).sort();
  if (!paths.length) return null;
  const h = crypto.createHash("sha256");
  for (const p of paths) {
    if (!has(DIR + "/" + p)) return null;
    h.update(p); h.update("\0");
    /* NORMALISED TO LF, because what ships is what is in git and a Windows
       checkout writes CRLF — a hash of the working tree would otherwise answer
       a different question on each machine. Six places in this repo do this
       and any seventh must too; this is the seventh. */
    h.update(fs.readFileSync(path.join(ROOT, DIR, p), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 16);
}

const tag = (markup.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1];
t("asset URLs carry a build tag so a cached copy cannot be reused", !!tag, tag);
t("LAST_SHIPPED is a real version, not a sentinel",
  !!LAST_SHIPPED && LAST_SHIPPED !== "v000", `shipped ${LAST_SHIPPED}`);
t("the build tag never goes backwards", tag >= LAST_SHIPPED,
  `now ${tag}, live ${LAST_SHIPPED}`);

const nowHash = ownAssetHash();
t("the game's own assets cannot change without its build tag moving",
  LAST_SHIPPED_ASSETS === null
    ? !!nowHash
    : (nowHash === LAST_SHIPPED_ASSETS ? tag === LAST_SHIPPED : tag > LAST_SHIPPED),
  LAST_SHIPPED_ASSETS === null
    ? `nothing shipped yet; this tree hashes to ${nowHash}`
    : (nowHash === LAST_SHIPPED_ASSETS ? "unchanged since the last ship"
                                       : `changed, ${LAST_SHIPPED} -> ${tag}`));
t("the build tag matches the one the script reports",
  (js.match(/var BUILD = "([^"]+)"/) || [])[1] === tag, tag);
t("every asset the page pulls from this game carries the same tag", (() => {
  const tags = [...markup.matchAll(/(?:css|js)\/[a-z_]+\.(?:css|js)\?v=(v[0-9a-z]+)"/g)].map((m) => m[1]);
  return tags.length > 0 && tags.every((x) => x === tag);
})());
t("every relative file reference resolves, exact case", (() => {
  const refs = [...markup.matchAll(/(?:src|href)="(?!data:|#|https?:|mailto:|\/)([^"?]+)/g)]
    .map((m) => m[1]);
  return refs.length > 0 && refs.every((r) => {
    const full = path.join(ROOT, DIR, r);
    if (!fs.existsSync(full)) return false;
    return fs.readdirSync(path.dirname(full)).includes(path.basename(full));
  });
})());

/* ---- the address -------------------------------------------------------- */

console.log("\nThe address, which is not the id");

t("the id is crossword_fr and it is not the directory", GAME !== DIR.split("/")[1],
  `${GAME} lives at ${DIR}`);
t("gameDir agrees with where this file actually is", gameDir(GAME) === DIR, gameDir(GAME));
t("gamePath is the served address", gamePath(GAME) === "/friends/crossword/", gamePath(GAME));
t("the theme is the first path segment", THEME_OF[GAME] === "friends", THEME_OF[GAME]);
t("and the slug drops the _fr, so the URL never carries the id",
  SLUG_OF[GAME] === "crossword" &&
  gamePath(GAME).indexOf(GAME) === -1 && gameDir(GAME).indexOf(GAME) === -1);
t("nothing here assembles a path by hand",
  !/["'`]\/friends\/crossword\//.test(js) && !/["'`]\/football\//.test(js),
  "permalink.js is the one place that knows where a game lives");

/* ---- not launched ------------------------------------------------------- */

console.log("\nNot launched, and it cannot go live by drift");

t("LAUNCHED says so", !launched,
  launched ? `LAUNCHED.${GAME} = ${LAUNCHED[GAME]}` : "null, which is not day one");

/* Each of these flips on the day it launches. Together they are the checklist:
   a game that is on none of these lists is invisible, and a game that is on
   some of them is half-launched, which is the state nobody notices. */
t(launched ? "it is in GAMES now, so its results can be written"
           : "it is not in GAMES, so no account row can be written for it",
  launched ? GAMES.indexOf(GAME) > -1 : GAMES.indexOf(GAME) === -1,
  launched ? "results and board state may be stored against it"
           : "a row written for a game nobody can play is a row nobody will ever read");
t("it is not in PERMA_GAMES, so it is not in the sitemap", (() => {
  const perma = read("functions/_lib/permalink.js");
  const block = (perma.match(/PERMA_GAMES\s*=\s*\{[\s\S]*?\n\}/) || [""])[0];
  return launched ? block.includes(GAME) : !block.includes(GAME);
})());
t("it is not in the squad list, so it is not named in served markup", (() => {
  const chrome = noComments(read("shared/xi-chrome.js"));
  return launched ? /crossword.{0,40}friends/i.test(chrome)
                  : !/friends/i.test(chrome);
})(), "an unreleased game appears only as a shirt number and a status");
t("it is not among the sitemap's static pages", (() => {
  const sm = read("functions/sitemap.xml.js");
  const block = (sm.match(/const STATIC\s*=\s*\[[\s\S]*?\n\]/) || [""])[0];
  return launched ? block.includes("/friends/") : !block.includes("/friends/");
})());

/* THE NOINDEX, AND BOTH HALVES OF IT. Present while unlaunched, because an
   unreleased game must not be findable. ABSENT once it launches, because a
   noindex nobody remembers to remove is a live game that never appears in a
   search result — and that failure is silent, which is why it is gated rather
   than remembered. */
const noindex = /<meta\s+name="robots"\s+content="noindex">/.test(markup);
t(launched ? "the noindex is gone now that it has launched"
           : "the page says noindex while it is unreleased",
  launched ? !noindex : noindex);

/* WHAT IS NOT YET WATCHING THIS GAME, SAID OUT LOUD. aligned_test is the
   cross-game contract and chrome_test is what enforces "an unreleased game is
   named nowhere in served markup" — and MEASURED on 20 September 2026, neither
   one can see this directory: both work from hardcoded football/… paths, so
   their green says nothing whatever about /friends/crossword/. Until launch
   this game is covered by this file alone.

   That is the same fault as the theme move, one level up. When the games moved
   under football/, the crossword gate's roster walk held three folder names,
   two stopped resolving, and fifty-six suites in six folders were covered by
   nothing for a day while the check still reported a pass. A list of paths
   cannot notice a directory nobody added to it.

   So the gap is asserted rather than remembered. While unlaunched these must
   NOT carry the game — adding it early turns CI red on things that are only
   true after launch. On the day it launches both flip, and this gate fails
   until they do, which is the only way a checklist survives being written
   down. */
console.log("\nWhat is watching this game, and what is not yet");
{
  const aligned = read("tools/aligned_test.mjs");
  t(launched ? "aligned_test now carries a row for it"
             : "aligned_test does not carry it yet, and that is the gap",
    launched ? aligned.includes(GAME) : !aligned.includes(GAME),
    launched ? "the cross-game contract applies"
             : "its failures are the launch checklist — add the row ON the day");

  const chrome = read("football/crossword/chrome_test.mjs");
  t(launched ? "chrome_test now renders this page too"
             : "chrome_test cannot see this page yet, and that is the gap",
    launched ? chrome.includes(DIR) : !chrome.includes(DIR),
    launched ? "the unreleased-name rule is enforced here"
             : "it reads a fixed list of football/ pages");
}

/* ---- the answers -------------------------------------------------------- */

console.log("\nThe answers, proved by execution");

/* PROVED BY RUNNING publicPuzzle, NOT BY READING IT. node --check proves a file
   parses, not that it runs; the crossword's own live_check shipped a HEAD block
   referencing a variable from another file and crashed on first contact with
   production. So a board is built here and put through the real projection.

   AND THE FRIENDS BANK IS WHY THIS MATTERS MORE THAN IT DOES FOR FOOTBALL:
   every clue row carries the sentence its answer was verified against, and the
   bank refuses a row whose answer is not literally in it — so the quote holds
   the answer in 3,035 of 3,053 rows. There is no safe subset. */
/* THE BOARD COMES FROM THE ENGINE, not from this file. It was written out by
   hand here at first, with `entry.cells` as "x,y" STRINGS — and the engine emits
   { x, y } OBJECTS. Everything that looked a cell up through an entry therefore
   got undefined, quietly, and this gate's own answer scan searched for nothing
   and reported itself clean. A fixture invented from an assumption can only
   confirm it. fixture.mjs uses the same generate() that made the 120 boards. */
const board = makeBoard();
const ANSWERS = answersOf(board);

const projection = publicPuzzle(board);
const pub = JSON.stringify(projection);

t("the projection runs at all", pub.length > 0 && pub.includes("FIX0001"));
t("PRECONDITION: the board has answers this gate can look for",
  ANSWERS.length === 11 && ANSWERS.every((a) => a.letters.length > 2),
  `${ANSWERS.length} entries — without letters every scan below is vacuous, ` +
  `which is exactly how this gate first passed`);

t("no cell carries a letter",
  Object.keys(projection.cells).every((k) => !("ch" in projection.cells[k])),
  `${Object.keys(projection.cells).length} cells checked`);
for (const field of ["answer", "grid", "aliases", "notes", "sourceQuote", "entity"]) {
  t(`no entry carries ${field}`,
    projection.entries.every((e) => !(field in e.row)));
}

/* VALUES, WALKED — NEVER THE SERIALISED PROJECTION. Normalising a stringified
   object makes its KEY NAMES searchable, and "acROSS" contains ROSS: a real
   Friends answer in 131 bank rows and the direction word of every entry. A scan
   written that way reports a leak on any board holding it — the route's first
   one did, and would have refused 24 of the 120 boards now in D1. */
const servedValues = (() => {
  const out = [];
  (function walk(v) {
    if (v == null) return;
    if (typeof v === "string") { out.push(v); return; }
    if (typeof v === "object") for (const k of Object.keys(v)) walk(v[k]);
  })(projection);
  return out;
})();
const clueSet = new Set(projection.entries.map((e) => e.row.clue));

t("the projection carries values to search at all", servedValues.length > 10,
  `${servedValues.length} string values`);
t("and not one answer is inside any served value", (() => {
  const hay = servedValues.filter((s) => !clueSet.has(s))
    .map((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  return ANSWERS.every((a) => !hay.some((h) => h.includes(a.letters)));
})(), `${ANSWERS.length} answers against ${servedValues.length - clueSet.size} values`);
t("but the clues do go out, because a crossword without clues is not one",
  projection.entries.every((e) => typeof e.row.clue === "string" && e.row.clue.length > 0));

/* ---- the page's own rules ----------------------------------------------- */

console.log("\nThe page");

t("the stylesheet defines no .xic- rule",
  !/\.xic-[a-z-]*\s*[,{]/.test(css),
  "the shared chrome is not this game's to restyle");
t("and restates no colour, taking them all from the tokens", (() => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return !/#[0-9A-Fa-f]{3,8}\b/.test(body) && !/\brgba?\(/.test(body);
})(), "shared/xi-tokens.css is the one palette");
t("the stylesheet is actually there to be checked", css.length > 400 &&
  (css.match(/var\(--/g) || []).length > 10,
  `${(css.match(/var\(--/g) || []).length} token uses — said in the positive, ` +
  `because a prohibition cannot notice an empty file`);

t("it loads the shared keyboard rather than drawing its own",
  /shared\/xi-keys\.js/.test(markup) && /XIKeys/.test(noComments(js)));
/* STRIPPED OF COMMENTS FIRST, and this check failed on its own page until it
   was — the comment beside the script tags says WHY xi-season.js is absent, and
   naming it there was enough to trip a prohibition that only cared about script
   tags. The mirror of it is worse and is already written down in this project:
   a comment naming a thing can SATISFY a check meant to demand it, which passes
   quietly. A grep about what a page loads must read what a browser loads. */
t("it does NOT load the season, which Friends is not in",
  !/xi-season\.js/.test(markup),
  "the owner's ruling: a genuine streak, +1 a day, and no season");
/* EVERY setItem CALL, NOT EVERY WELL-FORMED ONE. This matched
   `setItem(IDENT + "…")` at first, so a write of `setItem("fcw." + "streak.day")`
   — another game's prefix, hardcoded — did not match the pattern AT ALL, and
   `.every` over the remaining good calls returned true. The check counted its
   own successes and could not see the violation it existed to find; it passed
   the obvious sabotage. So the first argument of every call is captured
   whatever its shape, and each one must then be P. */
t("every localStorage key it writes is under this game's own prefix", (() => {
  const calls = [...noComments(js).matchAll(/setItem\(([^,]*),/g)]
    .map((m) => m[1].trim());
  return calls.length > 0 && calls.every((a) => /^P\s*\+/.test(a));
})(), "xifc. — and never another game's");
t("the prefix is this game's and is not taken", /var P = "xifc\."/.test(js));

/* THE DIRECTIONS THE ENGINE ACTUALLY USES, read out of the engine rather than
   written here. engine.js has ACROSS = "A" and DOWN = "D"; this client began
   with "across" and "down", and the failure was almost invisible. The first
   render sets `dir` from the entry the cursor lands on, so a real board came up
   correctly lit with the right clue — and the first TAP toggled `dir` to a
   value no entry carries, after which nothing lit, the clue card showed a dash
   and every keystroke was silently dropped. Nothing offline caught it: the
   suites never toggled direction, and a screenshot of the opening state looked
   perfect. It was found by clicking one square.
   Derived from engine.js, so if the engine ever changes its constants this
   fails rather than the game going quiet. */
{
  const engine = read("football/crossword/js/engine.js");
  const across = (engine.match(/ACROSS\s*=\s*"([^"]+)"/) || [])[1];
  const down = (engine.match(/DOWN\s*=\s*"([^"]+)"/) || [])[1];
  t("PRECONDITION: the engine states its direction constants", !!across && !!down,
    `ACROSS=${JSON.stringify(across)} DOWN=${JSON.stringify(down)}`);
  t("the client uses the engine's directions, not words of its own",
    new RegExp(`ACROSS\\s*=\\s*"${across}"`).test(js) &&
    new RegExp(`DOWN\\s*=\\s*"${down}"`).test(js),
    `expects ${JSON.stringify(across)}/${JSON.stringify(down)}`);
  t("and compares direction against those constants rather than literals", (() => {
    /* A comparison against "across" or "down" is the bug. The one place the
       long words may appear is the label a player reads, which is built from
       the constant — so a literal is allowed only on the right of a ternary
       that tested DOWN. Comments are stripped first: the paragraph above names
       both words, and a grep that read it would report a fault in its own
       explanation. */
    const code = noComments(js);
    const comparisons = code.match(/(===|!==|==|!=)\s*"(across|down)"/gi) || [];
    const assignments = code.match(/\bdir\s*=\s*"(across|down)"/gi) || [];
    return comparisons.length === 0 && assignments.length === 0;
  })(), "engine.js line 221 is the one place those two values are decided");
}

t("the day comes from the server, never from the device", (() => {
  /* A suite must not decide for itself what day it is, and neither may a page:
     one that computed the date from Date.now() would disagree with the server
     across UTC midnight and read to a player as a lost streak. */
  const stripped = noComments(js);
  return !/new Date\(\)/.test(stripped) && !/Date\.now\(\)/.test(stripped);
})());

/* ---- the bank ----------------------------------------------------------- */

console.log("\nThe bank");

t("no board or bank file is committed anywhere in this game's directory", (() => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  return !walk(path.join(ROOT, DIR)).some((f) =>
    /(^|[\\/])(data|bank|boards?)[^\\/]*\.(json|sql)$/i.test(f) || /\.sql$/i.test(f));
})(), "the bank lives outside the repo and D1 is the authoritative copy");
t("and the generated SQL is ignored by git", (() => {
  const gi = read(".gitignore");
  return /data\/\*-production\*\.sql/.test(gi) || /fr-production/.test(gi);
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
