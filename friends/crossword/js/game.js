/* friends/crossword/js/game.js — the Friends crossword.
 *
 * THIS IS NOT THE FOOTBALL CROSSWORD'S game.js AND MUST NOT BECOME A COPY OF
 * IT. That file is 7,795 lines because it carries match-minute scoring, a
 * league table, seasons, badges, form strips and a challenge mode — none of
 * which this game has. The owner's ruling for Friends is a score out of 100 and
 * a genuine streak of +1 a day, with no season. Forking 469K to delete most of
 * it would have created the one failure this project keeps tracing every major
 * bug back to: the same value stored twice, drifting.
 *
 * WHAT IS SHARED IS SHARED PROPERLY, through /shared: the chrome, the
 * on-screen keyboard, sharing, and the play ping. What is this game's own is
 * here.
 *
 * THE BOARD RENDERER IS THE ONE REAL OVERLAP WITH FOOTBALL'S, AND IT STAYS
 * SEPARATE — owner's ruling, 20 September 2026, asked and answered directly.
 * So this is a decision, not a thing nobody got round to: do not "fix" it by
 * extracting it into /shared, and do not fix it the other way either by copying
 * football's 785 stylesheet rules over to make the two identical. The frame IS
 * already shared and identical — palette, chrome, fonts, keyboard, dark mode,
 * all from /shared — and what differs is the grid, the clue card and the
 * full-time panel, which this game draws in 36 rules of its own from the same
 * tokens. Reopen it only if the owner does.
 *
 * THE PAGE NEVER KNOWS AN ANSWER. /api/crossword_fr/daily sends the shape and
 * the clues through publicPuzzle(), which cannot carry a letter, and
 * /api/crossword_fr/check marks an entry at a time and sends back a boolean.
 * So there is nothing here to read out of the source, nothing in localStorage,
 * and nothing in the DOM. That is a property of the endpoints rather than of
 * this file's good behaviour, which is the only kind worth having.
 */
