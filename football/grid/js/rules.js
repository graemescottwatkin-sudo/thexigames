/* rules.js — Grid XI's marking, propagation, turns and score.
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
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE WAS REWRITTEN, 6 September 2026.
 *
 * The first version implemented the WRITTEN spec: three attempts per entry, an
 * entry scoring 10, 6 or 3 depending on which attempt it fell on, and four for
 * all eleven. It was coherent, it was tested, and it was not the game. The
 * owner had already iterated the mechanic nine times in a standalone prototype
 * — gridxi-demo-v2.html — and settled somewhere else entirely: a SHARED pool of
 * turns, a hint that costs points, and a score built from efficiency rather
 * than from which attempt happened to land.
 *
 * Both totalled 114, which is the family's maximum and the only thing they had
 * in common. A spec and a prototype disagreeing is not a tie: the prototype is
 * the one that has been played, and its comments carry the evidence — turns
 * were measured and found not to be the difficulty dial, and a first letter was
 * found to be worth far more than a random one because memory is indexed by the
 * start of a word and elimination counting cannot see that.
 *
 * MARKING AND PROPAGATION SURVIVED UNCHANGED. Both versions had them identical,
 * down to the reasoning in the comments, which is the strongest evidence either
 * had that they were right.
 *
 * DIFFICULTY MODES ARE NOT HERE. The prototype offered easy, medium and hard by
 * varying what is revealed at the start; the owner's ruling on 6 September is
 * one universal board — "One a day, the same for everyone" is the family's
 * promise on the hero of every game, and three difficulties is three different
 * boards wearing one date. So the opening reveal is a single rule, below.
 */
