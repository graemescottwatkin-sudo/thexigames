/* xi-menu.js — the parts of a game's pre-game menu that every game shares.
 *
 * WHAT IT FILLS: the two streaks, and the season line at the foot. Both are
 * facts about the PLAYER rather than about the game, which is why they are
 * here and not in six copies inside six game scripts — the fifth copy is the
 * one somebody forgets, and this family has already had that happen twice.
 *
 * THE DAY IS THE SERVER'S. Every number below is counted against /api/season's
 * `today`, never against the device's clock. A phone an hour behind UTC would
 * otherwise decide a run had been broken at eleven in the evening, which is
 * the fault the hub had until 8 September 2026.
 *
 * NOTHING NEW IS STORED. A streak is derived on read from the completions the
 * season already records — localStorage for a player with no account, the
 * server's season_play for one with. That is deliberate: a stored counter is a
 * second place for "how long is my run" to live, and the two would disagree
 * the first time a day was recounted.
 *
 * IT DEGRADES TO NOTHING. No answer, no season, no XISeason: the strip stays
 * hidden and the menu is the menu it was. A streak is an ornament on a page
 * whose job is to start a game.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var game = String(root.getAttribute("data-game") || "").toLowerCase();

  function el(id) { return document.getElementById(id); }
  function words(n) {
    /* "1 day", "4 days", and a run of nothing said as an invitation rather
       than as a zero: nobody needs telling their streak is 0. */
    return n === 1 ? "1 day" : n + " days";
  }

  /* A THEME WITH NO SEASON (Friends) counts its streaks from what its games
     bank (XIPlayed.themeStreaks), and has no W/L form: the owner, 28 Sep 2026,
     "W and L is for football, Friends should be about streaks only". */
  var theme = window.XIChrome && window.XIChrome.theme ? window.XIChrome.theme() : "football";
  var seasonless = theme !== "football";
  function paintStreaks(dayGames, today) {
    var box = el("homeStreaks");
    if (!box || !today) return;
    var st;
    if (seasonless) {
      if (!window.XIPlayed || !window.XIPlayed.themeStreaks) return;
      var me = window.XIPlayed.idOf(location.pathname);
      st = window.XIPlayed.themeStreaks(theme, me, today);
      var form = box.querySelector(".home-form");
      if (form) form.hidden = true;
    } else {
      if (!window.XISeason) return;
      st = window.XISeason.streaks(dayGames, game, today);
    }

    var pairs = [
      ["streakGame", "streakGameN", st.game],
      ["streakDaily", "streakDailyN", st.daily],
    ];
    var shown = false;
    pairs.forEach(function (p) {
      var wrap = el(p[0]), out = el(p[1]);
      if (!out) return;
      out.textContent = p[2] > 0 ? words(p[2]) : "Not started";
      if (wrap) wrap.className = "streak" + (p[2] > 0 ? "" : " none");
      shown = true;
    });
    if (shown) box.hidden = false;
  }

  function paintSeason(d) {
    var box = el("homeSeason2");
    if (!box) return;
    var line = el("hsLine"), note = el("hsNote");
    var s = d && d.season;
    if (line) {
      /* The same words the hub uses, for the same reason: a season with
         nothing settled says so rather than reciting four zeroes. */
      line.textContent = !s || !s.played
        ? "First result pending"
        : s.played + " played · " + s.won + " won · " + s.drawn + " drawn · " +
          s.lost + " lost · " + s.points + " pts";
    }
    if (note) {
      note.textContent = d && d.inFlight
        ? "Today is still open — it counts when the next puzzles arrive."
        : "Two games finished in a day is a win; one is a draw.";
    }
    box.hidden = false;
  }

  /* ---- the button names what it does ------------------------------------
   *
   * "Kick off" was on the hero whatever the state: on a part-played board,
   * where it returns you to a running clock, and on a finished one, where it
   * opens the result. The state line beside it was already telling the truth;
   * the button was not, and the button is the thing people read.
   *
   * READ FROM THE STATE THE GAME ALREADY PUBLISHED, and only where that state
   * is unambiguous. The crossword writes "In progress" and "Played · 90/114";
   * HiLo writes "Played · 41 pts · Win". Those two words are the vocabulary
   * this understands, and anything else is left alone.
   *
   * SCRAMBLED AND VOWELS ARE NOT WIRED HERE, deliberately. Their hc-state is a
   * description of the clock — "Ninety minutes in five of real time" — not a
   * statement of progress, so there is nothing here to read. Guessing from it
   * would put "Resume" on a board nobody has opened. They need the change in
   * their own script, where whether a save exists is known; until then their
   * button says Kick off, which is right for a new board and silent about the
   * other two rather than wrong about them. */
  function nameTheAction() {
    var hero = el("homeDaily");
    if (!hero) return;
    var cta = hero.querySelector(".hc-cta");
    var state = hero.querySelector(".hc-state");
    if (!cta || !state) return;
    var said = String(state.textContent || "");
    if (/^\s*Played/i.test(said)) cta.textContent = "View result";
    else if (/in progress/i.test(said)) cta.textContent = "Resume";
  }
  /* The game fills its own state after its own fetch, so this runs once the
     page has settled rather than racing it. */
  if (document.readyState === "complete") setTimeout(nameTheAction, 300);
  else window.addEventListener("load", function () { setTimeout(nameTheAction, 300); });

  function askSeason() {
    try {
      fetch("/api/season", { headers: { accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          /* No day from the server means no answer, and there is no second place
             to get one: the device's calendar is exactly what must not decide
             this. Nothing is drawn, which is correct. */
          if (!d || !d.today) return;
          if (seasonless) { paintStreaks(null, d.today); return; }
          var dayGames = (d.account && d.dayGames) ? d.dayGames
            : (window.XISeason ? window.XISeason.finishedDays() : []);
          paintStreaks(dayGames, d.today);
          paintSeason(d);
        })
        .catch(function () { /* a menu that cannot count still starts a game */ });
    } catch (e) { /* likewise */ }
  }
  askSeason();
  /* The device's guest season has just joined the account (xi-chrome.js), so
     the account's answer has changed: ask again rather than show a streak the
     account no longer agrees with. */
  document.addEventListener("xi:season", askSeason);

  /* OTHER BOARDS, ONE CARD. The owner, 27 Sep 2026: the game page is Daily,
     Other boards, Streaks. The card opens the boards behind it (#otherBoards)
     in place of the daily and the streaks, and Back returns; the boards keep
     every handler their game gave them, because they are the same buttons,
     moved. Said once here for every game that has the card. */
  var other = el("homeOther"), boards = el("otherBoards"), back = el("otherBack");
  function showOther(open) {
    if (!other || !boards) return;
    boards.hidden = !open;
    document.body.classList.toggle("other-open", !!open);
    other.setAttribute("aria-expanded", open ? "true" : "false");
    var focus = open ? back : other;
    if (focus && focus.focus) focus.focus();
  }
  if (other && boards) {
    other.addEventListener("click", function () { showOther(true); });
    if (back) back.addEventListener("click", function () { showOther(false); });
  }

  /* MORE GAMES, A QUICK SELECT under the streaks. The owner, 27 Sep 2026:
     "make this a singular column ... Daily, Other boards, Streaks. Then a
     little break and maybe show all the other games as a quick select".
     READ OFF THE TEAM SHEET (XIChrome.squad, this theme's), never a list of
     its own: a slot with a name and an href is a launched, listed game, and
     an unlisted or unbuilt one has neither, so it cannot appear here. The game
     this page is for is left out. Only on the landing that has the Other
     boards card, which is the landing this layout belongs to. */
  function drawMoreGames() {
    var grid = document.querySelector(".site-grid");
    var squad = window.XIChrome && window.XIChrome.squad;
    if (!other || !grid || !squad || document.getElementById("moreGames")) return;
    var here = location.pathname;
    var games = squad.filter(function (g) {
      return g && g.name && g.href && here.indexOf(g.href) !== 0;
    });
    if (!games.length) return;
    var sec = document.createElement("section");
    sec.className = "more-games";
    sec.id = "moreGames";
    sec.setAttribute("aria-labelledby", "moreGamesHead");
    var h = document.createElement("h2");
    h.className = "mg-head";
    h.id = "moreGamesHead";
    h.textContent = "More games";
    sec.appendChild(h);
    var ul = document.createElement("ul");
    ul.className = "mg-list";
    games.forEach(function (g) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.className = "mg-chip";
      a.href = g.href;
      /* A SCALED VISUAL OF THE GAME (the owner, 27 Sep 2026: "I'd like them to
         also include a scaled visual of the game on some part"): the hub's own
         card art, /assets/games/<game>.jpg, the same file at the same ?v= the
         hub's cards load, so the two cannot show different pictures. Football
         only: those files are football's, and a Friends game has no art and
         must not borrow show imagery. A picture that fails to load is
         removed, leaving the chip as the number and the name. */
      var seg = g.href.split("/").filter(Boolean);
      if (seg[0] === "football" && seg[1]) {
        var art = document.createElement("span");
        art.className = "mg-art";
        art.setAttribute("aria-hidden", "true");
        var img = document.createElement("img");
        img.alt = ""; img.loading = "lazy"; img.decoding = "async";
        img.width = 1200; img.height = 720;
        img.src = "/assets/games/" + seg[1] + ".jpg?v=a1";
        img.onerror = function () { if (art.parentNode) art.parentNode.removeChild(art); };
        art.appendChild(img);
        a.appendChild(art);
        a.classList.add("has-art");
      }
      var n = document.createElement("span");
      n.className = "mg-n";
      n.setAttribute("aria-hidden", "true");
      n.textContent = String(g.n);
      var name = document.createElement("span");
      name.className = "mg-name";
      name.textContent = g.name;
      a.appendChild(n); a.appendChild(name);
      li.appendChild(a); ul.appendChild(li);
    });
    sec.appendChild(ul);
    grid.parentNode.insertBefore(sec, grid.nextSibling);
  }
  drawMoreGames();
})();
