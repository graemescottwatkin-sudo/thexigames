#!/usr/bin/env node
/* tools/build_friendscrossword.js — friends/crossword/ is PRODUCED, not written.
 *
 *   node tools/build_friendscrossword.js            writes the three files
 *   node tools/build_friendscrossword.js --check    fails if they have drifted
 *
 * WHY THIS EXISTS. The Friends crossword shipped on 21 September 2026 with a
 * board of its own: a 150-line page, a 220-line stylesheet and a 480-line
 * script, against football's 1,156 / 2,847 / 7,863. It played, it scored, it
 * banked a result — and it looked nothing like the crossword this family is
 * named after. No masthead, no toolbar, no clock, no solved count, no clue
 * panel, no progress pips. The owner's instruction was the right one and is
 * the whole specification for this file: identical to the football crossword,
 * minus the pitch behind the grid and the little league table.
 *
 * GENERATED RATHER THAN COPIED, for the reason tools/build_vowels.js exists.
 * A hand-port would be a second eight-thousand-line crossword that drifts from
 * the first the day either is touched, and every improvement to the football
 * board would have to be made twice by somebody who remembered. Produced, the
 * two cannot diverge: the --check half of this file is in CI and refuses a
 * tree where they have.
 *
 * WHAT THIS IS NOT, SAID PLAINLY. Vowels can be generated from Scrambled
 * because the two SHARE A SERVER — same bank, same /api/scrambled/ routes, and
 * only the presentation differs. The football crossword and this one do not.
 * Football's client calls seventeen endpoints; /api/crossword_fr/ has two.
 * Most of that gap is features being stripped here anyway (themes, categories,
 * the season, challenges, admin, practice), but four are the board's own —
 * check-answer, reveal, verify and finish — and they do not exist for this
 * game yet.
 *
 * SO THIS IS STAGE ONE AND IT SAYS SO. Everything the board does WITHOUT the
 * server is generated and live: the masthead, the toolbar, the clock, the
 * solved count, the full Across/Down clue panel, the clue card, the pips, the
 * keyboard, follow-word and zoom. The controls that need an endpoint this game
 * does not have are removed rather than left on screen doing nothing — a
 * CHECK button that silently fails is worse than no CHECK button, and it is
 * the kind of thing that survives to production because it looks right in a
 * screenshot. When the endpoints land, they come off this list and the button
 * returns with them.
 */
import fs from "node:fs";
import path from "node:path";
import { readText, readTextIfExists } from "./text.js";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CHECK = process.argv.includes("--check");

/* Text as it ships, CRLF folded (tools/text.js). */
const read = (p) => readText(path.join(ROOT, p));

const SRC = "football/crossword";
const OUT = "friends/crossword";

/* THE TAG LIVES HERE, because it is written into three generated files and a
   number kept in three places disagrees with itself. Bump here, regenerate. */
const TAG = "v002j";

/* THE SHARED LAYER'S TAG, read from the source page rather than restated. It
   has its own plain vN lifecycle and moves without this game's tag moving, so a
   copy here would be wrong within a week. */
const SHARED = (read(`${SRC}/index.html`).match(/shared\/xi-theme\.js\?v=(v\d+)/) || [])[1];

const NAME = "Crossword XI: Friends";
const STRAP = "Friends Crossword";
const TAGLINE = "Eleven clues about Friends, crossing in one grid.";

/* ---- cutting tools -------------------------------------------------------
 *
 * REMOVING MARKUP BY REGEX IS HOW A PAGE ENDS UP WITH AN UNCLOSED DIV. These
 * walk the tags instead, so a block that contains other blocks comes out
 * whole, and a block that is not found is an ERROR rather than a silent no-op
 * — a strip list that stops matching is a strip list that stops stripping, and
 * the page would quietly grow the league table back.
 */
