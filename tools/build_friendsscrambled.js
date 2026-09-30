#!/usr/bin/env node
/* tools/build_friendsscrambled.js — friends/scrambled/ and friends/vowels/
 * are PRODUCED, not written.
 *
 *   node tools/build_friendsscrambled.js            writes both pages
 *   node tools/build_friendsscrambled.js --check    fails if either has drifted
 *
 * Scrambled XI: Friends and Vowels XI: Friends (the owner, 29 Sep 2026:
 * "start the Friends Scrambled and Vowels build"). Each is its football
 * page with one set of Friends rewrites applied: football/scrambled/ becomes
 * friends/scrambled/, and football/vowels/ -- itself generated from
 * football/scrambled/ by tools/build_vowels.js -- becomes friends/vowels/. So
 * the two Friends pages cannot drift from each other or from football, and
 * every fix to the football board lands in all four.
 *
 * WHAT CHANGES, AND ONLY THAT:
 *   - the pitch becomes a LIST: the board's theme, then its eleven answers,
 *     one row each (the boards carry no formation; see build_scrambled.js);
 *   - the words: the page is about Friends answers, not footballers;
 *   - the parts that are football's alone go: the iconic finals, the board of
 *     the week, the W/L form, the season;
 *   - identity: its own game id, storage prefix, address and daily route,
 *     /api/scrambled_fr/daily, which serves the Friends board set. Guess,
 *     reveal, round and finish stay football's routes: the play token it is
 *     handed (frsc:…) says which set its board is in.
 * What stays is the engine: the scramble, the cypher, the prices, the clock,
 * the keys, the bench, the room check, Full Time.
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

/* THE TAG LIVES HERE, written into both generated pages. Bump, regenerate. */
const TAG = "v001b";

/* Football Scrambled's own tag, read from its page: config.js and scoring.js
   are the engine's, loaded from football's folder at football's tag, the way
   football's Vowels loads them. */
const FB_TAG = (read("football/scrambled/index.html").match(/js\/game\.js\?v=(v[0-9a-z]+)/) || [])[1];

const once = (s, from, to, what) => {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`rewrite "${what}": found ${n}, want 1 — ${String(from).slice(0, 70)}`);
  return s.split(from).join(to);
};
const all = (s, from, to, what) => {
  if (!s.includes(from)) throw new Error(`rewrite "${what}": not found — ${String(from).slice(0, 70)}`);
  return s.split(from).join(to);
};
/* Cut from `start` up to (not including) `end`, each found exactly once. */
const cut = (s, start, end, what) => {
  const a = s.indexOf(start), b = s.indexOf(end, a + 1);
  if (a < 0 || s.indexOf(start, a + 1) > -1 || b < 0) throw new Error(`cut "${what}": not found once`);
  return s.slice(0, a) + s.slice(b);
};

/* ---- the two games --------------------------------------------------- */

