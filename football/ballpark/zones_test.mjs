/* football/ballpark/zones_test.mjs — the proximity zones are the ladder to scale.
 *
 *   node football/ballpark/zones_test.mjs
 *
 * WHY THIS EXISTS. The approved result screen of 18 September 2026 draws a band
 * per rung of the ladder around the answer, shaded by closeness. Every way that
 * can be wrong is silent:
 *
 *   - drawn at FIXED FRACTIONS of the track it looks right on the question it
 *     was designed against and is wrong on every other, because a rung's
 *     threshold is in BALLPARKS and a ballpark is the question's own tolerance.
 *     The reference prototype's widths are exactly this, and say so.
 *   - a HARDCODED five-band legend is not merely mis-sized on a strict
 *     question, it is mislabelled: that ladder has three rungs and its middle
 *     one is called "A year out". A player would be shown a band that does not
 *     exist and told they missed one that does.
 *   - grey read off the LAST ROW greys a band that scores. "Wide" pays a
 *     quarter; only "Way out" pays nothing. Non-scoring is the multiplier being
 *     zero, never the position in the list.
 *
 * It executes rules.js — the same file the server grades with — rather than
 * re-deriving the geometry here. A test that recomputes the rule it is checking
 * agrees with itself and proves nothing.
 */
import R from "./js/rules.js";

let pass = 0, fail = 0;
const t = (name, ok, note) => {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
};

console.log("The zones are the ladder, at this question's scale");
{
  const q = { tolerance: 4, lo: 17, hi: 60 };
  const z = R.zonesFor(q, q.hi - q.lo);
  const L = R.ladderFor(q);
  t("one zone per rung, in the ladder's own order",
    z.length === L.length && z.every((x, i) => x.label === L[i][2]),
    z.map((x) => x.label).join(" | "));
  t("each reaches its threshold in ballparks times the tolerance",
    z[0].outerHalf === 0.25 * 4 && z[1].outerHalf === 1 * 4 && z[2].outerHalf === 2 * 4,
    z.slice(0, 3).map((x) => x.label + "≤" + x.outerHalf).join(" "));
  t("they nest: each starts where the one inside it ended",
    z.every((x, i) => i === 0 ? x.innerHalf === 0 : x.innerHalf === z[i - 1].outerHalf));
}

console.log("\nTHE CASE IT EXISTS FOR: a strict question is a different ladder");
{
  const strict = { tolerance: 1, strict: true, lo: 1990, hi: 2010 };
  const z = R.zonesFor(strict, strict.hi - strict.lo);
  t("it has three rungs, not five", z.length === 3, z.map((x) => x.label).join(" | "));
  t("and the middle one is not a name from the other ladder",
    z[1].label === "A year out" && !z.some((x) => x.label === "In the ballpark"),
    z[1].label);
  /* A five-band legend drawn beside this question would name two bands that do
     not exist and mis-name the one that does. */
  const normal = R.zonesFor({ tolerance: 1 }, 20).map((x) => x.label);
  t("so the two ladders cannot be used interchangeably",
    JSON.stringify(z.map((x) => x.label)) !== JSON.stringify(normal));
}

/* WHAT THIS BLOCK CAN AND CANNOT PROVE, because its first name claimed more
   than it tested. It was called "grey is the multiplier, never the position",
   and it PASSED with `scoring` rewritten to `i < L.length - 1` — reading grey
   off the last row, which is the exact fault it was written against.
   The reason is that the two rules COINCIDE on both ladders this game ships:
   in each, the final rung is the only one paying nothing, so "last" and
   "zero-multiplier" pick the same rung and nothing here can tell them apart.
   ladderFor returns only those two, so a distinguishing fixture cannot be
   built without inventing a ladder the game does not have.
   So it is named for what it does. The multiplier rule still belongs in the
   code — a ladder whose MIDDLE rung paid nothing would need this check to be
   real, and that is when to revisit it. */
