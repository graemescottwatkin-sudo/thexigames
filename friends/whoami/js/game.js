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
var BUILD = "v001p";

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
    solved: false,
    worth: null,
    wrongs: 0,
    ring: 0,
    answer: null,
    cards: []
  };
  var CARD_MAX = RULE.cardMax || 18;
  var BONUS = RULE.bonus != null ? RULE.bonus : 10;
  var RING = RULE.ring || 3;

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
    renderStrip();
    var total = LADDER.length || 3;
    var seen = Math.min(Math.max(1, state.stage || 1), total);
    /* WORTH NOW IS THE SERVER'S: it takes the wrong names off as well as the
       clues, and the page does not count those itself. */
    var worth = state.worth != null ? state.worth : Math.max(0, CARD_MAX - (state.pointsSpent || 0));
    var done = (state.cards || []).length;
    var key = seen + ':' + worth + ':' + done;
    if (key === clock.shown) return;
    clock.shown = key;
    /* NO CLOCK IN THE BAR EITHER: it read 0' all round, football's match
       minute on a game that has none (the owner's iPad, 30 Sep 2026). A dash,
       as Scrambled XI: Friends shows. */
    if (window.XIBar) XIBar.set({ progress: Math.min(done + 1, BOARD.doors.length) + '/' + BOARD.doors.length,
                                  clock: '–', score: dayScore(), worth: worth });
    el.clockValue.textContent = seen;
    el.stripFill.style.width = Math.min(100, (seen / total) * 100) + '%';
    el.stripFill.classList.toggle('late', seen >= total);
    el.worthNow.textContent = worth;
    el.worthNow.classList.toggle('low', worth <= 5);
  }

  /* THE DAY'S CARDS ACROSS THE TOP OF THE ROUND (the owner, 30 Sep 2026:
     "have room to show Person / place 1, 2, 3, 4 and 5 above. Once it's
     guessed and you move onto 2, answer one is visible still. Highlight the
     one we are in"). One chip a card: its number, then who it was once the
     card has closed -- got or told -- and the card in play ringed. Built
     from state.cards, the same record Full Time and the list of cards read,
     so it cannot say a card was got that the day did not bank. */
  function renderStrip() {
    var strip = document.getElementById('frStrip');
    if (!strip) return;
    var cards = state.cards || [];
    var at = state.playId && !state.finished ? cards.length : -1;
    var html = '';
    BOARD.doors.forEach(function (d, i) {
      var c = cards[i];
      var cls = 'frs' + (c ? (c.solved ? ' got' : ' lost') : '') + (i === at ? ' now' : '');
      var say = c ? (c.answer || (c.solved ? 'Got' : 'Missed')) : (i === at ? 'Playing' : '?');
      html += '<li class="' + cls + '"' + (i === at ? ' aria-current="step"' : '') + '>' +
        '<span class="frs-n">' + (i + 1) + '</span><span class="frs-a">' + esc(say) + '</span></li>';
    });
    if (strip.innerHTML !== html) strip.innerHTML = html;
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
   'waPastCount',
   'boardNo', 'boardDate', 'screenDoors', 'screenPlay', 'screenDone',
   'doors', 'mechanism', 'lede', 'playClub', 'playLeft', 'playNums',
   'commit', 'commitPick', 'playChoice', 'clues', 'ladder',
   'stripFill', 'clockValue', 'worthNow', 'giveUp',
   'guessInput', 'guessGo', 'suggest', 'feedback', 'tries',
   'ftPanel', 'backToDoors']
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

  /* THE VERDICT IS A CALLOUT, NOT A CAPTION (the owner, 30 Sep 2026: "Can we
     have some sort of notification about the answer being right or wrong,
     it's hard to see clearly right now"). It was a line of small grey
     capitals, and a miss was grey on grey. Now each verdict is a coloured
     box with its own mark (style.css), and it is PLAYED AGAIN every time:
     the class comes off, the box is measured, and the class goes back on, so
     a second "Not him" in a row arrives as a second verdict rather than
     leaving the first one sitting there looking unchanged. */
  function setFeedback(text, kind) {
    el.feedback.textContent = text || '';
    el.feedback.className = 'feedback';
    if (text) void el.feedback.offsetWidth;
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
    /* THE DAY'S CARDS, IN THE ORDER THEY ARE PLAYED: none is chosen, so this
       is a list, not a set of buttons -- what is done, what is next, what is to
       come. The Start button opens the next one. */
    var cards = state.cards || [];
    var n = BOARD.doors.length;
    var next = cards.length + 1;
    el.doors.innerHTML = '';
    el.doors.setAttribute('role', 'list');
    picked = null;
    BOARD.doors.forEach(function (d, i) {
      var c = cards[i];
      var b = document.createElement('div');
      b.setAttribute('role', 'listitem');
      b.className = 'door frc' + (c ? (c.solved ? ' frc-got' : ' frc-lost') : (i + 1 === next ? ' frc-next' : ''));
      var say = c ? (c.solved ? (c.answer || 'Got') + ' · ' + c.score : 'Not this time' + (c.answer ? ' · ' + c.answer : ''))
                  : (i + 1 === next ? 'Up next' : 'To come');
      b.innerHTML = '<span class="d-club">Card ' + (i + 1) + '</span>' +
        '<span class="d-year">' + esc(d.section) + '</span>' +
        '<span class="d-cap">' + esc(say) + '</span>';
      el.doors.appendChild(b);
    });
    var dayDone = cards.length >= n;
    if (el.commit) el.commit.hidden = dayDone || !n;
    if (el.playChoice) {
      el.playChoice.disabled = dayDone;
      el.playChoice.innerHTML = (cards.length || state.playId ? 'Carry on' : 'Start') +
        ' <span aria-hidden="true">&#8594;</span>';
    }
    if (el.commitPick) el.commitPick.textContent = dayDone ? '' : 'Card ' + next + ' of ' + n;
    if (el.lede) {
      el.lede.textContent = dayDone
        ? 'That’s today done: ' + dayScore() + ' of ' + dayMax() + '.'
        : n + ' cards, one after another. Use the clues to work out who is behind each.';
    }
    if (el.mechanism) {
      el.mechanism.textContent = n
        ? 'Each card hides one character, with three clues. A wrong name costs a point, and three in a row bring out the next clue.'
        : '';
    }
  }

  /* THE NEXT CARD: the one after the last finished, or the one already open. */
  function openNext() {
    var cards = state.cards || [];
    var d = BOARD.doors[cards.length];
    if (!d) { showDone(); return; }
    if (state.playId && !state.finished && Number(state.slot) === Number(d.slot)) { resumeDoor(); return; }
    openDoor(d);
  }

  /* THE DAY'S SCORE: the cards, and the bonus when every one was got. */
  function dayScore() {
    var cards = state.cards || [];
    var sum = cards.reduce(function (a, c) { return a + (Number(c.score) || 0); }, 0);
    var all = cards.length === BOARD.doors.length && cards.every(function (c) { return c.solved; });
    return sum + (all ? BONUS : 0);
  }
  function dayMax() { return BOARD.doors.length * CARD_MAX + BONUS; }

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
    /* PICKING UP THE CARD ALREADY OPEN -- never a second /play for it, which
       would be a second round for one card. Every clue it had is replayed,
       free. A saved slot not on today's board is a stale save: start again. */
    var door = null;
    for (var i = 0; i < BOARD.doors.length; i++) {
      if (Number(BOARD.doors[i].slot) === Number(state.slot)) door = BOARD.doors[i];
    }
    if (!door) {
      state.playId = null; state.slot = null; state.finished = false;
      save(); renderDoors(); show('screenDoors');
      return;
    }
    el.giveUp.disabled = false;
    el.playClub.textContent = door.section;
    el.playLeft.textContent = 'Card ' + door.slot + ' of ' + BOARD.doors.length;
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
    if (!(window.XIPlays && window.XIPlays.active && window.XIPlays.active())) playsStart();
    startTicking();
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
        var first = !(state.cards || []).length;
        state.playId = r.playId;
        state.slot = door.slot;
        state.stage = 1;
        state.pointsSpent = 0;
        state.guesses = [];
        state.finished = false;
        state.solved = false;
        state.worth = r.worthNow != null ? r.worthNow : CARD_MAX;
        state.wrongs = 0;
        state.ring = 0;
        state.answer = null;
        save();
        /* "Tell me" on the last card disabled it; a new card starts with it. */
        el.giveUp.disabled = false;
        el.playClub.textContent = door.section;
        el.playLeft.textContent = 'Card ' + door.slot + ' of ' + BOARD.doors.length;
        var stack0 = document.getElementById('clueStack');
        if (stack0) stack0.innerHTML = '';
        el.clues.innerHTML = '';
        el.guessInput.value = '';
        el.guessGo.disabled = true;
        setFeedback('');
        renderTries();
        show('screenPlay');
        if (first) playsStart();
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
        if (r.worthNow != null) state.worth = r.worthNow;
        if (r.ring != null) state.ring = r.ring;
        if (r.wrongs != null) state.wrongs = r.wrongs;
        renderClock();
        renderClue(r);
        renderLadder();
        renderTries();
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
      (r.cited ? '<span class="fc-src">' + (r.citedBy === 'web'
        ? 'Checked against a published source' : 'On record in an episode') + '</span>' : '');
    var before = null;
    [].forEach.call(stack.children, function (c) {
      if (!before && Number(c.getAttribute('data-step')) > n) before = c;
    });
    stack.insertBefore(li, before);
    li.classList.add('fresh');
    setTimeout(function () { li.classList.remove('fresh'); }, 900);
    drawLocked(stack, of);
  }

  /* THE CLUES STILL TO COME ARE ON THE CARD, BLURRED (the owner, 30 Sep
     2026: "have clue 1,2 and 3 all showing in the game but only clue 1
     legible, 2 and 3 not clear until reveal 2 and 3 is pressed"). A card per
     clue not yet bought, after the last one that was, with its number and
     tier readable and its sentence not. THE SENTENCE IS A STAND-IN, never the
     clue: the server sends a clue's text only once it has been paid for, so
     the page has nothing real to blur -- and a blur over real text is one
     "inspect element" from being read. Redrawn whenever a clue lands. */
  function drawLocked(stack, of) {
    [].slice.call(stack.querySelectorAll('.fclue.locked')).forEach(function (c) { c.remove(); });
    var top = 0;
    [].forEach.call(stack.children, function (c) { top = Math.max(top, Number(c.getAttribute('data-step')) || 0); });
    for (var k = top + 1; k <= of; k++) {
      var lk = document.createElement('li');
      lk.className = 'fclue locked';
      lk.setAttribute('data-locked', k);
      lk.innerHTML =
        '<span class="fc-n">Clue ' + k + ' of ' + of + ' &middot; ' + (k >= of ? 'the easiest' : 'getting warmer') + '</span>' +
        '<span class="fc-text fc-hid" aria-hidden="true">This one stays out of focus until you ask a friend for it.</span>' +
        '<span class="sr-only">Not asked for yet.</span>';
      stack.appendChild(lk);
    }
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
        if (r.wrongs != null) state.wrongs = r.wrongs;
        if (r.ring != null) state.ring = r.ring;
        if (r.worthNow != null) state.worth = r.worthNow;
        renderTries();
        save();

        if (r.verdict === 'right') {
          state.finished = true;
          state.solved = true;
          state.answer = r.answer || null;
          state.worth = r.score;
          renderClock();
          renderLadder();
          setFeedback('That’s ' + (r.answer || 'them') + ' — ' + r.score +
            (r.score === 1 ? ' point.' : ' points.'), 'goal');
          finish();
          return;
        }
        /* THE RING FULL ON THE LAST CLUE: the card is lost, and who it was is
           said, because a game that says "no" three times owes the answer. */
        if (r.lost) {
          state.finished = true;
          state.solved = false;
          state.answer = r.answer || null;
          state.worth = 0;
          renderClock();
          renderLadder();
          setFeedback('Three wrong on the last clue. It was ' + (r.answer || 'someone else') + '.', 'miss');
          finish();
          return;
        }
        /* THE RING FULL BEFORE THE LAST: the next clue, by itself, at its price. */
        if (r.autoClue && r.clue) {
          state.stage = Math.max(state.stage, r.clue.stage || state.stage);
          renderClue(r.clue);
          renderLadder();
          renderClock();
          /* Redrawn AFTER the stage moved: on the last clue the ring now warns
             that the card itself is at stake. */
          renderTries();
          setFeedback('Three wrong. Here’s the next clue.', 'near');
          el.guessInput.value = '';
          el.guessInput.focus();
          return;
        }
        renderClock();
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
      .catch(function (e) { busy = false; trouble(e); });
  }