const GAMES = [
  {
    id: "scrambled_fr", from: "scrambled", src: "football/scrambled", out: "friends/scrambled",
    prefix: ["xisc.", "xifs."], word: "Scrambled", name: "Scrambled XI: Friends",
    title: "Scrambled XI: Friends — the daily Friends anagram",
    h1: "Scrambled XI: Friends &mdash; the daily Friends anagram",
    fbTitle: "Scrambled XI — the daily football anagram",
    fbH1: "Scrambled XI &mdash; the daily football anagram",
    desc: [
      ["Eleven footballers in their real positions, every name scrambled. Solve in any order before the 90-minute clock runs down. A new eleven every day.",
       "Five Friends answers under one theme, every one scrambled: characters, places, catchphrases, episodes. Solve in any order, with no clock. A new five every day."],
      ["Eleven scrambled names in their real positions on the pitch. One answer box, solve in any order.",
       "Five scrambled Friends answers under one theme. One answer box, solve in any order."],
      ["Eleven scrambled names in their real positions on the pitch. Unravel the XI.",
       "Five scrambled Friends answers under one theme. Unravel them all."],
    ],
    fbSub: "Untangle eleven player names.", sub: "Untangle five Friends answers.",
    how: `    <p><b>Five answers, scrambled.</b> One theme and five answers from
       Friends &mdash; characters, places, catchphrases, episodes &mdash; with the
       letters of every answer shuffled. Solve them in any order; nothing unlocks
       anything else.</p>
    <p><b>The theme is the only clue.</b> On an episode board each answer is the
       title&rsquo;s key word, and solving it shows the whole title.</p>
    <p><b>No clock.</b> Take as long as you like: your score depends only on the
       help you use.</p>
    <p><b>Help costs points.</b> A revealed letter is two, and giving up an answer
       costs the twenty it was worth.</p>
    <p><b>100 is the ceiling</b>: twenty for each answer you work out.</p>
    <p><b>Previous dailies.</b> Any day you missed is in Other boards, to play when you like. Only today&rsquo;s daily keeps a streak going.</p>
`,
  },
  {
    id: "vowels_fr", from: "vowels", src: "football/vowels", out: "friends/vowels",
    prefix: ["xivw.", "xifv."], word: "Vowels", name: "Vowels XI: Friends",
    title: "Vowels XI: Friends — the daily Friends vowels puzzle",
    h1: "Vowels XI: Friends &mdash; the daily Friends puzzle with the vowels missing",
    fbTitle: "Vowels XI — the daily football vowels puzzle",
    fbH1: "Vowels XI &mdash; the daily football puzzle with the vowels missing",
    ogTitle: ["Vowels XI — the daily football puzzle with the vowels missing",
              "Vowels XI: Friends — the daily Friends puzzle with the vowels missing"],
    desc: [
      ["Eleven footballers in their real positions, every name with its vowels taken out. Put them back before the 90-minute clock runs down. New every day.",
       "Five Friends answers under one theme, every vowel taken out. Put them back, with no clock. A new five every day."],
      ["Eleven names in their real positions with the vowels missing. One answer box, solve in any order.",
       "Five Friends answers under one theme with the vowels missing. One answer box, solve in any order."],
      ["Eleven names in their real positions with the vowels missing. Fill in the XI.",
       "Five Friends answers under one theme with the vowels missing. Fill them all in."],
    ],
    fbSub: "Put the missing vowels back.", sub: "Put the missing vowels back.",
    how: `    <p><b>Five answers, minus their vowels.</b> One theme and five answers
       from Friends &mdash; characters, places, catchphrases, episodes &mdash; with
       every vowel taken out. Put them back in any order; nothing unlocks anything
       else.</p>
    <p><b>The theme is the only clue.</b> On an episode board each answer is the
       title&rsquo;s key word, and solving it shows the whole title.</p>
    <p><b>No clock.</b> Take as long as you like: your score depends only on the
       help you use.</p>
    <p><b>Help costs points.</b> A revealed vowel is two, and giving up an answer
       costs the twenty it was worth.</p>
    <p><b>100 is the ceiling</b>: twenty for each answer you work out.</p>
    <p><b>Previous dailies.</b> Any day you missed is in Other boards, to play when you like. Only today&rsquo;s daily keeps a streak going.</p>
`,
  },
];

/* ---- the page ---------------------------------------------------------- */

