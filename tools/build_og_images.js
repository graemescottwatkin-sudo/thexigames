#!/usr/bin/env node
/* tools/build_og_images.js — the share card for every game, generated.
 *
 *   npm install -D playwright --no-save
 *   npx playwright install --with-deps chromium
 *   node tools/build_og_images.js              write every game's og-image.png
 *   node tools/build_og_images.js --only=hilo  write one
 *   node tools/build_og_images.js --check      compare, write nothing
 *
 * WHY THIS EXISTS. Four of the six games pointed their og:image at a file that
 * was never made: /football/wordsearch/og-image.png and the same for Scrambled
 * and QuickFire answered 404, and HiLo and Vowels pointed at the CROSSWORD's,
 * so sharing a HiLo link showed a crossword card. Only one card in the family
 * existed and five pages claimed it or claimed nothing.
 *
 * GENERATED, NOT DRAWN. Six hand-made images is six things to redraw the day
 * the palette moves, and five of them would be missed — the same argument that
 * made Vowels a generated copy of Scrambled rather than a second engine. So the
 * ground, the stripes, the footer and the type are written once here and the
 * only thing a game supplies is its NAME, its two lines, and a motif.
 *
 * WHAT IS NOT GENERATED: the crossword's. Its card is live and correct, and
 * regenerating it would change bytes that are already deployed for no reason
 * anybody asked for. Its measurements ARE the spec below — this file was
 * written by reading that image — so if it is ever regenerated it should land
 * in the same place. Run with --only=crossword to see what would be produced.
 *
 * 1200x630 is Facebook's, Twitter's, WhatsApp's and Reddit's shared minimum,
 * and it is what the crossword's card already is. PNG because no scraper of
 * consequence renders SVG.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2)
  .map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v === undefined ? true : v]));

const W = 1200, H = 630;

/* ---- the palette, read off the live crossword card ---------------------- */
/* Not from xi-tokens.css: the card is a fixed picture rather than a themed
   surface — it has no dark mode, because a scraper has no theme — so these are
   its own constants and are deliberately not var() references to tokens that
   change with a colour scheme. --pitch is #1E6B45 and this ground is lighter;
   the card was drawn to be read as a thumbnail. */
const GROUND = "#14795A";
const STRIPE = "#178055";      // the mown stripes, barely there
const DEEP = "#0C3A28";        // the footer bar, and the dark cells
const MINT = "#DCEFE5";        // the name, and a lit cell
const SOFT = "#A9CDBB";        // the second line, and the footer text

/* ---- the motifs -------------------------------------------------------- */
/* Each game gets ONE picture that says what it is at thumbnail size, drawn on
   the same 4-column, 61px grid the crossword's card uses so the family reads
   as one set. A motif returns SVG, positioned by the caller. */

const CELL = 61, GAP = 0, X0 = 92, Y0 = 165;
const at = (c, r) => [X0 + c * (CELL + GAP), Y0 + r * (CELL + GAP)];

function cell(c, r, fill, letter, letterFill) {
  const [x, y] = at(c, r);
  let s = `<rect x="${x}" y="${y}" width="${CELL - 2}" height="${CELL - 2}" fill="${fill}"/>`;
  if (letter) {
    s += `<text x="${x + (CELL - 2) / 2}" y="${y + (CELL - 2) / 2 + 11}" text-anchor="middle"` +
         ` font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="34"` +
         ` fill="${letterFill || DEEP}">${letter}</text>`;
  }
  return s;
}

/* WORDSEARCH: a block of letters with one word lit through it on the diagonal,
   which is the whole game in one picture — the grid is public, the FIND is
   not. Letters are fixed rather than random: a card that changed every build
   would make every rebuild a visible diff for no reason. */
function wordsearchMotif() {
  const rows = [
    ["K", "R", "T", "A"],
    ["B", "A", "L", "M"],
    ["E", "S", "N", "O"],
    ["D", "C", "P", "E"],
  ];
  let s = "";
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const lit = r === c;                       // K A N E, down the diagonal
      s += cell(c, r, lit ? MINT : DEEP, rows[r][c], lit ? DEEP : SOFT);
    }
  }
  return s;
}

/* SCRAMBLED: the letters of one name, out of order. Four tiles, lit, with the
   shuffle visible — E N K A rather than K A N E. */
