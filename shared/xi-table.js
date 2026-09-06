/* xi-table.js — the live league table, for every football game.
 *
 * WHAT IT IS. You pick a club; the board's running score IS that club's points
 * in a real historical season, and you move up and down a real table while you
 * play. Finish on 82 and you won the league in 1995/96. Finish on 34 and you
 * went down. The crossword has had this since the beginning and it is the best
 * thing in the game; the other four football titles had nothing.
 *
 * WHAT IT IS NOT. It is not the season. There is exactly one season and it
 * belongs to the hub — one result a day across the whole family, counted from
 * finishes rather than points (shared/xi-season.js). This is the per-BOARD
 * view, and the two must not be confused: a fake 38-game record derived from
 * one board's score is precisely what came out of the crossword on 5 Sep.
 *
 * IT IS FOOTBALL'S, NOT THE FAMILY'S. 114 = 38 matches at 3 points a win, and
 * a Friends crossword cannot have a position in the Premier League table. When
 * another theme lands it gets no table, and that is correct rather than a gap —
 * the half that spans themes is the season, which knows nothing about scoring.
 *
 *   XITable.mount(el, { score, max })   draw it, and return a handle
 *   handle.update(score)                the score moved; redraw
 *   handle.club()                       who the player picked
 *
 * THE CLUB IS FAMILY-WIDE, under `xi.club`. Somebody who supports Everton in
 * the crossword supports Everton in the word search, and asking again in every
 * game would be asking a settled question four more times.
 */
