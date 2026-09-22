#!/usr/bin/env node
/* tools/import_friendswhoami.js — the Friends Who Am I deck, into SQL.
 *
 *   node tools/import_friendswhoami.js --source "C:\path\to\WhoAmI_Friends"
 *   node tools/import_friendswhoami.js --source <folder> --check
 *
 * Writes data/fr-whoami-production.sql, which goes to D1 by hand:
 *   npx wrangler d1 execute crosswordxi --remote --file=data/fr-whoami-production.sql
 *
 * THE NAME ENDS "-production.sql" AND THAT IS NOT DECORATION. .gitignore
 * protects banks by the PATTERN data/*-production*.sql, not by a list of
 * names. The first version of this wrote data/fr-whoami.sql, which matches
 * none of the rules and would have sat in the tree stageable -- the exact
 * fault .gitignore's own comments describe from the Scrambled bank: "the file
 * was the bank, named like the bank". Named to the convention, it is covered
 * by the rule that covers every other one.
 *
 * THE DECK IS SECRET AND LIVES OUTSIDE THIS REPOSITORY, like every other bank
 * in this family. 1,098 clues and 351 answers are the whole game; a copy of
 * them on a public GitHub is the game given away. The corpus stays in
 * ..\..\Other\WhoAmI_Friends and only the generated SQL crosses, and only as
 * far as an ignored file.
 *
 * IT READS THE BUILT ARTIFACT, NOT THE MARKDOWN. who-am-i-app.html carries the
 * deck in <script type="application/json" id="deck-data">, which is the corpus
 * AFTER its own build has resolved evidence tiers, episode codes and — most
 * importantly — the answer collisions. Reimplementing that matching here would
 * be a second answer to "what counts as correct", written by somebody who did
 * not do the several passes it took to get right, and the two would disagree
 * the first time a card was added. The upstream build is the authority; this
 * file is a translation.
 *
 * WHAT IT REFUSES, because an importer that accepts anything is a bank with no
 * gate in front of it:
 *
 *   - a card whose clue count is not a whole number of rounds (a multiple of 3)
 *   - an 'accept' string that points at more than one card, which would make a
 *     correct answer mark a player wrong
 *   - a clue that names its own answer, which is a card that gives itself away
 *   - a card with no accepted answer at all, which is unwinnable
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CHECK = process.argv.includes("--check");

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

const SOURCE = arg("--source");
if (!SOURCE) {
  console.log("REFUSED: --source <folder> is required, and it is not in this repository.");
  process.exit(1);
}

const APP = path.join(SOURCE, "who-am-i-app.html");
if (!fs.existsSync(APP)) {
  console.log(`REFUSED: no who-am-i-app.html in ${SOURCE}.`);
  console.log("         Run build_app.py there first — this reads its output, not the markdown.");
  process.exit(1);
}

/* ---- read the deck ------------------------------------------------------- */

const html = fs.readFileSync(APP, "utf8");
const block = html.match(/<script type="application\/json" id="deck-data">([\s\S]*?)<\/script>/);
if (!block) {
  console.log("REFUSED: who-am-i-app.html carries no deck-data block.");
  process.exit(1);
}
let deck;
try { deck = JSON.parse(block[1]); }
catch (e) { console.log("REFUSED: the deck-data block is not JSON — " + e.message); process.exit(1); }

const cards = deck.cards || [];

/* ---- the rotation -------------------------------------------------------- */

/* A CARD'S DEPTH DECIDES HOW MANY ROUNDS IT HAS, and the deck states the rule:
   twelve clues give four rounds reading hard to easy with no clue shared —
   A = 1·5·9, B = 2·6·10, C = 3·7·11, D = 4·8·12. Six give two (A = 1·3·5,
   B = 2·4·6) and three give one. Derived from the depth ONCE, here, rather
   than in the endpoint that deals a round: the stride is the number of rounds,
   which is the fact the rule actually turns on. */
/* ANY MULTIPLE OF THREE, AND THE RULE IS THE DECK'S, QUOTED.
 *
 * This held SHAPES = { 12: 4, 6: 2, 3: 1 } -- three depths written out -- and
 * the deck outgrew it on 22 September: Rachel went to 24 clues, the other five
 * leads to 36, and seventeen more cards to 15, 18 or 21. The importer refused
 * all 24 of them, correctly by its own rule and wrongly by the deck's, because
 * the deck's rule was never "12, 6 or 3". WHO_AM_I_Friends.md states it:
 *
 *   "A card yields one round for every three clues. Rachel has twenty-four
 *    clues and so eight rounds. Most subjects have twelve and so four."
 *
 * So rounds = depth / 3, and the banding already generalised: round k takes
 * clues k, k + r, k + 2r where r is the number of rounds, which reproduces
 * every case the deck writes out -- A = 1.5.9 at twelve, A = 1.3.5 at six,
 * A = 1.2.3 at three. Writing depths out was the fault; the stride was right
 * all along.
 *
 * THE LETTERS ARE THE ALPHABET, and this is now the ONE copy of it. The
 * calendar held its own "ABCD" and would have dealt a card's fifth outing at
 * letter `undefined`; it reads the letters each card actually has from the SQL
 * this file writes, rather than restating the alphabet. */
