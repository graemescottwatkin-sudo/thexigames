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
import { fileURLToPath } from "node:url";
import { entryKey } from "../functions/_lib/games.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CHECK = process.argv.includes("--check");

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const GAME = "whoami_fr";
const SRC = "football/whoami";
const OUT = "friends/whoami";

/* THE TAG LIVES HERE, written into every generated file. Bump, regenerate. */
const TAG = "v001a";

const NAME = "Who Am I XI: Friends";
const TAGLINE = "Eleven doors. Three clues each. Who am I?";

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
  /* NOTHING TO CUT. The crossword's generator removes a league table and turns
     off a pitch; this page has neither. Copied whole, and the identity gate
     below is what says so rather than an assumption. */
  return read(`${SRC}/css/style.css`);
}

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

  s = s.split('"whoami"').join('"whoami_fr"').split("'whoami'").join("'whoami_fr'");
  s = s.split(`/${SRC}/`).join(`/${OUT}/`);
  return s;
}

/* ---- the script ---- */
function script() {
  let s = read(`${SRC}/js/game.js`);

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

  const leaks = leftovers(want, rel);
  if (leaks.length) {
    console.log(`REFUSED: ${rel} still carries the other game's identity — ${leaks.length} place(s):`);
    leaks.slice(0, 6).forEach((l) => console.log(l));
    bad++;
    continue;
  }

  const at = path.join(ROOT, rel);
  const have = fs.existsSync(at) ? fs.readFileSync(at, "utf8") : null;
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
