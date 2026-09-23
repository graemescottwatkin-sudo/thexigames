#!/usr/bin/env node
/* tools/build_friendswhoami_calendar.js — which cards are dealt on which day.
 *
 *   node tools/build_friendswhoami_calendar.js --from 2026-09-23 [--days 122]
 *
 * Writes data/fr-whoami-calendar-production.sql, gitignored like every bank
 * file, applied to D1 by hand.
 *
 * THREE DOORS, NOT ELEVEN, AND THE ARITHMETIC IS WHY.
 *
 * Football's Who Am I deals eleven doors and the player opens ONE -- "one door,
 * one sitting", as wa-play.js puts it. The eleven are a choice, not eleven
 * questions. Copying that shape here looked obvious and does not survive
 * contact with the deck (figures measured 22 Sep 2026, before the deck grew
 * and before dailies became verified-only -- the argument for three doors
 * still holds, the numbers do not; the generator prints the current ones):
 *
 *   the deck holds 366 rounds (main 220, expert 72, locations 74)
 *   at 11 doors a day that is 33 days of content
 *   and the deck's own three-week rule needs 11 x 21 = 231 distinct cards
 *   in flight, against 103 that exist
 *
 * At THREE doors a day the rule holds -- 3 x 21 = 63 cards in flight, against
 * 103 -- and the deck runs for 122 days. Three doors beside three clues is also
 * a shape that means something, rather than football's eleven with eight of
 * them removed.
 *
 * THE REVOLVING DOOR IS THE DECK'S RULE AND IS OBEYED, NOT APPROXIMATED. A card
 * comes back no sooner than three weeks later, and when it does it moves to the
 * NEXT letter: first outing A, then B, then C, then D. Four appearances are
 * four different sets of three clues, which is the whole point of the banding --
 * a player who saw Rachel in September and again in November is not asked the
 * same three things.
 *
 * A CARD RETIRES WHEN ITS LETTERS ARE USED. A twelve-clue card has four
 * outings, a six-clue card two, a three-clue card one. There is no fifth.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

const FROM = arg("--from");
if (!FROM || !/^\d{4}-\d{2}-\d{2}$/.test(FROM)) {
  console.log("REFUSED: --from YYYY-MM-DD is required.");
  console.log("         It is the day the game starts dealing, and it is not guessed:");
  console.log("         a calendar that begins on the day it was BUILT is a calendar");
  console.log("         that has to be rebuilt the day the game actually launches.");
  process.exit(1);
}

export const DOORS = 3;
const REST_DAYS = 21;                    // the deck's own three-week rule

/* THE LOCATIONS ARE NOT DEALT HERE, AND THAT IS WHAT MAKES ENDLESS PLAY SAFE.
 *
 * Every round this calendar deals is a board somebody will meet on a known
 * future day. An endless mode drawing from the same pool would therefore be a
 * preview of the dailies -- play enough of it and you have seen the next four
 * months. That is the same exposure word-search free play has, which this
 * project looked at twice and accepted; the owner's call here was not to accept
 * it a second time.
 *
 * So the deck is split at the seam it already has. The 55 main and 18 expert
 * character cards -- 292 rounds -- are the daily, which is 97 days. The 30
 * LOCATION cards, 74 rounds, are never scheduled and belong to endless play:
 * "Where am I?" becomes a mode rather than an occasional door.
 *
 * NOTHING IS SPOILED IN EITHER DIRECTION. A player who exhausts the locations
 * has learned nothing about tomorrow, and a player who has never opened endless
 * play has missed no daily. The split is a product line, not a compromise --
 * which is the argument for doing it this way rather than excluding the next
 * three weeks and hoping nobody plays far enough ahead.
 *
 * REVERSED ON 23 SEPTEMBER 2026, AND RECORDED RATHER THAN DELETED. The owner
 * ruled that endless play uses the FULL deck, and that dailies deal VERIFIED
 * clues only. So endless play CAN now preview a daily, and the owner accepted
 * that knowingly; the paragraphs above are the reasoning that ruling overturned,
 * left standing so nobody reverses it back by accident. What survives: locations
 * are still never dailies. They have no rows in fr_wa_daily_clue — the importer
 * writes none for them — so this calendar cannot deal one even if a filter here
 * were lost, and the assertion near the end still proves it.
 */
const DAILY_DECKS = new Set(["main", "expert"]);

/* ---- read the deck out of the SQL we already emit ------------------------
 *
 * READ FROM THE IMPORT, NOT FROM THE CORPUS. tools/import_friendswhoami.js has
 * already resolved depth, rounds and the banding; parsing the markdown again
 * here would be a second opinion about how many outings a card has. */
