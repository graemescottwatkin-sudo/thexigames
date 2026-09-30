/* Wordsearch XI: Friends — game.js
 *
 * Forked from football/wordsearch/js/game.js (v003e). Same board, same clock,
 * same scoring (football's scoring.js, loaded beside this), same server
 * judging for the daily. What is different:
 *
 *   THE LIST IS CLUES, NOT NAMES. Each line is a clue with its length —
 *   "The One with the _____ (5)" or a question from the Friends bank — and
 *   the answer is what is hunted. So the daily's board arrives with the
 *   clues and NOT the answers (functions/_lib/frws-public.js), and a clue is
 *   ticked off by its place in the list, `n`, which the server names when it
 *   judges a drag. Nothing here is keyed by a word the page was never told.
 *
 *   NOT YET REGISTERED WITH THE FAMILY. The game is in build: it is not in
 *   GAMES or LAUNCHED, so the account, the season, the plays counter and the
 *   permalinks — which all ask that list — are not wired, and results are kept
 *   on this device only. The round's id is minted here rather than by
 *   /api/play for the same reason. See WordsearchXI_Friends/README.md.
 */
(function () {
  "use strict";

  var BUILD = "v000h";
  var GAME = "wordsearch_fr", NAME = "Wordsearch XI: Friends", API = "/api/wordsearch_fr/";
  var PAGE = "https://www.thexigames.com/friends/wordsearch/";
  window.WORDSEARCHXI_FR_BUILD = BUILD;

  var $ = function (id) { return document.getElementById(id); };
  var S = window.XIWS_SCORING;

  var REAL_SECONDS = S.REAL_SECONDS, ROWS = 14, COLS = 12, WORDS = 11;
  function footballMinute() { return S.matchMinute(elapsed, penaltyMinutes); }
  function liveScore() { return S.scoreForMinute(footballMinute()); }
  function finalScore() { return Math.min(S.MAX_SCORE, liveScore() + (bonusFound ? S.BONUS : 0)); }

  /* ---- state ----------------------------------------------------------- */
  var mode = "daily";           // daily | free
  var puzzle = null, serverDay = null, catalogBoards = [];
  /* The clues found, by their place in the list. */
  var found = new Set(), bonusFound = false;
  var foundAt = {};
  /* WHAT EACH FOUND CLUE'S ANSWER IS, and where it sits — learned one at a
     time from the server on the daily, known from the start in free play. */
  var known = Object.create(null);     // n -> { display, grid, placement }
  var secret = null;                   // { display, grid, placement } once known
  var revealed = null;                 // the round's answers, once it is over
  var WORD_COLOURS = ["#61dda1","#63c6ff","#f1bf61","#d991ff","#ff9975",
                      "#78ded2","#b5dc70","#a79cff","#f0a0c5","#8bd3a4","#d6b276"];
  var startedAt = null, elapsed = 0, penaltyMinutes = 0, wrongRun = 0;
  var timer = null, wrongResetTimer = null, toastTimer = null;
  var helpUsed = new Set(), assisted = false;
  var varPauseStart = 0, varPauseUntil = 0, varFrozenScore = 114;
  var bonusWindow = false;
  var dragging = false, startIndex = null, preview = [], cellEls = [];
  var grid = null, hlayer = null;
  var selected = 0;                    // the clue written out under the chips on a phone

  /* ---- storage (this game's prefix) ------------------------------------ */
  var PREFIX = "xifws.", RESULTS_KEY = PREFIX + "results", SCORING_VERSION = 1;
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function fetchKey(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function dailyStorageKey() { return PREFIX + "daily." + serverDay; }
  function readResults() {
    try { var r = JSON.parse(fetchKey(RESULTS_KEY) || "[]"); return Array.isArray(r) ? r : []; }
    catch (e) { return []; }
  }
  function recordResult(rec) {
    var all = readResults().filter(function (r) { return r.day !== rec.day; });
    all.push(rec);
    store(RESULTS_KEY, JSON.stringify(all.slice(-800)));
  }
  function pruneDailyState() {
    try {
      var cutoff = Date.now() - 3 * 86400000, pre = PREFIX + "daily.";
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (!k || (k.indexOf(pre) !== 0 && k.indexOf(PREFIX + "play.") !== 0)) continue;
        var t = Date.parse(k.slice(k.lastIndexOf(".") + 1) + "T00:00:00Z");
        if (isFinite(t) && t < cutoff) localStorage.removeItem(k);
      }
    } catch (e) {}
  }
  /* THE ROUND'S ID, one per device per day: the server's clock, finds and
     fouls hang off it, so a reload resumes the same round. */
  function playIdOf() {
    if (mode !== "daily" || !serverDay) return null;
    var k = PREFIX + "play." + serverDay, id = fetchKey(k);
    if (!id || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) {
      var a = new Uint8Array(12);
      (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; });
      id = "fw" + Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      store(k, id);
    }
    return id;
  }

  function knownList() {
    var out = {};
    Object.keys(known).forEach(function (n) { out[n] = known[n]; });
    return out;
  }
  function dailySnapshot(status) {
    return {
      day: serverDay, puzzle_id: puzzle.id, grid_hash: puzzle.hash,
      scoring_version: SCORING_VERSION, status: status,
      final_score: status === "complete" ? finalScore() : null,
      minute: footballMinute(), elapsed_seconds: elapsed, penalty_minutes: penaltyMinutes,
      found_count: found.size, found: Array.from(found), bonus_found: bonusFound,
      found_at: foundAt, known: knownList(), secret: secret, revealed: revealed,
      saved_at: Date.now(),
    };
  }
  function saveDailyProgress() {
    if (mode !== "daily" || !puzzle || !startedAt || !serverDay) return;
    if (!varActive()) elapsed = (Date.now() - startedAt) / 1000;
    store(dailyStorageKey(), JSON.stringify(dailySnapshot("in_progress")));
  }
  function saveDailyComplete(reason) {
    if (mode !== "daily" || !puzzle || !serverDay) return;
    var snap = dailySnapshot("complete"); snap.reason = reason;
    store(dailyStorageKey(), JSON.stringify(snap));
    recordResult({ game: GAME, day: snap.day, puzzle_id: snap.puzzle_id, status: "complete",
      score: snap.final_score, final_score: snap.final_score, minute: snap.minute,
      found_count: snap.found_count, bonus_found: snap.bonus_found, at: Date.now() });
  }
  function getDailyRecord() {
    try {
      var r = JSON.parse(fetchKey(dailyStorageKey()) || "null");
      if (!r || r.scoring_version !== SCORING_VERSION) return null;
      if (r.puzzle_id !== puzzle.id || r.grid_hash !== puzzle.hash) return null;
      return r;
    } catch (e) { return null; }
  }
  /* Time away is charged on return, capped at an hour — football's rule. */
  function chargeAwayTime(rec) {
    if (!rec || rec.status === "complete" || !rec.saved_at) return rec.elapsed_seconds || 0;
    var away = Math.round((Date.now() - rec.saved_at) / 1000);
    return (rec.elapsed_seconds || 0) + Math.min(Math.max(away, 0), 3600);
  }
  window.addEventListener("pagehide", saveDailyProgress);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") saveDailyProgress();
  });

  /* ---- clock ----------------------------------------------------------- */
  var BONUS_SECONDS = 30;
  function varActive() { return varPauseUntil > 0 && Date.now() < varPauseUntil; }
  function renderScore(v) {
    var shown = v === undefined ? finalScore() : v;
    $("score").textContent = shown;
    if (window.XIBar) XIBar.set({ worth: shown });
    $("scoreStar").textContent = bonusFound ? "★" : "☆";
    $("scoreStar").classList.toggle("found", bonusFound);
  }
  function updateClock() {
    if (varActive()) {
      var left = Math.max(1, Math.ceil((varPauseUntil - Date.now()) / 1000));
      $("varBanner").classList.remove("hidden");
      $("varBanner").querySelector("b").textContent = bonusWindow ? "Bonus time" : "Time out";
      $("varBanner").querySelector("span").textContent = bonusWindow ? "free · find the secret" : "clock stopped";
      $("clock").textContent = bonusWindow ? "BONUS" : "PAUSE";
      if (window.XIBar) XIBar.set({ clock: bonusWindow ? "Bonus" : "Pause" });
      renderScore(varFrozenScore);
      $("varCountdown").textContent = left + "s";
      return;
    }
    $("varBanner").classList.add("hidden");
    $("clock").textContent = footballMinute() + "'";
    if (window.XIBar) XIBar.set({ clock: footballMinute() + "'" });
    renderScore();
  }
  function timerTick() {
    var now = Date.now();
    if (varPauseUntil) {
      if (now < varPauseUntil) { updateClock(); return; }
      if (bonusWindow) {
        bonusWindow = false; varPauseStart = 0; varPauseUntil = 0;
        finish("complete");
        return;
      }
      if (startedAt) startedAt += (varPauseUntil - varPauseStart);
      varPauseStart = 0; varPauseUntil = 0;
      toast("Time in · clock restarted");
    }
    elapsed = startedAt ? (now - startedAt) / 1000 : elapsed;
    updateClock();
    if (footballMinute() >= 90) finish("time");
  }
  function startTimer() {
    if (timer) clearInterval(timer);
    startedAt = Date.now() - elapsed * 1000;
    timer = setInterval(timerTick, 250);
  }

  /* ---- API ------------------------------------------------------------- */
  function api(path) {
    return fetch(API + path, { headers: { "Accept": "application/json" }, credentials: "same-origin" })
      .then(function (r) {
        if (r.ok) return r.json();
        return r.json().then(function (j) {
          var e = new Error((j && j.error) || ("HTTP " + r.status)); e.status = r.status; throw e;
        }, function () { var e = new Error("HTTP " + r.status); e.status = r.status; throw e; });
      });
  }
  function post(path, body) {
    return fetch(API + path, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-XI-Games": "1" },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  /* ---- board rendering and geometry ------------------------------------ */
  function renderGrid() {
    Array.prototype.forEach.call(grid.querySelectorAll(".cell"), function (x) { x.remove(); });
    hlayer.innerHTML = ""; cellEls = [];
    puzzle.grid.join("").split("").forEach(function (ch, i) {
      var d = document.createElement("div");
      d.className = "cell"; d.dataset.i = i; d.textContent = ch;
      d.setAttribute("role", "gridcell");
      grid.appendChild(d); cellEls.push(d);
    });
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", puzzle.theme + " word search grid");
    fitBoard(true);
    syncPanelHeight();
  }
  /* THE CLUES, in the board's order — numbered, because the number is how a
     phone shows them and how the list and the lines agree on a colour. Found
     clues drop below the rest, as football's found names do. */
  function renderWords() {
    var list = $("wordList"); list.innerHTML = "";
    puzzle.answers.forEach(function (a, i) {
      var d = document.createElement("button");
      d.type = "button";
      d.className = "word"; d.dataset.n = i;
      d.style.setProperty("--c", WORD_COLOURS[i % WORD_COLOURS.length]);
      var num = document.createElement("span"); num.className = "wn"; num.textContent = (i + 1);
      var clue = document.createElement("span"); clue.className = "wc"; clue.textContent = a.clue;
      var ans = document.createElement("span"); ans.className = "wa"; ans.hidden = true;
      d.appendChild(num); d.appendChild(clue); d.appendChild(ans);
      d.onclick = function () { selected = i; updateUI(); };
      list.appendChild(d);
    });
  }
  /* THE LIST FITS OR IT FOLDS. The full list shows every clue beside the
     board; where it would overflow -- a phone, or long clues on a tablet or a
     laptop -- the side folds to numbered chips with the chosen clue written
     out (css: .side.compact). Decided by measuring, from the full list each
     time, so a wider window gets the full list back. */
  function fitClues() {
    var side = $("side"), list = $("wordList");
    if (!side || !list) return;
    side.classList.remove("compact");
    if (window.innerWidth <= 760) { side.classList.add("compact"); return; }
    var over = list.scrollHeight > list.clientHeight + 1;
    var last = list.lastElementChild, box = $("bonusBox");
    var below = [last, box].some(function (e) { return e && e.getBoundingClientRect().bottom > window.innerHeight + 1; });
    if (over || below) side.classList.add("compact");
  }
  function syncPanelHeight() {
    var shell = $("gridShell"), side = $("side");
    if (!shell || !side) return;
    var h = shell.getBoundingClientRect().height;
    if (h > 100) side.style.setProperty("--board-h", Math.round(h) + "px");
  }
  if (typeof ResizeObserver === "function") {
    try { new ResizeObserver(function () { fitBoard(); redrawHighlights(); }).observe($("gridShell")); } catch (e) {}
  }
  window.addEventListener("resize", function () { fitBoard(); redrawHighlights(); });
  window.addEventListener("orientationchange", function () { setTimeout(function () { fitBoard(); }, 250); });

  /* ---- zoom and fit: football's, unchanged ------------------------------ */
  var ZOOM_MIN = 22, ZOOM_MAX = 96, ZOOM_STEP = 4, ZOOM_DEFAULT = 34;
  function cellPx() { return parseFloat(getComputedStyle(grid).getPropertyValue("--cell")) || ZOOM_DEFAULT; }
  function setZoom(px) {
    px = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(px)));
    grid.style.setProperty("--cell", px + "px");
    redrawHighlights(); syncPanelHeight();
  }
  var userZoomed = false, fittedAt = 0;
  function fitCell() {
    if (!grid) return ZOOM_DEFAULT;
    var shell = $("gridShell");
    if (!shell) return ZOOM_DEFAULT;
    var w = shell.clientWidth - 16;
    if (!(w > 0)) return ZOOM_DEFAULT;
    var cell = Math.floor(w / COLS);
    if (document.body.classList.contains("locked")) {
      var h = shell.clientHeight - 16;
      if (h > 0) cell = Math.min(cell, Math.floor(h / ROWS));
    }
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cell));
  }
  function fitBoard(force) {
    var shell = $("gridShell");
    var w = shell ? shell.clientWidth : 0;
    if (w <= 0) return;
    var key = document.body.classList.contains("locked") ? w + "x" + shell.clientHeight : w;
    if (!force && key === fittedAt) { syncPanelHeight(); return; }
    fittedAt = key;
    if (userZoomed) { redrawHighlights(); syncPanelHeight(); return; }
    setZoom(fitCell());
  }
  var unlockedFor = null;
  function checkRoom() {
    var body = document.body, app = $("gameApp"), shell = $("gridShell");
    if (!app || app.classList.contains("hidden") || !shell) return;
    fitClues();
    var size = window.innerWidth + "x" + window.innerHeight;
    if (!body.classList.contains("locked")) {
      if (unlockedFor === size) return;
      body.classList.add("locked");
    }
    fitBoard(true);
    var h = shell.clientHeight - 16;
    var tooSmall = h > 0 && Math.floor(h / ROWS) < ZOOM_MIN;
    var over = app.scrollHeight > app.clientHeight + 1;
    if (tooSmall || over) { body.classList.remove("locked"); unlockedFor = size; fitBoard(true); }
    else unlockedFor = null;
  }
  var roomQueued = false;
  function queueRoom() {
    if (roomQueued) return;
    roomQueued = true;
    (window.requestAnimationFrame || setTimeout)(function () { roomQueued = false; checkRoom(); });
  }
  window.addEventListener("resize", function () { unlockedFor = null; fitClues(); queueRoom(); });

  var pts = new Map(), pinchStartDist = 0, pinchStartCell = 0;
  function pinchDist() {
    var a = Array.from(pts.values());
    return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  }
  function onPointerDown(e) {
    if (pending) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && window.innerWidth < 760) { pts.delete(e.pointerId); return; }
    if (pts.size === 2) { dragging = false; setPreview([]); pinchStartDist = pinchDist(); pinchStartCell = cellPx(); return; }
    pointerDown(e);
  }
  function onPointerMove(e) {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      if (pinchStartDist > 0) { userZoomed = true; setZoom(pinchStartCell * (pinchDist() / pinchStartDist)); }
      return;
    }
    pointerMove(e);
  }
  function onPointerEnd(e) {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinchStartDist = 0;
    if (pts.size === 0) pointerUp(e);
  }

  /* ---- selection ------------------------------------------------------- */
  var dirMap = { E:[0,1], W:[0,-1], S:[1,0], N:[-1,0], SE:[1,1], SW:[1,-1], NE:[-1,1], NW:[-1,-1] };
  function idxToRC(i) { return [Math.floor(i / COLS), i % COLS]; }
  function lineCells(a, b) {
    var A = idxToRC(a), B = idxToRC(b);
    var dr = B[0] - A[0], dc = B[1] - A[1];
    if (!(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) return [a];
    var n = Math.max(Math.abs(dr), Math.abs(dc));
    var sr = Math.sign(dr), sc = Math.sign(dc), out = [];
    for (var k = 0; k <= n; k++) out.push((A[0] + sr * k) * COLS + (A[1] + sc * k));
    return out;
  }
  function placementCells(pl, len) {
    var d = dirMap[pl.direction], out = [];
    for (var k = 0; k < len; k++) out.push((pl.start_row + d[0] * k) * COLS + (pl.start_col + d[1] * k));
    return out;
  }
  function sameCells(a, b) {
    if (a.length !== b.length) return false;
    var s = new Set(a); return b.every(function (x) { return s.has(x); });
  }
  /* The daily is judged by the server; free play, which holds the whole
     board on purpose, judges here — football's split. */
  function judgedHere() { return mode !== "daily"; }
  function hitForSelection(cells) {
    for (var i = 0; i < puzzle.answers.length; i++) {
      var a = puzzle.answers[i];
      if (found.has(i)) continue;
      if (sameCells(cells, placementCells(a.placement, a.grid.length))) return { n: i, display: a.display, grid: a.grid, placement: a.placement };
    }
    var b = puzzle.bonus;
    if (b && !bonusFound && sameCells(cells, placementCells(b.placement, b.grid.length))) {
      return { n: null, bonus: true, display: b.display, grid: b.grid, placement: b.placement };
    }
    return null;
  }
  function eventCell(e) {
    var el = document.elementFromPoint(e.clientX, e.clientY);
    return el && el.classList && el.classList.contains("cell") ? +el.dataset.i : null;
  }
  function setPreview(c) {
    preview.forEach(function (i) { if (cellEls[i]) cellEls[i].classList.remove("preview"); });
    preview = c;
    c.forEach(function (i) { if (cellEls[i]) cellEls[i].classList.add("preview"); });
  }
  function pointerDown(e) {
    var i = eventCell(e); if (i == null) return;
    e.preventDefault(); dragging = true; startIndex = i; setPreview([i]);
    if (grid.setPointerCapture) try { grid.setPointerCapture(e.pointerId); } catch (err) {}
  }
  function pointerMove(e) {
    if (!dragging) return;
    var i = eventCell(e); if (i == null) return;
    setPreview(lineCells(startIndex, i));
  }
  /* A find, wherever the verdict came from. */
  function acceptHit(hit) {
    wrongRun = 0; clearTimeout(wrongResetTimer);
    if (hit.bonus) {
      if (bonusFound) return;
      bonusFound = true;
      secret = { display: hit.display, grid: hit.grid, placement: hit.placement };
      drawHighlight(secret, null);
      toast("★ Secret found · " + String(hit.display).toUpperCase() + " · +10");
    } else {
      var n = Number(hit.n);
      if (!(n >= 0) || found.has(n)) return;
      known[n] = { display: hit.display, grid: hit.grid, placement: hit.placement };
      found.add(n); foundAt[n] = footballMinute();
      drawHighlight(known[n], n);
      toast("Found · " + String(hit.display).toUpperCase());
      if (selected === n) selected = nextUnfound(n);
    }
    if (navigator.vibrate) navigator.vibrate(18);
    updateUI(); saveDailyProgress();
  }
  function acceptFoul() {
    wrongRun++;
    var add = Math.min(S.FOUL_STEP_MAX, wrongRun), before = penaltyMinutes;
    penaltyMinutes = Math.min(S.FOUL_CAP, penaltyMinutes + add);
    var applied = penaltyMinutes - before;
    clearTimeout(wrongResetTimer);
    wrongResetTimer = setTimeout(function () { wrongRun = 0; }, S.FOUL_RESET_MS);
    if (applied > 0) showPenalty(applied); else toast("Penalty limit reached");
    updateClock(); saveDailyProgress();
  }
  /* A ROUND THE SERVER CALLS STALE began on a board that is no longer
     today's (the schedule was reloaded under it). Its id is dropped and a
     fresh round kicked off; the drag that learned this is sent again. */
  function renewPlay(retried) {
    try { localStorage.removeItem(PREFIX + "play." + serverDay); } catch (e) {}
    return startServerRound(!!retried);
  }
  /* STALE MID-ROUND: the page is still showing the old board. Resending the
     drag on a fresh round would judge it against a board the player cannot
     see, so the page asks what today's board is. A different one is opened
     in its place, and the player is told why. The same one means only the
     round was stale, so the drag goes again on a fresh round. */
  function boardChanged(cells) {
    api("daily").then(function (r) {
      if (r && r.puzzle && puzzle && r.puzzle.id !== puzzle.id) {
        window.__daily = r.puzzle;
        clearInterval(timer); timer = null;
        startDaily(r.puzzle);
        toast("Today's board has changed");
        return;
      }
      renewPlay().then(function () { sendSelection(cells, true); });
    }).catch(function () {});
  }
  function sendSelection(cells, retried) {
    var last = cells[cells.length - 1];
    post("find", { playId: playIdOf(), from: idxToRC(cells[0]), to: idxToRC(last) })
      .then(function (v) {
        if (v && v.stale && !retried) { boardChanged(cells); return; }
        if (v && v.hit) acceptHit(v.hit);
        else if (v && v.foul) { acceptFoul(); flashWrong(cells); }
      })
      .catch(function () { /* unjudged: the drag simply did not happen */ });
  }
  function flashWrong(cells) {
    cells.forEach(function (i) {
      var c = cellEls[i]; if (!c) return;
      c.classList.add("bad");
      setTimeout(function () { c.classList.remove("bad"); }, 300);
    });
  }
  function pointerUp() {
    if (!dragging) return;
    dragging = false;
    var cells = preview.slice(); setPreview([]);
    if (cells.length < 2) return;
    if (!judgedHere()) { sendSelection(cells); return; }
    var hit = hitForSelection(cells);
    if (hit) { acceptHit(hit); return; }
    acceptFoul();
    flashWrong(cells);
  }
  function showPenalty(mins) {
    var p = $("penaltyPop"); if (!p) return;
    p.textContent = "+" + mins + "'";
    p.classList.remove("show"); void p.offsetWidth; p.classList.add("show");
  }

  /* ---- highlights ------------------------------------------------------ */
  function drawHighlight(item, n) {
    if (!item || !item.placement) return;
    var cells = placementCells(item.placement, item.grid.length);
    var a = cellEls[cells[0]], b = cellEls[cells[cells.length - 1]];
    if (!a || !b) return;
    var g = grid.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    var x1 = ra.left - g.left + ra.width / 2, y1 = ra.top - g.top + ra.height / 2;
    var x2 = rb.left - g.left + rb.width / 2, y2 = rb.top - g.top + rb.height / 2;
    var len = Math.hypot(x2 - x1, y2 - y1), th = ra.width * 0.82;
    var el = document.createElement("div");
    el.className = "hl" + (n == null ? " bonus" : "");
    el.dataset.word = item.grid;
    el.style.width = (len + th) + "px"; el.style.height = th + "px";
    el.style.left = (x1 - th / 2) + "px"; el.style.top = (y1 - th / 2) + "px";
    el.style.transformOrigin = (th / 2) + "px " + (th / 2) + "px";
    el.style.transform = "rotate(" + Math.atan2(y2 - y1, x2 - x1) + "rad)";
    el.style.background = n == null ? "var(--gold)" : WORD_COLOURS[n % WORD_COLOURS.length];
    hlayer.appendChild(el);
  }
  function redrawHighlights() {
    if (!puzzle || !hlayer) return;
    hlayer.innerHTML = "";
    found.forEach(function (n) { if (known[n]) drawHighlight(known[n], n); });
    if (bonusFound && secret) drawHighlight(secret, null);
  }

  /* ---- help: four cards, free play only -------------------------------- */
  function competitive() { return mode === "daily"; }
  function useHelp(name) {
    if (competitive()) { toast("Help is not available on today's board"); return false; }
    if (helpUsed.has(name)) { toast("That card has been used"); return false; }
    if (found.size >= WORDS) return false;
    helpUsed.add(name); assisted = true;
    refreshMenus();
    return true;
  }
  function remaining() {
    var out = [];
    puzzle.answers.forEach(function (a, i) { if (!found.has(i)) out.push(i); });
    return out;
  }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  var HELP = {
    auto: function () {
      if (found.size === WORDS - 1 && !bonusFound) { toast("Find the secret before Auto-fill completes the board"); return; }
      if (!useHelp("auto")) return;
      var rem = remaining(); if (!rem.length) return;
      var n = selected != null && !found.has(selected) ? selected : pick(rem), a = puzzle.answers[n];
      known[n] = { display: a.display, grid: a.grid, placement: a.placement };
      found.add(n); foundAt[n] = "help"; drawHighlight(known[n], n);
      toast("Auto-fill · " + a.display.toUpperCase()); selected = nextUnfound(n); updateUI();
    },
    first: function () {
      if (!useHelp("first")) return;
      var rem = remaining(); if (!rem.length) return;
      var n = selected != null && !found.has(selected) ? selected : pick(rem), a = puzzle.answers[n];
      flash(placementCells(a.placement, a.grid.length)[0], "first-hint", 2200);
      toast("First letter of clue " + (n + 1) + " flashed");
    },
    live: function () {
      if (!useHelp("live")) return;
      var rem = remaining(); if (!rem.length) return;
      var n = selected != null && !found.has(selected) ? selected : pick(rem), a = puzzle.answers[n];
      var cs = placementCells(a.placement, a.grid.length);
      var mid = cs.filter(function (_, i) { return i > 0 && i < cs.length - 1; });
      flash(pick(mid.length ? mid : cs), "live-hint", 6200);
      toast("A letter from clue " + (n + 1) + " highlighted");
    },
    var: function () {
      if (!useHelp("var")) return;
      varPauseStart = Date.now(); varPauseUntil = varPauseStart + 30000;
      varFrozenScore = finalScore();
      updateClock(); toast("Time out · 30 seconds");
    },
  };
  function flash(i, cls, ms) {
    var c = cellEls[i]; if (!c) return;
    c.classList.remove(cls); void c.offsetWidth; c.classList.add(cls);
    setTimeout(function () { c.classList.remove(cls); }, ms);
  }

  /* ---- UI -------------------------------------------------------------- */
  function nextUnfound(from) {
    for (var k = 1; k <= WORDS; k++) {
      var n = (from + k) % puzzle.answers.length;
      if (!found.has(n)) return n;
    }
    return from;
  }
  function updateUI() {
    $("count").textContent = found.size;
    if (window.XIBar) XIBar.set({ progress: found.size + "/" + WORDS });
    $("progress").style.width = (found.size / WORDS * 100) + "%";
    Array.prototype.forEach.call($("wordList").children, function (x) {
      var n = Number(x.dataset.n), done = found.has(n);
      x.classList.toggle("done", done);
      x.classList.toggle("sel", n === selected && !done);
      x.style.order = (done ? 100 : 0) + n;
      var ans = x.querySelector(".wa");
      if (ans) {
        ans.hidden = !done;
        ans.textContent = done && known[n] ? known[n].display : "";
      }
      x.setAttribute("aria-label", "Clue " + (n + 1) + ": " + puzzle.answers[n].clue +
        (done && known[n] ? ". Found: " + known[n].display : ""));
    });
    var now = puzzle.answers[selected];
    $("clueNow").innerHTML = "";
    if (now) {
      var b = document.createElement("b"); b.textContent = (selected + 1) + ".";
      $("clueNow").appendChild(b);
      $("clueNow").appendChild(document.createTextNode(found.has(selected) && known[selected]
        ? known[selected].display : now.clue));
    }
    var bonusLen = (puzzle.bonus && (puzzle.bonus.len || (puzzle.bonus.grid || "").length)) || 0;
    $("bonusState").textContent = bonusFound && secret ? "★ " + secret.display
      : (puzzle.bonus && puzzle.bonus.clue) || "Undiscovered";
    $("bonusSub").textContent = bonusFound ? "+10 points at the end."
      : (bonusLen ? bonusLen + " letters · " : "") + "Hidden in the grid · +10 points";
    if (found.size >= WORDS) {
      if (bonusFound) { finish("complete"); return; }
      if (!bonusWindow) {
        bonusWindow = true;
        varPauseStart = Date.now(); varPauseUntil = varPauseStart + BONUS_SECONDS * 1000;
        varFrozenScore = finalScore();
        $("finishPrompt").classList.add("show");
        updateClock();
      }
    }
  }
  function toast(t) {
    clearTimeout(toastTimer);
    $("toast").textContent = t; $("toast").classList.add("show");
    toastTimer = setTimeout(function () { $("toast").classList.remove("show"); }, 1600);
  }

  /* ---- finishing ------------------------------------------------------- */
  function answerOf(n) {
    if (known[n]) return known[n].display;
    if (puzzle.answers[n].display) return puzzle.answers[n].display;
    return revealed && revealed.answers ? revealed.answers[n] : null;
  }
  function secretName() {
    return (secret && secret.display) || (puzzle.bonus && puzzle.bonus.display) ||
      (revealed && revealed.secret) || null;
  }
  /* The server's word on the round: its score, and — once the round is over
     — the answers to the clues it missed, which the card then names. */
  function askServer() {
    var id = playIdOf();
    if (!id || mode !== "daily") return;
    post("finish", { playId: id }).then(function (v) {
      if (!v) return;
      if (v.reveal) { revealed = v.reveal; saveDailyComplete(lastReason); }
      if (!ftShown) return;
      var o = {}; for (var k in ftShown) o[k] = ftShown[k];
      if (v.verified) { o.score = v.score; o.verified = true; }
      drawFullTime(o);
    }).catch(function () {});
  }
  var lastReason = null;
  function finish(reason) {
    if ($("result").classList.contains("show")) return;
    clearInterval(timer); timer = null;
    dragging = false; setPreview([]);
    $("finishPrompt").classList.remove("show");
    lastReason = reason;
    drawFullTime({ score: finalScore(), minute: footballMinute(), bonus: bonusFound,
                   boxes: boxesOf(foundAt), daily: mode === "daily" });
    saveDailyComplete(reason);
    askServer();
    $("result").classList.add("show");
  }
  function boxesOf(at) {
    return puzzle.answers.map(function (_, n) {
      if (!found.has(n)) return { s: "x" };
      var m = at && at[n];
      if (m === "help") return { s: "a" };
      return { s: "g", m: typeof m === "number" ? m : null };
    });
  }
  var ftShown = null;
  function drawFullTime(o) {
    ftShown = o;
    if (!window.XIFullTime || !XIFullTime.panel) return;
    var n = o.boxes.filter(function (b) { return b.s !== "x"; }).length;
    var help = helpUsed.size ? [helpUsed.size + (helpUsed.size === 1 ? " help card" : " help cards")] : [];
    var stats = n + " of " + WORDS + " found · " + o.minute + "'" +
      (o.bonus ? " · Bonus +10" : " · Bonus missed") + (o.verified ? " · Verified by the server" : "");
    var answers = puzzle.answers.map(function (a, i) {
      var b = o.boxes[i], ans = answerOf(i);
      var clue = a.clue.length > 70 ? a.clue.slice(0, 68).replace(/\s+\S*$/, "") + "…" : a.clue;
      return { s: b.s, m: b.m != null ? b.m : null, points: "",
               text: (i + 1) + ". " + (ans ? ans.toUpperCase() : "(shown when the round is over)") + " — " + clue };
    });
    var sn = secretName();
    if (sn) answers.push({ s: o.bonus ? "g" : "x", m: null, text: "Secret bonus: " + sn, points: "" });
    XIFullTime.panel($("ftPanel"), {
      game: GAME, name: NAME, no: null,
      date: mode === "daily" && serverDay ? XIFullTime.dayLabel(serverDay) : (puzzle.theme || ""),
      score: o.score, max: S.MAX_SCORE, boxes: o.boxes, stats: stats, help: help,
      answers: answers,
      share: function () {
        return NAME + " · " + (mode === "daily" ? "Today's board" : puzzle.theme) + " · " + o.score + "/114\n" +
          XIFullTime.squares(o.boxes);
      },
      url: function () { return PAGE + (mode === "daily" ? "" : "?b=" + puzzle.id); },
    });
  }
  function doShare() {
    var text = NAME + " · " + (mode === "daily" ? "Today's board" : puzzle.theme) + " · " +
      found.size + "/" + WORDS + " found\n" + PAGE + (mode === "daily" ? "" : "?b=" + puzzle.id);
    if (window.XIFullTime && XIFullTime.send) { XIFullTime.send($("shareBtn"), text, "Share"); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast("Copied"); }, function () {});
  }

  /* ---- entering boards ------------------------------------------------- */
  function enterBoard(p, label) {
    puzzle = p;
    foundAt = {}; known = Object.create(null); secret = null; revealed = null; selected = 0;
    if (window.XIBar) {
      XIBar.mount($("xiBar"));
      XIBar.set({ name: NAME, no: null, day: null, old: false,
                  progress: "0/" + WORDS, clock: "0'", score: null, worth: null, subs: null });
    }
    found = new Set(); bonusFound = false; bonusWindow = false;
    elapsed = 0; penaltyMinutes = 0; wrongRun = 0; assisted = false;
    helpUsed = new Set(); varPauseStart = 0; varPauseUntil = 0; varFrozenScore = 114;
    $("prematch").classList.add("hidden");
    $("gameApp").classList.remove("hidden");
    document.body.classList.add("locked");
    queueRoom();
    $("result").classList.remove("show");
    $("finishPrompt").classList.remove("show");
    $("themeTitle").textContent = p.theme;
    $("modeLabel").textContent = label;
    renderGrid(); renderWords(); updateUI(); refreshMenus(); fitClues();
  }
  function restore(rec) {
    found = new Set((rec.found || []).map(Number)); bonusFound = !!rec.bonus_found;
    foundAt = rec.found_at || {}; penaltyMinutes = rec.penalty_minutes || 0;
    Object.keys(rec.known || {}).forEach(function (n) { known[n] = rec.known[n]; });
    secret = rec.secret || null; revealed = rec.revealed || null;
    selected = found.has(0) ? nextUnfound(0) : 0;
  }
  function startDaily(p) {
    mode = "daily";
    enterBoard(p, "Today's board");
    if (window.XIBar) XIBar.set({ day: serverDay, old: false });
    var rec = getDailyRecord();
    if (rec && rec.status === "complete") { showStoredResult(rec); return; }
    if (rec) {
      restore(rec);
      elapsed = chargeAwayTime(rec);
      $("modeLabel").textContent = "Today's board · resumed";
      redrawHighlights(); updateUI();
    }
    startTimer(); updateClock(); saveDailyProgress();
    startServerRound();
  }
  function showStoredResult(rec) {
    clearInterval(timer); timer = null; startedAt = null;
    restore(rec);
    elapsed = rec.elapsed_seconds || 0;
    redrawHighlights(); updateUI();
    $("modeLabel").textContent = "Today's board · completed";
    $("clock").textContent = (rec.minute || 0) + "'";
    renderScore(rec.final_score);
    drawFullTime({ score: rec.final_score, minute: rec.minute || 0, bonus: !!rec.bonus_found,
                   boxes: boxesOf(foundAt), daily: true, stored: true });
    $("result").classList.add("show");
  }
  function startFree(p) {
    mode = "free";
    enterBoard(p, "Free play");
    startTimer(); updateClock();
  }
  /* Kick off on the server's clock. It answers with what this round has
     already found, each with its clue number and placement, so a board
     resumed on another tab or after a cleared cache draws its lines back. */
  function startServerRound(retried) {
    var id = playIdOf();
    if (!id) return Promise.resolve();
    return post("round", { playId: id }).then(function (v) {
      if (v && v.stale && !retried) return renewPlay(true);
      if (!v || !v.verified || !Array.isArray(v.found)) return;
      v.found.forEach(function (h) {
        if (h.bonus) { bonusFound = true; secret = { display: h.display, grid: h.grid, placement: h.placement }; }
        else if (h.n != null) {
          known[h.n] = { display: h.display, grid: h.grid, placement: h.placement };
          if (!found.has(h.n)) { found.add(h.n); foundAt[h.n] = footballMinute(); }
        }
      });
      updateUI(); redrawHighlights(); saveDailyProgress();
    }).catch(function () {});
  }

  /* ---- the landing ----------------------------------------------------- */
  var featuredId = null, pending = null, archiveDays = null;
  function setDailyState(text) { var el = $("homeDailyState"); if (el) el.textContent = text || ""; }
  function weekIndex() {
    var d = new Date();
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 604800000);
  }
  function pickFeatured() {
    if (!catalogBoards.length) return null;
    var ordered = catalogBoards.slice().sort(function (x, y) { return x.id < y.id ? -1 : 1; });
    return ordered[weekIndex() % ordered.length];
  }
  function nudge(el) { if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" }); }
  function openBoard(board, kicker, note) {
    if (!board) return;
    hidePanels();
    api("puzzle?id=" + encodeURIComponent(board.id)).then(function (r) {
      pending = { puzzle: r.puzzle };
      mode = "free";
      enterBoard(r.puzzle, "Free play");
      $("kickKicker").textContent = kicker || "BOARD";
      $("kickTitle").textContent = r.puzzle.theme;
      $("kickNote").textContent = note || (r.puzzle.category + " · free play, no streak at stake");
      $("gameApp").classList.add("covered");
      $("kickCover").classList.remove("hidden");
    }, function (err) {
      if (err && err.status === 401 && window.XIChrome && window.XIChrome.archive) {
        window.XIChrome.archive.askToRegister(err.message);
        return;
      }
      toast("Board unavailable");
    });
  }
  function uncover() {
    pending = null;
    $("gameApp").classList.remove("covered");
    $("kickCover").classList.add("hidden");
  }
  function selectBoard(id, kicker, note) {
    var b = catalogBoards.find(function (x) { return x.id === id; });
    if (!b) return false;
    openBoard(b, kicker, note);
    return true;
  }
  function renderLanding() {
    var f = pickFeatured();
    featuredId = f ? f.id : null;
    if (f) { $("homeFeaturedName").textContent = f.theme; $("homeFeaturedState").textContent = f.category; }
    $("homePreviousCount").textContent = archiveDays
      ? (archiveDays.length ? archiveDays.length + (archiveDays.length === 1 ? " day so far" : " days so far")
                            : "The first day is today")
      : "Every day so far";
  }
  function dayLabel(day) {
    var d = new Date(day + "T00:00:00Z");
    if (isNaN(d.getTime())) return day;
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  }
  function hidePanels() {
    ["archivePanel", "catalogPanel"].forEach(function (id) { $(id).classList.add("hidden"); });
    $("homePrevious").setAttribute("aria-expanded", "false");
    $("homeThemed").setAttribute("aria-expanded", "false");
  }
  function togglePanel(panelId, btnId, render) {
    var panel = $(panelId), open = panel.classList.contains("hidden");
    hidePanels();
    if (!open) return;
    panel.classList.remove("hidden");
    $(btnId).setAttribute("aria-expanded", "true");
    render();
    nudge(panel);
  }
  /* EVERY BOARD, by category — football links out to server-rendered theme
     pages; this game has no pages of its own yet, so the list is here. */
  function renderCatalog() {
    var box = $("catalogList"); box.innerHTML = "";
    var played = {};
    readResults().forEach(function (r) { if (r && r.puzzle_id) played[r.puzzle_id] = r; });
    var groups = {}, order = [];
    catalogBoards.forEach(function (b) {
      if (!groups[b.category]) { groups[b.category] = []; order.push(b.category); }
      groups[b.category].push(b);
    });
    order.sort(function (a, b) {
      var na = /^Season (\d+)/.exec(a), nb = /^Season (\d+)/.exec(b);
      if (a === "Episode titles") return -1; if (b === "Episode titles") return 1;
      if (na && nb) return na[1] - nb[1]; if (na) return -1; if (nb) return 1;
      return a < b ? -1 : 1;
    });
    order.forEach(function (cat) {
      var g = document.createElement("div"); g.className = "cat-group";
      var h = document.createElement("h3"); h.textContent = cat; g.appendChild(h);
      var ol = document.createElement("ol"); ol.className = "arch-list";
      groups[cat].forEach(function (b) {
        var li = document.createElement("li"), btn = document.createElement("button");
        btn.type = "button"; btn.className = "arch-row cat"; btn.setAttribute("data-id", b.id);
        var t = document.createElement("span"); t.className = "arch-theme"; t.textContent = b.theme;
        var s = document.createElement("span"); s.className = "arch-state";
        s.textContent = played[b.id] ? "Played" : "";
        btn.appendChild(t); btn.appendChild(s); li.appendChild(btn); ol.appendChild(li);
      });
      g.appendChild(ol); box.appendChild(g);
    });
    $("catalogSub").textContent = catalogBoards.length ? catalogBoards.length + " boards" : "Loading…";
  }
  function renderArchive() {
    var list = $("archiveList");
    if (!list) return;
    list.innerHTML = "";
    if (!archiveDays) { $("archiveSub").textContent = "Loading…"; return; }
    if (!archiveDays.length) {
      var empty = document.createElement("li");
      empty.className = "arch-empty";
      empty.textContent = "The first day is today — come back tomorrow.";
      list.appendChild(empty);
      $("archiveSub").textContent = "";
      return;
    }
    var played = {};
    readResults().forEach(function (r) { if (r && r.day) played[r.day] = r; });
    archiveDays.forEach(function (e) {
      var rec = played[e.day];
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.className = "arch-row" + (rec ? " done" : "");
      b.setAttribute("data-id", e.id); b.setAttribute("data-day", e.day);
      [["arch-day", dayLabel(e.day)], ["arch-theme", e.theme],
       ["arch-state", rec ? (rec.score != null ? rec.score + " pts" : "Played") : "To play"]]
        .forEach(function (p) { var s = document.createElement("span"); s.className = p[0]; s.textContent = p[1]; b.appendChild(s); });
      li.appendChild(b); list.appendChild(li);
    });
    $("archiveSub").textContent = archiveDays.length + (archiveDays.length === 1 ? " day" : " days");
  }
  function goToMenu() {
    if (mode === "daily" && startedAt && found.size < WORDS) saveDailyProgress();
    clearInterval(timer); timer = null; startedAt = null;
    varPauseUntil = 0; bonusWindow = false;
    uncover();
    $("result").classList.remove("show");
    $("gameApp").classList.add("hidden");
    $("prematch").classList.remove("hidden");
    document.body.classList.remove("locked");
    renderLanding();
    if (location.hash) location.hash = "";
  }

  /* ---- menus ----------------------------------------------------------- */
  var MENUS = [["gameMenu","gameBtn"],["helpMenu","helpBtn"],["zoomMenu","zoomBtn"]];
  function closeMenus(except) {
    MENUS.forEach(function (pair) {
      var m = $(pair[0]), b = $(pair[1]);
      if (!m || !b) return;
      if (pair[0] !== except) m.classList.add("hidden");
      b.setAttribute("aria-expanded", m.classList.contains("hidden") ? "false" : "true");
    });
  }
  function toggleMenu(menuId, btnId) {
    var m = $(menuId); if (!m) return;
    var willOpen = m.classList.contains("hidden");
    closeMenus(willOpen ? menuId : null);
    m.classList.toggle("hidden", !willOpen);
    $(btnId).setAttribute("aria-expanded", willOpen ? "true" : "false");
    if (willOpen) refreshMenus();
  }
  function refreshMenus() {
    document.querySelectorAll("#helpMenu .menuRow[data-help]").forEach(function (r) {
      var used = helpUsed.has(r.dataset.help);
      r.disabled = competitive() || used;
      var meta = r.querySelector(".menuMeta");
      if (meta) meta.textContent = competitive() ? "daily" : used ? "used" : meta.dataset.base;
    });
    var note = $("helpNote");
    if (note) note.textContent = competitive()
      ? "Help is not available on today's board."
      : "Each card once per board. First letter, live letter and auto-fill work on the selected clue.";
    var ver = $("menuVer"); if (ver) ver.textContent = "build " + BUILD;
  }

  /* ---- boot ------------------------------------------------------------ */
  function boot() {
    grid = $("grid"); hlayer = $("highlightLayer");
    $("buildTag").textContent = BUILD;
    pruneDailyState();

    grid.addEventListener("pointerdown", onPointerDown);
    grid.addEventListener("pointermove", onPointerMove);
    grid.addEventListener("pointerup", onPointerEnd);
    grid.addEventListener("pointercancel", onPointerEnd);

    $("homeDaily").onclick = function () {
      if (!window.__daily) { toast("No board today — try Other boards"); return; }
      startDaily(window.__daily);
    };
    $("homeThemed").onclick = function () { togglePanel("catalogPanel", "homeThemed", renderCatalog); };
    $("homePrevious").onclick = function () { togglePanel("archivePanel", "homePrevious", renderArchive); };
    $("homeFeatured").onclick = function () {
      if (!selectBoard(featuredId, "BOARD OF THE WEEK")) toast("No board this week");
    };
    $("catalogList").onclick = function (ev) {
      var row = ev.target.closest ? ev.target.closest(".arch-row") : null;
      if (row) selectBoard(row.getAttribute("data-id"), "EVERY BOARD");
    };
    $("archiveList").onclick = function (ev) {
      var row = ev.target.closest ? ev.target.closest(".arch-row") : null;
      if (!row) return;
      var day = row.getAttribute("data-day");
      var entry = (archiveDays || []).find(function (e) { return e.day === day; });
      if (entry) openBoard(entry, "PREVIOUS DAILY · " + dayLabel(day).toUpperCase(),
        "Free play — only today's board keeps a streak going.");
    };
    $("kickBtn").onclick = function () {
      if (!pending) return;
      var p = pending.puzzle;
      uncover();
      startFree(p);
    };
    $("gameBtn").onclick = function () { toggleMenu("gameMenu", "gameBtn"); };
    $("helpBtn").onclick = function () { toggleMenu("helpMenu", "helpBtn"); };
    $("zoomBtn").onclick = function () { toggleMenu("zoomMenu", "zoomBtn"); };
    $("setBtn").onclick = function (ev) {
      ev.stopPropagation(); closeMenus();
      if (window.XIChrome && window.XIChrome.settings) window.XIChrome.settings.open($("setBtn"));
    };
    document.querySelectorAll("#gameMenu .menuRow").forEach(function (r) {
      r.onclick = function () {
        closeMenus();
        if (r.dataset.act === "menu") { goToMenu(); return; }
        if (r.dataset.act === "daily") { goToMenu(); if (window.__daily) startDaily(window.__daily); }
      };
    });
    document.querySelectorAll("#helpMenu .menuRow[data-help]").forEach(function (r) {
      r.onclick = function () { closeMenus(); HELP[r.dataset.help](); };
    });
    document.querySelectorAll("#zoomMenu .menuRow[data-zoom]").forEach(function (r) {
      r.onclick = function () {
        var z = r.dataset.zoom;
        if (z === "in") { userZoomed = true; setZoom(cellPx() + ZOOM_STEP); }
        else if (z === "out") { userZoomed = true; setZoom(cellPx() - ZOOM_STEP); }
        else { userZoomed = false; setZoom(fitCell()); }
      };
    });
    document.addEventListener("pointerdown", function (e) { if (!e.target.closest(".menuWrap")) closeMenus(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenus(); });
    $("keepBtn").onclick = function () { $("finishPrompt").classList.remove("show"); };
    $("finishBtn").onclick = function () { finish("complete"); };
    $("shareBtn").onclick = doShare;
    $("againBtn").onclick = function () { goToMenu(); if (featuredId) selectBoard(featuredId, "BOARD OF THE WEEK"); };
    $("resultMenuBtn").onclick = goToMenu;

    api("daily").then(function (r) {
      serverDay = r.day; window.__daily = r.puzzle;
      setDailyState(r.puzzle ? "" : "No board scheduled today — Other boards are open.");
    }, function () { setDailyState("Could not reach the server — check your connection."); });
    api("catalog").then(function (r) {
      catalogBoards = r.boards || [];
      renderLanding();
      if (!$("catalogPanel").classList.contains("hidden")) renderCatalog();
      /* ?b= opens a named board on its start card — the door a shared free-play result links to. */
      var q = (location.search.match(/[?&]b=(FRWS-\d{4})/) || [])[1];
      if (q && !selectBoard(q, "SHARED BOARD")) toast("That board is not available");
    }, function () { setDailyState("Could not load the board list."); });
    api("archive").then(function (r) {
      archiveDays = r.days || [];
      renderLanding();
      if (!$("archivePanel").classList.contains("hidden")) renderArchive();
    }, function () { $("archiveSub").textContent = "Could not load the list."; });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
