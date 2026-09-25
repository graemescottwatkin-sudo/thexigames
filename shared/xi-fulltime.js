/* xi-fulltime.js — the end of a game, the parts every game shares.
 *
 * WHAT IS SHARED AND WHAT IS NOT. Each game's full-time panel is its own: the
 * crossword shows a league position and a scoring breakdown, HiLo shows a
 * ladder, Ballpark shows a year. Those are the game, and replacing them with
 * one panel would throw away what each has learned. What IS the same in all of
 * them is the shape of the ending — you scored something, you can share it, and
 * there is another game today you have not played.
 *
 * So this does not render a panel. It renders the pieces a panel mounts, and
 * the game keeps its own. That is the opposite of the usual instinct and it is
 * deliberate: a shared component that owns the whole screen would have to grow
 * an option for every difference between ten games, and the options would
 * outnumber the shared part within a month.
 *
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

  window.XIFullTime = { nextUp: nextUp, watch: watch };
})();