function page(g) {
  let s = read(`${g.src}/index.html`);
  const fbPath = `/${g.src}/`, frPath = `/${g.out}/`;

  /* IDENTITY: the name agrees in the title, og/twitter titles, JSON-LD and
     h1, which tools/aligned_test.mjs compares. */
  s = once(s, `<title>${g.fbTitle} | The XI Games</title>`, `<title>${g.title} | The XI Games</title>`, "title");
  if (g.ogTitle) s = all(s, g.ogTitle[0], g.ogTitle[1], "og and twitter titles");
  else s = all(s, `content="${g.fbTitle}"`, `content="${g.title}"`, "og and twitter titles");
  s = once(s, g.fbH1, g.h1, "the h1");
  for (const [a, b] of g.desc) s = once(s, `content="${a}"`, `content="${b}"`, "a description");
  s = once(s, `"name":"${g.word} XI"`, `"name":"${g.name}"`, "JSON-LD name");
  s = once(s, `<p class="pmDate">${g.word} XI</p>`, `<p class="pmDate">${g.name}</p>`, "the loading card");
  s = once(s, `<p class="site-crumb">Football <span aria-hidden="true">/</span> <b>${g.word}</b></p>`,
    `<p class="site-crumb">Friends <span aria-hidden="true">/</span> <b>${g.word}</b></p>`, "the breadcrumb");
  s = once(s, `<p class="ident-sub">${g.fbSub}</p>`, `<p class="ident-sub">${g.sub}</p>`, "the strapline");

  /* NO SHARE CARD RATHER THAN FOOTBALL'S: this game has no artwork of its own
     yet, and football's pitch on a Friends card is the wrong game's picture. */
  s = s.replace(/^.*<meta property="og:image[^>]*>\n/gm, "");

  /* NOINDEX WHILE UNLISTED: generated from an indexed page, so without this
     an unlisted game is one crawl from a search result. */
  if (UNLISTED[g.id]) {
    s = once(s, '<link rel="canonical"', '<meta name="robots" content="noindex">\n<link rel="canonical"', "the noindex");
  }

  /* OTHER BOARDS: previous dailies only. The board of the week counts from
     football's first board and the finals are football's. */
  s = once(s, '<span class="hc-note">Board of the week, iconic matches, previous dailies</span>',
    '<span class="hc-note">Previous dailies: every day so far</span>', "the Other boards card");
  s = cut(s, '        <button class="home-choice col" id="homeFeatured">',
    '        <button class="home-choice col" id="homePrevious">', "the board of the week and the finals");
  s = cut(s, "<!-- THE FINALS.", "<!-- THE SHARED FOOTER", "the finals sheet");

  /* STREAKS ONLY: the owner's ruling for Friends (28 Sep 2026) -- a game
     streak and an any-game streak, and no W/L form. */
  s = s.replace(/^.*<!-- YOUR FORM, AS ONE ROW[^\n]*\n.*<div class="home-form">[^\n]*\n/m, "");
  if (s.includes('id="homeRun"')) throw new Error('rewrite "the form row": still there');

  /* THE LIST, where the pitch was. The theme is drawn as its first row. */
  s = once(s, '<div class="pitch" id="pitch" aria-label="The eleven, in their positions"></div>',
    '<div class="xlist" id="pitch" aria-label="The five answers, under the theme"></div>', "the pitch");

  /* THE RULES, this game's. */
  const a = s.indexOf("    <h2>How to play</h2>\n");
  const b = s.indexOf("  </section>", a);
  if (a < 0 || b < 0) throw new Error('rewrite "the rules": not found');
  s = s.slice(0, a) + "    <h2>How to play</h2>\n" + g.how + s.slice(b);

  /* NO SEASON and no club list: the Friends streak is xi-played's, and the
     club list feeds a picker only football's page has. */
  s = s.replace(/^<script src="\/shared\/xi-season\.js\?v=v\d+"><\/script>\n/m, "");
  s = s.replace(/^<script src="\/shared\/xi-clubs\.js\?v=v\d+"><\/script>\n/m, "");

  /* THE FRIENDS ENGINE FILES, not football's: no clock, and a score out of
     100 (see ENGINE below). Both Friends pages load the one pair, from
     friends/scrambled/js/, as football's Vowels loads football's. */
  /* Relative on Scrambled's own page, so they are among the assets its tag
     and its asset hash cover (post_deploy.mjs hashes the page's relative
     css/ and js/ files); absolute from Vowels', which borrows them. */
  const eng = g.out === "friends/scrambled" ? "js/" : "/friends/scrambled/js/";
  s = s.replace(/<script src="(?:\/football\/scrambled\/)?js\/config\.js\?v=[0-9a-z]+"><\/script>/,
    `<script src="${eng}config.js?v=${TAG}"></script>`);
  s = s.replace(/<script src="(?:\/football\/scrambled\/)?js\/scoring\.js\?v=[0-9a-z]+"><\/script>/,
    `<script src="${eng}scoring.js?v=${TAG}"></script>`);
  if (!s.includes(`${eng}config.js?v=${TAG}`) || !s.includes(`${eng}scoring.js?v=${TAG}`)) {
    throw new Error('rewrite "the engine files": not both found');
  }
  s = once(s, '<span class="scoreVal" id="worthNow">114</span>', '<span class="scoreVal" id="worthNow">100</span>', "the ceiling");
  s = once(s, '<span class="progress"><span id="solvedCount">0</span> / 11 unravelled</span>',
    '<span class="progress"><span id="solvedCount">0</span> / 5 unravelled</span>', "the count");
  s = once(s, "Fetching today's eleven.", "Fetching today's five.", "the loading line");
  s = once(s, '<span class="label">Off the bench</span>', '<span class="label">Help used</span>', "the help box");

  /* ADDRESS AND IDENTITY. */
  s = all(s, `https://www.thexigames.com${fbPath}`, `https://www.thexigames.com${frPath}`, "the page's address");
  s = once(s, `data-game="${g.from}"`, `data-game="${g.id}"`, "data-game");
  s = s.replace(/((?:css\/style\.css|js\/game\.js)\?v=)v[0-9a-z]+/g, `$1${TAG}`);
  return s;
}

/* ---- the stylesheet ---------------------------------------------------- */

const LIST_CSS = `

/* ==== GENERATED by tools/build_friendsscrambled.js: the Friends list ====

   THE LIST, WHERE THE PITCH WAS. The board's theme, then its five answers
   one row each, top to bottom. Same panel, same tile, same states as the
   pitch -- solved, given, picked, could -- so every rule above that paints a
   tile still paints a row; only the placing is new. */
.xlist {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: var(--radius);
  background: var(--pitch-deep);
  border: 1px solid var(--pitch-deep);
}
.xlist .listHead {
  margin: 0 0 2px;
  font-family: var(--disp);
  font-weight: 700;
  font-size: 17px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #fff;
  text-align: center;
}
.xlist .slot {
  position: static;
  transform: none;
  width: 100%;
  min-height: 40px;
  display: grid;
  grid-template-columns: 1.8em minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 8px;
  padding: 4px 10px;
  text-align: left;
}
.xlist .slot .pos { text-align: right; }
.xlist .slot .lifted:empty { display: none; }
.xlist .slot .letters { white-space: nowrap; overflow: hidden; }
.xlist .slot.solved .letters,
.xlist .slot.given .letters { white-space: normal; line-height: 1.1; }
.xlist .slot .enum { margin: 0; white-space: nowrap; }
.xlist .slot .hint { grid-column: 2 / 4; }

/* LOCKED: the list fills the board's cell exactly, the theme and eleven equal
   rows, sized from the cell's height -- the same container the pitch used. */
body.locked .xlist {
  height: 100%;
  width: min(100%, 760px);
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto repeat(5, minmax(0, 1fr));
  gap: .8cqh;
  padding: 1cqh 8px;
}
body.locked .xlist .listHead { font-size: clamp(12px, 3.4cqh, 20px); margin: 0; }
/* THE BENCH, LAID OVER THE LIST, IS SOLID: football's is a translucent tint,
   and over rows of text the rows read through it. */
body.locked .benchRow { background: var(--card); }
/* body.locked .slot makes a pitch tile a centred column; a row stays a row. */
body.locked .xlist .slot {
  display: grid;
  flex-direction: initial;
  justify-content: initial;
  height: auto;
  min-height: 0;
  padding: 0 10px;
}
body.locked .xlist .slot .letters,
body.locked .xlist .slot .lifted { font-size: clamp(14px, 6.5cqh, 34px); }
body.locked .xlist .slot .pos,
body.locked .xlist .slot .enum { font-size: clamp(10px, 3.4cqh, 18px); }
`;

function styles(g) {
  return read(`${g.src}/css/style.css`) + LIST_CSS;
}

/* ---- the script -------------------------------------------------------- */

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
  if (!s.slice(start, end).includes(marker)) throw new Error(`replace "${name}": the cut lacks "${marker}"`);
  return s.slice(0, start) + replacement.trim() + s.slice(end);
}

