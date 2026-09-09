/* game.js — Ballpark XI in the browser.
 *
 * WHAT THIS FILE DOES NOT HAVE, and cannot get: the answers. It is handed the
 * SHAPE of each question — the text, the detail line, the slider's ends, its
 * step, its unit, the width of the ballpark and whether it is graded strictly —
 * and the number itself never leaves the server. So the page cannot grade, and
 * does not try: it locks a guess, sends it, and renders the verdict that comes
 * back. See functions/_lib/bp-board.js for the other half.
 *
 * NOR DOES IT TIME ITSELF. The countdown on screen is a rendering of the
 * server's clock, started when the page said it was showing a question and
 * measured between that moment and the moment the guess arrives. A page that
 * sent its own elapsed time would be a page that chooses its own score.
 *
 * The reference demo grades in the page, which means every answer is in the
 * page. That is right for a local file and wrong for a served game — the word
 * search shipped one board whole and had two live leaks to close before its
 * score could mean anything.
 */
(function () {
  "use strict";
  var R = window.XIBP;
  if (!R) return;

  var $ = function (id) { return document.getElementById(id); };
  var DOT = "·", SQ_ON = "🟩", SQ_OFF = "🟥";

  var board = null, token = null, playId = null, no = null;
  var step = 0, locked = false, touched = false, over = false;
  var lo = 0, hi = 100, timer = null;
  /* The server's clock for THIS question: when it opened, and the offset
     between this device's clock and the server's, so a device set five minutes
     fast does not show five minutes of a twenty-second question gone. */
  var clockMs = 0, skew = 0, clockLen = R.CLOCK, narrowedSecs = 0;
  var results = [], points = [], bangOns = 0, subsUsed = 0, lockedSecs = 0;
  var scoreNow = 0, resultLetter = null, answers = null;

  var slider = $("slider"), track = $("track"), big = $("big"), ghost = $("ghost");
  var ladder = $("ladder"), sheet = $("sheet");

  /* ---- talking to the server ------------------------------------------- */

  function post(path, body) {
    return fetch("/api/ballpark/" + path, {
      method: "POST",
      headers: { "content-type": "application/json", "X-XI-Games": "1" },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .catch(function () { return {}; });
  }

  /* ---- the numbers on screen -------------------------------------------- */

  /* Years read as years: no thousands separator when the whole range sits in
     1000..2100, because "1,966" is not how anybody writes it. */
  function fmt(n, q) {
    q = q || board.questions[step];
    if (q && Number(q.lo) >= 1000 && Number(q.hi) <= 2100) return String(n);
    return Number(n).toLocaleString("en-GB");
  }

  function now() { return Date.now() + skew; }
  function elapsed() { return clockMs ? Math.max(0, (now() - clockMs) / 1000) + narrowedSecs : 0; }
  function secsLeft() { return Math.max(0, clockLen - elapsed()); }
  function offer() { return R.pointsAt(elapsed(), clockLen); }

  /* ---- the ladder that applies ------------------------------------------
   * DRAWN FROM THE QUESTION, not written into the page. A strict question is
   * graded on shorter, steeper terms, and the player is shown them BEFORE they
   * lock — which is the half the demo got wrong first time round, where the
   * ladder was hardcoded markup that never changed. */
  function drawGrades(q, worth, hitGrade) {
    var L = R.ladderFor(q), out = "";
    for (var i = 0; i < L.length; i++) {
      var at = L[i][0], label = L[i][2];
      var note = at === 0.25 ? " <b>quarter of a ballpark</b>"
               : at === 1 ? ""
               : at === Infinity ? ""
               : " <b>" + at + " ballparks</b>";
      out += "<li" + (hitGrade === label ? ' class="hit"' : "") + "><span>" +
             label + note + "</span><b>" + Math.round(worth * L[i][1]) + "</b></li>";
    }
    $("gradesList").innerHTML = out;
    $("gradesHead").textContent = q && q.strict
      ? "What it is worth — graded strictly" : "What it is worth";
  }

  /* ---- painting ---------------------------------------------------------- */

  function pct(x) { return ((x - lo) / (hi - lo)) * 100; }
  function span(el, a, b) {
    var l = Math.max(lo, a), r = Math.min(hi, b);
    el.style.left = pct(l) + "%";
    el.style.width = (pct(r) - pct(l)) + "%";
  }

  function paint() {
    var q = board.questions[step];
    track.className = "track" + (touched || locked ? "" : " untouched");
    if (touched || locked) {
      big.className = "big";
      $("val").textContent = fmt(slider.value);
      $("unit").textContent = q.unit || "";
    } else {
      big.className = "big empty";
      $("val").textContent = "Tap the track to place your guess";
      $("unit").textContent = "";
    }
    $("lock").disabled = !touched || locked || over;

    /* The ballpark's width, carried by the player's own knob: how precise, not
       where. Safe to draw because tolerance is a WIDTH — without the answer it
       locates nothing. */
    if (touched && !locked && !over) {
      span(ghost, Number(slider.value) - Number(q.tolerance),
                  Number(slider.value) + Number(q.tolerance));
      ghost.className = "ghost on";
    } else ghost.className = "ghost";

    for (var i = 0; i < ladder.children.length; i++) {
      var d = ladder.children[i];
      d.className = results[i] === true ? "ok" : results[i] === false ? "bad"
        : (i === step && !over ? "cur" : "");
    }
    for (var j = 0; j < sheet.children.length; j++) {
      var li = sheet.children[j], r = results[j];
      li.className = r === true ? "ok" : r === false ? "bad" : "";
      li.querySelector("span").textContent = r === undefined ? ""
        : board.questions[j].question.replace(/\?$/, "");
      li.querySelector("em").textContent = r === undefined ? ""
        : (answersSeen[j] === undefined ? "" : fmt(answersSeen[j], board.questions[j]) + " " + DOT + " ") +
          points[j];
    }
    $("running").textContent = scoreNow;

    var dots = $("subs").querySelectorAll("i");
    for (var k = 0; k < dots.length; k++) dots[k].classList.toggle("spent", k < subsUsed);
    $("subsSay").textContent = subsUsed >= R.SUBS ? "No substitutions left"
      : (R.SUBS - subsUsed) + (R.SUBS - subsUsed === 1 ? " substitution" : " substitutions");
    $("narrowCost").textContent = subsUsed >= R.SUBS
      ? "no subs left, " + R.NARROW_SECS + " seconds" : "1 sub, free";
  }

  /* The answers, as they are revealed one lock at a time. Never all at once,
     and never before the lock that reveals each one. */
  var answersSeen = [];

  function tick() {
    if (over || locked) return;
    var left = secsLeft(), worth = offer();
    var el = $("secs");
    el.innerHTML = Math.ceil(left) + "<small>s</small>";
    el.className = "secs" + (left <= 3 ? " warn" : "");
    $("worth").textContent = Math.round(worth);
    drawGrades(board.questions[step], worth, null);
    if (left <= 0) lock(true);
  }

  /* ---- a question -------------------------------------------------------- */

  function show() {
    var q = board.questions[step];
    locked = false; touched = false; narrowedSecs = 0; clockLen = R.CLOCK;
    $("q").innerHTML = escapeHtml(q.question) +
      (q.detail ? "<small>" + escapeHtml(q.detail) + "</small>" : "");
    setRange(Number(q.lo), Number(q.hi), Number(q.step) || 1);
    $("band").className = "band"; $("mark").className = "mark";
    var v = $("verdict"); v.textContent = ""; v.className = "verdict";
    $("lock").disabled = true;
    $("next").hidden = true; $("next").disabled = true;
    $("lock").hidden = false;
    $("narrow").disabled = false;
    slider.disabled = false;

    /* THE CLOCK STARTS WHEN THE QUESTION IS SHOWN, and the server is told so
       here — it will not grade a question it was never told was open. Asking
       twice does nothing: the clock only moves forward. */
    post("open", { token: token, playId: playId, idx: step + 1 }).then(function (r) {
      if (r && r.clockMs) {
        /* The server's clock, and the difference between it and this device's,
           taken once per question. */
        skew = Number(r.now) - Date.now();
        clockMs = Number(r.clockMs);
      } else {
        skew = 0; clockMs = Date.now();
      }
      if (r && typeof r.subsUsed === "number") subsUsed = r.subsUsed;
      if (!timer) timer = setInterval(tick, 100);
      paint(); tick();
    });
    paint();
  }

  function setRange(a, b, st) {
    lo = a; hi = b;
    slider.min = a; slider.max = b; slider.step = st;
    slider.value = Math.round(((a + b) / 2) / st) * st;
    $("lo").textContent = fmt(a); $("hi").textContent = fmt(b);
  }

  /* ---- locking ----------------------------------------------------------- */

  function lock(byClock) {
    if (over || locked || (!touched && !byClock)) return;
    locked = true;
    lockedSecs = Math.ceil(secsLeft());
    slider.disabled = true;
    $("lock").disabled = true; $("narrow").disabled = true;

    post("answer", {
      token: token, playId: playId, idx: step + 1, guess: Number(slider.value),
    }).then(function (r) {
      settle(r);
    });
  }

  function settle(r) {
    var q = board.questions[step];
    results[step] = !!r.green;
    points[step] = Number(r.points) || 0;
    if (r.grade === "Bang on") bangOns++;
    /* THE SERVER'S COUNT WINS WHEN THERE IS ONE. Without a database there is no
       round to count, so the page keeps its own tally from the verdicts it has
       been given — otherwise the substitutions read "3 left" all the way
       through a board that has spent them, which is the page telling the player
       something untrue. It is not a second source of the score: where the
       server answers, its number replaces this one outright. */
    if (typeof r.subsUsed === "number") subsUsed = r.subsUsed;
    else if (r.spentSub) subsUsed++;
    if (typeof r.score === "number") scoreNow = r.score;
    else scoreNow = Math.min(R.MAX_SCORE,
      points.reduce(function (a, p) { return a + (p || 0); }, 0) +
      Math.min(R.BONUS_CAP, bangOns));
    if (typeof r.answer === "number") answersSeen[step] = r.answer;
    if (r.answers) answers = r.answers;

    /* THE BAND AND THE TRUE VALUE, now that the question is finished — the
       first moment either may be drawn, because until the lock the answer was
       not in this page at all. */
    if (typeof r.answer === "number") {
      span($("band"), r.answer - Number(q.tolerance), r.answer + Number(q.tolerance));
      $("band").className = "band on";
      $("mark").style.left = pct(r.answer) + "%";
      $("mark").className = "mark on";
    }

    $("secs").innerHTML = lockedSecs + "<small>s</small>";
    $("secs").className = "secs";
    $("worth").textContent = points[step];
    drawGrades(q, points[step], r.grade);

    var v = $("verdict");
    v.className = "verdict " + (r.green ? "ok" : "bad");
    v.textContent = (r.grade || "") +
      (typeof r.answer === "number"
        ? " " + DOT + " it was " + fmt(r.answer, q) + (q.unit ? " " + q.unit : "") : "") +
      " " + DOT + " " + points[step] + (points[step] === 1 ? " point" : " points") +
      (r.spentSub ? " and a substitution" : "");

    $("lock").hidden = true;
    $("next").hidden = false; $("next").disabled = false;
    $("next").focus();
    paint();

    if (r.over) { fullTime(r); }
  }

  /* ---- narrowing ---------------------------------------------------------- */

  $("narrow").addEventListener("click", function () {
    if (over || locked) return;
    $("narrow").disabled = true;
    post("narrow", { token: token, playId: playId, idx: step + 1 }).then(function (r) {
      if (!r || typeof r.lo !== "number") { $("narrow").disabled = false; return; }
      var q = board.questions[step];
      setRange(Number(r.lo), Number(r.hi), Number(q.step) || 1);
      touched = false;
      if (typeof r.subsUsed === "number") subsUsed = r.subsUsed;
      else if (r.cost && r.cost.sub) subsUsed++;
      /* WHAT IT COST. A substitution while there were any; four seconds of this
         question's clock once there were not — added to the elapsed time, the
         way the server charges it, rather than taken off the clock's length,
         which would charge for them twice. */
      if (r.cost && r.cost.seconds) narrowedSecs += Number(r.cost.seconds);
      paint(); tick();
    });
  });

  /* ---- the controls ------------------------------------------------------ */

  slider.addEventListener("input", function () {
    if (locked || over) return;
    touched = true; paint();
  });

  /* A range thumb on iOS only moves if the thumb itself is dragged, and this
     one is hidden until the player commits — so the knob is driven by hand:
     tap the track anywhere to place it, then drag to adjust. The same handling
     the reference demo needed for the same reason. */
  function valueFromX(x) {
    var rect = slider.getBoundingClientRect();
    var st = Number(slider.step) || 1;
    var t = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
    return Math.round((lo + t * (hi - lo)) / st) * st;
  }
  function drive(ev) {
    if (locked || over) return;
    slider.value = valueFromX(ev.clientX);
    touched = true; paint();
    ev.preventDefault();
  }
  slider.addEventListener("pointerdown", function (ev) {
    if (locked || over) return;
    try { slider.setPointerCapture(ev.pointerId); } catch (e) {}
    slider.focus(); drive(ev);
  });
  slider.addEventListener("pointermove", function (ev) {
    if (ev.buttons === 0 && ev.pointerType === "mouse") return;
    if (!slider.hasPointerCapture || !slider.hasPointerCapture(ev.pointerId)) return;
    drive(ev);
  });

  $("lock").addEventListener("click", function () { lock(false); });
  $("next").addEventListener("click", function () {
    if (over || !locked) return;
    if (step < board.questions.length - 1) { step++; show(); return; }
    /* THE ELEVENTH. With a database the answer route has already said `over`
       and full time has been shown; without one it never will, and the board
       would simply stop with the last verdict on screen and no way forward.
       The result is worked out here in that case only — the same rule, from the
       same file, over the verdicts this page was given. */
    if (!over) {
      fullTime({
        score: scoreNow,
        result: subsUsed <= R.SUBS ? "W" : "D",
      });
    }
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter") return;
    if (!locked) { if (touched) lock(false); }
    else $("next").click();
    ev.preventDefault();
  });

  /* ---- full time ---------------------------------------------------------- */

  function fullTime(r) {
    if (over) return;
    over = true;
    if (timer) { clearInterval(timer); timer = null; }
    scoreNow = typeof r.score === "number" ? r.score : scoreNow;
    resultLetter = r.result || "L";
    var words = { W: "Win", D: "Draw", L: "Loss" };
    var green = results.filter(function (x) { return x === true; }).length;
    var calls = results.map(function (x) { return x ? SQ_ON : SQ_OFF; }).join("");
    var share = "Ballpark XI " + DOT + " " + (no ? "#" + no : "today") + "\n" + calls + "\n" +
      green + "/" + R.QUESTIONS + " in the ballpark, " + bangOns + " bang on " + DOT + " " +
      scoreNow + "/" + R.MAX_SCORE + " " + DOT + " " + (words[resultLetter] || "") +
      "\nthexigames.com";
    $("ftScore").textContent = scoreNow;
    var rr = $("ftRes");
    rr.textContent = words[resultLetter] || "";
    rr.className = "res " + resultLetter;
    $("ftShare").textContent = share;
    $("ft").hidden = false;
    $("copy").onclick = function () {
      try { navigator.clipboard.writeText(share); } catch (e) {}
    };
    paint();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---- previous boards ---------------------------------------------------
   *
   * The days the calendar has actually reached, from the server, newest first.
   * The page does not work out which days exist and does not work out what day
   * it is: both come from /api/ballpark/archive, which stops at today.
   */
  var archiveDays = null, serverDay = null, freeArchiveDays = null, todayNo = null;

  function dayLabel(day) {
    var d = new Date(day + "T00:00:00Z");
    return d.toLocaleDateString("en-GB",
      { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  }

  /* BEYOND THE FREE WINDOW NEEDS AN ACCOUNT, and the rule is the server's — the
     archive route refuses it whatever this says. Shown here so a locked row
     looks locked before it is pressed, rather than answering with a 401. */
  function archiveLocked(day) {
    if (freeArchiveDays == null || !serverDay) return false;
    var chrome = window.XIChrome && window.XIChrome.account;
    if (!chrome) return false;
    if (chrome.user()) return false;
    if (chrome.available && !chrome.available()) return false;
    var back = Math.round(
      (Date.parse(serverDay + "T00:00:00Z") - Date.parse(day + "T00:00:00Z")) / 86400000);
    return back > freeArchiveDays;
  }

  function renderArchive() {
    var list = $("archiveList");
    if (!list || !archiveDays) return;
    list.innerHTML = "";
    if (!archiveDays.length) {
      var empty = document.createElement("li");
      empty.className = "arch-empty";
      empty.textContent = "The first board is today — come back tomorrow.";
      list.appendChild(empty);
      $("archiveSub").textContent = "";
      return;
    }
    archiveDays.forEach(function (e) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "arch-row" + (archiveLocked(e.day) ? " locked" : "");
      b.setAttribute("data-no", e.no);
      var day = document.createElement("span");
      day.className = "arch-day"; day.textContent = dayLabel(e.day);
      var theme = document.createElement("span");
      theme.className = "arch-theme";
      theme.textContent = e.no === todayNo ? "Today" : "Board " + e.no;
      var state = document.createElement("span");
      state.className = "arch-state"; state.textContent = "To play";
      b.appendChild(day); b.appendChild(theme); b.appendChild(state);
      li.appendChild(b); list.appendChild(li);
    });
    $("archiveSub").textContent = archiveDays.length +
      (archiveDays.length === 1 ? " day so far" : " days so far");
  }

  function toggleArchive() {
    var panel = $("archivePanel");
    if (!panel.classList.contains("hidden")) {
      panel.classList.add("hidden");
      $("homePrevious").setAttribute("aria-expanded", "false");
      return;
    }
    panel.classList.remove("hidden");
    $("homePrevious").setAttribute("aria-expanded", "true");
    renderArchive();
    if (panel.scrollIntoView) panel.scrollIntoView({ block: "nearest" });
  }

  $("homePrevious").addEventListener("click", toggleArchive);
  $("archiveList").addEventListener("click", function (ev) {
    var row = ev.target.closest && ev.target.closest(".arch-row");
    if (!row) return;
    if (row.classList.contains("locked")) {
      $("archiveSub").textContent = "The last " + freeArchiveDays +
        " days are free for everyone. Sign in to play the rest.";
      return;
    }
    kickOff(Number(row.getAttribute("data-no")));
  });

  fetch("/api/ballpark/archive").then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.days) return;
      archiveDays = d.days;
      todayNo = d.today;
      serverDay = d.days.length ? d.days[0].day : null;
      freeArchiveDays = d.freeArchiveDays;
      $("homePreviousCount").textContent = archiveDays.length
        ? archiveDays.length + (archiveDays.length === 1 ? " day so far" : " days so far")
        : "The first board is today";
    }).catch(function () {});

  /* ---- kick off ----------------------------------------------------------- */

  function startRound(data) {
    board = data.board; token = board.token; no = data.no;
    step = 0; results = []; points = []; answersSeen = []; bangOns = 0;
    subsUsed = 0; scoreNow = 0; over = false;

    ladder.innerHTML = ""; sheet.innerHTML = "";
    board.questions.forEach(function (q, i) {
      var d = document.createElement("i"); ladder.appendChild(d);
      var li = document.createElement("li");
      li.innerHTML = "<b>" + (i + 1) + "</b><span></span><em></em>";
      sheet.appendChild(li);
    });

    $("screenStart").hidden = true;
    $("screenGame").hidden = false;
    show();
  }

  $("homeDaily").addEventListener("click", function () { kickOff(null); });

  /* ONE WAY IN, whichever card was pressed. `no` is null for today and a board
     number for a previous day; the server decides whether that number may be
     opened at all, and answers 403 for a day that has not come and 401 for one
     past the free window. */
  function kickOff(no) {
    $("homeDaily").disabled = true;
    /* THE PLAY ID, AND WHY THIS GAME MINTS ITS OWN FOR NOW.
       /api/play refuses a game that is not in GAMES, and this one is not: it is
       in testing, like QuickFire XI, and an unreleased game must not be a value
       that can reach the results tables. But a round still has to be identified
       to be scored, and bp_round/bp_answer are this game's own tables — nothing
       here writes `results`, `plays` or the season, so a round scored under a
       locally minted id counts for this board and for nothing else. That is the
       correct behaviour for a game in testing anyway: it should not be able to
       move a streak or a season it has not launched into.
       On the day it launches this asks /api/play like every other game, and the
       fallback stays for the request that fails. */
    playId = "bp-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 10);
    fetch("/api/play", {
      method: "POST",
      headers: { "content-type": "application/json", "X-XI-Games": "1" },
      body: JSON.stringify({ game: "ballpark", mode: "daily" }),
    }).then(function (r) { return r.json(); }).catch(function () { return {}; })
      .then(function (p) {
        if (p && p.playId) playId = p.playId;
        return fetch("/api/ballpark/daily" + (no ? "?no=" + no : ""))
          .then(function (r) { return r.json(); });
      })
      .then(function (data) {
        if (!data || !data.board) {
          $("startState").textContent = data && data.error
            ? data.error : "No board for that day.";
          $("homeDaily").disabled = false;
          return;
        }
        startRound(data);
      })
      .catch(function () { $("homeDaily").disabled = false; });
  }
})();
