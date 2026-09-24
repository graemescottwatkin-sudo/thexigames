(function () {
  "use strict";
  /* THE BUILD, PAIRED WITH THE ?v= ON THIS FILE'S OWN SCRIPT TAG. A stale
     cached script is otherwise invisible: the page loads, the game runs, and
     it is yesterday's code. aligned_test asserts the two agree. */
  var BUILD = "v001o";
  if (window.XIPlays && document.documentElement) {
    document.documentElement.setAttribute("data-build", BUILD);
  }
})();


/* ===================================================================
   THE GAME. Everything below this line is the thing being transplanted:
   the loader, the renderer, the cipher rules, the clock, the scoring and
   the endpoint calls. None of it draws chrome, reads a theme or touches
   storage, so it can be lifted into a family-shaped page whole.

   The seam, for whoever is lifting it:

     boot(BOARD)      builds the grid, the key and the hints from a SEALED
                      board -- cells, given, slots, absent -- and nothing
                      else. It never sees a solution live.
     serverOracle()   the five endpoint calls: play, mark, mark?check,
                      reveal, finish. The only place the page talks to a
                      server about a round.
     localOracle()    the same three questions answered from a stamped
                      solution, offline only. Live it does not exist.
     loadDaily()      live: asks /api/codeword/daily, unwraps .board.
     loadToday()      local preview of the staged package; no endpoint.
     dayNumber/wantedBoard  static-path date arithmetic. LIVE DOES NOT USE
                      THESE -- the server decides the day.

   It keeps ONE thing in localStorage — xicw.results, the boards this device has
   finished — and that line used to say it kept nothing at all. The claim was
   true when it was written and stopped being true the day the results were
   banked; a comment stating a fact about the file it sits in rots exactly like
   a stale figure in a README. It is read for two purposes and no others:
   pushing results to an account, and telling the server whether a kick-off is
   this device's replay.

   What it does NOT do, on purpose: no sessionStorage, no
   theme resolver of its own beyond the tokens in the <style> above, and no
   knowledge of the family's board numbering. An address's ?no= is passed
   through untouched.
   =================================================================== */

/* Set true only in the built drop. A review page has one board stamped into it
   and must not go looking for a queue that is not there. */
var DAILY = true;

