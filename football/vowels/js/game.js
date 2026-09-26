/* Vowels XI — game.js
 *
 * The browser holds no names. It holds scrambles, positions and whatever the
 * server has told it, and every guess goes up to be marked. That is not
 * security theatre — the scramble IS the letters, so an anagram solver beats
 * this board however it is served — it is what stops the whole XI, its aliases
 * and its hint values riding down in the payload for free.
 *
 * WHAT IS DELIBERATELY NOT HERE (v001, first build on the monorepo):
 *   - no accounts, no challenges, no leaderboard. All three port from
 *     Crossword XI largely unchanged once the game is worth sharing.
 *   - no server-trusted score. There is no play row, so the number on the Full
 *     Time card is assembled here and the card says so. "Unverified" is the
 *     truth rather than a number that looks authoritative and is not.
 *   - no practice. There is now an archive picker and a finals catalogue; what
 *     is still missing is a practice mode, which this game may never want.
 */
var BUILD = "v001z";

(function () {
  "use strict";

  var CFG = window.SCX_CONFIG;
  var SCORING = window.SCX_SCORING;

  /* This game's localStorage namespace. Distinct per game or two games sharing
     a browser overwrite each other's saves. Family-wide facts (the theme) live
     under "xi." and belong to the chrome, not here. */
  var PREFIX = "xivw.";

  var $ = function (id) { return document.getElementById(id); };

  /* Wiring a control that is not on the page must not take the page down with
     it — the same helper, and the same reasoning, as the crossword's. */
  function on(id, evt, fn) {
    var el = $(id);
    if (!el) { console.warn("Missing element: " + id); return; }
    el.addEventListener(evt, fn);
  }

  var state = {
    board: null,
    solved: {},        // slotId -> { name, how: "solved" | "revealed" }
    hints: {},         // slotId -> the hint value, once bought or given
    letters: {},       // slotId -> string of leading letters revealed
    /* slotId -> { position in the name: the vowel there }. A DIFFERENT SHAPE
       FROM letters, on purpose. The anagram's revealed letters come off the
       front in order, so a string says everything. A consonant board's blanks
       are scattered through the name and the server answers with the index it
       filled, so the position is half the fact. */
    vowels: {},
    help: 0,           // points spent off the bench
    startedAt: null,
    elapsed: 0,
    picked: null,
    /* WHICH TILE'S CAREER IS ON SCREEN — and deliberately NOT `picked`.
       Eleven career lines drawn at once is the whole board shouting, so the
       career is available on every tile and drawn on one. The obvious way to
       do that is to gate the line on `picked`, and it renders nothing ever:
       pick() returns early when state.over is true, so no tile is selectable
       on the reveal at all, and it nulls picked for a solved tile on purpose,
       because a solved tile has nothing left to sell.
       `picked` means "what can I buy" and the bench is built on it —
       syncBench early-returns on null. Coupling "what am I reading" to "what
       can I buy" is how the enabled-but-inert bench button shipped the first
       time, which journey_test caught. Two facts, two fields. */
    reading: null,
    teamTalkDone: false,
    /* WHETHER THE CAREERS HAVE BEEN REVEALED, as one fact rather than as
       eleven. Derived from state.hints it would be wrong: a slot whose player
       has no career on file never gets an entry, so "every slot has a hint"
       is false on a board that has already given up everything it has — and
       the player would be charged a second time for nothing. */
    hintsRevealed: false,
    over: false
  };

  /* ---- the landing ---------------------------------------------------- */

  /* FORM, drawn by the shared chrome so a win looks the same in every game.
     This game owns what a RESULT is — a numbered board, like the crossword —
     and hands over only the scores. A run is consecutive BOARD NUMBERS ending
     at today's or yesterday's: finishing an old board today does not revive a
     streak, which is the rule the other two already keep. */
  function renderForm() {
    var el = $("homeRun"), title = $("homeRunTitle");
    if (!el || !window.XIChrome) return;
    var done = readResults().filter(function (r) { return r && typeof r.no === "number"; })
      .sort(function (a, b) { return a.no - b.no; });
    if (!done.length) {
      title.textContent = "No run yet";
      el.innerHTML = window.XIChrome.formChips([]) +
        '<span class="run-none">Play today to start one.</span>';
      return;
    }
    var nos = done.map(function (r) { return r.no; });
    var today = state.todayNo || nos[nos.length - 1];
    var run = 0;
    if (nos[nos.length - 1] >= today - 1) {
      run = 1;
      for (var i = nos.length - 1; i > 0; i--) {
        if (nos[i - 1] === nos[i] - 1) run++; else break;
      }
    }
    var best = 1, walk = 1;
    for (var k = 1; k < nos.length; k++) {
      walk = nos[k - 1] === nos[k] - 1 ? walk + 1 : 1;
      if (walk > best) best = walk;
    }
    title.textContent = run + " day run";
    el.innerHTML = window.XIChrome.formChips(
      done.map(function (r) { return r.score; })) +
      '<span class="run-best">best ' + best + "</span>";
  }

  /* PLAY AS, from the family's club list rather than a copy of it. Stored
     under xi. because the club is the player, not the game. */
  function fillClubs() {
    var sel = $("homeClubSelect");
    if (!sel || !window.XI_CLUBS) return;
    var chosen = "";
    try { chosen = localStorage.getItem("xi.club") || ""; } catch (e) {}
    sel.innerHTML = '<option value="">Random club</option>';
    window.XI_CLUBS.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
    sel.value = chosen;
    sel.onchange = function () {
      try { localStorage.setItem("xi.club", sel.value); } catch (e) {}
    };
  }

  /* THE BOARD OF THE WEEK, picked by the week rather than chosen by anyone:
     derived from the ISO week so everyone sees the same one and it turns over
     on Monday with nothing scheduled and nothing stored. Drawn only from
     boards already released, so it can never name a future XI. */
  function renderLanding() {
    var today = state.todayNo || 0;
    if (today > 0) {
      var utc = dateForNo(today).getTime();
      var pick = (Math.floor(utc / 604800000) % today) + 1;
      $("homeFeaturedName").textContent = "Board #" + pick;
      $("homeFeaturedState").textContent = "One of " + today + " released";
      /* ONE NAMED BOARD, SO THE CLICK IS THE ANSWER. This reloaded the page at
         the board's permalink, which opened its start card and asked to be
         clicked again — the same two steps as the daily, for a card that has
         already made the choice. It opens and kicks off. */
      $("homeFeatured").onclick = function () {
        openBoard({ kind: "daily", no: pick }, { play: true });
      };
      $("homePreviousCount").textContent = today + " boards so far";
    }
    renderForm();
    fillClubs();
    nameTodaysAction();
  }

  /* THE HERO BUTTON NAMES WHAT IT DOES. It said "Kick off" whatever the state:
     on a board already finished, where it opens the result, and on a
     part-played one, where it returns you to a running clock.

     This game could not be wired from its status line the way the crossword
     and HiLo are — hc-state here describes the CLOCK ("Ninety minutes in five
     of real time"), which says nothing about progress — so it is read from the
     save, which is the thing that actually knows. A board with no save is new;
     one whose save is over has been played; anything else is in progress. */
  function nameTodaysAction() {
    var cta = document.querySelector("#homeDaily .hc-cta");
    if (!cta) return;
    var saved = null;
    try { saved = load(); } catch (e) { saved = null; }
    cta.textContent = !saved ? "Kick off"
      : saved.over ? "View result"
      : "Resume";
  }

  /* ---- previous boards, as a calendar -----------------------------------

     This card opened yesterday's board. That is not an archive, it is one
     board with a plural label: everything before yesterday was unreachable
     and nothing said which days had been played. The crossword answered this
     with a month grid and the same answer belongs here.

     THE DATES ARE DERIVED, NOT STORED A SECOND TIME. Board #N ran (M - N)
     days before board #M, and the server said which day #M was — so there is
     no epoch written down here to drift from the one the server keeps. UTC
     throughout, because the server decides what day it is.

     COUNTED FROM THE SERVER'S DAY, NOT THE DEVICE'S. This counted back from
     the device's own UTC date, which is a second clock that has to agree with
     the server's: a phone set wrong, or a tab left open past UTC midnight
     (one in the morning in a British summer), slid every board onto the day
     beside its own. calendar_test sets the two clocks apart. The device's
     date is left only for a board that came with no day at all. */
  var DAY_MS = 86400000;
  var calMonth = null;   // {y, m} of the month on screen, in UTC
  var dayAnchor = null;  // {no, ms}: a board the server served, and its day

  function todayUTC() {
    var n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  }
  function anchor() { return dayAnchor || { no: state.todayNo || 0, ms: todayUTC() }; }
  function dateForNo(no) { var a = anchor(); return new Date(a.ms + (no - a.no) * DAY_MS); }
  function noForDate(ms) { var a = anchor(); return a.no + Math.round((ms - a.ms) / DAY_MS); }

  /* WHICH DAYS ARE BEHIND THE LOCK. The window comes down with the board —
     the server owns the rule and the page only draws it — and a signed-in
     player has no locked days at all. Defaults to open when the page has not
     been told: drawing padlocks over a rule the page has not heard of would
     be inventing one. */
  function freeDays() {
    var n = state.board && state.board.freeArchiveDays;
    return typeof n === "number" ? n : null;
  }
  function signedIn() {
    return !!(window.XIChrome && window.XIChrome.account &&
      window.XIChrome.account.user());
  }
  function locked(no) {
    var free = freeDays();
    if (free === null || signedIn()) return false;
    /* Accounts have to be on offer for a lock to mean anything, which is the
       same condition the server keeps. The chrome knows: it hides Sign in
       when there is nowhere to sign in to. */
    if (window.XIChrome && window.XIChrome.account &&
        window.XIChrome.account.available && !window.XIChrome.account.available()) return false;
    return (state.todayNo || 0) - no > free;
  }

  function openArchive() {
    calMonth = null;
    renderCalendar();
    $("archiveSheet").classList.add("show");
  }
  function closeArchive() { $("archiveSheet").classList.remove("show"); }

  function stepCalendar(by) {
    var d = calMonth || monthOf(dateForNo(state.todayNo || 1));
    var n = new Date(Date.UTC(d.y, d.m + by, 1));
    calMonth = { y: n.getUTCFullYear(), m: n.getUTCMonth() };
    renderCalendar();
  }
  function monthOf(d) { return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; }

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  function renderCalendar() {
    var grid = $("calGrid");
    if (!grid) return;
    var today = state.todayNo || 0;
    var first = calMonth || monthOf(dateForNo(today || 1));
    calMonth = first;

    var played = {};
    readResults().forEach(function (r) {
      if (r && typeof r.no === "number") played[r.no] = r;
    });

    $("calMonth").textContent = MONTHS[first.m] + " " + first.y;

    /* Monday first: this is a football game and the week starts on Monday
       everywhere it is played. getUTCDay() puts Sunday at 0, hence the shift. */
    var firstMs = Date.UTC(first.y, first.m, 1);
    var lead = (new Date(firstMs).getUTCDay() + 6) % 7;
    var days = new Date(Date.UTC(first.y, first.m + 1, 0)).getUTCDate();

    var out = [], i;
    for (i = 0; i < lead; i++) out.push('<div class="xic-cal-cell empty"></div>');
    for (i = 1; i <= days; i++) {
      var no = noForDate(Date.UTC(first.y, first.m, i));
      var cls = "xic-cal-cell", body = "";
      if (no < 1 || no > today) {
        cls += " none";
      } else if (played[no]) {
        cls += " done";
        /* On its own line under the date: rendered inline, "24" with a score
           of 97 read as "2497". */
        body = '<b class="xic-cal-score">' +
          (played[no].score != null ? played[no].score : "✓") + "</b>";
      } else if (no === today) {
        /* Today is the hero on the landing screen, not something missed — the
           day is not over. Marked so it can be seen and tapped. */
        cls += " today open";
      } else if (locked(no)) {
        /* Beyond the free window and nobody signed in. Shown rather than
           hidden: what is behind the lock is the reason to register, and a
           day that simply vanished would say nothing at all. */
        cls += " locked";
      } else {
        cls += " open";
      }
      out.push('<button type="button" class="' + cls + '" data-no="' +
        (no >= 1 && no <= today ? no : "") + '"><span>' + i + "</span>" + body + "</button>");
    }
    grid.innerHTML = out.join("");

    /* Never past the month today falls in, and never before the first board:
       an arrow that does nothing is worse than one that is plainly off. */
    var thisMonth = monthOf(dateForNo(today || 1));
    var firstEver = monthOf(dateForNo(1));
    $("calNext").disabled = first.y > thisMonth.y ||
      (first.y === thisMonth.y && first.m >= thisMonth.m);
    $("calPrev").disabled = first.y < firstEver.y ||
      (first.y === firstEver.y && first.m <= firstEver.m);

    var left = 0;
    for (i = today - 1; i >= 1; i--) if (!played[i]) left++;
    $("archiveSub").textContent = left === 0
      ? "You have played every board so far."
      : left + (left === 1 ? " board" : " boards") + " left to play";
  }

  /* Delegated: the grid is rebuilt on every render, so a handler per cell
     would have to be rebound each time. */
  on("calGrid", "click", function (ev) {
    var cell = ev.target.closest ? ev.target.closest(".xic-cal-cell") : null;
    if (!cell || cell.classList.contains("none") || cell.classList.contains("empty")) return;
    var no = Number(cell.getAttribute("data-no"));
    if (!no) return;
    /* A locked day is asked for, not fetched. The server would refuse it
       anyway; asking here means the answer arrives without a round trip and
       without the page having to unpick a refusal. */
    if (cell.classList.contains("locked")) {
      closeArchive();
      if (window.XIChrome && window.XIChrome.archive) {
        window.XIChrome.archive.askToRegister(
          "The last " + freeDays() + " days are free for everyone. " +
          "Sign in to play the whole archive.");
      }
      return;
    }
    closeArchive();
    /* STRAIGHT INTO THE BOARD. Picking a date out of the calendar IS the
       choice — it opened the start card instead and asked to be clicked a
       second time, which put the landing hero's content on a board nobody had
       arrived at that way. The crossword has always opened what you picked,
       and "Board of the week" already did it here; the calendar and the finals
       were the two that did not. `play` is openBoard's own option: it kicks
       off rather than showing the start screen. */
    openBoard({ kind: "daily", no: no }, { play: true });
  });

  /* ---- the finals ------------------------------------------------------

     Five hundred and forty-three boards — every cup and play-off final in the
     bank, both XIs of each — have been in the database since the import with
     no way to reach them, because the daily token names a position in a ring
     these boards are deliberately outside. The card said "Soon" and the note
     beside it said they were "not yet imported", which stopped being true a
     long time before anybody noticed.

     Fetched once and kept: it is one list of five fields, and re-fetching it
     every time the sheet opens would be a request per browse. */
  var finals = null;
  var finalsFilter = "";

  function openFinals() {
    $("finalsSheet").classList.add("show");
    var box = $("finalsInput");
    if (box) box.focus({ preventScroll: true });
    if (finals) { renderFinals(); return; }
    $("finalsList").innerHTML = '<div class="xic-panel-empty">Reading the list…</div>';
    fetch("/api/scrambled/iconic", {
      headers: { "X-XI-Games": "1" }, credentials: "same-origin"
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        finals = (d && d.boards) || [];
        renderFinals();
      })
      .catch(function () {
        $("finalsList").innerHTML =
          '<div class="xic-panel-empty">Could not reach the list. Try again in a moment.</div>';
      });
  }
  function closeFinals() { $("finalsSheet").classList.remove("show"); }

  /* Matched on everything a row shows, so what is on screen is what is being
     searched: "1999" finds the year, "Liverpool" the side, "FA Cup" the
     competition. Nothing clever — a list this size does not need it. */
  function finalsMatch(row, needle) {
    if (!needle) return true;
    return ((row.title || "") + " " + (row.side || "")).toLowerCase().indexOf(needle) !== -1;
  }

  function renderFinals() {
    var list = $("finalsList");
    if (!list) return;
    var needle = finalsFilter.trim().toLowerCase();
    var rows = (finals || []).filter(function (r) { return finalsMatch(r, needle); });

    if (!rows.length) {
      list.innerHTML = '<div class="xic-panel-empty">Nothing matches &ldquo;' +
        esc(finalsFilter) + "&rdquo;.</div>";
      $("finalsSub").textContent = (finals || []).length + " finals";
      return;
    }

    /* Grouped by competition and newest first inside it, which is the order
       somebody looking for a final they remember will look in. A board whose
       title does not parse keeps its place under a heading that says so
       rather than being dropped: it is a real board. */
    var groups = {}, order = [];
    rows.forEach(function (r) {
      var key = r.comp || "Other finals";
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(r);
    });
    order.sort(function (a, b) { return groups[b].length - groups[a].length; });

    var out = [];
    order.forEach(function (key) {
      out.push('<div class="fin-head">' + esc(key) + " <i>" + groups[key].length + "</i></div>");
      groups[key]
        .sort(function (a, b) { return (b.year || 0) - (a.year || 0); })
        .forEach(function (r) {
          out.push('<button type="button" class="fin-row" data-id="' + r.id + '">' +
            '<span class="fin-side">' + esc(r.side || r.title) + "</span>" +
            '<span class="fin-when">' + esc(r.title) + "</span></button>");
        });
    });
    list.innerHTML = out.join("");
    $("finalsSub").textContent = needle
      ? rows.length + " of " + (finals || []).length + " finals"
      : rows.length + " finals, both XIs of each";
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  on("finalsList", "click", function (ev) {
    var row = ev.target.closest ? ev.target.closest(".fin-row") : null;
    if (!row) return;
    closeFinals();
    /* The same as the calendar above: the row that was clicked names the
       board, so there is nothing left to confirm. */
    openBoard({ kind: "iconic", id: row.getAttribute("data-id") }, { play: true });
  });

  /* ---- the durable record ---------------------------------------------

     TWO STORES WITH TWO JOBS, the same split the other two games use.
     xivw.board.v1.<no> is the board in progress and is pruned; xivw.results
     is the record of what was finished, which is what a run is counted from
     and what the account carries between devices.

     A row is unique by BOARD NUMBER, not by date: this game's boards are
     numbered and a player can finish yesterday's today. The crossword keys on
     dailyNo for the same reason. */
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
      /* FIRST RESULT BANKED WINS, which is the family's merge rule. Replaying
         a board you have already finished does not overwrite the run you set
         on it. */
      var all = readResults();
      if (all.some(function (r) { return r && r.no === rec.no; })) return;
      all.push(rec);
      localStorage.setItem(RESULTS_KEY, JSON.stringify(all.slice(-800)));
    } catch (e) {}
    /* The device keeps the record whatever happens next. Pushing it to the
       account is a best effort on top: a failed push leaves the row where it
       is and the next sync carries it. */
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

  /* Failures here are logged and swallowed. A sync that cannot reach the
     server is not a signed-out player, and telling them so mid-game would be
     a lie they cannot act on. */
  function accountNote(what, e) {
    try { console.info("vowels account " + what + ": " + (e && e.message)); } catch (x) {}
  }

  function pushResults() {
    if (!account) return Promise.resolve(null);
    return apiAuth("/api/account/migrate", { game: "vowels", results: readResults() })
      .catch(function (e) { accountNote("push", e); return null; });
  }

  function pullResults() {
    if (!account) return Promise.resolve(null);
    return apiAuth("/api/account/results?game=vowels").then(function (r) {
      var remote = (r && r.results) || [];
      if (!remote.length) return null;
      /* THE ACCOUNT'S ROW WINS OUTRIGHT on pull, and unpushed local rows
         survive — the family's rule, so a device that has been offline does
         not lose what it banked while it was. */
      var byNo = {};
      readResults().forEach(function (r2) { if (r2 && r2.no != null) byNo[r2.no] = r2; });
      remote.forEach(function (r2) { if (r2 && r2.no != null) byNo[r2.no] = r2; });
      var merged = Object.keys(byNo).map(function (k) { return byNo[k]; })
        .sort(function (a, b) { return a.no - b.no; });
      try { localStorage.setItem(RESULTS_KEY, JSON.stringify(merged.slice(-800))); } catch (e) {}
      renderForm();
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
      /* A transient failure is NOT a sign-out. Nulling the account here would
         make one dropped request look like being logged out. */
      accountNote("session", e);
      return null;
    });
  }

  /* ---- storage ---------------------------------------------------------- */

  /* ONE KEY PER BOARD, AND A BOARD IS NOT ALWAYS A NUMBER. A final has no
     place in the ring, so it has no number to key on and its id is used
     instead — prefixed, because id 12 and board #12 are different boards and
     an unprefixed key would have them share a save. */
  function storeKey() {
    var b = state.board;
    if (!b) return PREFIX + CFG.STORAGE_KEY + ".0";
    /* THE CYPHER IS PART OF WHICH BOARD THIS IS. The consonant ring is
       walked half a turn from the anagram one, so consonant #10 and anagram
       #10 are not one board in two costumes — they are two different elevens,
       and without this they shared one save and overwrote each other. It bites
       the finals too, where the id is the same and only the cypher differs. */
    var cy = b.cypher === "consonants" ? "c" : "";
    if (b.iconic) return PREFIX + CFG.STORAGE_KEY + "." + cy + "f" + b.id;
    if (b.preview) return PREFIX + CFG.STORAGE_KEY + "." + cy + "p" + b.id;
    return PREFIX + CFG.STORAGE_KEY + "." + cy + b.no;
  }

  function save() {
    try {
      localStorage.setItem(storeKey(), JSON.stringify({
        solved: state.solved, hints: state.hints, letters: state.letters,
        vowels: state.vowels,
        hintsRevealed: state.hintsRevealed,
        help: state.help, elapsed: state.elapsed, over: state.over
      }));
    } catch (e) { /* a full or blocked store must not end the game */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(storeKey());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  /* ---- the clock -------------------------------------------------------- */

  var ticker = null;

  function startClock() {
    state.startedAt = Date.now() - state.elapsed * 1000;
    if (ticker) clearInterval(ticker);
    ticker = setInterval(tick, 500);
    tick();
    playsStart();
  }

  /* HOW FAR PEOPLE GET, counted through the family's helper: a start when
     the clock first runs on a board, an end at full time or on the way out
     of the page. Guarded on active(), because the clock also restarts when
     a hidden tab comes back and that is the same attempt. Nothing about the
     person; see shared/xi-plays.js. */
  function playsProgress() {
    var ids = Object.keys(state.solved);
    return {
      solved: ids.length, elapsed: Math.round(state.elapsed || 0),
      detail: {
        help: state.help,
        revealed: ids.filter(function (k) { return state.solved[k] && state.solved[k].how === "revealed"; }).length,
      },
    };
  }
  function playsStart() {
    if (!window.XIPlays || window.XIPlays.active() || !state.board || state.over) return;
    /* The board's own token IS its key — the thing the server already uses to
       name this board — rather than a second spelling built here. And a board
       off the ring is mode "free", which is what the family calls a board that
       was chosen rather than served: no run at stake. */
    window.XIPlays.start({
      game: "vowels",
      mode: state.board.no == null ? "free" : "daily",
      boardKey: state.board.token,
      total: 11,
    }, playsProgress);
  }
  function playsEnd(completed) {
    if (window.XIPlays && window.XIPlays.active()) window.XIPlays.end(!!completed);
  }

  function stopClock() { if (ticker) { clearInterval(ticker); ticker = null; } }

  /* ---- the live league table ------------------------------------------
     Your score IS your club's points in a real historical season, and it
     moves you up and down a real ladder while you play. Built by
     shared/xi-table.js; this file only says which board it is and what the
     score is now. */
  var leagueTable = null;
  function mountTable(seed) {
    if (!window.XITable) return;
    var el = $("tablePanel");
    if (!el) return;
    leagueTable = window.XITable.mount(el, {
      seed: seed,
      /* The board at kick-off: no clock run, nothing bought. `help` is a
         NUMBER of points spent, not an object — an object here would have
         coerced to zero and been right by accident. */
      score: SCORING.computeScore(0, 0).score,
    });
  }

  function tick() {
    if (state.over) return;
    state.elapsed = Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
    var minute = SCORING.matchMinute(state.elapsed);
    $("clockValue").textContent = minute;
    var worth = SCORING.computeScore(state.elapsed, state.help).score;
    $("worthNow").textContent = worth;
    if (window.XIBar) XIBar.set({ clock: minute + "'", worth: worth });
    /* The ladder follows the SAME number the box above it shows, read from one
       place rather than recomputed — a table that disagreed with the score
       printed beside it would be two answers to one question. */
    if (leagueTable) leagueTable.update(worth);
    if (CFG.HALF_TIME_MINUTE !== null && !state.teamTalkDone &&
        minute >= CFG.HALF_TIME_MINUTE) teamTalk();
  }

  if (CFG.PAUSE_ON_TAB_HIDDEN) {
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopClock();
      else if (state.board && !state.over) startClock();
    });
  }

  /* ---- the pitch -------------------------------------------------------- */

  function bandY(id) {
    var b = (state.board.bands || []).find(function (x) { return x.id === id; });
    return b ? b.y : 0.5;
  }

  function tileText(slot) {
    var got = state.solved[slot.id];
    /* The REVEAL, not the cypher: a solved tile reads GARY LINEKER, because
       that is the moment of recognition. The cypher was only ever the letters
       to unscramble. */
    if (got) return String(got.name).toUpperCase();
    var known = state.letters[slot.id] || "";
    /* THE CONSONANT TILE IS ALREADY IN ORDER, so there is no bag to lift a
       letter out of and nothing to reassemble: it reads as it stands, with
       any blank the player has bought filled in.

       IT USED TO RETURN slot.cy AND STOP, which meant a bought vowel changed
       nothing on screen: the bench took the points and the tile was identical.
       Found by playing it, which is the only way it could have been found —
       every suite in this game was green. */
    if (bagless()) return cyWith(slot);
    if (!known) return slot.scramble;
    /* Revealed letters sit in front, in order, and the rest of the bag follows
       — so a bought letter is visibly worth something without turning the tile
       into a different puzzle. */
    return known + " \u00B7 " + remainingBag(slot, known);
  }

  /* ---- what the typing shows -------------------------------------------
     Type a letter and every tile that could supply it lifts that letter out of
     its bag. Type another and the tiles that cannot supply BOTH drop back to
     their full scramble. So the board answers "which of these could my word
     be" while it is being typed, rather than only when it is submitted.

     Matched against the bag as a MULTISET, in the order typed: TTUB supplies a
     T, and still supplies a second T, but never an S. That is why BUTT holds
     on "T" and lets go on "TS" while STAM keeps both — which is the whole
     point, because those two tiles are indistinguishable on a first look.

     It reads only the letters already on screen. Nothing is asked of the
     server, so this cannot leak which tile is the answer: a tile that can
     supply the letters is not a tile that IS the word. */
  function supplyFrom(bag, typed) {
    var pool = bag.split("");
    for (var i = 0; i < typed.length; i++) {
      var at = pool.indexOf(typed[i]);
      if (at === -1) return null;
      pool.splice(at, 1);
    }
    return pool.join("");
  }

  /* ---- WHICH CYPHER, AND WHAT THAT MEANS FOR THE BAG ------------------

     A consonant board has no bag. The tile is the name with its vowels
     blanked — SCHM__CH_L — already in order, so there is nothing to draw a
     letter out of and nothing to reassemble. Every piece of bag arithmetic
     below is not merely different on such a board, it is meaningless: the
     server sends `cy` and sends neither `scramble` nor `len`, because one
     cypher's difficulty is the other's giveaway.

     Asked through one predicate rather than tested in each place. Ten sites
     read those two fields; a guard written at each is nine chances to miss
     one, and the first draft of this change missed eight. */
  function bagless() {
    return !!(state.board && state.board.cypher === "consonants");
  }

  /* The tile as it stands: the blanked name with every vowel the player has
     bought written into the position the server said it belonged in. The
     server indexes into the same string cy was blanked from, so the positions
     line up without the page having to work anything out. */
  function cyWith(slot) {
    var base = String((slot && slot.cy) || "");
    var got = state.vowels[slot.id];
    if (!got) return base;
    var out = base.split("");
    Object.keys(got).forEach(function (i) {
      var at = Number(i);
      if (at >= 0 && at < out.length) out[at] = got[i];
    });
    return out.join("");
  }

  /* The blanked name, reduced to the letters and blanks that carry meaning:
     the apostrophe in _'SH__ and the spaces in V_N D_R S_R are punctuation a
     player does not type, and the answer box strips them too. */
  function cyPattern(slot) {
    return String((slot && slot.cy) || "").toUpperCase().replace(/[^A-Z_]/g, "");
  }

  /* COULD THIS TILE BE WHAT IS BEING TYPED — the consonant board's answer to
     the same question the bag answers on an anagram board. A blank takes any
     letter; a consonant must match. Compared as a PREFIX, so tiles light up
     and drop away as the name is typed, which is what the bag does. */
  function cyCouldBe(slot, typed) {
    var p = cyPattern(slot);
    if (!p || typed.length > p.length) return false;
    for (var i = 0; i < typed.length; i++) {
      if (p[i] !== "_" && p[i] !== typed[i]) return false;
    }
    return true;
  }

  /* THE WORD LENGTHS, WHEREVER THEY COME FROM. The anagram board is sent
     them; the consonant board is not, and does not need to be — its tile
     shows its own shape, so the lengths are derived from the blanks rather
     than sent a second time. Four places want this fact and none of them
     should care which cypher it came from. */
  function lenOf(slot) {
    if (slot && slot.len) return slot.len;
    var words = String((slot && slot.cy) || "").toUpperCase().split(/\s+/)
      .map(function (w) { return w.replace(/[^A-Z_]/g, "").length; })
      .filter(function (n) { return n > 0; });
    return words.length ? words : null;
  }

  function remainingBag(slot, known) {
    var pool = slot.scramble.split("");
    known.split("").forEach(function (ch) {
      var at = pool.indexOf(ch);
      if (at > -1) pool.splice(at, 1);
    });
    return pool.join("");
  }

  /* Repaints the tiles for whatever is currently typed. Targeted rather than a
     drawPitch(): the pitch is rebuilt on every change elsewhere, and rebuilding
     eleven buttons on every keystroke would throw away focus and the picked
     tile mid-word. */
  function paintTyped() {
    var typed = ($("answer").value || "").toUpperCase().replace(/[^A-Z]/g, "");
    state.board.slots.forEach(function (slot) {
      var el = document.querySelector('.slot[data-slot="' + slot.id + '"]');
      if (!el) return;
      var lifted = el.querySelector(".lifted");
      var letters = el.querySelector(".letters");
      if (!letters) return;
      /* A solved tile shows its name and takes no further part. */
      if (state.solved[slot.id]) { if (lifted) lifted.textContent = ""; return; }
      /* THE SAME QUESTION, ASKED THE WAY THIS CYPHER CAN ANSWER IT. There is
         no bag to lift letters out of, so the tile keeps its blanks and only
         says whether it could still be the name being typed. */
      if (bagless()) {
        var could = typed ? cyCouldBe(slot, typed) : false;
        if (lifted) lifted.textContent = "";
        el.classList.toggle("could", could);
        letters.textContent = tileText(slot);
        return;
      }
      var rest = typed ? supplyFrom(slot.scramble, typed) : null;
      if (rest === null) {
        if (lifted) lifted.textContent = "";
        el.classList.remove("could");
        letters.textContent = tileText(slot);
        return;
      }
      if (lifted) lifted.textContent = typed;
      el.classList.add("could");
      letters.textContent = rest;
    });
    paintEcho();
    queueRoom();
  }

  /* THE PICKED TILE, ECHOED ABOVE THE BOX. On a phone the system keyboard
     scrolls the box into view and the pitch out of it, so a player typing at
     a tile could not see the tile. The echo repeats what the tile shows —
     position, the letters lifted so far, the letters left in the bag, the
     enumeration — and the box sits directly under it, so whatever the
     keyboard does to the page the two stay together. Hidden when no tile is
     picked: typing at the whole board has eleven tiles to watch, not one. */
  function paintEcho() {
    var echo = $("echo");
    if (!echo) return;
    var id = state.picked;
    var slot = id && state.board ? slotOf(id) : null;
    if (!slot || state.solved[id]) { echo.hidden = true; return; }
    var typed = ($("answer").value || "").toUpperCase().replace(/[^A-Z]/g, "");
    $("echoPos").textContent = slot.pos;
    if (bagless()) {
      /* The blanked name, whole, with nothing lifted out of it and no
         enumeration under it: the pattern already shows its own length, and
         printing it again is the same fact twice. */
      $("echoLifted").textContent = "";
      $("echoLetters").textContent = tileText(slot);
      $("echoEnum").textContent = "";
      echo.hidden = false;
      return;
    }
    var rest = typed ? supplyFrom(slot.scramble, typed) : null;
    $("echoLifted").textContent = rest === null ? "" : typed;
    $("echoLetters").textContent = rest === null ? tileText(slot) : rest;
    $("echoEnum").textContent = "(" + lenOf(slot).join(",") + ")";
    echo.hidden = false;
  }

  function drawPitch() {
    /* The single funnel every path to the pitch goes through — a solve, a
       purchase, Full Time, and a restored finished board. Defaulting here
       rather than at each of them is what stops one being missed. */
    if (state.over) defaultReading();
    var pitch = $("pitch");
    pitch.innerHTML = "";
    /* A consonant board has no bag, so no tile ever lifts a letter: the line
       that holds them is a line of nothing on every tile, and on a locked
       screen a line is height the names need. */
    pitch.classList.toggle("bagless", bagless());
    var rows = rowsOf(state.board.slots);
    ["bottom", "top"].forEach(function (which) {
      var box = document.createElement("div");
      box.className = "box " + which;
      pitch.appendChild(box);
    });

    state.board.slots.forEach(function (slot) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "slot";
      el.style.left = (rows.x[slot.id] * 100) + "%";
      el.style.top = (bandY(slot.band) * 100) + "%";
      el.style.width = rows.width[slot.band] + "%";
      el.dataset.slot = slot.id;

      var got = state.solved[slot.id];
      if (got) el.classList.add(got.how === "revealed" ? "given" : "solved");
      if (state.picked === slot.id) el.classList.add("picked");

      var pos = document.createElement("span");
      pos.className = "pos";
      pos.textContent = slot.pos;
      el.appendChild(pos);

      /* The lifted line: the letters the player has typed that THIS tile could
         supply, sitting above the bag they came out of. Empty for every tile
         until something is typed. */
      var lifted = document.createElement("span");
      lifted.className = "lifted";
      el.appendChild(lifted);

      var letters = document.createElement("span");
      letters.className = "letters";
      letters.textContent = tileText(slot);
      el.appendChild(letters);

      /* The enumeration is the anagram's and only the anagram's: a blanked
         tile already shows its own length, so printing it underneath would
         be the same fact twice. */
      if (!got && !bagless()) {
        var en = document.createElement("span");
        en.className = "enum";
        en.textContent = "(" + lenOf(slot).join(",") + ")";
        el.appendChild(en);
      }

      /* ONE CAREER AT A TIME, HERE TOO. The bench sells the whole XI at once —
         that is the deal and it has not changed — but every tile then drew its
         career underneath, so a bought hint turned the pitch into eleven blocks
         of club lists and the one you were actually on was distinguishable only
         by being gold. The hint is still OWNED for all eleven; it is SHOWN for
         the tile you are on, and clicking another brings that one up.
         The same rule the reveal follows, and the reason it is `picked` here
         and `reading` there: during play the tile you are on is the one you can
         still buy for, which is exactly what picked means. */
      if (state.hints[slot.id] && !got && slot.id === state.picked) {
        var h = document.createElement("span");
        h.className = "hint focus";
        h.textContent = state.hints[slot.id];
        el.appendChild(h);
      }

      /* WHAT THE PLAYER IS KNOWN FOR, under the name, once the tile is solved.
         Two clubs at most: the point is recognition, not a career listing —
         the full history is what the career hint sells, and repeating all of
         it here would give away for free what the bench charges for. */
      /* ONE CAREER AT A TIME. This drew for every solved tile that had clubs,
         which on a finished daily board is eleven lines at once. The career is
         still carried by every tile — the payload is unchanged and the
         aria-label below spells it out on all eleven — but only the tile being
         read draws it. See state.reading for why this is not `picked`. */
      if (got && got.clubs && got.clubs.length && String(slot.id) === state.reading) {
        var cl = document.createElement("span");
        cl.className = "clubs";
        cl.textContent = got.clubs.map(function (c) {
          /* No number where the bank has no count. Printing 0 would claim he
             never played for them, which is not what missing data means. */
          /* AND THE LOAN IS SAID, because a loan and the transfer that followed
             it are now two entries at one club and would otherwise read as the
             same club printed twice — a mistake rather than a career. Same
             wording as the career hint uses, so one player reads the same way
             whether he was bought or solved. */
          /* AND THE NUMBER SAYS WHAT IT COUNTS. It is PREMIER LEAGUE
             appearances — the reveal reads premClubs, which is the league only
             — and it was printed as a bare figure beside a club name, which
             reads as a career total. Salah's Liverpool career is 442 in all
             competitions against 314 in the league; a bare "314" beside
             "Liverpool" is a true number making a false claim, and nothing in
             the pipeline was wrong at any point. Flagged by the Connection
             session, whose own data had the same shape from the same cause: an
             infobox appearance field is league-only by Wikipedia convention,
             and a league total looks exactly like an all-competition total when
             you only ever see one of them.
             Safe to say "PL" unconditionally here: only daily boards carry
             apps at all — 822 of 1,187 boards have no counts — so every number
             this line prints comes from premClubs. */
          return (c.apps ? c.club + " " + c.apps + " PL" : c.club) + (c.loan ? " (loan)" : "");
        }).join(" · ");
        el.appendChild(cl);
      }

      el.setAttribute("aria-label",
        slot.pos + ", " + (got
          ? got.name + (got.clubs && got.clubs.length
              ? ", " + got.clubs.map(function (c) {
                  /* Spoken in full where there is room for it: the tile says
                     "PL" because a tile is two inches wide, and a screen reader
                     has no such constraint and should not be given an
                     abbreviation to guess at. */
                  return (c.apps ? c.club + ", " + c.apps + " Premier League appearances" : c.club) +
                    (c.loan ? ", on loan" : "");
                }).join("; ")
              : "")
          : (bagless()
              ? "blanked, " + lenOf(slot).join(" and ") + " letters"
              : "scrambled, " + lenOf(slot).join(" and ") + " letters")));
      /* BOTH, and in this order. pick() owns the bench and refuses solved
         tiles and the reveal; read() owns the career line and accepts exactly
         those. Neither can be expressed as a condition on the other. */
      el.addEventListener("click", function () { pick(slot.id); read(slot.id); });
      pitch.appendChild(el);
    });

    $("solvedCount").textContent = Object.keys(state.solved).length;
    if (window.XIBar) XIBar.set({ progress: Object.keys(state.solved).length + "/" + (state.board.slots || []).length });
    $("helpSpent").textContent = state.help;
    /* Painted at the end of every rebuild too, not only on input. drawPitch()
       runs on any change — a solve, a bought letter, a pick — and it recreates
       the tiles, so without this the lifted letters would vanish mid-word. It
       also covers the reverse: submit() clears the box by assignment, and a
       programmatic value change fires no input event. */
    paintTyped();
  }

  /* WHERE EACH TILE STANDS, AND HOW WIDE IT MAY BE.
     Every tile was 27% wide wherever it stood, and a back four stands at
     0.2, 0.4, 0.6 and 0.8 -- twenty points apart. So four tiles 27 wide in a
     row 20 apart overlapped by seven, and on the Play build (24 Sep 2026)
     three midfielders' names sat on top of each other.
     So a row now spreads its tiles evenly across the pitch -- the order is the
     formation and is kept; a lone player keeps the spot the board gave him --
     and EVERY tile is as wide as the busiest row allows, minus a margin, and
     never wider than 30: four across makes every tile 23.5, the keeper's
     included. One size of card, by the owner's word on 24 Sep 2026 ("make
     the player cards always take up a consistent amount of the pitch"); a
     keeper twice the width of his full-backs read as a different kind of
     thing. */
  function rowsOf(slots) {
    var byBand = {};
    slots.forEach(function (s) { (byBand[s.band] = byBand[s.band] || []).push(s); });
    var out = { x: {}, width: {} };
    var busiest = 1;
    Object.keys(byBand).forEach(function (band) {
      var row = byBand[band].slice().sort(function (a, b) { return a.x - b.x; });
      var n = row.length;
      row.forEach(function (s, i) { out.x[s.id] = n === 1 ? Number(s.x) : (i + 0.5) / n; });
      busiest = Math.max(busiest, n);
    });
    var one = Math.max(12, Math.min(30, 100 / busiest - 1.5));
    Object.keys(byBand).forEach(function (band) { out.width[band] = one; });
    return out;
  }

  /* A NAME IS BROKEN BETWEEN ITS WORDS OR NOT AT ALL.
     The letters used to break anywhere, so YANNICK BOLASIE wrapped inside a
     word. Now a line breaks only at a space or a hyphen, and a word that is
     still wider than its tile takes a smaller size until it fits -- which
     only ever costs the one long name, not the whole board. */
  /* AND A CARD IS ONE HEIGHT. On a locked screen every tile is the same box
     (the stylesheet sets it), so a two-line name has to fit that box rather
     than grow it: the name takes a smaller size until the card holds it. */
  function fitNames() {
    var pitch = $("pitch");
    if (!pitch) return;
    pitch.querySelectorAll(".slot").forEach(function (tile) {
      tile.querySelectorAll(".letters, .lifted").forEach(function (el) {
        el.style.fontSize = "";
        if (!el.textContent || !el.clientWidth) return;
        var size = parseFloat(getComputedStyle(el).fontSize) || 14;
        var over = function () {
          return el.scrollWidth > el.clientWidth + 1 || tile.scrollHeight > tile.clientHeight + 1;
        };
        while (over() && size > 9) {
          size -= 1;
          el.style.fontSize = size + "px";
        }
      });
    });
  }

  /* THE PLAY SCREEN IS LOCKED, unless the board cannot fit it.
     The owner's ruling, 24 Sep 2026: no scrolling while playing, at any
     size. The stylesheet does the locking; this is the one way out of it. If
     a tile still spills off the pitch or onto its neighbour after the names
     are fitted -- a very short screen, or large system text -- the page goes
     back to scrolling, because a board you can scroll to is better than one
     you cannot read. The tile being read is excluded: it may carry a career
     and is drawn above the others on purpose. */
  function checkRoom() {
    var body = document.body;
    var pitch = $("pitch");
    var want = !!pitch && (body.classList.contains("playing") || body.classList.contains("fulltime"));
    body.classList.toggle("locked", want);
    if (!want) { fitNames(); return; }
    fitNames();
    var box = pitch.getBoundingClientRect();
    if (!box.height) return;
    var tiles = [].slice.call(pitch.querySelectorAll(".slot"))
      .filter(function (el) { return el.dataset.slot !== state.picked && el.dataset.slot !== state.reading; })
      .map(function (el) { return el.getBoundingClientRect(); });
    var spills = tiles.some(function (r) {
      return r.top < box.top - 1 || r.bottom > box.bottom + 1 || r.left < box.left - 1 || r.right > box.right + 1;
    });
    var meets = tiles.some(function (a, i) {
      return tiles.some(function (b, j) {
        return j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      });
    });
    /* And a card that cannot hold its own name. Every card is one height with
       its overflow hidden, so large text does not spill or overlap -- it is
       cut off inside the card, which is the failure this whole check exists
       to refuse. Found by tools/lock_test.mjs, not by eye. */
    var clipped = [].slice.call(pitch.querySelectorAll(".slot")).some(function (el) {
      if (el.querySelector(".clubs, .hint")) return false;
      var name = el.querySelector(".letters");
      return el.scrollHeight > el.clientHeight + 1 || (name && name.scrollWidth > name.clientWidth + 1);
    });
    if (spills || meets || clipped) { body.classList.remove("locked"); fitNames(); }
    keepInside(pitch);
  }
  /* THE TILE BEING READ STAYS ON THE PITCH. It is the one card allowed to
     grow -- it carries the clubs, or the career -- and it grows from its
     centre, so the keeper's ran off the bottom of the pitch and was clipped.
     Nudged back inside by exactly the overhang, and only that tile. */
  function keepInside(pitch) {
    var box = pitch.getBoundingClientRect();
    pitch.querySelectorAll(".slot").forEach(function (el) {
      el.style.marginTop = "";
      if (!el.querySelector(".clubs, .hint")) return;
      var r = el.getBoundingClientRect();
      if (r.bottom > box.bottom - 2) el.style.marginTop = -(r.bottom - box.bottom + 4) + "px";
      else if (r.top < box.top + 2) el.style.marginTop = (box.top - r.top + 4) + "px";
    });
  }
  var roomQueued = false;
  function queueRoom() {
    if (roomQueued) return;
    roomQueued = true;
    (window.requestAnimationFrame || setTimeout)(function () { roomQueued = false; checkRoom(); });
  }
  window.addEventListener("resize", queueRoom);

  /* ---- the bench -------------------------------------------------------- */

  /* WHOSE CAREER TO SHOW. Reached from the tile click alongside pick(), and
     independent of it: it never touches the bench, never clears picked, and
     works when pick() will not — on the reveal, and on a solved tile during
     play, which are exactly the two cases the feature is made of. */
  function read(slotId) {
    var got = state.solved[slotId];
    /* Only a solved tile has a career to read. An unsolved one would be
       claiming to show nothing rather than showing nothing. */
    if (!got) return;
    state.reading = String(slotId);
    drawPitch();
  }

  /* THE TILE THE REVEAL OPENS ON. Left null, the panel is empty until the
     player happens to click something, which reads as a career line that
     failed to load. The goalkeeper is the natural first read: it is where the
     eye starts and where the team sheet starts.
     Chosen here rather than in checkFullTime() because a finished board is
     also restored from a save, and a default set on only one of those paths
     is a blank reveal for anyone who closes the tab and comes back. */
  function defaultReading() {
    if (state.reading || !state.board) return;
    var slots = state.board.slots || [];
    var gk = slots.find(function (s) { return s.pos === "GK" && state.solved[s.id]; });
    var any = gk || slots.find(function (s) { return state.solved[s.id]; });
    if (any) state.reading = String(any.id);
  }

  function pick(slotId) {
    if (state.over) return;
    if (state.solved[slotId]) { state.picked = null; hideBench(); drawPitch(); paintEcho(); return; }
    state.picked = slotId;
    syncBench();
    drawPitch();
    placeBench();
    /* AND THE BOX TAKES THE KEYS AGAIN. Clicking a tile moved focus to the
       tile, so the next thing typed went nowhere — the player selected a
       player, started typing and watched nothing happen. Selecting is how you
       say which one you are answering, so it has to hand typing back. */
    focusAnswer();
  }

  /* One place, because three things want it: picking a tile, the game opening,
     and a key pressed anywhere on the page. preventScroll so selecting a tile
     near the foot of a phone screen does not jump the pitch. */
  function focusAnswer() {
    var box = $("answer");
    if (!box || box.disabled) return;
    try { box.focus({ preventScroll: true }); } catch (e) { box.focus(); }
  }

  /* THE BENCH IS REDRAWN AFTER EVERY PURCHASE, NOT ONLY WHEN A TILE IS PICKED.
     It was set up in pick() alone, so buying a hint left its button enabled:
     the guard in buy() refused the second purchase correctly and silently, and
     the player was left clicking a live control that did nothing. A control
     that is enabled and inert is worse than one that is disabled, because the
     player has no way to tell it apart from a broken game. Found by
     journey_test.mjs on its first honest run. */
  function syncBench() {
    var id = state.picked;
    if (!id) return;
    var slot = slotOf(id);
    /* WHAT THIS BOARD SELLS OFF THE SECOND BUTTON. An anagram sells the next
       letter off the front of the name; a consonant board's letters are all on
       the tile already and what it can sell is a blank filled in. Same button,
       same price, different thing — so the face, the cost and the count of
       what is left all have to follow the cypher rather than assume one. */
    var sellsVowel = bagless();
    var vowelsKnown = Object.keys(state.vowels[id] || {}).length;
    var lettersKnown = sellsVowel ? vowelsKnown : (state.letters[id] || "").length;
    var slotLen = lenOf(slot) || [0];
    var nameLength = slotLen.reduce(function (a, b) { return a + b; }, 0);
    $("benchFor").textContent = "Bench \u2014 " + slot.pos + ", (" + slotLen.join(",") + ")";
    /* A BOARD THAT SELLS NOTHING OFFERS NOTHING. hintLabel is null when the
       bench has no hint to sell \u2014 a board declaring "none", or a last-two
       board whose hint is the fixture on its start card \u2014 and a button that
       charged for an empty answer would be the purchase of nothing the hint
       rule exists to prevent. Letters and names stay on sale. */
    var sells = !!state.board.hintLabel;
    $("hintLabel").textContent = state.board.hintLabel || "";
    $("buyHint").hidden = !sells;
    $("hintCost").textContent = "\u2212" + CFG.REVEAL_HINT_COST;
    if ($("letterLabel")) {
      $("letterLabel").textContent = sellsVowel ? "Reveal a vowel" : "Reveal a letter";
    }
    $("letterCost").textContent = "\u2212" +
      (sellsVowel ? CFG.REVEAL_VOWEL_COST : CFG.REVEAL_LETTER_COST);
    $("nameCost").textContent = "\u2212" + CFG.REVEAL_NAME_COST;
    $("buyHint").disabled = !sells || state.hintsRevealed;
    /* PROMINENTLY FOR THE ONE SELECTED. Every tile carries its career once the
       board is revealed, but eleven careers at tile size is a wall of text and
       none of it is answering the question the player is actually asking. The
       bench is where they are looking, so the picked slot's career is repeated
       there at a size that can be read. */
    var mine = state.hints[id];
    $("benchHint").textContent = mine || "";
    $("benchHint").hidden = !mine;
    paintEcho();
    /* The last letter is never for sale: a letter reveal that completes the
       name is a name reveal at the cheaper price. The server refuses it; the
       button has to say so rather than take the click and return nothing. */
    /* The last one is never for sale: a reveal that completes the name is a
       name reveal at the cheaper price. The server refuses it, and the button
       has to say so rather than take the click and return nothing. On a
       consonant board what is countable is the blanks, not the letters. */
    var forSale = sellsVowel
      ? (String(slot.cy || "").match(/_/g) || []).length
      : nameLength;
    $("buyLetter").disabled = lettersKnown >= forSale - 1;
    $("benchRow").hidden = false;
  }

  function hideBench() { $("benchRow").hidden = true; }

  /* THE BENCH FLOATS OVER THE PITCH, AT THE END AWAY FROM THE PICKED TILE.
     The owner, 25 Sep 2026: "on scrambled if i select a name the sizing
     changes" -- the bench and the echo took rows of the locked screen, so the
     pitch lost a third of its height on every pick and every card shrank and
     grew back. On a locked screen it is laid over the pitch instead (the CSS
     puts it in the pitch's own cell), and this says which end: the foot,
     unless the tile being answered is in the lower half, where the bench
     would cover it. Measured after drawPitch, which is what marks the tile. */
  function placeBench() {
    var tile = document.querySelector("#pitch .slot.picked");
    var pitch = $("pitch");
    var low = false;
    if (tile && pitch) {
      var t = tile.getBoundingClientRect(), p = pitch.getBoundingClientRect();
      low = (t.top + t.bottom) / 2 > p.top + p.height / 2;
    }
    $("benchRow").classList.toggle("atTop", low);
  }

  function slotOf(id) {
    return state.board.slots.find(function (s) { return String(s.id) === String(id); });
  }

  /* ---- THE SERVER'S CLOCK ------------------------------------------------

     A challenge table is only worth looking at if the scores in it were
     computed by the server. This game's server already marks every guess and
     sells every reveal, so what it was missing was the clock — one for the
     whole board here, unlike HiLo's eleven. Kick off tells it, and from then
     on it has everything a score is made of.

     Best-effort throughout. A round it cannot verify is played and scored
     exactly as it always was, on the number the Full Time card has always
     called unverified. */
  function playIdOf() {
    var cur = window.XIPlays && window.XIPlays.current ? window.XIPlays.current() : null;
    return (cur && cur.playId) || null;
  }
  function startServerRound() {
    var id = playIdOf();
    if (!id || !state.board) return;
    post("round", { playId: id, token: state.board.token })
      .catch(function () { /* unverified, and the board plays on */ });
  }

  function post(path, body) {
    return fetch("/api/scrambled/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-XI-Games": "1" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  function buy(kind) {
    var id = state.picked;
    if (!id || state.solved[id]) return;
    post("reveal", {
      token: state.board.token, slotId: id, kind: kind, playId: playIdOf(),
      /* How many of THIS kind of help the slot has already had. The letter
         reveal counts letters off the front; the vowel reveal counts blanks
         already filled. Sending the wrong one asks the server for a position
         the player already has. */
      known: kind === "vowel"
        ? Object.keys(state.vowels[id] || {}).length
        : (state.letters[id] || "").length
    }).then(function (r) {
      if (r.error) return say(r.error, "bad");
      if (kind === "hint") {
        /* Charged on the transition, not on the click: the board is revealed
           once and the button goes dead, so a second click cannot bill for a
           thing the player already owns. */
        if (state.hintsRevealed) return;
        adoptHints(r.hints);
        state.help += CFG.REVEAL_HINT_COST;
        say(hintNoun() + " shown for the whole XI — " +
          slotOf(id).pos + " in front.", "good");
      } else if (kind === "letter") {
        if (r.index === null) return say("Nothing left to give away there.", "");
        state.letters[id] = (state.letters[id] || "") + r.letter;
        state.help += CFG.REVEAL_LETTER_COST;
      } else if (kind === "vowel") {
        if (r.index === null) return say("Nothing left to give away there.", "");
        state.vowels[id] = state.vowels[id] || {};
        state.vowels[id][r.index] = r.letter;
        state.help += CFG.REVEAL_VOWEL_COST;
      } else if (kind === "name") {
        state.solved[id] = { name: r.name, clubs: r.clubs, how: "revealed" };
        state.reading = String(id);   // bought, so it is the active card
        state.help += CFG.REVEAL_NAME_COST;
        state.picked = null;
        hideBench();
        say(r.name.toUpperCase() + " \u2014 given.", "");
      }
      save();
      syncBench();
      drawPitch();
      tick();
      checkFullTime();
    });
  }

  /* THE ONE PLACE HINTS ARRIVE, bought or given. Both routes now ask the same
     question and get the same board-wide answer, so neither can drift into
     showing something the other would not. */
  /* WHAT THIS BOARD SELLS, AS A NOUN. hintField is a data key — "clubs" —
     and reading it out to the player produced "every clubs, free". The label
     is the sentence the board already states about itself, so the noun comes
     off the front of that and there is no second list to keep in step. */
  function hintNoun(b) {
    var src = b || state.board || {};
    return String(src.hintLabel || "").replace(/^Reveal /, "") || "hint";
  }

  function adoptHints(map) {
    if (!map) return;
    Object.keys(map).forEach(function (k) { state.hints[k] = map[k]; });
    state.hintsRevealed = true;
  }

  /* THE TEAM TALK. Free, automatic, once, at half time: every hint is given.
     Eleven anagrams have no intersections, so nothing gets easier as you
     solve — what is left at the end is by definition what you had no route
     into. Without this the second half charges for time that cannot be turned
     into progress. */
  function teamTalk() {
    state.teamTalkDone = true;
    if (state.hintsRevealed) return;
    /* Nothing to give on a board that sells nothing: the manager has no
       careers to hand out, and saying he had would be a half time of nothing. */
    if (!state.board.hintLabel) return;
    /* One request, where this used to fire eleven in parallel — the board
       answers for every slot now, so eleven round trips bought nothing but
       eleven chances for one of them to fail alone. */
    post("reveal", { token: state.board.token, kind: "hint" }).then(function (r) {
      if (!r || r.error) return;
      adoptHints(r.hints);
      save();
      drawPitch();
      say("Half time. The manager has given you every " +
        hintNoun() + ", free.", "good");
    });
  }

  /* ---- guessing --------------------------------------------------------- */

  function say(text, tone) {
    var el = $("feedback");
    el.textContent = text;
    el.className = "feedback" + (tone ? " " + tone : "");
  }

  /* A NAME THAT IS FINISHED SENDS ITSELF.
   *
   * Pressing Enter after typing a name you have already worked out is a step
   * that asks nothing: the letters are the puzzle, and when they run out the
   * answer is either right or it is an arrangement of the right letters.
   *
   * THE PAGE CAN TELL WITHOUT ASKING, and that is what makes this cheap. The
   * browser holds no names — it never has — but it does hold each slot's
   * scramble, and supplyFrom() already works out whether what is typed can be
   * drawn from a slot's letters, because that is how a tile lights up as you
   * type. When it comes back with nothing left over, every letter of that
   * slot has been used exactly once: the guess is worth sending, and no other
   * guess is. So this adds no request that was not going to be made — it
   * removes a keystroke, not a round trip.
   *
   * What is left over may still be punctuation: a scramble keeps the hyphen
   * in MAITLAND-NILES and the space in VAN DIJK, while what is typed is
   * stripped to letters. So the test is that no LETTER is left, not that the
   * remainder is empty — written the other way, no hyphenated name would ever
   * send itself.
   *
   * An alias still needs Enter, and should: "NERY PUMPIDO" is not an
   * arrangement of the letters of PUMPIDO, so nothing here can see that it is
   * finished. The key stays, and every other route to submit is unchanged. */
  /* The predicate itself, named and separate so it can be exercised on boards
     that are not the one on screen — the punctuated names live on two of them
     and the rule turns on exactly this line. */
  function lettersUsedUp(scramble, typed) {
    var rest = supplyFrom(scramble, typed);
    return rest !== null && !/[A-Z]/.test(rest);
  }

  function finishedSlot() {
    if (!state.board || state.over) return null;
    var typed = ($("answer").value || "").toUpperCase().replace(/[^A-Z]/g, "");
    /* Two letters is the shortest anything on a board could be; below that a
       stray keystroke could exhaust some very short bag by accident. */
    if (typed.length < 2) return null;
    var hit = null;
    (state.board.slots || []).forEach(function (slot) {
      if (hit || state.solved[slot.id]) return;
      /* THE CONSONANT BOARD'S VERSION OF THE SAME RULE. There is no bag to
         use up; what is complete is a name that fills the pattern — every
         blank taken and every consonant matched. Same property: it is the
         only guess worth sending, and it was going to be sent anyway. */
      if (bagless()) {
        if (typed.length === cyPattern(slot).length && cyCouldBe(slot, typed)) hit = slot;
        return;
      }
      if (lettersUsedUp(slot.scramble, typed)) hit = slot;
    });
    return hit;
  }

  function maybeAutoSubmit() {
    if (finishedSlot()) submit();
  }

  /* One guess in the air at a time. Auto-submit fires from a keystroke, so
     without this a fast typist landing the last letter twice — or a repeat
     from a held key — would send the same guess twice and be answered twice. */
  var sending = false;

  function submit() {
    if (state.over || sending) return;
    var typed = $("answer").value.trim();
    if (!typed) return;
    sending = true;
    post("guess", {
      token: state.board.token,
      guess: typed,
      solved: Object.keys(state.solved),
      /* The attempt rides with the guess so the server can count the solve
         against the clock it started. */
      playId: playIdOf()
    }).then(function (r) {
      sending = false;
      if (r.error) return say(r.error, "bad");
      if (r.solvedId) {
        state.solved[r.solvedId] = { name: r.name, clubs: r.clubs, how: "solved",
          m: SCORING.matchMinute(Math.max(0, Math.round((Date.now() - state.startedAt) / 1000))) };
        /* The player has just earned this one; it is the active card by any
           reading of the word, so its career is the one on screen. */
        state.reading = String(r.solvedId);
        $("answer").value = "";
        state.picked = null;
        hideBench();
        paintEcho();
        say(r.name.toUpperCase() + " \u2014 in.", "good");
        save();
        drawPitch();
        checkFullTime();
      } else {
        say("Not on this board \u2014 or not one you still need.", "bad");
      }
    }).catch(function () {
      /* A GUESS THAT NEVER LANDED MUST NOT LOCK THE BOX. Without this the
         in-flight flag stays raised on a dropped request and every later
         guess is refused in silence \u2014 the game would look like it had stopped
         accepting names. */
      sending = false;
      say("That did not reach the server. Try again.", "bad");
    });
    $("answer").focus();
  }

  function checkFullTime() {
    if (Object.keys(state.solved).length < state.board.slots.length) return;
    state.over = true;
    /* THE REVEAL ALWAYS OPENS ON THE SAME TILE. During play `reading` follows
       the tile just solved or bought, so at Full Time it would be whichever
       one happened to be last — while a finished board RESTORED from a save
       has no reading at all and falls to the goalkeeper. Two paths to one
       screen opening in two different places is the kind of difference that
       gets read as a bug later, and neither the player nor the next reader of
       this file could tell which was intended. Cleared here so both paths go
       through defaultReading() and the reveal starts at the goalkeeper, where
       a team sheet starts.
       AND THE PITCH IS REDRAWN, because submit() draws BEFORE it calls this —
       clearing the field alone left the last-solved tile's career on screen
       with nothing to repaint it. */
    state.reading = null;
    defaultReading();
    drawPitch();
    stopClock();
    playsEnd(true);
    save();
    bankResult();
    showResults();
  }

  /* WHAT A FINISHED BOARD LEAVES BEHIND. Written before the card is drawn, so
     a player who closes the tab on the Full Time screen still keeps it. */
  function bankResult() {
    if (!state.board) return;
    /* A RESULT IS A NUMBERED BOARD. A run here is consecutive board numbers,
       so a board with no number cannot be part of one — and recording it
       under `no: null` would put a row in the record that every reader of the
       record has to remember to skip. The finals are played for their own
       sake; the card still shows the score. */
    if (state.board.no == null) return;
    var res = SCORING.computeScore(state.elapsed, state.help);
    recordResult({
      no: state.board.no,
      title: state.board.title,
      score: res.score,
      elapsedSeconds: Math.round(state.elapsed),
      help: state.help,
      revealed: Object.keys(state.solved).filter(function (k) {
        return state.solved[k] && state.solved[k].how === "revealed";
      }).length,
      /* The eleven boxes, in the order of the board, so a board reopened
         later draws its own: "g12" solved at 12', "a" given, "g" free. */
      boxes: boxesOf().map(function (b) { return b.s + (b.m != null ? b.m : ""); }).join(" "),
      at: Date.now(),
    });
  }

  /* A BOX PER NAME, in the board's order: green with the minute it was
     unravelled, amber where it was given off the bench, green with no minute
     where the tile arrived free, grey where it was never reached. */
  function boxesOf() {
    return state.board.slots.map(function (s) {
      var got = state.solved[s.id] || {};
      if (got.how === "solved") return { s: "g", m: got.m != null ? got.m : null };
      if (got.how === "free") return { s: "g" };
      if (got.how === "revealed") return { s: "a" };
      return { s: "x" };
    });
  }

  /* FULL TIME, THE FAMILY'S WAY (shared/xi-fulltime.js): this game hands over
     its result and the panel draws the four blocks every game shows. */
  var ftShown = null;
  function drawFullTime(o) {
    ftShown = o;
    if (!window.XIFullTime || !XIFullTime.panel) return;
    XIFullTime.panel($("ftPanel"), {
      game: "vowels", name: "Vowels XI", no: o.no, date: o.day ? XIFullTime.dayLabel(o.day) : "",
      score: o.score, max: SCORING.MAX_SCORE, boxes: o.boxes, stats: o.stats +
        (o.verified ? " · Verified by the server" : ""),
      share: function () {
        return "Vowels XI" + (o.no != null ? " · No. " + o.no : "") + " · " + o.score + "/" + SCORING.MAX_SCORE +
          (o.boxes ? "\n" + XIFullTime.squares(o.boxes) : "");
      },
      url: function () { return location.href.split("#")[0]; },
      /* A REAL CHALLENGE where the server will make one -- the finals, once
         verified; it refuses a daily, and then the board and the score to
         beat go instead. */
      challenge: function (sendBoard) {
        var id = playIdOf();
        if (!o.verified || !o.iconic || !id || !window.XIChallenge || !XIChallenge.create) { sendBoard(); return; }
        XIChallenge.create(id).then(sendBoard, function () { sendBoard(); });
      },
    });
  }
  function helpLine(mins, secs, help) {
    return mins + "m " + (secs < 10 ? "0" : "") + secs + "s" + (help ? " · " + help + " off the bench" : "");
  }

  /* ONE VERIFICATION, TWO READERS. The card wants the number and the
     challenge wants to know it landed; asking twice would post two finishes
     for one board and time the second from a clock that had already stopped.
     So the answer is kept and handed to whoever asks. */
  var verifiedWaiters = [];
  var verifiedAnswer = null;
  function whenVerified(fn) {
    if (verifiedAnswer !== null) { fn(verifiedAnswer); return; }
    verifiedWaiters.push(fn);
  }
  function settleVerified(ok) {
    verifiedAnswer = !!ok;
    var list = verifiedWaiters; verifiedWaiters = [];
    list.forEach(function (fn) { try { fn(verifiedAnswer); } catch (e) {} });
  }

  function verifyScore() {
    var id = playIdOf();
    if (!id || !state.board) { settleVerified(false); return; }
    post("finish", { playId: id })
      .then(function (v) {
        settleVerified(!!(v && v.verified));
        if (!v || !v.verified || !ftShown) return;
        /* THE SERVER'S NUMBER WINS: its clock runs from when the board was
           pulled and does not pause, which is deliberate. */
        var o = {};
        for (var k in ftShown) o[k] = ftShown[k];
        o.score = v.score; o.verified = true;
        drawFullTime(o);
      })
      .catch(function () { settleVerified(false); /* the card keeps its own number */ });
  }

  /* Today's banked result for THIS board, if this device has one. Keyed on the
     board number, which is what recordResult writes for a numbered game. */
  function bankedToday() {
    if (!state.board || state.board.no == null ||
        state.board.no !== state.todayNo) return null;
    var list = readResults();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && Number(list[i].no) === Number(state.board.no)) return list[i];
    }
    return null;
  }

  /* THE RESULT CARD, REBUILT FROM THE RECORD. Deliberately not showResults():
     that one recomputes from a live round — state.elapsed, state.help and the
     eleven solved slots — and none of it survives a reload, so it would print
     a fresh zero and call it the score. */
  function showBanked(rec) {
    var mins = Math.floor((rec.elapsedSeconds || 0) / 60), secs = (rec.elapsedSeconds || 0) % 60;
    var boxes = typeof rec.boxes === "string" && rec.boxes
      ? rec.boxes.split(" ").map(function (t) { return { s: t.charAt(0), m: t.length > 1 ? Number(t.slice(1)) : null }; })
      : null;
    drawFullTime({ no: rec.no, day: null, score: rec.score, boxes: boxes,
                   stats: helpLine(mins, secs, rec.help) + " · The daily is one attempt" });
    show("screenResults");
  }

  function showResults() {
    var res = SCORING.computeScore(state.elapsed, state.help);
    var mins = Math.floor(state.elapsed / 60), secs = state.elapsed % 60;
    var boxes = boxesOf();
    var solved = boxes.filter(function (b) { return b.s === "g" && b.m != null; }).length;
    drawFullTime({ no: state.board.no, day: state.board.day || null, score: res.score, boxes: boxes,
                   iconic: !!state.board.iconic,
                   stats: solved + " of " + boxes.length + " unravelled · " + helpLine(mins, secs, state.help) });
    /* The server's own number, asked for AFTER the panel is drawn; and the
       challenge's table, joined on the same answer by somebody who came from
       one. */
    verifyScore();
    if (window.XIChallenge && XIChallenge.joining && XIChallenge.joining()) {
      whenVerified(function (ok) { if (ok) XIChallenge.finished(playIdOf(), null); });
    }
    show("screenResults");
  }

  /* ---- screens ---------------------------------------------------------- */

  function show(id) {
    /* AT FULL TIME THE BOARD STAYS ON SCREEN. These four screens were
       exclusive, so the moment the eleventh name went in the pitch was hidden
       and all that was left was a score and a block of share text — the
       completed XI, which is the whole payoff, thrown away at the moment it
       was finished. The crossword never did this: its result is a panel that
       opens beside the grid, and the grid stays.

       So Full Time shows the results card UNDER the board rather than instead
       of it. Not scrolled to, deliberately: the player is looking at the XI
       they just finished, and the result is a scroll away in the direction
       they are already reading. */
    var full = id === "screenResults";
    ["screenLoading", "screenStart", "screenGame", "screenResults"]
      .forEach(function (s) {
        $(s).hidden = full ? !(s === "screenResults" || s === "screenGame") : s !== id;
      });
    /* The board is there to be READ now, not played: the answer box, the
       bench and the echo are controls for a round that is over. */
    $("screenGame").classList.toggle("finished", full);
    /* THE KEYBOARD BELONGS TO THE BOARD. On the landing and the full-time card
       there is nothing to type into, and a keyboard stuck to the bottom of a
       page somebody is reading takes a third of the screen for nothing. The
       crossword hides its own the same way while its landing is up. */
    document.body.classList.toggle("playing", id === "screenGame");
    /* FULL TIME IS LOCKED TOO. The owner, 24 Sep 2026, on the first build of
       the locked board: "once the game finishes it goes back to a full normal
       screen". So the board stays where it was and the result opens beside it
       (or under it, on a phone) in a panel of its own; see the stylesheet. */
    document.body.classList.toggle("fulltime", full);
    queueRoom();
  }

  /* ---- start ------------------------------------------------------------ */

  /* The permalink is read from the path by the shared chrome, which states
     its shape once for the family — see shared/xi-chrome.js, and
     functions/_lib/permalink.js for the server's half. */
  function permalinkKey() {
    return window.XIChrome && window.XIChrome.permalink ? window.XIChrome.permalink.read() : null;
  }

  /* WHICH BOARD THE PAGE IS AFTER, as one value rather than as a chain of
     conditions read again at every point that needs it. Four routes reach a
     board and they are not variations on one address:

       daily     a position in the ring, today or behind it, run at stake
       iconic    a final, addressed by board id, out of the rotation entirely
       preview   the OWNER's address for any board, re-checked server-side
       (and a signed-out visitor sending ?id= gets a 401 from that route and
       the start card says so, which is the honest failure rather than a
       silent fall back to today's board.)

     ?iconic= rather than a permalink, and it is worth saying why: the
     permalink shape is /football/vowels/daily/<board number>, and a final's id is
     1424. In four years the ring reaches 1424 and the same address would mean
     two different boards. A final is not a daily and does not get a daily's
     address. */
  function askFromUrl() {
    var params = new URLSearchParams(location.search);
    /* ?cy=1 asks for the consonant cypher. It rides on the ask rather than
       being read a second time in askUrl: one question, answered once. The
       SERVER decides whether the asker may have it. */
    var cy = true;   /* generated: this game IS the consonant cypher */
    var iconic = params.get("iconic");
    if (iconic) return { kind: "iconic", id: iconic, cy: cy };
    var byId = params.get("id");
    if (byId) return { kind: "preview", id: byId, cy: cy };
    /* The permalink is the same question ?no= asks, in the path: one URL, one
       board, forever. It wins over ?no= because it is the address the visitor
       actually came to. */
    var asked = permalinkKey();
    return { kind: "daily", no: Number(asked || params.get("no")) || null,
             fromLink: !!asked, cy: cy };
  }

  function askUrl(ask) {
    /* THE PREVIEW ROUTE DOES NOT CARRY THE CYPHER YET, so ?id= stays the
       anagram. Left alone rather than half-wired: an address that accepts a
       parameter it ignores is worse than one that does not take it. */
    var withCy = function (base) {
      /* generated: unconditional — the cypher is the game, not the ask */
      return base + (base.indexOf("?") > -1 ? "&" : "?") + "cy=1";
    };
    if (ask.kind === "iconic") {
      return withCy("/api/scrambled/iconic?id=" + encodeURIComponent(ask.id));
    }
    if (ask.kind === "preview") {
      return "/api/admin/scrambled?id=" + encodeURIComponent(ask.id);
    }
    return withCy("/api/scrambled/daily" + (ask.no ? "?no=" + encodeURIComponent(ask.no) : ""));
  }

  /* EVERYTHING A BOARD OWNS, PUT BACK. Opening a second board in the same
     page is new — until the catalogue existed the only way to change board
     was to reload — and every field below belonged to the board that was
     open. Left behind, the finals card would have opened on the daily's
     solved names and its clock. */
  function forgetBoard() {
    stopClock();
    playsEnd(false);
    state.solved = {}; state.hints = {}; state.letters = {}; state.vowels = {};
    state.hintsRevealed = false; state.help = 0;
    state.startedAt = null; state.elapsed = 0;
    state.picked = null; state.teamTalkDone = false; state.over = false;
  }

  /* Opens a board and draws its start card. `play` starts the clock straight
     away, for the places that name one board rather than offering a choice —
     the board of the week is a pick, not a menu, so the pick IS the answer. */
  function openBoard(ask, opts) {
    var play = !!(opts && opts.play);
    forgetBoard();
    return fetch(askUrl(ask), {
      headers: { "X-XI-Games": "1" }, credentials: "same-origin"
    })
      .then(function (r) { return r.json(); })
      .then(function (board) {
        /* A BOARD THAT NEEDS AN ACCOUNT IS NOT AN ERROR, it is an invitation.
           Reached by following a link to an old board, since the calendar
           marks the locked days and does not send you here. The sheet is
           opened with the reason in it, and — because a page showing nothing
           is a dead end — today's board is loaded behind it, so there is
           something to play either way. */
        if (board.needsAccount) {
          if (window.XIChrome && window.XIChrome.archive) {
            window.XIChrome.archive.askToRegister(board.error);
          }
          if (ask.kind !== "daily" || ask.no) {
            if (window.XIChrome && window.XIChrome.permalink) {
              window.XIChrome.permalink.clear("vowels");
            }
            openBoard({ kind: "daily" });
          }
          return;
        }
        if (board.error) { say(board.error, "bad"); return; }
        state.board = board;
        /* THE LIVE TABLE, remounted per board. The SEED IS THE BOARD'S TOKEN,
           not its number — and the difference matters here more than anywhere
           else in the family.

           Scrambled and Vowels read ONE bank two ways, and boardForNumber puts
           them half a ring apart: on day 12 they are different elevens, and
           they share the number 12. Seeding on the number gave both games the
           same historical season on the same day — one ladder for two boards,
           so a player doing both played 2005/06 twice and the two games felt
           like one. The token says which board AND which cypher (sc:12 against
           sc:c:12), so it is the board's identity rather than the day's.

           Still the server's, and still the same for everybody on that board,
           which is what makes two people comparing positions mean anything. */
        mountTable(String(board.token || ("sc:" + board.no)));
        /* THE CLOCK IS THE BOARD'S, NOT THE GAME'S. The payload says which
           cypher it gave and the per-game half of scoring follows it, so
           scoring.js still reads one number from one place. */
        /* ASSIGNED ON EVERY BOARD, NOT ONLY ON A CONSONANT ONE. This set
           MATCH_CLOCK only when the cypher was consonants, which was correct
           exactly once: a board opens without reloading the page now — the
           calendar and the finals picker both do it in place — so the next
           anagram board was played and SCORED on the 300-second clock. Set
           both ways from constants that are never written, and it cannot
           leak in either direction. */
        CFG.MATCH_CLOCK_REAL_SECONDS = board.cypher === "consonants"
          ? CFG.CONSONANT_CLOCK_REAL_SECONDS
          : CFG.ANAGRAM_CLOCK_REAL_SECONDS;
        /* What day it is according to the SERVER, kept so the landing can
           count the archive and judge whether a run reaches today. Never
           computed here: the server decides what day it is. A board off the
           ring carries no `today`, so the count already established stands. */
        if (board.today) state.todayNo = board.today;
        /* And the day this board ran, which every other date is counted from.
           Only a board on the ring: a final is not a day. */
        if (board.today && typeof board.no === "number" &&
            /^\d{4}-\d{2}-\d{2}$/.test(board.day || "")) {
          dayAnchor = { no: board.no, ms: Date.parse(board.day + "T00:00:00Z") };
        }
        /* THE FAMILY'S TOP BAR, named with this board: its number, its day
           (the same date the calendar gives it) and whether it is today's. */
        if (window.XIBar) {
          XIBar.mount($("xiBar"));
          XIBar.set({ name: "Vowels XI", no: board.no,
                      day: new Date(dateForNo(board.no)).toISOString().slice(0, 10),
                      old: !!state.todayNo && board.no !== state.todayNo,
                      progress: "0/" + ((board.slots || []).length || 11), clock: "0'",
                      score: null, worth: null, subs: null });
        }
        /* Followed a link to an older board: say how old, once, and only
           where the page was OPENED at one. Somebody who just picked a board
           out of the calendar was looking at its date a second ago. */
        if (ask.fromLink && window.XIChrome && window.XIChrome.permalink) {
          window.XIChrome.permalink.aged("vowels", (state.todayNo || 0) - (board.no || 0));
        }
        address(board);
        $("startTitle").textContent = board.title;
        $("startPool").textContent = board.pool;
        $("startKicker").textContent = startKicker(board);
        /* SHORT, because hc-state is a status line and not a paragraph. The
           full explanation of the clock and the team talk belongs on How to
           play; here it was three lines of small caps across the hero. */
        $("startClock").textContent = "Ninety minutes in " +
          Math.round(CFG.MATCH_CLOCK_REAL_SECONDS / 60) + " of real time" +
          (CFG.HALF_TIME_MINUTE === null ? "" : " · half time is free");

        var saved = load();
        if (saved) {
          state.solved = saved.solved || {};
          state.hints = saved.hints || {};
          state.hintsRevealed = !!saved.hintsRevealed;
          state.letters = saved.letters || {};
          state.vowels = saved.vowels || {};
          state.help = saved.help || 0;
          state.elapsed = saved.elapsed || 0;
          state.over = !!saved.over;
        }
        /* A NAME WITH NO VOWELS ARRIVES DONE. Its cypher IS the name — no
           arrangement of this game hides it — so it goes on the team sheet at
           kick-off. Marked "free" rather than "solved": the player is not
           CHARGED for it, which is what the first draft meant, but neither did
           they unravel it, and the share counts what was unravelled. After the
           restore, or a resumed board would lose them when state.solved is
           replaced wholesale. */
        (board.slots || []).forEach(function (s) {
          if (s.presolved && !state.solved[s.id]) {
            state.solved[s.id] = { name: s.name, how: "free" };
          }
        });
        renderLanding();
        syncAccount();
        if (state.over) { show("screenResults"); drawPitch(); showResults(); return; }
        if (play) kickOff(); else show("screenStart");
      })
      .catch(function () {
        $("screenLoading").querySelector(".pmLede").textContent =
          "Could not reach today's board. Try again in a moment.";
      });
  }

  /* WHAT THE START CARD CALLS THIS BOARD. Three kinds of board and one line to
     name them: a final says which final, because "BOARD #null" is what it said
     while the number belonged to a ring this board is not in. */
  function startKicker(board) {
    if (board.iconic) return "ICONIC MATCH";
    if (board.preview) return "PREVIEW · BOARD " + board.id;
    /* TODAY WEARS ITS NUMBER TOO. It read a bare "TODAY", so the board's own
       number appeared only once you had picked a PREVIOUS one — the crossword
       was the only game that named today's. Since 6 September 2026 every game
       counts the same board number from the same day one, and it is the number
       in the board's address, so it is worth saying on the card somebody is
       about to press. */
    return board.no === board.today
      ? "TODAY · #" + board.no
      : "BOARD #" + board.no;
  }

  /* THE ADDRESS SAYS WHICH BOARD IS OPEN, so it can be copied and come back
     to the same one. A daily gets the family's permalink; a final gets a
     query, for the reason askFromUrl sets out.

     The other spelling is cleared each time, and that is the point rather
     than tidiness: going from a final to a daily and leaving ?iconic= behind
     would give an address that reloads as the final. The owner's ?id= is left
     alone — it is their address for this page and the owner bar reads it. */
  function address(board) {
    if (board.preview) return;
    try {
      /* THE CYPHER IS PART OF WHICH BOARD THIS IS, so it belongs in the
         address. This cleared the query wholesale to drop a stale ?iconic=,
         and once a second cypher existed it dropped ?cy= with it: you asked
         for a consonant board, played one, and the address said /football/vowels/ —
         so a reload, a copied link and the back button all handed back the
         anagram. Built from what the board IS rather than from what the query
         happened to say, so each spelling is present exactly when it is true. */
      var q = [];
      if (board.iconic) q.push("iconic=" + encodeURIComponent(board.id));
      /* NO ?cy= IN THE ADDRESS ANY MORE. It earned its place when one route
         served both cyphers and the query was the only thing telling them
         apart. The games split on 4 Sep and the PATH says which one you are on
         — /football/vowels/ or /football/vowels/ — so the parameter said
         nothing the address did not already say, and Vowels rewrote every
         visitor's URL to /football/vowels/?cy=1 for no gain: an implementation
         detail in the address bar and in every link anybody copied.
         It is still read on the way IN, so a link somebody already has keeps
         working; it is simply no longer written. The API call is a separate
         question and still carries the cypher — see askUrl. */
      history.replaceState(null, "",
        (board.iconic ? "/football/vowels/" : location.pathname) +
        (q.length ? "?" + q.join("&") : "") + location.hash);
    } catch (e) { /* a browser that will not have it keeps the address it has */ }
    var perma = window.XIChrome && window.XIChrome.permalink;
    if (!perma || board.iconic || board.no == null) return;
    if (board.no !== state.todayNo) perma.show("vowels", board.no);
    else perma.clear("vowels");
  }

  /* ---- CHALLENGES, FROM THE SHARED LAYER ---------------------------------
     The whole flow — the invitation, the name taken before the board opens,
     the entry at Full Time, the standings — is shared/xi-challenge.js, so this
     game supplies only what is its own: which game it is, how to open one of
     its boards from a token, what a board is called, and what its third
     column means. The crossword had all of this written into its own file,
     which is why no other game had any of it. */
  function configureChallenge() {
    if (!window.XIChallenge) return;
    window.XIChallenge.configure({
      /* The name below is rewritten by tools/build_vowels.js when it generates
         Vowels from this file, so each game tells the server which it is
         without this one knowing there are two. (The rule is not restated
         here: the generator would rewrite the restatement too.) */
      game: "vowels",
      /* A finals board's token is sc:iconic:<id>, which is the board key the
         play was banked under — so the server hands back exactly what this
         needs. A daily token cannot arrive here: the server refuses to make a
         challenge from a daily. */
      openByToken: function (token) {
        var m = /^sc:iconic:(?:c:)?(\d+)$/.exec(String(token || ""));
        if (!m) { openBoard({ kind: "daily" }, { play: true }); return; }
        openBoard({ kind: "iconic", id: m[1] }, { play: true });
      },
      boardLabel: function () { return "One of the finals"; },
      /* Scrambled's help is the bench: names bought and hints taken. "Checks"
         would be the crossword's word for something this game does not have. */
      column: {
        label: "Bench",
        of: function (e) { return (e.reveals || 0) + (e.checks || 0); },
      },
    });
  }

  function boot() {
    configureChallenge();
    /* A CHALLENGE OPENS ITS OWN BOARD, so the default one must not be opened
       underneath it: two boards loading into one page is how the finals card
       used to arrive on the daily's clock. */
    var pending = window.XIChallenge && window.XIChallenge.arrive
      ? window.XIChallenge.arrive() : Promise.resolve(false);
    pending.then(function (taken) {
      if (!taken) openBoard(askFromUrl());
    });
  }

  /* The hero IS the kick off now: one control that says what it opens,
     rather than a card with a button under it. Named, because openBoard also
     kicks off — a board that was chosen by name rather than picked from a
     list has already been decided on, and a second click to confirm it is a
     click that asks nothing. */
  function kickOff() {
    if (!state.board) return;
    $("poolLine").textContent = state.board.pool;
    show("screenGame");
    drawPitch();
    startClock();
    /* After startClock, which is what mints the play id this names. */
    startServerRound();
    $("answer").focus({ preventScroll: true });
  }
  $("homeDaily").addEventListener("click", function () {
      /* AND WHAT THE ACCOUNT SAYS, not only this device. The check above reads
         localStorage, which a device that has never synced does not have, so a
         player signed in on two devices was offered today's board twice and
         banked a score the account then refused. See XIChrome.playedTodayHas,
         which is warmed at chrome init and answers null-as-unknown: a
         signed-out player falls through to their own record, as before. */
    /* The game's own name, written as a literal because tools/build_vowels.js
       rewrites "vowels" to "vowels" when it generates the copy — so this
       line is correct in both without either knowing about the other. */
    /* THE CARD, NOT ANOTHER ROUND. A daily already finished ON THIS DEVICE
       comes back to what it came to, rather than reopening as if it had never
       been played. Checked before the account, because a local record is the
       stronger evidence: it is this device's own, and it carries the score to
       show. What is restored is the RECORD — the letters are not stored and
       this does not invent them. */
    var mine = bankedToday();
    if (mine) { showBanked(mine); return; }
    if (state.board && state.board.no === state.todayNo &&
        window.XIChrome && window.XIChrome.playedTodayHas &&
        window.XIChrome.playedTodayHas("vowels")) {
      say("Today's board is played — you finished it on another device.", "warn");
      return;
    }
    kickOff();
  });

  /* The two sheets. Bound once, here, rather than rebound by renderLanding
     each time a board opens — a handler added on every render is a handler
     that fires as many times as the page has loaded a board. */
  on("homePrevious", "click", openArchive);
  on("archiveClose", "click", closeArchive);
  on("calPrev", "click", function () { stepCalendar(-1); });
  on("calNext", "click", function () { stepCalendar(1); });
  on("homeThemed", "click", openFinals);
  /* The header nav drives the controls that already do these jobs, the same
     way the crossword's does. Both of these were in the markup and wired to
     nothing: "Matches" has been a button that does not react since the landing
     was built, because there was nothing yet for it to open. */
  on("navClubs", "click", openFinals);
  on("navToday", "click", function () {
    if (state.board && state.board.no === state.todayNo) { show("screenStart"); return; }
    openBoard({ kind: "daily" });
  });
  on("finalsClose", "click", closeFinals);
  on("finalsInput", "input", function (ev) {
    finalsFilter = ev.target.value || "";
    renderFinals();
  });

  /* ---- the keyboard ----------------------------------------------------

     THE FAMILY'S KEYS, NOT THE DEVICE'S. This game had a plain text input, so
     a phone raised the system keyboard over the pitch — half the board gone,
     and a different keyboard from the one the crossword draws two taps away.
     shared/xi-keys.js builds the same three rows here; what they mean is this
     game's, and here a letter goes in the answer box.

     inputmode is switched to "none" on a touch device rather than making the
     box readonly: readonly takes the caret with it, and a player needs to see
     where the next letter is going. On anything with a real keyboard nothing
     changes at all — no keys are drawn and the box is typed into as before.

     Only the letters, backspace and enter. Every guess is normalised to A-Z
     before it is marked — see functions/_lib/sc-names.js — so a space bar and
     a hyphen would be two keys that cannot change any answer, taking room
     from the twenty-six that can. */
  function keyInto(ch) {
    if (!state.board || state.over) return;
    var box = $("answer");
    box.value += ch;
    paintTyped();
    maybeAutoSubmit();
  }
  function keyBack() {
    var box = $("answer");
    box.value = box.value.slice(0, -1);
    paintTyped();
  }
  if (window.XIKeys) {
    var onTouch = window.XIKeys.markTouch();
    if (onTouch) $("answer").setAttribute("inputmode", "none");
    window.XIKeys.build($("osk"), { letter: keyInto, back: keyBack, enter: submit });
  }

  $("submit").addEventListener("click", submit);
  /* TYPE ANYWHERE AND THE ANSWER BOX FILLS. There was no key handler outside
     the box itself, so the moment focus was anywhere else — a tile, a button,
     the page after a scroll — typing did nothing at all and the game looked
     frozen. A player should not have to find the input; the whole page is the
     input.
     WHAT IS NOT STOLEN: a key pressed while a real field has focus, anything
     with a modifier (so copy, paste and the browser's own shortcuts still
     work), and anything that is not a single printable character — Tab, the
     arrows and Escape belong to the page. The character is appended by hand
     because focusing an element during a keydown does not deliver THAT key to
     it; without this the first letter typed would be the one that is lost. */
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key == null || e.key.length !== 1) return;
    var box = $("answer");
    if (!box || box.disabled) return;
    var t = e.target, tag = t && t.tagName;
    if (t === box) return;                       // already where it should be
    if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
    if ($("screenGame") && $("screenGame").hidden) return;   // not on the board
    focusAnswer();
    box.value = box.value + e.key;
    box.dispatchEvent(new Event("input", { bubbles: true }));
    e.preventDefault();
  });

  $("answer").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  });
  /* "input", not "keydown": keydown fires before the character lands, so the
     tiles would always be one letter behind, and it misses paste and the
     backspace that empties the box. */
  $("answer").addEventListener("input", function () {
    if (!state.board || state.over) return;
    paintTyped();
    /* The same rule for a real keyboard as for the drawn one: when the letters
       of a slot are used up, the guess goes without waiting for Enter. Bound
       to "input" rather than "keydown" so it also covers a paste and the
       backspace that empties the box. */
    maybeAutoSubmit();
  });
  $("buyHint").addEventListener("click", function () { buy("hint"); });
  /* ONE BUTTON, TWO THINGS TO SELL. An anagram board sells the next letter
     off the front; a consonant board's letters are already on the tile and
     what it can sell is a blank filled in. Same control, same price, and the
     face says which — a button that reads "Reveal a letter" and fills in a
     vowel is a button that lied. */
  $("buyLetter").addEventListener("click", function () {
    buy(bagless() ? "vowel" : "letter");
  });
  $("buyName").addEventListener("click", function () { buy("name"); });
  $("benchClose").addEventListener("click", function () {
    state.picked = null; hideBench(); drawPitch(); paintEcho();
  });

  $("playAgain").addEventListener("click", function () {
    try { localStorage.removeItem(storeKey()); } catch (e) { /* ignore */ }
    location.reload();
  });

  boot();

  /* After boot, deliberately: the board is the page, the owner bar is an extra.
     Ahead of it, the admin check was the first request the page made and pushed
     the board fetch second, which journey_test caught by asserting what the
     FIRST call was. */


  /* A SEAM FOR THE SUITES, and nothing else. supplyFrom is the pure part of
     the rule that decides when a typed name has used up a slot's letters, and
     the interesting case — a scramble that keeps a hyphen or a space, while
     what is typed is stripped to letters — belongs to boards the journey
     suite does not have on screen. Exposed so it can be exercised on those
     boards directly rather than left to a comment. The same seam HiLo keeps
     for subtitleParts, and for the same reason. */
  window.__scx = { supplyFrom: supplyFrom, lettersUsedUp: lettersUsedUp };
})();
