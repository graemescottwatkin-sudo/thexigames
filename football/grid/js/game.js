/* game.js — Grid XI, the page.
 *
 * PORTED FROM gridxi-demo-v2.html, which the owner iterated nine times, with
 * one change that runs through all of it: THE PROTOTYPE HELD THE ANSWERS AND
 * THIS DOES NOT. There, mark() ran in the browser against a word it had; here
 * every guess is a POST and the response is painted. The prototype's own header
 * said this was coming — "in the real build they live in D1 and the marking is
 * a server call" — and it is the whole reason this game exists in the shape it
 * does: the grid starts EMPTY, so every letter in it is an answer.
 *
 * SO THERE IS NO OPTIMISTIC RENDER, and there must never be one. The spec names
 * it as the failure to design against and it is this project's oldest bug
 * shape: a value computed on the server and again in the client, drifting
 * apart. The word search shipped with the browser deciding what had been found
 * and its score meant nothing until that was undone. This file computes NO game
 * state. It holds a typing buffer and it paints what came back.
 *
 * WHAT IT DOES OWN, and the line is worth being exact about:
 *   - which entry is selected, and where the cursor is inside it
 *   - the letters typed but not yet submitted
 *   - the drawing of everything else
 * Turns, misses, which entries are solved, whether the board is over and the
 * score all arrive from /api/grid/guess and are never adjusted here.
 *
 * ONE RULE THE PROTOTYPE FOUND AND THIS KEEPS: confirmed cells are the single
 * source of truth for "known". The grid, the slot row, the keyboard and the
 * crossing logic all read S.confirmed. Nothing recomputes it, and the server is
 * the only writer.
 */