function scrambledMotif() {
  const letters = ["E", "N", "K", "A"];
  let s = "";
  for (let i = 0; i < 4; i++) s += cell(i, 0, MINT, letters[i], DEEP);
  /* A second row, dimmer, showing the same tiles settling into place: the game
     is the move from one row to the other. */
  const solved = ["K", "A", "N", "E"];
  for (let i = 0; i < 4; i++) s += cell(i, 2, DEEP, solved[i], SOFT);
  /* The arrow between them, so the two rows read as one action. */
  const [ax, ay] = at(1.5, 1);
  s += `<path d="M ${ax + 28} ${ay + 12} l 0 26 m -9 -9 l 9 9 l 9 -9"` +
       ` stroke="${SOFT}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  return s;
}

/* VOWELS: the same name with its vowels taken out. The gaps ARE the game, so
   they are drawn as empty cells rather than as underscores — an underscore at
   thumbnail size reads as a hyphen. */
function vowelsMotif() {
  const shown = ["K", "", "N", ""];
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += shown[i]
      ? cell(i, 0, MINT, shown[i], DEEP)
      : cell(i, 0, DEEP, "", SOFT);
  }
  const shown2 = ["S", "", "L", "H"];
  for (let i = 0; i < 4; i++) {
    s += shown2[i]
      ? cell(i, 2, MINT, shown2[i], DEEP)
      : cell(i, 2, DEEP, "", SOFT);
  }
  return s;
}

/* GRID: one crossing. The across entry is solved and its letters are given;
   the down entry through it has only the crossing letter, which is exactly
   what solving one hands the next. */
function gridMotif() {
  let s = "";
  const across = ["K", "A", "N", "E"];
  for (let i = 0; i < 4; i++) s += cell(i, 1, MINT, across[i], DEEP);
  s += cell(1, 0, DEEP, "", SOFT);
  s += cell(1, 2, DEEP, "", SOFT);
  s += cell(1, 3, DEEP, "", SOFT);
  return s;
}

/* HILO: two values and the call between them. Higher or lower is the entire
   mechanic and an arrow pair says it without a word of copy. */
function hiloMotif() {
  /* A YEAR, KNOWN, AND THE ONE BELOW IT UNKNOWN. Four digits fill the same
     footprint the crossword's grid does, so the family reads as one set at
     thumbnail size — the first draft used two cells and a gap, and against the
     crossword's full block it looked like an unfinished card rather than a
     different game. */
  const known = ["1", "9", "0", "4"];
  let s = "";
  for (let i = 0; i < 4; i++) s += cell(i, 0, MINT, known[i], DEEP);
  for (let i = 0; i < 4; i++) s += cell(i, 3, DEEP, "?", SOFT);
  /* Higher or lower, between the two rows: the whole mechanic, and the only
     part of it that needs no words. */
  const [ax, ay] = at(1, 1.55);
  s += `<path d="M ${ax + 26} ${ay + 34} l 0 -30 m -10 10 l 10 -10 l 10 10"` +
       ` stroke="${MINT}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  const [bx, by] = at(2, 1.55);
  s += `<path d="M ${bx + 26} ${by + 4} l 0 30 m -10 -10 l 10 10 l 10 -10"` +
       ` stroke="${SOFT}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  return s;
}

/* CROSSWORD: the live card's own motif, reproduced from it. Here so --check
   and --only=crossword have something to compare, and so the family's set is
   complete in one file rather than four here and one in history. */
function crosswordMotif() {
  const lit = [
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
    [0, 1, 0, 0],
  ];
  const num = { "0,0": "X", "1,0": "I", "0,2": "1", "3,2": "1" };
  let s = "";
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      s += cell(c, r, lit[r][c] ? MINT : DEEP, num[`${c},${r}`] || "", DEEP);
    }
  }
  return s;
}

/* ---- the games --------------------------------------------------------- */
/* Two lines each: the first is what the game IS, in four or five words; the
   second is what arrives every day. Taken from each page's own description
   rather than written fresh, so the card and the page say the same thing. */
const GAMES = {
  crossword: {
    name: "CROSSWORD",
    lead: "Eleven answers. One match.",
    sub: "A new football crossword every day.",
    motif: crosswordMotif,
  },
  wordsearch: {
    name: "WORDSEARCH",
    lead: "Eleven names. One hidden.",
    sub: "A new football word search every day.",
    motif: wordsearchMotif,
  },
  scrambled: {
    name: "SCRAMBLED",
    lead: "Eleven names, all jumbled.",
    sub: "A new football eleven every day.",
    motif: scrambledMotif,
  },
  vowels: {
    name: "VOWELS",
    lead: "Eleven names, no vowels.",
    sub: "A new football eleven every day.",
    motif: vowelsMotif,
  },
  /* GRID: a crossing, which is the whole of this game. Two entries meeting at
     one square, one solved and one not — the letter that crosses is what a
     solved entry gives the next, and it is the only thing worth drawing. */
  grid: {
    name: "GRID",
    lead: "Eleven names, one grid.",
    sub: "No clues but the title. A new grid every day.",
    motif: gridMotif,
  },
  hilo: {
    name: "HILO",
    lead: "Eleven calls. Higher or lower.",
    sub: "A new football board every day.",
    motif: hiloMotif,
  },
};

/* ---- the card ---------------------------------------------------------- */
function cardSvg(game) {
  const g = GAMES[game];
  /* THE STRIPES. Eight bands, alternating, the width of the card divided by
     eight — a mown pitch, at an opacity that survives a thumbnail without
     becoming a pattern. */
  let stripes = "";
  for (let i = 0; i < 8; i += 2) {
    stripes += `<rect x="${i * (W / 8)}" y="0" width="${W / 8}" height="${H}" fill="${STRIPE}"/>`;
  }
  const NAME_X = 430;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${GROUND}"/>
  ${stripes}
  ${g.motif()}
  <text x="${NAME_X}" y="285" font-family="Barlow Condensed, sans-serif" font-weight="700"
        font-size="104" letter-spacing="1" fill="${MINT}">${g.name}</text>
  <text x="${NAME_X}" y="385" font-family="Barlow Condensed, sans-serif" font-weight="700"
        font-size="104" letter-spacing="1" fill="${MINT}">XI</text>
  <text x="${NAME_X}" y="458" font-family="Public Sans, sans-serif" font-weight="700"
        font-size="34" fill="${SOFT}">${g.lead}</text>
  <text x="${NAME_X}" y="506" font-family="Public Sans, sans-serif" font-weight="600"
        font-size="31" fill="${SOFT}">${g.sub}</text>
  <rect x="0" y="545" width="${W}" height="${H - 545}" fill="${DEEP}"/>
  <text x="96" y="605" font-family="Public Sans, sans-serif" font-weight="700"
        font-size="31" fill="${SOFT}">thexigames.com</text>
</svg>`;
}

