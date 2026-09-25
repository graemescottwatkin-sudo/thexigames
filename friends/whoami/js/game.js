/* Who Am I XI — game script.
 *
 * BUILD must equal the ?v= tag on every one of this game's assets in
 * index.html. deploy_check.mjs checks they agree and that the tag moved when
 * the bytes did.
 *
 * NOTHING THIS PAGE HOLDS IS AN ANSWER, and that is the design rather than a
 * precaution. It receives eleven doors as a club and a year; it receives the
 * full name list, which is the answer SPACE and the same every day; and it
 * receives whatever rung of the clue ladder has been paid for. The identity
 * behind a door reaches it only when the door closes — solved, or given up.
 *
 * WHY THAT MATTERS MORE HERE THAN IN THE OTHER GAMES. Only one door is played
 * per person per day, and the other ten stay live for everybody else who picks
 * a different club. A leak here does not spoil one answer, it spoils ten
 * answers for every other player that day.
 *
 * So the marking is a server call, including "right club, wrong player" — that
 * one especially, because deciding it here would need the club's whole roster
 * and a roster is a candidate list for the door.
 */
var DECK_WORD = { main: 'Everyday', expert: 'Deep cut' };
var BUILD = "v001c";

(function bootstrap() {
  'use strict';
  console.log("Who Am I XI build " + BUILD);

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
  window.XIWA_API = api;

  var hash = location.hash || "";
  /* A BOARD'S OWN ADDRESS, as well as the older #b= form. /whoami/daily/4 is
     what the archive and the sitemap give board 4, and until v001o the page
     read only the hash, so it dealt today's board under "TODAY" (found in the
     app, 25 Sep 2026). */
  var permaNo = window.XIChrome && window.XIChrome.permalink ? window.XIChrome.permalink.read() : null;
  var askedNo = (/[#&]b=(\d+)/.exec(hash) || [])[1] ||
    (/^[1-9][0-9]*$/.test(permaNo || "") ? permaNo : undefined);
  var url = "/api/whoami/whoami_fr/daily" + (askedNo ? "?no=" + encodeURIComponent(askedNo) : "");

  /* A PERMANENT CONDITION MUST NOT BE DRESSED AS A TRANSIENT ONE. QuickFire
     spent weeks telling visitors to "try again in a moment" while its tables
     did not exist, and the retry it invited could never succeed. A visitor told
     to wait a moment waits, and then leaves, and never tells you. */
  function failure(status, wantedBoard) {
    if (status === 404 && wantedBoard) {
      return ["No such board",
        "That board has not been a daily yet, or never was. Trying again will not change it."];
    }
    if (status === 404) {
      return ["No board today",
        "There is no board for today. That is not a connection problem, so trying again will not help."];
    }
    if (status === 503) {
      return ["Our end",
        "Who Am I cannot reach its boards. This is a fault on our side, not yours, and we can see it."];
    }
    return ["No connection", "Today's board didn't load. Try again in a moment."];
  }

  api(url)
    .then(function (r) {
      if (!r.ok) { var e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
      return r.json();
    })
    .then(function (payload) {
      window.XIWA_DATA = payload;
      start();
    })
    .catch(function (err) {
      console.error("Could not load " + url + ":", err);
      var said = failure(err && err.status, !!askedNo);
      var home = document.getElementById("waHome");
      if (!home) return;
      var hero = home.querySelector("#waToday");
      if (hero) {
        hero.disabled = true;
        hero.querySelector(".hc-kicker").textContent = said[0];
        hero.querySelector(".hc-title").textContent = "Who Am I XI: Friends";
        hero.querySelector(".hc-note").textContent = said[1];
        var state = hero.querySelector(".hc-state");
        if (state) state.textContent = "";
      }
    });
})();

function start() {
  'use strict';

  var PREFIX = "xifw.";
  var RESULTS_KEY = PREFIX + "results.v1";
  var CONFIG = window.XIWA_CONFIG;
  var DATA = window.XIWA_DATA;
  var BOARD = DATA.board;

  /* THE SCORING RULE COMES FROM THE SERVER, with the board. The page needs the
     curve to tick a live readout and the prices to draw the ladder — and a
     copy of either here would agree today and disagree the first time anybody
     tuned one. config.js is still where the numbers LIVE; this is the server
     handing over what it reads from there, so there is one table and the page
     is not one of the places it can drift. */
  var RULE = DATA.scoring || {};
  /* NO FALLBACK CURVE. The first draft defaulted to [[0,114],[90,36]] if the
     server sent none — two points standing in for eight, which is a second copy
     of the rule however small, and one that would quietly show every player a
     wrong number rather than no number. If the rule does not arrive the readout
     says nothing, which is honest; the score is the server's either way and is
     unaffected. */
  var CURVE = RULE.curve || null;
  var MAX_SCORE = RULE.max || null;
  var MATCH_MINUTES = RULE.matchMinutes || 90;
  var RATE_SECONDS = RULE.rateSeconds || 20;
  var LADDER = RULE.ladder || [];

  var storageKey = CONFIG.STORAGE_KEY + ':' + BOARD.day;

  var state = {
    day: BOARD.day,
    no: BOARD.no,
    playId: null,
    slot: null,
    stage: 1,
    pointsSpent: 0,
    guesses: [],
    finished: false,
    solved: false
  };

  /* THE CLOCK IS A DISPLAY OF THE SERVER'S, not a second clock. Every call
     comes back with the minute the server is at; the page anchors to that and
     lets requestAnimationFrame draw between calls, so the hand moves smoothly
     without the page ever deciding what time it is. A minute this page chose
     would be a score this page chose. */
  var clock = { anchorAt: 0, anchorMinute: 0, running: false, frame: null, shown: -1 };

  function displayMinute() {
    if (!clock.anchorAt) return 0;
    var per = RATE_SECONDS * 1000;
    var gone = Math.floor((Date.now() - clock.anchorAt) / per);
    return Math.max(0, Math.min(MATCH_MINUTES, clock.anchorMinute + gone));
  }

  function anchorClock(minute) {
    clock.anchorAt = Date.now();
    clock.anchorMinute = Number(minute) || 0;
    clock.shown = -1;
  }

  /* WHAT THE BOARD IS WORTH AT A MINUTE, for the readout only. The score that
     counts is struck on the server; this reads the same curve so the two cannot
     show different numbers. */
  function worthAt(minute) {
    var C = CURVE;
    if (!C || !C.length) return null;
    if (minute <= 0) return C[0][1];
    if (minute >= C[C.length - 1][0]) return C[C.length - 1][1];
    for (var i = C.length - 1; i >= 0; i--) {
      if (minute >= C[i][0]) {
        var a = C[i], b = C[i + 1] || [90, 36];
        if (b[0] === a[0]) return a[1];
        return a[1] + (b[1] - a[1]) * ((minute - a[0]) / (b[0] - a[0]));
      }
    }
    return C[0][1];
  }

function renderClock() {
    var total = LADDER.length || 3;
    var seen = Math.min(Math.max(1, state.stage || 1), total);
    var worth = Math.max(0, (MAX_SCORE || 10) - (state.pointsSpent || 0));
    var key = seen + ':' + worth;
    if (key === clock.shown) return;
    clock.shown = key;
    el.clockValue.textContent = seen;
    el.stripFill.style.width = Math.min(100, (seen / total) * 100) + '%';
    el.stripFill.classList.toggle('late', seen >= total);
    el.worthNow.textContent = worth;
    el.worthNow.classList.toggle('low', worth <= 3);
  }

  function tick() {
    if (!clock.running) return;
    renderClock();
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

  var NAMES = [];      // [[display, foldedKey], …] — the answer space
  var busy = false;

  var el = {};
  ['waHome', 'waGame', 'waToday', 'waTodayKicker', 'waTodayState',
   'navToday', 'waPastCount',
   'boardNo', 'boardDate', 'screenDoors', 'screenPlay', 'screenDone',
   'doors', 'mechanism', 'lede', 'playClub', 'playLeft', 'playNums',
   'commit', 'commitPick', 'playChoice', 'clues', 'ladder',
   'stripFill', 'clockValue', 'worthNow', 'giveUp',
   'guessInput', 'guessGo', 'suggest', 'feedback', 'tries',
   'doneKicker', 'doneBody', 'shareText', 'copyShare', 'backToDoors']
    .forEach(function (id) { el[id] = document.getElementById(id); });

  /* ------------------------------------------------------------ helpers */

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDate(iso) {
    var p = String(iso).split('-');
    var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return p[2] + ' ' + months[Number(p[1]) - 1] + ' ' + p[0];
  }

  /* THE SAME FOLD THE SERVER USES. It is here for the TYPE-AHEAD only — to
     match what somebody is typing against the list — and never to decide
     whether a guess is right. That decision is the server's, and this copy
     existing does not make it a second judge. */
  var FOLD_LETTERS = { 'Ø':'O','ø':'o','Æ':'AE','æ':'ae',
    'Œ':'OE','œ':'oe','Ð':'D','ð':'d','Þ':'TH',
    'þ':'th','ß':'ss','Ł':'L','ł':'l','Đ':'D','đ':'d' };
  function fold(s) {
    return String(s == null ? '' : s)
      .replace(/[ØøÆæŒœÐðÞþßŁłĐđ]/g,
        function (c) { return FOLD_LETTERS[c] || c; })
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function post(path, body) {
    return window.XIWA_API(path, body || {}).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.error) || ("HTTP " + r.status));
        return j;
      });
    });
  }

  function trouble(err) {
    console.error("Who Am I:", err);
    setFeedback('That did not reach us — try again.', 'miss');
    busy = false;
    el.guessGo.disabled = !el.guessInput.value.trim();
  }

  function setFeedback(text, kind) {
    el.feedback.textContent = text || '';
    el.feedback.className = 'feedback' + (kind ? ' ' + kind : '');
  }

  /* ---- the locked screen --------------------------------------------------
     The owner's ruling, 24 Sep 2026: while playing, the page is the screen and
     nothing scrolls, at every size, with the elements scaling up. The round and
     Full Time are locked; the doors are a menu of eleven and stay a page.
     The clues a player has bought scroll inside their own panel, which takes
     the height that is left. If the rest cannot fit (large system text, a very
     short screen) the page goes back to scrolling rather than hide any of it. */
  function checkRoom() {
    var body = document.body;
    var sec = el.screenPlay && !el.screenPlay.hidden ? el.screenPlay
      : el.screenDone && !el.screenDone.hidden ? el.screenDone : null;
    var want = !!sec && !!el.waGame && !el.waGame.hidden;
    body.classList.toggle('locked', want);
    /* The round must fit; Full Time's result is meant to scroll in itself, so
       its own overflow is not a reason to unlock. */
    if (want && sec === el.screenPlay && sec.scrollHeight > sec.clientHeight + 1) body.classList.remove('locked');
  }
  var roomQueued = false;
  function queueRoom() {
    if (roomQueued) return;
    roomQueued = true;
    (window.requestAnimationFrame || setTimeout)(function () { roomQueued = false; checkRoom(); });
  }
  window.addEventListener('resize', queueRoom);

  function show(id) {
    ['screenDoors', 'screenPlay', 'screenDone'].forEach(function (s) {
      if (el[s]) el[s].hidden = (s !== id);
    });
    queueRoom();
  }

  /* ------------------------------------------------------------ the board */

  /* WHICH CARD IS CHOSEN, which is not the same as which door is OPEN. Nothing
     is sent until the play button is pressed; until then this is a value on
     the page and no more. */
  var picked = null;

  function choose(d, btn) {
    picked = d;
    [].forEach.call(el.doors.querySelectorAll('.door'), function (o) {
      var on = o === btn;
      o.classList.toggle('on', on);
      o.setAttribute('aria-checked', on ? 'true' : 'false');
      o.tabIndex = on ? 0 : -1;
    });
    if (el.commitPick) {
      el.commitPick.textContent = 'Door ' + d.slot + ' \u00B7 ' + d.section;
    }
    if (el.playChoice) el.playChoice.disabled = false;
  }

  /* ARROW KEYS MOVE INSIDE THE GROUP and wrap, which is what a radiogroup
     does. Without this the cards are eleven tab stops and the role is a claim
     the keyboard does not honour. */
  function arrowMove(ev, btn) {
    var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    var step = keys[ev.key];
    if (!step) return;
    var all = [].slice.call(el.doors.querySelectorAll('.door:not([disabled])'));
    var at = all.indexOf(btn);
    if (at < 0) return;
    ev.preventDefault();
    var next = all[(at + step + all.length) % all.length];
    next.focus();
    next.click();
  }

  function renderDoors() {
    /* ONE DOOR A DAY, AND THIS IS WHERE IT IS ENFORCED.
     *
     * It was not enforced anywhere. Every door got an unconditional click
     * handler, so after finishing a board you could open the next one and the
     * next — fresh clock, fresh 114, full ladder — and work the whole eleven.
     * The comment on the "back to the board" button said "it does not offer
     * another go", which is a sentence asserting a guard that did not exist:
     * the worst kind, because it reads as the rule being handled.
     *
     * WHAT CAN AND CANNOT BE ENFORCED. The RESULT is already one a day and
     * always was — recordResult dedupes on the day and the family's rule is
     * first-banked-wins, so a second door can never bank a second row. What was
     * open was the PLAYING, and for an anonymous visitor there is no server-side
     * identity to refuse it with: the door is closed here, on the device, which
     * is where the state lives. Somebody with developer tools can still open
     * another, and that is honest rather than solved — they would be spoiling
     * their own board and could not record it.
     */
    var done = !!state.finished;
    el.doors.innerHTML = '';
    picked = null;
    BOARD.doors.forEach(function (d, i) {
      var b = document.createElement('button');
      var mine = done && Number(state.slot) === Number(d.slot);
      b.className = 'door' + (done ? ' spent' : '') + (mine ? ' mine' : '');
      b.type = 'button';
      b.disabled = done;
      /* ONE CONTROL, ELEVEN OPTIONS. Each card is a radio rather than a
         button, because choosing is no longer the same act as committing:
         role tells a screen reader it is one choice among eleven, and
         aria-checked tells it which. Only the selected card is tabbable, so
         Tab reaches the group once and the arrow keys move inside it — the
         pattern a radiogroup is expected to have. */
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.tabIndex = (i === 0 && !done) ? 0 : -1;
      /* THE LABEL IS ON THE CONTROL, not only inside a child of it. A screen
         reader reads the accessible name of the button, and with the text in a
         generic span the tree showed the label detached from the thing you
         press. */
      b.setAttribute('aria-label', done
        ? (mine ? d.section + ' — the door you opened'
                : d.section + ' — not yours today')
        : d.section + ', ' + (DECK_WORD[d.deck] || d.deck));
      b.innerHTML = '<span class="d-club">' + esc(d.section) + '</span>' +
        '<span class="d-year">' + esc(DECK_WORD[d.deck] || d.deck) + '</span>' +
        '<span class="d-cap">How deep it goes</span>' +
        (mine ? '<span class="d-mine">Yours today</span>' : '');
      if (!done) {
        b.addEventListener('click', function () { choose(d, b); });
        b.addEventListener('keydown', function (ev) { arrowMove(ev, b); });
      }
      el.doors.appendChild(b);
    });
    if (el.commit) el.commit.hidden = done || !BOARD.doors.length;
    if (el.playChoice) el.playChoice.disabled = true;
    if (el.commitPick) el.commitPick.textContent = '';

    /* AND THE LINE ABOVE THEM STOPS BEING UNTRUE. It read "Pick a club. One
       player behind each door, and you get one go at him" to somebody who had
       already had their go. */
    if (el.lede) {
      el.lede.textContent = done
        ? (state.solved
            ? 'You got yours today. The other two are somebody else\u2019s.'
            : 'That was your go today. The other two are somebody else\u2019s.')
        : 'Pick a door. One character behind each, and you get one go at them.';
    }
    /* SORTED AND UNATTRIBUTED, exactly as the server sent them. Rendering these
       beside their doors would undo the whole point of sorting them. */
    /* ONE NUMBER PER PLAYER, LABELLED, AND THIS IS THE SECOND VERSION.
       It was eleven numbers, one per door, sorted — and sorting stopped a
       number being attributed to a door but left the GROUPING in plain sight.
       "3, 3, 3, 6, 6, 6, 8, 10, 10, 10, 13" says three doors share a three-club
       player, which lets anyone holding the name list pair doors off each other
       before guessing anything. The server dedupes to players now, so a board
       of six players shows six numbers and the multiplicities are gone.
       LABELLED because bare numbers read as noise. "Player 1 · 3 clubs" says
       there is a one-club man and a journeyman in here today; "3, 6, 13" says
       nothing. The numbering is this list's own order, which is sorted and
       attributes to nobody. */
    /* THE SENTENCE, NOT THE BADGES. "Player 1 · 3 clubs" told nobody anything
       it did not already have to decode, and it was the first thing under the
       heading. What a player needs is the RULE: two of these cards can be the
       same man, so eleven choices are not eleven puzzles.
       BOTH FIGURES ARE COUNTED. doors.length is the spells on the board and
       careers.length is the players they come from — "six" was never a
       constant, and a board that ever holds five would have made a sentence
       with a 6 in it a lie on the front of the game. */
    var spells = (BOARD.doors || []).length;
    var players = (BOARD.careers || []).length;
    if (el.mechanism) {
      el.mechanism.textContent = spells
        ? 'Today’s ' + spells + ' doors each hide one character, with three clues behind them. Choose one to play.'
        : '';
    }
  }

  /* PICKING UP A DOOR ALREADY OPEN, which is not the same as opening one.
   *
   * THE BUG THIS REPLACES was the worst in the game. Coming back with a saved
   * round, the page did show('screenPlay') and nothing else — no club, no
   * spell, no clock, no door header. A player who had never chosen anything was
   * dropped into somebody's half-finished round against a door they had not
   * picked, with a blank panel and a name box. It reads exactly as "it won't let
   * me choose, it just picks a player for me", because that is what it did.
   *
   * Resuming must NOT call /play: that opens a second round for a day that
   * banks one. It rebuilds from the saved slot and asks the server for the free
   * first rung again, which is served for nothing and carries the current
   * minute — so the clock comes back where it actually is rather than at zero.
   */
  function resumeDoor() {
    var door = null;
    for (var i = 0; i < BOARD.doors.length; i++) {
      if (Number(BOARD.doors[i].slot) === Number(state.slot)) door = BOARD.doors[i];
    }
    /* A SAVED SLOT THAT IS NOT ON TODAY'S BOARD is a stale save — the board was
       re-imported under it, or the day rolled. Start again rather than show a
       door that is not there. */
    if (!door) {
      state.playId = null;
      state.slot = null;
      state.finished = false;
      save();
      show('screenDoors');
      renderDoors();
      return;
    }
    /* No `current` here: this game has no such variable — that line came from
       QuickFire's client by hand and would have thrown on the resume path, in
       strict mode, the moment anybody came back to a saved round. Caught by
       grepping for the name rather than by running it, which is luck. */
    el.playClub.textContent = door.section;
    el.playLeft.textContent = 'Door ' + door.slot;
    var stack1 = document.getElementById('clueStack');
    if (stack1) stack1.innerHTML = '';
    if (el.playNums) el.playNums.innerHTML = '';
    el.clues.innerHTML = '';
    el.guessInput.value = '';
    el.guessGo.disabled = true;
    setFeedback('');
    renderTries();
    renderLadder();
    show('screenPlay');
    playsStart();
    startTicking();
    /* EVERY RUNG THAT WAS BOUGHT, in order, each replayed for nothing. */
    var upTo = Math.max(1, state.stage || 1);
    var chain = Promise.resolve();
    for (var st = 1; st <= upTo; st++) {
      (function (k) { chain = chain.then(function () { return buyStage(k); }); })(st);
    }
  }

  function openDoor(door) {
    if (busy) return;
    busy = true;
    post('/api/whoami/whoami_fr/play', { date: BOARD.day, slot: door.slot })
      .then(function (r) {
        busy = false;
        state.playId = r.playId;
        state.slot = door.slot;
        state.stage = 1;
        state.pointsSpent = 0;
        state.guesses = [];
        state.finished = false;
        state.solved = false;
        save();
        el.playClub.textContent = door.section;
        el.playLeft.textContent = 'Door ' + door.slot;
        var stack0 = document.getElementById('clueStack');
        if (stack0) stack0.innerHTML = '';
        el.clues.innerHTML = '';
        el.guessInput.value = '';
        el.guessGo.disabled = true;
        setFeedback('');
        renderTries();
        show('screenPlay');
        playsStart();
        anchorClock(r.minute || 0);
        renderClock();
        startTicking();
        buyStage(1);
      })
      .catch(function (e) { busy = false; trouble(e); });
  }

  /* ------------------------------------------------------------- the ladder */