(function () {
  "use strict";

  var R = window.XIGR_RULES;
  var $ = function (id) { return document.getElementById(id); };
  var BUILD = "v002f";

  var S = {
    board: null,          // the PUBLIC board: shape, lengths, crossings. No letters.
    sel: 0,               // index into board.entries
    typed: [],            // the buffer for the selected entry
    marks: {},            // entry n -> the marks of its last guess
    hist: {},             // entry n -> [{ guess, marks }], newest first
    confirmed: {},        // "r,c" -> letter, SERVER-CONFIRMED only
    solved: {},           // entry n -> true
    turns: null, misses: 0, over: false, score: null,
    answers: null,        // arrives at full time, from the server, never before
    busy: false,
  };

  /* ---- talking to the server -------------------------------------------- */

  function api(path, body) {
    var opts = body ? {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-XI-Games": "1" },
      body: JSON.stringify(body),
    } : { headers: { Accept: "application/json" } };
    return fetch("/api/grid/" + path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (r.ok) return j;
        var e = new Error(j.error || String(r.status));
        e.status = r.status;
        throw e;
      });
    });
  }

  /* ---- the state the server sent ----------------------------------------- */

  /* THE ONLY WRITER OF GAME STATE. Every field here came out of a response;
     nothing is derived and nothing is adjusted. A second writer is how the two
     copies start to disagree, so there is one and it is this. */
  function applyServer(r) {
    if (typeof r.turns === "number") S.turns = r.turns;
    if (typeof r.misses === "number") S.misses = r.misses;
    if (typeof r.over === "boolean") S.over = r.over;
    if (r.score) S.score = r.score;
    if (r.solvedEntries) {
      S.solved = {};
      r.solvedEntries.forEach(function (n) { S.solved[n] = true; });
    }
    (r.confirms || []).forEach(function (c) { S.confirmed[c.cell] = c.letter; });
    /* AT FULL TIME AND NOT BEFORE. The server sends these only when the round
       it has been counting says the board is finished; the page cannot ask for
       them and does not try. */
    if (r.answers) {
      S.answers = {};
      r.answers.forEach(function (a) { S.answers[a.n] = a; });
    }
  }

  /* ---- the typing buffer, which IS the page's own ------------------------ */

  /* THE PLAY ID, WHICH IS WHAT MAKES A ROUND SCOREABLE. Anonymous, one per
     attempt, from shared/xi-plays.js — not a person and not an account. Null
     is an ordinary answer: with no play id the server marks the guess and
     scores nothing, which is the arrangement every game in the family keeps. */
  function playRef() {
    var c = window.XIPlays && window.XIPlays.current ? window.XIPlays.current() : null;
    return c && c.playId ? c.playId : null;
  }

  function entry() { return S.board ? S.board.entries[S.sel] : null; }

  function resetBuffer() {
    var e = entry();
    if (!e) { S.typed = []; return; }
    /* A cell the server has confirmed is filled in and stays filled: it was
       paid for once, in the entry it was proved in, and making the player type
       it again would be charging twice for it. */
    S.typed = e.cells.map(function (cell) { return S.confirmed[cell] || ""; });
  }

  function locked(i) {
    var e = entry();
    return !!(e && S.confirmed[e.cells[i]]);
  }

  /* The first cell that is neither confirmed nor typed. */
  function cursorAt() {
    for (var i = 0; i < S.typed.length; i++) {
      if (!S.typed[i]) return i;
    }
    return -1;
  }

  function typeLetter(ch) {
    if (S.over || S.busy) return;
    var e = entry();
    if (!e || S.solved[e.n]) return;
    var i = cursorAt();
    if (i < 0) return;
    S.typed[i] = ch;
    render();
  }

  function backspace() {
    if (S.over || S.busy) return;
    var i = cursorAt();
    var j = (i < 0 ? S.typed.length : i) - 1;
    /* Step back over confirmed cells rather than deleting them: they are the
       server's, not the buffer's. */
    while (j >= 0 && locked(j)) j--;
    if (j < 0) return;
    S.typed[j] = "";
    render();
  }

  /* ---- submitting -------------------------------------------------------- */

  function submit() {
    if (S.over || S.busy) return;
    var e = entry();
    if (!e) return;
    if (S.solved[e.n]) return msg("Already solved. Pick another entry.", true);
    if (S.typed.some(function (x) { return !x; })) {
      return msg("Fill all " + e.len + " letters first.", true);
    }
    var guess = S.typed.join("");
    S.busy = true;
    render();
    api("guess", {
      token: S.board.token,
      /* current() answers { playId, playNo }, not an id — this passed the whole
         object at first, which meant every guess arrived with no play id, the
         server had no round to hang turns off, and the page ran unscored while
         looking perfectly correct. The journey suite caught it because it plays
         a board and reads the turn count; nothing that only checked a guess
         came back marked would have. */
      playId: playRef(),
      n: e.n,
      guess: guess,
    }).then(function (r) {
      S.busy = false;
      applyServer(r);
      if (r.marks) {
        S.marks[e.n] = r.marks;
        S.hist[e.n] = [{ guess: guess, marks: r.marks }].concat(S.hist[e.n] || []);
      }
      if (r.correct) {
        msg(label(e) + " — " + guess + ".");
        /* Move to the first entry still open, the way the prototype does: the
           player has just finished a thought and the next one is where they
           are going anyway. */
        var next = S.board.entries.findIndex(function (x) { return !S.solved[x.n]; });
        if (next >= 0) S.sel = next;
      } else {
        msg("");
      }
      resetBuffer();
      if (S.over) fullTime();
      render();
    }).catch(function (err) {
      S.busy = false;
      msg(err && err.message ? err.message : "Could not reach the server.", true);
      render();
    });
  }

  function label(e) {
    return "Entry " + e.n + (e.dir === "across" ? " across" : " down");
  }

  function msg(text, warn) {
    var el = $("gdMsg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "gd-msg" + (warn ? " warn" : "");
  }

  /* ---- what this entry's own guesses have proved ------------------------- */

  /* PER ENTRY, NOT GLOBAL. A letter greyed out by one answer says nothing about
     a different word, and the prototype's v1 coloured the keyboard across the
     whole board — so a letter dead in SCHMEICHEL stayed dead while you were
     guessing BLOMQVIST. Green outranks amber outranks grey, which matters when
     one guess repeats a letter and only one copy lands. */
  function keyState(e) {
    var out = {}, rank = { correct: 3, present: 2, absent: 1 };
    var put = function (L, m) { if (!out[L] || rank[m] > rank[out[L]]) out[L] = m; };
    (S.hist[e.n] || []).forEach(function (x) {
      x.marks.forEach(function (m, i) { put(x.guess[i], m); });
    });
    /* A crossing may have proved a letter here without a guess being spent. */
    e.cells.forEach(function (cell) {
      if (S.confirmed[cell]) put(S.confirmed[cell], "correct");
    });
    return out;
  }

  var SHORT = { correct: "c", present: "p", absent: "a" };

  /* ---- drawing ----------------------------------------------------------- */

  function render() {
    if (!S.board) return;
    var b = S.board, e = entry();

    $("gdTitle").textContent = b.title;
    $("gdKicker").textContent = "TODAY · #" + (S.no || "");

    var left = Math.max(0, S.turns === null ? R.TURNS_START : S.turns);
    $("gdTurns").textContent = left;
    var bar = $("gdBar");
    /* Capped at full: a run of right answers carries the count above the start,
       and a bar overflowing its track reads as a rendering fault. */
    bar.firstElementChild.style.width = Math.min(100, 100 * left / R.TURNS_START) + "%";
    bar.className = "gd-bar" + (left <= 3 ? " low" : "");

    /* Which cell belongs to which entry, and which entry starts there — all of
       it from the PUBLIC board, which carries no letters. */
    var startsAt = {};
    b.entries.forEach(function (x) { startsAt[x.cells[0]] = x.n; });
    var inGrid = {};
    b.entries.forEach(function (x) {
      x.cells.forEach(function (cell) { inGrid[cell] = true; });
    });

    /* EVERY ENTRY'S LAST GUESS STAYS ON THE GRID. Selecting a different word
       changes what you can type into, not what you have already learned. A cell
       two entries have both guessed can carry two marks, so the more recent
       wins; confirmed beats both, because it is proved and they are only the
       latest thing tried. */
    var shown = {};
    b.entries.forEach(function (x, i) {
      var m = S.marks[x.n];
      if (!m) return;
      var g = S.hist[x.n][0].guess;
      x.cells.forEach(function (cell, j) {
        if (S.confirmed[cell]) return;
        if (!shown[cell] || (S.hist[x.n].length + i) >= (shown[cell].at || 0)) {
          shown[cell] = { m: m[j], ch: g[j], at: S.hist[x.n].length + i };
        }
      });
    });

    /* WHERE ONE WORD ENDS AND THE NEXT BEGINS.
       LEWISSKELLY is eleven letters and nothing on the grid said the name is
       Lewis-Skelly; the owner hit that on day one. The server sends `breaks` —
       zero-based letter offsets into the answer at which a new word starts — so
       the divider goes on the LEADING edge of the cell at that offset: the left
       edge for an across entry, the top edge for a down one.
       PER ENTRY, NOT PER CELL, because a cell can belong to two entries and a
       break in one says nothing about the other. A crossing cell can carry both
       classes, each drawn on the edge belonging to its own direction, so
       neither is wrong.
       DRAWN ON THE EMPTY GRID, not held back until letters appear. Showing it
       only once the answer is filled would put the hint after the moment it is
       needed: the owner wanted to know he was looking for two words WHILE
       guessing, which is the whole of the request. It is a real hint, and it is
       the one that was asked for. */
    var brk = {};
    b.entries.forEach(function (x) {
      (x.breaks || []).forEach(function (k) {
        var cell = x.cells[k];
        if (!cell) return;
        brk[cell] = (brk[cell] || "") + (x.dir === "down" ? " brk-t" : " brk-l");
      });
    });

    var selIdx = {};
    if (e) e.cells.forEach(function (cell, i) { selIdx[cell] = i; });
    var cur = cursorAt();

    var cs = Math.max(18, Math.min(34,
      Math.floor((Math.min(window.innerWidth, 760) - 40) / b.cols)));
    var bd = $("gdBoard");
    bd.style.setProperty("--cs", cs + "px");
    bd.style.gridTemplateColumns = "repeat(" + b.cols + "," + cs + "px)";

    var html = "";
    for (var r = 0; r < b.rows; r++) {
      for (var c = 0; c < b.cols; c++) {
        var cell = r + "," + c;
        if (!inGrid[cell]) { html += '<div class="gd-cell"></div>'; continue; }
        var cls = ["gd-cell", "on"], ch = "";
        if (brk[cell]) cls.push(brk[cell].trim());
        var inSel = cell in selIdx, i = selIdx[cell];

        if (S.confirmed[cell]) { cls.push("conf"); ch = S.confirmed[cell]; }
        else if (inSel && S.typed[i]) { cls.push("lane", "typed"); ch = S.typed[i]; }
        else if (shown[cell]) { cls.push(SHORT[shown[cell].m]); ch = shown[cell].ch; }
        else if (inSel) { cls.push("lane"); }
        /* AT FULL TIME THE BOARD FILLS IN, from the answers the SERVER sent
           when it said the round was over. Before that this branch has nothing
           to draw with, which is the point. */
        if (S.over && !ch && S.answers) {
          var owner = b.entries.find(function (x) { return x.cells.indexOf(cell) >= 0; });
          var a = owner && S.answers[owner.n];
          if (a) ch = a.answer[owner.cells.indexOf(cell)];
        }
        if (inSel && !S.over) {
          if (cls.indexOf("lane") === -1) cls.push("ring");
          if (i === cur) cls.push("cursor");
        }
        html += '<div class="' + cls.join(" ") + '" data-cell="' + cell + '" tabindex="0">' +
          (startsAt[cell] ? '<span class="n">' + startsAt[cell] + "</span>" : "") + ch + "</div>";
      }
    }
    bd.innerHTML = html;

    /* The slot row — the same state, bigger. */
    if (e) {
      $("gdSlotCap").textContent = label(e) + " · " + e.len + " letters";
      var m = S.marks[e.n];
      $("gdSlots").innerHTML = e.cells.map(function (cell, i) {
        var cls = ["gd-slot"], ch = "";
        if (m) { cls.push(SHORT[m[i]]); ch = S.hist[e.n][0].guess[i]; }
        else if (S.confirmed[cell]) { cls.push("conf"); ch = S.confirmed[cell]; }
        else if (S.typed[i]) { cls.push("typed"); ch = S.typed[i]; }
        else { cls.push("empty"); if (i === cur) cls.push("cursor"); }
        return '<span class="' + cls.join(" ") + '">' + ch + "</span>";
      }).join("");
    }

    $("gdEntries").innerHTML = b.entries.map(function (x, i) {
      return '<button class="gd-chip' + (i === S.sel ? " sel" : "") +
        (S.solved[x.n] ? " done" : "") + '" data-i="' + i + '">' +
        x.n + (x.dir === "across" ? "a" : "d") + " &middot; " + x.len + "</button>";
    }).join("");

    /* The keyboard for THIS entry. Derived from the history and the confirmed
       cells, never stored — the history is the fact and the colouring is a view
       of it, and storing both is how one value ends up in two places. */
    var ks = e ? keyState(e) : {};
    var dead = S.over || S.busy || (e && S.solved[e.n]);
    $("gdKbdCap").textContent = e ? "Letters — " + label(e).toLowerCase() + " only" : "Letters";
    var rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
    $("gdKbd").innerHTML = rows.map(function (row, ri) {
      var inner = row.split("").map(function (L) {
        return '<button class="gd-k ' + (SHORT[ks[L]] || "") + '" data-k="' + L + '"' +
          (dead ? " disabled" : "") + ">" + L + "</button>";
      }).join("");
      if (ri === 2) {
        inner = '<button class="gd-k wide" data-k="DEL"' + (dead ? " disabled" : "") + ">Del</button>" +
          inner +
          '<button class="gd-k wide go" data-k="GO"' + (dead ? " disabled" : "") + ">Guess</button>";
      }
      return '<div class="gd-krow">' + inner + "</div>";
    }).join("");

    var h = e ? (S.hist[e.n] || []) : [];
    $("gdHist").innerHTML = h.length > 1
      ? '<p class="gd-lbl">Earlier attempts here</p>' + h.slice(1).map(function (x) {
          return '<div class="g">' + x.guess.split("").map(function (ch2, i) {
            return '<b class="' + SHORT[x.marks[i]] + '">' + ch2 + "</b>";
          }).join("") + "</div>";
        }).join("")
      : "";
  }

  /* ---- full time --------------------------------------------------------- */


  /* ---- the durable record ----------------------------------------------
   *
   * WHAT A LAUNCHED GAME OWES THE FAMILY, and what this game did not have
   * until it launched on 7 September 2026: a list of the boards it has
   * finished, under its own prefix, that the hub can read and an account can
   * carry between devices. Without it the front door cannot say this game was
   * played today, and a player signed in on two devices has two records.
   *
   * A ROW IS UNIQUE BY BOARD NUMBER, not by date: the boards are numbered and
   * somebody can finish yesterday's today. Every other game keys the same way.
   *
   * THE MERGE RULE IS THE FAMILY'S, stated once here and kept the same in all
   * six: the first result banked wins, the account's row wins outright on
   * pull, and unpushed local rows survive. */
  var PREFIX = "xigd.";
  var RESULTS_KEY = PREFIX + "results";
  var account = null;

  function readResults() {
    try {
      var r = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
      return Array.isArray(r) ? r : [];
    } catch (e) { return []; }
  }

  function recordResult(rec) {
    try {
      /* Replaying a board you have already finished does not overwrite the
         run you set on it. */
      var all = readResults();
      if (all.some(function (r) { return r && r.no === rec.no; })) return;
      all.push(rec);
      localStorage.setItem(RESULTS_KEY, JSON.stringify(all.slice(-800)));
    } catch (e) {}
    pushResults();
  }

  /* The session cookie is scoped to the family, so a player signed in on
     another game is already signed in here. */
  function apiAuth(path, body) {
    var opts = {
      method: body ? "POST" : "GET",
      headers: { "X-XI-Games": "1" },     // the CSRF check on the server
      credentials: "same-origin",
    };
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }

  /* Logged and swallowed. A sync that cannot reach the server is not a
     signed-out player, and telling them so mid-board would be a lie they
     cannot act on. */
  function accountNote(what, e) {
    try { console.info("grid account " + what + ": " + (e && e.message)); } catch (x) {}
  }

  function pushResults() {
    if (!account) return Promise.resolve(null);
    return apiAuth("/api/account/migrate", { game: "grid", results: readResults() })
      .catch(function (e) { accountNote("push", e); return null; });
  }

  function pullResults() {
    if (!account) return Promise.resolve(null);
    return apiAuth("/api/account/results?game=grid").then(function (r) {
      var remote = (r && r.results) || [];
      if (!remote.length) return null;
      var byNo = {};
      readResults().forEach(function (x) { if (x && x.no != null) byNo[x.no] = x; });
      remote.forEach(function (x) { if (x && x.no != null) byNo[x.no] = x; });
      var merged = Object.keys(byNo).map(function (k) { return byNo[k]; })
        .sort(function (a, b) { return a.no - b.no; });
      try { localStorage.setItem(RESULTS_KEY, JSON.stringify(merged.slice(-800))); } catch (e) {}
      return merged;
    }).catch(function (e) { accountNote("pull", e); return null; });
  }

  /* THE CHROME OWNS THE IDENTITY. Its account sheet announces a sign-in, a
     sign-out or a rename on document as xi:account; this game answers by
     syncing its own results, which is the one part that is still its own. */
  document.addEventListener("xi:account", function (ev) {
    var d = ev.detail || {};
    if (d.type === "signout") { account = null; return; }
    syncAccount();
  });
  function syncAccount() {
    return apiAuth("/api/auth/session").then(function (r) {
      account = (r && r.user) || null;
      if (!account) return null;
      return pushResults().then(pullResults);
    }).catch(function (e) {
      /* A transient failure is NOT a sign-out. */
      accountNote("session", e);
      return null;
    });
  }

  function fullTime() {
    var el = $("gdFullTime");
    if (!el || !S.score) return;
    var rows = (S.board.entries || []).map(function (e) {
      var a = S.answers && S.answers[e.n];
      return "<tr><td>" + e.n + (e.dir === "across" ? "a" : "d") + "</td><td" +
        (S.solved[e.n] ? "" : ' class="miss"') + ">" + (a ? a.answer : "&mdash;") +
        "</td><td>" + (S.solved[e.n] ? "&#10003;" : "&mdash;") + "</td></tr>";
    }).join("");
    el.hidden = false;
    el.innerHTML = "<h2>Full time</h2>" +
      '<p class="score">' + S.score.total + "<small>/" + R.MAX_SCORE + "</small></p>" +
      "<p>" + S.score.solved + " of " + R.ENTRIES + " solved &middot; " +
      S.misses + (S.misses === 1 ? " miss" : " misses") + "</p>" +
      "<table>" + rows + "</table>" +
      '<div id="shareRow"></div>' +
      /* THE COMMUNITY LINE, WRITTEN INTO THE CARD RATHER THAN PLACED IN THE
         PAGE. Every other game has a static results card and puts an empty
         .xic-community in it; this one BUILDS its card from a string on every
         full time, so a box placed in index.html would be thrown away by the
         innerHTML above. The box is emitted here and filled below. */
      '<div class="xic-community"></div>';
    /* Filled after the write, because the element did not exist until now.
       XIChrome fills any empty .xic-community and is idempotent, so a second
       full time on the same page re-fills the fresh box rather than doubling
       the line. */
    if (window.XIChrome && window.XIChrome.community) window.XIChrome.community(el);
    /* THE FAMILY'S SHARE ROW, AND THIS GAME HAD NO SHARE AT ALL — not a row,
       not a copy button, not a line of text to send. Every other game offers
       one, so a player who had just finished a Grid had nothing to do with it.
       THE TEXT IS COMPOSED HERE because there was none to reuse, built to the
       shape the other games already use: the game and its board number, the
       score over the family's 114, and what it took. No answer and no letter
       of one — a share is read by people who have not played it yet.
       Mounted after the card is written, like the community line above and for
       the same reason: neither element exists until that innerHTML has run,
       and both are thrown away by the next one. */
    if (window.XIShare && $("shareRow")) {
      window.XIShare.mount($("shareRow"), {
        text: function () {
          return [
            "GRID XI",
            S.no != null ? "No. " + S.no : "Free play",
            "",
            S.score.total + "/" + R.MAX_SCORE,
            S.score.solved + "/" + R.ENTRIES + " solved",
            S.misses + (S.misses === 1 ? " miss" : " misses")
          ].join(String.fromCharCode(10));
        },
        url: function () { return location.href; }
      });
    }
    if (window.XIPlays && window.XIPlays.active) {
      if (window.XIPlays.active()) window.XIPlays.end(S.score.solved === R.ENTRIES);
    }
    /* THE RECORD, ONCE THE BOARD IS OVER. A board with no number cannot be
       part of a run, so it is not recorded — the same rule Scrambled keeps
       for its finals. */
    if (S.no != null) {
      recordResult({
        no: S.no,
        title: S.board && S.board.title,
        score: S.score.total,
        solved: S.score.solved,
        misses: S.misses,
        hints: S.hints ? Object.keys(S.hints).length : 0,
        at: Date.now(),
      });
    }
    el.scrollIntoView({ block: "nearest" });
  }

  /* ---- input ------------------------------------------------------------- */

  function wire() {
    $("gdKbd").addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest(".gd-k") : null;
      if (!b || b.disabled) return;
      var k = b.getAttribute("data-k");
      if (k === "GO") return submit();
      if (k === "DEL") return backspace();
      typeLetter(k);
    });
    $("gdEntries").addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest(".gd-chip") : null;
      if (!b) return;
      S.sel = Number(b.getAttribute("data-i"));
      resetBuffer();
      msg("");
      render();
    });
    $("gdBoard").addEventListener("click", function (ev) {
      var c = ev.target.closest ? ev.target.closest(".gd-cell.on") : null;
      if (!c) return;
      var cell = c.getAttribute("data-cell");
      /* Clicking a cell selects an entry that owns it. A crossing belongs to
         two, so a second click on the same cell moves to the other — which is
         how a player says "the down one" without hunting for its chip. */
      var owners = S.board.entries
        .map(function (x, i) { return x.cells.indexOf(cell) >= 0 ? i : -1; })
        .filter(function (i) { return i >= 0; });
      if (!owners.length) return;
      var at = owners.indexOf(S.sel);
      S.sel = owners[(at + 1) % owners.length];
      resetBuffer();
      render();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (/^[a-zA-Z]$/.test(ev.key)) { typeLetter(ev.key.toUpperCase()); ev.preventDefault(); }
      else if (ev.key === "Backspace") { backspace(); ev.preventDefault(); }
      else if (ev.key === "Enter") { submit(); ev.preventDefault(); }
    });
    window.addEventListener("resize", function () { if (S.board) render(); });
  }

  /* ---- boot -------------------------------------------------------------- */

  /* The result this device banked for the board now on screen, if any. */
  function bankedFor(no) {
    if (no == null) return null;
    var all = readResults();
    for (var i = 0; i < all.length; i++) {
      if (all[i] && Number(all[i].no) === Number(no)) return all[i];
    }
    return null;
  }

  /* THE FULL TIME CARD, REBUILT FROM THE RECORD. Deliberately not fullTime():
     that one draws the answer table out of S.answers, which the server sends
     at the whistle and nothing keeps, so on a fresh page it would print eleven
     dashes and call them the board. What can honestly be shown is what was
     banked, and it says plainly that the board is still there to replay. */
  function showBanked() {
    var rec = bankedFor(S.no);
    var el = $("gdFullTime");
    if (!rec || !el) return;
    el.hidden = false;
    el.innerHTML = "<h2>Full time</h2>" +
      '<p class="score">' + rec.score + "<small>/" + R.MAX_SCORE + "</small></p>" +
      "<p>" + rec.solved + " of " + R.ENTRIES + " solved &middot; " +
      rec.misses + (rec.misses === 1 ? " miss" : " misses") + "</p>" +
      "<p>You played this board. The grid below is still here if you want" +
      " another go — a replay is not recorded.</p>" +
      '<div class="xic-community"></div>';
    if (window.XIChrome && window.XIChrome.community) window.XIChrome.community(el);
  }

  function boot() {
    if (window.XIChrome && window.XIChrome.init) window.XIChrome.init({ game: "grid" });
    wire();
    api("daily").then(function (r) {
      if (!r.board) {
        msg("No board today. The calendar has a gap.", true);
        return;
      }
      S.board = r.board;
      S.no = r.no;
      S.turns = R.TURNS_START;
      resetBuffer();
      syncAccount();
      if (window.XIPlays && window.XIPlays.start) {
        /* boardKey and dailyNo are the field names xi-plays.js reads; `key`
           was invented here and would have been dropped in silence. */
        window.XIPlays.start({
          game: "grid", mode: "daily",
          boardKey: "gd:" + r.no, dailyNo: r.no, total: R.ENTRIES,
        });
      }
      /* ---- A FINISHED BOARD STAYS FINISHED ---------------------------
       * Grid banks its result in xigd.results and NOTHING ON BOOT EVER READ
       * IT. Come back to a board you finished and you got an empty grid, a
       * full turn budget and no sign you had played it — the same fault
       * Codeword had, found the same day.
       * WHAT COMES BACK IS THE RECORD, NOT THE ROUND. The letters and the
       * server's answer list are not stored anywhere, and this does not
       * invent them: the card shows the score, the solved count and the
       * misses that were banked, which is what "I finished this" means. The
       * board underneath is left alone — replaying is still allowed, and the
       * server decides on its own whether a replay is scored. */
      showBanked();
      render();
    }).catch(function () {
      msg("Could not reach the server — check your connection.", true);
    });
  }

  /* A seam for the suites, and nothing else. The board and the state, readable;
     no second way to play, and nothing here can mark a guess — the page holds
     no answer to mark against. */
  window.__grid = {
    build: BUILD,
    state: function () { return S; },
    type: typeLetter, del: backspace, submit: submit,
    pick: function (i) { S.sel = i; resetBuffer(); render(); },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();
