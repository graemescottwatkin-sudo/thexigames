#!/usr/bin/env node
/* tools/build_friendswhoami.js — friends/whoami/ is PRODUCED, not written.
 *
 *   node tools/build_friendswhoami.js            writes the four files
 *   node tools/build_friendswhoami.js --check    fails if they have drifted
 *
 * The second generated game of the second theme, on the pattern the Friends
 * crossword proved on 22 September: a themed game is football's game with its
 * identity rewritten and its football-only parts removed, so the two cannot
 * drift and every improvement to the football board lands in both.
 *
 * WHAT IS SHARED AND WHAT IS NOT. The PRESENTATION is generated from
 * football/whoami/ — the page, the stylesheet, the board chrome, the door grid,
 * the guess box. The DECK is not: a Friends card hides a sitcom character and
 * deals three written clues, where a football door hides a player and reveals
 * his attributes. functions/_lib/frwa-data.js answers the same four questions
 * football's wadata.js answers, and functions/_lib/wa-registry.js is where the
 * two are told apart, so the endpoints never learn which game they are serving.
 *
 * THE LADDER IS THE INTERESTING REWRITE. football/whoami/js/config.js says of
 * itself that "THE CLUE LADDER IS CONFIGURATION, NOT STRUCTURE", which is
 * exactly the seam this needs: football's three rungs buy a career and a bio,
 * and Friends' three buy the round's second and third clue. Same shape, same
 * arithmetic in wa-play.js, different contents — because the file was written
 * so that could be true.
 */
import fs from "node:fs";
import path from "node:path";
import { readText, readTextIfExists } from "./text.js";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { entryKey } from "../functions/_lib/games.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CHECK = process.argv.includes("--check");

/* Text as it ships, CRLF folded (tools/text.js). */
const read = (p) => readText(path.join(ROOT, p));

const GAME = "whoami_fr";
const SRC = "football/whoami";
const OUT = "friends/whoami";

/* THE TAG LIVES HERE, written into every generated file. Bump, regenerate. */
const TAG = "v001b";

const NAME = "Who Am I XI: Friends";
/* THREE, NOT ELEVEN. This said eleven -- copied from football's shape before
   the door count was settled -- and it is the line printed above the door
   picker, so a player met "ELEVEN DOORS" directly above three of them. */
const TAGLINE = "Three doors. Three clues each. Who am I?";

/* The shared layer's tag, read from the source page rather than restated: it
   has its own plain vN lifecycle and moves without this game's tag moving. */
const SHARED = (read(`${SRC}/index.html`).match(/shared\/xi-theme\.js\?v=(v\d+)/) || [])[1];

const once = (s, from, to, what) => {
  if (!s.includes(from)) throw new Error(`rewrite "${what}": not found — ${String(from).slice(0, 70)}`);
  return s.split(from).join(to);
};

