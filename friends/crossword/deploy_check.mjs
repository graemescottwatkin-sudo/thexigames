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
import { LAUNCHED, GAMES, isListed } from "../../functions/_lib/games.js";
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
const LAST_SHIPPED = "v001a";
const LAST_SHIPPED_ASSETS = "1e3d0c9023076a4c";

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}

const html = read(DIR + "/index.html");
const js = read(DIR + "/js/game.js");
const css = read(DIR + "/css/style.css");
const launched = !!LAUNCHED[GAME];
/* LAUNCHED AND ADVERTISED ARE TWO QUESTIONS, since 21 September 2026. This
   game went live UNLISTED: it serves boards, banks results and counts a
   streak, and nothing on the site says it exists. The three checks below
   that are about being FOUND key off this; the ones about being PLAYABLE
   still key off `launched`, and conflating them is how an unlisted game
   ends up either unplayable or on the front page. */
const listed = isListed(GAME);

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

/* WRITTEN AS A PROHIBITION FIRST, which made it fail for ever the moment the
   game launched: it asserted !launched, so the very state it describes became a
   permanent red. A check must say something true on BOTH sides of the event it
   guards -- before launch that the date is absent, after it that the date is a
   real one. */
t(launched ? "LAUNCHED carries a real launch date" : "LAUNCHED says it is not out yet",
  launched ? /^\d{4}-\d{2}-\d{2}$/.test(String(LAUNCHED[GAME])) : !launched,
  launched ? `LAUNCHED.${GAME} = ${LAUNCHED[GAME]}` : "null, which is not day one");

/* Each of these flips on the day it launches. Together they are the checklist:
   a game that is on none of these lists is invisible, and a game that is on
   some of them is half-launched, which is the state nobody notices. */
t(launched ? "it is in GAMES now, so its results can be written"
           : "it is not in GAMES, so no account row can be written for it",
  launched ? GAMES.indexOf(GAME) > -1 : GAMES.indexOf(GAME) === -1,
  launched ? "results and board state may be stored against it"
           : "a row written for a game nobody can play is a row nobody will ever read");
/* COMMENTS STRIPPED, AND A KEY RATHER THAN THE WORD. This read the raw block
   and asked whether the game's id appeared in it — so the comment explaining
   that crossword_fr goes here ON its launch day counted as the entry itself,
   and the gate failed on its own explanation. The same fault this file already
   fixed for its own markup, arriving in the files it reads about others. */
t(launched ? "it is in PERMA_GAMES now, so the sitemap advertises it"
           : "it is not in PERMA_GAMES yet, so the sitemap does not offer it", (() => {
  const perma = noComments(read("functions/_lib/permalink.js"));
  const block = (perma.match(/PERMA_GAMES\s*=\s*\{[\s\S]*?\n\}/) || [""])[0];
  const entry = new RegExp("\\b" + GAME + "\\s*:").test(block);
  return launched ? entry : !entry;
})());
/* WHAT IS FORBIDDEN IS A NAME, NOT THE THEME'S EXISTENCE. This asked whether
   the word "friends" appeared in xi-chrome.js at all, which stopped being a
   sensible question the moment the squad became one list per theme: the key
   `friends:` is the structure, not a disclosure. The rule is that an unreleased
   game is NAMED nowhere, so what this looks for is a slot carrying both an href
   into this game and a name — which is precisely the launched state. */
/* THE SLOT CARRIES NEITHER A NAME NOR AN ADDRESS WHILE UNLISTED, and the
   address is the half added on 21 September 2026. shared/xi-chrome.js is
   downloaded by every page of the site, so an href in it is the site stating
   where the game is — which is the one thing "no public way to access" cannot
   allow, whatever the slot is called.
   FOUND BY LOOKING AT THE SHIPPED BYTES rather than at the rendered page. The
   slot rendered as nothing at all, because squadList() needs a name to draw a
   link; the leak was in the source, where nothing was looking. */
