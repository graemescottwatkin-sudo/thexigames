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
 * IT HAS SHIPPED: its first hash was recorded on 21 Sep 2026 (13df83c), and
 * v002b is live. This paragraph said nothing had shipped and the hash was
 * null for two days after that stopped being true. Until then the asset check
 * carried a null exception that passed on any tree whatever; it is gone, and a
 * missing hash is a failure, as on Grid XI's and Friends Who Am I's gates.
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
   derives them from the live page rather than trusting anyone's memory. */
const LAST_SHIPPED = "v002k";
const LAST_SHIPPED_ASSETS = "8dbdec1d3cb9c4ff";

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}

const html = read(DIR + "/index.html");
const js = read(DIR + "/js/game.js");
const css = read(DIR + "/css/style.css");
/* THIS GAME'S CORNER OF localStorage, named once. It was written into three
   assertions as the literal "xifc." and into a fourth as /var P = "xifc\./,
   which is four places to disagree the day a prefix changes. */
const PREFIX = "xifc.";

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
t("the live build's asset hash is recorded",
  typeof LAST_SHIPPED_ASSETS === "string" && /^[0-9a-f]{16}$/.test(LAST_SHIPPED_ASSETS),
  String(LAST_SHIPPED_ASSETS));
t("the game's own assets cannot change without its build tag moving",
  typeof LAST_SHIPPED_ASSETS === "string" &&
    (nowHash === LAST_SHIPPED_ASSETS ? tag === LAST_SHIPPED : tag > LAST_SHIPPED),
  nowHash === LAST_SHIPPED_ASSETS ? "unchanged since the last ship"
                                  : `changed, ${LAST_SHIPPED} -> ${tag}`);
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
t("and introduces no colour that the game it is generated from does not", (() => {
  /* A FLAT BAN ON COLOUR WAS RIGHT FOR A 217-LINE STYLESHEET WRITTEN BY HAND
     and is wrong for a 2,682-line one that is PRODUCED. This file is football's
     stylesheet with the league table cut out; it carries thirteen hex values
     and football's own gate permits every one of them, so refusing them here
     refuses the source rather than this copy of it.
     WHAT IS STILL WORTH CHECKING is that GENERATING has not introduced any. A
     colour appearing in the output and not in the input is either a rewrite
     doing something it should not, or somebody editing the produced file by
     hand -- and both are faults this gate exists to catch. Subset, not zero. */
  const bare = (t) => new Set(
    (t.replace(/\/\*[\s\S]*?\*\//g, "").match(/#[0-9A-Fa-f]{3,8}\b|\brgba?\([^)]*\)/g) || [])
      .map((x) => x.toLowerCase()));
  const mine = bare(css);
  const theirs = bare(read("football/crossword/css/style.css"));
  const added = [...mine].filter((c) => !theirs.has(c));
  return added.length === 0;
})(), "the palette is shared/xi-tokens.css; the exceptions are football's and are not added to here");
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
  const args = [...code.matchAll(/setItem\(\s*([^,]+?)\s*,/g)].map((m) => m[1].trim());
  if (!args.length) return false;

  /* RESOLVED TO A CONCRETE PREFIX, three ways, because a generated client does
     not write its keys the way a hand-built one did. The first version of this
     demanded every argument be literally `P + ...`; football's client has no P,
     it has ten string literals, eight named constants and two key builders. The
     property is the same and is what is checked: whatever the shape, the string
     that reaches localStorage starts with this game's prefix.
     AN ARGUMENT THAT CANNOT BE RESOLVED FAILS. An unanswered question is not a
     pass -- that is the whole reason the previous version was rewritten. */
  const literal = (a) => (a.match(/^"([^"]*)"/) || [])[1];
  const constant = (a) => {
    const m = a.match(/^([A-Za-z_$][\w$]*)$/);
    if (!m) return null;
    const d = code.match(new RegExp('\\b(?:var|let|const)\\s+' + m[1] + '\\s*=\\s*"([^"]*)"'));
    return d ? d[1] : null;
  };
  const builder = (a) => {
    const m = a.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (!m) return null;
    const at = code.indexOf("function " + m[1] + "(");
    if (at < 0) return null;
    const open = code.indexOf("{", at);
    let depth = 0, end = -1;
    for (let i = open; i < code.length; i++) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}" && --depth === 0) { end = i; break; }
    }
    if (end < 0) return null;
    const body = code.slice(open, end);
    const rets = [...body.matchAll(/\breturn\b([^;]*);/g)].map((r) => r[1].trim());
    if (!rets.length) return null;
    /* Every return, not the first: a builder with one good branch and one bad
       one is the bug this exists to catch. */
    return rets.every((r) => {
      const lit = (r.match(/^"([^"]*)"/) || [])[1];
      if (lit != null) return lit.indexOf(PREFIX) === 0;
      const inner = r.match(/^([A-Za-z_$][\w$]*)\s*\(/);
      return !!inner && builder(r) === true;
    }) || null;
  };

  return args.every((a) => {
    const lit = literal(a);
    if (lit != null) return lit.indexOf(PREFIX) === 0;
    const con = constant(a);
    if (con != null) return con.indexOf(PREFIX) === 0;
    return builder(a) === true;
  });
})(), `${PREFIX} — every literal, constant and key builder, resolved`);

