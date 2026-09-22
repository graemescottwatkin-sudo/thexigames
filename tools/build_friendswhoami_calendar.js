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
 * contact with the deck:
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
 */
const DAILY_DECKS = new Set(["main", "expert"]);

/* ---- read the deck out of the SQL we already emit ------------------------
 *
 * READ FROM THE IMPORT, NOT FROM THE CORPUS. tools/import_friendswhoami.js has
 * already resolved depth, rounds and the banding; parsing the markdown again
 * here would be a second opinion about how many outings a card has. */
const DECK_SQL = path.join(ROOT, "data", "fr-whoami-production.sql");
if (!fs.existsSync(DECK_SQL)) {
  console.log("REFUSED: data/fr-whoami-production.sql is not there.");
  console.log("         Run tools/import_friendswhoami.js first — this deals the deck it imported.");
  process.exit(1);
}

const sql = fs.readFileSync(DECK_SQL, "utf8");
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

const totalRounds = dailyCards.reduce((a, c) => a + c.rounds, 0);
const maxDays = Math.floor(totalRounds / DOORS);
const DAYS = Math.max(1, Math.min(Number(arg("--days")) || maxDays, maxDays));

/* ---- deal ---------------------------------------------------------------- */

const LETTERS = "ABCD";
const state = new Map(dailyCards.map((c) => [c.id, { used: 0, lastDay: -Infinity, card: c }]));
const days = [];
let short = null;

for (let d = 0; d < DAYS; d++) {
  /* ELIGIBLE: has an outing left, and has rested. Ordered by how long ago it
     was last seen so the rotation spreads rather than favouring the front of
     the deck, with the card number breaking ties so the calendar is
     REPRODUCIBLE -- the same deck and the same start date give the same days,
     which is what makes a regenerated calendar comparable to the live one. */
  const eligible = [...state.values()]
    .filter((s) => s.used < s.card.rounds && d - s.lastDay > REST_DAYS)
    .sort((a, b) => (a.lastDay - b.lastDay) || String(a.card.id).localeCompare(String(b.card.id)));

  if (eligible.length < DOORS) { short = d; break; }

  const picked = eligible.slice(0, DOORS);
  days.push(picked.map((s, i) => ({
    slot: i + 1,
    cardId: s.card.id,
    letter: LETTERS[s.used],
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
console.log(`  daily:    ${dailyCards.length} cards, ${totalRounds} rounds, ${DOORS} doors a day`);
console.log(`  reserved: ${reserved.length} cards, ` +
            `${reserved.reduce((a, c) => a + c.rounds, 0)} rounds, for endless play only`);
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
for (const [, s] of state) if (s.used > s.card.rounds) bad.push(s.card.id);
if (bad.length) { console.log("REFUSED: over-dealt: " + bad.join(", ")); process.exit(1); }
console.log(`  cards fully retired: ${[...state.values()].filter((s) => s.used === s.card.rounds).length}`);

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
             "BEGIN TRANSACTION;",
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
out.push("COMMIT;");

const OUT = path.join(ROOT, "data", "fr-whoami-calendar-production.sql");
fs.writeFileSync(OUT, out.join("\n") + "\n");
console.log(`  wrote data/fr-whoami-calendar-production.sql`);
console.log(`  apply with: npx wrangler d1 execute crosswordxi --remote --file=data/fr-whoami-calendar-production.sql`);
