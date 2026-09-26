/* xi-fulltime.js — the end of a game, the parts every game shares.
 *
 * WHAT IS SHARED AND WHAT IS NOT. Each game's full-time panel is its own: the
 * crossword shows a league position and a scoring breakdown, HiLo shows a
 * ladder, Ballpark shows a year. Those are the game, and replacing them with
 * one panel would throw away what each has learned. What IS the same in all of
 * them is the shape of the ending — you scored something, you can share it, and
 * there is another game today you have not played.
 *
 * That was the rule until 26 Sep 2026, when the owner looked at the ten
 * endings side by side and ruled for one: XIFullTime.panel() below draws the
 * whole of it, the same four blocks on every game, and a game hands over data
 * rather than markup. The worry above -- an option for every difference --
 * is answered by keeping the data small: a score, eleven boxes, one line.
 *
 *   XIFullTime.panel(el, data)                      -> the panel (see below)
 *   XIFullTime.nextUp(el, { game: "crossword" })   -> Promise<slot|null>
 *
 * WHY THE SUGGESTION IS WORTH ANYTHING. A daily game is finished in four
 * minutes and the player is then looking at a dead screen. The family has ten
 * of them and most players know about two. The suggestion is the only place
 * that fact can be delivered at the moment it is useful, which is the moment
 * the game they came for has just ended.
 */