function renderLadder() {
    el.ladder.innerHTML = '';
    var next = null;
    LADDER.forEach(function (rung) { if (!next && rung.stage > state.stage) next = rung; });
    if (next && !state.finished) {
      var b = document.createElement('button');
      b.className = 'rung rung-next';
      b.type = 'button';
      b.setAttribute('aria-label',
        'Ask a friend for clue ' + next.stage + ', costs ' + next.points + ' points');
      b.innerHTML = '<span class="r-sub">Ask a friend</span>' +
        '<span class="r-label">Clue ' + esc(next.stage) + ' of ' + (LADDER.length || 3) + '</span>' +
        '<span class="r-cost">&minus;' + esc(next.points) + '</span>';
      b.addEventListener('click', function () { buyStage(next.stage); });
      el.ladder.appendChild(b);
    } else if (!state.finished) {
      var none = document.createElement('p');
      none.className = 'rung-none';
      none.textContent = 'That was the last clue. Over to you.';
      el.ladder.appendChild(none);
    }
    el.giveUp.hidden = !!state.finished;
  }

function buyStage(stage) {
    if (busy) return Promise.resolve();
    busy = true;
    return post('/api/whoami/whoami_fr/clue', { playId: state.playId, stage: stage })
      .then(function (r) {
        busy = false;
        state.stage = Math.max(state.stage, r.stage);
        state.pointsSpent = r.pointsSpent;
        renderClock();
        renderClue(r);
        renderLadder();
        save();
      })
      .catch(function (e) { busy = false; trouble(e); });
  }