function cutBlockById(html, id, what) {
  const at = html.indexOf(`id="${id}"`);
  if (at < 0) throw new Error(`strip "${what}": no element with id="${id}"`);
  const open = html.lastIndexOf("<", at);
  const tag = (html.slice(open + 1).match(/^([a-zA-Z][\w-]*)/) || [])[1];
  if (!tag) throw new Error(`strip "${what}": cannot read the tag name for #${id}`);

  const re = new RegExp(`<${tag}\\b|</${tag}>`, "g");
  re.lastIndex = open;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) {
      return html.slice(0, open) +
        `<!-- ${what}: removed by tools/build_friendscrossword.js -->` +
        html.slice(m.index + m[0].length);
    }
  }
  throw new Error(`strip "${what}": #${id} is never closed`);
}

/* A CSS RULE, INCLUDING THE @media IT MAY SIT IN. Matching on the selector and
   deleting to the next "}" breaks on any rule containing a nested brace, so
   this counts braces too. Selectors that match nothing are reported, not
   ignored: 123 pitch rules were counted before this was written, and a strip
   that silently finds none is the same fault as one that finds everything. */
function cutRules(css, test, what) {
  const out = [];
  let i = 0, cut = 0;
  while (i < css.length) {
    const brace = css.indexOf("{", i);
    if (brace < 0) { out.push(css.slice(i)); break; }
    const selector = css.slice(i, brace);

    /* An at-rule wrapper (@media, @supports) is kept and its BODY walked, so a
       pitch rule inside a media query is cut and the query survives for the
       rules around it. */
    if (/@(media|supports|layer)/.test(selector.split("}").pop())) {
      out.push(css.slice(i, brace + 1));
      i = brace + 1;
      continue;
    }

    let depth = 1, j = brace + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    if (test(selector)) { out.push(selector.replace(/[^\n]/g, "").slice(0, 0)); cut++; }
    else out.push(css.slice(i, j));
    i = j;
  }
  if (!cut) throw new Error(`strip "${what}": matched no rules, so it stripped nothing`);
  return { css: out.join(""), cut };
}

const once = (s, from, to, what) => {
  if (!s.includes(from)) throw new Error(`rewrite "${what}": not found — ${from.slice(0, 60)}`);
  return s.split(from).join(to);
};

export const STRIP_BLOCKS = [
  ["tablePanel", "the league table"],
  ["themeSheet", "clubs and themes, which are football's"],
  ["challengeOverlay", "challenges, which need a server this game does not have"],
  ["adminSheet", "the admin sheet"],
];