function renderTries() {
    var ring = Math.min(RING, state.ring || 0);
    var C = 17, R = 16, svg = '<svg class="fr-ring" viewBox="0 0 34 34" width="34" height="34" aria-hidden="true">';
    for (var i = 0; i < RING; i++) {
      var a0 = -Math.PI / 2 + i * 2 * Math.PI / RING, a1 = a0 + 2 * Math.PI / RING;
      var x0 = (C + R * Math.cos(a0)).toFixed(2), y0 = (C + R * Math.sin(a0)).toFixed(2);
      var x1 = (C + R * Math.cos(a1)).toFixed(2), y1 = (C + R * Math.sin(a1)).toFixed(2);
      svg += '<path d="M' + C + ' ' + C + ' L' + x0 + ' ' + y0 + ' A' + R + ' ' + R + ' 0 0 1 ' + x1 + ' ' + y1 +
        ' Z" style="fill:' + (i < ring ? 'var(--danger, #B3261E)' : 'var(--tint-strong, #E4E6E1)') +
        ';stroke:var(--card, #fff);stroke-width:1.5"/>';
    }
    svg += '</svg>';
    var last = (state.stage || 1) >= (LADDER.length || 3);
    var left = RING - ring;
    var say = state.finished ? ''
      : ring === 0 ? (last ? 'Three wrong names on this clue and the card is lost.' : 'Three wrong names bring out the next clue.')
      : ring + ' wrong · ' + left + ' more ' + (last ? 'and the card is lost.' : 'and the next clue comes out.');
    el.tries.innerHTML = state.finished ? '' : svg + '<span class="fr-ring-say">' + esc(say) + '</span>';
    el.tries.setAttribute('aria-label', say);
  }

  /* ------------------------------------------------------------- the end */

