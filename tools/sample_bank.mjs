/* sample_bank.mjs — a clue bank made of what this repository already ships.
 *
 * WHY IT EXISTS. football/crossword/headless_test is the only thing that ever
 * tested FCW.generate — the code that builds every board this game has served
 * — and it stopped running when the games moved under football/, because it
 * was written to run INSIDE the private archive and required ./engine.js and
 * ./data.json beside itself. The clue bank is secret and always will be, so a
 * suite that can only run where the bank is cannot run in CI, which is the
 * same as not existing.
 *
 * SO THE BANK IS BUILT FROM PUBLIC PARTS. functions/_lib/sample-puzzles.js
 * ships 77 real answers with their real clues — it is what an unbound preview
 * plays — and shared/xi-clubs.js ships every club to have played a Premier
 * League season. Both are in the repository, neither is clue material anybody
 * is protecting, and between them they are enough for the generator to build
 * a board out of.
 *
 * WHAT IT IS NOT. It is not the bank. Every assertion about clue CONTENT —
 * transfers, caps, nicknames, self-answering pairs — needs the real one and
 * says so when it is missing. What this proves is the ENGINE: that a grid can
 * be built, numbered, validated and scored.
 *
 * ONE ROW, ONE pgk, AND THAT IS THE WHOLE TRICK. buildPool() allows one row
 * per puzzle-group key by default, so a bank whose rows share a key can never
 * fill a grid — the generator retries until it gives up. An earlier attempt at
 * this ran for ten minutes and produced nothing for exactly that reason.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/* The sample puzzles' answers and clues, read out of the module rather than
   imported: it is a Worker module whose shape is the endpoint's business, and
   all this wants is the pairs. */
function samplePairs() {
  const src = fs.readFileSync(path.join(ROOT, "functions/_lib/sample-puzzles.js"), "utf8");
  const answers = [...src.matchAll(/"answer":"([^"]+)"/g)].map((m) => m[1]);
  const clues = [...src.matchAll(/"clue":"([^"]+)"/g)].map((m) => m[1]);
  const out = [];
  for (let i = 0; i < Math.min(answers.length, clues.length); i++) {
    out.push({ answer: answers[i], clue: clues[i] });
  }
  return out;
}

/* Every club to have played a Premier League season. A club's clue is the
   league it played in, which names no answer and gives nothing away — these
   exist to widen the pool, not to be interesting. */
function clubPairs() {
  const src = fs.readFileSync(path.join(ROOT, "shared/xi-clubs.js"), "utf8");
  const names = [...new Set([...src.matchAll(/"([A-Z][A-Za-z' .-]{3,30})"/g)].map((m) => m[1]))];
  return names.map((n) => ({ answer: n, clue: "A club of the Premier League era" }));
}

/* A row in the shape buildPool() reads. The grid form, the enumeration and the
   word breaks are the ENGINE'S OWN normalisation rather than three more things
   written down here — the first check in the suite is that a bank agrees with
   the normaliser, and a bank built by restating it would agree with itself. */
export function sampleBank(FCW) {
  const seen = new Set();
  const rows = [];
  for (const p of [...samplePairs(), ...clubPairs()]) {
    const n = FCW.normaliseAnswer(p.answer);
    if (!/^[A-Z]+$/.test(n.grid) || n.grid.length < 3 || n.grid.length > 15) continue;
    if (seen.has(n.grid)) continue;                    // one row per answer
    /* A clue that contains its own answer is self-answering and the pool drops
       it. Dropped here too, so the bank does not pretend to be bigger. */
    if (n.grid && p.clue.toUpperCase().replace(/[^A-Z]/g, "").includes(n.grid)) continue;
    seen.add(n.grid);
    const id = "SAMPLE-" + String(rows.length + 1).padStart(3, "0");
    rows.push({
      id,
      cat: "Sample → public data",
      clue: p.clue,
      answer: p.answer,
      grid: n.grid,
      breaks: n.breaks,
      enum: n.breaks.length
        ? n.breaks.concat([n.grid.length]).map((b, i, a) => b - (i ? a[i - 1] : 0)).join(",")
        : String(n.grid.length),
      entity: p.answer,
      /* THE ENGINE'S OWN VOCABULARY, not a shape invented here. Difficulty is
         one of the three names LEVELS selects on and era one of DEFAULT_ERAS;
         a bank that said `diff: 2` looked fine until a suite asked for an easy
         puzzle, emptied the pool and crashed the generator. Spread across the
         rows so an easy, a medium and a hard puzzle can all be built. */
      diff: ["Easy", "Medium", "Hard"][rows.length % 3],
      /* ONE ROW, ONE KEY. See the note at the top: rows sharing a pgk cannot
         appear in the same puzzle, so a shared key is a bank of one. */
      pgk: id,
      maxPer: 1,
      group: "Sample",
      era: FCW.DEFAULT_ERAS[rows.length % FCW.DEFAULT_ERAS.length],
    });
  }
  return rows;
}