(function () {
  "use strict";

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* THE NEXT GAME, OR NOTHING AT ALL. Resolves with the slot it offered so a
     caller can tell the difference between "nothing to suggest" and "not asked
     yet" — which matters, because those want different words on the screen.

     ASYNCHRONOUS BECAUSE THE ANSWER IS. Whether a game has been played today is
     a question about this device AND the account, and the account is a fetch.
     A synchronous version would have to answer from the device alone and would
     tell a player who finished on their phone that they had not. */
  function nextUp(target, opts) {
    var o = opts || {};
    /* Said out loud for anything that wants to know a game has just ended.
       xi-push.js offers reminders on it, inside the app. Nothing on the web
       listens. */
    try { document.dispatchEvent(new CustomEvent("xi:fulltime", { detail: { game: o.game || null } })); } catch (e) {}
    return fill(target, o);
  }

  /* THE SLOT FILLED WITHOUT SAYING THE GAME HAS ENDED. watch() fills the slot
     at load so that it has a height to be seen by; that fill went through
     nextUp() and so announced Full Time on every page load, and in the app
     the reminders offer came up before a ball was kicked -- where a quick
     "Not now" is remembered for good (found 25 Sep 2026, when the offer was
     missing after a real Full Time). Only a panel actually shown announces. */
  function fill(target, opts) {
    var o = opts || {};
    if (!target || !window.XIPlayed) return Promise.resolve(null);

    return XIPlayed.suggestNext(o.game).then(function (slot) {
      target.innerHTML = "";
      if (!slot) {
        /* EVERY GAME PLAYED IS AN ACHIEVEMENT, not an empty state. Saying
           nothing here would read as the feature having failed; the player has
           done the whole family today and should be told so. */
        /* THE COUNT IS THIS THEME'S LISTED SQUAD, not a number written here.
           It read "all ten" -- right for football on the day it was written, a
           measurement that goes stale the day an eleventh game launches, and
           wrong on every Friends page from the start: unlisted games are never
           suggested, so a Friends player finishing one game was congratulated
           on "all ten". */
        var squad = (window.XIChrome && window.XIChrome.squad) || [];
        var n = squad.filter(function (g) { return g && g.name; }).length;
        var WORDS = ["", "one", "two", "three", "four", "five", "six", "seven",
                     "eight", "nine", "ten", "eleven"];
        target.appendChild(el("p", "xift-none", n >= 2
          ? "That is all " + (WORDS[n] || n) + " today. Come back tomorrow."
          : "That is today done. Come back tomorrow."));
        return null;
      }

      var wrap = el("div", "xift-next");
      wrap.appendChild(el("p", "xift-kicker", "Not played today"));

      var a = el("a", "xift-go");
      a.href = slot.href;
      a.innerHTML = '<span class="xift-shirt">' + slot.n + "</span>" +
                    '<span class="xift-name">' + slot.name + "</span>";
      /* NAMED FOR A SCREEN READER, because the shirt number and the name read
         as two unrelated fragments otherwise. */
      a.setAttribute("aria-label", "Play " + slot.name + " today");
      wrap.appendChild(a);

      target.appendChild(wrap);
      return slot;
    }).catch(function () {
      /* A SUGGESTION THAT CANNOT BE MADE IS NOT AN ERROR THE PLAYER SHOULD SEE.
         They have just finished a game; a red box about a failed fetch is worse
         than no suggestion at all. The panel simply does not grow the block. */
      target.innerHTML = "";
      return null;
    });
  }

  /* THE SAME SUGGESTION, REFRESHED EACH TIME THE PANEL IS SHOWN, for the nine
     games whose full-time screens this session did not write. The crossword
     calls nextUp() directly from the function that paints its panel, which is
     better where it is available: it knows exactly when the panel opens.

     THE OTHER NINE SHOW THEIR RESULTS NINE DIFFERENT WAYS — a class on an
     overlay, a hidden attribute, a screen swap — and hooking each one means
     reading nine flows and being wrong about at least one of them. VISIBILITY
     is the thing they actually have in common, and IntersectionObserver reports
     it however the panel was shown.

     FILLED ONCE IMMEDIATELY, because an empty element has no height and an
     element with no height never intersects — it would wait for ever for a
     signal it had made impossible. */
  function watch(target, opts) {
    if (!target) return;
    fill(target, opts);
    var showing = false;
    function seen(on) {
      /* ONLY ON THE EDGE, not on every change. A panel that stays shown is
         the same showing, and refreshing on each tick would ask the season
         endpoint a dozen times for an answer that has not changed. */
      if (on && !showing) { showing = true; nextUp(target, opts); }
      else if (!on) showing = false;
    }

    /* SHOWN, NOT SCROLLED TO. This watched the slot come into VIEW, and the
       slot sits at the foot of every results panel: on a phone Full Time was
       only announced once the player scrolled to the bottom, so the app's
       reminders offer never came up for one who did not (found in the app,
       25 Sep 2026). A slot inside a hidden panel has no size, and gets one the
       moment its panel is shown wherever it is on the page -- so its SIZE is
       the signal. Width, because a slot with nothing to suggest is empty and
       has no height, but is still as wide as its panel. */
    if (window.ResizeObserver) {
      new ResizeObserver(function (entries) {
        seen(entries.some(function (e) { return e.contentRect.width > 0; }));
      }).observe(target);
      return;
    }
    if (!window.IntersectionObserver) return;   // filled once is still correct
    new IntersectionObserver(function (entries) {
      seen(entries.some(function (e) { return e.isIntersecting; }));
    }, { threshold: 0.01 }).observe(target);
  }

  /* SELF-MOUNTING, so a game needs markup and nothing else. A page declares

       <div id="nextUpRow" data-game="ballpark"></div>

     and this finds it. The alternative was a line of script in each of nine
     games, which is nine places to forget and nine places to get the id wrong —
     and the id is the one thing here that must match xi-played.js exactly.

     TWICE, BECAUSE NOT EVERY PANEL EXISTS AT LOAD. Most games have their
     results card in the page from the start; Grid builds its card in script
     when the round ends, so a scan at DOMContentLoaded would find nothing and
     never look again. The observer catches the ones that arrive later.

     ONCE PER ELEMENT. `xiftDone` marks what has been claimed, because the
     observer fires for every subtree that is added and a card rebuilt twice
     would otherwise be watched twice. */
  function claim(el) {
    if (!el || el.xiftDone) return;
    var game = el.getAttribute("data-game");
    if (!game) return;            // no id, no suggestion: guessing it would be worse
    el.xiftDone = true;
    watch(el, { game: game });
  }

  function autoMount() {
    var node = document.getElementById("nextUpRow");
    if (node) claim(node);

    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (!n || n.nodeType !== 1) continue;
          if (n.id === "nextUpRow") claim(n);
          else if (n.querySelector) claim(n.querySelector("#nextUpRow"));
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoMount);
  } else { autoMount(); }

  /* ---------------------------------------------------------------------
     THE PANEL. The owner, 26 Sep 2026, approving the mockup: every game ends
     the same way -- "Be consistent", "about 4 sections". This reverses the
     header above, which kept each game's panel its own on purpose; the owner
     looked at ten different endings and ruled for one. What stays the game's
     is the DATA it hands over: its score, its eleven, its one line of stats.

       XIFullTime.panel(el, {
         game: "quickfire",            // id: next-up, share, the squad
         name: "QuickFire XI", no: 9, date: "Sat 26 Sep",
         score: 62, max: 114,
         boxes: [{ s: "g", m: 12 }, { s: "r" }, …],   // g right, a partial,
                                       // r wrong, x not answered; m = minute
         door: { label, rungs, paid }, // Who Am I, in place of boxes
         stats: "8 right · 3 wrong",   // one line
         gaveUp: "Gave up at 34'",     // in place of stats, when so
         league: { text: "5th · Aston Villa", open: fn },
         share: function () { return "text"; },   // spoiler-free
         url: function () { return "board address"; },
         challenge: fn | undefined,    // a game's own; else the board and score
       })

     THE FOUR BLOCKS, IN ORDER, ALWAYS: the result; keep it (sign in, or
     "Saved to your account"); share; challenge. Then the next game. */
  var BOX_WORD = { g: "right", a: "part right", r: "wrong", x: "not answered" };

  function panel(target, d) {
    if (!target || !d) return null;
    target.innerHTML = "";
    target.classList.add("xft");

    /* 1. THE RESULT */
    var card = el("div", "xft-card");
    var head = el("div", "xft-head");
    head.appendChild(el("span", "xft-kick", "Full time"));
    if (d.date) head.appendChild(el("span", "xft-date", esc(d.date)));
    card.appendChild(head);
    card.appendChild(el("h2", "xft-name", esc(d.name) + (d.no != null ? " · No. " + esc(d.no) : "")));
    var max = Number(d.max) || 0, score = Number(d.score) || 0;
    card.appendChild(el("p", "xft-score", "<b>" + score + "</b><span>/ " + max + "</span>"));
    var bar = el("div", "xft-bar");
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", score + " of " + max);
    var fill = el("i");
    fill.style.width = (max ? Math.max(1, Math.min(100, Math.round(100 * score / max))) : 0) + "%";
    bar.appendChild(fill);
    card.appendChild(bar);

    if (d.door) {
      var door = el("div", "xft-door");
      door.appendChild(el("p", "xft-door-l", "Your door"));
      door.appendChild(el("p", "xft-door-v", esc(d.door.label)));
      var rungs = el("div", "xft-rungs");
      for (var r = 0; r < (Number(d.door.rungs) || 0); r++) {
        rungs.appendChild(el("i", r < (Number(d.door.paid) || 0) ? "paid" : ""));
      }
      rungs.setAttribute("aria-label", (Number(d.door.paid) || 0) + " of " + (Number(d.door.rungs) || 0) + " clues used");
      door.appendChild(rungs);
      card.appendChild(door);
    } else if (d.boxes && d.boxes.length) {
      var ol = el("ol", "xft-boxes");
      d.boxes.forEach(function (b, i) {
        var s = BOX_WORD[b.s] ? b.s : "x";
        var li = el("li", "xft-b " + s);
        /* The minute in a right answer's box, where the game has a clock; a
           cross in a wrong one, so right and wrong differ by more than hue. */
        li.textContent = s === "r" ? "×" : s === "x" ? "–" : b.m != null ? b.m + "'" : s === "a" ? "~" : "✓";
        li.setAttribute("aria-label", (i + 1) + ": " + BOX_WORD[s] + (b.m != null && s !== "r" && s !== "x" ? " at " + b.m + " minutes" : ""));
        ol.appendChild(li);
      });
      card.appendChild(ol);
    }
    if (d.gaveUp) card.appendChild(el("p", "xft-gaveup", esc(d.gaveUp)));
    else if (d.stats) card.appendChild(el("p", "xft-stats", esc(d.stats)));
    /* YOUR ANSWERS, folded away: what was picked and, for a miss, what it
       was -- a game that tells a player "no" owes them the answer. Folded so
       the four blocks stay the four blocks. */
    if (d.answers && d.answers.length) {
      var det = el("details", "xft-answers");
      det.appendChild(el("summary", "", "Your answers"));
      var al = el("ol", "");
      d.answers.forEach(function (a) {
        var s = BOX_WORD[a.s] ? a.s : "x";
        var li = el("li", "xft-a " + s);
        li.innerHTML = '<span class="xft-a-m">' + esc(a.m != null ? a.m + "'" : "") + "</span>" +
          '<span class="xft-a-t"><span class="xft-a-pick">' + esc(a.text) + "</span>" +
          (a.was ? '<span class="xft-a-was"> — ' + esc(a.was) + "</span>" : "") + "</span>" +
          '<span class="xft-a-p">' + esc(a.points != null ? a.points : "") + "</span>";
        al.appendChild(li);
      });
      det.appendChild(al);
      card.appendChild(det);
    }
    if (d.league && d.league.text) {
      var lg = el("div", "xft-league");
      lg.appendChild(el("span", "", esc(d.league.text)));
      if (typeof d.league.open === "function") {
        var see = el("button", "xft-link", "See the table");
        see.type = "button";
        see.addEventListener("click", d.league.open);
        lg.appendChild(see);
      }
      card.appendChild(lg);
    }
    target.appendChild(card);

    /* 2. KEEP IT. Redrawn when the account changes, so signing in from here
       turns the row into the saved line without leaving the panel. */
    var keep = el("div", "xft-keep");
    target.appendChild(keep);
    function drawKeep() {
      var A = window.XIChrome && XIChrome.account;
      var avail = !A || !A.available || A.available();
      keep.innerHTML = "";
      if (A && A.user && A.user()) {
        keep.className = "xft-keep xft-saved";
        keep.appendChild(el("span", "", "✓ Saved to your account"));
      } else if (A && avail) {
        keep.className = "xft-keep xft-signin";
        keep.appendChild(el("p", "", "Sign in to keep this result and your streak"));
        var sb = el("button", "xft-btn xft-ghost", "Sign in");
        sb.type = "button";
        sb.addEventListener("click", function () { A.open(); });
        keep.appendChild(sb);
      } else {
        keep.className = "xft-keep";
      }
    }
    drawKeep();
    if (!target.xftAcct) {
      target.xftAcct = true;
      document.addEventListener("xi:account", function () { if (target.contains(keep)) drawKeep(); });
    }

    /* 3. SHARE and 4. CHALLENGE: two intents, two buttons, never a toggle. */
    var act = el("div", "xft-act");
    var share = el("button", "xft-btn xft-primary", "Share result");
    share.type = "button";
    share.addEventListener("click", function () {
      var text = typeof d.share === "function" ? d.share() : "";
      var url = typeof d.url === "function" ? d.url() : location.href;
      send(share, text + (url ? "\n" + url : ""), "Share result");
    });
    act.appendChild(share);
    var ch = el("button", "xft-btn xft-secondary", "Challenge friends");
    ch.type = "button";
    /* THE BOARD AND THE SCORE TO BEAT, which every game can send. A game with
       a real challenge (a table on the server) is handed this as its way out
       when the server will not make one -- a daily, say -- and passes the
       challenge's own link to it when it does. */
    function sendBoard(link) {
      var text = (typeof d.share === "function" ? d.share() : "") + "\nCan you beat " + score + "/" + max + "?";
      var url = link || (typeof d.url === "function" ? d.url() : location.href);
      send(ch, text + (url ? "\n" + url : ""), "Challenge friends");
    }
    ch.addEventListener("click", function () {
      if (typeof d.challenge === "function") { d.challenge(sendBoard, ch); return; }
      sendBoard();
    });
    act.appendChild(ch);
    var table = el("div", "xft-table");
    table.id = "xftTable";
    act.appendChild(table);
    /* THE COMMUNITY LINE, under the two buttons: an empty box the chrome fills
       from its one href (xi-chrome.js community()), empty in a theme with no
       community. */
    act.appendChild(el("div", "xic-community"));
    target.appendChild(act);
    if (window.XIChrome && typeof XIChrome.community === "function") XIChrome.community(target);

    /* THEN THE NEXT GAME. */
    var next = el("div", "xft-next");
    next.id = "nextUpRow";
    next.setAttribute("data-game", d.game || "");
    target.appendChild(next);
    next.xiftDone = true;           // this panel announces it, not the watcher
    nextUp(next, { game: d.game });

    return { share: share, challenge: ch, table: table };
  }

  /* The phone's own share sheet where there is one; copy where there is not
     (desktop), said on the button that was pressed. */
  function send(button, text, label) {
    function done(ok) {
      button.textContent = ok ? "Copied" : "Copy failed";
      setTimeout(function () { button.textContent = label; }, 1800);
    }
    function copy() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
        return;
      }
      done(false);
    }
    if (navigator.share) { navigator.share({ text: text }).catch(function (e) {
      if (!e || e.name !== "AbortError") copy();
    }); return; }
    copy();
  }

  /* The spoiler-free line every game shares: its boxes as squares. */
  function squares(boxes) {
    var SQ = { g: "🟩", a: "🟨", r: "🟥", x: "⬜" };
    return (boxes || []).map(function (b) { return SQ[b.s] || SQ.x; }).join("");
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* A board's day as the panel prints it, "Sat 26 Sep", from its YYYY-MM-DD.
     Read in UTC because a board's day is the server's. */
  /* BY HAND, NOT toLocaleDateString: en-GB prints "Sept" in newer engines and
     "Sep" in older ones, so the same board read differently by device. */
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dayLabel(iso) {
    var t = Date.parse(String(iso || "").slice(0, 10) + "T12:00:00Z");
    if (isNaN(t)) return "";
    var d = new Date(t);
    return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()];
  }

  window.XIFullTime = { nextUp: nextUp, watch: watch, panel: panel, squares: squares, dayLabel: dayLabel, send: send };
})();