function finish() {
    post('/api/whoami/whoami_fr/finish', { playId: state.playId })
      .then(function (r) { closeCard(r); })
      .catch(function (e) { console.error('Who Am I finish:', e); closeCard(null); });
  }

  /* A CARD CLOSES: its result joins the day, once, and the next card comes up
     by itself after a moment to read the verdict -- or, after the last, the
     day's Full Time. */
  function closeCard(r) {
    var cards = state.cards || (state.cards = []);
    var slot = Number(state.slot);
    if (!cards.some(function (c) { return Number(c.slot) === slot; })) {
      cards.push({
        slot: slot,
        section: (r && r.section) || '',
        solved: r ? !!r.solved : !!state.solved,
        score: r && typeof r.score === 'number' ? r.score : 0,
        clues: Math.max(1, state.stage || 1),
        wrongs: r && r.wrongs != null ? r.wrongs : (state.wrongs || 0),
        answer: (r && r.answer) || state.answer || null,
        /* THE CLUES IT DEALT AND WHERE THEY CAME FROM, which /finish sends
           only for a closed card -- shown at Full Time, never before. */
        cited: r && Array.isArray(r.clues) ? r.clues : null
      });
    }
    state.finished = true;
    save();
    stopTicking();
    renderClock();
    var count = cards.length;
    if (count >= BOARD.doors.length) {
      bankResult();
      playsEnd(true);
      setTimeout(showDone, 1600);
      return;
    }
    setTimeout(function () {
      if (state.finished && (state.cards || []).length === count) openNext();
    }, 1800);
  }

  /* FULL TIME, THE FAMILY'S WAY (shared/xi-fulltime.js). One door a day,
     not eleven answers, so the panel shows the door and the clue ladder it
     took in place of boxes -- and, now the door has closed, who it was. */
