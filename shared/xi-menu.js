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

  function paintStreaks(dayGames, today) {
    var box = el("homeStreaks");
    if (!box || !window.XISeason || !today) return;
    var st = window.XISeason.streaks(dayGames, game, today);

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
        ? "Today is still open — it counts at midnight."
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

  try {
    fetch("/api/season", { headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        /* No day from the server means no answer, and there is no second place
           to get one: the device's calendar is exactly what must not decide
           this. Nothing is drawn, which is correct. */
        if (!d || !d.today) return;
        var dayGames = (d.account && d.dayGames) ? d.dayGames
          : (window.XISeason ? window.XISeason.finishedDays() : []);
        paintStreaks(dayGames, d.today);
        paintSeason(d);
      })
      .catch(function () { /* a menu that cannot count still starts a game */ });
  } catch (e) { /* likewise */ }
})();