/* --deck and --out exist for tools/import_friendswhoami_test.mjs, which runs
   this against a synthetic deck and must never overwrite the real files. */
const DECK_SQL = arg("--deck") ? path.resolve(arg("--deck"))
  : path.join(ROOT, "data", "fr-whoami-production.sql");
if (!fs.existsSync(DECK_SQL)) {
  console.log("REFUSED: data/fr-whoami-production.sql is not there.");
  console.log("         Run tools/import_friendswhoami.js first — this deals the deck it imported.");
  process.exit(1);
}

const sql = fs.readFileSync(DECK_SQL, "utf8");

/* THE DECK SQL MUST BE NEWER THAN THE DECK IT WAS BUILT FROM.
 *
 * On 22 September this dealt 97 days from a data/fr-whoami-production.sql
 * written at 08:11 -- from a deck that was rewritten at 23:00, and that the
 * importer had just REFUSED five minutes earlier. Nothing noticed: the file
 * was there, it parsed, and the calendar it produced described cards that no
 * longer had those shapes. D1 rejecting the file for an unrelated reason is
 * the only reason it did not land.
 *
 * So the source is asked for, and its age compared. --source is optional so
 * the calendar can still be rebuilt where the deck is not beside the checkout,
 * but when it is given, a stale import is a refusal rather than a warning. */