function showDone() {
    /* THE DAY'S FULL TIME, the family's panel: the day out of 100 in the ring,
       a box per card, the help that was used beside it, and who each card was
       under "Your answers". No right-and-wrong count: the boxes are that. */
    var cards = state.cards || [];
    var n = BOARD.doors.length;
    var got = cards.filter(function (c) { return c.solved; }).length;
    var score = dayScore(), max = MAX_SCORE || dayMax();
    var extra = cards.reduce(function (a, c) { return a + Math.max(0, (c.clues || 1) - 1); }, 0);
    var wrong = cards.reduce(function (a, c) { return a + (c.wrongs || 0); }, 0);
    var help = [];
    if (extra) help.push(extra + (extra === 1 ? ' extra clue' : ' extra clues'));
    if (wrong) help.push(wrong + (wrong === 1 ? ' wrong name' : ' wrong names'));
    var boxes = BOARD.doors.map(function (d, i) { var c = cards[i]; return { s: c ? (c.solved ? 'g' : 'r') : 'x' }; });
    if (window.XIFullTime && XIFullTime.panel) {
      XIFullTime.panel(el.ftPanel, {
        game: 'whoami_fr', name: 'Who Am I XI: Friends', no: BOARD.no, date: XIFullTime.dayLabel(BOARD.day),
        kicker: 'That’s a wrap',
        score: score, max: max, boxes: boxes, help: help,
        stats: got === n ? 'All ' + n + ' got: +' + BONUS + ' bonus' : got + ' of ' + n + ' got',
        answers: cards.map(function (c) {
          return { s: c.solved ? 'g' : 'r', m: null, text: c.answer || '', points: c.score };
        }),
        /* THE SHARE NAMES NOBODY: the day in squares, not who they were. */
        share: function () {
          return 'Who Am I XI: Friends · No. ' + BOARD.no + ' · ' + score + '/' + max +
            String.fromCharCode(10) + XIFullTime.squares(boxes);
        },
        url: function () { return location.href.split('#')[0]; },
      });
    }
    renderSources(cards);
    show('screenDone');
  }

  /* WHERE THE CLUES CAME FROM, card by card: each clue the player saw, then
     what it rests on -- the episode and the line, or the page and the sentence.
     A link only where the server sent one; it sends one only for a host the
     family shows, and this refuses anything that is not https besides. */
  function renderSources(cards) {
    var box = document.getElementById('frSources');
    if (!box) return;
    /* A card whose clues carry no citation has nothing to show here, and a
       day with none shows no block at all rather than an empty one. */
    var withAny = cards.filter(function (c) {
      return (c.cited || []).some(function (cl) { return cl.sources && cl.sources.length; });
    });
    if (!withAny.length) { box.hidden = true; box.innerHTML = ''; return; }
    var html = '<summary>Where the clues came from</summary>';
    withAny.forEach(function (c) {
      html += '<div class="frs-card"><h3 class="frs-who">' + esc(c.answer || 'This card') + '</h3><ol class="frs-clues">';
      c.cited.forEach(function (cl) {
        html += '<li><q class="frs-clue">' + esc(cl.text || '') + '</q>';
        (cl.sources || []).forEach(function (s) {
          var label = esc(s.label || '');
          var link = s.url && /^https:[/][/]/.test(s.url)
            ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>'
            : '<span>' + label + '</span>';
          html += '<div class="frs-src">' + link + (s.quote ? '<q class="frs-quote">' + esc(s.quote) + '</q>' : '') + '</div>';
        });
        html += '</li>';
      });
      html += '</ol></div>';
    });
    box.innerHTML = html;
    box.hidden = false;
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
    return apiAuth("/api/account/results?game=whoami_fr").then(function (r) {
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


function bankResult() {
    /* THE DAY, BANKED ONCE: its score, how many cards were got, and each card
       as it was played. First banked wins, the family's rule. */
    var cards = state.cards || [];
    var got = cards.filter(function (c) { return c.solved; }).length;
    var all = got === BOARD.doors.length;
    recordResult({
      game: "whoami_fr",
      day: BOARD.day,
      no: BOARD.no,
      boardId: BOARD.id,
      solved: all,
      cardsSolved: got,
      bonus: all ? BONUS : 0,
      score: dayScore(),
      /* WHEN IT WAS FINISHED: a day played on its own day keeps a streak
         going; one caught up later does not (XIPlayed.playedDays). */
      at: Date.now(),
      cards: cards.map(function (c) {
        return { slot: c.slot, solved: !!c.solved, score: c.score, clues: c.clues, wrongs: c.wrongs };
      })
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
      return s && s.day === BOARD.day && Array.isArray(s.cards) ? s : null;
    } catch (e) { return null; }
  }

  /* --------------------------------------------------------------- plays */

  var runStart = 0;
function playsProgress() {
    var cards = state.cards || [];
    return {
      solved: cards.filter(function (c) { return c.solved; }).length,
      elapsed: runStart ? Math.round((Date.now() - runStart) / 1000) : 0,
      detail: { cards: cards.length, score: dayScore() }
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
      total: BOARD.doors.length
    }, playsProgress);
  }
  function playsEnd(done) {
    if (window.XIPlays && window.XIPlays.active()) window.XIPlays.end(!!done);
  }

  /* ---------------------------------------------------------------- boot */

  el.boardNo.textContent = 'No. ' + BOARD.no;
  el.boardDate.textContent = formatDate(BOARD.day);
  /* THE FAMILY'S TOP BAR, named with this board: its number, its day, and
     whether the server says it is today's. */
  if (window.XIBar) {
    XIBar.mount(document.getElementById('xiBar'));
    XIBar.set({ name: "Who Am I XI: Friends", no: BOARD.no, day: BOARD.day, old: !DATA.isToday,
                progress: null, clock: "0'", score: null, worth: null, subs: null });
  }
  el.waTodayKicker.textContent =
    DATA.isToday ? 'TODAY · #' + BOARD.no : 'BOARD #' + BOARD.no;
  /* And the card's title with it: "Today's eleven" over board 4 was the kicker
     fixed and the line under it not (found in the app, 25 Sep 2026). The
     title is the theme's own words ("eleven", "three"), so only the day goes. */
  var todayTitle = el.waToday && el.waToday.querySelector('.hc-title');
  if (!DATA.isToday && todayTitle) {
    todayTitle.textContent = todayTitle.textContent.replace(/^Today’s /, 'The ');
  }

  /* HOW MANY BOARDS THERE ARE, from the only number on the page that knows:
     today's is the last one, so today's ordinal IS the count. On an archive
     board it is not — that board is somewhere in the middle — so the card keeps
     its written line rather than being told a number that would be wrong. */
  if (DATA.isToday && Number(BOARD.no) > 0) {
    el.waPastCount.textContent = 'All ' + BOARD.no + ' boards so far';
  }

  /* The tab row came off the game page on 27 Sep 2026 (the owner: the same
     page for every game); today's board is the card. */

  el.waToday.addEventListener('click', function () {
    el.waHome.hidden = true;
    el.waGame.hidden = false;
    /* THREE STATES, AND EACH ONE REBUILDS WHAT IT SHOWS. This used to show a
       screen and render nothing into it, so a resumed round arrived blank. */
    if ((state.cards || []).length >= BOARD.doors.length) { showDone(); return; }
    if (state.playId && !state.finished) { resumeDoor(); return; }
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
    openNext();
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


  var saved = load();
  if (saved) {
    state = saved;
    el.waTodayState.textContent = (saved.cards || []).length >= BOARD.doors.length
      ? 'Played · ' + dayScore() + ' of ' + dayMax()
      : ((saved.cards || []).length || saved.playId ? 'In progress' : '');
  }

  renderDoors();
  renderLadder();
  loadNames();
}