function boot(BOARD){
  var ROWS = [];
  var WORDS = [];
  var N = 13;
  var CODE = {};
  var GIVEN = [];
  /* BOARD_DAY beside the numbers, because the numbers are two schemes and the
     day is one. BOARD_NO_N is the FAMILY number and the /finish response
     carries this game's OWN ordinal; anything comparing a stored result to the
     board in hand must use the day or it is comparing apples to a different
     orchard. See hasPlayedBoard. */
  var BOARD_NO = "demo", BOARD_NO_N = null, BOARD_DAY = null;
  var HINTS = [];
  var BREAKS = [];
  var DOT = "·", SQ_ON = "🟩", SQ_OFF = "🟥";

  // A board from the daily queue replaces every one of the above. The stamped
  // values are what a review page uses and what the loader falls back to.
  if (BOARD){
    ROWS = BOARD.rows; WORDS = BOARD.words; CODE = BOARD.code;
    GIVEN = BOARD.given; N = BOARD.size;
    HINTS = BOARD.hints || []; BREAKS = BOARD.breaks || [];
    BOARD_NO = ("00" + BOARD.no).slice(-3);
    BOARD_NO_N = BOARD.no;
    BOARD_DAY = BOARD.day || null;
    var tagEl = document.getElementById("tag");
    if (tagEl) tagEl.innerHTML = "Codeword XI " + DOT + " board " + BOARD_NO;
  }

  var ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  /* THE SEALED BOARD. Everything the page needs to draw itself, and nothing
     that gives the puzzle away.

     A board file holds `rows` (the filled grid), `words` (every answer) and
     `code` (the whole cipher), and ANY ONE of the three ends the puzzle -- code
     plus the numbers already on screen inverts to rows in a single pass. So the
     live page is never sent them. It is sent numbers, the three givens, and the
     shape and clue of each slot, which is enough to render and not enough to
     solve. Decision of 14 Sep 2026: the server checks.

     `SOLUTION` is the deliberate exception and it is only ever present offline:
     the demo and the review pages stamp a whole board in so the file plays with
     no server behind it. Live it is null, and check and reveal become calls
     rather than lookups. The rendering path below reads the sealed values in
     both cases, so the live path has no local answer to fall back to even by
     accident. */
  var CELLS, GIVEN_N, SLOTS, ABSENT, SOLUTION, LETTER = {}, usedNum = {};

  if (BOARD && BOARD.cells){
    CELLS = BOARD.cells;
    GIVEN_N = BOARD.given;
    SLOTS = BOARD.slots;
    ABSENT = BOARD.absent || [];
    N = BOARD.size;
    SOLUTION = null;
  } else {
    CELLS = ROWS.map(function(row){
      return row.split("").map(function(ch){ return ch === "." ? null : CODE[ch]; });
    });
    GIVEN_N = GIVEN.map(function(l){ return { n: CODE[l], letter: l }; });
    SLOTS = WORDS.map(function(w, i){
      var h = HINTS[i] || {};
      return { row: w[1], col: w[2], dir: w[3], len: w[0].length,
               sense: h.sense || "", cat: h.cat || "answer",
               enum: h.enum || String(w[0].length), text: h.text || "",
               breaks: BREAKS[i] || [] };
    });
    var seen = {};
    ROWS.forEach(function(row){
      row.split("").forEach(function(ch){ if (ch !== ".") seen[ch] = true; });
    });
    ABSENT = ALPHA.split("").filter(function(l){ return !seen[l]; });
    SOLUTION = { rows: ROWS, code: CODE };
    Object.keys(CODE).forEach(function(l){ LETTER[CODE[l]] = l; });
  }

  // Which NUMBERS the grid actually uses. Derived from the numbers themselves,
  // so it needs no cipher: a number nobody can type is one the board never
  // prints.
  CELLS.forEach(function(row){
    row.forEach(function(n){ if (n !== null && n !== undefined) usedNum[n] = true; });
  });
  // Which LETTERS the board leaves out. Sealed boards are told; stamped boards
  // worked it out from the solution above. Either way it is public -- the page
  // prints it, and a solver hunting for a letter the board does not contain is
  // wasting the only thing this game charges for.
  var absentList = ABSENT;
  var nPresent = 26 - absentList.length;
  var present = {};
  ALPHA.split("").forEach(function(l){ present[l] = absentList.indexOf(l) === -1; });

  /* THE ONLY THREE THINGS THAT NEED THE ANSWER, behind one seam.

     Rendering above never touches a solution. These three do, by definition:
     confirming a finished answer, finding a wrong letter, and giving a letter
     away. Offline they read the stamped solution; live they are calls, and the
     page has nothing to fall back on because SOLUTION is null.

     Note what the confirm step may and may not say. It marks a slot done only
     when the slot is COMPLETELY filled and right -- which is exactly what the
     client used to do for itself, so it is no weaker than the game already was.
     It never says which letter is wrong. That is Check Grid's job, and Check
     Grid costs five minutes; a confirm that volunteered the wrong letter would
     make the helper you pay for worthless.  */
  var oracle;

  /* The round, when the server is holding one. `scored` false is a replay: it
     plays and finishes exactly like a first sitting and is not recorded, which
     is the owner's shape -- showing somebody the grid must not be
     indistinguishable from cheating. */
  var round = null;

  function localOracle(){
    return {
      confirm: function(then){
        var done = [];
        SLOTS.forEach(function(w, i){
          var ok = wordCells(w).every(function(rc){
            var ch = SOLUTION.rows[rc[0]][rc[1]];
            return guess[SOLUTION.code[ch]] === ch;
          });
          if (ok) done.push(i);
        });
        then(done);
        return true;                    // offline there is nothing to wait for
      },
      /* THE COST IS THE ORACLE'S, AND IT IS CHARGED HERE BECAUSE OFFLINE THERE
         IS NOBODY ELSE TO CHARGE IT. It used to be added by the click handlers
         below, which are shared by both oracles — so the server charged it, the
         handler charged it again, and one reveal spent two substitutions.
         Moving it out of the handler is only correct if this half picks it up:
         delete it from the handler alone and offline play gets free helpers, a
         clock that never advances for them, and a substitution counter stuck on
         zero. One fact, one place, and the place is whoever is answering. */
      wrongNumbers: function(then){
        var bad = [];
        Object.keys(guess).forEach(function(n){
          if (guess[n] !== LETTER[n]) bad.push(Number(n));
        });
        extraMinutes += COST.check;
        checksUsed++;
        then(bad);
      },
      reveal: function(n, then){
        subsUsed++; extraMinutes += COST.reveal;
        then(LETTER[n], false);
      },
      finish: function(then){ then(null); }
    };
  }

  /* The live half. Shapes are the site session's to fix and it is sending them;
     these are written to the agreed division of labour and will be corrected to
     its wire format rather than guessed at further. Each one fails CLOSED: if
     the call does not answer, nothing is marked, nothing is revealed and no
     minutes are charged, because charging for a helper that did not help is
     worse than the helper being unavailable. */
  function serverOracle(){
    function post(what, body, then, fail){
      fetch(API + what, {
        method: "POST", headers: {"Content-Type": "application/json", "X-XI-Games": "1"},
        body: JSON.stringify(body)
      }).then(function(r){ return r.ok ? r.json() : Promise.reject(r.status); })
        .then(then)
        /* A caller with a failure path says its own thing: the two that retry
           say it once, not every few seconds while they wait. */
        .catch(function(){ if (fail) fail(); else toast("Could not reach the referee"); });
    }
    return {
      /* SAYS WHETHER IT ASKED, and that return value is load-bearing.
         `if (!round) return;` dropped the callback on the floor — and
         refreshSolved() had already set `asking = true` before calling, so the
         flag latched TRUE FOR THE REST OF THE ROUND and no word was ever
         confirmed again. A player quick enough to finish an answer before
         /play comes back, on a connection slow enough for that to happen, lost
         the whole board silently. Found by writing the suite for the other two
         faults: the test completed a word before the round existed and no mark
         request ever went out. */
      /* AND SAYS WHEN IT FAILED. Without `fail` a dropped request never
         called back, so refreshSolved's `asking` stayed true for the rest of
         the round: one lost connection and no word was ever confirmed again,
         however long the player kept typing. */
      confirm: function(then, fail){
        if (!round) return false;
        post("mark", { playId: round.playId, guess: guess }, function(d){
          then(d.solved || []);
        }, fail);
        return true;
      },
      wrongNumbers: function(then){
        if (!round) return;
        post("mark", { playId: round.playId, guess: guess, check: true }, function(d){
          // The server's minute count is the one that decides, so the page
          // takes spentMinutes rather than adding COST.check itself.
          if (typeof d.spentMinutes === "number") extraMinutes = d.spentMinutes;
          checksUsed++;
          then(d.wrong || []);
        });
      },
      reveal: function(n, then){
        if (!round) return;
        post("reveal", { playId: round.playId, n: n }, function(d){
          if (d && d.error) { toast(d.error); return; }
          if (!d || !d.letter) return;
          // subsLeft and spentMinutes are the server's; `charged` false means a
          // number already revealed, which costs nothing and says the same thing.
          if (typeof d.subsLeft === "number") subsUsed = SUBS - d.subsLeft;
          if (typeof d.spentMinutes === "number") extraMinutes = d.spentMinutes;
          then(d.letter, d.charged === false);
        });
      },
      finish: function(then, fail){
        if (!round) return then(null);
        post("finish", { playId: round.playId }, function(d){ then(d); }, fail);
      }
    };
  }

  // What the two helpers cost in match minutes. At +10 and +14 they were
  // priced off the top of the curve, where ten minutes is 17 of the 114 points
  // -- a check cost a seventh of the board and a reveal a fifth on top of a
  // substitution, so neither was ever worth taking.
  var MAX = 114, SUBS = 3, COST = { check: 5, reveal: 7 };
  var CURVE = [[0,114],[10,97],[20,86],[30,78],[45,68],[60,58],[75,47],[90,36]];
  function scoreAt(m){
    if (m <= 0) return MAX; if (m >= 90) return 36;
    for (var i=1;i<CURVE.length;i++){ if (m <= CURVE[i][0]){ var a=CURVE[i-1], b=CURVE[i]; var t=(m-a[0])/(b[0]-a[0]); return a[1]+(b[1]-a[1])*t; } }
    return 36;
  }

  var guess = {}, pencil = {}, locked = {}, wrongMark = {}, solvedWords = {};
  var selected = null, selCell = null, selWord = null, pencilMode = false;
  var subsUsed = 0, extraMinutes = 0, startedAt = null, over = false, timer = null, secondsPerMinute = 3;
  /* HOW MANY TIMES THE REFEREE WAS ASKED. The cost of a check was tracked as
     minutes and never as a count, so the one number that says whether a player
     leaned on it could not be reported. The minutes remain the server's; this
     is only a tally, and nothing scores on it. */
  var checksUsed = 0;

  GIVEN_N.forEach(function(g){ guess[g.n] = g.letter; locked[g.n] = "given"; });

  var gridEl = document.getElementById("grid"), keyEl = document.getElementById("key"),
      keysEl = document.getElementById("keys"), alphaEl = document.getElementById("alpha");
  gridEl.style.gridTemplateColumns = "repeat(" + N + ",minmax(0,1fr))";
  var cellEls = [];
  for (var r=0;r<N;r++){ cellEls[r]=[]; for (var c=0;c<N;c++){
    var n0 = CELLS[r][c];
    // A block is a square with no number, which is what `null` means in cells.
    var blocked = (n0 === null || n0 === undefined);
    var el = document.createElement(blocked ? "div" : "button");
    el.className = "cell" + (blocked ? " block" : "");
    if (!blocked){
      el.type = "button";
      el.dataset.n = n0;
      el.setAttribute("aria-label", "Square, number " + n0);
      el.innerHTML = '<span class="n">' + n0 + '</span><span class="l"></span>';
      el.dataset.r = r; el.dataset.c = c;
      el.addEventListener("click", function(e){
        var t = e.currentTarget;
        var rr = Number(t.dataset.r), cc = Number(t.dataset.c), here = wordsAt(rr, cc);
        var same = selCell && selCell[0] === rr && selCell[1] === cc;
        if (!here.length) selWord = null;
        else if (same && here.length > 1) selWord = here[(here.indexOf(selWord) + 1) % here.length];
        else if (here.indexOf(selWord) === -1) selWord = here[0];
        focusCell(rr, cc);
        if (over) return;
        start(); paint();
      });
    }
    gridEl.appendChild(el); cellEls[r][c] = el;
  }}

  for (var n=1;n<=26;n++){
    var k = document.createElement("div"); k.dataset.n = n;
    k.innerHTML = '<span class="kn">' + n + '</span><span class="kl"></span>';
    if (!usedNum[n]) k.classList.add("absent");
    k.addEventListener("click", function(e){ var nn = Number(e.currentTarget.dataset.n);
      if (usedNum[nn]) { selCell = null; selWord = null; select(nn); } });
    keyEl.appendChild(k);
  }

  // Draw the word breaks onto the grid. A square can end a word in both
  // directions -- the third letter of an across answer may also be the fourth
  // of a down one -- so the bars are separate elements rather than one border.
  SLOTS.forEach(function(w, i){
    var cells = wordCells(w);
    (w.breaks || []).forEach(function(at){
      var rc = cells[at];
      if (!rc) return;
      var el = cellEls[rc[0]][rc[1]];
      if (!el || el.classList.contains("block")) return;
      var bar = document.createElement("span");
      bar.className = "bk " + (w.dir === "a" ? "r" : "d");
      el.appendChild(bar);
    });
  });

  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(function(l){
    var b = document.createElement("button"); b.type="button"; b.textContent = l; b.dataset.l = l;
    if (!present[l]) b.classList.add("absent");
    b.addEventListener("click", function(e){ typeLetter(e.currentTarget.dataset.l); });
    keysEl.appendChild(b);
  });
  var pen = document.createElement("button"); pen.type="button"; pen.className="wide"; pen.id="pen"; pen.textContent="Pencil";
  pen.addEventListener("click", function(){ pencilMode = !pencilMode; paint(); });
  keysEl.appendChild(pen);
  var del = document.createElement("button"); del.type="button"; del.className="wide"; del.textContent="Clear";
  del.addEventListener("click", clearSelected); keysEl.appendChild(del);

  var hintEls = [];
  (function(){
    var el = document.getElementById("hints");
    var order = SLOTS.map(function(h,i){ return {h:h, i:i}; }).sort(function(a,b){
      return (a.h.text < b.h.text) ? -1 : (a.h.text > b.h.text) ? 1 : 0;
    });
    order.forEach(function(o){
      var li = document.createElement("li");
      // Crossword enumeration. The grid runs the letters together, so without
      // it OLDTRAFFORD is just eleven squares; (3,8) says where the break is
      // and lets a hint be matched to a slot by length.
      li.innerHTML = (o.h.sense ? "<b>" + o.h.sense + "</b> / " + o.h.cat : "<b>" + o.h.cat + "</b>")
                   + (o.h.enum ? ' <span class="en">(' + o.h.enum + ")</span>" : "");
      // Clicking a hint selects that answer on the grid. It lands on the first
      // square still open -- going to square one of a half-finished word would
      // make the click useless on exactly the answers a player is working on.
      li.tabIndex = 0;
      li.addEventListener("click", function(){ goToWord(o.i); });
      li.addEventListener("keydown", function(e){
        if (e.key === "Enter" || e.key === " "){ goToWord(o.i); e.preventDefault(); }
      });
      el.appendChild(li); hintEls[o.i] = li;
    });
  })();

  function goToWord(i){
    if (over) return;
    var cells = wordCells(SLOTS[i]);
    var at = cells.find(function(rc){ return !locked[CELLS[rc[0]][rc[1]]]; }) || cells[0];
    selWord = i;
    focusCell(at[0], at[1]);
    start(); paint();
    cellEls[at[0]][at[1]].scrollIntoView({block: "nearest", inline: "nearest"});
  }

  function wordCells(w){
    var out = [];
    for (var i = 0; i < w.len; i++){
      out.push(w.dir === "a" ? [w.row, w.col + i] : [w.row + i, w.col]);
    }
    return out;
  }

  // Which of the eleven pass through a square. Most squares are in one; the
  // crossings are in two, and clicking a crossing twice turns the corner.
  function wordsAt(r, c){
    var out = [];
    SLOTS.forEach(function(w, i){
      if (wordCells(w).some(function(rc){ return rc[0] === r && rc[1] === c; })) out.push(i);
    });
    return out;
  }

  function focusCell(r, c){
    selCell = [r, c];
    selected = CELLS[r][c];
  }

  // Step along the word you are in, the way a crossword does: type a letter and
  // the cursor moves on. Squares already fixed -- a given letter, a revealed
  // one, a number locked by a finished answer -- are stepped over, since there
  // is nothing to type there. Running off either end simply stops.
  function step(dir){
    if (selWord === null || !selCell) return false;
    var cells = wordCells(SLOTS[selWord]), at = -1;
    for (var i = 0; i < cells.length; i++){
      if (cells[i][0] === selCell[0] && cells[i][1] === selCell[1]) at = i;
    }
    if (at < 0) return false;
    for (var j = at + dir; j >= 0 && j < cells.length; j += dir){
      if (!locked[CELLS[cells[j][0]][cells[j][1]]]){
        focusCell(cells[j][0], cells[j][1]);
        return true;
      }
    }
    return false;
  }

  function countOf(num){
    var total = 0, empty = 0;
    for (var r=0;r<N;r++) for (var c=0;c<N;c++){
      if (CELLS[r][c] !== num) continue;
      total++; if (!guess[num]) empty++;
    }
    return { total: total, empty: empty };
  }

  function paint(){
    var inWord = [];
    for (var q=0;q<N;q++) inWord.push(new Array(N));
    if (selWord !== null){
      wordCells(SLOTS[selWord]).forEach(function(rc){ inWord[rc[0]][rc[1]] = true; });
    }
    for (var r=0;r<N;r++) for (var c=0;c<N;c++){
      var n = CELLS[r][c]; if (n === null || n === undefined) continue;
      var el = cellEls[r][c], slot = el.querySelector(".l");
      if (guess[n]){ slot.textContent = guess[n]; slot.className = "l"; }
      else if (pencil[n]){ slot.textContent = pencil[n]; slot.className = "l pencil"; }
      else { slot.textContent = ""; slot.className = "l"; }
      el.classList.toggle("sel", !!selCell && selCell[0] === r && selCell[1] === c);
      el.classList.toggle("same", n === selected);
      el.classList.toggle("inword", !!(selWord !== null && inWord[r][c]));
      // Any locked number is settled everywhere on the grid, not only inside
      // the answer that settled it. One rule for all three kinds of certainty
      // -- given at kick-off, revealed for a substitution, or confirmed by a
      // finished answer -- because they are all facts and a guess is not. A
      // revealed letter keeps its own gold, which is painted after this.
      el.classList.toggle("known", !!locked[n]);
      el.classList.toggle("revealed", locked[n] === "revealed");
      el.classList.toggle("wrong", !!wrongMark[n]);
      el.classList.remove("done");
    }
    var count = 0;
    SLOTS.forEach(function(w,i){
      var cells = wordCells(w), ok = !!solvedWords[i];
      if (ok){
        count++;
        cells.forEach(function(rc){
          cellEls[rc[0]][rc[1]].classList.add("done");
          var n = CELLS[rc[0]][rc[1]];
          if (!locked[n]) locked[n] = "confirmed";
        });
      }
      if (hintEls[i]) {
        hintEls[i].classList.toggle("done", ok);
        // Follow the word the cursor is in. Before there was a cursor this
        // could only ask "is my square in this answer", which lit BOTH answers
        // at a crossing; now that clicking a crossing turns the corner, the
        // hint should say which of the two you are actually typing into.
        var here = selWord !== null ? i === selWord
                 : !!selCell && cells.some(function(rc){
                     return rc[0] === selCell[0] && rc[1] === selCell[1];
                   });
        hintEls[i].classList.toggle("here", here && !ok);
      }
    });
    document.getElementById("solved").textContent = count;

    Array.prototype.forEach.call(keyEl.children, function(k){
      var n = Number(k.dataset.n);
      k.querySelector(".kl").textContent = guess[n] || (pencil[n] ? pencil[n].toLowerCase() : "");
      k.classList.toggle("sel", n === selected);
      k.classList.toggle("cracked", !!guess[n]);
      k.classList.toggle("fixed", !!locked[n]);
    });

    var used = {}; Object.keys(guess).forEach(function(n){ used[guess[n]] = true; });
    // Three states, not two. A letter can be spent (you have placed it), or it
    // can be absent -- not on this board at all. A board need not carry all 26,
    // so an absent letter would otherwise sit there looking available forever.
    alphaEl.innerHTML = ALPHA.split("").map(function(l){
      if (!present[l]) return '<s class="out" title="not on this board">' + l + "</s>";
      return used[l] ? "<s>" + l + "</s>" : l;
    }).join(" ") + '<span class="cap">' + nPresent + " letters on this board" +
      (absentList.length ? " · no " + absentList.join(", ") : "") + "</span>";
    Array.prototype.forEach.call(keysEl.children, function(b){ if (b.dataset.l) b.classList.toggle("used", !!used[b.dataset.l]); });
    document.getElementById("pen").classList.toggle("on", pencilMode);

    var rNum = document.getElementById("rNum"), rHint = document.getElementById("rHint");
    if (selected === null){ rNum.textContent = ""; rHint.textContent = "Tap a square to select its number"; }
    else {
      var c2 = countOf(selected);
      rNum.textContent = "Number " + selected;
      rHint.textContent = c2.total + (c2.total === 1 ? " square" : " squares")
        + (c2.empty ? " " + DOT + " " + c2.empty + " still empty" : " " + DOT + " all filled")
        + (pencilMode ? " " + DOT + " pencil on" : "");
    }

    var subsEl = document.getElementById("subs");
    Array.prototype.forEach.call(subsEl.querySelectorAll("i"), function(dot,i){ dot.classList.toggle("spent", i < subsUsed); });
    subsEl.querySelector("span").textContent = subsUsed >= SUBS ? "No substitutions left" : (SUBS - subsUsed) + (SUBS - subsUsed === 1 ? " substitution" : " substitutions");
    document.getElementById("reveal").disabled = over || selected === null || !!locked[selected];
    document.getElementById("check").disabled = over;
    if (count === SLOTS.length && !over) fullTime();
  }

  function select(n){ if (over) return; selected = n; start(); paint(); }
  function typeLetter(l){
    if (over || selected === null) return;
    if (locked[selected]){
      toast(locked[selected] === "confirmed"
        ? "That number is locked by a finished answer"
        : locked[selected] === "revealed" ? "That number was revealed" : "That letter was given");
      return;
    }
    if (!present[l]){ toast(l + " is not on this board"); return; }
    start();
    if (pencilMode){ pencil[selected] = l; step(1); paint(); return; }
    // One letter, one number. If this letter is already fixed to a locked
    // number, typing it elsewhere must be refused, not quietly duplicated:
    // the old code skipped locked numbers when clearing the letter away and
    // then assigned it regardless, leaving the same letter on two numbers.
    var holder = holderOf(l);
    if (holder !== null && holder !== selected && locked[holder]){
      toast(l + " is already fixed at number " + holder);
      return;
    }
    Object.keys(guess).forEach(function(n){ if (guess[n] === l && !locked[n]) delete guess[n]; });
    guess[selected] = l; delete pencil[selected]; delete wrongMark[selected];
    step(1); paint(); refreshSolved();
  }
  /* Ask whether any newly-finished answer is right.

     Only ever asked about slots that are COMPLETELY filled and not already
     done, so offline it is a few comparisons and live it is at most eleven
     calls in a game rather than one per keystroke. A slot half full is not a
     question anybody can answer. */
  /* A RE-ENTRANCY GUARD THAT FORGETS IS A DROPPED QUESTION, and this one lost
     the most important question in the game.

     `if (asking) return;` with no memory. A confirm is in flight, the player
     types the last letter of the last answer, this fires, and the ask is
     discarded — not deferred, discarded. Nothing asks again, because nothing
     else calls refreshSolved once the grid stops changing. Live on board 2 that
     left all 169 squares filled and correct, ten of eleven words locked, the
     eleventh silent: no error, no retry, nothing to click. A player who has
     finished the board is simply told they have not.

     It is the shape this estate has been finding all week from the other side —
     a check whose input is absent must not report a pass — in its active form:
     a call whose turn is taken must not be thrown away. `missed` remembers, and
     the callback asks again rather than leaving the grid to trigger it, because
     a finished grid never changes again. */
  var asking = false, missed = false;

  /* ---------- A dropped connection ----------
     Marking and the whistle are the server's, so a train or a lift used to
     cost the board: a word finished with no signal was never confirmed, and a
     whistle blown with none never came back, leaving a board marked over with
     no Full Time on it. Both are now OWED, and paid the moment the connection
     returns -- the browser's "online" event, or a retry every few seconds,
     because a phone on a wifi with no route out reports itself online.

     OWED ONLY AFTER A FAILURE. A word the server marked wrong is not owed
     anything: re-asking it on a timer would be the player's own letters being
     re-submitted forever. And each retry is the same one request the player
     would have made, so it costs nothing extra: /mark counts an ask only when
     it confirms a new word, and /finish answers a second call with the result
     of the first. The clock is the server's throughout, so minutes spent
     without a signal count, as they would have with one. */
  var markOwed = false, finishOwed = false, retryTimer = null;
  var RETRY_MS = 5000;
  function owed(){ return finishOwed || (markOwed && !over); }
  function payOwed(){
    if (finishOwed) { finishOwed = false; whistle(); return; }
    if (markOwed && !over && !asking) refreshSolved();
  }
  function awaitConnection(){
    if (retryTimer) return;
    toast("No connection. This will be marked when it returns");
    retryTimer = setInterval(function(){
      if (!owed()) { clearInterval(retryTimer); retryTimer = null; return; }
      payOwed();
    }, RETRY_MS);
  }
  window.addEventListener("online", function(){ if (owed()) payOwed(); });

  function refreshSolved(){
    if (over) return;
    var ripe = SLOTS.some(function(w, i){
      return !solvedWords[i] && wordCells(w).every(function(rc){
        return guess[CELLS[rc[0]][rc[1]]];
      });
    });
    if (!ripe) return;
    if (asking) { missed = true; return; }
    asking = true;
    missed = false;
    /* AND THE FLAG ONLY LATCHES IF THE ASK WENT OUT. Setting it before the call
       and trusting the callback to clear it means any path that returns without
       calling back locks this function for the rest of the round. */
    if (oracle.confirm(function(done){
      asking = false;
      markOwed = false;
      var fresh = done.some(function(i){ return !solvedWords[i]; });
      done.forEach(function(i){ solvedWords[i] = true; });
      if (fresh) paint();
      if (missed) { missed = false; refreshSolved(); }
    }, function(){
      asking = false;
      markOwed = true;
      awaitConnection();
    }) === false) {
      asking = false;
      /* THE ASK COULD NOT GO OUT BECAUSE THERE IS NO ROUND. Ask for one. If
         /play is merely slow this returns at once and its own callback comes
         back here; if /play FAILED earlier, this is the retry — and it is
         driven by a player finishing an answer rather than by a timer. */
      openRound();
    }
  }

  function holderOf(l){
    var found = null;
    Object.keys(guess).forEach(function(n){ if (guess[n] === l) found = Number(n); });
    return found;
  }
  function clearSelected(){
    if (over || selected === null) return;
    if (locked[selected]){
      toast(locked[selected] === "confirmed"
        ? "That number is locked by a finished answer" : "That letter cannot be cleared");
      return;
    }
    delete guess[selected]; delete pencil[selected]; delete wrongMark[selected];
    step(-1); paint();
  }
  document.addEventListener("keydown", function(e){
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[a-zA-Z]$/.test(e.key)){ typeLetter(e.key.toUpperCase()); e.preventDefault(); }
    else if (e.key === "Backspace" || e.key === "Delete"){ clearSelected(); e.preventDefault(); }
    else if (e.key === " "){ pencilMode = !pencilMode; paint(); e.preventDefault(); }
  });

  document.getElementById("check").addEventListener("click", function(){
    if (over) return; start();
    /* THE HANDLER PAINTS AND CHARGES NOTHING. Both oracles now apply the cost
       — the server's from spentMinutes, the offline one from COST — and this
       callback used to add COST.check on top of whichever had already done it.
       The comment three inches up in serverOracle said "the page takes
       spentMinutes rather than adding COST.check itself", which was the rule
       and was not what the code did. */
    oracle.wrongNumbers(function(bad){
      bad.forEach(function(n){ wrongMark[n] = true; });
      toast(bad.length
        ? bad.length + (bad.length === 1 ? " number wrong " : " numbers wrong ") + DOT + " +" + COST.check + "'"
        : "All correct so far " + DOT + " +" + COST.check + "'");
      paint(); tick();
    });
  });
  document.getElementById("reveal").addEventListener("click", function(){
    if (over || selected === null || locked[selected]) return; start();
    var n = selected;
    /* CHARGES NOTHING EITHER, and this one was the visible fault: the server
       applied subsLeft and spentMinutes, then this line spent a second
       substitution and another COST.reveal minutes on top. One reveal cost two
       of three substitutions and ran the clock ten minutes fast. */
    oracle.reveal(n, function(l){
      Object.keys(guess).forEach(function(k){ if (guess[k] === l && !locked[k]) delete guess[k]; });
      guess[n] = l; locked[n] = "revealed"; delete pencil[n]; delete wrongMark[n];
      toast(subsUsed > SUBS ? "Over your substitutions: a draw at best"
                            : "Substitution used " + DOT + " +" + COST.reveal + "'");
      paint(); tick(); refreshSolved();
    });
  });
  /* The clock rate is fixed AT KICK-OFF and cannot be changed after it.

     It used to be changeable at any moment, and because the minute is computed
     as elapsed/rate over the WHOLE match rather than accumulated, switching to
     the slower clock mid-game rewound the match clock: a minute of real play at
     3 seconds is 20 match minutes, and flipping to 20 turns the same minute into
     3. Twenty minutes of decay handed back for one click, and the higher score
     to go with it.
     Nobody reported it. It is the kind of thing found by asking what a control
     does to state it did not create, which is the same question that found the
     stamped fallback. It also could not survive the server holding the clock --
     the rate is part of the round, issued once. */
  function setRate(v){
    if (startedAt) return false;              // the round has a rate already
    secondsPerMinute = Number(v) === 20 ? 20 : 3;
    return true;
  }
  Array.prototype.forEach.call(document.querySelectorAll('input[name="spd"]'), function(i){
    i.addEventListener("change", function(){
      if (!setRate(i.value)) {
        toast("The clock is set at kick-off");
        Array.prototype.forEach.call(document.querySelectorAll('input[name="spd"]'), function(o){
          o.checked = Number(o.value) === secondsPerMinute;
        });
      }
    });
  });

  /* Kick-off. Live this opens a ROUND -- the server issues the id, owns the
     clock and counts the substitutions, so nothing about a helper's cost can be
     argued with afterwards. The rate goes up because the server cannot turn
     elapsed time into a match minute without knowing whether a minute costs 3
     real seconds or 20.

     The display clock still starts here and runs locally, so it is smooth; the
     CHARGED clock is the server's and arrives on every response that costs
     something. Where they disagree the server wins and the display corrects. */
  var opening = false;
  function start(){
    if (startedAt) return;
    startedAt = Date.now();
    timer = setInterval(tick, 500);
    openRound();
  }

  /* SPLIT OUT OF start(), so something other than the first keystroke can ask
     for a round.
     THE GAP THIS CLOSES. If /play FAILS rather than merely being slow, there is
     no round, no round-opening callback, and serverOracle.confirm returns false
     for ever. A board completed after that is filled, correct and silent — the
     same symptom as the guard that forgot, by a different road. refreshSolved()
     calls this when it finds it has nothing to ask with, so the retry is
     triggered by a player finishing an answer rather than by a timer: bounded
     by something somebody did, and no polling.
     Cheap to call repeatedly — it returns at once if a round exists or one is
     already on its way. */
  function openRound(){
    if (SOLUTION || round || opening) return;
    opening = true;
    /* boardKey, without which every row lands with board_key null and the
       funnel — which reads per board — cannot group, attribute or count the
       attempt against the board it was of. The same omission Ballpark shipped
       with, found the same day. `cw:` + the day is the key entryKey() composes
       server-side: the DAY and not either board number, for the reason written
       there. BOARD_DAY is already known here (the body below sends it), so
       unlike Ballpark this needs no reordering — only the field it omitted. */
    if (window.XIPlays) {
      XIPlays.start({
        game: "codeword", mode: "daily",
        boardKey: BOARD_DAY ? "cw:" + BOARD_DAY : null, total: 11,
      }, playsProgress);
    }
    fetch(API + "play", {
      method: "POST", headers: {"Content-Type": "application/json", "X-XI-Games": "1"},
      /* WHETHER THIS DEVICE HAS FINISHED THIS BOARD BEFORE. The server has no
         session and cw_round has no player column, so the rule that decides
         "replay" used to read the BOARD's history and made a board unscored for
         everyone once ANYBODY finished it. This page keeps its own results and
         is the only thing here that knows whose replay it would be. */
      body: JSON.stringify({ rate: secondsPerMinute, no: BOARD_NO_N,
                             replay: hasPlayedBoard(BOARD_DAY) })
    }).then(function(r){ return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function(d){
        opening = false;
        if (!d || !d.playId) { toast("Could not start the match"); return; }
        round = d;
        if (typeof d.subsLeft === "number") subsUsed = SUBS - d.subsLeft;
        if (d.scored === false) toast("Replay " + DOT + " this one is not recorded");
        paint();
        /* ANYTHING FINISHED WHILE THE ROUND WAS OPENING IS ASKED ABOUT NOW.
           Without this, a word completed before /play returned would wait for
           the next keystroke to be noticed — and on the last word of a board
           there is no next keystroke. Same reasoning as the retry inside
           refreshSolved: the grid is what normally triggers it, and a finished
           grid never changes again. */
        refreshSolved();
      })
      .catch(function(){ opening = false; toast("Could not reach the referee"); });
  }
  // No cap at 90. The match is not taken off anyone for running out of time:
  // the clock goes into stoppage time and the board stays playable. The score
  // has already bottomed out at 36 by then (scoreAt returns the floor from 90
  // on), so playing past the whistle costs nothing further -- it just means a
  // draw rather than a win.
  /* HOW FAR THEY GOT, read at the end of the play. Without this second
     argument every field defaulted to 0 and a finished board wrote solved=0
     and elapsed_secs=0 beside completed=1. Found 19 Sep 2026 alongside
     Ballpark's and Grid's; three games, not the two first reported.
     `elapsed` is real seconds, not match minutes: the minute is a scoring
     device that runs three times fast and takes the cost of every check on
     top, so it answers a different question from "how long were they here". */
  function playsProgress(){
    var solved = Object.keys(solvedWords).length;
    var total = WORDS.length || 11;
    return {
      solved: solved,
      elapsed: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
      checks: checksUsed,
      reveals: subsUsed,
      detail: {
        minute: matchMinute(),
        score: outcome(matchMinute(), solved, total).score,
        of: total,
      },
    };
  }

  function matchMinute(){ if (!startedAt) return 0; var real = (Date.now() - startedAt) / 1000; return Math.floor(real / secondsPerMinute) + extraMinutes; }
  function minuteText(m){ return m > 90 ? "90+" + (m - 90) : String(m); }

  // What a finished match is worth and what it counts as. Kept out of the DOM
  // so it can be checked: see tools/typing_test.mjs.
  //   all eleven inside ninety   -> Win
  //   all eleven in stoppage     -> Draw
  //   whistle blown short of all -> Loss, scored on what was locked
  function outcome(m, solvedNow, total){
    return { score: Math.round(scoreAt(m) * solvedNow / total),
             res: solvedNow < total ? "L" : (m <= 90 ? "W" : "D") };
  }
  function tick(){
    if (over) return; var m = matchMinute();
    document.getElementById("minute").textContent = minuteText(m);
    document.getElementById("worth").textContent = Math.round(scoreAt(m));
    // past ninety there is a way to stop, since nothing stops it for you
    document.getElementById("whistle").hidden = m < 90;
  }

  // The match now ends one of two ways: the board is finished, or the player
  // blows the whistle on it. Nothing ends it for them. A part-finished board
  // scores what it is worth rather than nothing -- eight of eleven at 36 a
  // board is 26, not a blank -- because walking away from a board you nearly
  // had should not read the same as never starting.
  var CW_KEY = "xicw.results";

  function readResults(){
    try { var r = JSON.parse(localStorage.getItem(CW_KEY) || "[]"); return Array.isArray(r) ? r : []; }
    catch (e) { return []; }
  }

  /* HAS THIS DEVICE FINISHED THIS BOARD? The one question the server cannot
     answer for itself, and the reason a replay used to be everybody's replay.
     Only FINISHED boards are in the list — recordResult refuses a board already
     there and is never called for an abandoned round — so a closed tab does not
     read as a replay. Private browsing throws on read and comes back empty,
     which makes every sitting a first sitting: the failure falls the way that
     lets somebody play rather than the way that refuses to record them. */
  /* THE DAY, NOT THE NUMBER, AND THE NUMBER IS WHY THIS NEVER WORKED.
   *
   * This compared list[i].no against BOARD_NO_N and the two are different
   * numbering schemes. recordResult stores `d.no` from the /finish response,
   * which is CODEWORD'S OWN ordinal counted from its epoch; BOARD_NO_N is the
   * FAMILY board number counted from 26 August. They differ by nineteen. So 3
   * never equalled 22, hasPlayedBoard returned false for every board that had
   * ever been finished, replay went up false every time, and the rule Graeme
   * chose has never once fired.
   *
   * Found by the Codeword session PLAYING today's board to a finish and
   * reopening it. No test would have caught it: it needs a board finished AND
   * revisited, and a device that has finished nothing behaves identically with
   * the bug and without it — which is every run that starts from a clean
   * profile. Two numbers nineteen apart both look plausible in a log and
   * neither looks like the other's scheme.
   *
   * THIRD TIME TONIGHT for family-versus-internal numbering: /daily/1 resolving
   * to a date three weeks before the game existed, the archive loader reading
   * the wrong one, and now a comparison holding one of each. The day is the
   * cure rather than a fix, because a day means one thing everywhere — which is
   * the same reason entryKey keys on it. */
  function hasPlayedBoard(day){
    if (!day) return false;
    var list = readResults();
    for (var i = 0; i < list.length; i++){
      if (list[i] && list[i].day === day) return true;
    }
    return false;
  }

  function recordResult(d){
    if (!d || d.scored === false) return;          // a replay is not recorded
    try {
      var list = readResults();
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].no === d.no) return;
      list.push({ no: d.no, day: d.day || null, score: d.score, solved: d.solved,
        minute: d.minute, result: d.result });
      localStorage.setItem(CW_KEY, JSON.stringify(list));
    } catch (e) { /* private browsing: play on without a record */ }
    pushResults();
  }

  /* ---- and the account, which this game reached for a day without -------
   *
   * THE RESULT STOPPED IN THE BROWSER. recordResult wrote a row to
   * localStorage and nothing ever called /api/account/migrate, so a signed-in
   * player's Codeword result reached their own device and went no further. It
   * is the banking fault one layer out from the one entryKey() had: the key
   * now exists and the row is written, and the account still never heard.
   *
   * Found by tabulating both halves across every game rather than either on
   * its own — Codeword was the only one that recorded without pushing.
   *
   * The merge rule is the family's and is not restated here: first result
   * banked wins, the account's row wins outright on pull, unpushed local rows
   * survive. Failures log and stay caught; a transient session failure is NOT
   * signed-out, and none of it is ever shown to the player.
   */
  var account = null;

  function accountNote(what, err){
    try { console.warn("[account] " + what + " failed:", err && err.message ? err.message : err); }
    catch (e) {}
  }

  function apiAuth(path, body){
    var opts = { method: body ? "POST" : "GET", headers: { "X-XI-Games": "1" },
                 credentials: "same-origin" };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(path, opts).then(function (r){
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }

  function pushResults(){
    if (!account) return Promise.resolve(null);
    return apiAuth("/api/account/migrate", { game: "codeword", results: readResults() })
      .catch(function (e){ accountNote("push", e); return null; });
  }

  function pullResults(){
    if (!account) return Promise.resolve(null);
    return apiAuth("/api/account/results?game=codeword").then(function (r){
      var remote = (r && r.results) || [];
      if (!remote.length) return null;
      /* Keyed on the board NUMBER, because that is what this game's own list is
         keyed on and what its dedupe above compares. */
      var byNo = {};
      readResults().forEach(function (x){ if (x && x.no != null) byNo[x.no] = x; });
      remote.forEach(function (x){ if (x && x.no != null) byNo[x.no] = x; });
      var merged = Object.keys(byNo).sort(function (a, b){ return Number(a) - Number(b); })
        .map(function (k){ return byNo[k]; });
      try { localStorage.setItem(CW_KEY, JSON.stringify(merged.slice(-800))); } catch (e) {}
      return merged.length;
    }).catch(function (e){ accountNote("pull", e); return null; });
  }

  /* The chrome owns the identity and announces it on document as xi:account;
     this game answers by syncing its own results, which is the one part that
     is still its own. */
  /* WHO IS SIGNED IN — ASKED OF THE SERVER, NOT OF THE CHROME.
   *
   * This was written twice wrong in one evening, in three games, and both
   * spellings failed silently:
   *
   *   window.XIChrome.account()   — account is an OBJECT, not a function.
   *                                 It threw on every page load. Caught and
   *                                 logged, so the only trace was a console
   *                                 warning nobody reads.
   *   ev.detail.account           — the chrome emits { type, user, via }.
   *                                 There is no `account` on the detail, so
   *                                 signing in mid-session set it to undefined.
   *
   * Both paths dead means `account` was never anything but null, so
   * pushResults() returned early every time and NOT ONE result reached an
   * account. That is the banking fault for the third time today, at a third
   * layer: the key existed, the row was written, the push was wired — and the
   * thing that decides whether to push could not be set.
   *
   * HiLo's shape is the one that works, and it is better for a reason worth
   * keeping: it asks /api/auth/session rather than the chrome. The server is
   * the authority on who you are; the chrome is a menu that happens to know.
   */
  function syncAccount() {
    return apiAuth("/api/auth/session").then(function (r) {
      account = (r && r.user) || null;
      if (!account) return null;
      return pushResults().then(pullResults);
    }).catch(function (e) { accountNote("session", e); return null; });
  }

  document.addEventListener("xi:account", function (ev) {
    var d = ev.detail || {};
    if (d.type === "signout") { account = null; return; }
    syncAccount();
  });

  syncAccount();


  function fullTime(){
    if (window.XIPlays && XIPlays.active()) XIPlays.end(true);
    over = true; clearInterval(timer); paint();
    // Live, the SERVER computes the result. Choosing server-marking to stop a
    // forged score and then letting the page post its own would be the front
    // door locked and the back door open, so the page displays what comes back
    // and computes only when there is nobody to ask.
    whistle();
  }
  /* The server's verdict, asked until it answers. A whistle that could not
     reach the referee is owed, not lost. */
  function whistle(){
    oracle.finish(function(d){ finishOwed = false; recordResult(d); showFullTime(d); },
      function(){ finishOwed = true; awaitConnection(); });
  }

  function showFullTime(fromServer){
    var m = matchMinute(), solvedNow = Object.keys(solvedWords).length;
    var out = outcome(m, solvedNow, SLOTS.length), score = out.score, res = out.res;
    if (fromServer && typeof fromServer.score === "number"){
      score = fromServer.score;
      res = fromServer.result || res;
      solvedNow = typeof fromServer.solved === "number" ? fromServer.solved : solvedNow;
      m = typeof fromServer.minute === "number" ? fromServer.minute : m;
    }
    var words = {W:"Win",D:"Draw",L:"Loss"};
    var solved = solvedNow;
    var squares = ""; for (var i=0;i<10;i++){ squares += i < Math.round(score/MAX*10) ? SQ_ON : SQ_OFF; }
    var share = "Codeword XI " + DOT + " board " + BOARD_NO + "\n" + squares + "\n" + score + " pts " + DOT + " " + solved + "/11 " + DOT + " " + minuteText(m) + "' " + DOT + " " + words[res] + "\nthexigames.com";
    document.getElementById("ftScore").textContent = score;
    var rr = document.getElementById("ftRes"); rr.textContent = words[res]; rr.className = "res " + res;
    document.getElementById("ftShare").textContent = share;
    /* THE FAMILY'S SHARE ROW. The same buttons, platforms and copy fallback
       every other game offers, from shared/xi-share.js — this game had a bare
       "Copy result" and nothing to send it with. Mounted once: the text is read
       when a button is pressed, not when the row is built. */
    var shareRow = document.getElementById("shareRow");
    if (window.XIShare && shareRow) {
      window.XIShare.mount(shareRow, {
        text: function () { return document.getElementById("ftShare").textContent; },
        url: function () { return location.href; },
      });
    }
    document.getElementById("ft").classList.add("on");
    document.getElementById("copy").onclick = function(){ try { navigator.clipboard.writeText(share); toast("Copied"); } catch(e){ toast("Select and copy the text"); } };
  }
  document.getElementById("whistle").addEventListener("click", function(){ if (!over) fullTime(); });
  document.getElementById("again").addEventListener("click", restart);

  /* ---- A FINISHED BOARD STAYS FINISHED -----------------------------------
   *
   * THE COMPLAINT: "Codeword daily doesn't retain completion". It did not.
   * This game keeps its results in xicw.results and nothing else — no board
   * state, deliberately — and NOTHING ON BOOT EVER READ THEM. Come back to a
   * board you finished an hour ago and you got an empty grid, a running clock
   * and no sign you had played it at all. The only hint was a toast saying
   * "Replay — this one is not recorded", and that arrives after the FIRST
   * KEYSTROKE, because the round is opened by starting to type. So the player
   * is told they have already done this only once they have begun doing it
   * again.
   *
   * hasPlayedBoard() already knew. It was used for one thing — telling the
   * server not to score a replay — and its answer was never shown to anybody.
   *
   * WHAT IS RESTORED IS THE RESULT, NOT THE GRID. The letters are not kept
   * anywhere and this does not invent them: the Full Time card comes back with
   * the score, the solved count, the minute and the outcome that were banked,
   * which is what "I finished this" means here. The board underneath stays
   * playable and Play again still works — a replay simply is not recorded,
   * which was already the rule.
   * Off the daily this does nothing: a free board has no day to have finished. */
  if (DAILY && BOARD_DAY) {
    var mine = null, past = readResults();
    for (var pi = 0; pi < past.length; pi++) {
      if (past[pi] && past[pi].day === BOARD_DAY) { mine = past[pi]; break; }
    }
    if (mine) showFullTime(mine);
  }
  function restart(){
    clearInterval(timer);
    guess = {}; pencil = {}; locked = {}; wrongMark = {}; solvedWords = {};
    selected = null; selCell = null; selWord = null; pencilMode = false;
    subsUsed = 0; extraMinutes = 0; startedAt = null; over = false; timer = null;
    document.getElementById("whistle").hidden = true;
    GIVEN_N.forEach(function(g){ guess[g.n] = g.letter; locked[g.n] = "given"; });
    document.getElementById("ft").classList.remove("on");
    document.getElementById("minute").textContent = "0";
    document.getElementById("worth").textContent = MAX;
    paint();
  }

  var toastT; function toast(s){ var t = document.getElementById("toast"); t.textContent = s; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove("on"); }, 1800); }

  oracle = SOLUTION ? localOracle() : serverOracle();
  paint();
  refreshSolved();
}