function renderClue(r) {
    var stack = document.getElementById('clueStack');
    if (!stack || !r || !r.text) return;
    var n = Number(r.step) || Number(r.stage) || 1;
    if (stack.querySelector('[data-step="' + n + '"]')) return;
    var of = Number(r.of) || LADDER.length || 3;
    var tier = n === 1 ? 'the hardest' : (n >= of ? 'the easiest' : 'getting warmer');
    var li = document.createElement('li');
    li.className = 'fclue';
    li.setAttribute('data-step', n);
    li.innerHTML =
      '<span class="fc-n">Clue ' + n + ' of ' + of + ' &middot; ' + tier + '</span>' +
      '<q class="fc-text">' + esc(r.text) + '</q>' +
      (r.cited ? '<span class="fc-src">On record in an episode</span>' : '');
    var before = null;
    [].forEach.call(stack.children, function (c) {
      if (!before && Number(c.getAttribute('data-step')) > n) before = c;
    });
    stack.insertBefore(li, before);
    li.classList.add('fresh');
    setTimeout(function () { li.classList.remove('fresh'); }, 900);
  }

  /* ---------------------------------------------------------- the guessing */

  function loadNames() {
    return window.XIWA_API('/api/whoami/whoami_fr/names')
      .then(function (r) { return r.json(); })
      .then(function (j) { NAMES = (j && j.names) || []; })
      .catch(function (e) {
        console.warn("name list did not load:", e);
        NAMES = [];
      });
  }

  function suggestFor(typed) {
    var key = fold(typed);
    if (key.length < CONFIG.MIN_CHARS_TO_SEARCH) return [];
    var starts = [], contains = [];
    for (var i = 0; i < NAMES.length; i++) {
      var k = NAMES[i][1];
      if (k.indexOf(key) === 0) starts.push(NAMES[i]);
      else if (k.indexOf(key) > -1) contains.push(NAMES[i]);
      if (starts.length >= CONFIG.MAX_SUGGESTIONS) break;
    }
    return starts.concat(contains).slice(0, CONFIG.MAX_SUGGESTIONS);
  }

  function renderSuggest() {
    var list = suggestFor(el.guessInput.value);
    el.suggest.innerHTML = '';
    list.forEach(function (row) {
      var b = document.createElement('button');
      b.className = 'sg';
      b.type = 'button';
      b.textContent = row[0];
      b.addEventListener('click', function () {
        el.guessInput.value = row[0];
        el.suggest.innerHTML = '';
        el.guessGo.disabled = false;
        submitGuess();
      });
      el.suggest.appendChild(b);
    });
  }