export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function roundsFor(depth) {
  if (!Number.isInteger(depth) || depth < 3 || depth % 3 !== 0) return null;
  const rounds = depth / 3;
  /* A LIMIT, STATED, rather than a letter that runs off the end of a string
     and comes back `undefined`. Twenty-six outings is 78 clues on one card;
     the deepest is 36. */
  return rounds <= LETTERS.length ? rounds : null;
}

/* Clue n (1-based) belongs to round (n-1) % rounds, at step floor((n-1)/rounds). */
function placeOf(n, rounds) {
  const i = n - 1;
  return { letter: LETTERS[i % rounds], step: Math.floor(i / rounds) + 1 };
}

/* THE FOLD IS THE RUNTIME'S, IMPORTED AND NOT REIMPLEMENTED.
 *
 * This file had its own -- lowercase, spaces kept, "rachel green" -- while
 * wadata.js folds for matching to "RACHELGREEN". Every answer was therefore
 * stored in a shape the guess endpoint would never look up, and the game would
 * have told a player who typed the right name that they were wrong. Nothing
 * about either function was wrong on its own; there were simply two of them.
 *
 * Importing the real one means the string written here and the string looked up
 * there cannot diverge, including the day somebody teaches the fold about a new
 * accent. */
import { fold } from "../functions/_lib/wadata.js";

/* AND A SECOND NORMALISER, FOR PROSE, WHICH IS A DIFFERENT JOB. The
   self-naming check needs WORDS, so it needs the spaces that fold() removes --
   "the moustache" has to be findable as two words inside a sentence. Kept
   separate and named for what it does, rather than bending the fold and
   breaking the matching it exists for. */
const words = (s) => String(s || "").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const DECK_OF = {
  "Expert Pile": "expert",
  "Locations": "location",
};

/* ---- gate ---------------------------------------------------------------- */

const faults = [];
const acceptOwners = new Map();     // folded answer -> [cardId]

for (const c of cards) {
  const depth = (c.clues || []).length;
  const rounds = roundsFor(depth);
  if (!rounds) {
    faults.push(`${c.id} "${c.name}": ${depth} clues, which is not a whole number of rounds ` +
      `(the deck deals one round per three clues)`);
    continue;
  }

  const accepts = (c.accept || []).map(fold).filter(Boolean);
  if (!accepts.length) {
    faults.push(`${c.id} "${c.name}": no accepted answer, so the card cannot be won`);
  }
  for (const a of accepts) {
    if (!acceptOwners.has(a)) acceptOwners.set(a, []);
    acceptOwners.get(a).push(c.id);
  }

  /* A CLUE MAY GIVE ITS CARD AWAY, BUT ONLY IN THE EASY BAND.
   *
   * THE STRING THAT COUNTS IS AN ACCEPTED ANSWER, NOT THE CARD'S NAME, and
   * that distinction is the whole check. Two earlier versions of this failed on
   * it. Matching accepted answers as SUBSTRINGS flagged 42 clues including "my
   * dad calls me his little HARMONICA", a pun and one of the best in the deck.
   * Narrowing to whole words of the NAME field still flagged 25, every one a
   * relative sharing a name -- "I'm Phoebe's birth mother" on Phoebe Abbott,
   * "My son is Joey" on Joey Sr. Both were noise, and I removed the check
   * entirely as unfixable.
   *
   * It was fixable, and the deck's author supplied the rule. "phoebe" is an
   * accepted answer for card 6 and NOT for E6 Phoebe Abbott, so the artifact
   * had already computed the distinction I was trying to reconstruct from the
   * name field. Ask the accept list and the relatives stop matching.
   *
   * THEN POSITION DECIDES, which is the half that makes it a rule rather than a
   * prohibition. A clue containing its own answer in the EASY band is the
   * definition of a giveaway and is correct -- "I'm the male nanny", "They
   * called me the Yeti". Before that band it is a leak: the player reads the
   * word and types it straight back for full marks. 34 of the deck's clues do
   * this legitimately.
   *
   * THE RULE FOUND FIVE REAL DEFECTS A REGEX ON THE NAME NEVER WOULD: Phoebe's
   * HARD clue printed "Regina Phalange" and her medium one "Princess Consuela",
   * both accepted answers for her; Ugly Naked Guy's hard clue printed "naked";
   * Richard's printed "the moustache"; the Moondance's medium clue printed
   * "diner". All five were reworded upstream before this check was adopted here,
   * which is why it passes on a deck it would once have refused.
   *
   * THE BAND BOUNDARY IS DERIVED. rounds = depth / 3 and each band is one round
   * deep, so the easy band begins at index (depth / 3) * 2 -- 8 of 12, 4 of 6,
   * 2 of 3. Written as arithmetic rather than as three cases, because three
   * cases is where the fourth depth would be forgotten. */
  const easyFrom = Math.floor(depth / 3) * 2;
  const spoken = (c.accept || []).map(words).filter(Boolean);
  for (let i = 0; i < c.clues.length; i++) {
    if (i >= easyFrom) continue;                 // the giveaway band, by design
    const t = " " + words(c.clues[i].t) + " ";
    const named = spoken.find((a) => t.includes(" " + a + " "));
    if (named) {
      faults.push(
        `${c.id} "${c.name}" clue ${i + 1}: prints its own answer ("${named}") ` +
        `before the easy band, which begins at clue ${easyFrom + 1}`);
    }
  }
}

