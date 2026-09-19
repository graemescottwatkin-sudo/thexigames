/* tracking_test.mjs — every built game counts how far people get.
 *
 *   node tools/tracking_test.mjs
 *
 * THE FAULT THIS EXISTS FOR. QuickFire was built, playable, linked and
 * completely uncounted. Not broken — never wired. The shared helper existed,
 * three games called it, and the fourth simply did not, which no suite could
 * notice because nothing anywhere said a game must. The word search had a
 * quieter version of the same gap: its free boards were counted, but the
 * server's mode chain ended in "everything else is daily", so they were
 * counted as dailies and the number read as if nobody chose a board.
 *
 * Both are the same shape — a game or a mode that ships without the counter
 * knowing about it — and both are invisible in the data, because a missing
 * row looks exactly like a board nobody opened. That is what makes this worth
 * a gate rather than a habit: the failure is silent, and the number it
 * corrupts is the one used to decide whether a game is working.
 *
 * The rule: a game on BUILT loads the helper, starts a play and ends one, and
 * every mode any game names is a mode the server will accept.
 */
import * as acorn from "acorn";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILT, MODES, validPlayGame, validMode } from "../functions/_lib/games.js";
import { gameDir } from "../functions/_lib/permalink.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = (f) => fs.existsSync(path.join(ROOT, f));

/* Every script a game ships, by name. The joined text is what the older
   checks read; the parsed check needs them one at a time, because a syntax
   error in one would otherwise be reported against all of them. */
const jsFilesOf = (game) => {
  const jsDir = path.join(ROOT, gameDir(game), "js");
  return fs.existsSync(jsDir)
    ? fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"))
    : [];
};

/* Every XIPlays.start() call in a parse tree, however it is reached: the games
   write it as XIPlays.start and as window.XIPlays.start, so the callee is
   matched on its last two links rather than on a whole expression. */
function startCalls(ast) {
  const out = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.type === "CallExpression") {
      const c = node.callee;
      if (c && c.type === "MemberExpression" && !c.computed &&
          c.property && c.property.name === "start" &&
          c.object && ((c.object.type === "Identifier" && c.object.name === "XIPlays") ||
                       (c.object.type === "MemberExpression" && !c.object.computed &&
                        c.object.property && c.object.property.name === "XIPlays"))) {
        out.push(node);
      }
    }
    for (const k of Object.keys(node)) {
      if (k === "type" || k === "start" || k === "end" || k === "loc") continue;
      walk(node[k]);
    }
  })(ast);
  return out;
}

let failed = 0;
const fail = (msg) => { console.log("FAIL  " + msg); failed++; };
const pass = (msg) => console.log("ok    " + msg);

/* The games, as the server understands them, are the games checked. A fourth
   game joins this suite by being built, not by being added here. */
