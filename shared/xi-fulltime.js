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
    if (!target || !window.XIPlayed) return Promise.resolve(null);

    return XIPlayed.suggestNext(o.game).then(function (slot) {
      target.innerHTML = "";
      if (!slot) {
        /* EVERY GAME PLAYED IS AN ACHIEVEMENT, not an empty state. Saying
           nothing here would read as the feature having failed; the player has
           done the whole family today and should be told so. */
        target.appendChild(el("p", "xift-none", "That is all ten today. Come back tomorrow."));
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

  window.XIFullTime = { nextUp: nextUp };
})();