function submitGuess() {
    if (busy || state.finished) return;
    var typed = el.guessInput.value.trim();
    if (!typed) return;
    busy = true;
    el.guessGo.disabled = true;
    el.suggest.innerHTML = '';

    post('/api/whoami/whoami_fr/guess', { playId: state.playId, guess: typed })
      .then(function (r) {
        busy = false;
        state.guesses.push({ guess: typed, verdict: r.verdict });
        state.pointsSpent = r.pointsSpent != null ? r.pointsSpent : state.pointsSpent;
        renderTries();
        save();

        if (r.verdict === 'right') {
          state.finished = true;
          state.solved = true;
          renderClock();
          setFeedback('That\u2019s them \u2014 ' + r.score +
            (r.score === 1 ? ' point.' : ' points.'), 'goal');
          finish();
          return;
        }
        if (r.verdict === 'other') {
          setFeedback('That\u2019s someone else in the deck \u2014 but not the one behind this door.', 'near');
        } else if (r.verdict === 'ambiguous' && r.options && r.options.length) {
          setFeedback('That could be more than one. Did you mean\u2026', 'near');
          r.options.slice(0, 6).forEach(function (name) {
            var o = document.createElement('button');
            o.type = 'button';
            o.className = 'sugg';
            o.textContent = name;
            o.addEventListener('click', function () {
              el.guessInput.value = name;
              el.suggest.innerHTML = '';
              el.guessGo.disabled = false;
              el.guessInput.focus();
            });
            el.suggest.appendChild(o);
          });
        } else {
          setFeedback('Not them.', 'miss');
        }
        el.guessInput.value = '';
        el.guessInput.focus();
      })
      .catch(trouble);
  }

