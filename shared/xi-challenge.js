/* xi-challenge.js — finish a board, send it to somebody, see who won.
 *
 * WHY THIS IS SHARED AND NOT COPIED. The crossword has had challenges since
 * they were built and no other game has had them at all, because the whole
 * flow lived inside crossword/js/game.js: the invitation screen, the name
 * taken before the board opens, the entry posted at Full Time, the standings.
 * Four more copies of that is four places for the rule "nothing competitive
 * before you have played" to be got wrong. The owner asked for challenges in
 * every game; this is the once.
 *
 * WHAT A GAME SUPPLIES, and it is only what is genuinely its own:
 *
 *   game          the id the server knows it by
 *   openByToken   how to open the board a challenge names. A token is that
 *                 game's own — hlb:296, sc:41, theme:arsenal-1 — because the
 *                 server hands back the key the game already uses.
 *   boardLabel    what the board is called out loud, for the invitation
 *   column        the third column of the table: its heading, and how to read
 *                 it off an entry. Score and time are the same everywhere;
 *                 help is not. The crossword's is checks and reveals, HiLo's
 *                 is calls, and a shared table that called them all "help"
 *                 would be a table that says nothing true in three games.
 *
 * WHAT IT WILL NOT DO. Nothing competitive is fetched or drawn before the
 * board has been played: no score, no standings, no fastest time. A target
 * turns solving into arithmetic, and standings give the target away just as
 * plainly. The invitation carries who sent it and how many have taken it, and
 * that is all.
 */
