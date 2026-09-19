/* QuickFire XI — game script.
 *
 * BUILD must equal the ?v= tag on every one of this game's assets in
 * index.html. deploy_check.mjs checks they agree and that the tag moved when
 * the bytes did.
 *
 * NOTHING about a board lives in this file. The questions and the options come
 * from /api/quickfire/daily at run time, which is why the gate can assert there
 * is no bank in any public file.
 *
 * AND NOTHING ABOUT A SCORE IS DECIDED HERE EITHER, which is what changed on
 * 15 September 2026. This page used to be a typing game: it received the ANSWER
 * with every question — eleven a day, in plain text, one curl — because it
 * revealed letters out of the answer string as the clock ran and could not draw
 * a board without it. That made the leak load-bearing rather than careless, and
 * it is why removing the field and rewriting this file were one change.
 *
 * With four options the page needs neither the answer nor the marking. So:
 *
 *   the clock    is the server's — /next stamps when a question was served
 *   the marking  is the server's — /answer compares and returns right or wrong
 *   the score    is the server's — /finish adds it up from its own rows
 *
 * What is left here is what a page is for: drawing it, and remembering it
 * locally so a player who closes the tab comes back to where they were.
 *
 * The typing machinery this file used to carry — reveal.js, matching.js,
 * enumeration.js — is deleted rather than left loaded. So are adapters.js and
 * board_file.js, which existed to build a board out of a bank the page was
 * sent; the payload IS the board now. challenge.js encoded clue ids into a
 * link so a friend could replay the exact eleven, and that is now a board
 * number in the fragment, which is shorter and does not describe the board.
 */
var BUILD = "v001j";