function renderTries() {
    var n = state.guesses.length;
    var near = state.guesses.filter(function (g) { return g.verdict === 'other'; }).length;
    el.tries.textContent = n
      ? n + (n === 1 ? ' name tried' : ' names tried') +
        (near ? ', ' + near + ' from elsewhere in the deck' : '')
      : '';
  }

  /* ------------------------------------------------------------- the end */

  function finish() {
    post('/api/whoami/whoami_fr/finish', { playId: state.playId })
      .then(function (r) {
        state.finished = true;
        state.solved = !!r.solved;
        save();
        bankResult(r);
        playsEnd(true);
        showDone(r);
      })
      .catch(function (e) {
        console.error("Who Am I finish:", e);
        showDone(null);
      });
  }

function showDone(r) {
    var solved = r ? r.solved : state.solved;
    var total = LADDER.length || 3;
    var used = r && r.subsUsed != null ? r.subsUsed + 1 : Math.min(state.stage || 1, total);
    var row = function (k, v) {
      return '<div class="row"><span class="rowLabel">' + k + '</span><span>' + v + '</span></div>';
    };
    el.doneKicker.textContent = solved ? 'Got them' : 'That\u2019s a wrap';
    var html = '<div class="verdict">' + (solved ? 'Solved' : 'Not this time') + '</div>';
    if (r && r.answer) {
      html += '<div class="bigname">' + esc(r.answer) + '</div>';
      if (r.section) html += '<div class="fw-door">Behind the <b>' + esc(r.section) + '</b> door</div>';
    }
    html += '<div class="fw-pips" aria-label="' + used + ' of ' + total + ' clues used">';
    for (var i = 1; i <= total; i++) {
      html += '<span class="fw-pip' + (i <= used ? ' on' : '') +
        (solved && i === used ? ' won' : '') + '"></span>';
    }
    html += '</div><div class="rows">';
    if (r && typeof r.score === 'number') html += row('Score', r.score + ' of ' + (MAX_SCORE || 10));
    html += row('Clues used', used + ' of ' + total);
    html += row('Names tried', r ? r.guesses : state.guesses.length);
    if (r && r.nearMisses) html += row('Named someone else', r.nearMisses);
    html += '</div>';
    el.doneBody.innerHTML = html;
    el.shareText.value = shareTextFor(r, solved);
    var shareRow = document.getElementById("shareRow");
    if (window.XIShare && shareRow) {
      window.XIShare.mount(shareRow, {
        text: function () { return el.shareText.value; },
        url: function () { return location.href; },
      });
    }
    show('screenDone');
  }

