#!/usr/bin/env node
/* tools/build_friendsquickfire.js — friends/quickfire/ is PRODUCED, not written.
 *
 *   node tools/build_friendsquickfire.js            writes the page
 *   node tools/build_friendsquickfire.js --check    fails if it has drifted
 *
 * QuickFire XI: Friends (the owner, 30 Sep 2026: add it "the way Lightning
 * Round was added", reusing the football engine; first daily 29 Sep). Its page
 * is football QuickFire's with one set of Friends rewrites, so the two cannot
 * drift and every fix to the football page lands in both. The server is the
 * same engine too, one set per game (functions/_lib/qf-sets.js).
 *
 * WHAT CHANGES, AND ONLY THAT (the owner's two rulings of 30 Sep 2026):
 *   - "Seconds, same pace": football's thirty seconds a question and its
 *     10/7/4 speed scoring, shown as a countdown in seconds -- never a 90'
 *     match clock. The engine still counts its ninety units a question; only
 *     what the player reads changes.
 *   - "Skip": football's three substitutions, in Friends words. Free, as
 *     football's are.
 *   - the words: a Friends quiz, not football's -- no goals, no full time, no
 *     subs, no kick-off; no season, which is football's alone;
 *   - identity: its own game id, storage prefix (xifq.), result key (frqf:),
 *     address and API (/api/quickfire_fr/*, the Friends set's tables).
 * What stays is the engine: four options, the clock, the bands, the wrong-pick
 * penalty, the skips, the locked screen, Full Time.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { readText, readTextIfExists } from "./text.js";
import { UNLISTED } from "../functions/_lib/games.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const read = (p) => readText(path.join(ROOT, p));

/* THE TAG LIVES HERE, written into every generated file. Bump, regenerate. */
const TAG = "v001d";

const SRC = "football/quickfire", OUT = "friends/quickfire";
const ID = "quickfire_fr", NAME = "QuickFire XI: Friends";

const once = (s, from, to, what) => {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`rewrite "${what}": found ${n}, want 1 — ${String(from).slice(0, 70)}`);
  return s.split(from).join(to);
};
const all = (s, from, to, what) => {
  if (!s.includes(from)) throw new Error(`rewrite "${what}": not found — ${String(from).slice(0, 70)}`);
  return s.split(from).join(to);
};
/* A meta tag's whole content, by its name or property. */
const meta = (s, attr, value, what) => {
  const re = new RegExp(`(<meta ${attr} content=")[^"]*(">)`);
  if (!re.test(s)) throw new Error(`rewrite "${what}": not found`);
  return s.replace(re, `$1${value}$2`);
};

/* ---- the page -------------------------------------------------------------- */

const DESC = "Eleven Friends questions, four answers each, thirty seconds a question: the faster you answer, the more it is worth. A new quiz every day.";
const SHORT = "Eleven Friends questions, four answers each, thirty seconds a question. Answer quickly, score more.";

const HOW = `    <p><b>Eleven quick questions about Friends.</b> Pick one of the four answers.</p>
    <p><b>Beat the countdown.</b> Each question has thirty seconds. Right with more than 18 seconds left is 10 points, with more than 10 left 7, any time before it runs out 4.</p>
    <p><b>Get all eleven right</b> for 4 more: 114 in all.</p>
    <p><b>Wrong answer?</b> No points, and you see the right one.</p>
    <p><b>Three skips.</b> Don't fancy a question? Skip it for another, free.</p>
`;

