/* rules_test.mjs — Grid XI's marking, propagation and score.
 *
 * §6 of the spec says of propagation: "state this precisely or it becomes a bug
 * farm". This is the file that states it. Three rules, and two of them are
 * rules about what must NOT happen:
 *
 *   correct  propagates to the crossing entry, free, immediately
 *   present  does NOT — it is a claim about the entry that was guessed
 *   absent   does NOT — same reason
 *
 * A check that only proved the first would let both the others through, and a
 * propagating amber is unfalsifiable from the player's side: they would simply
 * be told a letter is in a word it is not in, and never know why.
 *
 *   node football/grid/rules_test.mjs        (from the repo root)
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("./js/rules.js");

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const C = R.CORRECT, P = R.PRESENT, A = R.ABSENT;
const short = (m) => (m || []).map((x) => x[0].toUpperCase()).join("");

console.log("Marking a guess");
{
  t("the answer itself is all correct",
    short(R.mark("KANE", "KANE")) === "CCCC");
  t("and a guess sharing nothing is all absent",
    short(R.mark("BUSH", "KANE")) === "AAAA", short(R.mark("BUSH", "KANE")));
  t("a right letter in the wrong place is present",
    short(R.mark("NAKE", "KANE")) === "PCPC", short(R.mark("NAKE", "KANE")));
  /* §5: length must match. A partial guess is refused rather than padded. */
  t("a guess of the wrong length is refused, not marked",
    R.mark("KAN", "KANE") === null && R.mark("KANES", "KANE") === null);
  t("and an empty guess is refused", R.mark("", "KANE") === null);
  t("case and punctuation are folded before marking",
    short(R.mark("o'neill", "ONEILL")) === "CCCCCC", short(R.mark("o'neill", "ONEILL")));
}

console.log("\nRepeated letters — the classic bug");
{
  /* A single-pass "is this letter anywhere in the answer" over-reports every
     repeat. These are the cases that catch it. */
  /* SASSO v SOTOS. The S at 0 matches exactly and is CONSUMED, leaving one S
     in the pool; the first remaining S claims it and the second gets nothing.
     Worked wrong by hand first — expected CPAAP — which is exactly the mistake
     a single-pass implementation makes. */
  t("a doubled guess letter against a single spare answer letter marks one, not two",
    short(R.mark("SASSO", "SOTOS")) === "CAPAP", short(R.mark("SASSO", "SOTOS")));
  t("exact matches are taken before loose ones",
    /* ALLEN v ALONE: A and L exact, the second L has no L left to claim. */
    short(R.mark("ALLEN", "ALONE")) === "CCAPP", short(R.mark("ALLEN", "ALONE")));
  t("a letter guessed twice where the answer holds it twice marks both",
    short(R.mark("EE", "EE")) === "CC");
  t("and where the answer holds it once, only the placed one is green",
    short(R.mark("KEEN", "KEAN")) === "CCAC", short(R.mark("KEEN", "KEAN")));
  /* THE CASE THAT MATTERS MOST: the answer's only E is taken by the exact
     match at index 1, so the guess's SECOND E has nothing left to claim and
     must be grey. A naive "is this letter in the answer" paints it amber and
     tells the player an E is missing when it is not.
     The first draft used ESSEX v SEEDS, where both words hold two E and two S
     so everything is legitimately present — a case that demonstrates nothing. */
  t("a second copy of a letter the answer spent on an exact match gets nothing",
    short(R.mark("SEEN", "SEAT")) === "CCAA", short(R.mark("SEEN", "SEAT")));
}

console.log("\nSolved");
{
  t("all correct is solved", R.isSolved([C, C, C, C]) === true);
  t("one amber is not", R.isSolved([C, C, P, C]) === false);
  t("nothing is not solved", R.isSolved([]) === false && R.isSolved(null) === false);
}

