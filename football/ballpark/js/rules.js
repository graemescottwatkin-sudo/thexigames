/* rules.js — Ballpark XI's rules, in one file, read by the browser AND by the
 * server.
 *
 * WHY ONE FILE. Grid XI's rules.js is imported by functions/_lib/gd-board.js so
 * a turn cannot be counted one way in the page and another in the endpoint;
 * this is the same arrangement for the same reason. Ballpark has TWO grading
 * ladders, a clock that converts seconds into points, a substitution rule and a
 * bonus — four things that would drift apart if they existed twice.
 *
 * THE ANSWER IS NOT IN HERE AND MUST NOT REACH THE BROWSER.
 *
 *   The demo grades in the page, which means every answer is in the page. That
 *   is right for a local file and wrong for a served game: this family has
 *   already shipped one board whole — the word search, which had two live leaks
 *   closed before its score could mean anything — and Grid XI was built the
 *   other way round because of it.
 *
 *   So the split is: the page knows the SHAPE of a question — its text, its
 *   slider ends, its step, its unit, the RULE for how wide a ballpark is, and
 *   whether it is strict — and the server knows the answer. The page can draw
 *   the ladder and count the clock down without ever holding the number.
 *   Grading happens on a locked guess, server-side, and the answer comes back
 *   with the verdict.
 *
 * `tolerance` IS NOT SAFE TO SEND, and the line that used to sit here said it
 * was. It read: "it is the WIDTH of a ballpark, not where the ballpark is.
 * Without the answer it locates nothing." That is true of a FIXED band and
 * false of a DERIVED one, and 29 of the bank's 48 kinds derive it:
 *
 *     tolerance = max(floor, round(pct * |answer|))
 *
 * so the answer is tolerance / pct. The payload shipped it. On 21 November 2026
 * 135 of 2,321 board rows were readable to under 2% of their own slider, and
 * four capacity questions — pct 8%, floor 1000 — to within six people:
 *
 *     tolerance 4000 -> answer 49,994..50,006   (it was 50,000)
 *     tolerance 5840 -> answer 72,994..73,006   (it was 73,000)
 *
 * A player reading one number out of the network tab had the question. The
 * sentence was not careless about the mechanism; it was written for the 19 fixed
 * kinds and then applied to all 48, which is how a true clause comes to license
 * a false one. live_check.mjs holds the matching half of the story: its first
 * version refused `tolerance` as "the answer's neighbour", was overruled for
 * imagining a rule this game did not have, and was right.
 *
 * WHAT THE PAGE GETS INSTEAD is `tolPct` and `tolFloor` — the kind's rule, not
 * the question's width. Both are constants of the kind and neither is a fact
 * about any answer, so the whole 48-row table could be printed in the page
 * source without giving anything away. zonesAround() below turns them into
 * bands, from the player's own knob. See functions/_lib/bp-tol.js.
 *
 * OWNER'S CONSTANTS, 6 September 2026, and the strict ladder of the 8th.
 */
