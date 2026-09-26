/* xi-played.js — what has been played today, and what to offer next.
 *
 * WHY THIS IS SHARED. The hub has known the answer since it was written: a
 * table of ten games, each with the localStorage key its results live under,
 * the endpoint that says what today's board is, and a done(row, today) probe.
 * It combines DEVICE storage OR the account, which is the only correct answer —
 * a signed-out player has only the device, and a signed-in one may have played
 * on another.
 *
 * It lived in index.html alone. The full-time panel needs exactly the same
 * fact to suggest a game you have not started, and a second copy of "what
 * counts as played" is the fault this project traces every major bug to. So it
 * moves here and the hub reads it.
 *
 * WHAT IS HERE AND WHAT IS NOT. The PROBE is here: key, api, today, done. The
 * NAME and the HREF are not — those are the squad's, in xi-chrome.js, which is
 * already the one statement of what a game is called and where it lives. This
 * joins to the squad by id at call time rather than repeating either. A third
 * copy of "Crossword XI" is how the footer and the drawer drifted apart before.
 *
 * ORDER IS THE SHIRT NUMBER, because the squad's is, and "the next game" should
 * mean something a player could predict rather than whatever the object
 * happened to enumerate.
 */
(function () {
  "use strict";

  /* THE PROBE, one row per game. `today` reads that game's daily payload for
     whatever it calls today's board — a number for the ring games, a day key
     for the scheduled ones — and `done` decides whether a stored result is
     that board. The two cypher games share a daily NUMBER and never a board,
     so each reads its OWN key: a player who has done one has not done the
     other. */
  /* A CROSSWORD RESULT DATED BEFORE ITS OWN BOARD RAN IS ANOTHER NUMBERING'S:
     every game restarted at board 1 on 18 September 2026, and a #9 finished on
     3 September is not the #9 that ran on the 26th. Read as that board, it
     told the owner they had already played a puzzle they had never seen (26
     Sep 2026). The server's statement of this rule is beforeItsBoard in
     functions/_lib/games.js, which refuses such a row onto an account; this is
     the browser's, for the rows already on a device, and played_test runs the
     two over the same rows. `day` is the board's own day key. A day of slack
     for the same reason as there: older rows carry the device's date. */
  function beforeItsBoard(r, day) {
    var d = String((r && r.date) || "");
    if (!/^\d{4}-\d{2}-\d{2}/.test(d) || !/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return false;
    return Date.parse(d.slice(0, 10) + "T00:00:00Z") < Date.parse(day + "T00:00:00Z") - 86400000;
  }

  var PROBE = [
    { id: "crossword",  key: "fcw.results.v1", api: "/api/daily",
      today: function (d) { return d.dailyNo; },
      done: function (r, t, d) {
        return r.dailyNo === t && r.complete !== false && !beforeItsBoard(r, d && d.day);
      } },
    { id: "wordsearch", key: "xiws.results", api: "/api/wordsearch/daily",
      today: function (d) { return d.day; },
      done: function (r, t) { return r.day === t; } },
    { id: "scrambled",  key: "xisc.results", api: "/api/scrambled/daily",
      today: function (d) { return d.today; },
      done: function (r, t) { return r.no === t; } },
    { id: "hilo",       key: "xihl.results", api: "/api/hilo/daily",
      today: function (d) { return d.day; },
      done: function (r, t) { return r.day === t; } },
    { id: "vowels",     key: "xivw.results", api: "/api/scrambled/daily?cy=1",
      today: function (d) { return d.today; },
      done: function (r, t) { return r.no === t; } },
    { id: "grid",       key: "xigd.results", api: "/api/grid/daily",
      today: function (d) { return d.no; },
      done: function (r, t) { return r.no === t; } },
    { id: "codeword",   key: "xicw.results", api: "/api/codeword/daily",
      today: function (d) { return d.no; },
      done: function (r, t) { return r.no === t; } },
    { id: "quickfire",  key: "qfx.results.v1", api: "/api/quickfire/daily",
      today: function (d) { return d.day; },
      done: function (r, t) { return r.day === t; } },
    { id: "whoami",     key: "xiwa.results.v1", api: "/api/whoami/daily",
      today: function (d) { return d.day; },
      done: function (r, t) { return r.day === t; } },
    { id: "ballpark",   key: "xibp.results", api: "/api/ballpark/daily",
      today: function (d) { return d.day; },
      done: function (r, t) { return r.day === t; } },
    /* THE SECOND THEME. Keyed on the board NUMBER, which for this game is the
       family's daily number — the same quantity football's crossword uses, and
       the reason functions/_lib/games.js keys it "fr:<no>". Its own prefix, so a
       player who has done one crossword has not done the other. */
    { id: "crossword_fr", key: "xifc.results", api: "/api/crossword_fr/daily",
      today: function (d) { return d.no; },
      done: function (r, t) { return r.no === t; } },
    /* Who Am I: Friends. Keyed on the DAY, like football's and for the same
       reason: a board is several doors and a person plays one of them, so the
       day is what makes a result unique. Its own prefix, so a player who has
       done one Who Am I has not done the other -- the two run on the same days,
       which is exactly when a shared prefix would file both under one key. */
    { id: "whoami_fr", key: "xifw.results.v1", api: "/api/whoami_fr/daily",
      today: function (d) { return d.day; },
      done: function (r, t) { return r.day === t; } },
  ];

  var byId = {};
  PROBE.forEach(function (p) { byId[p.id] = p; });

  /* A game's stored results, or an empty list. A store that cannot be read
     decides nothing — it must not read as "played", which would hide a game
     from the player, nor throw, which would take the panel down with it. */
  function listOf(key) {
    try {
      var raw = localStorage.getItem(key);
      var v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  /* HAS THIS GAME BEEN PLAYED TODAY? Device first, because it needs no network
     and answers for a signed-out player, then the account, because a player may
     have played on another device. Either is enough; neither being true is the
     only "no".
     UNKNOWN IS NOT NO. If the daily endpoint cannot be reached there is no
     today to compare against, so this answers null and the caller decides —
     offering a game that has been played is a smaller fault than hiding every
     game because one endpoint was down. */
  function doneToday(id) {
    var p = byId[id];
    if (!p) return Promise.resolve(null);
    return fetch(p.api, { headers: { accept: "application/json", "X-XI-Games": "1" } })
      .then(function (r) { return r.json(); })
      .then(function (payload) {
        var t = payload && p.today(payload);
        if (t === undefined || t === null) return null;
        if (listOf(p.key).some(function (r) { return r && p.done(r, t, payload); })) return true;
        var acct = window.XIChrome && XIChrome.playedTodaySync
          ? XIChrome.playedTodaySync() : null;
        return !!(acct && acct.games.indexOf(id) !== -1);
      })
      .catch(function () { return null; });
  }

  /* WHAT TO OFFER NEXT: the first game of the reader's own theme that has not
     been played today and is not the game asking. Shirt order, so it is
     predictable.
     A game whose state is UNKNOWN is a candidate — see doneToday. Offering
     something already played is a smaller fault than offering nothing, which
     is what a player sees if one endpoint is slow.
     Resolves null when there is genuinely nothing left, and the caller must
     then say so rather than linking nowhere. */
  function suggestNext(exceptId) {
    var squad = (window.XIChrome && XIChrome.squad) || [];
    var slots = squad.filter(function (g) {
      return g.href && g.name && byId[idOf(g.href)] && idOf(g.href) !== exceptId;
    });
    if (!slots.length) return Promise.resolve(null);

    return Promise.all(slots.map(function (g) { return doneToday(idOf(g.href)); }))
      .then(function (states) {
        for (var i = 0; i < slots.length; i++) {
          if (states[i] !== true) return slots[i];
        }
        return null;
      });
  }

  /* THE GAME ID FROM ITS HREF, because the squad states the address and this
     states the id, and joining them by hand in three places is how they drift.
     /football/crossword/ -> crossword. */
  function idOf(href) {
    var parts = String(href || "").split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }

  /* THE PROBE JOINED TO THE SQUAD, which is the shape every caller actually
     wants: the id, key and endpoint from here, the shirt number, name and href
     from xi-chrome.js. The join is done ONCE, here, because doing it at each
     call site is how two callers end up disagreeing about what a game is
     called — which is exactly what this module was extracted to stop.

     THEME-SCOPED BY DEFAULT, since the squad is. Pass a theme to ask about
     another one; the hub asks for football explicitly because it is the
     football hub's shirts it is lighting, not the shirts of whatever theme a
     reader happened to arrive from. */
  function list(theme) {
    var squads = (window.XIChrome && XIChrome.squads) || {};
    var squad = theme ? (squads[theme] || []) : ((window.XIChrome && XIChrome.squad) || []);
    var out = [];
    squad.forEach(function (g) {
      if (!g.href) return;
      var p = byId[idOf(g.href)];
      if (!p) return;                    // a slot with no probe is not playable yet
      out.push({ id: p.id, n: g.n, name: g.name || null, href: g.href,
                 key: p.key, api: p.api, today: p.today, done: p.done });
    });
    return out;
  }

  window.XIPlayed = {
    PROBE: PROBE, list: list, listOf: listOf, doneToday: doneToday,
    suggestNext: suggestNext, idOf: idOf, beforeItsBoard: beforeItsBoard,
  };
})();
