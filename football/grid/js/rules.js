/* rules.js — Grid XI's marking, propagation and score.
 *
 * A small densely-interlocked grid with NO CLUES. The only information given is
 * the board's title — "Bolton Wanderers 2011/12" — and the player types a full
 * candidate into an entry. Each submitted guess comes back marked per letter,
 * and crossings carry confirmed letters between entries.
 *
 * THE ALGORITHM IS PUBLIC; THE ANSWER IS NOT. This file ships to the browser
 * and the Worker imports it, exactly as the word search's scoring.js does. That
 * is safe and deliberate: knowing HOW a guess is marked tells you nothing, and
 * one implementation marked in one place is the whole point. The browser never
 * holds an answer to mark against, so it cannot mark anything — see §7, and
 * emit_boards.mjs, which keeps every letter out of the public board.
 *
 * DO NOT ADD AN OPTIMISTIC RENDER. The spec names this as the failure to design
 * against, and it is this project's oldest bug shape: a value computed on the
 * server and again in the client, drifting apart. The client paints the
 * response and computes nothing.
 */
(function (root) {
  "use strict";

  /* ---- §5: the attempt budget ---------------------------------------- */
  /* Per ENTRY, not pooled. Burning three on one name must not cost you the
     other ten — the board is eleven puzzles that share letters, not one. */
  var ATTEMPTS = 3;
  var ENTRIES = 11;

  /* ---- §9: the score, out of 114 -------------------------------------- */
  var BY_ATTEMPT = { 1: 10, 2: 6, 3: 3 };
  var ALL_ELEVEN = 4;
  var MAX_SCORE = 114;                       // 11 x 10 + 4

  var CORRECT = "correct", PRESENT = "present", ABSENT = "absent";

  /* ---- marking a guess ------------------------------------------------- */

  /* TWO PASSES, AND THE SECOND IS WHY. A single pass that asked "is this letter
     anywhere in the answer" over-reports every repeated letter: guess SASSO
     against SOTO and the naive answer paints three S's amber when the answer
     holds one. So exact matches are taken first and REMOVED from a pool, and
     only what is left can be matched loosely. This is the classic bug in every
     implementation of this mechanic and it is worth the extra loop. */
  function mark(guess, answer) {
    var g = String(guess || "").toUpperCase().replace(/[^A-Z]/g, "");
    var a = String(answer || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!g.length || g.length !== a.length) return null;   // §5: length must match

    var out = new Array(g.length);
    var pool = {};
    var i, ch;

    /* Pass one: exact position. */
    for (i = 0; i < g.length; i++) {
      if (g[i] === a[i]) { out[i] = CORRECT; }
      else { pool[a[i]] = (pool[a[i]] || 0) + 1; }
    }
    /* Pass two: the rest, against what pass one did not consume. */
    for (i = 0; i < g.length; i++) {
      if (out[i]) continue;
      ch = g[i];
      if (pool[ch] > 0) { out[i] = PRESENT; pool[ch]--; }
      else { out[i] = ABSENT; }
    }
    return out;
  }

  function isSolved(marks) {
    return !!marks && marks.length > 0 && marks.every(function (m) { return m === CORRECT; });
  }

  /* ---- §6: propagation, stated precisely ------------------------------- */

  /* GREEN PROPAGATES. A letter confirmed correct at a cell is confirmed in the
     crossing entry at that same cell, immediately and without an attempt: it is
     a fact about the CELL, and the cell belongs to both entries.
   *
   * AMBER DOES NOT. "Present" means "this letter is somewhere in THIS answer,
   * and not here" — a claim scoped to the entry that was guessed. It says
   * nothing whatever about the crossing entry, which is a different word.
   *
   * GREY DOES NOT, for the same reason. Absence is absence from one answer.
   *
   * The aggregate letter bank (§8) is display only and is never read here.
   *
   * Returns the cells this guess newly confirms: [{ cell, letter }]. */
  function propagate(entry, marks, known) {
    var out = [];
    if (!entry || !marks) return out;
    var have = known || {};
    for (var i = 0; i < marks.length; i++) {
      if (marks[i] !== CORRECT) continue;              // ONLY green travels
      var cell = entry.cells[i];
      if (!cell || have[cell]) continue;               // already known
      out.push({ cell: cell, letter: entry.answer ? entry.answer[i] : null });
    }
    return out;
  }

  /* Which cells of an entry are already confirmed, given every cell the player
     has had confirmed anywhere. This is what makes a crossing free: the letter
     was paid for once, in the entry it was guessed in. */
  function knownFor(entry, known) {
    var have = known || {}, out = [];
    if (!entry) return out;
    for (var i = 0; i < entry.cells.length; i++) {
      if (have[entry.cells[i]]) out.push({ index: i, letter: have[entry.cells[i]] });
    }
    return out;
  }

  /* ---- §8: the letter bank, display only ------------------------------- */

  /* Green if confirmed correct anywhere. Amber if it has come back present in
     any entry and is not placed. Grey ONLY if it came back absent in EVERY
     entry it was guessed into — because absence is per-answer, a global grey is
     a weak claim and this stays conservative.
   *
   * `guesses` is [{ guess, marks }]. Nothing here feeds propagation. */
  function letterBank(guesses) {
    var seenIn = {}, absentIn = {}, bank = {};
    (guesses || []).forEach(function (g) {
      if (!g || !g.marks) return;
      var letters = String(g.guess || "").toUpperCase();
      for (var i = 0; i < g.marks.length; i++) {
        var ch = letters[i];
        if (!ch) continue;
        seenIn[ch] = (seenIn[ch] || 0) + 1;
        if (g.marks[i] === CORRECT) bank[ch] = CORRECT;
        else if (g.marks[i] === PRESENT && bank[ch] !== CORRECT) bank[ch] = PRESENT;
        else if (g.marks[i] === ABSENT) absentIn[ch] = (absentIn[ch] || 0) + 1;
      }
    });
    Object.keys(seenIn).forEach(function (ch) {
      /* Grey only when every sighting was an absence. */
      if (!bank[ch] && absentIn[ch] === seenIn[ch]) bank[ch] = ABSENT;
    });
    return bank;
  }

  /* ---- §9: the score ---------------------------------------------------- */

  /* `solvedOn` is an array of eleven: the attempt an entry was solved on, or 0
     for unsolved. An entry that spent all three and never solved scores
     nothing, and its letters still show at Full Time. */
  function score(solvedOn) {
    var list = solvedOn || [], total = 0, solved = 0, i;
    for (i = 0; i < ENTRIES; i++) {
      var n = Number(list[i]) || 0;
      if (BY_ATTEMPT[n]) { total += BY_ATTEMPT[n]; solved++; }
    }
    if (solved === ENTRIES) total += ALL_ELEVEN;
    return Math.min(MAX_SCORE, total);
  }

  var api = {
    ATTEMPTS: ATTEMPTS, ENTRIES: ENTRIES, MAX_SCORE: MAX_SCORE,
    BY_ATTEMPT: BY_ATTEMPT, ALL_ELEVEN: ALL_ELEVEN,
    CORRECT: CORRECT, PRESENT: PRESENT, ABSENT: ABSENT,
    mark: mark, isSolved: isSolved,
    propagate: propagate, knownFor: knownFor,
    letterBank: letterBank, score: score,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.XIGR_RULES = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