function pageHtml(game) {
  return `<!doctype html><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Public+Sans:wght@600;700&display=block" rel="stylesheet">
<style>html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden}</style>
${cardSvg(game)}`;
}

/* ---- the run ----------------------------------------------------------- */
(async () => {
  /* THE CROSSWORD IS NOT IN A DEFAULT RUN. Its card is live and correct, and
     the header above says so — but the first run of this file regenerated it
     anyway, because "every game" included it. A comment is not a guard. Named
     explicitly with --only=crossword and it will render; otherwise the four
     that had no card of their own are the job. */
  const wanted = args.only ? [String(args.only)]
    : Object.keys(GAMES).filter((g) => g !== "crossword");
  const bad = wanted.filter((g) => !GAMES[g]);
  if (bad.length) { console.error("No such game: " + bad.join(", ")); process.exit(1); }

  let chromium;
  try { ({ chromium } = require("playwright")); }
  catch (e) {
    console.error("playwright is not installed. npm install -D playwright --no-save");
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const wrote = [], same = [], differs = [];

  for (const game of wanted) {
    await page.setContent(pageHtml(game), { waitUntil: "networkidle" });
    /* The webfont has to have PAINTED, not merely loaded: a screenshot taken a
       frame early renders the fallback and the card ships in the wrong face
       with nothing to say so. */
    await page.evaluate(() => document.fonts.ready);
    const shot = await page.screenshot({ type: "png" });
    const out = path.join(ROOT, "football", game, "og-image.png");
    const had = fs.existsSync(out) ? fs.readFileSync(out) : null;
    if (had && had.equals(shot)) { same.push(game); continue; }
    if (args.check) { differs.push(game + (had ? "" : " (missing)")); continue; }
    fs.writeFileSync(out, shot);
    wrote.push(`${game}  ${(shot.length / 1024).toFixed(0)}kB  -> football/${game}/og-image.png`);
  }
  await browser.close();

  console.log(`\nTHE XI GAMES — share cards, ${W}x${H}\n`);
  for (const w of wrote) console.log("  wrote    " + w);
  for (const s of same) console.log("  same     " + s);
  for (const d of differs) console.log("  DIFFERS  " + d);
  if (args.check && differs.length) {
    console.log("\nRun node tools/build_og_images.js to write them.");
    process.exit(1);
  }
})();