/* Which board is today's, and where to get it.

   The day is counted in UTC from the epoch, the same arithmetic the crossword
   uses, and from the SERVER's clock where one is available: the manifest's HTTP
   Date header. That is not caution for its own sake -- the crossword shipped a
   version that counted device-local days against a server that counted UTC, and
   for an hour every British summer night the two named different boards. The
   device clock is the fallback, because offline the server cannot contradict
   anyone anyway. */
var DAILY_EPOCH = Date.UTC(2026, 8, 13);   // board 1 is the day after

/* Where boards come from. Two shapes, and the difference is not cosmetic.

   "daily/" serves the queue as STATIC FILES, which means every board in it is
   public the moment it is deployed: anyone can fetch daily/0200.json today and
   read the solution to a puzzle six months out. That is fine for a review host
   and wrong for a live game, and it is not fixable inside a static folder --
   pre-staging a year and hiding it are the same folder asking for opposite
   things.

   An endpoint that answers with TODAY's board, chosen by the server's own clock,
   is the fix. Point BOARD_SOURCE at it and the loader below is unchanged: it
   still asks for the manifest and then a board, and the server decides what it
   is allowed to hand over. */
var BOARD_SOURCE = "daily/";

/* The five endpoints, read off the committed source rather than guessed at:
   functions/api/codeword/{daily,play,mark,reveal,finish}.js.

     GET  daily[?no=N] -> { day, no, board: {no,day,size,cells,given,absent,slots}, lastDay }
     POST play   {rate,no?}          -> { playId, startedMs, rate, scored, subsLeft }
     POST mark   {playId,guess}      -> { solved: [...], capped }
     POST mark   {playId,guess,check}-> { wrong: [...], spentMinutes }
     POST reveal {playId,n}          -> { letter, subsLeft, spentMinutes, charged }
     POST finish {playId}            -> { score, solved, minute, result }

   Note `board` is NESTED in the daily response and the page unwraps it, and
   that `scored` is false for a replay -- the round still plays and finishes,
   and nothing is banked. */