(function () {
  "use strict";

  /* THE ENGINE'S DIRECTIONS ARE "A" AND "D", not "across" and "down" —
     engine.js line 221, and football's own client uses the same two letters.
     This file started with the long words, and the bug they caused is worth
     recording because it LOOKED like it worked: the first render sets `dir`
     from the entry the cursor lands on, so the board came up correctly lit and
     with the right clue. The first TAP toggled `dir` to "down", which matches
     no entry in the board, and from that moment currentEntry() returned null —
     nothing lit, the clue card showing a dash, and typing silently ignored.
     A default taken from real data hid a constant that was wrong. */
  var ACROSS = "A", DOWN = "D";

  var BUILD = "v001a";                 // the gate compares this with the page's ?v=
  var P = "xifc.";                     // this game's own corner of localStorage
  var GAME = "crossword_fr";
  var API = "/api/" + GAME + "/";

  var board = null;                    // what the server sent
  var filled = {};                     // cellKey -> letter the player typed
  var marks = {};                      // entry id -> true/false, once checked
  var cursor = null;                   // cellKey
  var dir = ACROSS;
  var boardNo = null;
  var finished = false;

  var $ = function (id) { return document.getElementById(id); };

  /* ---- storage ---------------------------------------------------------- */

  /* EVERY KEY UNDER THIS GAME'S OWN PREFIX. Reading another game's is fine and
     is how the hub knows what was played today; writing one is not. */
  function save() {
    try {
      localStorage.setItem(P + "board." + boardNo, JSON.stringify({
        filled: filled, marks: marks, finished: finished,
      }));
    } catch (e) { /* a full or blocked store is not a reason to stop playing */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(P + "board." + boardNo);
      if (!raw) return;
      var v = JSON.parse(raw);
      filled = (v && v.filled) || {};
      marks = (v && v.marks) || {};
      finished = !!(v && v.finished);
    } catch (e) { filled = {}; marks = {}; finished = false; }
  }

  /* THE STREAK IS DAYS, AND THE SERVER SAYS WHAT DAY IT IS. A page that worked
     out the date from Date.now() would disagree with the server across UTC
     midnight and all evening on any machine ahead of UTC, and the disagreement
     reads to a player as a lost streak. The day comes from the response. */
  function keepDay(day) {
    if (!day) return;
    try {
      var last = localStorage.getItem(P + "streak.day");
      if (last === day) return;                       // already counted today
      var n = Number(localStorage.getItem(P + "streak.n")) || 0;
      var before = new Date(Date.parse(day + "T00:00:00Z") - 86400000)
        .toISOString().slice(0, 10);
      localStorage.setItem(P + "streak.n", String(last === before ? n + 1 : 1));
      localStorage.setItem(P + "streak.day", day);
    } catch (e) { /* see save() */ }
  }
  function streak() {
    try { return Number(localStorage.getItem(P + "streak.n")) || 0; } catch (e) { return 0; }
  }

  /* ---- the grid --------------------------------------------------------- */

  var xy = function (k) { var p = String(k).split(","); return [Number(p[0]), Number(p[1])]; };

  /* AN ENTRY'S CELLS ARE { x, y } OBJECTS; THE CELL MAP IS KEYED "x,y".
     Indexing the map with the object yields undefined rather than throwing, so
     every lookup silently returns nothing and the board simply never lights up.
     The server side of this line is functions/_lib/puzzle.js cellKey, which
     carries the full story; this is the same rule for the browser, which cannot
     import it. keysOf is memoised onto the entry so the conversion happens once
     per board rather than once per keystroke per cell. */
  var ck = function (c) {
    return c && typeof c === "object" ? c.x + "," + c.y : String(c);
  };
  function keysOf(e) {
    if (!e._keys) e._keys = (e.cells || []).map(ck);
    return e._keys;
  }

  function entryAt(key, want) {
    if (!board) return null;
    for (var i = 0; i < board.entries.length; i++) {
      var e = board.entries[i];
      if (e.dir === want && keysOf(e).indexOf(key) > -1) return e;
    }
    return null;
  }
  function currentEntry() {
    return cursor
      ? (entryAt(cursor, dir) || entryAt(cursor, dir === ACROSS ? DOWN : ACROSS))
      : null;
  }

  function render() {
    var wrap = $("fxBoard");
    if (!wrap || !board) return;
    wrap.style.setProperty("--cols", board.width);
    wrap.style.setProperty("--rows", board.height);
    wrap.innerHTML = "";

    var entry = currentEntry();
    var lit = entry ? keysOf(entry) : [];

    for (var y = 0; y < board.height; y++) {
      for (var x = 0; x < board.width; x++) {
        var k = x + "," + y;
        var c = board.cells[k];
        var d = document.createElement("div");
        if (!c) { d.className = "fx-cell fx-block"; wrap.appendChild(d); continue; }

        d.className = "fx-cell" +
          (lit.indexOf(k) > -1 ? " fx-lit" : "") +
          (k === cursor ? " fx-cursor" : "");
        d.setAttribute("data-k", k);
        d.setAttribute("role", "gridcell");

        if (c.num) {
          var n = document.createElement("span");
          n.className = "fx-num";
          n.textContent = c.num;
          d.appendChild(n);
        }
        var ch = document.createElement("span");
        ch.className = "fx-ch";
        ch.textContent = filled[k] || "";
        d.appendChild(ch);

        /* A MARK IS PER ENTRY, because that is all the server reports. A cell
           in a checked entry wears its entry's verdict. */
        var a = entryAt(k, ACROSS), dn = entryAt(k, DOWN);
        var ids = [a && a.row.id, dn && dn.row.id].filter(Boolean);
        var anyRight = ids.some(function (id) { return marks[id] === true; });
        var anyWrong = ids.some(function (id) { return marks[id] === false; });
        if (anyRight) d.className += " fx-right";
        else if (anyWrong) d.className += " fx-wrong";

        wrap.appendChild(d);
      }
    }
    paintClue();
  }

  function paintClue() {
    var e = currentEntry();
    var ref = $("fxClueRef"), text = $("fxClueText");
    if (!ref || !text) return;
    if (!e) { ref.textContent = "—"; text.textContent = "—"; return; }
    /* The engine's letter is not what a player reads. */
    ref.textContent = e.num + " " + (e.dir === DOWN ? "down" : "across") +
      "  " + (e.row.enum || "");
    text.textContent = e.row.clue || "";
  }

  /* ---- moving around ---------------------------------------------------- */

  function step(by) {
    var e = currentEntry();
    if (!e) return;
    var keys = keysOf(e);
    var i = keys.indexOf(cursor);
    var next = i + by;
    if (next >= 0 && next < keys.length) cursor = keys[next];
  }

  function walkEntry(by) {
    if (!board) return;
    var list = board.entries;
    var e = currentEntry();
    var i = e ? list.indexOf(e) : -1;
    var n = list[(i + by + list.length) % list.length];
    if (!n) return;
    cursor = keysOf(n)[0];
    dir = n.dir;
    render();
  }

  function type(ch) {
    if (!cursor || finished) return;
    filled[cursor] = ch;
    step(1);
    save();
    render();
    maybeCheck();
  }
  function back() {
    if (!cursor || finished) return;
    if (filled[cursor]) delete filled[cursor];
    else { step(-1); delete filled[cursor]; }
    save();
    render();
  }

  /* ---- marking ---------------------------------------------------------- */

  var full = function () {
    if (!board) return false;
    return board.entries.every(function (e) {
      return keysOf(e).every(function (k) { return !!filled[k]; });
    });
  };

  /* CHECKED WHEN THE GRID IS FULL, not on every letter. The endpoint is the
     only side with the answers, so each call is a disclosure; asking once the
     player has committed to a whole grid is the same bargain the football
     crossword strikes, and it keeps this from being a letter-by-letter oracle. */
  function maybeCheck() {
    if (finished || !full()) return;
    fetch(API + "check", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-XI-Games": "1" },
      body: JSON.stringify({ no: boardNo, filled: filled, revealed: [] }),
    }).then(function (r) { return r.json(); }).then(function (v) {
      if (!v || !v.entries) return;
      v.entries.forEach(function (e) { marks[e.id] = !!e.correct; });
      if (v.kept) {
        finished = true;
        keepDay(board && board.day);
        if (window.XIPlays) XIPlays.end(true);
      }
      save();
      render();
      fullTime(v);
    }).catch(function () { /* a failed check is not a failed game */ });
  }

  function fullTime(v) {
    var ft = $("fxFullTime");
    if (!ft || !v) return;
    if (!v.kept) {
      ft.hidden = false;
      ft.innerHTML = "<p class='fx-ft-line'>" +
        v.correct + " of " + v.entries.length + " right. Keep going.</p>";
      return;
    }
    ft.hidden = false;
    ft.innerHTML =
      "<p class='fx-ft-score'>" + v.score + "<span>/100</span></p>" +
      "<p class='fx-ft-line'>Solved. Streak: " + streak() + "</p>";
  }

  /* ---- input ------------------------------------------------------------ */

  function wire() {
    var wrap = $("fxBoard");
    if (wrap) {
      wrap.addEventListener("pointerdown", function (ev) {
        var cell = ev.target.closest ? ev.target.closest("[data-k]") : null;
        if (!cell) return;
        ev.preventDefault();
        var k = cell.getAttribute("data-k");
        /* Tapping the cell you are already on switches direction, which is the
           convention every crossword on a phone uses. */
        if (k === cursor) dir = dir === ACROSS ? DOWN : ACROSS;
        cursor = k;
        render();
      });
    }

    document.addEventListener("keydown", function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (/^[a-zA-Z]$/.test(ev.key)) { ev.preventDefault(); type(ev.key.toUpperCase()); return; }
      if (ev.key === "Backspace") { ev.preventDefault(); back(); return; }
      if (ev.key === "Tab") { ev.preventDefault(); walkEntry(ev.shiftKey ? -1 : 1); return; }
      if (ev.key === " ") {
        ev.preventDefault(); dir = dir === ACROSS ? DOWN : ACROSS; render(); return;
      }
      var move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
      if (move && cursor) {
        ev.preventDefault();
        var p = xy(cursor);
        var k = (p[0] + move[0]) + "," + (p[1] + move[1]);
        if (board.cells[k]) { cursor = k; dir = move[0] ? ACROSS : DOWN; render(); }
      }
    });

    var prev = $("fxPrev"), next = $("fxNext");
    if (prev) prev.addEventListener("click", function () { walkEntry(-1); });
    if (next) next.addEventListener("click", function () { walkEntry(1); });

    if (window.XIKeys) {
      XIKeys.markTouch();
      XIKeys.build($("fxKeys"), { letter: type, back: back });
    }
  }

  /* ---- start ------------------------------------------------------------ */

  /* WHICH BOARD, from the URL rather than from a date worked out here. A
     permalink is /friends/crossword/daily/N; anything else is today, and what
     today means is the server's answer. */
  function askedNo() {
    var m = /\/daily\/(\d+)\b/.exec(location.pathname);
    if (m) return Number(m[1]);
    var q = new URLSearchParams(location.search).get("no");
    return q && /^\d+$/.test(q) ? Number(q) : null;
  }

  function hideBoardFurniture() {
    ["fxBoard", "fxClueCard", "fxKeys"].forEach(function (id) {
      var el = $(id);
      if (el) el.hidden = true;
    });
    var wrap = document.querySelector(".fx-boardwrap");
    if (wrap) wrap.hidden = true;
  }

  function begin() {
    var no = askedNo();
    fetch(API + "daily" + (no ? "?no=" + no : ""), { headers: { "X-XI-Games": "1" } })
      .then(function (r) { return r.json(); })
      .then(function (v) {
        var kicker = $("fxKicker"), sub = $("fxSub");
        if (!v || !v.board) {
          if (kicker) kicker.textContent = "—";
          if (sub) {
            sub.textContent = v && v.launched === false
              ? "This one is not out yet."
              : "There is no board for today.";
          }
          /* AND NOTHING THAT NEEDS A BOARD IS LEFT ON SCREEN. Found by looking
             at the page rather than by reading it: with no board the grid still
             drew its border and its background, so a gap day showed a large
             empty grey square above a clue card reading "—". An empty frame
             reads as a broken game, where a sentence reads as a day off. */
          hideBoardFurniture();
          return;
        }
        board = v.board;
        board.day = v.day;
        boardNo = v.no;
        if (kicker) kicker.textContent = v.no === v.today ? "TODAY" : "No. " + v.no;
        load();
        cursor = board.entries[0] ? keysOf(board.entries[0])[0] : null;
        dir = board.entries[0] ? board.entries[0].dir : ACROSS;
        render();
        if (window.XIPlays && !finished) {
          XIPlays.start({
            game: GAME, mode: "daily", dailyNo: v.no,
            boardKey: "daily:" + v.no, total: board.entries.length,
          }, function () {
            return board.entries.filter(function (e) {
              return keysOf(e).every(function (k) { return !!filled[k]; });
            }).length;
          });
        }
      })
      .catch(function () {
        /* THE SAME TIDY-UP AS THE NO-BOARD BRANCH, and it needed saying twice
           because the two are reached differently: a board-less day comes back
           as valid JSON, while an endpoint that fails returns a body that is
           not JSON at all, so r.json() throws and lands HERE without the branch
           above ever running. Looking at the page is what found it — the first
           fix was made, the bytes were confirmed fresh, and the empty grey
           square was still on screen. */
        var sub = $("fxSub");
        if (sub) sub.textContent = "Could not load today's crossword.";
        hideBoardFurniture();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { wire(); begin(); });
  } else { wire(); begin(); }
})();