t(listed ? "it has a named slot in its theme's squad"
         : "its squad slot carries neither a name nor an address", (() => {
  const raw = read("shared/xi-chrome.js");
  const chrome = noComments(raw);
  const squads = (chrome.match(/friends:\s*\[[\s\S]*?\]/) || [""])[0];
  if (!squads) return false;                   // no squad at all is not the state
  const named = /name:/.test(squads);

  /* THE ADDRESS IS LOOKED FOR IN THE RAW FILE, COMMENTS AND ALL, and that is
     the difference between this check working and not. shared/xi-chrome.js
     SHIPS UNMINIFIED: every comment in it is bytes a visitor downloads, so a
     paragraph explaining that the path was removed, which then writes the path,
     puts it straight back where anybody can read it.
     THAT EXACT MISTAKE WAS MADE IN THE EDIT THAT REMOVED THE HREF — the comment
     justifying the removal spelled the address out — and this check, reading
     stripped code, could not see it. It was caught by a grep run by hand, which
     is not a thing that happens twice.
     A NAME in a comment is different and is allowed: this project's files
     discuss their games in prose everywhere, the family rule exempts comments
     from naming, and a name is not a way in. An ADDRESS is. */
  const addressed = /friends\/crossword/.test(raw);
  return listed ? (named && addressed) : (!named && !addressed);
})(), "the shipped chrome must not say where an unlisted game lives");
/* AND SAID IN THE POSITIVE, because the two prohibitions above both pass on a
   theme that has no squad at all — which would silently give every Friends
   player the football team sheet, themeHere() falling back. */