function script(g) {
  let s = read(`${g.src}/js/game.js`);

  /* THE LIST. One row per answer, in the board's order, under its theme.
     Everything a tile carried comes across -- the lifted letters, the
     enumeration, the states -- and the room check, the fit and the bench read
     .slot inside #pitch exactly as they did. */
  s = replaceFn(s, "drawPitch", "rowsOf(state.board.slots)", `
  function drawPitch() {
    if (state.over) defaultReading();
    var pitch = $("pitch");
    pitch.innerHTML = "";
    pitch.classList.toggle("bagless", bagless());

    var head = document.createElement("div");
    head.className = "listHead";
    head.textContent = state.board.title || "";
    pitch.appendChild(head);

    state.board.slots.forEach(function (slot, i) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "slot";
      el.dataset.slot = slot.id;

      var got = state.solved[slot.id];
      if (got) el.classList.add(got.how === "revealed" ? "given" : "solved");
      if (state.picked === slot.id) el.classList.add("picked");

      var num = document.createElement("span");
      num.className = "pos";
      num.textContent = String(slot.row || i + 1);
      el.appendChild(num);

      var mid = document.createElement("span");
      var lifted = document.createElement("span");
      lifted.className = "lifted";
      mid.appendChild(lifted);
      var letters = document.createElement("span");
      letters.className = "letters";
      letters.textContent = tileText(slot);
      mid.appendChild(letters);
      el.appendChild(mid);

      var en = document.createElement("span");
      en.className = "enum";
      en.textContent = !got && !bagless() ? "(" + lenOf(slot).join(",") + ")" : "";
      el.appendChild(en);

      el.setAttribute("aria-label", "Answer " + (slot.row || i + 1) + ", " + (got
        ? got.name
        : (bagless()
            ? "blanked, " + lenOf(slot).join(" and ") + " letters"
            : "scrambled, " + lenOf(slot).join(" and ") + " letters")));
      el.addEventListener("click", function () { pick(slot.id); read(slot.id); });
      pitch.appendChild(el);
    });

    $("solvedCount").textContent = Object.keys(state.solved).length;
    if (window.XIBar) XIBar.set({ progress: Object.keys(state.solved).length + "/" + (state.board.slots || []).length });
    $("helpSpent").textContent = state.help;
    paintTyped();
  }`);

  /* No positions: the bench and the echo name the row. */
  s = once(s, `$("benchFor").textContent = "Bench \\u2014 " + slot.pos + ", (" + slotLen.join(",") + ")";`,
    `$("benchFor").textContent = "Answer " + (slot.row || "") + ", (" + slotLen.join(",") + ")";`, "the bench's label");
  s = once(s, `$("echoPos").textContent = slot.pos;`, `$("echoPos").textContent = "Answer " + (slot.row || "");`, "the echo's label");

  /* THE LANDING: previous dailies only, counted from the Friends first day. */
  s = replaceFn(s, "renderLanding", "homeFeaturedName", `
  function renderLanding() {
    var today = state.todayNo || 0;
    var first = state.firstNo || 1;
    if (today >= first) $("homePreviousCount").textContent = (today - first + 1) + " boards so far";
    renderForm();
    nameTodaysAction();
  }`);
  s = once(s, "if (board.today) state.todayNo = board.today;",
    "if (board.today) state.todayNo = board.today;\n        if (typeof board.first === \"number\") state.firstNo = board.first;", "the first day");
  s = once(s, "if (no < 1 || no > today) {", "if (no < (state.firstNo || 1) || no > today) {", "the calendar's first day");

  /* THE CLOCK'S LINE, without football's ninety minutes and half time. */
  s = once(s, `$("startClock").textContent = "Ninety minutes in " +
          Math.round(CFG.MATCH_CLOCK_REAL_SECONDS / 60) + " of real time" +
          (CFG.HALF_TIME_MINUTE === null ? "" : " · half time is free");`,
    `$("startClock").textContent = Math.round(CFG.MATCH_CLOCK_REAL_SECONDS / 60) + " minutes on the clock";`,
    "the clock's line");

  /* NOTHING TO BIND for the markup that went. */
  s = once(s, '  on("homeThemed", "click", openFinals);\n', "", "the finals card's binding");
  s = once(s, '  on("finalsClose", "click", closeFinals);\n', "", "the finals close");
  s = once(s, `  on("finalsInput", "input", function (ev) {
    finalsFilter = ev.target.value || "";
    renderFinals();
  });
`, "", "the finals search");
  s = replaceFn(s, "renderFinals", "finalsList", "function renderFinals() {}");
  s = replaceFn(s, "openFinals", "finalsSheet", "function openFinals() {}");
  s = replaceFn(s, "closeFinals", "finalsSheet", "function closeFinals() {}");
  const fl = s.indexOf('  on("finalsList", "click", function (ev) {');
  const flEnd = s.indexOf("  });\n", fl);
  if (fl < 0 || flEnd < 0) throw new Error('rewrite "the finals list binding": not found');
  s = s.slice(0, fl) + s.slice(flEnd + "  });\n".length);

  /* ADDRESS: this page's own, and the Friends daily route. */
  s = once(s, `(board.iconic ? "/football/${g.from}/" : location.pathname) +`, "location.pathname +", "the address");
  s = once(s, `withCy("/api/scrambled/daily"`, `withCy("/api/scrambled_fr/daily"`, "the daily route");

  /* THE FRIENDS ENGINE: its own globals, so it can never be read as
     football's where both are loaded (the server loads both). */
  s = once(s, "var CFG = window.SCX_CONFIG;", "var CFG = window.SCX_FR_CONFIG;", "the config");
  s = once(s, "var SCORING = window.SCX_SCORING;", "var SCORING = window.SCX_FR_SCORING;", "the scoring");
  /* NO CLOCK: nothing on the bar or the start card counts time. */
  s = once(s, `XIBar.set({ clock: minute + "'", worth: worth });`, "XIBar.set({ worth: worth });", "the bar's clock");
  s = once(s, `progress: "0/" + ((board.slots || []).length || 11), clock: "0'",`,
    `progress: "0/" + ((board.slots || []).length || 5), clock: "\u2013",`, "the bar at kick off");
  s = once(s, `$("startClock").textContent = Math.round(CFG.MATCH_CLOCK_REAL_SECONDS / 60) + " minutes on the clock";`,
    `$("startClock").textContent = (board.slots || []).length + " answers \u00b7 no clock";`, "the start card");
  s = once(s, "      total: 11,", "      total: (state.board.slots || []).length,", "the play's size");
  /* FULL TIME WITHOUT A CLOCK: no minute on a box, no time on the stats line,
     and the help in points. Unravelled is counted from what was worked out,
     not from which boxes carry a minute -- there are none now. */
  s = once(s, `if (got.how === "solved") return { s: "g", m: got.m != null ? got.m : null };`,
    `if (got.how === "solved") return { s: "g" };`, "the boxes' minutes");
  s = once(s, `var solved = boxes.filter(function (b) { return b.s === "g" && b.m != null; }).length;`,
    `var solved = Object.keys(state.solved).filter(function (k) { return state.solved[k].how === "solved"; }).length;`,
    "the count of unravelled");
  s = once(s, `stats: solved + " of " + boxes.length + " unravelled · " + helpLine(mins, secs, 0) });`,
    `stats: solved + " of " + boxes.length + " unravelled" });`, "the stats line");
  s = once(s, `stats: helpLine(mins, secs, 0) + " · The daily is one attempt" });`,
    `stats: "The daily is one attempt" });`, "the banked stats line");
  s = once(s, `help: o.bench ? [o.bench + " off the bench"] : [],`,
    `help: o.bench ? [o.bench + " points of help"] : [],`, "the help line");

  /* IDENTITY and STORAGE. */
  s = all(s, `"${g.word} XI"`, `"${g.name}"`, "the name");
  s = all(s, `"${g.from}"`, `"${g.id}"`, "the game id");
  s = all(s, `?game=${g.from}"`, `?game=${g.id}"`, "the account's results");
  s = all(s, `"${g.prefix[0]}"`, `"${g.prefix[1]}"`, "the storage prefix");
  s = s.replace(/var BUILD = "[^"]*"/, `var BUILD = "${TAG}"`);
  return s;
}

