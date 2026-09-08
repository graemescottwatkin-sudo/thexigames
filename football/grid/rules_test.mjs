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

console.log("\nThe turn budget — shared, and it can grow");
{
  /* NOT THREE ATTEMPTS PER ENTRY. The first version of this file scored an
     entry by which of three attempts it fell on; the owner had already
     iterated past that in the prototype, to one pool of turns for the board.
     These are the cases that tell the two apart. */
  /* Asserted against the budget rather than against a number typed here: the
     property is that a wrong answer costs one and a right one returns one, and
     that is true whatever the budget is. */
  t("a wrong answer spends a turn",
    R.turnsAfter(R.TURNS_START, false) === R.TURNS_START - 1);
  t("and a right one gives it back",
    R.turnsAfter(R.TURNS_START - 1, true) === R.TURNS_START,
    "eleven correct answers must not cost eleven of the budget");
  /* THE ONE NUMBER WORTH PINNING, because it is a decision rather than a
     consequence: twenty-five since 8 September 2026, raised from fifteen after
     the owner ran out with two names solved. If this line fails, somebody
     changed the game's difficulty — which is allowed, and should be noticed. */
  t("twenty-five to start", R.TURNS_START === 25);
  t("the board ends when the turns are gone",
    R.isOver({ solved: 4, turns: 0 }) === true);
  t("and when all eleven are solved, whatever is left",
    R.isOver({ solved: 11, turns: 9 }) === true);
  t("and not before either", R.isOver({ solved: 10, turns: 1 }) === false);
  /* THE SCALE IS DERIVED, NOT WRITTEN DOWN. The worst a finished board can
     carry is the starting budget plus the turns the ten right answers before
     the last one handed back. Asserted against the constants rather than
     against 25, so moving TURNS_START moves this with it. */
  t("the miss scale follows the budget",
    R.MISS_SCALE === R.TURNS_START + R.ENTRIES - 1, String(R.MISS_SCALE));
}

console.log("\nNothing is given — the title is the whole clue");
{
  /* THE OWNER'S RULING, 6 September: "it should just be the title, i.e. what
     are we trying to solve". This file briefly asserted the opposite — that
     every entry opened with its first letter — carried over from the
     prototype's "easy" default, which existed only to make three difficulties
     differ. With difficulty gone the reveal was a leftover, not a decision.

     Asserted as an ABSENCE, which is the awkward kind of check: there is no
     call to make, so what is proved is that the module offers no way to give a
     letter away and no board-shaped hook for one. Sabotaged by putting
     opening() back — the first clause goes red the moment it exists. */
  t("the module offers no opening reveal at all",
    typeof R.opening === "undefined" && typeof R.given === "undefined",
    "a rule that gives nothing needs no code, and a hook invites a filling");
  t("and no constant sets how much is given",
    !Object.keys(R).some((k) => /GIVEN|REVEAL|OPENING|MODE/i.test(k)),
    Object.keys(R).join(", "));
  /* AND THE WAY IN IS THE CROSSING, not a handout: an entry solved hands its
     letters to every entry it crosses, which is what makes eleven interlocked
     words a different problem from eleven separate ones. Proved by the
     propagation block above; named here so the absence above does not read as
     "the player is given nothing to work with". */
  t("what the player gets instead is the crossing, free and immediate",
    R.propagate({ n: 1, cells: ["0,0", "0,1"], answer: "OK" }, [C, C], {}).length === 2);
}


console.log("\nThe score, out of 114");
{
  const S = (solved, misses, hints) => R.score({ solved, misses, hints });
  /* A PERFECT BOARD IS THE FAMILY'S 114: eleven solved is 88, and efficiency
     is the remaining 26, whole only when nothing was missed. */
  t("eleven solved with no miss and no hint is 114",
    S(11, 0, 0).total === 114, JSON.stringify(S(11, 0, 0)));
  t("and that is the maximum the constants allow",
    R.MAX_SCORE === 114 &&
    R.ENTRIES * R.PTS_SOLVED + R.PTS_EFFICIENCY === R.MAX_SCORE);
  t("solving is most of the score, not efficiency",
    R.ENTRIES * R.PTS_SOLVED > R.PTS_EFFICIENCY,
    "88 against 26 — a careful player still scores well");
  t("nothing solved is nothing", S(0, 0, 0).total === 0);
  /* EFFICIENCY IS SCALED BY BOTH FACTORS, multiplied rather than added: three
     entries taken cleanly earns three elevenths of the bonus, not all of it. */
  t("a partly solved board earns only its share of the efficiency",
    S(3, 0, 0).eff === Math.round(26 * (3 / 11)), String(S(3, 0, 0).eff));
  t("and misses eat it", S(11, 12, 0).eff < S(11, 0, 0).eff,
    `${S(11, 12, 0).eff} against ${S(11, 0, 0).eff}`);
  /* THE WORST CASE IS THE MISS SCALE, not a number typed here. This said 25,
     which WAS the scale while the budget was fifteen — and when the budget went
     to twenty-five on 8 September the scale became 35, so the line was asking
     about a board with ten misses to spare and calling it "every turn spent".
     The literal defended the old rule instead of testing the current one. */
  t("a board solved with every turn spent keeps the 88 and none of the 26",
    S(11, R.MISS_SCALE, 0).base === 88 && S(11, R.MISS_SCALE, 0).eff === 0,
    JSON.stringify(S(11, R.MISS_SCALE, 0)));
  /* HINTS COME OFF THE TOTAL. Four each, and they never spend a turn — a hint
     that could end a board punishes asking rather than charging for it. */
  t("a revealed letter costs four", R.PTS_LETTER === 4);
  t("and comes off the total, not the base",
    S(11, 0, 12).base === 88 && S(11, 0, 12).total === 114 - 12,
    JSON.stringify(S(11, 0, 12)));
  t("a board played entirely on hints scores nothing, never a debt",
    S(1, 0, 999).total === 0, String(S(1, 0, 999).total));
  t("and no arrangement of them can exceed the family's maximum",
    [[11, 0, 0], [11, 0, -5], [99, 0, 0]].every((a) => S(a[0], a[1], a[2]).total <= 114));
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