for (const game of BUILT) {
  /* THE ID IS NOT THE DIRECTORY ANY MORE. They were the same word until the
     games moved under a theme, and `const dir = game` was true for as long as
     that held. A game is identified as "crossword" and lives at
     football/crossword; asked for rather than assumed, so the next move is one
     function and not this line again. */
  const dir = gameDir(game);

  /* THE RULE IS "A GAME YOU CAN PLAY COUNTS", not "a name in GAMES counts".
     A game under construction has a directory and a scoring module before it
     has a page, and failing on that would make this gate the thing standing
     between a half-built game and a green branch — which is how a gate gets
     deleted rather than fixed. No page means nothing to play and nothing to
     count, so it is noted and skipped. QuickFire, the fault this suite was
     written for, had a page throughout; it is caught either way. */
  if (!exists(`${dir}/index.html`)) {
    console.log(`note  ${game}: on the list but has no ${dir}/index.html yet — ` +
      `nothing to play, so nothing to count. Wire it before it opens.`);
    continue;
  }

  const html = read(`${dir}/index.html`);
  if (!/shared\/xi-plays\.js/.test(html)) {
    fail(`${game}: ${dir}/index.html does not load shared/xi-plays.js`);
  } else pass(`${game}: loads the helper`);

  /* Every script the game ships, because the call may not be in game.js. */
  const jsDir = path.join(ROOT, dir, "js");
  const js = fs.existsSync(jsDir)
    ? fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"))
        .map((f) => read(`${dir}/js/${f}`)).join("\n")
    : "";

  const startsIt = /XIPlays[.]start[\s]*[(]/.test(js);
  const namesIt = new RegExp('game:\\s*[\'"]' + game + '[\'"]').test(js);
  if (!startsIt) fail(`${game}: nothing calls XIPlays.start`);
  else if (!namesIt) fail(`${game}: calls XIPlays.start but never as game: "${game}"`);
  else pass(`${game}: starts a play under its own name`);

  if (!/XIPlays\.end\s*\(/.test(js)) {
    fail(`${game}: nothing calls XIPlays.end — a finish would never be recorded`);
  } else pass(`${game}: ends a play`);

  /* AND IT NAMES THE BOARD. Starting a play without a boardKey is not a
     smaller version of starting one: board_key lands null, and the funnel,
     the per-board standings and the CSV all read per board — so the attempt
     cannot be grouped, attributed, or counted against the board it was of.
     Nothing in the response says so, which is why it keeps happening. Five
     games have now shipped a variant of this (the comments in games.js record
     Scrambled, QuickFire, Grid and Codeword losing rows to the missing server
     branch; Ballpark and Codeword lost them to the missing client field), and
     it has never once been caught by anything other than somebody reading the
     table afterwards.
     Deliberately weak: this asks only that the game MENTIONS boardKey, not
     that the value is right. A game computing the key at runtime cannot be
     checked statically, and a gate that demanded a literal would punish the
     better-written games. It catches the fault that actually occurs, which is
     the field being absent entirely. */
  if (!/boardKey/.test(js)) {
    fail(`${game}: calls XIPlays.start but never mentions boardKey — ` +
         `every row would land with board_key null`);
  } else pass(`${game}: names the board it is a play of`);

  /* AND IT SAYS HOW FAR THEY GOT.
     xi-plays.js reads the SECOND argument of start() at the end of a play, for
     solved, elapsed, checks, reveals and detail. Leave it out and all five
     default to 0 — so the row says completed=1, solved=0, elapsed_secs=0: the
     finish recorded and nothing about the finishing. It is the same shape as
     the missing boardKey above and just as silent, because a play with no
     progress function is indistinguishable at the call site from one with a
     board nobody finished.
     THREE GAMES HAD SHIPPED THIS: Ballpark, Grid and Codeword, found on
     19 Sep 2026 by reading the plays table, which is exactly how the boardKey
     fault kept being found. This gate ran on all three the whole time and
     passed them, because the three checks above are satisfied by a start, an
     end and the word boardKey — none of which the missing argument touches.

     PARSED, NOT MATCHED. The argument is an identifier after an object literal
     that runs over several lines and contains braces of its own; a regex can
     neither count arguments nor find the end of that object, and one that
     tried would report whatever the last brace happened to be. acorn is
     already a dependency of the suites and names_test.mjs uses it the same
     way. */
  for (const f of jsFilesOf(game)) {
    const src = read(`${gameDir(game)}/js/${f}`);
    let ast;
    try {
      ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: "script" });
    } catch (e) {
      fail(`${game}: ${f} does not parse (${String(e).split(String.fromCharCode(10))[0]})`);
      continue;
    }
    for (const call of startCalls(ast)) {
      if (call.arguments.length >= 2) {
        pass(`${game}: says how far the play got`);
      } else {
        fail(`${game}: XIPlays.start in ${f} passes no progress function — ` +
             `solved, elapsed, checks and reveals would all be written as 0`);
      }
    }
  }

  if (!validPlayGame(game)) {
    fail(`${game}: the server would refuse its plays (validPlayGame says no)`);
  } else pass(`${game}: the server accepts its plays`);
}

/* THE MODES, read from the games rather than trusted. A literal a game passes
   as its mode must be one the server will keep; anything else is written as
   "daily" or refused, and either way the board it names is lost. */
const seen = new Set();
for (const game of BUILT) {
  /* The directory, not the id: this loop still walked ROOT/<id>/js while the
     read below had already been moved to gameDir. It found no files, skipped
     every game, and reported "no mode literals found at all". */
  const jsDir = path.join(ROOT, gameDir(game), "js");
  if (!fs.existsSync(jsDir)) continue;
  for (const f of fs.readdirSync(jsDir).filter((x) => x.endsWith(".js"))) {
    const src = read(`${gameDir(game)}/js/${f}`);
    for (const m of src.matchAll(/XIPlays\.start\s*\(\s*\{[^}]*?mode:\s*['"]([a-z]+)['"]/g)) {
      seen.add(m[1]);
    }
    /* The games that pass a mode through a helper name it at the call site
       instead: playsStart("free", ...). */
    for (const m of src.matchAll(/playsStart\s*\(\s*['"]([a-z]+)['"]/g)) seen.add(m[1]);
  }
}
for (const mode of seen) {
  if (!validMode(mode)) fail(`mode "${mode}" is named by a game but is not in MODES`);
  else pass(`mode "${mode}" is one the server keeps`);
}
if (!seen.size) fail("no mode literals found at all — has the call shape changed?");

/* MODES itself must not rot into names nothing uses. Reported, not failed,
   and deliberately weakly: a mode a game chooses at runtime — the crossword
   passes board.kind, QuickFire passes playsMode() — is invisible to a scan
   for literals, so a name listed here may be in constant use. Failing on
   that would be a gate that punishes the better-written games. */
const unused = MODES.filter((m) => !seen.has(m));
if (unused.length) {
  console.log("note  no literal names these, which is not the same as unused: " +
    unused.join(", "));
}

console.log(failed ? `\n${failed} failed` : "\nall tracking checks passed");
process.exit(failed ? 1 : 0);