const SOURCE = arg("--source");
if (SOURCE) {
  const app = path.join(SOURCE, "who-am-i-app.html");
  if (!fs.existsSync(app)) {
    console.log(`REFUSED: --source has no who-am-i-app.html (${app})`);
    process.exit(1);
  }
  const deckAt = fs.statSync(app).mtimeMs;
  const sqlAt = fs.statSync(DECK_SQL).mtimeMs;
  if (sqlAt < deckAt) {
    console.log("REFUSED: data/fr-whoami-production.sql is OLDER than the deck it came from.");
    console.log(`         deck  ${new Date(deckAt).toISOString()}`);
    console.log(`         sql   ${new Date(sqlAt).toISOString()}`);
    console.log("         Re-run tools/import_friendswhoami.js first. A calendar dealt from a");
    console.log("         stale import describes cards that no longer have those shapes.");
    process.exit(1);
  }
}
const cards = [];
const re = /INSERT INTO fr_wa_card \(id, name, deck, section, card_no, depth, rounds, status\) VALUES \('([^']*)', '((?:[^']|'')*)', '([^']*)', '((?:[^']|'')*)', ([^,]+), (\d+), (\d+), '[^']*'\);/g;
let m;
while ((m = re.exec(sql))) {
  cards.push({ id: m[1], name: m[2].replace(/''/g, "'"), deck: m[3], rounds: Number(m[7]) });
}
if (!cards.length) {
  console.log("REFUSED: no cards parsed out of the import. The INSERT shape has changed.");
  process.exit(1);
}

const dailyCards = cards.filter((c) => DAILY_DECKS.has(c.deck));
const reserved = cards.filter((c) => !DAILY_DECKS.has(c.deck));
if (!dailyCards.length) {
  console.log("REFUSED: no cards in the daily decks — the split has gone wrong.");
  process.exit(1);
}

/* ---- deal ---------------------------------------------------------------- */

/* THE LETTERS EACH CARD ACTUALLY HAS, READ FROM ITS CLUE ROWS.
 *
 * This held its own `const LETTERS = "ABCD"` -- a second copy of an alphabet
 * the importer also held, and the two agreed only while no card had more than
 * four rounds. The deck now has cards with twelve, so a lead's fifth outing
 * would have been dealt at LETTERS[4], which is `undefined`, and the round
 * would have come up with no clues in front of a player.
 *
 * Read rather than restated: the import wrote every clue with its letter, so
 * the letters a card HAS are a fact already on disk. Sorted, because that is
 * the order the importer assigns them -- first outing A, then B, and so on. */
const lettersOf = new Map();
const clueRe = /INSERT INTO fr_wa_clue \(card_id, n, round_letter, step, text, vs, ep\) VALUES \('([^']*)', \d+, '([A-Z])'/g;
let cm;
while ((cm = clueRe.exec(sql))) {
  if (!lettersOf.has(cm[1])) lettersOf.set(cm[1], new Set());
  lettersOf.get(cm[1]).add(cm[2]);
}
for (const c of cards) {
  const got = [...(lettersOf.get(c.id) || [])].sort();
  /* THE CARD ROW AND ITS CLUE ROWS MUST AGREE ABOUT HOW MANY OUTINGS THERE
     ARE. They are two facts about one card written by one program, and this is
     the place where a disagreement would turn into a round with nothing in it. */
  if (got.length !== c.rounds) {
    console.log(`REFUSED: card ${c.id} says ${c.rounds} round(s) but its clues carry ` +
                `${got.length} letter(s): ${got.join("") || "none"}`);
    process.exit(1);
  }
  c.letters = got;
}

/* THE DAILY ROUNDS, FROM fr_wa_daily_clue — verified clues only, the owner's
 * ruling of 23 September 2026. A card's DAILY letters are not its full letters:
 * the daily card is the verified subset, banded by its own stride, so Ross has
 * twelve full rounds and fewer daily ones. Read from the rows the importer
 * wrote, exactly as the full letters are, and never re-derived here.
 *
 * EACH DAILY ROUND MUST HAVE ALL THREE STEPS, and the letters must run A, B, C
 * with no gap — the importer assigns them in that order, and a round with a
 * missing step is a round that shows a player two clues and sells a third that
 * is not there. */
const dailyOf = new Map();          // card_id -> Map(letter -> Set(step))
const dailyRe = /INSERT INTO fr_wa_daily_clue \(card_id, round_letter, step, n\) VALUES \('([^']*)', '([A-Z])', (\d+), \d+\);/g;
let dm;
while ((dm = dailyRe.exec(sql))) {
  if (!dailyOf.has(dm[1])) dailyOf.set(dm[1], new Map());
  const byLetter = dailyOf.get(dm[1]);
  if (!byLetter.has(dm[2])) byLetter.set(dm[2], new Set());
  byLetter.get(dm[2]).add(Number(dm[3]));
}
if (!dailyOf.size) {
  console.log("REFUSED: the import carries no fr_wa_daily_clue rows. Dailies are verified");
  console.log("         clues only; an import from before that ruling cannot be dealt from.");
  process.exit(1);
}
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
for (const c of cards) {
  const byLetter = dailyOf.get(c.id) || new Map();
  const letters = [...byLetter.keys()].sort();
  const want = ALPHA.slice(0, letters.length);
  if (letters.join("") !== want) {
    console.log(`REFUSED: card ${c.id}'s daily letters are ${letters.join("")}, not ${want}`);
    process.exit(1);
  }
  for (const L of letters) {
    const steps = [...byLetter.get(L)].sort().join("");
    if (steps !== "123") {
      console.log(`REFUSED: card ${c.id} daily round ${L} has steps ${steps}, not 123`);
      process.exit(1);
    }
  }
  c.dailyLetters = letters;
  c.dailyRounds = letters.length;
}

/* LOCATIONS HAVE NO DAILY ROUNDS, and that is checked here as well as in the
   importer, because it is the one property that stops a location being dealt. */
const locDaily = reserved.filter((c) => c.dailyRounds > 0);
if (locDaily.length) {
  console.log(`REFUSED: ${locDaily.length} location card(s) carry daily rounds: ` +
              locDaily.map((c) => c.id).join(", "));
  process.exit(1);
}

/* A CHARACTER WITH FEWER THAN THREE VERIFIED CLUES HAS NO DAILY ROUND and is
   left out of the calendar entirely; it is still played in endless play. */
const dealable = dailyCards.filter((c) => c.dailyRounds > 0);
const endlessOnly = dailyCards.filter((c) => c.dailyRounds === 0);
const totalRounds = dealable.reduce((a, c) => a + c.dailyRounds, 0);
const maxDays = Math.floor(totalRounds / DOORS);
const DAYS = Math.max(1, Math.min(Number(arg("--days")) || maxDays, maxDays));

const state = new Map(dealable.map((c) => [c.id, { used: 0, lastDay: -Infinity, card: c }]));
const days = [];
let short = null;

for (let d = 0; d < DAYS; d++) {
  /* ELIGIBLE: has an outing left, and has rested. Ordered by how long ago it
     was last seen so the rotation spreads rather than favouring the front of
     the deck, with the card number breaking ties so the calendar is
     REPRODUCIBLE -- the same deck and the same start date give the same days,
     which is what makes a regenerated calendar comparable to the live one. */
  const eligible = [...state.values()]
    .filter((s) => s.used < s.card.dailyRounds && d - s.lastDay > REST_DAYS)
    .sort((a, b) => (a.lastDay - b.lastDay) || String(a.card.id).localeCompare(String(b.card.id)));

  if (eligible.length < DOORS) { short = d; break; }

  const picked = eligible.slice(0, DOORS);
  days.push(picked.map((s, i) => ({
    slot: i + 1,
    cardId: s.card.id,
    letter: s.card.dailyLetters[s.used],
    name: s.card.name,
  })));
  for (const s of picked) { s.used += 1; s.lastDay = d; }
}

/* ---- what came out ------------------------------------------------------- */

const dayKey = (i) => {
  const t = new Date(FROM + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + i);
  return t.toISOString().slice(0, 10);
};

console.log(`  ${cards.length} cards in the deck`);
console.log(`  daily:    ${dealable.length} cards, ${totalRounds} verified rounds, ${DOORS} doors a day`);
if (endlessOnly.length) {
  console.log(`  endless only (fewer than 3 verified clues): ${endlessOnly.length} — ` +
              endlessOnly.map((c) => c.name).join(", "));
}
console.log(`  locations: ${reserved.length} cards, never dailies`);
console.log(`  dealt ${days.length} day(s): ${dayKey(0)} to ${dayKey(days.length - 1)}`);
if (short !== null) {
  console.log(`  stopped at day ${short + 1}: fewer than ${DOORS} cards had both an ` +
              `outing left and ${REST_DAYS} days of rest`);
}

/* NO CARD TWICE INSIDE THE REST WINDOW, asserted rather than assumed. The
   dealer above is what enforces it; this is what says it worked, and it is
   cheap next to a calendar that quietly repeats a card in week two. */
const lastSeen = new Map();
let breaches = 0;
days.forEach((doors, i) => {
  for (const door of doors) {
    if (lastSeen.has(door.cardId) && i - lastSeen.get(door.cardId) <= REST_DAYS) breaches++;
    lastSeen.set(door.cardId, i);
  }
});
console.log(`  repeats inside ${REST_DAYS} days: ${breaches}`);
if (breaches) { console.log("REFUSED: the rotation broke its own rest rule."); process.exit(1); }

/* AND NO CARD DEALT AT A LETTER IT HAS NOT GOT. A three-clue location has one
   outing and only letter A; dealing it at B would ask for clues that are not
   there, and the round would come up empty in front of a player. */
const bad = [];
for (const [, s] of state) if (s.used > s.card.dailyRounds) bad.push(s.card.id);
if (bad.length) { console.log("REFUSED: over-dealt: " + bad.join(", ")); process.exit(1); }
console.log(`  cards fully retired: ${[...state.values()].filter((s) => s.used === s.card.dailyRounds).length}`);

/* THE RESERVE IS ABSENT FROM THE CALENDAR, asserted rather than trusted to the
   filter above. If a location ever reached a door, endless play would start
   previewing dailies again and nothing else would notice. */
const reservedIds = new Set(reserved.map((c) => c.id));
const leaked = days.flat().filter((d) => reservedIds.has(d.cardId));
if (leaked.length) {
  console.log(`REFUSED: ${leaked.length} reserved card(s) were dealt as a daily.`);
  process.exit(1);
}
console.log(`  reserved cards dealt as a daily: 0`);

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const out = ["-- GENERATED by tools/build_friendswhoami_calendar.js — do not edit.",
             "-- The Friends Who Am I calendar. SECRET: names which card is behind",
             "-- which door on which day.",
             /* No BEGIN TRANSACTION: D1 refuses it, and --file is already
                all-or-nothing. See tools/import_friendswhoami.js. */
             "DELETE FROM fr_wa_door;",
             "DELETE FROM fr_wa_board;"];
days.forEach((doors, i) => {
  const day = dayKey(i);
  out.push(`INSERT INTO fr_wa_board (play_date, status) VALUES (${q(day)}, 'published');`);
  for (const d of doors) {
    out.push(`INSERT INTO fr_wa_door (play_date, slot, card_id, round_letter) VALUES (` +
             `${q(day)}, ${d.slot}, ${q(d.cardId)}, ${q(d.letter)});`);
  }
});

const OUT = arg("--out") ? path.resolve(arg("--out"))
  : path.join(ROOT, "data", "fr-whoami-calendar-production.sql");
fs.writeFileSync(OUT, out.join("\n") + "\n");
console.log(`  wrote ${path.relative(ROOT, OUT).split(path.sep).join("/")}`);
console.log(`  apply with: npx wrangler d1 execute crosswordxi --remote --file=data/fr-whoami-calendar-production.sql`);