var API = "/api/codeword/";

/* Whether there is a server behind this page. The built drop sets it; a local
   copy of the package has no endpoints and reads the staged files instead. */
var LIVE = true;

function dayNumber(ms){
  var d = new Date(ms);
  var mid = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.max(1, Math.round((mid - DAILY_EPOCH) / 86400000));
}

/* Which board the address is asking for.

   Nothing, normally: the day decides, and that is the safe case because no
   number travels. An archive link names one, and the site session's rule is
   that a board is reachable when its DAY IS TODAY OR EARLIER -- bounded by the
   schedule rather than by arithmetic, so a board with no day is not a board.

   That bound is the server's and this function does not duplicate it. What it
   does is refuse to ASK for anything the bound would refuse: a number that is
   not a number, or one past today. A client that asks only for what it may have
   is not a security measure -- the server still has to say no -- but it keeps an
   honest mistake from looking like an attack in somebody's logs, and it means a
   mistyped URL shows a message rather than an error. */
function wantedBoard(today){
  // PRESENT but unreadable is refused, not quietly replaced with today. The
  // first version matched digits only, so "?no=-2" and "?no=abc" fell through
  // and served today's board to somebody who had followed an archive link --
  // they would have played the wrong puzzle believing it was the one they
  // asked for. Absent means today; present means exactly what it says or
  // nothing at all.
  var m = /[?&]no=([^&]*)/.exec(location.search);
  if (!m) return today;
  var raw = m[1];
  if (!/^\d+$/.test(raw)) return null;
  var n = Number(raw);
  if (!isFinite(n) || n < 1 || n > today) return null;
  return n;
}

