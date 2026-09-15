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
var BUILD = "v001";

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
  var askedNo = (/[#&]b=(\d+)/.exec(hash) || [])[1];
  var url = "/api/whoami/daily" + (askedNo ? "?no=" + encodeURIComponent(askedNo) : "");

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
        "There is no Who Am I board for today. That is not a connection problem, so trying again will not help."];
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
        hero.querySelector(".hc-title").textContent = "Who Am I XI";
        hero.querySelector(".hc-note").textContent = said[1];
        var state = hero.querySelector(".hc-state");
        if (state) state.textContent = "";
      }
    });
})();

function start() {
  'use strict';

  var PREFIX = "xiwa.";
  var RESULTS_KEY = PREFIX + "results.v1";
  var CONFIG = window.XIWA_CONFIG;
  var DATA = window.XIWA_DATA;
  var BOARD = DATA.board;

  var storageKey = CONFIG.STORAGE_KEY + ':' + BOARD.day;

  var state = {
    day: BOARD.day,
    no: BOARD.no,
    playId: null,
    slot: null,
    stage: 1,
    subsUsed: 0,
    guesses: [],
    finished: false,
    solved: false
  };

  var NAMES = [];      // [[display, foldedKey], …] — the answer space
  var busy = false;

  var el = {};
  ['waHome', 'waGame', 'waToday', 'waTodayKicker', 'waTodayState',
   'boardNo', 'boardDate', 'screenDoors', 'screenPlay', 'screenDone',
   'doors', 'careers', 'playClub', 'playLeft', 'clues', 'ladder',
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

  function show(id) {
    ['screenDoors', 'screenPlay', 'screenDone'].forEach(function (s) {
      if (el[s]) el[s].hidden = (s !== id);
    });
  }

  /* ------------------------------------------------------------ the board */

  function renderDoors() {
    el.doors.innerHTML = '';
    BOARD.doors.forEach(function (d) {
      var b = document.createElement('button');
      b.className = 'door';
      b.type = 'button';
      b.innerHTML = '<span class="d-club">' + esc(d.club) + '</span>' +
        '<span class="d-left">left ' + esc(d.leave) + '</span>';
      b.addEventListener('click', function () { openDoor(d); });
      el.doors.appendChild(b);
    });
    /* SORTED AND UNATTRIBUTED, exactly as the server sent them. Rendering these
       beside their doors would undo the whole point of sorting them. */
    var c = BOARD.careers || [];
    el.careers.textContent = c.length
      ? 'Clubs played for, across today’s eleven: ' + c.join(', ')
      : '';
  }

  function openDoor(door) {
    if (busy) return;
    busy = true;
    post('/api/whoami/play', { date: BOARD.day, slot: door.slot })
      .then(function (r) {
        busy = false;
        state.playId = r.playId;
        state.slot = door.slot;
        state.stage = 1;
        state.subsUsed = 0;
        state.guesses = [];
        state.finished = false;
        state.solved = false;
        save();
        el.playClub.textContent = door.club;
        el.playLeft.textContent = 'left in ' + door.leave;
        el.clues.innerHTML = '';
        el.guessInput.value = '';
        el.guessGo.disabled = true;
        setFeedback('');
        renderTries();
        show('screenPlay');
        playsStart();
        buyStage(1);
      })
      .catch(function (e) { busy = false; trouble(e); });
  }

  /* ------------------------------------------------------------- the ladder */

  function renderLadder() {
    el.ladder.innerHTML = '';
    CONFIG.LADDER.forEach(function (rung) {
      if (rung.stage <= state.stage) return;        // already taken
      var b = document.createElement('button');
      b.className = 'rung' + (rung.reveals.indexOf('answer') > -1 ? ' giveup' : '');
      b.type = 'button';
      var cost = rung.cost === 1 ? 'one sub' : rung.cost + ' subs';
      b.innerHTML = '<span class="r-label">' + esc(rung.label) + '</span>' +
        '<span class="r-cost">' + esc(cost) + '</span>';
      b.disabled = state.finished;
      b.addEventListener('click', function () { buyStage(rung.stage); });
      el.ladder.appendChild(b);
    });
  }

  function buyStage(stage) {
    if (busy) return;
    busy = true;
    post('/api/whoami/clue', { playId: state.playId, stage: stage })
      .then(function (r) {
        busy = false;
        state.stage = Math.max(state.stage, r.stage);
        state.subsUsed = r.subsUsed;
        renderClue(r);
        renderLadder();
        save();
        if (r.finished) {
          /* Given up: the door is closed and the answer is on the screen. */
          state.finished = true;
          state.solved = false;
          finish();
        }
      })
      .catch(function (e) { busy = false; trouble(e); });
  }

  function renderClue(r) {
    var box = document.createElement('div');
    box.className = 'clue';
    var bits = ['<span class="c-label">' + esc(r.label) + '</span>'];

    if (r.spell) {
      var s = r.spell;
      var years = (s.from ? s.from : '') + (s.to ? '–' + s.to : '');
      bits.push('<span class="c-body">' + esc(s.club) +
        (years ? ', ' + esc(years) : '') +
        (s.apps != null ? ' · ' + esc(s.apps) + ' apps' : '') +
        (s.goals ? ' · ' + esc(s.goals) + ' goals' : '') + '</span>');
    }
    if (r.career) {
      bits.push('<span class="c-body">' + esc(r.career) + '</span>');
    }
    if (r.age != null || r.nationality) {
      bits.push('<span class="c-body">' +
        (r.age != null ? esc(r.age) + ' years old' : '') +
        (r.nationality ? (r.age != null ? ' · ' : '') + esc(r.nationality) : '') +
        (r.position ? ' · ' + esc(r.position) : '') + '</span>');
    }
    if (r.answer) {
      bits.push('<span class="c-body answer">' + esc(r.answer) + '</span>');
    }
    box.innerHTML = bits.join('');
    el.clues.appendChild(box);
  }

  /* ---------------------------------------------------------- the guessing */

  function loadNames() {
    return window.XIWA_API('/api/whoami/names')
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

    post('/api/whoami/guess', { playId: state.playId, guess: typed })
      .then(function (r) {
        busy = false;
        state.guesses.push({ guess: typed, verdict: r.verdict });
        state.subsUsed = r.subsUsed != null ? r.subsUsed : state.subsUsed;
        renderTries();
        save();

        if (r.verdict === 'right') {
          state.finished = true;
          state.solved = true;
          setFeedback('That is him.', 'goal');
          finish();
          return;
        }
        if (r.verdict === 'right-club') {
          /* THE NEAR MISS. It says it was one and stops there — the server
             sends no answer with it, because saying who it actually was would
             end the game for the price of a wrong guess, with the door still
             live for everyone else that day. */
          setFeedback('He played there — but he is not the one behind this door.', 'near');
        } else {
          setFeedback('Not him.', 'miss');
        }
        el.guessInput.value = '';
        el.guessInput.focus();
      })
      .catch(trouble);
  }

  function renderTries() {
    var n = state.guesses.length;
    var near = state.guesses.filter(function (g) { return g.verdict === 'right-club'; }).length;
    el.tries.textContent = n
      ? n + (n === 1 ? ' name tried' : ' names tried') +
        (near ? ', ' + near + ' who played there' : '')
      : '';
  }

  /* ------------------------------------------------------------- the end */

  function finish() {
    post('/api/whoami/finish', { playId: state.playId })
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
    el.doneKicker.textContent = solved ? 'Got him' : 'Full time';
    var html = '';
    html += '<div class="verdict">' + (solved ? 'Solved' : 'Not this time') + '</div>';
    if (r && r.answer) {
      html += '<div class="bigname">' + esc(r.answer) + '</div>';
      if (r.club) html += '<div class="row"><span class="rowLabel">Your door</span><span>' +
        esc(r.club) + '</span></div>';
      if (r.career) html += '<div class="career">' + esc(r.career) + '</div>';
      if (r.article) html += '<a class="more" href="' + esc(r.article) +
        '" target="_blank" rel="noopener">Read about him</a>';
    }
    html += '<div class="rows">';
    html += '<div class="row"><span class="rowLabel">Clues taken</span><span>' +
      ((r ? r.subsUsed : state.subsUsed) + 1) + ' of ' + (CONFIG.LADDER.length) + '</span></div>';
    html += '<div class="row"><span class="rowLabel">Names tried</span><span>' +
      (r ? r.guesses : state.guesses.length) + '</span></div>';
    if (r && r.nearMisses) {
      html += '<div class="row"><span class="rowLabel">Played there</span><span>' +
        r.nearMisses + '</span></div>';
    }
    html += '</div>';
    el.doneBody.innerHTML = html;
    el.shareText.value = shareTextFor(r, solved);
    show('screenDone');
  }

  function shareTextFor(r, solved) {
    /* NO NAME IN THE SHARE TEXT. Ten doors are still live for everybody else
       today, and a result pasted into a group chat must not be a spoiler for
       the other ten. The door and the clues taken say enough. */
    return [
      'WHO AM I XI',
      'No. ' + BOARD.no + ' — ' + formatDate(BOARD.day),
      '',
      (r && r.club ? r.club : '') + (solved ? ' — got him' : ' — no luck'),
      'Clues: ' + ((r ? r.subsUsed : state.subsUsed) + 1) + ' of ' + CONFIG.LADDER.length,
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
    return apiAuth("/api/account/migrate", { game: "whoami", results: readResults() })
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

  document.addEventListener('xi:account', function (e) {
    account = (e && e.detail && e.detail.account) || null;
    if (account) pullResults().then(pushResults);
  });
  try {
    if (window.XIChrome && window.XIChrome.account) {
      account = window.XIChrome.account();
      if (account) pullResults();
    }
  } catch (e) { accountNote("boot", e); }

  function bankResult(r) {
    recordResult({
      game: "whoami",
      day: BOARD.day,
      no: BOARD.no,
      boardId: BOARD.id,
      slot: state.slot,
      solved: !!(r ? r.solved : state.solved),
      subs: r ? r.subsUsed : state.subsUsed,
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
      detail: { slot: state.slot, subs: state.subsUsed, guesses: state.guesses.length }
    };
  }
  function playsStart() {
    if (!window.XIPlays) return;
    runStart = Date.now();
    window.XIPlays.start({
      game: 'whoami',
      mode: DATA.isToday ? 'daily' : 'archive',
      boardKey: 'wa:' + BOARD.day,
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
  el.waTodayKicker.textContent = DATA.isToday ? 'TODAY' : 'A BOARD THAT HAS BEEN';

  el.waToday.addEventListener('click', function () {
    el.waHome.hidden = true;
    el.waGame.hidden = false;
    show(state.finished ? 'screenDone' : (state.playId ? 'screenPlay' : 'screenDoors'));
    if (state.finished) finish();
  });

  el.backToDoors.addEventListener('click', function () {
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
  el.guessGo.addEventListener('click', submitGuess);

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