/* AMBIGUITY IS A FAULT IN THE ACCEPT LIST AND ONLY THERE. `find` is allowed to
   point at several cards — that is what it is for, offering a choice when
   somebody types "apartment" — but an ACCEPTED string that matches two cards
   would mark a correct answer wrong on one of them. */
for (const [answer, owners] of acceptOwners) {
  if (owners.length > 1) {
    faults.push(`"${answer}" is accepted by ${owners.length} cards (${owners.join(", ")})`);
  }
}

if (faults.length) {
  console.log(`REFUSED: ${faults.length} fault(s) in the deck:`);
  faults.slice(0, 12).forEach((f) => console.log("    " + f));
  if (faults.length > 12) console.log(`    ... and ${faults.length - 12} more`);
  process.exit(1);
}

/* ---- emit ---------------------------------------------------------------- */

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const lines = [];
lines.push("-- GENERATED by tools/import_friendswhoami.js — do not edit.");
lines.push("-- The Friends Who Am I deck. SECRET: this file is gitignored and");
lines.push("-- carries every clue and every answer.");
/* NO BEGIN TRANSACTION, AND D1 IS WHY. It refuses the statement outright --
   "To execute a transaction, please use the state.storage.transaction() ...
   APIs instead of the SQL BEGIN TRANSACTION" -- so the first real run of the
   calendar file died on its first line. It needs none: `wrangler d1 execute
   --file` is already all-or-nothing ("if the execution fails to complete, your
   DB will return to its original state"), which is the property the wrapper
   was reaching for. No other importer in tools/ carries one; these two were
   written without looking. */
lines.push("DELETE FROM fr_wa_clue;");
lines.push("DELETE FROM fr_wa_answer;");
lines.push("DELETE FROM fr_wa_card;");

let clueCount = 0, answerCount = 0;
for (const c of cards) {
  const depth = c.clues.length;
  const rounds = roundsFor(depth);
  const deckName = DECK_OF[c.section] || "main";
  lines.push(
    `INSERT INTO fr_wa_card (id, name, deck, section, card_no, depth, rounds, status) VALUES (` +
    `${q(c.id)}, ${q(c.name)}, ${q(deckName)}, ${q(c.section)}, ` +
    `${Number(c.id) || "NULL"}, ${depth}, ${rounds}, 'published');`);

  for (let i = 0; i < depth; i++) {
    const cl = c.clues[i];
    const p = placeOf(i + 1, rounds);
    lines.push(
      `INSERT INTO fr_wa_clue (card_id, n, round_letter, step, text, vs, ep) VALUES (` +
      `${q(c.id)}, ${i + 1}, ${q(p.letter)}, ${p.step}, ${q(cl.t)}, ` +
      `${cl.vs ? q(cl.vs) : "NULL"}, ${cl.ep ? q(cl.ep) : "NULL"});`);
    clueCount++;
  }

  const seen = new Set();
  for (const [list, kind] of [[c.accept || [], "accept"], [c.find || [], "suggest"]]) {
    for (const raw of list) {
      const a = fold(raw);
      /* ACCEPT WINS OVER SUGGEST for the same string on the same card: the
         lists overlap by design (Rachel's name is in both), and the primary key
         is (answer, card_id), so inserting both would be a constraint error on
         a deck that is perfectly correct. */
      if (!a || seen.has(a)) continue;
      seen.add(a);
      lines.push(
        `INSERT INTO fr_wa_answer (card_id, answer, kind) VALUES (${q(c.id)}, ${q(a)}, ${q(kind)});`);
      answerCount++;
    }
  }
}
const OUT = path.join(ROOT, "data", "fr-whoami-production.sql");
const sql = lines.join("\n") + "\n";

console.log(`  ${cards.length} cards, ${clueCount} clues, ${answerCount} answers`);
const byDeck = {};
for (const c of cards) {
  const d = DECK_OF[c.section] || "main";
  byDeck[d] = (byDeck[d] || 0) + 1;
}
console.log("  decks: " + Object.entries(byDeck).map(([k, v]) => `${k} ${v}`).join(", "));
const cited = cards.reduce((a, c) => a + c.clues.filter((x) => x.vs === "ep").length, 0);
console.log(`  clues with an episode located: ${cited}`);

if (CHECK) {
  console.log("  the deck is gated, and nothing was written");
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, sql);
  console.log(`  wrote data/fr-whoami-production.sql (${(sql.length / 1024).toFixed(0)} KB)`);
  console.log("  apply with: npx wrangler d1 execute crosswordxi --remote --file=data/fr-whoami-production.sql");
}