/* Live, the day is the SERVER'S and the board arrives nested in the response.
   The page does no date arithmetic at all in that case: asking a server that
   already knows what day it is to be told by the client is how two clocks come
   to disagree. The static path below stays for local preview of the package,
   where there is no endpoint to ask. */
function loadDaily(){
  /* Present but unreadable is REFUSED, not quietly replaced with today. The
     first version dropped an unparseable ?no= and asked for today instead, so
     somebody following a broken archive link would have played today's puzzle
     believing it was the one they asked for. That was fixed on the static path
     an hour earlier and written again here from the same instinct, which is
     why the check below covers both.

     The number in an address is the FAMILY's board number, counted from the
     family's day one and not from this game's epoch -- the two differ by
     nineteen. The page passes it through untouched and the server translates
     it via the day, which is the only thing the two schemes agree about. */
  /* THE PATH FIRST, BECAUSE THE PATH IS WHAT THE FAMILY GENERATES.
     permalinkPath() in functions/_lib/permalink.js builds every board address in
     this estate as /<theme>/<game>/daily/<key> — the sitemap, each archive index
     and the route itself all call it — and this loader read only
     location.search. So an archive permalink carried its number in a place
     nothing here looked at, found nothing, and asked for TODAY.
     The page then set the archived day's title, og:title and canonical
     correctly and rendered today's puzzle underneath: right heading, right
     canonical, wrong board. Nobody reports that, because it does not look
     broken — the only person who can tell is somebody who already knows what
     the 15th's board should be.
     AND A VALUE THAT IS PRESENT AND UNREADABLE IS REFUSED IN EITHER PLACE.
     Falling back to today is what made this invisible in the first place, so it
     must not be the recovery from a bad value either. Absent from BOTH is the
     only route to today. */
  var fromPath = /\/daily\/([^/?#]+)\/?$/.exec(location.pathname);
  var fromQuery = /[?&]no=([^&]*)/.exec(location.search);
  var raw = fromPath ? fromPath[1] : (fromQuery ? fromQuery[1] : null);
  if (raw !== null && !/^\d+$/.test(raw)) return Promise.reject(new Error("no such board"));
  var q = raw === null ? "" : "?no=" + raw;
  return fetch(API + "daily" + q, {cache: "no-cache"}).then(function(r){
    if (!r.ok) throw new Error("no board");
    return r.json();
  }).then(function(d){
    if (!d || !d.board) throw new Error("no board");
    return d.board;
  });
}

function loadToday(){
  return fetch(BOARD_SOURCE + "manifest.json", {cache: "no-cache"}).then(function(r){
    if (!r.ok) throw new Error("no manifest");
    var served = Date.parse(r.headers.get("date") || "");
    var ms = isFinite(served) ? served : Date.now();
    return r.json().then(function(man){
      var today = dayNumber(ms);
      var have = man.boards && man.boards.length
                 ? man.boards[man.boards.length - 1].no : 0;
      // Past the end of the queue, serve the last board rather than nothing: a
      // day with no game is worse than a day with yesterday's.
      if (today > have) today = have;
      if (today < 1) throw new Error("queue is empty");
      var n = wantedBoard(today);
      if (n === null) throw new Error("no such board");
      var id = ("000" + n).slice(-4);
      return fetch(BOARD_SOURCE + id + ".json", {cache: "no-cache"}).then(function(b){
        if (!b.ok) throw new Error("no board " + id);
        return b.json();
      });
    });
  });
}

function noBoard(why){
  /* Live, there is nothing to fall back TO. The page used to stamp board 1 in
     as a fallback so a failed fetch cost freshness rather than the game -- and
     that was right until the day the server became the only thing holding the
     answers. A stamped fallback in a sealed build is board 1's solution sitting
     in view-source for anyone who looks, which is the leak we closed in the
     folder arriving again in the page. So the live build carries no board, and
     a failure says so. */
  var el = document.getElementById("grid");
  if (el) {
    el.style.gridTemplateColumns = "1fr";
    el.innerHTML = '<div style="padding:26px 18px;text-align:center;color:var(--ink-soft)">'
      + "<b style=\"display:block;font-family:var(--disp);font-size:19px;letter-spacing:.06em;"
      + 'text-transform:uppercase;color:var(--ink)">No game today</b>'
      + "Today's board could not be reached. Try again in a minute."
      + "</div>";
  }
  if (window.console) console.warn("no board:", why);
}

if (!DAILY) {
  boot(null);
} else {
  (LIVE ? loadDaily() : loadToday()).then(boot).catch(function(e){
    noBoard(e);
  });
}
