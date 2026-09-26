/* xi-matchbar.js — the one top bar every game's play screen wears.
 *
 * The owner, 25 Sep 2026: "make the top bar the same on every game" -- ten
 * games had ten headers, and the same idea went by six names (x/11,
 * unravelled, a 1-11 ladder, Question 1/11 ...). Approved design: a first line
 * naming the game and the board ("Crossword XI · No. 6", the date on the right
 * and "previous board" when it is not today's), and a second line of five
 * slots in one order everywhere:
 *
 *     Progress · Clock · Score · Worth · Subs
 *
 * A game without a slot shows a dash there, so every number stays where the
 * eye learned to find it. HiLo and Ballpark's clocks count seconds; the rest
 * run a match clock in minutes. Score (a running total) is only HiLo's,
 * QuickFire's and Ballpark's. Grid's turns left sit in Worth.
 *
 * THIS COMPONENT HOLDS NO FACT OF ITS OWN. Every value is handed to it by the
 * game that already computes it, through XIBar.set(); nothing here counts,
 * times or scores anything, so there is no second copy to drift.
 *
 *   XIBar.mount(el)                 draw the bar into el (once)
 *   XIBar.set({ name, no, date, old, progress, clock, score, worth, subs })
 *     name      "Crossword XI"
 *     no        board number                 -> "No. 6"
 *     day       "2026-09-23", shown as "23 Sep" (or date, already formatted)
 *     old       true on a previous board     -> "· previous board"
 *     progress  "3/11" (string, as the game says it)
 *     clock     "12'" or "18s"
 *     score     number or null (null draws a dash)
 *     worth     number, or a string such as "25 turns"
 *     subs      { left: 2, of: 3 } -> dots, filled for each one left
 *   Any key left out keeps its last value; null clears a slot to a dash.
 */
(function () {
  "use strict";
  var SLOTS = [["progress", "Progress"], ["clock", "Clock"], ["score", "Score"], ["worth", "Worth"], ["subs", "Subs"]];
  var state = {}, root = null;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function dots(s) {
    if (!s || !s.of) return null;
    var out = "";
    for (var i = 0; i < s.of; i++) out += i < s.left ? "●" : "○";
    return out;
  }

  function mount(el) {
    if (!el || root) return root;
    root = el;
    root.classList.add("xmb");
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "The match");
    var html = '<div class="xmb-top"><b class="xmb-name"></b><span class="xmb-date"></span></div><div class="xmb-row">';
    for (var i = 0; i < SLOTS.length; i++) {
      html += '<div class="xmb-c" data-k="' + SLOTS[i][0] + '"><span class="xmb-l">' + SLOTS[i][1] +
        '</span><span class="xmb-v">–</span></div>';
    }
    root.innerHTML = html + "</div>";
    /* A screen being shown, a column changing width: the bar's own box, or
       its parent's, changes size, and it is placed again. */
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { place(); });
      ro.observe(root);
      if (root.parentElement) ro.observe(root.parentElement);
    }
    draw();
    return root;
  }

  /* THE SAME PLACE IN EVERY GAME. Each game's column has its own padding and
     its own centre, and on a wide screen some are one column of two, so the
     bar is placed on the SCREEN's centre rather than its column's: its left
     edge is moved to where a bar of its width, centred on the page, begins.
     Measured, not assumed, and again whenever the page is resized or the bar
     is drawn -- a bar in a screen still hidden has no box to measure. */
  function place() {
    if (!root) return;
    root.style.marginLeft = "0px";
    var r = root.getBoundingClientRect();
    if (!r.width) return;
    var page = document.documentElement.clientWidth;
    root.style.marginLeft = Math.round((page - r.width) / 2 - r.left) + "px";
  }

  function draw() {
    if (!root) return;
    place();
    var s = state;
    root.querySelector(".xmb-name").textContent =
      (s.name || "") + (s.no != null ? " · No. " + s.no : "");
    root.querySelector(".xmb-date").textContent =
      (s.date || "") + (s.old ? (s.date ? " · " : "") + "previous board" : "");
    for (var i = 0; i < SLOTS.length; i++) {
      var k = SLOTS[i][0], v = k === "subs" ? dots(s.subs) : s[k];
      var cell = root.querySelector('[data-k="' + k + '"]');
      var shown = v === null || v === undefined || v === "" ? null : String(v);
      cell.classList.toggle("xmb-none", shown === null);
      cell.querySelector(".xmb-v").innerHTML = shown === null ? "–" : esc(shown);
    }
  }

  /* A day as the server gives it ("2026-09-23") read as "23 Sep". Formatting
     only: which day it is, and whether it is today's, are the game's to say. */
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function shortDay(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
    return m ? Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] : "";
  }

  function set(patch) {
    for (var k in patch || {}) state[k] = patch[k];
    if (patch && "day" in patch) state.date = shortDay(patch.day);
    draw();
  }

  window.addEventListener("resize", place);
  window.XIBar = { mount: mount, set: set, place: place, state: function () { return state; } };
})();