(function (root) {
  "use strict";

  var CLUB_KEY = "xi.club";
  /* The crossword's own key, read once if the family one is empty. A player
     who chose a club before this existed keeps it rather than being asked
     again on a game they have played for months. */
  var LEGACY_CLUB_KEY = "fcw.club";

  function seasons() {
    var s = root.XI_SEASONS || root.FCW_SEASONS;
    return Array.isArray(s) ? s : [];
  }

  /* Seasons in which a club actually played. */
  function seasonsForClub(club) {
    return seasons().filter(function (s) {
      return s.table && s.table.some(function (r) { return r.club === club; });
    });
  }

  /* A small deterministic hash, so a board number or a day string picks the
     same season for everybody. Not a random: two players on the same board
     must see the same ladder, or comparing scores means nothing. */
  function seedOf(v) {
    var s = String(v == null ? "" : v), h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  /* The season a board is played in. Prefers seasons the club actually played,
     falls back to all of them for a club that never made the top flight.
     No difficulty bias here: that is the crossword's own idea and stays in the
     crossword's engine, where the difficulty lives. */
  function pickSeason(club, seed) {
    var pool = seasonsForClub(club);
    if (!pool.length) pool = seasons();
    if (!pool.length) return null;
    return pool[seedOf(seed) % pool.length];
  }

  /* THE TABLE. The player's club carries the player's score; every other club
     keeps its real historical points. If the club did not play that season the
     player takes the bottom club's place, so the ladder is always twenty.
     Lifted out of the crossword's engine unchanged — it was already the one
     implementation, it just lived where only one game could reach it. */
  function buildTable(club, liveScore, season) {
    if (!season) return [];
    var rows = [], replaced = false;
    season.table.forEach(function (r) {
      if (r.club === club && !replaced) { replaced = true; return; }   // player takes their own slot
      rows.push({ club: r.club, points: r.points, isPlayer: false });
    });
    if (!replaced) rows.pop();                    // club absent that season: displace the bottom club
    rows.push({ club: club, points: liveScore, isPlayer: true });
    rows.sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      return (b.isPlayer ? 1 : 0) - (a.isPlayer ? 1 : 0);              // player wins ties
    });
    rows.forEach(function (r, i) { r.pos = i + 1; });
    return rows;
  }

  /* ---- THE SEASON TABLE, before the season is over ---------------------
   *
   * A league table is a thing you have after 38 games. The hub wants to show
   * one from day one, and the honest way is not to divide.
   *
   * THE TEAMS ARE SCALED, NOT THE PLAYER. The player has whatever they have —
   * after one day that is 0, 1 or 3, because a day is a match and a match pays
   * three, one or none. So a historical side on 76 points over 38 is put on
   * what IT would have after the same number of days: 76 x 1/38 = 2.
   *
   * AND 2 IS NOT A SCORE ANYBODY CAN HAVE AFTER ONE GAME. That is the whole
   * point of this function. A table where the player is on 3 and the team above
   * them is on 2 is a table comparing a real number with an average, and the
   * player can see it is not a real number. So the pro-rated figure is snapped
   * to the nearest total that IS reachable in that many games — 3w + draws,
   * with w + draws no more than the days played — and 2 becomes 3.
   *
   * TIES GO UP, on the owner's ruling: 2 sits exactly between 1 and 3 and the
   * answer is 3. Which is also the kinder reading — a table that rounded the
   * opposition down would flatter the player, and a ladder you are climbing
   * has to be worth climbing.
   */
  function reachablePoints(days) {
    var d = Math.max(0, Math.floor(Number(days) || 0));
    var out = {}, w, dr;
    for (w = 0; w <= d; w++) {
      for (dr = 0; w + dr <= d; dr++) out[3 * w + dr] = true;
    }
    return Object.keys(out).map(Number).sort(function (a, b) { return a - b; });
  }

  function snapToReachable(target, days) {
    var opts = reachablePoints(days);
    if (!opts.length) return 0;
    var best = opts[0], bestDist = Math.abs(opts[0] - target);
    for (var i = 1; i < opts.length; i++) {
      var dist = Math.abs(opts[i] - target);
      /* Strictly nearer wins; equally near and HIGHER wins. */
      if (dist < bestDist - 1e-9 || (Math.abs(dist - bestDist) < 1e-9 && opts[i] > best)) {
        best = opts[i]; bestDist = dist;
      }
    }
    return best;
  }

  var SEASON_LENGTH = 38;

  /* HOW MANY NEIGHBOURS ARE WORTH SHOWING, which changes with the season.
   *
   * In the opening days the ladder is not yet a ladder: after one game every
   * club in the division is on 0, 1 or 3, so the two rows either side of the
   * player are two clubs on identical points and the comparison is empty. The
   * owner's ruling — show the player's own row for the first three days, and
   * the clubs around them after that, once the totals have spread out enough
   * to mean something.
   *
   * Three is where the spread starts: after three games a side can hold any of
   * 0 to 7 or 9, which is enough for a neighbour to be a different team from
   * you rather than the same score under another name. */
  var SPREAD_AFTER = 3;
  function neighboursFor(played) {
    return (Number(played) || 0) > SPREAD_AFTER ? 1 : 0;
  }

  /* The ladder as it stands on day `played`, with the player's real points and
     every other club's pro-rated and snapped. Same shape buildTable returns,
     so renderRows draws it unchanged. */
  function seasonTable(club, points, played, season) {
    if (!season) return [];
    var d = Math.max(0, Math.min(SEASON_LENGTH, Math.floor(Number(played) || 0)));
    var rows = [], replaced = false;
    season.table.forEach(function (r) {
      if (r.club === club && !replaced) { replaced = true; return; }
      rows.push({
        club: r.club,
        points: snapToReachable(r.points * d / SEASON_LENGTH, d),
        isPlayer: false,
      });
    });
    if (!replaced) rows.pop();
    rows.push({ club: club, points: Math.max(0, Number(points) || 0), isPlayer: true });
    rows.sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      return (b.isPlayer ? 1 : 0) - (a.isPlayer ? 1 : 0);
    });
    rows.forEach(function (r, i) { r.pos = i + 1; });
    return rows;
  }

  /* WHICH YEAR IT IS, WITHHELD UNTIL THE 38 ARE DONE. The owner's ruling: the
     season is revealed at the end, not at the start. Knowing you are playing
     1995/96 from day one turns a ladder into a quiz about a table somebody can
     look up; not knowing keeps it a ladder. Returned as null rather than as an
     empty string so a caller cannot print it by accident. */
  function seasonYear(season, played) {
    if (!season) return null;
    return (Number(played) || 0) >= SEASON_LENGTH ? season.season : null;
  }

  function playerPosition(table) {
    for (var i = 0; i < table.length; i++) if (table[i].isPlayer) return table[i].pos;
    return table.length;
  }

  /* ---- what the player picked ------------------------------------------ */

  function savedClub() {
    try {
      return localStorage.getItem(CLUB_KEY) ||
        /* Reading another game's prefix is allowed and writing it is not — the
           family rule. This reads the crossword's old key and, if it finds
           one, writes it to the FAMILY key, never back. */
        localStorage.getItem(LEGACY_CLUB_KEY) || "";
    } catch (e) { return ""; }
  }

  function saveClub(club) {
    try { localStorage.setItem(CLUB_KEY, String(club || "")); } catch (e) {}
  }

  function clubs() {
    if (Array.isArray(root.XI_CLUBS) && root.XI_CLUBS.length) return root.XI_CLUBS.slice();
    /* Derived from the tables when the club list is not loaded, so a game that
       has the seasons has everything it needs. */
    var seen = {};
    seasons().forEach(function (s) {
      (s.table || []).forEach(function (r) { seen[r.club] = true; });
    });
    return Object.keys(seen).sort();
  }

  /* ---- drawing ---------------------------------------------------------- */

  /* THE ROWS SHOWN. Twenty is a wall on a phone, so the player and their
     neighbours are what is drawn and the rest carry a class the CSS hides —
     rendered rather than dropped so the table is complete for a screen reader
     and for anybody who wants the lot. The crossword's own arrangement. */
  function renderRows(tbody, table, around) {
    if (!tbody) return;
    var pos = playerPosition(table);
    /* ZERO IS A REAL ANSWER, and it used to be floored away. The hub asks for
       the player's row ALONE in the opening days: with one game played every
       side in the division snaps to 0, 1 or 3, so "the teams either side of
       you" are two clubs on the same points as forty others and the row says
       nothing. Math.max(1, ...) made that impossible to ask for. Undefined
       still means one, which is what every existing caller passes. */
    var near = (around === 0 || around === "0") ? 0
      : Math.max(1, Number(around) || 1);
    var html = "";
    table.forEach(function (r) {
      var far = Math.abs(r.pos - pos) > near;
      html += '<tr class="' + (r.isPlayer ? "you" : "") + (far ? " faroff" : "") + '">' +
        '<td class="pos">' + r.pos + "</td>" +
        '<td class="club">' + escapeHtml(r.club) + "</td>" +
        '<td class="pts">' + r.points + "</td></tr>";
    });
    tbody.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---- the panel --------------------------------------------------------- */

  /* Build the whole thing into an element: a club picker, a table and a label
     naming the season. The game supplies a score and says when it changes;
     everything else is here, so adding the table to a game is a div and a call
     rather than a hundred lines of copied markup.
     opts.seed    what picks the season — a board number or a day, so everyone
                  on that board sees the same ladder
     opts.score   the score now
     opts.onClub  told when the player picks, for a game that wants to redraw */
  function mount(el, opts) {
    var o = opts || {};
    if (!el) return null;
    var score = Number(o.score) || 0;
    var club = savedClub();
    var list = clubs();
    if (!list.length) return null;                 // no seasons loaded: draw nothing
    if (!club || list.indexOf(club) === -1) club = "";

    /* IT SAYS WHAT IT IS BEFORE YOU PICK A CLUB. The first version was a bare
       dropdown reading "Your club — Pick a club…", forty-four pixels at the
       foot of a sidebar, and the owner played two games and reported no table
       at all. It was there; it just never announced itself, and nothing about
       it explained that choosing a club turns a score into a league position.
       The heading is always drawn and the invitation replaces the ladder while
       there is nothing to rank. */
    el.innerHTML =
      '<span class="tb-label xit-head">League table' +
      '<span class="season-tag xit-season"></span></span>' +
      '<div class="club-bar"><label>Your club ' +
      '<select class="xit-club" title="Choose your club (optional)"></select></label></div>' +
      '<p class="xit-invite">Pick your club and this board’s score becomes ' +
      'its points in a real season.</p>' +
      '<table class="league"><tbody class="xit-body"></tbody></table>';

    var select = el.querySelector(".xit-club");
    var tbody = el.querySelector(".xit-body");
    var label = el.querySelector(".xit-season");
    select.innerHTML = '<option value="">Pick a club…</option>' +
      list.map(function (c) {
        return '<option value="' + escapeHtml(c) + '"' + (c === club ? " selected" : "") +
          ">" + escapeHtml(c) + "</option>";
      }).join("");

    var season = null;

    function draw() {
      /* NO CLUB, NO TABLE. It is optional, and a ladder with a blank name in
         it says less than no ladder at all. */
      if (!club) {
        el.classList.add("xit-empty");
        tbody.innerHTML = "";
        label.textContent = "";
        return;
      }
      el.classList.remove("xit-empty");
      season = pickSeason(club, o.seed);
      var table = buildTable(club, score, season);
      renderRows(tbody, table, o.around);
      label.textContent = season ? season.season : "";
    }

    select.addEventListener("change", function () {
      club = select.value;
      saveClub(club);
      draw();
      if (typeof o.onClub === "function") { try { o.onClub(club); } catch (e) {} }
    });

    draw();

    return {
      update: function (next) { score = Number(next) || 0; draw(); },
      club: function () { return club; },
      season: function () { return season; },
      position: function () {
        return club ? playerPosition(buildTable(club, score, season)) : null;
      },
    };
  }

  var api = {
    CLUB_KEY: CLUB_KEY,
    seasons: seasons,
    seasonsForClub: seasonsForClub,
    pickSeason: pickSeason,
    buildTable: buildTable,
    /* The season ladder, and the two rules it is built on. Exported so the
       suite can drive them directly rather than inferring them from a table. */
    seasonTable: seasonTable, seasonYear: seasonYear,
    neighboursFor: neighboursFor, SPREAD_AFTER: SPREAD_AFTER,
    reachablePoints: reachablePoints, snapToReachable: snapToReachable,
    SEASON_LENGTH: SEASON_LENGTH,
    playerPosition: playerPosition,
    savedClub: savedClub,
    saveClub: saveClub,
    clubs: clubs,
    renderRows: renderRows,
    mount: mount,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.XITable = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