(function (global) {
  "use strict";

  var CFG = null;
  var current = null;          // the challenge being played, if any

  /* ---- the person, not the game ------------------------------------------
     An entrant key is one entry each in a table, and it identifies a PERSON on
     a device rather than a game — so it lives under the family prefix like
     xi.theme and xi.season do. The crossword wrote it under fcw.entrant when
     it was the only game with challenges; that key is adopted rather than
     replaced, because a new one would silently give somebody a second entry in
     a table they are already in. */
  var KEY = "xi.entrant";
  var LEGACY = "fcw.entrant";
  function entrantKey() {
    var k = null;
    try { k = localStorage.getItem(KEY) || localStorage.getItem(LEGACY); } catch (e) {}
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(k || "")) {
      k = "d" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    try { localStorage.setItem(KEY, k); } catch (e) {}
    return k;
  }

  function accountName() {
    try {
      var u = global.XIChrome && global.XIChrome.account && global.XIChrome.account.user();
      return (u && (u.displayName || u.name)) || null;
    } catch (e) { return null; }
  }

  /* ---- talking to the server --------------------------------------------- */
  function get(path) {
    return fetch(path, { headers: { accept: "application/json" }, credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); });
  }
  function post(path, body) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-XI-Games": "1" },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().then(function (j) { return r.ok ? j : Promise.reject(j || new Error("HTTP " + r.status)); });
    });
  }

  /* ---- the panel ----------------------------------------------------------
     Built here rather than written into five pages: the markup is the same
     everywhere and a page that had to carry it is a page that can carry it
     wrongly. It uses the shared .xic-panel component, so it looks like the
     archive sheet the games already open. */
  var panel = null;
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function ensurePanel() {
    if (panel) return panel;
    panel = el("div", "xic-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.appendChild(el("div", "xic-panel-card xic-ch-card"));
    panel.addEventListener("click", function (ev) { if (ev.target === panel) close(); });
    document.body.appendChild(panel);
    return panel;
  }
  function card() { return ensurePanel().firstChild; }
  function open() { ensurePanel().classList.add("show"); }
  function close() { if (panel) panel.classList.remove("show"); }

  /* What a game is called out loud. The server answers with the id; a panel
     that said "hilo" would be the only place on this site that does. */
  var NAMES = {
    crossword: "Crossword XI", wordsearch: "Wordsearch XI", scrambled: "Scrambled XI",
    hilo: "HiLo XI", vowels: "Vowels XI", grid: "Grid XI", quickfire: "QuickFire XI",
  };
  function gameName(id) { return NAMES[id] || String(id || ""); }

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };

  /* ---- the invitation -----------------------------------------------------
     A name is taken BEFORE the board opens. That was the owner's decision and
     it was made against advice: a name typed first is a commitment, people
     finish what they have put something into, and it makes "six have taken
     this" a real number rather than an estimate.

     The box is blank unless the player is signed in. It used to be filled from
     the last name typed on this device, which — when the challenge was made on
     that same device — offered the sender's own name back to the person
     answering. An empty box asks a question; a wrong one answers it for you. */
  function invitation(info) {
    var signed = accountName();
    card().innerHTML =
      '<h2 class="xic-ch-who">' + esc(info.who) + "</h2>" +
      '<p class="xic-panel-sub xic-ch-board">' + esc(info.board) + "</p>" +
      '<p class="xic-ch-count">' + esc(info.count) + "</p>" +
      '<label class="xic-field"><span>Your name</span>' +
      '<input id="xicChName" maxlength="24" autocomplete="nickname"' +
      (signed ? ' value="' + esc(signed) + '" disabled' : "") + "></label>" +
      '<p class="xic-ch-msg" role="status"></p>' +
      '<button type="button" class="xic-btn xic-ch-play">Play this board</button>' +
      '<button type="button" class="xic-btn outline xic-panel-close">Not now</button>' +
      '<div class="xic-ch-standings" hidden></div>';
    card().querySelector(".xic-panel-close").addEventListener("click", function () {
      close();
      leave();
    });
    return card().querySelector(".xic-ch-play");
  }

  /* The challenge leaves the address as well as the screen. Otherwise the only
     way back from a challenge that will not load is editing the URL by hand. */
  function leave() {
    current = null;
    try {
      var u = new URL(location.href);
      u.searchParams.delete("c");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (e) {}
  }

  /* ---- the standings ------------------------------------------------------
     Score and time in every game; the third column is the game's own, because
     help means something different in each and one heading for all three would
     be true in none. */
  function mmss(secs) {
    var s = Math.max(0, Number(secs) || 0);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function standings(box, table) {
    /* A GAME MAY HAVE NO THIRD COLUMN, and HiLo does not: score and time are
       the whole of what a call round produces, and there is no "help" in it to
       count. A column of blanks under a heading is worse than no column —
       it reads as data that failed to load. So a game that names one gets it
       and a game that does not gets a two-column table. */
    var third = (CFG && CFG.column) || null;
    var rows = (table.entries || []).map(function (e) {
      /* WHICH ROW IS YOURS COMES FROM THE SERVER, as a flag. The client knows
         its own entrant key and could match on it — but then the key of every
         other entrant would have to travel to do the comparison, which hands
         the identity of everyone in the table to anyone who opens it. */
      return '<tr' + (e.mine ? ' class="me"' : "") + "><td>" + e.position + "</td><td>" +
        esc(e.name) + "</td><td>" + e.score + "</td><td>" + mmss(e.elapsedSeconds) +
        "</td>" + (third ? "<td>" + esc(third.of(e)) + "</td>" : "") + "</tr>";
    }).join("");
    box.innerHTML =
      "<h3>" + esc(table.groupName || "The standings") + "</h3>" +
      '<table class="xic-ch-table"><tr><th></th><th>Name</th><th>Score</th><th>Time</th>' +
      (third ? "<th>" + esc(third.label) + "</th>" : "") + "</tr>" + rows + "</table>" +
      '<p class="xic-panel-note">' +
      (table.started ? table.started + " have taken this board." : "") + "</p>";
  }

  /* ---- what a game calls -------------------------------------------------- */
  var API = {
    /* Told once, at boot, what this game is and how to open one of its boards. */
    configure: function (cfg) { CFG = cfg || null; return API; },

    /* The challenge in the address, if there is one. */
    pending: function () {
      try { return new URL(location.href).searchParams.get("c") || null; } catch (e) { return null; }
    },

    /* Called on boot. Resolves false when there is nothing to do, so a game
       can carry on opening whatever it was going to open. Resolves true when
       it has taken over — the invitation is up and the board will be opened
       from here, once a name has been given. */
    arrive: function () {
      var id = API.pending();
      if (!id || !CFG) return Promise.resolve(false);
      return get("/api/challenge?id=" + encodeURIComponent(id))
        .then(function (c) {
          /* A CHALLENGE BELONGS TO A GAME, and this might not be it. The same
             address shape serves every game now, so a HiLo challenge pasted
             into the crossword's page would otherwise show an invitation to a
             board this page cannot open.
             SAID, NOT DONE: it offers the link rather than throwing the player
             across the site. An automatic redirect is a surprise, it loses the
             back button, and a page that moves on its own is a page nobody can
             screenshot to ask what happened. The game carries on opening its
             own board behind the panel, so there is something to play either
             way — this returns false, meaning "not taken over". */
          if (c.game && c.game !== CFG.game) {
            var href = "/football/" + c.game + "/?c=" + encodeURIComponent(id);
            card().innerHTML =
              '<h2 class="xic-ch-who">' + esc(c.creatorName) + " challenged you</h2>" +
              '<p class="xic-panel-sub">That one is a ' + esc(gameName(c.game)) + " board.</p>" +
              '<a class="xic-btn xic-ch-elsewhere" href="' + esc(href) + '">Open it in ' +
              esc(gameName(c.game)) + "</a>" +
              '<button type="button" class="xic-btn outline xic-panel-close">Stay here</button>';
            card().querySelector(".xic-panel-close").addEventListener("click", function () {
              close();
              leave();
            });
            open();
            return false;
          }
          current = { id: c.id, token: c.token, game: c.game || CFG.game };
          var play = invitation({
            who: c.groupName ? c.creatorName + " challenged " + c.groupName
                             : c.creatorName + " challenged you",
            board: (CFG.boardLabel && CFG.boardLabel(c)) || "A board from the archive",
            count: c.started
              ? c.started + (c.started === 1 ? " person has" : " people have") +
                " taken this. " + c.finished + " reached Full Time."
              : "Nobody has played this yet.",
          });
          open();

          /* ALREADY PLAYED IT? Then the standings belong here, because the rule
             is nothing competitive before you have played — and this is after. */
          post("/api/challenge/table", { id: id, entrantKey: entrantKey() })
            .then(function (t) {
              if (!t || !t.played) return;
              var box = card().querySelector(".xic-ch-standings");
              standings(box, t);
              box.hidden = false;
              play.textContent = "Play it again";
            })
            .catch(function () {});

          play.addEventListener("click", function () {
            var input = card().querySelector("#xicChName");
            var name = accountName() || (input && input.value || "").trim();
            if (!accountName() && name.length < 2) {
              card().querySelector(".xic-ch-msg").textContent =
                "Choose a name of at least two characters.";
              if (input) input.focus();
              return;
            }
            play.disabled = true;
            post("/api/challenge/start", { id: id, name: name, entrantKey: entrantKey() })
              .catch(function () {})       // a start that fails must not cost the board
              .then(function () {
                close();
                if (CFG.openByToken) CFG.openByToken(c.token);
              });
          });
          return true;
        })
        .catch(function (err) {
          /* The link was fine every time this went wrong in the crossword: one
             catch around both the request and the render named the wrong cause
             for an hour. Report what actually failed, drop the challenge, and
             let the game open normally. */
          if (global.console && console.error) console.error("Challenge could not be opened:", err);
          leave();
          return false;
        });
    },

    /* Full Time. `playId` is the play the server has just verified.
       Two jobs, and which one depends on how the player got here: somebody who
       followed a challenge joins its table; somebody who played on their own is
       offered the chance to send it. */
    finished: function (playId, mount) {
      if (!CFG || !playId) return Promise.resolve(null);
      if (current) {
        return post("/api/challenge/entry",
                    { id: current.id, playId: playId, name: accountName() || undefined,
                      entrantKey: entrantKey() })
          .catch(function () { return null; })      // the table is worth showing regardless
          .then(function () { return API.showTable(current.id); });
      }
      if (mount) API.offer(playId, mount);
      return Promise.resolve(null);
    },

    /* The button that makes one. Drawn into whatever the game hands over, so a
       game decides where it sits on its own Full Time card and nothing here
       has an opinion about that game's layout. */
    offer: function (playId, mount) {
      if (!CFG || !mount) return;
      mount.innerHTML = "";
      var btn = el("button", "xic-btn outline xic-ch-make", "Challenge a friend");
      btn.type = "button";
      mount.appendChild(btn);
      btn.addEventListener("click", function () {
        btn.disabled = true;
        post("/api/challenge", { playId: playId, name: accountName() || undefined,
                                 entrantKey: entrantKey() })
          .then(function (c) {
            var url = location.origin + "/football/" + CFG.game + "/?c=" + encodeURIComponent(c.id);
            mount.innerHTML = '<p class="xic-ch-link">' + esc(url) + "</p>";
            var copy = el("button", "xic-btn xic-ch-copy", "Copy the link");
            copy.type = "button";
            mount.appendChild(copy);
            copy.addEventListener("click", function () {
              try {
                navigator.clipboard.writeText(url);
                copy.textContent = "Copied";
              } catch (e) { copy.textContent = "Copy it by hand"; }
            });
          })
          .catch(function (e) {
            btn.disabled = false;
            mount.appendChild(el("p", "xic-ch-msg",
              esc((e && e.error) || "That could not be sent just now.")));
          });
      });
    },

    /* The standings, after playing. */
    showTable: function (id) {
      return post("/api/challenge/table", { id: id, entrantKey: entrantKey() })
        .then(function (t) {
          if (!t) return null;
          card().innerHTML = '<div class="xic-ch-standings"></div>' +
            '<button type="button" class="xic-btn outline xic-panel-close">Close</button>';
          standings(card().querySelector(".xic-ch-standings"), t);
          card().querySelector(".xic-panel-close").addEventListener("click", close);
          open();
          return t;
        })
        .catch(function () { return null; });
    },

    /* For the suites, and for a game that wants to know. */
    _entrantKey: entrantKey,
    _current: function () { return current; },
  };

  global.XIChallenge = API;
})(window);
