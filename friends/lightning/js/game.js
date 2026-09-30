/* Lightning Round XI: Friends — game script. Forked from
 * football/quickfire/js/game.js.
 *
 * BUILD must equal the ?v= tag on this game's assets in index.html.
 *
 * NOTHING ABOUT A SCORE IS DECIDED HERE, QuickFire's rule:
 *
 *   the deal     is the server's — /start deals the run and serves question one
 *   the clock    is the server's — ninety seconds from /start, less two a miss
 *   the marking  is the server's — /answer says right or wrong and which was
 *                                  right, and sends the next
 *   the score    is the server's — /finish counts its own rows
 *
 * EVERY ANSWER IS SHOWN THE MOMENT IT IS GIVEN (the owner, 29 Sep 2026,
 * "Immediately upon answering", reversing the 28 Sep hold to the end): the
 * pick goes red when it is wrong and the right option green, for a one-second
 * look the clock runs through -- shown filling, with the seconds it cost
 * called out at the clock. The Full Time panel lists them again.
 *
 * WHICH BOARD. /friends/lightning/daily/<no> is board <no>, the family's daily
 * number; the front page is today's. The page asks /api/lightning_fr/daily
 * which day that is before anything starts, and the server bounds it.
 */
var BUILD = "v001e";

(function () {
  'use strict';
  console.log("Lightning Round build " + BUILD);

  /* The family's naming, "<game> XI: Friends", as Crossword XI: Friends and
     Who Am I XI: Friends are: the bar and a shared result say whose it is. */
  var NAME = "Lightning Round XI: Friends";
  var CONFIG = window.LR_CONFIG;
  /* THE STORAGE PREFIX, written out rather than read from CONFIG: the family's
     alignment suite reads it here, and resolves every key built from it.
     deploy_check holds it equal to CONFIG.STORAGE_PREFIX. */
  var PREFIX = "xifl.";
  var KEY_RECENT = PREFIX + "recent.v1";     // ids, most recent first
  /* THE DAY'S RESULTS, one row a day, the first finished daily run wins.
     The key the Friends streaks read (shared/xi-played.js) and the account
     merges, so its rows carry the server's `day` and the moment the run
     finished (`at`): a run finished on a later day is not that day's play. */
  var KEY_RESULTS = PREFIX + "results.v1";
  var KEY_RUN = PREFIX + "run.v1";           // the run in progress, for a reload

  /* ------------------------------------------------------------- storage */

  function read(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  /* One writer per key, so every key written is a named constant. Private
     browsing throws; the game plays on without saving. */
  function saveRecent(list) {
    try { localStorage.setItem(KEY_RECENT, JSON.stringify(list)); } catch (e) {}
  }
  function saveResults(list) {
    try { localStorage.setItem(KEY_RESULTS, JSON.stringify(list)); } catch (e) {}
  }
  function saveRun(r) {
    try { localStorage.setItem(KEY_RUN, JSON.stringify(r)); } catch (e) {}
  }
  function forgetRun() {
    try { localStorage.removeItem(KEY_RUN); } catch (e) {}
  }

  function noteSeen(id) {
    var list = read(KEY_RECENT, []);
    if (!Array.isArray(list)) list = [];
    list = [id].concat(list.filter(function (x) { return x !== id; }));
    saveRecent(list.slice(0, CONFIG.RECENT_KEEP));
  }

  function dayLabel(iso) {
    var p = String(iso).split('-');
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Number(p[2]) + ' ' + m[Number(p[1]) - 1] + ' ' + p[0];
  }

  /* ----------------------------------------------------------------- api */

  /* CSRF: the family header, defined once in functions/_lib/auth.js. */
  function call(path, body) {
    var opts = { method: body ? 'POST' : 'GET',
                 headers: { "X-XI-Games": "1" },
                 credentials: 'same-origin', cache: 'no-store' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var err = new Error((j && j.error) || ('HTTP ' + r.status));
          err.status = r.status;
          err.body = j || {};
          throw err;
        }
        return j;
      });
    });
  }

  /* ------------------------------------------------------------ elements */

  var el = {};
  ['screenStart', 'screenGame', 'screenResults', 'startKicker', 'playDaily', 'playPractice',
    'todayDone', 'startBlurb', 'startNote', 'timerFill', 'clue', 'options', 'feedback', 'penalty', 'lookBar',
    'ftPanel', 'ftReport', 'ftPractice', 'ftBack'].forEach(function (id) { el[id] = document.getElementById(id); });
  var timerBox = document.querySelector('.timer');

  /* --------------------------------------------------------------- state */

  var board = null;      // { no, day, isToday } — the daily this address is
  var run = null;        // { runId, mode, day, no, score, wrong, marks: [] }
  var current = null;    // the question on screen
  var busy = false;      // one request in flight
  var ending = false;

  /* THE CLOCK IS A DISPLAY OF THE SERVER'S. Every response carries msLeft;
     the display is anchored to it and counts down from there, so a miss's
     three seconds show as the server charged them. */
  var clock = { anchorAt: 0, anchorLeft: 0, running: false, frame: null };

  function leftNow() {
    return Math.max(0, clock.anchorLeft - (Date.now() - clock.anchorAt));
  }
  function anchor(msLeft) {
    clock.anchorAt = Date.now();
    clock.anchorLeft = Math.max(0, Number(msLeft) || 0);
  }
  function renderClock() {
    var left = leftNow();
    el.timerFill.style.width = (100 * left / CONFIG.RUN_MS) + '%';
    el.timerFill.classList.toggle('late', left <= 10000);
    if (window.XIBar) XIBar.set({ clock: Math.ceil(left / 1000) + 's' });
    return left;
  }
  function tick() {
    if (!clock.running) return;
    if (renderClock() <= 0) { clock.running = false; timeUp(); return; }
    clock.frame = requestAnimationFrame(tick);
  }
  function startTicking() {
    clock.running = true;
    if (clock.frame) cancelAnimationFrame(clock.frame);
    clock.frame = requestAnimationFrame(tick);
  }
  function stopTicking() {
    clock.running = false;
    if (clock.frame) cancelAnimationFrame(clock.frame);
  }
  /* The server's clock does not stop for a hidden tab, so neither does this. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && clock.running) renderClock();
  });

  /* ----------------------------------------------------------- rendering */

  function show(id) {
    if (id === 'screenGame') el.screenGame.setAttribute('data-played', '');
    /* FULL TIME OVER THE ROUND (the owner, 30 Sep 2026: "Card over the
       board, every game"). The result is the family's sheet (data-xft-host),
       so the round just played stays on screen under it rather than being
       swapped out -- but only a round played in this visit: a result opened
       later has no round behind it, and an empty frame under the sheet would
       read as something broken. */
    var under = id === 'screenResults' && el.screenGame.hasAttribute('data-played');
    ['screenStart', 'screenGame', 'screenResults'].forEach(function (s) { el[s].hidden = !(s === id || (under && s === 'screenGame')); });
    document.body.classList.toggle('playing', id === 'screenGame');
    queueRoom();
  }

  function setFeedback(text, kind) {
    el.feedback.textContent = text || '';
    el.feedback.className = 'feedback' + (kind ? ' ' + kind : '');
  }

  function renderBar() {
    if (!window.XIBar || !run) return;
    XIBar.set({ progress: String((run.marks.length || 0) + (current ? 1 : 0)),
                score: run.score, worth: null, subs: null });
  }

  function renderQuestion(q) {
    current = { idx: q.idx, id: q.id, options: q.options, settled: false };
    noteSeen(q.id);
    el.clue.textContent = q.clue;
    el.options.innerHTML = '';
    q.options.forEach(function (option) {
      var b = document.createElement('button');
      b.className = 'option';
      b.type = 'button';
      b.textContent = option;
      b.addEventListener('click', function () { pick(option, b); });
      el.options.appendChild(b);
    });
    setFeedback('');
    hideLook();
    renderBar();
    queueRoom();
  }

  /* QuickFire's: the option whose text is the answer. The importer refuses a
     set without exactly one, so this lights one button and never two. */
  function markRight(answer) {
    Array.prototype.forEach.call(el.options.querySelectorAll('.option'), function (b) {
      if (b.textContent === answer) b.classList.add('right');
    });
  }

  /* THE COST, AT THE CLOCK: "−2s" pops out under the bar's own clock, which
     the shared bar draws, so it is placed by the clock slot's position rather
     than written into a bar this game does not own. */
  function showPenalty(secs, totalSecs) {
    var tag = el.penalty;
    if (!tag || !secs) return;
    var slot = document.querySelector('#xiBar [data-k="clock"]');
    var host = el.screenGame.getBoundingClientRect();
    if (slot) {
      var r = slot.getBoundingClientRect();
      tag.style.left = (r.left - host.left) + 'px';
      tag.style.top = (r.bottom - host.top + 2) + 'px';
    }
    /* AND THE RUNNING TOTAL once there is more than this one (the owner,
       29 Sep 2026: "show the total time lost"). */
    tag.textContent = '−' + secs + 's' + (totalSecs > secs ? ' · ' + totalSecs + 's lost' : '');
    tag.classList.remove('show'); void tag.offsetWidth; tag.classList.add('show');
  }

  /* THE LOOK, FILLING: 0 to 100% across the pause after a miss, so a player
     sees the game is showing them something and not stuck. */
  function showLook(ms) {
    var bar = el.lookBar;
    if (!bar) return;
    bar.style.setProperty('--look', (Number(ms) || 0) + 'ms');
    bar.classList.remove('on'); void bar.offsetWidth; bar.classList.add('on');
  }
  function hideLook() { if (el.lookBar) el.lookBar.classList.remove('on'); }

  function lockOptions(on) {
    Array.prototype.forEach.call(el.options.querySelectorAll('.option'), function (b) { b.disabled = on; });
  }

  /* ---- the locked screen (QuickFire's fitQuestion/checkRoom) ------------ */

  function fitQuestion() {
    var clue = el.clue;
    var opts = el.options.querySelectorAll('.option');
    clue.style.fontSize = '';
    Array.prototype.forEach.call(opts, function (b) { b.style.fontSize = ''; });
    if (!document.body.classList.contains('locked') || el.screenGame.hidden) return;
    var screen = el.screenGame;
    var over = function () {
      return screen.scrollHeight > screen.clientHeight + 1 || clue.scrollHeight > clue.clientHeight + 1;
    };
    var size = parseFloat(getComputedStyle(clue).fontSize) || 24;
    while (over() && size > 15) { size -= 1; clue.style.fontSize = size + 'px'; }
    var osize = opts.length ? (parseFloat(getComputedStyle(opts[0]).fontSize) || 16) : 16;
    while (over() && osize > 13) {
      osize -= 1;
      Array.prototype.forEach.call(opts, function (b) { b.style.fontSize = osize + 'px'; });
    }
  }
  function checkRoom() {
    var body = document.body;
    var want = body.classList.contains('playing');
    body.classList.toggle('locked', want);
    fitQuestion();
    if (want && (el.screenGame.scrollHeight > el.screenGame.clientHeight + 1 ||
                 el.clue.scrollHeight > el.clue.clientHeight + 1)) {
      body.classList.remove('locked');
      fitQuestion();
    }
  }
  var roomQueued = false;
  function queueRoom() {
    if (roomQueued) return;
    roomQueued = true;
    (window.requestAnimationFrame || setTimeout)(function () { roomQueued = false; checkRoom(); });
  }
  window.addEventListener('resize', queueRoom);

  /* ------------------------------------------------------------- the run */

  function setStartButtons(disabled) {
    el.playDaily.disabled = disabled || !board;
    el.playPractice.disabled = el.ftPractice.disabled = disabled;
  }

  function begin(mode) {
    if (busy) return;
    if (mode === 'daily' && !board) return;
    busy = true;
    setStartButtons(true);
    var body = { mode: mode };
    if (mode === 'daily') body.no = board.no;
    if (mode === 'practice') body.recent = read(KEY_RECENT, []);
    call('/api/lightning_fr/start', body)
      .then(function (r) { busy = false; enter(r); })
      .catch(function (e) {
        busy = false;
        setStartButtons(false);
        show('screenStart');
        el.startNote.textContent = e.status === 429 ? 'That is a lot of runs. Give it a few minutes.'
          : e.status === 503 ? 'Lightning Round cannot reach its questions. That is our end, not yours.'
          : 'Could not start a run. Try again in a moment.';
      });
  }

  /* INTO A RUN, fresh or resumed: the server has said where it is. */
  function enter(r) {
    run = { runId: r.runId, mode: r.mode, day: r.day, no: r.no, score: r.score || 0, wrong: r.wrong || 0, marks: [] };
    saveRun({ runId: r.runId, mode: r.mode, day: r.day, no: r.no });
    ending = false;
    if (window.XIBar) {
      XIBar.mount(document.getElementById('xiBar'));
      /* `day` is left out for practice: the bar turns a day into its date
         line, and a null one would wipe "Practice". */
      XIBar.set(r.mode === 'daily'
        ? { name: NAME, no: r.no, day: r.day, old: r.isToday === false }
        : { name: NAME, no: null, date: 'Practice', old: false });
    }
    show('screenGame');
    playsStart(r.mode, r.day, r.no, r.isToday);
    renderQuestion(r.question);
    anchor(r.msLeft);
    renderClock();
    startTicking();
  }

  function pick(option, button) {
    if (busy || ending || !current || current.settled) return;
    busy = true;
    lockOptions(true);
    button.classList.add('chosen');
    call('/api/lightning_fr/answer', { runId: run.runId, idx: current.idx, pick: option })
      .then(function (r) { busy = false; settle(r, button); })
      .catch(function (e) {
        busy = false;
        if (e.body && e.body.over) { stopTicking(); finish(); return; }
        console.error('Lightning Round:', e);
        button.classList.remove('chosen');
        setFeedback('That did not reach us — try again.', 'miss');
        lockOptions(false);
      });
  }

  /* WHAT THE SERVER SAID. Every number here came back from it. */
  function settle(r, button) {
    current.settled = true;
    run.score = r.score;
    run.wrong = r.wrong;
    run.marks.push(r.correct ? 1 : 0);
    anchor(r.msLeft);
    renderClock();
    button.classList.add(r.correct ? 'right' : 'wrong');
    /* THE RIGHT ONE, LIT GREEN, from the verdict: the server names it for the
       question it has just settled, and for no other. */
    if (r.answer) markRight(r.answer);
    if (r.correct) {
      setFeedback('+1', 'good');
    } else {
      /* WHAT THE MISS COST, as the server charged it: said beside the clock,
         and the look shown filling so the pause reads as time going. */
      var cost = Math.round((Number(r.penaltyMs) || 0) / 1000);
      setFeedback('Wrong — the right one is in green', 'miss');
      run.lostMs = (run.lostMs || 0) + (Number(r.penaltyMs) || 0);
      showPenalty(cost, Math.round(run.lostMs / 1000));
      showLook(CONFIG.WRONG_PAUSE_MS);
      if (timerBox) { timerBox.classList.remove('hit'); void timerBox.offsetWidth; timerBox.classList.add('hit'); }
    }
    renderBar();
    var pause = r.correct ? CONFIG.RIGHT_PAUSE_MS : CONFIG.WRONG_PAUSE_MS;
    setTimeout(function () {
      if (ending) return;
      if (r.next && leftNow() > 0) renderQuestion(r.next);
      else { stopTicking(); finish(); }
    }, pause);
  }

  /* ZERO ON THE PAGE. If a pick is in flight its answer decides what happens;
     otherwise ask the server to blow the whistle. */
  function timeUp() {
    lockOptions(true);
    if (busy) return;
    finish();
  }

  function finish() {
    if (ending) return;
    ending = true;
    stopTicking();
    lockOptions(true);
    call('/api/lightning_fr/finish', { runId: run.runId })
      .then(function (r) {
        forgetRun();
        if (r.mode === 'daily') bankDaily(r);
        playsEnd(true);
        showResults(r);
      })
      .catch(function (e) {
        /* THE SERVER STILL HAS TIME ON ITS CLOCK — the page's drifted. Pick
           up where the server is rather than end a run it has not ended. */
        if (e.status === 409 && e.body && e.body.msLeft > 0) {
          ending = false;
          anchor(e.body.msLeft);
          if (current && !current.settled) lockOptions(false);
          startTicking();
          return;
        }
        console.error('Lightning Round finish:', e);
        showResults({ mode: run.mode, day: run.day, no: run.no, score: run.score, wrong: run.wrong,
                      answered: run.marks.length, marks: run.marks, answers: [], offline: true });
      });
  }

  /* ------------------------------------------------------------ results */

  function readResults() {
    var all = read(KEY_RESULTS, []);
    return Array.isArray(all) ? all : [];
  }
  function resultFor(day) {
    var all = readResults();
    for (var i = 0; i < all.length; i++) if (all[i] && all[i].day === day) return all[i];
    return null;
  }

  function bankDaily(r) {
    if (resultFor(r.day)) return;    // the first run of the day is the day's
    var all = readResults();
    all.push({ game: 'lightning_fr', day: r.day, no: r.no, score: r.score, answered: r.answered,
               wrong: r.wrong, marks: r.marks, at: Date.now() });
    saveResults(all.slice(-800));
    pushResults();
  }

  /* ---- the account ------------------------------------------------------

     QuickFire's shape (football/quickfire/js/game.js), which is HiLo's: the
     server says who is signed in, the page pushes its rows on a sign-in and
     pulls the account's, first result banked wins, the account's row wins
     outright on a pull. */
  var account = null;

  function accountNote(what, err) {
    try { console.warn('[account] ' + what + ' failed:', err && err.message ? err.message : err); } catch (e) {}
  }

  function pushResults() {
    if (!account) return Promise.resolve(null);
    return call('/api/account/migrate', { game: 'lightning_fr', results: readResults() })
      .catch(function (e) { accountNote('push', e); return null; });
  }

  function pullResults() {
    if (!account) return Promise.resolve(null);
    return call('/api/account/results?game=lightning_fr').then(function (r) {
      var remote = (r && r.results) || [];
      if (!remote.length) return null;
      var byDay = {};
      readResults().forEach(function (x) { if (x && x.day) byDay[x.day] = x; });
      remote.forEach(function (x) { if (x && x.day) byDay[x.day] = x; });
      var merged = Object.keys(byDay).sort().map(function (k) { return byDay[k]; });
      saveResults(merged.slice(-800));
      describeBoard();
      return merged.length;
    }).catch(function (e) { accountNote('pull', e); return null; });
  }

  function syncAccount() {
    return call('/api/auth/session').then(function (r) {
      account = (r && r.user) || null;
      if (!account) return null;
      return pushResults().then(pullResults);
    }).catch(function (e) { accountNote('session', e); return null; });
  }

  document.addEventListener('xi:account', function (ev) {
    var d = ev.detail || {};
    if (d.type === 'signout') { account = null; return; }
    syncAccount();
  });

  /* ---- counting plays ---------------------------------------------------

     The family's anonymous counter (shared/xi-plays.js): how many runs start
     and how many finish, nothing about the person. */
  function playsStart(mode, day, no, isToday) {
    if (!window.XIPlays) return;
    window.XIPlays.start({
      game: 'lightning_fr',
      mode: mode === 'daily' ? (isToday === false ? 'archive' : 'daily') : 'practice',
      boardKey: mode === 'daily' ? 'frlr:' + day : null,
      dailyNo: mode === 'daily' ? no : null,
      total: CONFIG.RUN_LENGTH
    }, function () {
      return { solved: run ? run.score : 0, elapsed: 0,
               detail: { score: run ? run.score : 0, wrong: run ? run.wrong : 0 } };
    });
  }
  function playsEnd(completed) {
    if (window.XIPlays && window.XIPlays.active()) window.XIPlays.end(!!completed);
  }

  function boardHref(no) {
    var base = location.pathname.replace(/\/daily(?:\/[^\/]*)?\/?$/, '/').replace(/\/?$/, '/');
    return location.origin + base + 'daily/' + encodeURIComponent(no);
  }

  /* FULL TIME, THE FAMILY'S WAY (shared/xi-fulltime.js). The ring is the run's
     right answers out of the ones it tried; the boxes are the run in order;
     the folded "Your answers" is where a missed one's answer is first shown. */
  function showResults(r) {
    var daily = r.mode === 'daily';
    var kept = daily ? resultFor(r.day) : null;
    /* A replayed daily is not the day's result: the first one is, and the
       share and the kicker say so. */
    var isFirst = !kept || (kept.score === r.score && JSON.stringify(kept.marks) === JSON.stringify(r.marks));
    var marks = r.marks || [];
    var boxes = marks.map(function (m) { return { s: m ? 'g' : 'r' }; });
    var answered = r.answered != null ? r.answered : marks.length;
    var shown = isFirst ? r : kept;
    if (window.XIFullTime && XIFullTime.panel) {
      XIFullTime.panel(el.ftPanel, {
        game: 'lightning_fr', name: NAME, no: daily ? r.no : null,
        kicker: "Time's up",
        date: daily ? (isFirst ? XIFullTime.dayLabel(r.day) : 'Played again') : 'Practice',
        score: r.score, max: answered, boxes: boxes, tally: true,
        /* THE TIME THE MISSES COST, the server's own sum of what it charged. */
        stats: r.offline ? 'This result did not reach us, so it is the page’s own count.'
          : (r.lostMs ? Math.round(r.lostMs / 1000) + ' seconds lost to wrong answers' : 'No time lost to wrong answers'),
        answers: (r.answers || []).map(function (a) {
          return { s: a.correct ? 'g' : 'r', text: a.clue || '', was: a.correct ? null : a.answer,
                   points: a.correct ? 1 : 0 };
        }),
        share: function () {
          var sm = (shown && shown.marks) || marks;
          return NAME + (daily ? ' · #' + r.no : ' · practice') + '\n' +
            '⚡ ' + (shown ? shown.score : r.score) + ' in ' + Math.round(CONFIG.RUN_MS / 1000) + ' seconds\n' +
            XIFullTime.squares(sm.map(function (m) { return { s: m ? 'g' : 'r' }; }));
        },
        url: function () { return daily ? boardHref(r.no) : location.origin + '/friends/lightning/'; }
      });
    }
    renderReport(r.answers || [], daily ? r.day : 'practice');
    current = null;
    setStartButtons(false);
    show('screenResults');
    describeBoard();
  }

  /* ---- reporting a question ---------------------------------------------

     The answer is shown the moment a pick is marked, so a question that is
     wrong -- or a wrong option that is also right -- is seen at once, and this
     is where a player says so. The family's endpoint (/api/report-clue), which
     keeps one report per question per person and asks the player to be signed
     in. The reports reach the question bank's owners by the bank's own id. */
  var REASON_RIGHT = 'I was right';
  var REASON_WRONG = 'The question is wrong';

  function renderReport(answers, puzzle) {
    var box = el.ftReport;
    if (!box) return;
    box.innerHTML = '';
    var list = answers.filter(function (a) { return a && a.id; });
    if (!list.length) return;
    var det = document.createElement('details');
    det.className = 'lrReport';
    var sum = document.createElement('summary');
    sum.textContent = 'Something wrong with a question?';
    det.appendChild(sum);
    var note = document.createElement('p');
    note.className = 'lrReportNote';
    note.textContent = 'Tell us and we will check it against the episode.';
    det.appendChild(note);
    var ol = document.createElement('ol');
    list.forEach(function (a) {
      var li = document.createElement('li');
      var q = document.createElement('p');
      q.className = 'lrReportClue';
      q.textContent = a.clue || '';
      li.appendChild(q);
      var row = document.createElement('div');
      row.className = 'lrReportBtns';
      /* "I was right" only where the pick was marked wrong; a question can be
         wrong either way. */
      var reasons = a.correct ? [REASON_WRONG] : [REASON_RIGHT, REASON_WRONG];
      var buttons = reasons.map(function (reason) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn';
        b.textContent = reason;
        b.addEventListener('click', function () { report(a.id, reason, puzzle, buttons, li); });
        row.appendChild(b);
        return b;
      });
      li.appendChild(row);
      ol.appendChild(li);
    });
    det.appendChild(ol);
    box.appendChild(det);
  }

  function report(id, reason, puzzle, buttons, li) {
    buttons.forEach(function (b) { b.disabled = true; });
    var said = li.querySelector('.lrReportSaid') || li.appendChild(document.createElement('p'));
    said.className = 'lrReportSaid';
    call('/api/report-clue', { game: 'lightning_fr', itemId: id, reason: reason, puzzle: puzzle })
      .then(function () { said.textContent = 'Reported. Thank you.'; })
      .catch(function (e) {
        buttons.forEach(function (b) { b.disabled = false; });
        if (e.status === 401) {
          said.textContent = 'Sign in to report a question.';
          var A = window.XIChrome && XIChrome.account;
          if (A && typeof A.open === 'function') A.open();
        } else {
          said.textContent = e.status === 429 ? 'That is a lot of reports. Try again shortly.'
            : 'That did not reach us. Try again.';
        }
      });
  }

  /* ---------------------------------------------------------- the start */

  /* THE BOARD THIS ADDRESS IS, named on the card: "Today's run · #11", or a
     past run's number and date, never called today's. */
  function describeBoard() {
    if (!board) return;
    var done = resultFor(board.day);
    el.startKicker.textContent = board.isToday
      ? 'Today’s run · #' + board.no
      : 'Run #' + board.no + ' · ' + dayLabel(board.day);
    if (done) {
      el.todayDone.hidden = false;
      el.todayDone.textContent = (board.isToday ? 'Today: ' : 'Your run: ') + done.score + ' correct';
      el.playDaily.textContent = 'Play it again';
      el.startNote.textContent = 'Your first run of the day is the one that counts.';
    } else {
      el.todayDone.hidden = true;
      el.playDaily.textContent = board.isToday ? 'Play today’s run' : 'Play run #' + board.no;
    }
    setStartButtons(busy);
  }

  el.playDaily.addEventListener('click', function () { begin('daily'); });
  el.playPractice.addEventListener('click', function () { begin('practice'); });
  el.ftPractice.addEventListener('click', function () { begin('practice'); });
  el.ftBack.addEventListener('click', function () { show('screenStart'); });

  /* WHICH BOARD: the family's reader of a /daily/<no> address, else today's. */
  var permaNo = window.XIChrome && window.XIChrome.permalink ? window.XIChrome.permalink.read() : null;
  var askedNo = /^\d+$/.test(permaNo || '') ? permaNo : null;
  call('/api/lightning_fr/daily' + (askedNo ? '?no=' + encodeURIComponent(askedNo) : ''))
    .then(function (b) { board = { no: b.no, day: b.day, isToday: !!b.isToday }; describeBoard(); })
    .catch(function (e) {
      el.startKicker.textContent = e.status === 404 ? 'No such run' : 'No connection';
      el.startNote.textContent = e.status === 404
        ? 'That run has not been a daily yet, or never was. Practice is open.'
        : 'Today’s run did not load. Try again in a moment.';
    });

  syncAccount();

  /* A RUN LEFT MID-WAY. The clock kept going while the page was away; ask the
     server where the run is, and either carry on or blow the whistle. */
  var left = read(KEY_RUN, null);
  if (left && left.runId) {
    busy = true;
    call('/api/lightning_fr/start', { runId: left.runId })
      .then(function (r) {
        busy = false;
        if (r.over) {
          run = { runId: left.runId, mode: left.mode, day: left.day, no: left.no, score: 0, wrong: 0, marks: [] };
          finish();
        } else {
          enter(r);
        }
      })
      .catch(function () { busy = false; forgetRun(); show('screenStart'); });
  } else {
    show('screenStart');
  }
})();