t("but the theme still HAS a squad, so its own pages do not show football's", (() => {
  const chrome = noComments(read("shared/xi-chrome.js"));
  return /friends:\s*\[\s*\{[^{}]*n:\s*1[^{}]*\}/.test(chrome);
})(), "themeHere() falls back to football for a theme with no squad");
t(listed ? "its front page is among the sitemap's static pages"
         : "its front page is not among the sitemap's static pages", (() => {
  const sm = read("functions/sitemap.xml.js");
  const block = (sm.match(/const STATIC\s*=\s*\[[\s\S]*?\n\]/) || [""])[0];
  return listed ? block.includes("/friends/") : !block.includes("/friends/");
})());
/* AND ITS BOARDS, WHICH ARE THE BIGGER HALF AND THE EASIER ONE TO MISS. The
   static block is one line; the board loop and the archive index are derived
   from PERMA_GAMES, and this game MUST stay in PERMA_GAMES or its permalinks
   stop resolving for the people who have been given the address. So the filter
   cannot be "is it in PERMA_GAMES" — the sitemap has to ask separately, and a
   tree where it asks for one and not the other advertises every board of a
   game whose front page is a secret. Proved from the generator's source rather
   than from a rendered sitemap, because rendering it needs a database. */
t("and the sitemap filters its derived lists by what is LISTED, not by what has permanent addresses", (() => {
  const sm = noComments(read("functions/sitemap.xml.js"));
  const filtered = /Object\.keys\(PERMA_GAMES\)\.filter\(isListed\)/.test(sm);
  /* EVERY enumeration, not merely one. The filtered helper must itself walk
     PERMA_GAMES, so the test is not "no raw walk exists" — it is that no
     UNFILTERED walk does. Both derived lists go through the helper; either one
     left keyed straight on PERMA_GAMES advertises an unlisted game's boards. */
  const unfiltered = (sm.match(/Object\.keys\(PERMA_GAMES\)(?!\.filter\(isListed\))/g) || []).length;
  return filtered && unfiltered === 0;
})(), "an unlisted game keeps its permalinks and loses its listings");

/* THE NOINDEX, AND BOTH HALVES OF IT. Present while unlaunched, because an
   unreleased game must not be findable. ABSENT once it launches, because a
   noindex nobody remembers to remove is a live game that never appears in a
   search result — and that failure is silent, which is why it is gated rather
   than remembered. */
const noindex = /<meta\s+name="robots"\s+content="noindex">/.test(markup);
t(listed ? "the noindex is gone now that it is announced"
         : "the page says noindex while it is not announced",
  listed ? !noindex : noindex,
  listed ? "a noindex nobody removes is a live game no search ever returns"
         : `LAUNCHED ${LAUNCHED[GAME]}, and UNLISTED — playable, not findable`);

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
  const aligned = noComments(read("tools/aligned_test.mjs"));
  t(launched ? "aligned_test now carries a row for it"
             : "aligned_test does not carry it yet, and that is the gap",
    launched ? aligned.includes(GAME) : !aligned.includes(GAME),
    launched ? "the cross-game contract applies"
             : "its failures are the launch checklist — add the row ON the day");

  /* NO LONGER A GAP, AND NOT CONDITIONAL. chrome_test read a fixed list of
     football/ pages, so the rule that an unreleased game is named nowhere was
     not enforced on this one at all — which matters MOST before launch, not
     after. The page is in that list now, so this asserts coverage in both
     states rather than describing an absence. */
  const chrome = noComments(read("football/crossword/chrome_test.mjs"));
  t("chrome_test renders this page, so the naming rule is enforced on it",
    chrome.includes(DIR), DIR);
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
  const code = noComments(js);
  const calls = [...code.matchAll(/setItem\(([^,]*),/g)].map((m) => m[1].trim());
  if (!calls.length) return false;

  /* A BUILDER IS RESOLVED, NOT WAVED THROUGH. boardKey() is a real key builder
     — the board number is not known at load, and a save before it arrives would
     otherwise land under "xifc.board.undefined" — so the first argument of that
     call is a name, not a concatenation, and the pattern above refused it.

     THE LAZY FIX IS TO ALLOW ANY IDENTIFIER CALL, and that is exactly the
     blindness the check was rewritten to remove one revision ago: it would then
     pass a builder returning "fcw.board.0", a hardcoded foreign prefix, which
     is the violation this exists to find. So one level of indirection is
     FOLLOWED instead, and every return in the builder must itself be P + ....
     A name this cannot resolve, a builder with no returns, fails. An
     unresolvable argument is not a pass — it is an unanswered question. */
  const bodyOf = (name) => {
    const at = code.indexOf("function " + name + "(");
    if (at < 0) return null;
    const open = code.indexOf("{", at);
    if (open < 0) return null;
    let depth = 0;
    for (let j = open; j < code.length; j++) {
      if (code[j] === "{") depth++;
      else if (code[j] === "}" && --depth === 0) return code.slice(open + 1, j);
    }
    return null;
  };

  return calls.every((a) => {
    if (/^P\s*\+/.test(a)) return true;
    const name = (a.match(/^([A-Za-z_$][\w$]*)\(\)$/) || [])[1];
    if (!name) return false;
    const body = bodyOf(name);
    if (!body) return false;
    const returns = [...body.matchAll(/\breturn\b([^;]*);/g)].map((r) => r[1].trim());
    return returns.length > 0 && returns.every((r) => /^P\s*\+/.test(r));
  });
})(), "xifc. — and never another game's, through a builder or directly");
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
     one that computed the date from the device clock would disagree with the
     server across UTC midnight and all evening on any machine ahead of UTC,
     and the disagreement reads to a player as a lost streak.

     WHAT IS FORBIDDEN IS DECIDING A DAY, NOT READING A CLOCK. A flat ban on
     Date.now() was the first version of this, and it was wrong in both
     directions at once. It refused `at: Date.now()` on a banked result — a
     timestamp, the same field every other game in the family records, making no
     claim about which day it is — so the gate was red on correct code, which
     is how a gate stops being read. And it MISSED the thing it cared about
     most: `new Date(Date.now()).toISOString().slice(0, 10)` contains no empty
     `new Date()` for it to object to, and would have sailed through the half of
     the rule that was left.

     So the line is drawn around the CONVERSION instead. The clock may be read;
     it may not be turned into a date. Every Date construction must be anchored
     to `day`, which is the server's word — the one legitimate construction
     here derives yesterday from it, to ask whether the streak continues. */
  const stripped = noComments(js);
  if (/new Date\(\s*\)/.test(stripped)) return false;
  if (/Date\.now\(\s*\)[^;\n]*\.(toISOString|getFullYear|getMonth|getDate|toLocale)/
    .test(stripped)) return false;

  const built = [...stripped.matchAll(/new Date\(([^)]*)\)/g)].map((m) => m[1]);
  if (!built.every((a) => /\bday\b/.test(a))) return false;

  /* AND SAID IN THE POSITIVE, because every line above is a prohibition and
     three prohibitions all pass on a page that computes no day at all —
     including one that has stopped counting the streak entirely. The page must
     be seen USING the server's day, not merely not misusing its own. */
  return built.length > 0 && /\bkeepDay\s*\(/.test(stripped);
})(), "the clock may be read; only the server may say what day it is");

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