function page() {
  let s = read(`${SRC}/index.html`);

  /* IDENTITY: the name agrees in the title, og/twitter titles, JSON-LD and
     h1, which tools/aligned_test.mjs compares. */
  s = once(s, "<title>QuickFire XI — the daily football quiz | The XI Games</title>",
    `<title>${NAME} — the daily Friends quiz | The XI Games</title>`, "title");
  s = meta(s, 'name="description"', DESC, "the description");
  s = meta(s, 'property="og:title"', `${NAME} — the daily Friends quiz`, "og:title");
  s = meta(s, 'property="og:description"', SHORT, "og:description");
  s = meta(s, 'name="twitter:title"', `${NAME} — the daily Friends quiz`, "twitter:title");
  s = meta(s, 'name="twitter:description"', SHORT, "twitter:description");
  s = once(s, '"name":"QuickFire XI"', `"name":"${NAME}"`, "JSON-LD name");
  s = once(s, "<h1>QuickFire XI</h1>", `<h1>${NAME}</h1>`, "the h1");
  s = once(s, '<p class="pmDate">QuickFire XI</p>', `<p class="pmDate">${NAME}</p>`, "the loading card");
  s = once(s, '<div class="eyebrow">QuickFire XI</div>', `<div class="eyebrow">${NAME}</div>`, "the archive card");

  /* NO SHARE CARD RATHER THAN FOOTBALL'S (and the comment that explains the
     one football uses): this game has no artwork of its own yet. */
  s = s.replace(/<!-- A PLACEHOLDER CARD[\s\S]*?-->\n/, "");
  s = s.replace(/^.*<meta property="og:image[^>]*>\n/gm, "");

  /* NOINDEX WHILE UNLISTED: generated from an indexed page. */
  if (UNLISTED[ID]) {
    s = once(s, '<link rel="canonical"', '<meta name="robots" content="noindex">\n<link rel="canonical"', "the noindex");
  }

  /* THE WORDS ON THE CARD AND THE BOARD. */
  s = once(s, `<p class="pmLede" id="startBlurb">Eleven questions, each with four
        answers, each on a 0' to 90' clock. The longer you take, the less the
        right one is worth.</p>`, `<p class="pmLede" id="startBlurb">Eleven Friends questions, four
        answers each, thirty seconds a question. The quicker you answer, the
        more the right one is worth.</p>`, "the card's blurb");
  s = once(s, '<button class="kick" id="kickOff">Kick off</button>', '<button class="kick" id="kickOff">Start</button>', "the start button");
  s = once(s, `<span class="clock"><span id="clockValue">0</span><span class="prime">'</span></span>`,
    `<span class="clock"><span id="clockValue">30</span><span class="prime">s</span></span>`, "the clock");
  s = once(s, "<span>Sub it off</span>", "<span>Skip</span>", "the skip button");
  s = once(s, '<span class="worthVal" id="worthNow">100</span>', '<span class="worthVal" id="worthNow">10</span>', "worth now");

  /* THE RULES, this game's. */
  const a = s.indexOf("    <h2>How to play</h2>\n");
  const b = s.indexOf("  </section>", a);
  if (a < 0 || b < 0) throw new Error('rewrite "the rules": not found');
  s = s.slice(0, a) + "    <h2>How to play</h2>\n" + HOW + s.slice(b);

  /* NO SEASON: the Friends streak is xi-played's; the season is football's. */
  s = s.replace(/^<script src="\/shared\/xi-season\.js\?v=v\d+"><\/script>\n/m, "");

  /* ADDRESS AND ASSETS. */
  s = all(s, "https://www.thexigames.com/football/quickfire/", "https://www.thexigames.com/friends/quickfire/", "the page's address");
  s = s.replace(/((?:css\/style\.css|js\/game\.js|js\/config\.js)\?v=)v[0-9a-z]+/g, `$1${TAG}`);
  return s;
}

/* ---- the script -------------------------------------------------------------- */

function script() {
  let s = read(`${SRC}/js/game.js`);
  s = s.replace(/var BUILD = "[^"]*"/, `var BUILD = "${TAG}"`);

  /* IDENTITY: its own API, storage, result key and name. */
  s = all(s, "'/api/quickfire/", "'/api/quickfire_fr/", "the API");
  s = once(s, '"/api/quickfire/daily"', '"/api/quickfire_fr/daily"', "the daily route");
  s = once(s, 'var PREFIX = "qfx.";', 'var PREFIX = "xifq.";', "the storage prefix");
  s = once(s, "boardKey: 'qf:' + board.day", "boardKey: 'frqf:' + board.day", "the result key");
  s = all(s, "game: 'quickfire'", `game: '${ID}'`, "the game id");
  /* AND IN DOUBLE QUOTES, where the account sync writes it. Only the single-
     quoted form was rewritten from 30 Sep 2026, so the Friends page pushed
     its results, and pulled them back, as football's "quickfire": keyed
     qf:<day> rather than frqf:<day>, on the same day as football's, where
     first-banked-wins threw one of the two away. Found 3 Oct 2026. */
  s = all(s, 'game: "quickfire"', `game: "${ID}"`, "the account game id");
  s = once(s, '"/api/account/results?game=quickfire"', `"/api/account/results?game=${ID}"`, "the account pull");
  s = all(s, "'QuickFire XI'", `'${NAME}'`, "the name");
  s = once(s, "'QuickFire XI · No. '", `'${NAME} · No. '`, "the share line");

  /* SECONDS, NOT MINUTES (the owner, 30 Sep 2026: "Seconds, same pace"). The
     engine counts ninety units to a question's thirty seconds; the player
     reads the seconds left, and what a right answer took, and what a wrong
     one cost. */
  s = once(s, "  function renderClock(minute) {", `  /* The engine's ninety units a question, read as seconds: what is left on
     the countdown, and what a span of them took or cost. */
  function secsLeft(minute) {
    return Math.max(0, Math.ceil((MAX_MINUTE - minute) * MS_PER_MINUTE / 1000));
  }
  function secsOf(minutes) {
    return Math.round((Number(minutes) || 0) * MS_PER_MINUTE / 1000);
  }

  function renderClock(minute) {`, "the seconds helpers");
  s = once(s, "    el.clockValue.textContent = minute;", "    el.clockValue.textContent = secsLeft(minute);", "the clock's number");
  s = once(s, `XIBar.set({ clock: minute + "'", worth: worth });`, `XIBar.set({ clock: secsLeft(minute) + "s", worth: worth });`, "the bar's clock");
  s = once(s, `progress: null, clock: "0'", score: 0,`, `progress: null, clock: Math.round(CONFIG.QUESTION_DURATION_MS / 1000) + "s", score: 0,`, "the bar's first clock");
  s = once(s, `setFeedback("FULL TIME — 0 points" + says, 'fulltime');`, `setFeedback("TIME'S UP — 0 points" + says, 'fulltime');`, "the timeout");
  s = once(s, `setFeedback('GOAL — ' + r.minute + "'   +" + r.points + ' points', 'goal');`,
    `setFeedback('RIGHT — ' + secsOf(r.minute) + 's   +' + r.points + ' points', 'goal');`, "a right answer");
  s = once(s, `setFeedback('NO — ' + (cost ? cost + " minutes gone" : 'not that one') + says, 'miss');`,
    `setFeedback('NO — ' + (cost ? secsOf(cost) + " seconds gone" : 'not that one') + says, 'miss');`, "a wrong answer");

  /* SKIPS, NOT SUBS. */
  s = once(s, "setFeedback('SUBBED OFF'", "setFeedback('SKIPPED'", "the skip line");
  s = once(s, "'This question is missing its options. Sub it off — it will not be scored against you.'",
    "'This question is missing its options. Skip it — it will not be scored against you.'", "the missing options note");
  s = once(s, "(s.subs === 1 ? ' substitution' : ' substitutions')", "(s.subs === 1 ? ' skip' : ' skips')", "the help line");

  /* FULL TIME'S BOXES AND ANSWERS: a tick, not a minute; the average in
     seconds. */
  s = once(s, "return x.correct ? { s: 'g', m: x.minute } : x.timedOut ? { s: 'x' } : { s: 'r' };",
    "return x.correct ? { s: 'g' } : x.timedOut ? { s: 'x' } : { s: 'r' };", "the boxes");
  s = once(s, `s.average === null ? '' : "Average " + s.average + "'"`, `s.average === null ? '' : "Average " + secsOf(s.average) + "s"`, "the average");
  s = once(s, "m: x.timedOut ? null : x.minute,", "m: null,", "the answers' minutes");
  return s;
}

/* The config is football's, verbatim: the same pace and the same bands, by the
   owner's ruling, and the server reads football's file for both games. A
   Friends copy that could differ from it would be a second answer to "how long
   is a question". */
function config() {
  return read(`${SRC}/js/config.js`);
}
function styles() {
  return read(`${SRC}/css/style.css`);
}

/* ---- what must not survive ------------------------------------------------ */

/* Code and markup only: a comment may explain football. */
function codeOnly(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}
const FOOTBALL_WORDS = /football|Football|GOAL —|FULL TIME|SUBBED|substitution|Sub it off|Kick off|0' to 90'|\/api\/quickfire\/|"qfx\."|'qf:'|minutes gone|xi-season|game: ["']quickfire["']|game=quickfire\b/;
export function leftovers(text, what) {
  const hits = [];
  const lines = codeOnly(text).split("\n"), raw = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (FOOTBALL_WORDS.test(lines[i])) hits.push(`    ${what}:${i + 1}  ${raw[i].trim().slice(0, 100)}`);
  }
  return hits;
}

/* ---- write, or refuse --------------------------------------------------- */

let bad = 0;
for (const [rel, make, scan] of [
  [`${OUT}/index.html`, page, true],
  [`${OUT}/js/game.js`, script, true],
  [`${OUT}/js/config.js`, config, false],
  [`${OUT}/css/style.css`, styles, false],
]) {
  let want;
  try { want = make(); } catch (e) { console.log(`REFUSED: ${rel} — ${e.message}`); bad++; continue; }
  if (/\.js$/.test(rel)) {
    try { new vm.Script(want, { filename: rel }); }
    catch (e) { console.log(`REFUSED: ${rel} does not parse — ${e.message}`); bad++; continue; }
  }
  const leaks = scan ? leftovers(want, rel) : [];
  if (leaks.length) {
    console.log(`REFUSED: ${rel} still says football — ${leaks.length} place(s):`);
    leaks.slice(0, 8).forEach((l) => console.log(l));
    bad++;
    continue;
  }
  const at = path.join(ROOT, rel);
  const have = readTextIfExists(at);
  if (CHECK) {
    if (have !== want) { console.log(`DRIFT: ${rel} is not what football's page generates`); bad++; }
  } else if (have !== want) {
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, want);
    console.log(`  wrote ${rel}`);
  }
}
if (bad) process.exit(1);
console.log(CHECK
  ? `${OUT}/ is what ${SRC}/ produces, at ${TAG}`
  : `${OUT}/ generated from ${SRC}/, at ${TAG}`);
