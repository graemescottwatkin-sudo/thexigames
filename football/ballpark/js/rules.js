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
 *   slider ends, its step, its unit, its tolerance and whether it is strict —
 *   and the server knows the answer. The page can draw the ladder and count the
 *   clock down without ever holding the number. Grading happens on a locked
 *   guess, server-side, and the answer comes back with the verdict.
 *
 *   `tolerance` is safe to send: it is the WIDTH of a ballpark, not where the
 *   ballpark is. Without the answer it locates nothing.
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

  var api = {
    MAX_SCORE: MAX_SCORE, QUESTIONS: QUESTIONS, PTS: PTS, SUBS: SUBS,
    CLOCK: CLOCK, GRACE: GRACE, NARROW_SECS: NARROW_SECS, BONUS_CAP: BONUS_CAP,
    GRADES: GRADES, STRICT_GRADES: STRICT_GRADES,
    ladderFor: ladderFor, ballparksOut: ballparksOut, gradeFor: gradeFor,
    pointsAt: pointsAt, pointsFor: pointsFor, score: score,
    narrowCost: narrowCost,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.XIBP = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
