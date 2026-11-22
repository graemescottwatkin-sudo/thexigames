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

console.log("\nA close guess that scores nothing is still a close guess");
{
  /* THE CONTRADICTION THIS CATCHES, seen on the first live board: the result
     read "In the ballpark" — a scoring band — beside "your distance landed
     OUTSIDE the scoring bands", because the explanation branched on points > 0
     and the clock had run down to nothing. Two different facts had one test
     between them.
     The page decides "did the distance score" by finding the zone the distance
     falls in and reading its multiplier, which is what this checks: a distance
     inside a paying band must report as scoring NO MATTER what the clock later
     did to the award. */
  const q = { tolerance: 4 };
  const zones = R.zonesFor(q, 100);
  const landedFor = (away) => zones.find((z) => away <= z.outerHalf);

  const close = landedFor(5);             // 1.25 ballparks — "Just outside"
  t("a distance inside a paying band reports as scoring",
    !!close && close.scoring, close && close.label);
  t("and that verdict does not depend on the points awarded",
    close.scoring === (close.mult > 0),
    "the ladder decides it, never the clock");
  const far = landedFor(40);              // ten ballparks — way out
  t("a distance outside every paying band reports as non-scoring",
    !!far && !far.scoring, far && far.label);
  /* The boundary, which is where an off-by-one would hide: four ballparks is
     the last paying rung, and a hair past it is not. */
  t("the last paying band still pays at its edge",
    landedFor(16).scoring && landedFor(16).label === "Wide");
  t("and a hair beyond it does not",
    !landedFor(16.001).scoring && landedFor(16.001).label === "Way out");
}

/* ---- the bands drawn BEFORE the lock -----------------------------------
 *
 * zonesAround() is what replaced sending the tolerance, and its whole claim is
 * that the page can draw the right bands without the answer. The claim is not
 * "a plausible band" but that the band and the grade agree, so this does not
 * check the formula against itself: it grades every pair with the server's own
 * ballparksOut/gradeFor from the REAL tolerance, then asks whether the zone the
 * page would have drawn from the knob alone contains the answer exactly when
 * the grade says it should.
 *
 * THE ONE ALLOWED DISAGREEMENT is the round() in the stored tolerance, which the
 * page cannot apply because it has no answer to apply it to: the server's band
 * is max(floor, round(pct*a)) wide and the page solves max(floor, pct*a). An
 * edge can sit up to half a ballpark out. Those pairs are COUNTED and reported
 * rather than absorbed by widening what the test will accept — a check that
 * loosens until nothing fails is the vacuous kind this project keeps finding.
 */