/* ---- what may still say football ---------------------------------------- */

export const ALLOWED = [
  "The XI Games",
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
    if (!/football|Football|\bxisc\.|\bxivw\.|Premier|footballer/.test(lines[i])) continue;
    if (ALLOWED.some((a) => lines[i].includes(a))) continue;
    hits.push(`    ${what}:${i + 1}  ${raw[i].trim().slice(0, 100)}`);
  }
  return hits;
}

/* ---- THE FRIENDS ENGINE: no clock, out of 100 ---------------------------
 *
 * The owner, 29 Sep 2026: five answers a board ("Always 5"), no clock, and --
 * of football's -- "90 min clock is a football thing, less so in a Friends
 * game". So a Friends score depends on the help used alone: twenty for each
 * answer, a hundred for five; a revealed letter or vowel costs two, as it
 * does across the family, and giving an answer up costs the twenty it was
 * worth. The same API as football's pair (computeScore, MAX_SCORE,
 * matchMinute, the REVEAL_* prices), so the page and the server's round
 * verification (functions/_lib/sc-round.js) read it exactly as they read
 * football's -- from their own globals, SCX_FR_*, so neither can be taken for
 * the other where both are loaded. */
const ENGINE_CONFIG = `/* GENERATED by tools/build_friendsscrambled.js — do not edit by hand.
 * Scrambled XI: Friends and Vowels XI: Friends: the prices. No clock. */
(function (root) {
  'use strict';
  var CONFIG = {
    /* No clock: nothing is timed, and nothing reads these as a clock. */
    MATCH_CLOCK_REAL_SECONDS: null,
    ANAGRAM_CLOCK_REAL_SECONDS: null,
    CONSONANT_CLOCK_REAL_SECONDS: null,
    REVEAL_LETTER_COST: 2,
    REVEAL_VOWEL_COST: 2,
    /* Giving an answer up costs what it was worth. */
    REVEAL_NAME_COST: 20,
    /* No board in this set sells a hint; priced so a stray call costs a hint. */
    REVEAL_HINT_COST: 3,
    HALF_TIME_MINUTE: null,
    SECOND_HALF_LETTERS: false,
    PAUSE_ON_TAB_HIDDEN: true,
    STORAGE_KEY: 'board.v1'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  root.SCX_FR_CONFIG = CONFIG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
const ENGINE_SCORING = `/* GENERATED by tools/build_friendsscrambled.js — do not edit by hand.
 * Scrambled XI: Friends and Vowels XI: Friends: the score. No clock. */