(function bootstrap() {
  'use strict';
  console.log("QuickFire XI build " + BUILD);

  /* CSRF. The family header, defined once in functions/_lib/auth.js. */
  function api(path, body) {
    return fetch(path, {
      method: body ? "POST" : "GET",
      headers: { "X-XI-Games": "1", "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  window.QFX_API = api;

  /* A SHARED BOARD IS A NUMBER NOW. #b=27 is the twenty-seventh board, which
     the server resolves and bounds; it cannot name a board that has not run.
     The old #x= links carried encoded clue ids and the page built the board
     from them — there is no bank here to build from any more, so an old link
     opens today's Daily and says so rather than failing. */
  var hash = location.hash || "";
  var askedNo = (/[#&]b=(\d+)/.exec(hash) || [])[1];
  var staleLink = /[#&]x=/.test(hash);

  var url = "/api/quickfire/daily" + (askedNo ? "?no=" + encodeURIComponent(askedNo) : "");

  /* WHAT THE PLAYER IS TOLD WHEN THERE IS NO BOARD, and the rule is that a
   * PERMANENT condition must not be dressed as a transient one.
   *
   * Until 13 September 2026 every failure here produced one sentence — "Today's
   * questions didn't load. Try again in a moment." — and the commonest cause
   * was that the qf_ tables did not exist in the database at all. The retry it
   * invited could never succeed. Nobody reported it in the weeks it was live,
   * because a visitor who is told to wait a moment waits, and then leaves. That
   * is the whole cost of the wrong word: a fault that reports itself as
   * temporary is a fault nobody escalates.
   */
  function failure(status, wantedBoard) {
    if (status === 404 && wantedBoard) {
      return ["No such board",
        "That board has not been a Daily yet, or never was. Trying again will not change it."];
    }
    if (status === 404) {
      return ["No board today",
        "There is no QuickFire board for today. That is not a connection problem, so trying again will not help."];
    }
    if (status === 503) {
      return ["Our end",
        "QuickFire cannot reach its questions. This is a fault on our side, not yours, and we can see it."];
    }
    return ["No connection",
      "Today's questions didn't load. Try again in a moment."];
  }

  api(url)
    .then(function (r) {
      /* The CODE is carried on the error rather than left inside its message:
         the catch has three cases to tell apart, and "HTTP 404" in a string is
         a format the next person reasonably reformats. */
      if (!r.ok) {
        var e = new Error("HTTP " + r.status);
        e.status = r.status;
        throw e;
      }
      return r.json();
    })
    .then(function (payload) {
      window.QFX_SOURCE = payload.source || "unknown";
      window.QFX_DATA = payload;
      window.QFX_STALE_LINK = staleLink;
      start();
    })
    .catch(function (err) {
      console.error("Could not load " + url + ":", err);
      var loading = document.getElementById("screenLoading");
      if (!loading) return;
      /* Write INTO the card, not over it. The old branch replaced the whole
         section — destroying .pmCard — and then styled its replacement with
         .kicker and .blurb, which this game does not define and never has, so
         the message it did show arrived unstyled. */
      var card = loading.querySelector(".pmCard") || loading;
      var said = failure(err && err.status, !!askedNo);
      card.innerHTML = '<div class="eyebrow"></div>' +
                       '<p class="pmDate">QuickFire XI</p>' +
                       '<p class="pmLede"></p>';
      card.querySelector(".eyebrow").textContent = said[0];
      card.querySelector(".pmLede").textContent = said[1];
    });
})();

function start() {
  'use strict';

  var PREFIX = "qfx.";
  var RESULTS_KEY = PREFIX + "results.v1";
  var CONFIG = window.QFX_CONFIG;
  var DATA = window.QFX_DATA;

  var MAX_MINUTE = CONFIG.MATCH_DURATION_MINUTES;
  var MS_PER_MINUTE = CONFIG.QUESTION_DURATION_MS / MAX_MINUTE;
  var MAX_QUESTION_POINTS = CONFIG.SCORE_BANDS.reduce(function (max, band) {
    return Math.max(max, band.points);
  }, 0);

  var board = DATA.daily;
  var questions = board.questions.slice();
  var bench = (board.bench || []).slice();
  var storageKey = CONFIG.STORAGE_KEY + ':' + board.day;

  /* -------------------------------------------------------------- scoring */

  /* WHAT A QUESTION IS WORTH RIGHT NOW, for the "Worth now" readout only. The
     score that counts is the server's; this is the same table read for display,
     which is why it is read from CONFIG rather than copied. If the two ever
     disagreed the player would see one number and be given another, so there is
     one table and both sides read it. */
  function pointsFor(minute) {
    for (var i = 0; i < CONFIG.SCORE_BANDS.length; i++) {
      if (minute <= CONFIG.SCORE_BANDS[i].maxMinute) return CONFIG.SCORE_BANDS[i].points;
    }
    return 0;
  }

  function formatDate(iso) {
    var parts = String(iso).split('-');
    var months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return parts[2] + ' ' + months[Number(parts[1]) - 1] + ' ' + parts[0];
  }

  /* ---------------------------------------------------------------- state */

  function makeState() {
    return {
      day: board.day,
      no: board.no,
      playId: null,
      index: 1,          // which of the eleven is being played, 1-based
      results: [],
      totalScore: 0,
      subsUsed: 0,
      benchIndex: 0,
      completed: false,
      finalScore: null
    };
  }

  var state = makeState();
  var current = null;
  var busy = false;         // one request in flight; a second click must not queue

  /* THE CLOCK IS A DISPLAY OF THE SERVER'S, not a second clock.
   *
   * /next tells us what minute the server thinks this question is at. We anchor
   * a local reading to that and let requestAnimationFrame draw it, so the hand
   * moves smoothly — but every number that decides anything comes back from the
   * server on the next call. A wrong pick returns the minutes it cost and the
   * anchor moves by exactly that, so the display agrees with what was charged
   * rather than guessing at it. */
  var clock = { anchorAt: 0, anchorMinute: 0, running: false, frame: null, shown: -1 };

  function displayMinute() {
    if (!clock.anchorAt) return 0;
    var gone = Math.floor((Date.now() - clock.anchorAt) / MS_PER_MINUTE);
    return Math.max(0, Math.min(MAX_MINUTE, clock.anchorMinute + gone));
  }

  function anchorClock(minute) {
    clock.anchorAt = Date.now();
    clock.anchorMinute = Number(minute) || 0;
    clock.shown = -1;
  }

  /* ------------------------------------------------------------ elements */

  var el = {};
  ['screenStart', 'screenGame', 'screenResults', 'screenArchive', 'kickOff',
    'startDate', 'startBlurb', 'stripFill', 'progress', 'clockValue', 'clue',
    'options', 'feedback', 'passQuestion', 'subCost', 'runningScore', 'worthNow',
    'resultsBody', 'shareText', 'copyShare', 'copyChallenge', 'challengeHint',
    'playAgain', 'startKicker', 'challengeNote', 'playWeekly', 'weeklyLabel',
    'weeklyState', 'screenLoading', 'showArchive', 'archiveCount', 'archiveList',
    'archiveBack'].forEach(function (id) {
      el[id] = document.getElementById(id);
    });

  /* ------------------------------------------------------------ rendering */

  /* THE OPTION THAT WAS RIGHT, lit on the board itself, so the answer is where
     the player is already looking rather than only in a line of prose beneath.
     IT REUSES .option.right RATHER THAN INVENTING A CLASS. That style already
     means "this is the right answer" — it is what a correct pick gets — and
     the rule beside it, .option:disabled:not(.right):not(.wrong), is what
     stops the answer being dimmed to 45% along with the options nobody chose.
     A new class would have needed both of those written a second time.
     Matched on the option's own text because that is what the server marks
     against: the importer refuses a row unless exactly one option equals the
     answer, so this can light one button and never two. */
  function markCorrectOption(answer) {
    var btns = el.options ? el.options.querySelectorAll('.option') : [];
    Array.prototype.forEach.call(btns, function (b) {
      if (b.textContent === answer) b.classList.add('right');
    });
  }

  function setFeedback(text, kind) {
    el.feedback.textContent = text || '';
    el.feedback.className = 'feedback' + (kind ? ' ' + kind : '');
  }

  function renderClock(minute) {
    if (minute === clock.shown) return;
    clock.shown = minute;
    el.clockValue.textContent = minute;
    var pct = Math.min(100, (minute / MAX_MINUTE) * 100);
    el.stripFill.style.width = pct + '%';
    el.stripFill.classList.toggle('late', minute >= 60);
    var worth = pointsFor(minute);
    el.worthNow.textContent = worth;
    el.worthNow.classList.toggle('low', worth <= 40);
  }

  function subsLeft() {
    return Math.min(CONFIG.SUBS_PER_DAILY - state.subsUsed, bench.length - state.benchIndex);
  }

  function renderSubButton() {
    var left = subsLeft();
    var usable = left > 0 && current && !current.finished;
    el.passQuestion.disabled = !usable;
    el.subCost.textContent = left > 0
      ? '−' + CONFIG.SUB_POINT_PENALTY + ' · ' + left + ' left'
      : 'none left';
  }

  /* THE FOUR. Rendered from what the server sent and nothing else.
   *
   * A question with NO options draws none and says so, rather than drawing
   * blank buttons. qfdata's shape() sends four or zero — never two — because
   * two buttons is a question a player can get wrong for a reason that is not
   * theirs; this is the other half of that rule, where the zero case has to
   * look like something. */
  function renderOptions(q) {
    el.options.innerHTML = '';
    if (!q.options || !q.options.length) {
      var note = document.createElement('p');
      note.className = 'tiny';
      note.textContent = 'This question is missing its options. Sub it off — it will not be scored against you.';
      el.options.appendChild(note);
      return;
    }
    q.options.forEach(function (option) {
      var b = document.createElement('button');
      b.className = 'option';
      b.type = 'button';
      b.textContent = option;
      b.addEventListener('click', function () { pick(option, b); });
      el.options.appendChild(b);
    });
  }

  function lockOptions() {
    Array.prototype.forEach.call(el.options.querySelectorAll('.option'), function (b) {
      b.disabled = true;
    });
  }

  /* -------------------------------------------------------------- clock */

  function tick() {
    if (!clock.running) return;
    var minute = displayMinute();
    renderClock(minute);
    if (minute >= MAX_MINUTE) { fullTime(); return; }
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

  /* THE TAB GOING AWAY DOES NOT STOP THE CLOCK, and that is a change.
   *
   * The typing game paused on a hidden tab, which it could afford to: its clock
   * was its own. This one is the server's, and the server keeps counting. If
   * the page paused its display, a player would come back to a clock reading
   * 12' and be marked at 60' — and the number they were shown while deciding
   * would have been a lie. So the display keeps running and PAUSE_ON_TAB_HIDDEN
   * no longer has anything to switch; it is left in config.js because the
   * weekly and the typing game may yet want it, and removing a tunable that
   * another mode reads is a separate change from this one. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && clock.running) { renderClock(displayMinute()); }
  });

  /* ----------------------------------------------------------- the round */

  function post(path, body) {
    return window.QFX_API(path, body || {}).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.error) || ("HTTP " + r.status));
        return j;
      });
    });
  }

  /* A REQUEST FAILING MID-ROUND IS NOT THE PLAYER'S FAULT and must not look
     like a wrong answer. It says so, re-enables the buttons, and leaves the
     question where it was — the server is the record, so nothing here has been
     lost by the attempt not landing. */
  function trouble(err) {
    console.error("QuickFire:", err);
    setFeedback('That did not reach us — try again.', 'miss');
    busy = false;
    Array.prototype.forEach.call(el.options.querySelectorAll('.option'), function (b) {
      b.disabled = false;
    });
    renderSubButton();
  }

  function begin() {
    if (busy) return;
    busy = true;
    el.kickOff.disabled = true;
    post('/api/quickfire/play', { date: board.day })
      .then(function (r) {
        state.playId = r.playId;
        save();
        show('screenGame');
        playsStart();
        busy = false;
        serve(state.index);
      })
      .catch(function (e) {
        el.kickOff.disabled = false;
        busy = false;
        setFeedback('');
        var card = el.screenStart.querySelector('.pmLede');
        if (card) card.textContent = 'Could not start a round. Try again in a moment.';
      });
  }

  function serve(idx) {
    var q = questions[idx - 1];
    state.index = idx;
    current = { idx: idx, question: q, finished: false };

    el.progress.textContent = idx + ' / ' + CONFIG.QUESTIONS_PER_DAILY;
    el.clue.textContent = q.clue;
    el.runningScore.textContent = state.totalScore;
    setFeedback('');
    renderOptions(q);
    renderSubButton();

    post('/api/quickfire/next', { playId: state.playId, idx: idx })
      .then(function (r) {
        anchorClock(r.minute);
        renderClock(displayMinute());
        startTicking();
      })
      .catch(trouble);
  }

  function pick(option, button) {
    if (busy || !current || current.finished) return;
    busy = true;
    lockOptions();
    button.classList.add('chosen');

    post('/api/quickfire/answer', { playId: state.playId, idx: current.idx, pick: option })
      .then(function (r) {
        busy = false;
        settle(r, option, button);
      })
      .catch(trouble);
  }

  /* WHAT THE SERVER SAID HAPPENED. Every number here came back from it — the
     minute, the points, whether it was right. The page is drawing a verdict,
     not reaching one. */
  function settle(r, option, button) {
    current.finished = true;
    stopTicking();
    renderClock(r.minute);
    el.passQuestion.disabled = true;

    if (button) button.classList.add(r.correct ? 'right' : 'wrong');

    state.results.push({
      idx: current.idx,
      questionId: current.question.id,
      pick: option === undefined ? null : option,
      correct: !!r.correct,
      minute: r.minute,
      points: r.points || 0,
      timedOut: !!r.timedOut,
      /* CARRIED SO THE RESULTS CARD CAN SAY IT TOO. Only ever set for a
         question this round got wrong — the server sends it for no other —
         so a missed row can name the answer and a scored row has nothing
         extra to leak. */
      answer: r.answer || null
    });
    state.totalScore += (r.points || 0);
    el.runningScore.textContent = state.totalScore;

    /* WHAT IT WAS, WHEN THEY DID NOT GET IT. Being told "no" and not what the
       answer was leaves nothing to learn and no way to see the question was
       fair. The server sends it only for a question this round has settled and
       only when the pick was wrong, so there is nothing here to withhold; if
       it is absent the line simply does not appear rather than printing an
       empty one. */
    var says = r.answer ? ' — it was ' + r.answer : '';
    if (r.timedOut) {
      setFeedback("FULL TIME — 0 points" + says, 'fulltime');
    } else if (r.correct) {
      setFeedback('GOAL — ' + r.minute + "'   +" + r.points + ' points', 'goal');
    } else {
      /* THE PENALTY IS SHOWN BECAUSE IT WAS CHARGED. A cost the player is not
         told about is a clock that appears to jump. */
      var cost = Number(r.penaltyMinutes) || 0;
      setFeedback('NO — ' + (cost ? cost + " minutes gone" : 'not that one') + says, 'miss');
    }
    /* AND THE RIGHT BUTTON IS MARKED, so the answer is shown where the player
       is already looking rather than only in a line of prose underneath. */
    if (r.answer) markCorrectOption(r.answer);

    save();
    setTimeout(next, CONFIG.INTER_QUESTION_MS);
  }

  function next() {
    if (state.index >= CONFIG.QUESTIONS_PER_DAILY) {
      finish();
    } else {
      serve(state.index + 1);
    }
  }

  /* FULL TIME ON ONE QUESTION. The page tells the server its clock ran out; the
     server checks its OWN clock before believing it, because a timeout that was
     free and instant would empty the substitution — why pay twenty points to
     escape a question you can walk away from for nothing? */
  function fullTime() {
    if (busy || !current || current.finished) return;
    busy = true;
    stopTicking();
    lockOptions();
    post('/api/quickfire/answer', { playId: state.playId, idx: current.idx, pick: null })
      .then(function (r) { busy = false; settle(r, null, null); })
      .catch(trouble);
  }

  function passCurrentQuestion() {
    if (busy || !current || current.finished) return;
    if (subsLeft() <= 0) return;
    busy = true;
    el.passQuestion.disabled = true;

    post('/api/quickfire/sub', { playId: state.playId })
      .then(function (r) {
        busy = false;
        /* The slot does not advance — the Daily is still an XI. The question in
           it changes and its clock starts again, which the server has already
           done; this is the page catching up with it. */
        questions[state.index - 1] = bench[state.benchIndex];
        state.benchIndex += 1;
        state.subsUsed += 1;
        state.totalScore -= CONFIG.SUB_POINT_PENALTY;
        save();
        var q = questions[state.index - 1];
        current = { idx: state.index, question: q, finished: false };
        el.clue.textContent = q.clue;
        el.runningScore.textContent = state.totalScore;
        renderOptions(q);
        renderSubButton();
        setFeedback('SUBBED OFF — −' + CONFIG.SUB_POINT_PENALTY, 'sub');
        anchorClock(r.minute || 0);
        renderClock(displayMinute());
        startTicking();
      })
      .catch(trouble);
  }

  function finish() {
    stopTicking();
    post('/api/quickfire/finish', { playId: state.playId })
      .then(function (r) {
        state.completed = true;
        state.finalScore = r.score;
        /* THE SERVER'S TOTAL WINS. The running score on screen was the page
           adding up what it was told; this is the server adding up its own rows,
           including the substitutions it charged for. If they ever disagree the
           server is right, and the player sees the right one. */
        state.totalScore = r.score;
        save();
        bankResult(r);
        playsEnd(true);
        showResults(r);
      })
      .catch(function (e) {
        /* A ROUND THAT CANNOT BE TOTALLED IS STILL A ROUND THAT WAS PLAYED. The
           rows are on the server; showing the page's own running total with a
           note is better than losing the screen entirely. */
        console.error("QuickFire finish:", e);
        state.completed = true;
        save();
        playsEnd(true);
        showResults(null);
      });
  }

  /* ---- the durable record and the account ------------------------------ */

  /* QUICKFIRE BANKED NOTHING UNTIL TODAY. It had no recordResult and never
     called /api/account/migrate, so a finished round reached neither the
     account nor the season — the game was playable and completely unrecorded.
     This follows HiLo's shape rather than inventing one, because the merge rule
     is the family's: first result banked wins, the account's row wins outright
     on pull, unpushed local rows survive. */
  function readResults() {
    try { var r = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]"); return Array.isArray(r) ? r : []; }
    catch (e) { return []; }
  }

  function recordResult(rec) {
    try {
      var all = readResults();
      if (all.some(function (r) { return r && r.day === rec.day; })) return;
      all.push(rec);
      localStorage.setItem(RESULTS_KEY, JSON.stringify(all.slice(-800)));
    } catch (e) {}
    pushResults();
  }

  var account = null;

  function accountNote(what, err) {
    try { console.warn("[account] " + what + " failed:", err && err.message ? err.message : err); } catch (e) {}
  }

  function apiAuth(path, body) {
    var opts = { method: body ? "POST" : "GET", headers: { "X-XI-Games": "1" }, credentials: "same-origin" };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(path, opts).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  }

  function pushResults() {
    if (!account) return Promise.resolve(null);
    return apiAuth("/api/account/migrate", { game: "quickfire", results: readResults() })
      .catch(function (e) { accountNote("push", e); return null; });
  }

  function pullResults() {
    if (!account) return Promise.resolve(null);
    return apiAuth("/api/account/results?game=quickfire").then(function (r) {
      var remote = (r && r.results) || [];
      if (!remote.length) return null;
      var byDay = {};
      readResults().forEach(function (x) { if (x && x.day) byDay[x.day] = x; });
      remote.forEach(function (x) { if (x && x.day) byDay[x.day] = x; });
      var merged = Object.keys(byDay).sort().map(function (k) { return byDay[k]; });
      try { localStorage.setItem(RESULTS_KEY, JSON.stringify(merged.slice(-800))); } catch (e) {}
      return merged.length;
    }).catch(function (e) { accountNote("pull", e); return null; });
  }

  /* THE CHROME OWNS THE IDENTITY. Its account sheet announces a sign-in, a
     sign-out or a rename on document as xi:account; this game answers by
     syncing its own results. */
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


  function bankResult(r) {
    var right = r ? r.correct : state.results.filter(function (x) { return x.correct; }).length;
    recordResult({
      game: "quickfire",
      day: board.day,
      no: board.no,
      boardId: board.id,
      score: r ? r.score : state.totalScore,
      right: right,
      wrong: (r ? r.answered : state.results.length) - right,
      subs: state.subsUsed
    });
    /* THE SEASON COUNTS DAYS, not points, and the rule lives in
       shared/xi-season.js for everybody. */
    try {
      if (window.XISeason && window.XISeason.record) window.XISeason.record(board.day);
    } catch (e) { accountNote("season", e); }
  }

  /* ------------------------------------------------------------- results */

  function summarise(r) {
    var answered = state.results.filter(function (x) { return !x.passed; });
    var solved = state.results.filter(function (x) { return x.correct; });
    var minutes = solved.map(function (x) { return x.minute; });
    return {
      correct: r ? r.correct : solved.length,
      total: CONFIG.QUESTIONS_PER_DAILY,
      subs: state.subsUsed,
      subCost: state.subsUsed * CONFIG.SUB_POINT_PENALTY,
      played: answered,
      score: r ? r.score : state.totalScore,
      maxScore: CONFIG.QUESTIONS_PER_DAILY * MAX_QUESTION_POINTS,
      average: minutes.length ? Math.round(minutes.reduce(function (a, b) { return a + b; }, 0) / minutes.length) : null,
      fastest: minutes.length ? Math.min.apply(null, minutes) : null,
      latest: minutes.length ? Math.max.apply(null, minutes) : null
    };
  }

  function shareTextFor(s) {
    var line = s.played.map(function (x) {
      return x.correct ? String(x.minute).padStart(2, '0') + "'" : '—';
    }).join(' ');
    return [
      'QUICKFIRE XI',
      'No. ' + board.no + ' — ' + formatDate(board.day),
      '',
      s.correct + '/' + s.total + ' ⚽',
      s.score + '/' + s.maxScore,
      '',
      'Goal times:',
      line,
      '',
      s.average === null ? 'Average: —' : 'Average: ' + s.average + "'",
      'Subs: ' + s.subs + (s.subs ? ' (−' + s.subCost + ')' : '')
    ].join('\n');
  }

  function row(label, value) {
    return '<div class="row"><span class="rowLabel">' + label + '</span>' +
      '<span>' + value + '</span></div>';
  }

  function showResults(r) {
    var s = summarise(r);
    var html = '';
    html += '<div class="verdict"><span class="verdictCount">' + s.correct + '</span>' +
      '<span class="verdictOf">/ ' + s.total + ' correct</span></div>';
    html += '<div class="bigscore">' + s.score + ' <span class="of">/ ' + s.maxScore + ' points</span></div>';
    html += '<div class="rows">';
    html += row('Average goal', s.average === null ? 'No goals' : s.average + "'");
    html += row('Fastest goal', s.fastest === null ? 'No goals' : s.fastest + "'");
    html += row('Latest goal', s.latest === null ? 'No goals' : s.latest + "'");
    html += row('Subs used', s.subs + ' of ' + CONFIG.SUBS_PER_DAILY +
      (s.subs ? '  (−' + s.subCost + ')' : ''));
    html += '</div>';
    html += '<ol class="breakdown">';
    state.results.forEach(function (x) {
      var cls = x.correct ? 'hit' : 'missed';
      var minute = x.timedOut ? 'FT' : x.minute + "'";
      /* THE PICK, AND NOW THE ANSWER WHERE THERE WAS ONE TO LEARN.
         This said "this page is never sent the answer", which was true until
         the answer endpoint began returning it for a question the round has
         settled and got WRONG. The old note also gave the reason — "the board
         may still be somebody else's to play" — and that reason still holds
         for every question this player has NOT answered, which is why the
         server sends nothing for those. For one they answered and missed, the
         answer was already on screen when they missed it; withholding it from
         the card they read afterwards teaches them nothing and looks like the
         game keeping score without saying why. */
      var shown = x.pick === null ? 'No answer' : x.pick;
      var was = (!x.correct && x.answer) ? x.answer : null;
      html += '<li class="' + cls + '">' +
        '<span class="bdMin">' + minute + '</span>' +
        '<span class="bdAnswer">' + escapeHtml(shown) +
          (was ? '<span class="bdWas"> — ' + escapeHtml(was) + '</span>' : '') + '</span>' +
        '<span class="bdPts">' + (x.points || 0) + '</span></li>';
    });
    html += '</ol>';
    el.resultsBody.innerHTML = html;
    el.shareText.value = shareTextFor(s);
    /* THE FAMILY'S SHARE ROW. The same buttons, the same platforms and the same
       copy fallback every other game offers, from shared/xi-share.js — this
       game had a bare "Copy result" and nothing to send it with. Mounted once:
       the text is read when a button is pressed, not when the row is built, so
       a later result does not need a remount. */
    var shareRow = document.getElementById("shareRow");
    if (window.XIShare && shareRow) {
      window.XIShare.mount(shareRow, {
        text: function () { return el.shareText.value; },
        url: function () { return location.href; },
      });
    }
    show('screenResults');
  }

  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------ storage */

  function save() {
    try {
      localStorage.setItem(PREFIX + storageKey, JSON.stringify({
        day: state.day,
        no: state.no,
        playId: state.playId,
        index: state.index,
        results: state.results,
        totalScore: state.totalScore,
        subsUsed: state.subsUsed,
        benchIndex: state.benchIndex,
        questionIds: questions.map(function (q) { return q.id; }),
        completed: state.completed
      }));
    } catch (err) { /* private browsing — play on without persistence */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(PREFIX + storageKey);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      if (saved.day !== state.day) return null;
      return saved;
    } catch (err) { return null; }
  }

  function restore() {
    var saved = load();
    if (!saved) return;
    state.playId = saved.playId || null;
    state.index = saved.index || 1;
    state.results = saved.results || [];
    state.totalScore = saved.totalScore || 0;
    state.subsUsed = saved.subsUsed || 0;
    state.benchIndex = saved.benchIndex || 0;
    state.completed = !!saved.completed;
    /* Put any substitutions made before the reload back into their slots. */
    if (saved.questionIds) {
      var byId = {};
      questions.concat(bench).forEach(function (q) { byId[q.id] = q; });
      saved.questionIds.forEach(function (id, i) {
        if (byId[id]) questions[i] = byId[id];
      });
    }
  }

  /* --------------------------------------------------------------- boot */

  function show(screenId) {
    ['screenStart', 'screenLoading', 'screenGame', 'screenResults', 'screenArchive']
      .forEach(function (id) {
        if (el[id]) el[id].hidden = (id !== screenId);
      });
  }

  /* HOW FAR PEOPLE GET, through the family's helper, on the same two events
     every other game sends. Nothing about the person; see shared/xi-plays.js. */
  var runStart = 0;

  function playsProgress() {
    var solved = state.results.filter(function (x) { return x.correct; });
    return {
      solved: solved.length,
      elapsed: runStart ? Math.round((Date.now() - runStart) / 1000) : 0,
      detail: { score: state.totalScore, subs: state.subsUsed, answered: state.results.length }
    };
  }

  function playsStart() {
    if (!window.XIPlays || !board) return;
    runStart = Date.now();
    window.XIPlays.start({
      game: 'quickfire',
      mode: DATA.isToday ? 'daily' : 'archive',
      boardKey: 'qf:' + board.day,
      total: CONFIG.QUESTIONS_PER_DAILY
    }, playsProgress);
  }

  function playsEnd(completed) {
    if (window.XIPlays && window.XIPlays.active()) window.XIPlays.end(!!completed);
  }

  /* --------------------------------------------------------- the archive */

  function openArchive() {
    el.archiveList.textContent = 'Loading…';
    show('screenArchive');
    window.QFX_API('/api/quickfire/archive')
      .then(function (r) { return r.json(); })
      .then(function (r) {
        var boards = (r && r.boards) || [];
        el.archiveList.innerHTML = '';
        if (!boards.length) {
          el.archiveList.textContent = 'No boards yet.';
          return;
        }
        boards.forEach(function (b) {
          var a = document.createElement('a');
          a.className = 'archiveItem' + (b.day === DATA.day ? ' current' : '');
          a.href = '#b=' + b.no;
          a.innerHTML = '<strong>No. ' + b.no + '</strong><span>' +
            escapeHtml(formatDate(b.day)) + '</span>';
          a.addEventListener('click', function () {
            /* A different board is a different sitting with a different saved
               state, so the page is reloaded rather than rebuilt in place. The
               fragment carries which one. */
            setTimeout(function () { location.reload(); }, 0);
          });
          el.archiveList.appendChild(a);
        });
      })
      .catch(function () { el.archiveList.textContent = 'Could not load the list.'; });
  }

  /* --------------------------------------------------------- start screen */

  function describeBoard() {
    el.startKicker.textContent = DATA.isToday ? "Today's Daily" : 'A board that has been';
    el.startDate.textContent = 'No. ' + board.no + ' — ' + formatDate(board.day);
  }

  el.kickOff.addEventListener('click', begin);
  el.passQuestion.addEventListener('click', passCurrentQuestion);
  el.showArchive.addEventListener('click', openArchive);
  el.archiveBack.addEventListener('click', function () { show('screenStart'); });

  function challengeLink() {
    return location.href.split('#')[0] + '#b=' + board.no;
  }

  function copyToClipboard(text, button, done) {
    var ok = false;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(function () {});
      ok = true;
    } else {
      var scratch = document.createElement('textarea');
      scratch.value = text;
      scratch.style.position = 'fixed';
      scratch.style.opacity = '0';
      document.body.appendChild(scratch);
      scratch.select();
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(scratch);
    }
    var original = button.textContent;
    button.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(function () { button.textContent = done || original; }, 1600);
  }

  el.copyChallenge.addEventListener('click', function () {
    copyToClipboard(challengeLink(), el.copyChallenge, 'Copy board link');
  });
  el.copyShare.addEventListener('click', function () {
    copyToClipboard(el.shareText.value, el.copyShare, 'Copy result');
  });
  el.playAgain.addEventListener('click', function () {
    try { localStorage.removeItem(PREFIX + storageKey); } catch (err) {}
    location.reload();
  });

  /* The weekly is not served to this page yet — getWeek() returns a board of
     eleven with options like any other, but nothing here plays it and a button
     that does nothing is worse than no button. */
  el.playWeekly.hidden = true;

  el.showArchive.hidden = false;
  el.copyChallenge.textContent = 'Copy board link';
  el.challengeHint.textContent = 'That link opens this exact board — No. ' +
    board.no + '.';

  describeBoard();

  if (window.QFX_STALE_LINK) {
    el.challengeNote.hidden = false;
    el.challengeNote.textContent =
      'That link was made by an older version of the game and no longer points ' +
      'at a board. This is today’s Daily instead.';
  }

  restore();

  if (state.completed) {
    showResults(null);
  } else if (state.index > 1 && state.playId) {
    el.startBlurb.textContent = 'You are ' + (state.index - 1) + ' questions in. Pick up at question ' +
      state.index + ' of ' + CONFIG.QUESTIONS_PER_DAILY + '.';
    el.kickOff.textContent = 'Resume';
    show('screenStart');
    /* Resuming reuses the round rather than opening a second one: the server
       has the answers already given and would refuse to re-serve them. */
    el.kickOff.removeEventListener('click', begin);
    el.kickOff.addEventListener('click', function () {
      show('screenGame');
      playsStart();
      serve(state.index);
    });
  } else {
    show('screenStart');
  }
}