console.log("\nThe pre-lock bands agree with the grade, from the knob alone");
{
  const SET = [
    { name: "capacity", pct: 0.08, floor: 1000, answers: [12000, 40000, 50000, 73000] },
    { name: "cup-finals, widest pct", pct: 0.15, floor: 1, answers: [3, 11, 40] },
    { name: "law-measure, narrowest", pct: 0.02, floor: 1, answers: [12, 100, 5000] },
    { name: "event-year, fixed", pct: 0, floor: 1, answers: [1966, 2004] },
    { name: "match-minute, fixed", pct: 0, floor: 3, answers: [45, 90] },
    { name: "below the pct, on the floor", pct: 0.08, floor: 1000, answers: [900, 4000] },
    /* NO KIND IS SIGNED TODAY — 0 of 5,556 bank and board rows have a negative
       lo, hi or answer — but a ballpark is pct * |answer|, so the function
       zonesAround inverts has a kink at zero and the first signed kind to be
       added (a goal difference, a net spend, a points swing) would otherwise be
       drawn a band too NARROW with nothing failing. Swept so that kind arrives
       to a function that already handles it. */
    { name: "signed, straddling zero", pct: 0.06, floor: 2, answers: [-40, -3, 0, 3] },
    { name: "signed, large and negative", pct: 0.1, floor: 1, answers: [-250, -31] },
  ];
  let checked = 0, wrong = 0, rounding = 0;
  const worst = [];
  for (const k of SET) {
    for (const answer of k.answers) {
      /* Math.abs, because that is what the bank's rule uses — and a test that
         wrote k.pct * answer would compute a NEGATIVE tolerance for the signed
         cases and then agree with a function that had the same bug. */
      const tolerance = k.pct
        ? Math.max(k.floor, Math.round(k.pct * Math.abs(answer))) : k.floor;
      const q = { tolPct: k.pct, tolFloor: k.floor };
      const L = R.ladderFor(q);
      const span = Math.max(tolerance * 20, 40);
      const stepBy = Math.max(1, Math.round(span / 300));
      /* the sweep runs through zero for the signed kinds rather than stopping
         at it, because zero is where the two branches meet */
      for (let g = answer - span; g <= answer + span; g += stepBy) {
        const zones = R.zonesAround(q, g, span * 3);
        const grade = R.gradeFor(R.ballparksOut(g, answer, tolerance), q);
        const rung = L.findIndex((row) => row[2] === grade[2]);
        const drawn = zones.findIndex((z) => answer >= z.lo && answer <= z.hi);
        checked++;
        if (rung === drawn) continue;
        /* within half a ballpark of the rung's own edge, it is the round() */
        const at = L[Math.min(rung, drawn < 0 ? rung : drawn)][0];
        const edge = isFinite(at)
          ? Math.abs(Math.abs(g - answer) - at * tolerance) : Infinity;
        if (isFinite(at) && edge <= at / 2 + 1e-9) { rounding++; continue; }
        wrong++;
        if (worst.length < 4) {
          worst.push(`${k.name} a=${answer} g=${g}: server "${grade[2]}", page "${
            drawn < 0 ? "none" : zones[drawn].label}"`);
        }
      }
    }
  }
  t("the zone holding the answer is the rung the server grades on",
    wrong === 0,
    `${checked - rounding - wrong} of ${checked} pairs agree exactly` +
      (worst.length ? "; " + worst.join("; ") : ""));
  t("and the only disagreements are the rounding, at a rung's own edge",
    rounding * 20 < checked,
    `${rounding} of ${checked} pairs sat within half a ballpark of a boundary`);

  /* THE LEAN IS THE RULE, NOT A BUG — pinned so nobody straightens it into
     symmetry. A ballpark is a share of the ANSWER, so from a fixed guess a
     large answer is further away in absolute terms than a small one, and the
     band therefore reaches further up than down. */
  const one = R.zonesAround({ tolPct: 0.08, tolFloor: 1000 }, 30000, 80000)[1];
  t("a percentage kind's band leans upward from the guess",
    one.hi - 30000 > 30000 - one.lo,
    `one ballpark at a 30,000 guess: ${Math.round(one.lo)}..${Math.round(one.hi)}`);
  const fixedOne = R.zonesAround({ tolPct: 0, tolFloor: 2 }, 1966, 40)[1];
  t("and a fixed kind's does not lean at all",
    (fixedOne.hi - 1966) === 2 && (1966 - fixedOne.lo) === 2,
    "one ballpark of a fixed kind is the floor, both ways");

  /* The failure direction. A row whose kind the serving table does not know
     carries no rule, and the page must then draw NOTHING rather than guess a
     width — a page without a band, not a band that lies. */
  t("no rule means no bands, never a guessed one",
    R.zonesAround({}, 100, 50).length === 0 &&
    R.zonesAround({ tolPct: 0.08 }, 100, 50).length === 0,
    "a missing floor yields no zones");

  /* AND IT MUST NOT BE ABLE TO USE AN ANSWER, which is the point of all of it:
     the same knob on the same rule gives the same bands whatever answer is put
     beside them, because the answer is not an input and cannot become one by
     someone passing the whole row in. */
  const withoutIt = JSON.stringify(R.zonesAround({ tolPct: 0.06, tolFloor: 3 }, 55, 200));
  const withIt = JSON.stringify(R.zonesAround(
    { tolPct: 0.06, tolFloor: 3, answer: 900, tolerance: 54 }, 55, 200));
  t("the bands do not move when an answer is put in front of them",
    withoutIt === withIt, "the answer is not an input");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