t("the prefix is this game's and is not taken",
  js.indexOf('"' + PREFIX) > -1 && !/"(fcw|xiws|xisc|xihl|xivw|xigd|xicw|qfx|xiwa|xibp)\./.test(noComments(js)),
  `${PREFIX}, and no other game's appears in the code`);

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
  /* TAKEN FROM THE ENGINE, WHICH IS BETTER THAN MATCHING IT. The hand-built
     client declared ACROSS = "A" and this asserted the two strings agreed --
     a copy checked against its original. The generated client does not copy
     them at all: it reads FCW.ACROSS and FCW.DOWN, so there is nothing to
     drift. Either is acceptable and the second is preferable, so both pass. */
  t("the client takes its directions from the engine, or restates them exactly", (() => {
    const code = noComments(js);
    const fromEngine = /=\s*FCW\.ACROSS\b/.test(code) && /=\s*FCW\.DOWN\b/.test(code);
    const restated = new RegExp(`ACROSS\\s*=\\s*"${across}"`).test(code) &&
                     new RegExp(`DOWN\\s*=\\s*"${down}"`).test(code);
    return fromEngine || restated;
  })(), `engine says ${JSON.stringify(across)}/${JSON.stringify(down)}`);
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

t("the server owns the calendar, and the client adopts its answer", (() => {
  /* THIS IS THE ONE THAT GENUINELY CHANGED, and it is recorded rather than
     quietly relaxed.

     The rule was "the day comes from the server, NEVER from the device", and
     the hand-built client obeyed it literally: it took the day out of the
     response and had no clock of its own. The generated client does not. It
     has `today()` returning FCW.dailyNumber(), which reads the device clock,
     because the football crossword needs a number before its first request --
     the home tile, the calendar and the permalink all name a board.

     SO THE GUARANTEE IS DIFFERENT, AND IT IS STILL A GUARANTEE. The server
     clamps what it is asked for, the response carries the number it actually
     served, and the client adopts that when the two disagree -- "the server
     owns the calendar, its answer wins", which is the comment in the source at
     the line that does it. A device an hour ahead asks for tomorrow, is handed
     today, and moves to it. The old rule prevented the disagreement; this one
     resolves it.
     WHAT WOULD BE A FAULT is the client computing a day and NOT reconciling,
     so that is what is checked: the reconciliation has to be there. */
  const code = noComments(js);
  const reconciles = /res\.dailyNo\s*&&\s*res\.dailyNo\s*!==\s*board\.no/.test(code);
  const adopts = /adoptServerBoard/.test(code);
  return reconciles && adopts;
})(), "a device clock may name a board; only the server decides which one it gets");

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