(function (root) {
  'use strict';
  var PER_ANSWER = 20;
  var MAX_SCORE = PER_ANSWER * 5;
  function matchMinute() { return 0; }
  function timePenalty() { return 0; }
  function computeScore(elapsedSeconds, help) {
    var hp = Math.max(0, help || 0);
    return { score: Math.max(0, MAX_SCORE - hp), timePenalty: 0, helpPenalty: hp };
  }
  var api = {
    PER_ANSWER: PER_ANSWER,
    MAX_SCORE: MAX_SCORE,
    matchMinute: matchMinute,
    timePenalty: timePenalty,
    computeScore: computeScore
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SCX_FR_SCORING = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

/* ---- write, or refuse ---------------------------------------------------- */

if (!FB_TAG) { console.log("REFUSED: football Scrambled's tag could not be read from its page."); process.exit(1); }

let bad = 0;
const ENGINE_FILES = [
  ["friends/scrambled/js/config.js", () => ENGINE_CONFIG],
  ["friends/scrambled/js/scoring.js", () => ENGINE_SCORING],
];
for (const g of [{ out: "(engine)", files: ENGINE_FILES }, ...GAMES]) {
  for (const [rel, make] of g.files || [
    [`${g.out}/index.html`, page], [`${g.out}/css/style.css`, styles], [`${g.out}/js/game.js`, script],
  ]) {
    let want;
    try { want = make(g); } catch (e) { console.log(`REFUSED: ${rel} — ${e.message}`); bad++; continue; }
    if (/\.js$/.test(rel)) {
      try { new vm.Script(want, { filename: rel }); }
      catch (e) { console.log(`REFUSED: ${rel} does not parse — ${e.message}`); bad++; continue; }
    }
    const leaks = leftovers(want, rel);
    if (leaks.length) {
      console.log(`REFUSED: ${rel} still says football — ${leaks.length} place(s):`);
      leaks.slice(0, 6).forEach((l) => console.log(l));
      bad++;
      continue;
    }
    const at = path.join(ROOT, rel);
    const have = readTextIfExists(at);
    if (CHECK) {
      if (have !== want) { console.log(`DRIFT: ${rel} is not what the football page generates`); bad++; }
    } else if (have !== want) {
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.writeFileSync(at, want);
      console.log(`  wrote ${rel}`);
    }
  }
}
if (bad) process.exit(1);
console.log(CHECK
  ? `friends/scrambled/ and friends/vowels/ are what football's pages produce, at ${TAG}`
  : `friends/scrambled/ and friends/vowels/ generated from football's pages, at ${TAG}`);
