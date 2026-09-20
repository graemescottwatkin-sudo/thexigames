/* friends/crossword/fixture.mjs — a board for the suites, built by the REAL
 * layout engine rather than by hand.
 *
 * THIS FILE EXISTS BECAUSE HAND-BUILT FIXTURES AGREED WITH A BUG. On 20 Sep
 * 2026 the Friends route, its marking endpoint and its client all looked a cell
 * up as `puzzle.cells[entry.cells[i]]`. The cell map is keyed by the string
 * "x,y" and an entry's cells are { x, y } OBJECTS, so every one of those
 * lookups was undefined — and undefined quietly, yielding no letter rather than
 * throwing. The marker read every answer as blank, and the leak scan searched
 * for nothing and pronounced itself clean.
 *
 * All three suites passed, because all three fixtures were written by the same
 * hand that wrote the bug and used string-keyed entry cells. A fixture built
 * from an assumption can only ever confirm it. It was caught by a POSITIVE
 * CONTROL — asking whether the scan could see an answer AT ALL — which found it
 * had extracted 0 answers from 1,320 entries in production.
 *
 * So the shape is no longer anybody's opinion: generate() is the same function
 * that made the 120 boards now in D1, and if the engine's shape ever moves, the
 * suites move with it instead of quietly testing a shape that no longer exists.
 *
 * THE WORDS INTERLOCK AND EVERY ROW HAS ITS OWN `group`. The engine samples one
 * row per group, so a bank that shares a group places a single answer and every
 * case built on it fails for a reason that has nothing to do with what it is
 * testing.
 */

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FCW = require(path.join(ROOT, "football/crossword/js/engine.js"));

export const WORDS = ["MONICA", "CHANDLER", "PHOEBE", "RACHEL", "JOEY", "ROSS",
  "GUNTHER", "JANICE", "EMMA", "MARCEL", "LONDON"];
export const title = (w) => w[0] + w.slice(1).toLowerCase();

/* `over(word, i)` may override any field of any row — that is how a case plants
   an answer in a category, or a clue that contains its own answer. */
export function makeBank(over) {
  const f = over || (() => ({}));
  return WORDS.map((w, i) => Object.assign({
    id: `FIX${String(i + 1).padStart(4, "0")}`,
    cat: "Fixture > Thing",
    group: `G${i + 1}`,
    pgk: `P${i + 1}`,
    entity: `E${i + 1}`,
    maxPer: 1,
    clue: `Fixture clue number ${i + 1}?`,
    answer: title(w),
    grid: w,
    enum: `(${w.length})`,
    breaks: [],
    diff: "Easy",
    era: "Timeless",
    aliases: [],
    notes: "",
    sourceName: "Fixture",
    sourceQuote: `A fixture sentence naming ${title(w)} for row ${i + 1}.`,
  }, f(w, i)));
}

export const SEED = 500;
export const makeBoard = (over, seed) => FCW.generate(makeBank(over), { seed: seed || SEED });

/* The same conversion the server does, restated here ONLY so a suite can assert
   against it. Production reads functions/_lib/puzzle.js cellKey. */
export const key = (c) => (c && typeof c === "object" ? c.x + "," + c.y : String(c));

/* The letters the server kept, entry by entry — which is what an answer IS. A
   suite that wants to type a correct grid asks for this rather than knowing the
   words, so it cannot drift from the board it was handed. */
export function answersOf(puzzle) {
  return puzzle.entries.map((e) => ({
    id: e.row.id,
    num: e.num,
    dir: e.dir,
    keys: (e.cells || []).map(key),
    letters: (e.cells || []).map((c) => (puzzle.cells[key(c)] || {}).ch || "").join(""),
  }));
}

/* A completely filled, completely correct grid for a board. */
export function solvedGrid(puzzle) {
  const g = {};
  for (const k of Object.keys(puzzle.cells)) g[k] = puzzle.cells[k].ch;
  return g;
}