(function (root) {
  "use strict";

  var ENTRIES = 11;

  /* ---- the turn budget ------------------------------------------------- */

  /* SHARED, NOT PER ENTRY. Fifteen for the board, a turn spent on a wrong
     answer and a turn RETURNED for a right one — so a player who knows the
     board never runs out, and a player who is guessing is the one the count
     presses on. The prototype measured this: turns from 12 to 18 moved
     "finished with two names forgotten" from 36% to 41%, which is to say the
     count is not the difficulty dial and there is no cliff to tune. Fifteen is
     simply a number that does not feel mean. */
  var TURNS_START = 15;

  /* What a revealed letter costs. It never spends a turn: a hint must not be
     able to end a board, or a player is punished for asking rather than
     charged for it. */
  var PTS_LETTER = 4;

  /* THE WORST A FINISHED BOARD CAN CARRY, which is what efficiency is measured
     against. A board ends when the turns run out or all eleven are solved, so
     the most misses a player can accumulate is the starting budget plus the
     turns won back by the ten entries that were right before the last one
     failed. Derived rather than written down: it moves if TURNS_START does. */
  var MISS_SCALE = TURNS_START + ENTRIES - 1;

  /* ---- the score, out of 114 ------------------------------------------- */
  /* Eight a solved entry is 88, and efficiency is the remaining 26. The split
     matters: SOLVING is most of the score, so a careful player who takes the
     board apart slowly still scores well, and efficiency rewards knowing it
     rather than gates the board behind knowing it. Both factors are needed —
     eleven solved with every turn spent earns the 88 and little of the 26. */
  var PTS_SOLVED = 8;
  var PTS_EFFICIENCY = 26;
  var MAX_SCORE = ENTRIES * PTS_SOLVED + PTS_EFFICIENCY;   // 114, the family's

  /* ---- nothing is given ------------------------------------------------ */

  /* THE TITLE IS THE WHOLE CLUE, and there is no opening reveal. This file
     briefly had one — the first letter of every entry — carried over from the
     prototype, which defaulted to its "easy" setting. That setting existed to
     make three difficulties differ from one another; with difficulty gone on
     the owner's ruling of 6 September, the reveal was a leftover rather than a
     decision, and it started every board with eleven letters already on it.
   *
   * The owner, asked directly: "it should just be the title, i.e. what are we
   * trying to solve". Which is section 3 of the spec as written, before the
   * prototype explored around it: "Bolton Wanderers 2011/12", and nothing else.
   *
   * SO THERE IS NO FUNCTION HERE. A rule that gives nothing needs no code, and
   * an opening() returning an empty list would be a hook inviting somebody to
   * fill it. If a reveal is ever wanted it is a server decision per board,
   * deliberately not derivable from anything the browser holds, so it would
   * arrive as data on the board and not as a function restored here.
   *
   * THE PLAYER IS NOT LEFT WITH NOTHING. Crossings are the way in: an entry
   * solved hands its letters to every entry it crosses, free and immediately,
   * which is what propagate() below is for and why the emitter refuses a board
   * that is a bare tree. Eleven words that share letters is a different problem
   * from eleven words that do not. */

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
    if (!g.length || g.length !== a.length) return null;   // length must match

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

  /* ---- what a submission costs ----------------------------------------- */

  /* A TURN BACK FOR A RIGHT ANSWER. Not merely "no cost": the budget has to be
     able to GROW, or eleven correct answers still spend eleven of fifteen and
     the last few entries are played under a pressure the player earned their
     way out of. */
  function turnsAfter(turns, correct) {
    return Number(turns || 0) + (correct ? 1 : -1);
  }

  /* The board is over when every entry is solved or the turns are gone. Both
     conditions, in one place, because a game that can end two ways ends
     inconsistently when the two are written apart. */
  function isOver(state) {
    var s = state || {};
    return (Number(s.solved || 0) >= ENTRIES) || (Number(s.turns || 0) <= 0);
  }

  /* ---- §6: propagation, stated precisely ------------------------------- */

  /* GREEN PROPAGATES. A letter confirmed correct at a cell is confirmed in the
     crossing entry at that same cell, immediately and without a turn: it is a
     fact about the CELL, and the cell belongs to both entries.
   *
   * AMBER DOES NOT. "Present" means "this letter is somewhere in THIS answer,
   * and not here" — a claim scoped to the entry that was guessed. It says
   * nothing whatever about the crossing entry, which is a different word.
   *
   * GREY DOES NOT, for the same reason. Absence is absence from one answer.
   *
   * The aggregate letter bank is display only and is never read here.
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

  /* ---- the letter bank, display only ----------------------------------- */

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

  /* ---- the score ------------------------------------------------------- */

  /* `state` is { solved, misses, hints } — entries solved, wrong submissions,
     and points already charged for revealed letters.
   *
   * EFFICIENCY IS SCALED BY BOTH. `solved/11` and `spare/MISS_SCALE` multiply
   * rather than add, so a player who solves three entries cleanly does not
   * collect the efficiency of a player who solved eleven: the bonus is for
   * taking the WHOLE board economically, and three-elevenths of a board taken
   * economically is three-elevenths of the bonus.
   *
   * Hints come off the total, never off the base, and the total floors at zero
   * — a board played entirely on hints scores nothing rather than a debt. */
  function score(state) {
    var s = state || {};
    var solved = Math.max(0, Math.min(ENTRIES, Number(s.solved) || 0));
    var misses = Math.max(0, Number(s.misses) || 0);
    var hints = Math.max(0, Number(s.hints) || 0);
    var base = solved * PTS_SOLVED;
    var spare = Math.max(0, MISS_SCALE - misses);
    var eff = Math.round(PTS_EFFICIENCY * (solved / ENTRIES) * (spare / MISS_SCALE));
    return {
      solved: solved, base: base, eff: eff, hints: hints,
      total: Math.max(0, Math.min(MAX_SCORE, base + eff - hints)),
    };
  }

  var api = {
    ENTRIES: ENTRIES, TURNS_START: TURNS_START, PTS_LETTER: PTS_LETTER,
    MISS_SCALE: MISS_SCALE, PTS_SOLVED: PTS_SOLVED,
    PTS_EFFICIENCY: PTS_EFFICIENCY, MAX_SCORE: MAX_SCORE,
    CORRECT: CORRECT, PRESENT: PRESENT, ABSENT: ABSENT,
    mark: mark, isSolved: isSolved,
    turnsAfter: turnsAfter, isOver: isOver,
    propagate: propagate, knownFor: knownFor,
    letterBank: letterBank, score: score,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.XIGR_RULES = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