/* ---- the page ---- */
function page() {
  let s = read(`${SRC}/index.html`);

  /* IDENTITY. The name must agree in the title, og:title, JSON-LD and h1 —
     tools/aligned_test.mjs compares all four and splits each on "|" and on
     em/en dashes first, so the name carries a COLON and the dash comes after
     it. A name containing a dash would be truncated to its first half and the
     four would "agree" on the wrong thing. */
  const TITLE = `${NAME} — the daily Friends identity puzzle`;

  s = once(s, "Who Am I XI — the daily football identity puzzle | The XI Games",
    `${TITLE} | The XI Games`, "title");
  s = once(s, "Who Am I XI — the daily football identity puzzle", TITLE,
    "og:title and twitter:title");
  /* THE h1 SPELLS ITS DASH AS AN ENTITY, so the rewrite above walks straight
     past it -- &mdash; is not the character the meta tags use. Caught by the
     identity gate refusing a page whose only remaining "football" was the
     heading a screen reader announces first. */
  s = once(s, "Who Am I XI &mdash; the daily football identity puzzle",
    `${NAME} &mdash; the daily Friends identity puzzle`, "the h1");
  s = once(s, '<p class="eyebrow">The daily football identity puzzle</p>',
    `<p class="eyebrow">${TAGLINE}</p>`, "the eyebrow");
  s = once(s, '<p class="site-crumb">Football <span aria-hidden="true">/</span> <b>Who Am I</b></p>',
    '<p class="site-crumb">Friends <span aria-hidden="true">/</span> <b>Who Am I</b></p>',
    "the breadcrumb");
  s = once(s, '"name":"Who Am I XI"', `"name":"${NAME}"`, "JSON-LD name");

  /* NO SHARE CARD RATHER THAN THE WRONG GAME'S. football/whoami points at the
     football CROSSWORD's og-image; rewriting the path would name a file this
     game has not got, and pointing at football's would put football artwork on
     a Friends card. Removed until this game has 1200x630 of its own, which it
     needs before it is announced. */
  s = s.replace(/^.*<meta property="og:image[^>]*>\n/gm, "");
  s = s.replace(/^.*<meta name="twitter:image[^>]*>\n/gm, "");

  /* THE SILHOUETTE IS FOOTBALL'S. A footballer's outline over a Friends card is
     the wrong game's picture in the one place the player is looking. Dropped
     with its wrapper rather than repointed at a file that does not exist. */
  s = s.replace(/^.*<img src="\/football\/whoami\/silhouette\.png[^>]*>\n/gm, "");

  /* ---- THE COPY, WHICH IS WHERE THIS GAME STOPPED BEING FOOTBALL ---------
   *
   * The stylesheet is copied whole and the family green stays: `--pitch` is the
   * PALETTE token, not a football one, and the Friends crossword settled that
   * question on 21 September by keeping it and removing only the pitch GRAPHIC.
   * What did not get settled was the WORDS, and they were football's entire:
   * seventy-eight football terms in a Friends page, most of them not merely
   * off-brand but FACTUALLY WRONG for this deck --
   *
   *   "Eleven club doors"          it deals three
   *   "one spell of his career"    it deals a written clue
   *   "two substitutions"          it sells the round's second and third clue
   *   "the clock runs to ninety"   this deck has no clock at all
   *   "the board falls from 114"   a door here is worth 10, 6 or 3
   *   "Name him"                   the card is a character, not a he by default
   *
   * A player reading the rules would have been told four things that are not
   * true of the game in front of them, which is worse than the wrong colour.
   *
   * REWRITTEN THROUGH once(), NOT SEARCH-AND-REPLACED. A blanket swap of
   * "player" -> "character" would walk into ids, aria labels and the JSON-LD,
   * and a mangled attribute is a silent break. Each string is named. */
  const COPY = [
    ["Eleven club doors, one hidden player behind each. Pick your club, get one spell of his career, and name him. A new eleven every day from The XI Games.",
     "Three doors, one Friends character behind each. Open a door, read a clue, and say who it is. A new three every day from The XI Games.",
     "the meta description"],
    ["Eleven club doors, one hidden player behind each. Pick your club and name him.",
     "Three doors, one Friends character behind each. Open a door and say who it is.",
     "the og description"],
    ["Eleven club doors, one hidden player behind each.",
     "Three doors, one Friends character behind each.",
     "the twitter description"],
    [`<p class="ident-sub">Eleven club doors. One hidden player behind each.</p>`,
     `<p class="ident-sub">Three doors. One Friends character behind each.</p>`,
     "the identity line"],

    [`<span class="ch-hint">Club + year left</span>`,
     `<span class="ch-hint">What it is about</span>`, "the door picker's hint"],
    [`<span class="hc-title">Today&rsquo;s eleven</span>`,
     `<span class="hc-title">Today&rsquo;s three</span>`, "the today card's title"],
    [`<span class="hc-note">Pick a club. You get one spell of his career for
          nothing, and two substitutions if you need them &mdash; but the clock
          runs to ninety and the board is worth less every minute.</span>`,
     `<span class="hc-note">Open a door. The first clue is free and two more are
          there if you need them &mdash; but each one costs, so the fewer you
          take the more the door is worth.</span>`, "the today card's note"],
    [`<span class="hc-cta">Kick off</span>`,
     `<span class="hc-cta">Open a door</span>`, "the today card's button"],

    [`<span class="sc-title">One door, one player</span>`,
     `<span class="sc-title">One door, one sitting</span>`, "how to play, the title"],
    [`<li>Pick one of the eleven clubs. <b>One door a day</b> &mdash; choose
            carefully, because the other ten stay shut.</li>`,
     `<li>Pick one of the three doors. <b>One door a day</b> &mdash; choose
            carefully, because the other two stay shut.</li>`, "how to play, step 1"],
    [`<li>You get one spell of that player&rsquo;s career free: the club, the
            years, the games and the goals.</li>`,
     `<li>You get the first of that card&rsquo;s three clues free. They run
            hard to easy, so the first gives least away.</li>`, "how to play, step 2"],
    [`<li>Stuck? Two substitutions. The first shows his <b>whole career</b>,
            the second his <b>nationality and age</b>. Both cost points.</li>`,
     `<li>Stuck? Ask a friend for the <b>second clue</b>, then the
            <b>third</b>. Both cost points.</li>`, "how to play, step 3"],
    [`<li>Name him. The clock runs to ninety and the board falls from 114,
            so the sooner the better.</li>`,
     `<li>Say who it is. A door is worth <b>10, 6 or 3</b> depending on how many
            clues you took &mdash; there is no clock, so take your time.</li>`,
     "how to play, step 4"],

    [`<p class="lede" id="lede">Pick a club and the year a player left. Use his time
      there to work out who he is.</p>`,
     `<p class="lede" id="lede">Pick a door and the part of the show it comes
      from. Use the clues to work out who is behind it.</p>`, "the lede"],
    [`<span class="cm-note">Start with his appearances and goals for this club.</span>`,
     `<span class="cm-note">Start with the hardest of the three clues.</span>`,
     "the clue note"],
    [`<h2 class="waTitle">One career. One name.</h2>`,
     `<h2 class="waTitle">Three clues. One name.</h2>`, "the play heading"],
    [`<span class="pf-cap"><b>The mystery player</b>Who am I?</span>`,
     `<span class="pf-cap"><b>The mystery character</b>Who am I?</span>`,
     "the portrait caption"],
    [`<p class="guessAsk">Recognise the career?</p>`,
     `<p class="guessAsk">Recognise them?</p>`, "the guess prompt"],
    [`placeholder="Name him" aria-label="Name the player"`,
     `placeholder="Name them" aria-label="Name the character"`, "the guess box"],
    [`<button class="kick" id="guessGo" disabled>Name him</button>`,
     `<button class="kick" id="guessGo" disabled>Name them</button>`, "the guess button"],
    [`aria-label="Matching players"`, `aria-label="Matching characters"`,
     "the suggestion list"],
    [`Play this clue <span aria-hidden="true">&#8594;</span>`,
     `Open this door <span aria-hidden="true">&#8594;</span>`, "the play button"],
    [`<span class="ch-hint">Hints cost points. Your choice.</span>`,
     `<span class="ch-hint">Clues cost points. Your choice.</span>`, "the ladder hint"],
    /* "That's a wrap" rather than "Full time", and it is the one place this
       generator reaches for the theme's own language rather than neutral
       wording: the deck is a television show, and full time is a football
       whistle in a game that has no clock to stop. */
    [`<div class="eyebrow" id="doneKicker">Full time</div>`,
     `<div class="eyebrow" id="doneKicker">That&rsquo;s a wrap</div>`,
     "the end-of-round kicker"],
  ];
  for (const [from, to, what] of COPY) s = once(s, from, to, what);

  /* ---- THE ROUND SCREEN'S MARKUP ---------------------------------------
   * No match clock: "Clues seen, 1 of 3" and "Worth now, 10". And the profile
   * panel's right side, which held football's spell -- club, years,
   * appearances -- becomes the door's name and a stack the clues arrive in. */
  s = once(s, `<p class="eyebrow">Who Am I XI &middot; today&#8217;s mystery</p>`,
    `<p class="eyebrow">Who Am I XI: Friends &middot; today&#8217;s mystery</p>`,
    "the round's eyebrow");
  s = once(s, `<span class="label">Match clock</span>
          <span class="clock"><span id="clockValue">0</span><span class="prime">&#39;</span><span class="of">/ 90&#39;</span></span>`,
    `<span class="label">Clues seen</span>
          <span class="clock"><span id="clockValue">1</span><span class="of">of 3</span></span>`,
    "the clock becomes a clue count");
  s = once(s, `<span class="label">Available points</span>
          <span class="worthVal" id="worthNow">114</span>`,
    `<span class="label">Worth now</span>
          <span class="worthVal" id="worthNow">10</span>`,
    "the worth readout");
  s = once(s, `<div class="pf-facts" id="startClue">
        <span class="pf-kicker">Your starting clue &middot; included</span>
        <span class="pf-pre">I played for</span>
        <span class="pf-club" id="playClub"></span>
        <span class="pf-years" id="playLeft"></span>
        <span class="pf-nums" id="playNums"></span>
      </div>`,
    `<div class="pf-facts" id="startClue">
        <span class="pf-kicker"><span id="playLeft"></span> &middot; <span id="playClub"></span></span>
        <ol class="clueStack" id="clueStack" aria-live="polite"></ol>
        <span class="pf-nums" id="playNums" hidden></span>
      </div>`,
    "the profile panel holds the clues");
  s = once(s, `<button class="giveup" id="giveUp">Give up</button>`,
    `<button class="giveup" id="giveUp">Tell me</button>`, "the exit button");


  /* ---- THE DOOR ART DEALS THE RIGHT NUMBER OF DOORS ----------------------
   *
   * The hero draws a row of doors with one standing open and a head-and-
   * shoulders behind it. The metaphor is this game's rather than football's,
   * so it stays -- but it drew EIGHT, and this deck deals three. A picture that
   * contradicts the sentence beside it is the kind of wrong nobody reports and
   * everybody notices. Three doors of equal width across the same span, the
   * middle one open, the figure moved to its centre. */
  s = once(s, `<g class="hc-art-doors">
            <rect class="c" x="8" y="22" width="34" height="112" rx="3"/>
            <rect class="c" x="50" y="22" width="34" height="112" rx="3"/>
            <rect class="c" x="92" y="22" width="34" height="112" rx="3"/>
            <rect class="b" x="134" y="22" width="34" height="112" rx="3"/>
            <rect class="c" x="176" y="22" width="34" height="112" rx="3"/>
            <rect class="c" x="218" y="22" width="34" height="112" rx="3"/>
            <rect class="c" x="260" y="22" width="34" height="112" rx="3"/>
            <rect class="c" x="302" y="22" width="34" height="112" rx="3"/>
          </g>`,
    `<g class="hc-art-doors">
            <rect class="c" x="150" y="22" width="46" height="112" rx="3"/>
            <rect class="b" x="220" y="22" width="46" height="112" rx="3"/>
            <rect class="c" x="290" y="22" width="46" height="112" rx="3"/>
          </g>`, "the hero's doors");

  s = once(s, `<circle class="d" cx="35" cy="80" r="2.4"/><circle class="d" cx="77" cy="80" r="2.4"/>
            <circle class="d" cx="119" cy="80" r="2.4"/>
            <circle class="d" cx="203" cy="80" r="2.4"/><circle class="d" cx="245" cy="80" r="2.4"/>
            <circle class="d" cx="287" cy="80" r="2.4"/><circle class="d" cx="329" cy="80" r="2.4"/>`,
    `<circle class="d" cx="187" cy="80" r="2.4"/>
            <circle class="d" cx="327" cy="80" r="2.4"/>`, "the closed doors' handles");

  s = once(s, `<circle class="r" cx="151" cy="62" r="11"/>
            <path class="r" d="M136 102a15 15 0 0 1 30 0v22h-30Z"/>`,
    `<circle class="r" cx="243" cy="62" r="11"/>
            <path class="r" d="M228 102a15 15 0 0 1 30 0v22h-30Z"/>`,
    "the figure behind the open door");

  /* NOINDEX, because this game is generated from an INDEXED page and is not
     announced. Without it an unlisted game is one crawl from a search result. */
  s = once(s, '<link rel="canonical"',
    '<meta name="robots" content="noindex">\n<link rel="canonical"', "the noindex");

  /* THE SEASON IS NOT THIS THEME'S — the owner's ruling for Friends is a
     genuine streak and no season. See NO_SEASON in functions/_lib/games.js. */
  s = s.replace(new RegExp(`^.*<script src="/shared/xi-season\\.js\\?v=${SHARED}"></script>\\n`, "gm"), "");

  /* PATHS, then the tags for this game's own assets. */
  s = s.split(`/${SRC}/`).join(`/${OUT}/`);
  s = s.replace(/((?:css\/style\.css|js\/[a-z]+\.js)\?v=)[a-z0-9]+/g, `$1${TAG}`);

  return s;
}

/* ---- the stylesheet ---- */
function styles() {
  /* COPIED WHOLE, THEN ONE APPENDIX. Nothing is cut from football's rules; the
     round screen's new pieces are added after them, in this game's own class
     names, using only tokens the stylesheet already uses -- --pitch,
     --pitch-deep, the --wa-* set and the family gold -- so no colour is
     introduced that the family does not already wear. */
  return read(`${SRC}/css/style.css`) + FRIENDS_CSS;
}

const FRIENDS_CSS = `

/* ==== GENERATED by tools/build_friendswhoami.js: the Friends round screen ==== */

/* THE DOOR. The portrait was football's silhouette, cut on the way through
   because a footballer's outline over a Friends card is the wrong picture. What
   is behind a door here is a person nobody may see yet, so the panel IS the
   door: deep green, two recessed panels, a gold spy-hole with the question in
   it, a gold handle. Pure CSS: no image to load, and nothing to be a likeness. */
.wa-ed .pf-face{
  background:
    linear-gradient(var(--pitch-deep),var(--pitch-deep)) padding-box;
  position:relative;overflow:hidden;
}
.wa-ed .pf-face::before{
  content:"";position:absolute;left:18%;right:18%;top:10%;height:34%;
  border:2px solid rgba(255,255,255,.10);border-radius:4px;
  /* ONE PANEL, deliberately. A lower one was drawn as a box-shadow offset by
     calc(100% + 12px) -- and box-shadow offsets cannot be percentages, so the
     whole declaration was dropped and nothing drew. A pixel offset would be
     wrong at every door height but one, and one panel reads as a door. */
}
.wa-ed .pf-face::after{
  content:"";position:absolute;right:12%;top:54%;width:9px;height:9px;border-radius:50%;
  background:var(--gold);box-shadow:0 0 0 3px rgba(242,201,76,.18);
}
.wa-ed .pf-face .pf-q{
  background:var(--gold);color:var(--gold-ink, #3A2D00);
  box-shadow:0 0 0 4px rgba(242,201,76,.22),0 0 0 9px rgba(255,255,255,.06);
}
.wa-ed .pf-face .pf-cap{background:rgba(0,0,0,.28)}

/* THE KICKER NAMES THE DOOR, and it is the only fact the player had when they
   chose it -- so it sits where football's "your starting clue" did. */
.wa-ed .pf-facts .pf-kicker{display:block;margin-bottom:2px}

/* THE CLUES, hardest first, each on its own card. The sentence is the game, so
   it gets the type: larger, set as a quotation, with room around it. */
.wa-ed .clueStack{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}
.wa-ed .fclue{
  position:relative;padding:12px 14px 12px 16px;border-radius:8px;
  background:var(--wa-card, var(--paper));border:1px solid var(--wa-line, var(--line));
  box-shadow:inset 3px 0 0 var(--pitch);
}
.wa-ed .fclue + .fclue{box-shadow:inset 3px 0 0 var(--wa-gold, var(--gold))}
.wa-ed .fc-n{
  display:block;font-family:var(--disp);font-size:10.5px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink-soft);margin-bottom:4px;
}
.wa-ed .fc-text{display:block;font-size:17px;line-height:1.45;color:var(--ink);quotes:"\\201C" "\\201D"}
.wa-ed .fc-text::before{content:open-quote;color:var(--pitch);margin-right:1px}
.wa-ed .fc-text::after{content:close-quote;color:var(--pitch);margin-left:1px}
.wa-ed .fc-src{
  display:inline-block;margin-top:8px;font-size:11px;color:var(--ink-faint);
  padding-left:14px;position:relative;
}
.wa-ed .fc-src::before{content:"";position:absolute;left:0;top:50%;width:8px;height:8px;
  margin-top:-4px;border-radius:50%;background:var(--pitch);opacity:.55}
.wa-ed .fclue.fresh{animation:fclueIn .5s ease-out}
@keyframes fclueIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.wa-ed .fclue.fresh{animation:none}}

/* ONE RUNG, FULL WIDTH: the next clue and its price, or a line saying there
   are no more. Football's ladder is a grid of every rung at once. */
.wa-ed .ladder .rung-next{grid-column:1 / -1;width:100%}
.wa-ed .rung-none{grid-column:1 / -1;margin:4px 0;color:var(--ink-soft);font-size:14px}

/* THE END CARD: which door it was, and three pips for three clues -- filled
   for each one used, the last one green when it was the one that solved it. */
.wa-ed .fw-door{margin:2px 0 10px;color:var(--ink-soft)}
.wa-ed .fw-door b{color:var(--ink)}
.wa-ed .fw-pips{display:flex;gap:6px;margin:4px 0 14px}
.wa-ed .fw-pip{width:28px;height:8px;border-radius:4px;background:var(--wa-line, var(--line))}
.wa-ed .fw-pip.on{background:var(--wa-gold, var(--gold))}
.wa-ed .fw-pip.won{background:var(--pitch)}

/* The ambiguous verdict's choices, which reuse the suggestion list. */
.wa-ed .suggest .sugg{margin:4px 6px 0 0}

/* [hidden] MUST WIN. Football's .wa-ed .pf-nums{display:flex} is an author
   rule and beats the user-agent's display:none for [hidden], so a row this page
   hides still drew its top border -- a stray line under the clues. */
.wa-ed [hidden]{display:none !important}
`;

/* ---- the config, which is where the ladder lives ---- */
function config() {
  let s = read(`${SRC}/js/config.js`);

  /* THE LADDER. football buys a career and a bio; this buys the round's second
     and third clue. The increments are 4 and 3, so a door solved on the first,
     second or third clue is worth 10, 6 or 3 — the deck's own 3:2:1, scaled so
     that eleven doors make 110, which is what the Friends crossword is scored
     out of. wa-play.js sums these as increments, so they are not totals. */
  /* THE MATCHING BRACKET, WALKED RATHER THAN SEARCHED FOR. The first version
     took the next "]" after "{ stage: 3", which is the one inside
     reveals: ['bio'] -- so it spliced mid-array and produced a config that did
     not parse. node --check caught it; nothing else would have until the page
     loaded. A nested bracket is exactly what indexOf cannot see. */
  const from = s.indexOf("LADDER: [");
  if (from < 0) throw new Error('rewrite "the ladder": LADDER block not found');
  let depth = 0, to = -1;
  for (let i = s.indexOf("[", from); i < s.length; i++) {
    if (s[i] === "[") depth++;
    else if (s[i] === "]" && --depth === 0) { to = i; break; }
  }
  if (to < 0) throw new Error('rewrite "the ladder": LADDER is never closed');
  s = s.slice(0, from) + `LADDER: [
      /* GENERATED by tools/build_friendswhoami.js. A round deals three clues,
         hard to easy; the first is free and the next two cost. */
      { stage: 1, points: 0, sub: 0, label: 'First clue',  reveals: ['clue'] },
      { stage: 2, points: 4, sub: 1, label: 'Second clue', reveals: ['clue'] },
      { stage: 3, points: 3, sub: 2, label: 'Third clue',  reveals: ['clue'] }
    ` + s.slice(to);

  /* THE EXIT'S LABEL, which the server also holds as FR_GIVE_UP.label. Two
     copies, and they disagreed: the page drew "Give up" while the response
     carried "Tell me". Whichever a player saw would depend on which side drew
     that button last, which is the drift this project traces every major bug
     back to. The server's wording wins, because the server's is the one sent
     with the board. */
  s = once(s, "GIVE_UP: { label: 'Give up', reveals: ['answer'] },",
    "GIVE_UP: { label: 'Tell me', reveals: ['answer'] },", "the exit's label");

  s = s.split('"whoami"').join('"whoami_fr"').split("'whoami'").join("'whoami_fr'");
  s = s.split(`/${SRC}/`).join(`/${OUT}/`);
  return s;
}

/* ---- REPLACING A FUNCTION WHOLE ------------------------------------------
 *
 * Finds `function NAME(` at the client's two-space indent and walks to its
 * matching close brace, skipping string literals, template literals and
 * comments so a brace inside a string cannot end the walk early. Refuses if the
 * name is not found exactly once, if the body it cut does not contain `marker`
 * -- proof it cut the function it meant to rather than one that happens to share
 * a prefix -- or if the walk never closes.
 */
function replaceFn(s, name, marker, replacement) {
  const head = "\n  function " + name + "(";
  const first = s.indexOf(head);
  if (first < 0 || s.indexOf(head, first + 1) > -1) {
    throw new Error(`replace "${name}": found ${first < 0 ? 0 : "more than one"}, want 1`);
  }
  const start = first + 1;
  let i = s.indexOf("{", start), depth = 0, end = -1;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === "/" && d === "/") { i = s.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && d === "*") { i = s.indexOf("*/", i + 2) + 2; if (i < 2) break; continue; }
    if (c === "'" || c === '"' || c === "`") {
      for (i++; i < s.length && s[i] !== c; i++) if (s[i] === "\\") i++;
      i++; continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { end = i + 1; break; }
    i++;
  }
  if (end < 0) throw new Error(`replace "${name}": the walk never closed`);
  const body = s.slice(start, end);
  if (!body.includes(marker)) {
    throw new Error(`replace "${name}": cut ${body.length} chars without "${marker}" in them`);
  }
  return s.slice(0, start) + replacement.trim() + s.slice(end);
}

/* ---- the script ---- */
function script() {
  let s = read(`${SRC}/js/game.js`);

  /* ---- THE ROUND SCREEN IS THIS GAME'S --------------------------------
   *
   * Replaced whole rather than patched: football's renderer draws a spell, a
   * career and a birth year, and this deck sends a sentence. See the long note
   * at replaceFn() for what the copy-and-rewrite version actually showed a
   * player -- the clue text was read in zero places. */

  /* NO CLOCK: the deck is a party game read aloud and its score does not move
     with time. The strip and the number that used to show the match minute
     show how many of the three clues are out, and "worth now" is the ladder's
     10, 6 or 3 -- never a curve. */
  s = replaceFn(s, "renderClock", "displayMinute()", `
  function renderClock() {
    var total = LADDER.length || 3;
    var seen = Math.min(Math.max(1, state.stage || 1), total);
    var worth = Math.max(0, (MAX_SCORE || 10) - (state.pointsSpent || 0));
    var key = seen + ':' + worth;
    if (key === clock.shown) return;
    clock.shown = key;
    el.clockValue.textContent = seen;
    el.stripFill.style.width = Math.min(100, (seen / total) * 100) + '%';
    el.stripFill.classList.toggle('late', seen >= total);
    el.worthNow.textContent = worth;
    el.worthNow.classList.toggle('low', worth <= 3);
  }`);

  /* THE STACK OF CLUES, one per rung, hardest first. Drawn once each: a
     replayed rung (a reload, a resume) finds its own step already on the card
     and adds nothing. The exit's reveal carries an answer and no text, and is
     showDone's to show. */
  s = replaceFn(s, "renderClue", "r.spell", `
  function renderClue(r) {
    var stack = document.getElementById('clueStack');
    if (!stack || !r || !r.text) return;
    var n = Number(r.step) || Number(r.stage) || 1;
    if (stack.querySelector('[data-step="' + n + '"]')) return;
    var of = Number(r.of) || LADDER.length || 3;
    var tier = n === 1 ? 'the hardest' : (n >= of ? 'the easiest' : 'getting warmer');
    var li = document.createElement('li');
    li.className = 'fclue';
    li.setAttribute('data-step', n);
    li.innerHTML =
      '<span class="fc-n">Clue ' + n + ' of ' + of + ' &middot; ' + tier + '</span>' +
      '<q class="fc-text">' + esc(r.text) + '</q>' +
      (r.cited ? '<span class="fc-src">On record in an episode</span>' : '');
    var before = null;
    [].forEach.call(stack.children, function (c) {
      if (!before && Number(c.getAttribute('data-step')) > n) before = c;
    });
    stack.insertBefore(li, before);
    li.classList.add('fresh');
    setTimeout(function () { li.classList.remove('fresh'); }, 900);
  }`);

  /* ONE BUTTON: THE NEXT CLUE. Football offers every untaken rung at once; here
     the clues are bought in order and a third bought before the second would
     charge for a sentence the player never saw. So the ladder is the next rung
     or, when there is none, a line saying so. */
  s = replaceFn(s, "renderLadder", "rung.sub", `
  function renderLadder() {
    el.ladder.innerHTML = '';
    var next = null;
    LADDER.forEach(function (rung) { if (!next && rung.stage > state.stage) next = rung; });
    if (next && !state.finished) {
      var b = document.createElement('button');
      b.className = 'rung rung-next';
      b.type = 'button';
      b.setAttribute('aria-label',
        'Ask a friend for clue ' + next.stage + ', costs ' + next.points + ' points');
      b.innerHTML = '<span class="r-sub">Ask a friend</span>' +
        '<span class="r-label">Clue ' + esc(next.stage) + ' of ' + (LADDER.length || 3) + '</span>' +
        '<span class="r-cost">&minus;' + esc(next.points) + '</span>';
      b.addEventListener('click', function () { buyStage(next.stage); });
      el.ladder.appendChild(b);
    } else if (!state.finished) {
      var none = document.createElement('p');
      none.className = 'rung-none';
      none.textContent = 'That was the last clue. Over to you.';
      el.ladder.appendChild(none);
    }
    el.giveUp.hidden = !!state.finished;
  }`);

  /* buyStage RETURNS ITS PROMISE, so a resumed round can replay every clue it
     had bought in order. The call is the same one the original made. */
  s = replaceFn(s, "buyStage", "renderClue(r)", `
  function buyStage(stage) {
    if (busy) return Promise.resolve();
    busy = true;
    return post('/api/whoami/clue', { playId: state.playId, stage: stage })
      .then(function (r) {
        busy = false;
        state.stage = Math.max(state.stage, r.stage);
        state.pointsSpent = r.pointsSpent;
        renderClock();
        renderClue(r);
        renderLadder();
        save();
      })
      .catch(function (e) { busy = false; trouble(e); });
  }`);

  /* THE VERDICTS THIS SERVER SENDS. right, other, ambiguous, wrong -- and
     'other' is the near miss: a name that IS an answer, to a different card.
     'ambiguous' comes with the cards one word surfaces, offered as buttons that
     fill the box, because picking between them is the player's job and not the
     page's. No answer in any wrong response. */
  s = replaceFn(s, "submitGuess", "right-club", `
  function submitGuess() {
    if (busy || state.finished) return;
    var typed = el.guessInput.value.trim();
    if (!typed) return;
    busy = true;
    el.guessGo.disabled = true;
    el.suggest.innerHTML = '';

    post('/api/whoami/guess', { playId: state.playId, guess: typed })
      .then(function (r) {
        busy = false;
        state.guesses.push({ guess: typed, verdict: r.verdict });
        state.pointsSpent = r.pointsSpent != null ? r.pointsSpent : state.pointsSpent;
        renderTries();
        save();

        if (r.verdict === 'right') {
          state.finished = true;
          state.solved = true;
          renderClock();
          setFeedback('That\\u2019s them \\u2014 ' + r.score +
            (r.score === 1 ? ' point.' : ' points.'), 'goal');
          finish();
          return;
        }
        if (r.verdict === 'other') {
          setFeedback('That\\u2019s someone else in the deck \\u2014 but not the one behind this door.', 'near');
        } else if (r.verdict === 'ambiguous' && r.options && r.options.length) {
          setFeedback('That could be more than one. Did you mean\\u2026', 'near');
          r.options.slice(0, 6).forEach(function (name) {
            var o = document.createElement('button');
            o.type = 'button';
            o.className = 'sugg';
            o.textContent = name;
            o.addEventListener('click', function () {
              el.guessInput.value = name;
              el.suggest.innerHTML = '';
              el.guessGo.disabled = false;
              el.guessInput.focus();
            });
            el.suggest.appendChild(o);
          });
        } else {
          setFeedback('Not them.', 'miss');
        }
        el.guessInput.value = '';
        el.guessInput.focus();
      })
      .catch(trouble);
  }`);

  s = replaceFn(s, "renderTries", "right-club", `
  function renderTries() {
    var n = state.guesses.length;
    var near = state.guesses.filter(function (g) { return g.verdict === 'other'; }).length;
    el.tries.textContent = n
      ? n + (n === 1 ? ' name tried' : ' names tried') +
        (near ? ', ' + near + ' from elsewhere in the deck' : '')
      : '';
  }`);

  /* THE END OF A ROUND. The card's name, the door it was behind, the score out
     of what a door is worth, and how many of the three clues it took. No
     career, no article, no club: this deck has none of them to show. */
  s = replaceFn(s, "showDone", "Got him", `
  function showDone(r) {
    var solved = r ? r.solved : state.solved;
    var total = LADDER.length || 3;
    var used = r && r.subsUsed != null ? r.subsUsed + 1 : Math.min(state.stage || 1, total);
    var row = function (k, v) {
      return '<div class="row"><span class="rowLabel">' + k + '</span><span>' + v + '</span></div>';
    };
    el.doneKicker.textContent = solved ? 'Got them' : 'That\\u2019s a wrap';
    var html = '<div class="verdict">' + (solved ? 'Solved' : 'Not this time') + '</div>';
    if (r && r.answer) {
      html += '<div class="bigname">' + esc(r.answer) + '</div>';
      if (r.section) html += '<div class="fw-door">Behind the <b>' + esc(r.section) + '</b> door</div>';
    }
    html += '<div class="fw-pips" aria-label="' + used + ' of ' + total + ' clues used">';
    for (var i = 1; i <= total; i++) {
      html += '<span class="fw-pip' + (i <= used ? ' on' : '') +
        (solved && i === used ? ' won' : '') + '"></span>';
    }
    html += '</div><div class="rows">';
    if (r && typeof r.score === 'number') html += row('Score', r.score + ' of ' + (MAX_SCORE || 10));
    html += row('Clues used', used + ' of ' + total);
    html += row('Names tried', r ? r.guesses : state.guesses.length);
    if (r && r.nearMisses) html += row('Named someone else', r.nearMisses);
    html += '</div>';
    el.doneBody.innerHTML = html;
    el.shareText.value = shareTextFor(r, solved);
    var shareRow = document.getElementById("shareRow");
    if (window.XIShare && shareRow) {
      window.XIShare.mount(shareRow, {
        text: function () { return el.shareText.value; },
        url: function () { return location.href; },
      });
    }
    show('screenDone');
  }`);

  /* THE SHARE TEXT NAMES NOBODY. The other two doors are still live for
     everybody else today; a result pasted into a group chat says how it went
     in squares, not who it was. */
  s = replaceFn(s, "shareTextFor", "WHO AM I XI", `
  function shareTextFor(r, solved) {
    var total = LADDER.length || 3;
    var used = r && r.subsUsed != null ? r.subsUsed + 1 : Math.min(state.stage || 1, total);
    var bar = '';
    for (var i = 1; i <= total; i++) {
      bar += i > used ? '\\u2B1C' : (solved && i === used ? '\\uD83D\\uDFE9' : '\\uD83D\\uDFE8');
    }
    return [
      'WHO AM I XI: FRIENDS',
      'No. ' + BOARD.no + ' \\u2014 ' + formatDate(BOARD.day),
      '',
      bar + (solved ? '  got them' : '  no luck'),
      (r && typeof r.score === 'number' ? r.score + '/' + (MAX_SCORE || 10) : ''),
      'Names tried: ' + (r ? r.guesses : state.guesses.length)
    ].join('\\n');
  }`);

  /* THE DOOR, NAMED ON THE CARD, when a round opens or resumes. And a resumed
     round REPLAYS every clue it had bought, in order -- football replays only
     the free one, so a player who reloaded after buying two clues came back to
     one. The replays are free: the server charges only for a rung not already
     paid for. */
  const OPEN_DOOR = `el.playClub.textContent = door.club;
        el.playLeft.textContent = 'left in ' + door.leave;`;
  const OPEN_DOOR_FR = `el.playClub.textContent = door.section;
        el.playLeft.textContent = 'Door ' + door.slot;
        var stack0 = document.getElementById('clueStack');
        if (stack0) stack0.innerHTML = '';`;
  if (!s.includes(OPEN_DOOR)) throw new Error('rewrite "openDoor door label": not found');
  s = s.split(OPEN_DOOR).join(OPEN_DOOR_FR);

  const RESUME = `el.playClub.textContent = door.club;
    el.playLeft.textContent = 'left in ' + door.leave;`;
  const RESUME_FR = `el.playClub.textContent = door.section;
    el.playLeft.textContent = 'Door ' + door.slot;
    var stack1 = document.getElementById('clueStack');
    if (stack1) stack1.innerHTML = '';`;
  if (!s.includes(RESUME)) throw new Error('rewrite "resumeDoor door label": not found');
  s = s.split(RESUME).join(RESUME_FR);

  const REPLAY = `    /* The free rung again — replayed, charged nothing, and it brings the
       minute and what the board is worth back with it. */
    buyStage(1);
  }`;
  const REPLAY_FR = `    /* EVERY RUNG THAT WAS BOUGHT, in order, each replayed for nothing. */
    var upTo = Math.max(1, state.stage || 1);
    var chain = Promise.resolve();
    for (var st = 1; st <= upTo; st++) {
      (function (k) { chain = chain.then(function () { return buyStage(k); }); })(st);
    }
  }`;
  if (!s.includes(REPLAY)) throw new Error('rewrite "resumeDoor replay": not found');
  s = s.split(REPLAY).join(REPLAY_FR);

  s = once(s, "el.commitPick.textContent = d.club + ' · ' + d.leave;",
    "el.commitPick.textContent = 'Door ' + d.slot + ' \\u00B7 ' + d.section;",
    "the chosen door's label");


  /* THE API IS THIS GAME'S, AND IT IS SEVEN CALLS RATHER THAN ONE.
   *
   * THIS SAID "every call goes through one api() helper, so this is one
   * insertion rather than seven edits" AND USED once() TO PROVE IT. once()
   * refuses unless it finds exactly one occurrence, it found exactly one, and
   * it passed -- because it was looking for a DOUBLE-quoted `"/api/whoami/`
   * and football's client writes exactly one of those, the daily. The other
   * six are single-quoted: post('/api/whoami/play', ...) and its five
   * siblings. There is no api() helper. The check confirmed the assumption
   * that wrote it, which is the shape of vacuous check this project has found
   * six of.
   *
   * WHAT IT WOULD HAVE SHIPPED, and it is not a cosmetic bug: the page would
   * have read its BOARD from the Friends deck and done everything else against
   * FOOTBALL's -- opening a round in wa_round, buying a footballer's spell,
   * and being judged against whoever stood behind football's door for that
   * slot. Separate round and guess tables were added to make exactly that
   * unrepresentable on the server; a client addressing the wrong endpoints
   * walks around them, because from the server's side it is simply a football
   * player playing football.
   *
   * SO IT IS REWRITTEN BY PATH AND NOT BY QUOTE, and then counted BOTH WAYS:
   * nothing may still address the legacy form, and as many namespaced calls
   * must come out as there were calls going in. A prohibition on its own
   * passes a file with no calls at all. */
  const WANT = (read(`${SRC}/js/game.js`).match(/\/api\/whoami\/[a-z]+/g) || []).length;
  if (WANT < 2) {
    throw new Error('rewrite "the API base": found ' + WANT +
      " whoami call(s) in football's client — that cannot be right, and a " +
      "rewrite that finds nothing must not report success");
  }
  s = s.split("/api/whoami/").join("/api/whoami/whoami_fr/");

  const stragglers = s.match(/\/api\/whoami\/(?!whoami_fr\/)[a-z]+/g) || [];
  if (stragglers.length) {
    throw new Error('rewrite "the API base": ' + stragglers.length +
      " call(s) still address football's deck: " + [...new Set(stragglers)].join(", "));
  }
  const moved = s.match(/\/api\/whoami\/whoami_fr\/[a-z]+/g) || [];
  if (moved.length !== WANT) {
    throw new Error('rewrite "the API base": ' + WANT + " call(s) went in and " +
      moved.length + " came out namespaced");
  }

  /* THE SCRIPT SAYS THE GAME'S NAME TOO, and it is the one the player actually
     reads: the hero falls back to it whenever there is no board, which is every
     day before a deck is imported and every day after the calendar runs out.
     It said "Who Am I XI" -- football's name -- on a Friends page carrying the
     Friends name in its title, its crumb and its masthead. Four agreeing and
     one not is worse than all five being wrong, because only the odd one out
     looks like a mistake in the game rather than in the branding. */
  s = once(s, 'hero.querySelector(".hc-title").textContent = "Who Am I XI";',
    `hero.querySelector(".hc-title").textContent = "${NAME}";`, "the hero's fallback name");
  s = once(s,
    '"There is no Who Am I board for today. That is not a connection problem, so trying again will not help."',
    '"There is no board for today. That is not a connection problem, so trying again will not help."',
    "the no-board message");

  /* ---- WHAT A DOOR IS MADE OF, AND WHAT THE PLAYER IS TOLD --------------
   *
   * Everything below is the same class of fix as the page copy, with one
   * difference that matters: the first three are not wording. football's door
   * carries { club, leave_year } and this deck's carries { section, deck }, so
   * a client asking for d.club renders an empty door with a caption about a
   * year nobody left. The board would have been unplayable. */
  /* THE DECK IS INTERNAL VOCABULARY AND MUST NOT REACH A PLAYER. The importer
     calls them main, expert and location; a door was printing "main" in the
     largest type on the card, which tells a reader nothing and reads like a
     leaked field name. The two that are ever dealt as a daily get a word each.
     Mapped rather than renamed at the source, because the bank's names are the
     bank's and this repository does not own them. */
  s = once(s, 'var BUILD = ', `var DECK_WORD = { main: 'Everyday', expert: 'Deep cut' };
var BUILD = `, "the deck words");

  const PLAY = [
    [`? (mine ? d.club + ', left in ' + d.leave + ' — the clue you played'
                : d.club + ', left in ' + d.leave + ' — not yours today')
        : d.club + ', left the club in ' + d.leave);`,
     `? (mine ? d.section + ' — the door you opened'
                : d.section + ' — not yours today')
        : d.section + ', ' + (DECK_WORD[d.deck] || d.deck));`,
     "the door's spoken label"],

    [`b.innerHTML = '<span class="d-club">' + esc(d.club) + '</span>' +
        '<span class="d-year">' + esc(d.leave) + '</span>' +
        '<span class="d-cap">Year left the club</span>' +`,
     `b.innerHTML = '<span class="d-club">' + esc(d.section) + '</span>' +
        '<span class="d-year">' + esc(DECK_WORD[d.deck] || d.deck) + '</span>' +
        '<span class="d-cap">How deep it goes</span>' +`,
     "the door's face"],

    [`? (state.solved
            ? 'You got yours today. The other ten are somebody else\\u2019s.'
            : 'That was your go today. The other ten are somebody else\\u2019s.')
        : 'Pick a club. One player behind each door, and you get one go at him.';`,
     `? (state.solved
            ? 'You got yours today. The other two are somebody else\\u2019s.'
            : 'That was your go today. The other two are somebody else\\u2019s.')
        : 'Pick a door. One character behind each, and you get one go at them.';`,
     "the lede under the doors"],

    /* THE MECHANISM LINE COUNTED CAREERS, which this deck does not send -- the
       expression fell to '' and the line simply vanished. Silent rather than
       broken, but a sentence that explains the board is worth having, so it
       says the thing that IS true here: three doors, three clues behind each,
       one of them yours. */
    [`el.mechanism.textContent = (spells && players)
        ? 'Today’s ' + spells + ' club spells come from ' + players +
          (players === 1 ? ' career.' : ' careers.') +
          (players < spells ? ' Some choices lead to the same player.' : '') +
          ' Choose one clue to play.'
        : '';`,
     `el.mechanism.textContent = spells
        ? 'Today’s ' + spells + ' doors each hide one character, with three clues behind them. Choose one to play.'
        : '';`, "the mechanism line"],



  ];
  for (const [from, to, what] of PLAY) s = once(s, from, to, what);

  /* IDENTITY and STORAGE. Each game keeps its own corner of localStorage and
     may never write another's. */
  s = s.split('"whoami"').join('"whoami_fr"').split("'whoami'").join("'whoami_fr'");
  s = s.split('"xiwa.').join('"xifw.').split("'xiwa.").join("'xifw.");

  /* THE PLAY KEY, WHICH IS THE RESULT KEY, AND IT IS ASKED FOR RATHER THAN
   * WRITTEN OUT.
   *
   * The client sends `boardKey: 'wa:' + BOARD.day` when it opens a play, and
   * the server banks the result under entryKey(), which for this game is
   * "frwa:<day>". Left alone, the generated client filed its plays under
   * football's prefix -- and not merely under a DIFFERENT key from its own
   * results, which would be bad enough: under the SAME key football's client
   * uses for the same day. Both decks run every day, so that is a collision on
   * day one, not a mismatch that shows up eventually.
   *
   * THE PREFIX COMES FROM games.js, so the client and the server cannot come to
   * disagree about it. Writing "frwa:" here would be a second copy of a fact
   * that already has a home, and a second copy is the thing this project traces
   * every major bug back to. */
  const KEY_PREFIX = String(entryKey(GAME, { day: "2026-09-22" }) || "").split(":")[0];
  if (!KEY_PREFIX) {
    throw new Error('rewrite "the play key": games.js gives this game no entry ' +
      "key, so there is no prefix to file its plays under");
  }
  const KEY_RE = /boardKey:\s*(['"])[a-z]+:\1/g;
  const sent = (s.match(KEY_RE) || []).length;
  if (!sent) {
    throw new Error('rewrite "the play key": the source client sends no ' +
      "boardKey — a rewrite that finds nothing must not report success");
  }
  s = s.replace(KEY_RE, (m, q) => "boardKey: " + q + KEY_PREFIX + ":" + q);
  const landed = (s.match(KEY_RE) || [])
    .filter((m) => m.indexOf(KEY_PREFIX + ":") > -1).length;
  if (landed !== sent) {
    throw new Error('rewrite "the play key": ' + sent + " sent in and " + landed +
      " came out under " + KEY_PREFIX + ":");
  }
  s = s.split(`/${SRC}/`).join(`/${OUT}/`);
  s = s.replace(/var BUILD = "[^"]*"/, `var BUILD = "${TAG}"`);
  return s;
}

/* ---- what may still say football ---- */
export const ALLOWED = [
  "The XI Games",
  "/api/play",
  "/api/account/state",
  /* The site's one privacy policy, at the address it has. Linking it is not
     this game claiming to be football's; it is one document with one URL. */
  "/football/crossword/privacy.html",
];

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
    if (!/football|Football|\bxiwa\./.test(lines[i])) continue;
    if (ALLOWED.some((a) => lines[i].includes(a))) continue;
    hits.push(`    ${what}:${i + 1}  ${raw[i].trim().slice(0, 100)}`);
  }
  return hits;
}

/* ---- write, or refuse ---- */
const FILES = [
  [`${OUT}/index.html`, page],
  [`${OUT}/css/style.css`, styles],
  [`${OUT}/js/config.js`, config],
  [`${OUT}/js/game.js`, script],
];

let bad = 0;
for (const [rel, make] of FILES) {
  let want;
  try { want = make(); }
  catch (e) { console.log(`REFUSED: ${rel} — ${e.message}`); bad++; continue; }

  /* IT MUST PARSE, AND THE GENERATOR IS WHAT SAYS SO.
   *
   * This wrote a game.js containing a single-quoted string that spanned three
   * lines -- invalid JavaScript -- and reported "wrote friends/whoami/js/game.js"
   * with no complaint. A `node --check` run afterwards is what caught it, which
   * means the generator's own success meant nothing about whether its product
   * could run. The page would have loaded, the script would have thrown on the
   * first byte, and the board would never have drawn.
   *
   * CHECKED WITH THE REAL PARSER rather than a regex: acorn is a CI dependency
   * and is not installed when the gates run, so this uses vm.Script, which is
   * V8's own and always present. It compiles without executing -- nothing in
   * the generated file runs here. */
  if (/\.js$/.test(rel)) {
    try {
      new vm.Script(want, { filename: rel });
    } catch (e) {
      console.log(`REFUSED: ${rel} does not parse — ${e.message}`);
      bad++;
      continue;
    }
  }

  const leaks = leftovers(want, rel);
  if (leaks.length) {
    console.log(`REFUSED: ${rel} still carries the other game's identity — ${leaks.length} place(s):`);
    leaks.slice(0, 6).forEach((l) => console.log(l));
    bad++;
    continue;
  }

  const at = path.join(ROOT, rel);
  const have = readTextIfExists(at);
  if (CHECK) {
    if (have === want) console.log(`  ok  ${rel}`);
    else { console.log(`REFUSED: ${rel} is not what ${SRC}/ produces. Run node tools/build_friendswhoami.js`); bad++; }
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