console.log("\n§6 — what propagates, and what must not");
{
  /* An entry of four, crossing another at its second cell. */
  const entry = { n: 1, cells: ["0,0", "0,1", "0,2", "0,3"], answer: "KANE" };

  /* GREEN TRAVELS. */
  const green = R.propagate(entry, [C, C, A, A], {});
  t("a correct letter confirms its cell",
    green.length === 2 && green[0].cell === "0,0" && green[0].letter === "K",
    JSON.stringify(green));

  /* AMBER DOES NOT. This is the rule that is easy to get wrong and impossible
     for a player to argue with when it is wrong. */
  t("a present letter confirms nothing",
    R.propagate(entry, [P, P, P, P], {}).length === 0,
    "amber is a claim about THIS answer, not about the crossing entry");

  /* GREY DOES NOT. */
  t("an absent letter confirms nothing",
    R.propagate(entry, [A, A, A, A], {}).length === 0,
    "absence is absence from one answer");

  /* MIXED: only the greens. */
  const mixed = R.propagate(entry, [C, P, A, C], {});
  t("in a mixed guess only the correct letters travel",
    mixed.length === 2 && mixed.every((x) => ["0,0", "0,3"].includes(x.cell)),
    mixed.map((x) => x.cell).join(" "));

  /* Nothing is confirmed twice — a cell already known is not re-reported. */
  t("a cell already confirmed is not confirmed again",
    R.propagate(entry, [C, C, C, C], { "0,0": "K", "0,1": "A" }).length === 2);
  t("and a fully known entry yields nothing new",
    R.propagate(entry, [C, C, C, C],
      { "0,0": "K", "0,1": "A", "0,2": "N", "0,3": "E" }).length === 0);
}

console.log("\nWhat a crossing entry gets for free");
{
  const down = { n: 2, cells: ["0,1", "1,1", "2,1"], answer: "ANY" };
  /* The across entry was guessed and confirmed 0,1 = A. The down entry shares
     that cell and gets the letter without spending an attempt. */
  const free = R.knownFor(down, { "0,1": "A" });
  t("a crossing entry knows the letter it shares",
    free.length === 1 && free[0].index === 0 && free[0].letter === "A",
    JSON.stringify(free));
  t("and nothing else", R.knownFor(down, { "9,9": "Z" }).length === 0);
}

console.log("\n§8 — the letter bank is display only");
{
  const bank = R.letterBank([
    { guess: "KANE", marks: [C, A, A, P] },
    { guess: "NEAR", marks: [A, P, A, A] },
  ]);
  t("a letter correct anywhere shows green", bank.K === C, JSON.stringify(bank));
  t("a letter present anywhere shows amber", bank.E === P);
  /* CONSERVATIVE GREY. "A" came back absent in both guesses, so it greys; "N"
     was absent in one and absent in the other, so it greys too — but a letter
     that was ever amber never greys. */
  t("a letter absent in every guess it appeared in greys", bank.A === A);
  t("but a letter that was ever present does not grey",
    bank.E !== A, "absence is per-answer, so a global grey is a weak claim");
  t("and an unguessed letter has no state", bank.Z === undefined);
}

console.log("\n§9 — the score, out of 114");
{
  const all = (n) => Array(11).fill(n);
  t("eleven on the first attempt is a perfect 114",
    R.score(all(1)) === 114, String(R.score(all(1))));
  t("eleven on the second is 66 plus the bonus", R.score(all(2)) === 70);
  t("eleven on the third is 33 plus the bonus", R.score(all(3)) === 37);
  t("nothing solved is nothing", R.score(all(0)) === 0);
  /* THE BONUS IS FOR ALL ELEVEN, not for ten. */
  const ten = all(1); ten[10] = 0;
  t("ten on the first attempt misses the bonus",
    R.score(ten) === 100, String(R.score(ten)));
  t("and the maximum is exactly the family's 114",
    R.MAX_SCORE === 114 && 11 * R.BY_ATTEMPT[1] + R.ALL_ELEVEN === 114);
  t("an entry that spent all three and failed scores nothing",
    R.score([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]) === R.score([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]) );
}

console.log("\nThe client is given no way to mark anything");
{
  /* mark() needs the ANSWER. The public board carries none, so a browser
     holding this file still cannot mark a guess — which is the whole
     arrangement in §7: one implementation, executed server-side. */
  t("marking without an answer is impossible, not merely discouraged",
    R.mark("KANE", "") === null && R.mark("KANE", null) === null,
    "the algorithm is public; the answer is not");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