function shareTextFor(r, solved) {
    var total = LADDER.length || 3;
    var used = r && r.subsUsed != null ? r.subsUsed + 1 : Math.min(state.stage || 1, total);
    var bar = '';
    for (var i = 1; i <= total; i++) {
      bar += i > used ? '\u2B1C' : (solved && i === used ? '\uD83D\uDFE9' : '\uD83D\uDFE8');
    }
    return [
      'WHO AM I XI: FRIENDS',
      'No. ' + BOARD.no + ' \u2014 ' + formatDate(BOARD.day),
      '',
      bar + (solved ? '  got them' : '  no luck'),
      (r && typeof r.score === 'number' ? r.score + '/' + (MAX_SCORE || 10) : ''),
      'Names tried: ' + (r ? r.guesses : state.guesses.length)
    ].join('\n');
  }

  /* ---- the durable record and the account ------------------------------ */

  function readResults() {
    try { var x = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]"); return Array.isArray(x) ? x : []; }
    catch (e) { return []; }
  }

  function recordResult(rec) {
    try {
      /* FIRST RESULT BANKED WINS, the family's merge rule. */
      var all = readResults();
      if (all.some(function (x) { return x && x.day === rec.day; })) return;
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
    return apiAuth("/api/account/migrate", { game: "whoami_fr", results: readResults() })
      .catch(function (e) { accountNote("push", e); return null; });
  }
  function pullResults() {
    if (!account) return Promise.resolve(null);
    return apiAuth("/api/account/results?game=whoami").then(function (r) {
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
    recordResult({
      game: "whoami_fr",
      day: BOARD.day,
      no: BOARD.no,
      boardId: BOARD.id,
      slot: state.slot,
      solved: !!(r ? r.solved : state.solved),
      score: r ? r.score : null,
      minute: r ? r.minute : null,
      subs: r ? r.subsUsed : 0,
      pointsSpent: state.pointsSpent,
      guesses: r ? r.guesses : state.guesses.length
    });
    try {
      if (window.XISeason && window.XISeason.record) window.XISeason.record(BOARD.day);
    } catch (e) { accountNote("season", e); }
  }

  /* ------------------------------------------------------------ storage */

  function save() {
    try {
      localStorage.setItem(PREFIX + storageKey, JSON.stringify(state));
    } catch (e) { /* private browsing — play on without persistence */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(PREFIX + storageKey);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return s && s.day === BOARD.day ? s : null;
    } catch (e) { return null; }
  }

  /* --------------------------------------------------------------- plays */

  var runStart = 0;
  function playsProgress() {
    return {
      solved: state.solved ? 1 : 0,
      elapsed: runStart ? Math.round((Date.now() - runStart) / 1000) : 0,
      detail: { slot: state.slot, spent: state.pointsSpent, guesses: state.guesses.length }
    };
  }
  function playsStart() {
    if (!window.XIPlays) return;
    runStart = Date.now();
    window.XIPlays.start({
      game: 'whoami_fr',
      mode: DATA.isToday ? 'daily' : 'archive',
      boardKey: 'frwa:' + BOARD.day,
      /* ONE DOOR IS THE WHOLE SITTING, so the total is one rather than eleven.
         The owner's exception of 11 Sep 2026: this game's eleven are the CLUBS,
         and it banks one result a day rather than eleven. */
      total: 1
    }, playsProgress);
  }
  function playsEnd(done) {
    if (window.XIPlays && window.XIPlays.active()) window.XIPlays.end(!!done);
  }

  /* ---------------------------------------------------------------- boot */

  el.boardNo.textContent = 'No. ' + BOARD.no;
  el.boardDate.textContent = formatDate(BOARD.day);
  el.waTodayKicker.textContent =
    DATA.isToday ? 'TODAY · #' + BOARD.no : 'BOARD #' + BOARD.no;

  /* HOW MANY BOARDS THERE ARE, from the only number on the page that knows:
     today's is the last one, so today's ordinal IS the count. On an archive
     board it is not — that board is somewhere in the middle — so the card keeps
     its written line rather than being told a number that would be wrong. */
  if (DATA.isToday && Number(BOARD.no) > 0) {
    el.waPastCount.textContent = 'All ' + BOARD.no + ' boards so far';
  }

  /* The tab is the section this page is on, and the section is today's board.
     It opens the same thing the card does rather than being furniture. */
  el.navToday.addEventListener('click', function () { el.waToday.click(); });

  el.waToday.addEventListener('click', function () {
    el.waHome.hidden = true;
    el.waGame.hidden = false;
    /* THREE STATES, AND EACH ONE REBUILDS WHAT IT SHOWS. This used to show a
       screen and render nothing into it, so a resumed round arrived blank. */
    if (state.finished) { show('screenDone'); finish(); return; }
    if (state.playId && state.slot) { resumeDoor(); return; }
    renderDoors();
    show('screenDoors');
  });

  el.backToDoors.addEventListener('click', function () {
    /* REDRAWN, because the doors were built once at boot and the rule above
       only applies when they are rebuilt. Showing the screen was not enough. */
    renderDoors();
    /* ONE DOOR PER DAY. Going back shows the board again so the player can see
       what the other ten were, but it does not offer another go: the round is
       finished on the server and opening a second would be a second result for
       a day that banks one. */
    show('screenDoors');
  });

  el.guessInput.addEventListener('input', function () {
    el.guessGo.disabled = !el.guessInput.value.trim();
    renderSuggest();
  });
  el.guessInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submitGuess(); }
  });
  /* THE ONE PLACE A DOOR IS OPENED FROM. The cards choose; this commits, and
     it is the only path to openDoor — so a card cannot spend the day's single
     go by being clicked once. */
  el.playChoice.addEventListener('click', function () {
    if (picked) openDoor(picked);
  });
  el.guessGo.addEventListener('click', submitGuess);

  el.giveUp.addEventListener('click', function () {
    if (busy || state.finished) return;
    busy = true;
    el.giveUp.disabled = true;
    post('/api/whoami/whoami_fr/giveup', { playId: state.playId })
      .then(function (r) {
        busy = false;
        state.finished = true;
        state.solved = false;
        stopTicking();
        renderClue(r);
        renderLadder();
        save();
        finish();
      })
      .catch(function (e) { busy = false; el.giveUp.disabled = false; trouble(e); });
  });

  el.copyShare.addEventListener('click', function () {
    var ok = false;
    if (navigator.clipboard) { navigator.clipboard.writeText(el.shareText.value).catch(function () {}); ok = true; }
    else {
      var t = document.createElement('textarea');
      t.value = el.shareText.value; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(t);
    }
    el.copyShare.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(function () { el.copyShare.textContent = 'Copy result'; }, 1600);
  });

  var saved = load();
  if (saved) {
    state = saved;
    el.waTodayState.textContent = saved.finished
      ? (saved.solved ? 'Solved' : 'Played')
      : 'In progress';
  }

  renderDoors();
  renderLadder();
  loadNames();
}