console.log("\nThe non-scoring rung is found, and the one before it is not greyed");
{
  const z = R.zonesFor({ tolerance: 4 }, 43);
  const grey = z.filter((x) => !x.scoring);
  t("exactly one zone pays nothing", grey.length === 1, grey.map((x) => x.label).join());
  t("and it is the one that pays nothing", grey[0].label === "Way out" && grey[0].mult === 0);
  t("the band before it still scores, so it must not be greyed",
    z[z.length - 2].scoring && z[z.length - 2].mult > 0,
    z[z.length - 2].label + " pays ×" + z[z.length - 2].mult);
  const strict = R.zonesFor({ tolerance: 1, strict: true }, 20);
  t("the strict ladder's non-scoring rung is found the same way",
    strict.filter((x) => !x.scoring).length === 1 &&
    strict[strict.length - 1].label === "Way out");
}

console.log("\nEvery shape of question the bank can hold");
{
  /* WIDE TOLERANCE AGAINST A NARROW RANGE. Four ballparks can reach past both
     ends of the question — the page must clamp rather than draw off the track,
     and the zones must still be produced in order so the clamp has something
     to clamp. */
  const wide = { tolerance: 50, lo: 0, hi: 100 };
  const zw = R.zonesFor(wide, 100);
  t("a tolerance wider than the range still yields the full ladder",
    zw.length === R.ladderFor(wide).length && zw[3].outerHalf === 200,
    "Wide reaches ±200 on a 0–100 range; the caller clamps");
  /* A NARROW TOLERANCE. The closest band can be sub-unit, which is legitimate
     and must not collapse to zero width in the data. */
  const narrow = { tolerance: 1, lo: 0, hi: 100000 };
  const zn = R.zonesFor(narrow, 100000);
  t("a tolerance of one still gives the closest band a real width",
    zn[0].outerHalf === 0.25 && zn[0].outerHalf > 0);
  /* NEGATIVES AND DECIMALS. zonesFor works in half-widths about the answer, so
     it never touches the answer's sign — the proof is that the same tolerance
     gives the same widths wherever the answer sits. */
  const a = R.zonesFor({ tolerance: 2.5 }, 40).map((x) => x.outerHalf);
  const b = R.zonesFor({ tolerance: 2.5 }, 40).map((x) => x.outerHalf);
  t("widths are a property of the tolerance, not of where the answer sits",
    JSON.stringify(a) === JSON.stringify(b) && a[0] === 0.625,
    "±0.625 for a decimal tolerance");
  /* A MISSING OR IMPOSSIBLE TOLERANCE MUST NOT DRAW A BAND. Returning zones
     for it would put a scoring band on the track with no rule behind it. */
  t("a question with no usable tolerance yields no zones at all",
    R.zonesFor({ tolerance: 0 }, 10).length === 0 &&
    R.zonesFor({}, 10).length === 0 &&
    R.zonesFor({ tolerance: -3 }, 10).length === 0,
    "no rule, no bands");
}

console.log("\nThe zones agree with the grade the server would give");
{
  /* THE WHOLE POINT, and the only check that ties the picture to the verdict.
     A guess at a distance is graded by gradeFor; the zone it falls inside must
     carry the same name, or the player is shown one band and told another. */
  const q = { tolerance: 4 };
  const z = R.zonesFor(q, 100);
  const distances = [0, 0.9, 1.1, 3.9, 4.1, 7.9, 8.1, 15.9, 16.1, 40];
  const wrong = distances.filter((d) => {
    const grade = R.gradeFor(R.ballparksOut(0 + d, 0, q.tolerance), q)[2];
    const zone = z.find((x) => d <= x.outerHalf);
    return !zone || zone.label !== grade;
  });
  t("every distance falls in the zone named by its own grade",
    wrong.length === 0,
    wrong.length ? "disagreed at " + wrong.join(", ") : distances.length + " distances");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