(function (root) {
  "use strict";

  /* Out of 114, the same frame as HiLo XI and every other game in the family:
     eleven questions at ten points is 110, and the four that carry it to 114
     are bonuses for being exactly right. */
  var MAX_SCORE = 114;
  var QUESTIONS = 11;
  var PTS = 10;              // a question's full value, before the clock eats it
  var SUBS = 3;              // the lives: a wide miss spends one, so does narrowing
  var CLOCK = 20;            // seconds a question is given
  var GRACE = 10;            // of which the first ten cost nothing
  var NARROW_SECS = 4;       // what narrowing costs once the subs are gone
  var BONUS_CAP = 4;         // at most four bang-on bonuses, 110 -> 114
  /* WHEN A QUESTION'S CLOCK STARTS. The owner, 27 Sep 2026, choosing between
     a clock that starts when the question appears and one that starts on the
     first touch: "b but with a 2 second cap". So it starts on the player's
     first touch of the question, or START_CAP seconds after it appears,
     whichever comes first. The first touch alone would let a player read and
     think for as long as they liked before touching anything; the cap is what
     stops the clock timing only the slider. The server opens a question with
     its clock START_CAP seconds ahead and a touch can only bring it EARLIER,
     so withholding the touch is worth two seconds at most, which is the rule. */
  var START_CAP = 2;

  /* THE LADDER, in ballparks — multiples of the question's own tolerance — so
     one ruler grades a crowd size and a transfer fee without either needing its
     own rule. Each row: ballparks out, share of the points, what it is called,
     whether it reads as a good answer, and whether it spends a substitution. */
  var GRADES = [
    [0.25,     1.00, "Bang on",         true,  false],
    [1.00,     0.75, "In the ballpark", true,  false],
    [2.00,     0.50, "Just outside",    false, false],
    [4.00,     0.25, "Wide",            false, true],
    [Infinity, 0.00, "Way out",         false, true]
  ];

  /* THE STRICT LADDER. Owner, 8 September 2026, on ages: "make it so they have
     to be right or off a year to score, penalise incorrect more." Some kinds
     bunch so tightly that being roughly right is no achievement — the youngest
     records sit at 15 to 17 and the oldest at 36 to 41, so a single guess of
     sixteen collects most of the young end. The answer is a harsher ladder
     rather than a wider band.

     There is no "just outside" and no "wide": two ballparks is already way out,
     where the normal ladder waits until four, so a strict question spends a
     substitution twice as readily. */
  var STRICT_GRADES = [
    [0.25,     1.00, "Bang on",    true,  false],
    [1.00,     0.60, "A year out", true,  false],
    [Infinity, 0.00, "Way out",    false, true]
  ];

  /* WHICH LADDER, from the question rather than from the caller. The page draws
     it BEFORE the player locks, so the harsher terms are never a surprise —
     which is the half of this the demo got wrong first time round, where the
     ladder was hardcoded markup that never changed. */
  function ladderFor(q) {
    return q && q.strict ? STRICT_GRADES : GRADES;
  }

  /* How far out a guess is, in ballparks. The only place the answer is touched,
     and it runs on the server. */
  function ballparksOut(guess, answer, tolerance) {
    var t = Number(tolerance);
    if (!isFinite(t) || t <= 0) return Infinity;
    return Math.abs(Number(guess) - Number(answer)) / t;
  }

  function gradeFor(ballparks, q) {
    var L = ladderFor(q);
    for (var i = 0; i < L.length; i++) if (ballparks <= L[i][0]) return L[i];
    return L[L.length - 1];
  }

  /* WHAT THE CLOCK LEAVES. Ten seconds free, then a point a second off the ten.
     `clockLength` is scaled with its grace so a shortened clock takes its free
     window with it rather than losing it whole.

     NARROWING DOES NOT SHORTEN THE CLOCK. When the substitutions are gone it
     costs four seconds by being ADDED TO ELAPSED — `qPenalty` in the reference
     demo — and the clock stays twenty. The two are not the same arithmetic: at
     len 16 the grace falls to 8, so a shortened clock would charge for the four
     seconds twice. This comment said the opposite until it was checked against
     the demo on 9 September 2026; callers pass CLOCK and put the penalty in
     `elapsedSeconds`. */
  function pointsAt(elapsedSeconds, clockLength) {
    var len = Number(clockLength) || CLOCK;
    var grace = GRACE * (len / CLOCK);
    var e = Math.max(0, Number(elapsedSeconds) || 0);
    if (e <= grace) return PTS;
    return Math.max(0, PTS - (e - grace) * (PTS / (len - grace)));
  }

  /* One question's points: the clock's offer, then the ladder's share of it. */
  function pointsFor(ballparks, q, elapsedSeconds, clockLength) {
    var offer = pointsAt(elapsedSeconds, clockLength);
    return Math.round(offer * gradeFor(ballparks, q)[1]);
  }

  /* THE BOARD'S SCORE. Eleven questions of ten is 110; the last four points are
     bonuses for exactness, capped, which is what makes 114 reachable without
     making it ordinary. */
  function score(state) {
    var s = state || {};
    var base = Math.max(0, Number(s.points) || 0);
    var bangOns = Math.max(0, Number(s.bangOns) || 0);
    return Math.min(MAX_SCORE, base + Math.min(BONUS_CAP, bangOns));
  }

  /* WHAT NARROWING COSTS, in one place because it is two rules wearing one
     name: a substitution while there are any, and four seconds of THIS
     question's clock once there are not. */
  function narrowCost(subsUsed) {
    return Number(subsUsed) < SUBS
      ? { sub: 1, seconds: 0 }
      : { sub: 0, seconds: NARROW_SECS };
  }

  /* THE PROXIMITY ZONES, which are the ladder drawn to scale.
   *
   * IT LIVES HERE AND NOT IN THE PAGE because it is the ladder's own geometry:
   * a rung's threshold is in BALLPARKS, a ballpark is the question's tolerance,
   * so the band around the answer is threshold x tolerance and its width on a
   * track is different for every question. Put it in game.js and there would be
   * two descriptions of one rule, which is how the ladder came to be hardcoded
   * markup the first time.
   *
   * WHAT IT RETURNS is one entry per rung, ordered closest first, each with the
   * half-width it reaches and whether it SCORES — which is the multiplier being
   * above zero, not the position in the list. On the ordinary ladder "Wide"
   * pays a quarter and only "Way out" pays nothing, so greying the last row by
   * its index would grey a band that scores.
   *
   * The outermost rung is Infinity and has no width of its own; it is given the
   * span it needs to reach the ends of the question's range, so a caller can
   * clamp it rather than handle a special case.
   */
  function zonesFor(q, span) {
    var L = ladderFor(q);
    var tol = Number(q && q.tolerance);
    if (!isFinite(tol) || tol <= 0) return [];
    var reach = Math.max(Number(span) || 0, tol);
    var out = [], prev = 0;
    for (var i = 0; i < L.length; i++) {
      var at = L[i][0];
      out.push({
        label: L[i][2],
        mult: L[i][1],
        scoring: L[i][1] > 0,
        innerHalf: prev * tol,
        outerHalf: at === Infinity ? reach : at * tol,
        depth: i,
      });
      prev = at === Infinity ? prev : at;
    }
    return out;
  }

  /* THE SAME LADDER, DRAWN BEFORE THE ANSWER IS KNOWN — from the knob instead
   * of from the answer. This is what replaces sending `tolerance`; the header
   * says why it had to.
   *
   * THE QUESTION IT ANSWERS is not "how wide is the band" but "which answers
   * would grade at this rung, if my guess is g" — and that has an exact answer
   * from the RULE alone, with no knowledge of the true value:
   *
   *     g grades at rung k   <->   |g - a| <= k * max(floor, pct * a)
   *
   * Both sides of the <= move with a, so solve it rather than assume a width.
   * Write the condition as two one-sided ones. The lower edge L solves
   * a + k*max(floor, pct*a) = g; the left side is max(a + k*floor, a*(1+k*pct)),
   * a maximum of two increasing functions, so its root is the SMALLER of the two
   * individual roots. The upper edge U solves a - k*max(floor, pct*a) = g, whose
   * left side is a MINIMUM of two increasing functions, so its root is the
   * LARGER. Hence, exactly:
   *
   *     L = min(g - k*floor,  g / (1 + k*pct))
   *     U = max(g + k*floor,  g / (1 - k*pct))
   *
   * and because max(floor, pct*a) is non-decreasing in a, each rung is a single
   * interval rather than two pieces — which is why this can be drawn as one band
   * at all.
   *
   * A FIXED KIND ARRIVES AS pct 0 and falls out of this as g +/- k*floor: the
   * symmetric band it has always had, not a special case in the code.
   *
   * IT LEANS UPWARD for a percentage kind, and that is the rule showing through
   * rather than a bug. A ballpark is a share of the ANSWER, so a guess that is
   * too low is nearer in absolute terms to a small answer than to a large one.
   * At a 30,000 guess on an 8% kind one ballpark reaches 27,778..32,609 — down
   * 2,222 and up 2,609. On a track 63,000 wide that lopsidedness is about half a
   * percent of its length, so the band still reads as the band.
   *
   * BOTH OF THE ABOVE WERE PUT TO THE OWNER AND RULED ON, 22 November 2026:
   * "Acceptable" — the upward lean and the drawing error below both ship as
   * built, and explicitly "don't round it". So neither is an open question or a
   * tidying job for later: a future reader who straightens the lean into
   * symmetry, or rounds the edges to match the graded band exactly, is undoing a
   * decision rather than fixing an oversight. Change either only on a new
   * ruling, not on reading this function and finding it odd.
   *
   * WHERE IT IS NOT EXACT, stated because the file next door promises the player
   * sees the band they are judged against. The stored tolerance is
   * max(floor, ROUND(pct*a)) and this drops the round(), so an edge here can sit
   * up to k/2 units from the graded edge. Measured on the live board set: it
   * moves a grade on 493 of 1,415 percentage rows, over 2.38% of slider
   * positions, always within a step or two of a rung's own boundary. Rounding
   * here instead would make the band JUMP by a whole unit as the knob crossed a
   * rounding point, which is worse in a band that redraws on every drag: a
   * smooth edge half a unit out beats a correct edge that twitches.
   *
   * kp >= 1 would send U to infinity or negative. No kind reaches it today — the
   * widest is cup-finals at 15%, so four ballparks make 0.60 — but a kind added
   * later could, so it is clamped to the reach rather than left to produce a
   * band running the wrong way.
   */
  function zonesAround(q, guess, span) {
    var L = ladderFor(q);
    var g = Number(guess);
    var pct = Number(q && q.tolPct);
    var floor = Number(q && q.tolFloor);
    if (!isFinite(g)) return [];
    if (!isFinite(floor) || floor <= 0) return [];
    if (!isFinite(pct) || pct < 0) pct = 0;
    var reach = Math.max(Number(span) || 0, floor);
    var out = [], prevLo = g, prevHi = g;
    for (var i = 0; i < L.length; i++) {
      var at = L[i][0];
      var lo, hi;
      if (at === Infinity) {
        lo = g - reach; hi = g + reach;
      } else {
        var kp = at * pct;
        /* THE RATIO EDGES, AND THE SIGN OF THE GUESS DECIDES WHICH IS WHICH.
           A ballpark is pct * |answer|, so the function being inverted is
           f(a) = a + k*pct*|a| — increasing, but with a different slope either
           side of zero. Inverting it piecewise: for g >= 0 the lower edge is
           g/(1+kp) and the upper g/(1-kp); below zero the two denominators
           swap. Written out rather than assumed, because the first version
           assumed a positive guess and the min/max then collapsed onto the
           floor term for a negative one — drawing a band too NARROW, telling
           the player they must be more precise than they must. Grading was
           never affected, so there would have been no symptom.
           No kind can reach it today: 0 of 5,556 bank and board rows have a
           negative lo, hi or answer, and the smallest percentage-kind lo is 0.
           It is handled anyway because the first kind that counts something
           signed — a goal difference, a net spend, a points swing — arrives
           without anyone rereading this function. The XI session asked the
           question that found it. */
        var ratioLo = g >= 0 ? g / (1 + kp) : g / (1 - kp);
        var ratioHi = g >= 0 ? g / (1 - kp) : g / (1 + kp);
        lo = Math.min(g - at * floor, ratioLo);
        hi = kp < 1 ? Math.max(g + at * floor, ratioHi) : g + reach;
        if (!isFinite(lo)) lo = g - reach;
        if (!isFinite(hi)) hi = g + reach;
        lo = Math.max(lo, g - reach);
        hi = Math.min(hi, g + reach);
      }
      out.push({
        label: L[i][2],
        mult: L[i][1],
        scoring: L[i][1] > 0,
        innerLo: prevLo, innerHi: prevHi,
        lo: lo, hi: hi,
        depth: i,
      });
      if (at !== Infinity) { prevLo = lo; prevHi = hi; }
    }
    return out;
  }

  var api = {
    MAX_SCORE: MAX_SCORE, QUESTIONS: QUESTIONS, PTS: PTS, SUBS: SUBS,
    CLOCK: CLOCK, GRACE: GRACE, NARROW_SECS: NARROW_SECS, BONUS_CAP: BONUS_CAP,
    START_CAP: START_CAP,
    GRADES: GRADES, STRICT_GRADES: STRICT_GRADES,
    ladderFor: ladderFor, ballparksOut: ballparksOut, gradeFor: gradeFor,
    pointsAt: pointsAt, pointsFor: pointsFor, score: score,
    narrowCost: narrowCost, zonesFor: zonesFor, zonesAround: zonesAround,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.XIBP = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