/* ---- the page ---- */
function page() {
  let s = read(`${SRC}/index.html`);

  for (const [id, what] of STRIP_BLOCKS) s = cutBlockById(s, id, what);

  /* IDENTITY, EVERY PLACE THE PAGE STATES IT.
   *
   * THE NAME MUST AGREE IN FOUR PLACES AND A COLON IS NOT A STYLE CHOICE.
   * tools/aligned_test.mjs reads the name from the title, og:title, the JSON-LD
   * and the h1 and requires all four to match — and it splits each on "|" and
   * on em/en dashes first, because a title is "Name — something". So the name
   * carries a COLON and the dash comes after it; a name containing a dash would
   * be silently truncated to its first half and the four would "agree" on the
   * wrong thing.
   */
  const TITLE = `${NAME} \u2014 the daily Friends crossword`;
  const DESC = `${NAME} \u2014 ${TAGLINE}`;

  s = once(s, "<title>Crossword XI \u2014 the daily football crossword | The XI Games</title>",
    `<title>${TITLE}</title>`, "title");
  s = once(s,
    '<meta name="description" content="The daily football crossword: eleven clues, one grid and a 90-minute clock. Solve it before the points drain away. A new board every day.">',
    `<meta name="description" content="${DESC}">`, "meta description");
  s = once(s, '<meta property="og:title" content="Crossword XI \u2014 The Football Crossword">',
    `<meta property="og:title" content="${TITLE}">`, "og:title");
  s = once(s, '<meta name="twitter:title" content="Crossword XI \u2014 The Football Crossword">',
    `<meta name="twitter:title" content="${TITLE}">`, "twitter:title");
  /* ONE CALL FOR BOTH META TAGS, because once() replaces every occurrence and
     og:description and twitter:description carry the same sentence. Calling it
     twice threw on the second: the string was already gone. */
  s = once(s,
    `content="The daily football crossword. Solve before the 90 minutes gets away from you.">`,
    `content="${TAGLINE}">`, "og/twitter description");

  /* THE JSON-LD, and the SCORING IN IT IS FOOTBALL'S. "scored out of 114 —
     thirty-eight matches at three points each" is a football league season
     described as a scoring system; this game scores out of 100, which
     functions/_lib/fr-score.js owns and rounds ONCE because eleven entries do
     not divide into a hundred. Copy that states another game's rules is worse
     than copy that says nothing. */
  /* THE NAME IN THE JSON-LD, which is the fourth of the four aligned_test
     compares and the one that was missed. It still read "Crossword XI", which
     agrees with football's title and not with this game's. */
  s = once(s, '  "name": "Crossword XI",', `  "name": "${NAME}",`, "JSON-LD name");
  s = once(s, '"alternateName": "The daily football crossword",',
    '"alternateName": "The daily Friends crossword",', "JSON-LD alternateName");
  s = once(s,
    '"description": "A daily football crossword. Eleven answers, scored out of 114 \\u2014 thirty-eight matches at three points each.",',
    '"description": "A daily Friends crossword. Eleven answers, scored out of 100.",',
    "JSON-LD description");

  s = once(s, '<h1 class="sr-only">Crossword XI &mdash; the daily football crossword</h1>',
    `<h1 class="sr-only">${NAME} &mdash; the daily Friends crossword</h1>`, "h1");

  s = once(s,
    '<div class="brandline">The Football Crossword <span class="by">by The <span class="xi">XI</span> Games</span></div>',
    '<div class="brandline">The Friends Crossword <span class="by">by The <span class="xi">XI</span> Games</span></div>',
    "brandline");
  s = once(s, '<div class="strap" id="strapText">Football Crossword</div>',
    `<div class="strap" id="strapText">${STRAP}</div>`, "strap");

  /* THE BREADCRUMB IS THE THEME, which is the first path segment. */
  s = once(s, '<p class="site-crumb">Football <span aria-hidden="true">/</span> <b>Crossword</b></p>',
    '<p class="site-crumb">Friends <span aria-hidden="true">/</span> <b>Crossword</b></p>',
    "breadcrumb");
  s = once(s, '<p class="ident-sub">Eleven clues. One football crossword.</p>',
    '<p class="ident-sub">Eleven clues. One Friends crossword.</p>', "identity sub");

  /* THE NOINDEX, WHICH FOOTBALL'S PAGE HAS NO REASON TO CARRY AND THIS ONE
     CANNOT SHIP WITHOUT. This game is LAUNCHED and UNLISTED: live, playable,
     and advertised nowhere. Generating its page from an INDEXED game's page
     produces an indexed page, and the one thing standing between an unlisted
     game and a search result is this tag. The gate refuses its absence, which
     is the only reason it was caught before the first deploy of a generated
     board rather than after.
     It comes off when functions/_lib/games.js stops calling the game UNLISTED,
     and the gate refuses the two disagreeing in either direction. */
  s = once(s, '<link rel="canonical"',
    '<meta name="robots" content="noindex">\n<link rel="canonical"',
    "the noindex");

  /* THE SEASON IS NOT THIS GAME'S. The owner's ruling is a genuine streak, +1
     a day, and no season at all -- so the page must not load the file that
     would give it a record it may not write.
     xi-seasonS.js (plural) is a DIFFERENT FILE and stays: it is thirty
     historical league tables and FCW.loadSeasons(XI_SEASONS) runs at load, so
     removing it throws before a single line of the game executes. One letter
     between a rule and a crash. */
  s = once(s, '<script src="/shared/xi-season.js?v=' + SHARED + '"></script>\n', "",
    "the season file");

  /* NO SHARE CARD, RATHER THAN THE WRONG GAME'S. Every game in this family
     has its own og-image.png; the path rewrite pointed this one at
     friends/crossword/og-image.png, which does not exist, so the card 404'd
     and shared links showed no picture at all.
     Football's own file was the tempting fix and is the wrong one: it is
     football artwork, and a Friends crossword sharing a football card is a
     worse answer than sharing none. The tags are removed until this game has a
     card of its own -- the source page's own comment says the card "renders as"
     a plain link without them, which is the honest fallback.
     BEFORE THIS GAME IS ANNOUNCED IT NEEDS 1200x630 ARTWORK. It is unlisted, so
     nobody is sharing it yet, which is the only reason this can wait. */
  s = s.replace(/^.*<meta property="og:image[^>]*>\n/gm, "");
  s = s.replace(/^.*<meta name="twitter:image[^>]*>\n/gm, "");

  /* THE PRIVACY PAGE IS THE SITE'S, NOT THIS GAME'S, and it exists in exactly
     one place. football/crossword/privacy.html is linked RELATIVELY from
     football's own page, so a straight copy points at friends/crossword/
     privacy.html -- a file that does not exist and was never going to. Two dead
     links in the footer of every board.
     Made absolute rather than copied: one policy, one address. A second copy
     under this game would be a second document to keep in step, and the day
     they disagreed the site would be making two different promises about what
     it stores. */
  /* PATHS AND TAGS. */
  s = s.split(`/${SRC}/`).join(`/${OUT}/`);

  /* THE DOORS TO CLUBS AND THEMES. The panel behind them is already stripped;
     these are the four ways in, and each one leads to a page this game has not
     got. Removed rather than left to 404. */
  s = once(s,
    '        <button role="menuitem" data-act="themes">Clubs &amp; themes</button>\n', "",
    "the menu item");
  s = once(s, '        <button id="navClubs">Clubs &amp; themes</button>\n', "",
    "the header nav button");
  s = once(s,
    '    <button class="site-hidden" id="homeThemes">Clubs and themes</button>\n', "",
    "the hidden home button");

  /* AFTER the path rewrite, NOT BEFORE. Written above it first, which turned
     /football/crossword/privacy.html straight back into this game's own
     non-existent one on the very next line -- the rewrite undoing the fix. */
  s = s.split('href="privacy.html"').join(`href="/${SRC}/privacy.html"`);
  /* EVERY ASSET THIS GAME SERVES, engine.js included. It carried football's
     v003x while the page moved to this game's tag, so the page pulled three
     files under two lifecycles -- and a stale engine under a fresh page is the
     cache fault this tag exists to prevent. */
  s = s.replace(/((?:css\/style\.css|js\/game\.js|js\/engine\.js)\?v=)[a-z0-9]+/g, `$1${TAG}`);

  /* AND THE FOOTER'S BUILD TAG, WHICH IS WHAT A PERSON READS. The rewrite
     above moved every asset to this game's tag and left the footer carrying
     football's -- so the live Friends crossword said "v003x" at the bottom of
     a page whose assets were all v002a, found in a site review on 22 September.
     CLAUDE.md is explicit that game assets must match the footer, and "check
     the deploy" starts by reading it: a reviewer comparing footer to origin
     would have been comparing the wrong game's number. Counted, so a footer
     that stops carrying a tag refuses rather than passing -- once() here takes
     strings, and the tag it replaces is football's, which moves. */
  const FOOT = /buildTag">v[0-9a-z]+</g;
  const feet = (s.match(FOOT) || []).length;
  if (feet !== 1) throw new Error(`rewrite "the footer build tag": found ${feet}, want 1`);
  s = s.replace(FOOT, `buildTag">${TAG}<`);

  return s;
}

/* ---- the stylesheet ---- */
function styles() {
  let s = read(`${SRC}/css/style.css`);

  /* THE PITCH IS NOT CUT, AND THAT IS THE FIX RATHER THAN THE COMPROMISE.
   *
   * The football board already ships a mode with no pitch: `body.no-pitch`,
   * toggled from a setting, and its own comment says "off restores the plain
   * paper board exactly". That is precisely what this game wants, so this game
   * turns it on permanently in script() and the stylesheet is left alone.
   *
   * THE FIRST VERSION CUT EVERY SELECTOR NAMING `pitch` AND WAS WRONG TWICE.
   * `--pitch` is the PALETTE token — the brand green behind buttons, focus
   * rings and half the text — so cutting on it would have taken the colour out
   * of the page. And among the nine selectors that DO name the pitch, four are
   *
   *     body.no-pitch .pitch-bg      body.no-pitch .grid
   *     body.no-pitch .grid-wrap     body.no-pitch .cell.block
   *
   * which are the rules that draw a board WITHOUT one. Deleting the thing you
   * were asked to switch off is a very quiet way to get a worse result than
   * doing nothing, and only reading the selectors found it.
   *
   * THE LEAGUE TABLE IS DIFFERENT and is genuinely cut: it has no supported
   * off switch, its panel is removed from the page, and rules for a panel that
   * no longer exists are dead weight that the next reader has to rule out. */
  const r = cutRules(s, (sel) => /#tablePanel|\.lg-/.test(sel), "the league table");
  return { css: r.css, table: r.cut };
}


/* ---- the script ----------------------------------------------------------
 *
 * ONE HELPER CARRIES EVERY CALL, which is the whole reason this is tractable.
 * football/crossword/js/game.js routes all seventeen of its endpoints through
 * `api(path, body)`, so pointing this game at its own server is ONE insertion
 * rather than seventeen edits — and the seventeen cannot drift away from it,
 * because a new call added to football's client goes through the same door.
 */
function script() {
  let s = read(`${SRC}/js/game.js`);
  /* The family's top bar names the game in its first line. */
  s = once(s, 'XIBar.set({ name: "Crossword XI",', `XIBar.set({ name: "${NAME}",`, "the top bar's name");

  /* THE BOARD'S FIVE ENDPOINTS, NAMESPACED. The others are football's and are
     not rewritten: /api/play and /api/account/state are the family's and serve
     every game already, and the rest belong to features this game does not
     have. A call to one of those from this client is a FAULT, not a fallback,
     and the map below says so by leaving it alone — it will 404 loudly rather
     than quietly answering with football's data, which is the failure that
     would take a week to notice. */
  const NS = "/api/crossword/crossword_fr/";
  const ROUTED = ["daily", "check-answer", "reveal", "verify", "finish"];

  const shim =
    "  /* GENERATED by tools/build_friendscrossword.js — do not edit here.\n" +
    "     THE BOARD'S OWN ENDPOINTS ARE THIS GAME'S. The crossword API was\n" +
    "     namespaced by game on 22 Sep 2026 so a second crossword could have\n" +
    "     the same server rather than a second copy of its rules. Everything\n" +
    "     else — /api/play, /api/account/state — is the family's and is left\n" +
    "     exactly as football's client wrote it. */\n" +
    "  var CW_ROUTED = " + JSON.stringify(ROUTED) + ";\n" +
    "  function cwApi(p) {\n" +
    "    var q = String(p || \"\");\n" +
    "    var cut = q.indexOf(\"?\");\n" +
    "    var base = cut < 0 ? q : q.slice(0, cut);\n" +
    "    var tail = cut < 0 ? \"\" : q.slice(cut);\n" +
    "    for (var i = 0; i < CW_ROUTED.length; i++) {\n" +
    "      if (base === \"/api/\" + CW_ROUTED[i]) return \"" + NS + "\" + CW_ROUTED[i] + tail;\n" +
    "    }\n" +
    "    return q;\n" +
    "  }\n";

  const anchor = "  function api(path, body) {\n";
  if (!s.includes(anchor)) throw new Error("rewrite \"api helper\": anchor not found");
  s = s.replace(anchor, shim + anchor + "    path = cwApi(path);\n");

  /* IDENTITY. The game id, in all ten places it is stated. */
  s = s.split('"crossword"').join('"crossword_fr"');

  /* STORAGE. Every game keeps its own corner and may never write another's. */
  s = s.split('"fcw.').join('"xifc.').split("'fcw.").join("'xifc.");

  /* AND THE FUNCTION THEY CALLED. Left in place it is a live route to a 404
     for anything this generator has not found -- the home tile, a keyboard
     shortcut, a menu entry added to football's page next week. Neutered at the
     single place the source says owns the address, which is why the source
     says so. */
  s = once(s,
    'function openClubsIndex() { location.href = "/' + SRC + '/clubs/"; }',
    'function openClubsIndex() { /* GENERATED: this game has no clubs page. */ }',
    "the clubs navigation");

  /* THE SCORING VOCABULARY IS A FOOTBALL METAPHOR, and it does not survive the
     journey. footballPhrase() turns each penalty into a league result — "1
     draw", "2 defeats" — which reads correctly on a game scored out of 114 as
     thirty-eight matches at three points each, and reads as nonsense on a
     crossword about a sitcom. A Friends board that tells a player they have
     taken "3 defeats" for revealing a letter is worse than one that says
     nothing: it is the other game's voice coming out of this one.
     Renamed as well as reworded, because the NAME is what the identity gate
     below catches — and a function still called footballPhrase would keep
     tripping it forever, which is the gate doing its job. */
  s = once(s,
    'function footballPhrase(kind, count, points) {\n' +
    '    if (!count) return "None";\n' +
    '    if (kind === "draw") return count === 1 ? "1 draw" : count + " draws";\n' +
    '    if (kind === "check") return count === 1 ? "1 defeat" : count + " defeats";\n' +
    '    return count === 1 ? "3 defeats" : (count * 3) + " defeats";\n' +
    '  }',
    'function helpPhrase(kind, count, points) {\n' +
    '    /* PLAIN COUNTS, because this game has no league to lose in. What the\n' +
    '       panel is explaining is what help was taken, so it says that. */\n' +
    '    if (!count) return "None";\n' +
    '    if (kind === "draw") return count === 1 ? "1 letter" : count + " letters";\n' +
    '    if (kind === "check") return count === 1 ? "1 check" : count + " checks";\n' +
    '    return count === 1 ? "1 answer" : count + " answers";\n' +
    '  }',
    "the scoring vocabulary");
  s = s.split("footballPhrase(").join("helpPhrase(");

  /* THE PITCH IS OFF, AND CANNOT BE TURNED ON. football's board defaults it on
     and remembers a per-device choice; this game has no pitch to show, so the
     default is inverted AND the stored preference is no longer read — a player
     who had switched it on in the football crossword would otherwise carry a
     football pitch into a sitcom quiz, because the two games now share this
     code and would have shared the key too.
     The TOGGLE is removed from the page in page(), for the same reason: a
     control that offers a pitch this game does not have is a control that
     confuses whoever presses it. */
  s = once(s,
    '  var pitchOn = true;\n' +
    /* "xifc." AND NOT "fcw.", because the storage rewrite above has already
       run by the time this does. Anchoring on the source text would look right
       and match nothing; once() throws rather than silently skipping, which is
       how this was caught the first time it was written. */
    '  try { pitchOn = localStorage.getItem("xifc.pitch") !== "off"; } catch (e) {}',
    '  /* GENERATED: this game has no pitch. See tools/build_friendscrossword.js. */\n' +
    '  var pitchOn = false;',
    "the pitch default");

  /* PATHS. */
  s = s.split(`/${SRC}/`).join(`/${OUT}/`);

  /* THE BUILD TAG the page asks for. */
  s = s.replace(/var BUILD = "[^"]*"/, `var BUILD = "${TAG}"`);

  return s;
}

/* ---- the engine ----------------------------------------------------------
 *
 * THE BOARD IS TWO FILES, NOT ONE. js/engine.js defines FCW — the grid model,
 * the clue numbering and the scoring — and game.js is built on top of it. The
 * first version of this generator produced game.js alone, so the page loaded,
 * asked for an engine.js that had never been written, got the 404 page back as
 * text/html, and died on "FCW is not defined". Nothing in the source said there
 * were two; the browser did.
 *
 * ALMOST NOTHING HERE IS FOOTBALL'S. No game id, no football path, three
 * storage keys and nine mentions in prose. The scoring model IS football's and
 * is deliberately left alone for now — see the note in script().
 */
function engine() {
  let s = read(`${SRC}/js/engine.js`);

  /* THE OUTCOME MESSAGES ARE A LEAGUE TABLE WRITTEN OUT IN WORDS — champions,
     Champions League, European football, relegation — keyed by final position
     and addressed to "{club}". None of that exists in this game: there is no
     club, no table and no position, because the table panel is removed from the
     page.
     REPLACED RATHER THAN DELETED. The array is read by name elsewhere in the
     engine, and an empty one would be a lookup that returns undefined at the
     one moment the player is being told how they did. These say the same thing
     the football ones say — how well did that go — in the only vocabulary this
     game has, which is the score itself.
     THE BANDS ARE FOOTBALL'S SHAPE and stay that way on purpose: 1, 2-4, 5-6,
     7, 8-16, 17, 18-20 is a twenty-team league, and this game has nothing to be
     twentieth in. They are preserved so the two files keep the same structure
     and the diff stays reviewable; what the bands MEAN here is a product
     decision nobody has made yet, and inventing one in a generator would be
     the worst place to make it. */
  s = once(s,
    '    // Football outcome messages by final position range (game rules).',
    '      /* Outcome messages. See tools/build_friendscrossword.js: this game\n' +
    '         has no league, no club and no table, so these say how the board\n' +
    '         went rather than where a club finished. */',
    "the outcomes comment");
  s = once(s,
    '      { from: 1,  to: 1,  msg: "{club} are champions!" },\n' +
    '      { from: 2,  to: 4,  msg: "{club} qualified for the Champions League." },\n' +
    '      { from: 5,  to: 6,  msg: "{club} secured European football." },\n' +
    '      { from: 7,  to: 7,  msg: "{club} finished 7th." },\n' +
    '      { from: 8,  to: 16, msg: "{club} finished in mid-table." },\n' +
    '      { from: 17, to: 17, msg: "{club} survived the relegation battle." },\n' +
    '      { from: 18, to: 20, msg: "{club} were relegated." }',
    '      { from: 1,  to: 1,  msg: "A perfect board." },\n' +
    '      { from: 2,  to: 4,  msg: "Very strong." },\n' +
    '      { from: 5,  to: 6,  msg: "A good one." },\n' +
    '      { from: 7,  to: 7,  msg: "Solid." },\n' +
    '      { from: 8,  to: 16, msg: "Got there." },\n' +
    '      { from: 17, to: 17, msg: "Close one." },\n' +
    '      { from: 18, to: 20, msg: "Tough board." }',
    "the outcome messages");

  /* THE CEILING IS 110, NOT 114. Eleven entries at ten points each -- the
     owner's ruling of 22 September 2026, and the number functions/_lib/
     fr-score.js has held since. 114 is thirty-eight football matches at three
     points, which is a league season and not a sitcom quiz.
     THIS IS THE CLIENT'S HALF ONLY, and the other half is not done: the shared
     /api/crossword/<game>/finish still scores with football's MODEL -- start at
     the maximum and decay over a ninety-minute match clock, charging help in
     minutes. That is a different rule, not a different number, so changing this
     constant alone would put 110 in the toolbar over a score computed out of
     114. The registry needs a scoring adapter beside load and loadByToken
     before this game can bank a verified score. Recorded here because a
     constant that looks finished is worse than one that admits it is not. */
  s = once(s, "MAX_SCORE: 114,", "MAX_SCORE: 110,", "the board's ceiling");

  s = s.split('"fcw.').join('"xifc.').split("'fcw.").join("'xifc.");
  s = s.split(`/${SRC}/`).join(`/${OUT}/`);
  return s;
}

/* ---- what may still say football ----------------------------------------
 *
 * THE GATE. After every rewrite the produced files are searched for the source
 * game's identity, and anything found is a REFUSAL rather than a warning. This
 * is the half that makes a generator trustworthy: the rewrite list above goes
 * stale the first time somebody adds a string to football's page, and this is
 * what says so instead of shipping a Friends page carrying the other game's
 * name.
 */
export const ALLOWED = [
  "The XI Games",                 // the family's own name, not this game's
  "/api/play",                    // the family's funnel, shared by every game
  "/api/account/state",           // likewise
  /* THE PRIVACY POLICY, which is the SITE'S and lives at exactly one address.
     It is a football path only by accident of where the first game put it, and
     linking it is not this game claiming to be that one -- it is one document
     with one URL, which is the alternative to two policies that can disagree
     about what the site stores.
     THE GATE WAS RIGHT TO ASK. It refused this twice before the exception was
     written, and the second refusal was the useful one: the run was piped to
     /dev/null, index.html was never written, the stale copy stayed on disk, and
     deploy_check stopped complaining about a link that was still broken. A
     refusal you cannot see is a refusal that makes the next check lie. */
  "/football/crossword/privacy.html",
];

/* COMMENTS ARE BLANKED BEFORE THE SCAN, and that is a considered position
   rather than convenience. These files discuss their own history in prose —
   football's game.js explains why a storage key is shaped the way it is, and
   the explanation names the key — so scanning raw text reports forty-six
   "leaks" that are all paragraphs. This family's own rule exempts comments from
   naming, and a name is not a way in.
   AN ADDRESS WOULD BE DIFFERENT, and there is scar tissue: shared/xi-chrome.js
   ships unminified, and a comment there explaining that a path had been removed
   put the path straight back. Nothing in these three files is a secret address,
   so the line is drawn at names; if that ever changes, this is the function
   that has to change with it.
   BLANKED, NOT DELETED, so a hit still reports the line number it is on. */
function codeOnly(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

export function leftovers(text, what) {
  const hits = [];
  const lines = codeOnly(text).split("\n");
  const raw = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/football|Football|\bfcw\./.test(l)) continue;
    if (ALLOWED.some((a) => l.includes(a))) continue;
    hits.push(`    ${what}:${i + 1}  ${raw[i].trim().slice(0, 100)}`);
  }
  return hits;
}

/* ---- write, or refuse ---------------------------------------------------- */
const FILES = [
  [`${OUT}/index.html`, page],
  [`${OUT}/css/style.css`, () => styles().css],
  [`${OUT}/js/engine.js`, engine],
  [`${OUT}/js/game.js`, script],
];

let bad = 0;
for (const [rel, make] of FILES) {
  let want;
  try { want = make(); }
  catch (e) { console.log(`REFUSED: ${rel} — ${e.message}`); bad++; continue; }

  const leaks = leftovers(want, rel);
  if (leaks.length) {
    console.log(`REFUSED: ${rel} still carries the other game's identity — ` +
      `${leaks.length} place(s):`);
    leaks.slice(0, 6).forEach((l) => console.log(l));
    bad++;
    continue;
  }

  const at = path.join(ROOT, rel);
  const have = readTextIfExists(at);
  if (CHECK) {
    if (have === want) console.log(`  ok  ${rel}`);
    else { console.log(`REFUSED: ${rel} is not what ${SRC}/ produces. ` +
      `Run node tools/build_friendscrossword.js`); bad++; }
  } else {
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, want);
    console.log(`  wrote ${rel}`);
  }
}

if (bad) process.exit(1);
console.log(CHECK
  ? `${OUT}/ is what ${SRC}/ produces, at ${TAG}`
  : `${OUT}/ generated from ${SRC}/, at ${TAG}`);
