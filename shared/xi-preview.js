/* xi-preview.js — the owner playing a day before it is served.
 *
 * Loaded FIRST, and only, on /admin/<theme>/<game>/<day>, after the server has
 * checked the admin flag and written window.XI_PREVIEW = { game, day, back }
 * into the page (functions/admin/[[path]].js). The page underneath is the
 * game's own, unchanged: this file makes it be that day and keeps everything
 * it does inside the tab. The owner, 3 Oct 2026: preview every game "in its
 * proper form", and "Record nothing".
 *
 * FIVE THINGS, each closing one way a play leaves the tab:
 *   1. The page's clock is that day. Games that work out "today" for
 *      themselves (the crossword from its synced clock, labels, streak maths)
 *      reach the same answer the server gives a preview request.
 *   2. localStorage is a copy held in memory, read from the real one: the
 *      page sees the device's history, and every save, result, streak and
 *      season write it makes is gone when the tab closes.
 *   3. Every request to this site carries the preview header, so the server
 *      serves and judges that day (functions/_lib/preview.js) -- for an admin
 *      session only, checked there, not here.
 *   4. Requests that record a player are answered here and never sent: the
 *      play counter, account sync and challenges. Reports and the owner's own
 *      flags still go, because saying a question is wrong is the point.
 *   5. A banner says it is a preview and that nothing is saved.
 * xi-plays.js reads XIPreview too, and sends nothing (its own guard, so the
 * play count does not rest on this file's list alone).
 */
(function () {
  "use strict";
  var P = window.XI_PREVIEW;
  if (!P || !/^\d{4}-\d{2}-\d{2}$/.test(String(P.day || ""))) {
    window.XIPreview = { active: false };
    return;
  }
  var HEADER = "X-XI-Preview";
  var DAY = String(P.day);

  /* ---- 1. the clock -------------------------------------------------------
     Whole days ahead, so the time of day, and every timer, stays true. */
  var RealDate = Date;
  var realNow = RealDate.now();
  var todayStart = RealDate.UTC(new RealDate(realNow).getUTCFullYear(),
    new RealDate(realNow).getUTCMonth(), new RealDate(realNow).getUTCDate());
  var SHIFT = RealDate.parse(DAY + "T00:00:00Z") - todayStart;
  if (SHIFT) {
    var Shifted = function () {
      var a = Array.prototype.slice.call(arguments);
      if (!(this instanceof Shifted)) return new RealDate(RealDate.now() + SHIFT).toString();
      if (!a.length) return new RealDate(RealDate.now() + SHIFT);
      return new (Function.prototype.bind.apply(RealDate, [null].concat(a)))();
    };
    Shifted.prototype = RealDate.prototype;
    Shifted.now = function () { return RealDate.now() + SHIFT; };
    Shifted.UTC = RealDate.UTC;
    Shifted.parse = RealDate.parse;
    window.Date = Shifted;
  }

  /* ---- 2. storage, in memory ---------------------------------------------- */
  var store = {};
  try {
    var real = window.localStorage;
    for (var i = 0; i < real.length; i++) { var k = real.key(i); store[k] = real.getItem(k); }
  } catch (e) { /* a private window: the copy starts empty */ }
  var memory = {
    getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[String(k)] = String(v); },
    removeItem: function (k) { delete store[String(k)]; },
    clear: function () { store = {}; },
    key: function (n) { var ks = Object.keys(store); return n >= 0 && n < ks.length ? ks[n] : null; },
  };
  Object.defineProperty(memory, "length", { get: function () { return Object.keys(store).length; } });
  var swapped = false;
  try {
    Object.defineProperty(window, "localStorage", { configurable: true, get: function () { return memory; } });
    swapped = window.localStorage === memory;
  } catch (e) { swapped = false; }

  /* ---- 3 and 4. requests ---------------------------------------------------- */
  /* What never leaves: a POST to these records a player. */
  var HELD = [/^\/api\/play\b/, /^\/api\/account\//, /^\/api\/challenge/, /^\/api\/push\//];
  function sameOrigin(u) { return u.origin === location.origin; }
  function held(u, method) {
    return sameOrigin(u) && String(method || "GET").toUpperCase() !== "GET" &&
      HELD.some(function (re) { return re.test(u.pathname); });
  }
  var realFetch = window.fetch;
  window.fetch = function (input, init) {
    var url, method = (init && init.method) || (input && input.method) || "GET";
    try { url = new URL(typeof input === "string" ? input : (input && input.url) || String(input), location.href); }
    catch (e) { return realFetch.apply(this, arguments); }
    if (held(url, method)) {
      return Promise.resolve(new Response(JSON.stringify({ ok: true, preview: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    if (!sameOrigin(url)) return realFetch.apply(this, arguments);
    var opts = Object.assign({}, init || {});
    var h = new Headers(opts.headers || (input && input.headers) || {});
    h.set(HEADER, DAY);
    opts.headers = h;
    if (typeof input !== "string" && input && input.url && !init) {
      return realFetch.call(this, new Request(input, opts));
    }
    return realFetch.call(this, url.href, opts);
  };
  if (navigator.sendBeacon) {
    var realBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, data) {
      try { if (held(new URL(u, location.href), "POST")) return true; } catch (e) {}
      return realBeacon(u, data);
    };
  }
  /* The address stays the preview's: a game that writes its board's own
     address into the bar (/daily/N) would otherwise leave a reload pointing
     at a public page that refuses a future board. State still moves. */
  ["pushState", "replaceState"].forEach(function (fn) {
    var orig = history[fn];
    history[fn] = function (state, title) { return orig.call(history, state, title); };
  });

  /* ---- 5. the banner ---------------------------------------------------------- */
  function banner() {
    if (document.getElementById("xiPreviewBar")) return;
    var bar = document.createElement("div");
    bar.id = "xiPreviewBar";
    bar.setAttribute("role", "status");
    /* FIXED, NOT IN THE FLOW: the play screens are locked to the viewport
       (no scroll while playing), and a bar that took height would push the
       last row of every one of them off the screen. */
    /* And never wider than the screen: on a phone a single line of label,
       link and three buttons ran off both edges (seen 3 Oct 2026). */
    bar.style.cssText = "position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:2147483000;" +
      "display:flex;flex-wrap:wrap;justify-content:center;gap:4px 8px;align-items:center;max-width:calc(100vw - 16px);" +
      "box-sizing:border-box;padding:3px 10px;border-radius:14px;text-align:center;" +
      "background:#7a2e00;color:#fff;font:600 11px/1.4 system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.3)";
    var when = new RealDate(DAY + "T12:00:00Z").toLocaleDateString("en-GB",
      { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    var t = document.createElement("span");
    t.textContent = "PREVIEW · " + when + " · nothing is saved" + (swapped ? "" : " (storage could not be held: do not trust saves)");
    t.style.cssText = "white-space:nowrap";
    bar.appendChild(t);
    var a = document.createElement("a");
    a.href = P.back || "/admin/";
    a.textContent = "All previews";
    a.style.cssText = "color:#fff;text-decoration:underline";
    bar.appendChild(a);
    /* THE OWNER'S VERDICTS (the owner, 3 Oct 2026: flag "clues / answers I
       like and don't like so it can be picked up by Claude for review").
       Select a clue's or an answer's words, then like, dislike or note: the
       selection, the game and the day go to /api/admin/review-flag. The
       selection is remembered as it is made, because tapping a button clears
       it on a phone before the tap's own handler runs. */
    [["like", "👍"], ["dislike", "👎"], ["note", "✎"]].forEach(function (v) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "xiPreviewFlag";
      b.setAttribute("data-verdict", v[0]);
      b.setAttribute("aria-label", v[0] === "note" ? "Write a note" : (v[0] === "like" ? "Like the selected words" : "Dislike the selected words"));
      b.textContent = v[1];
      b.style.cssText = "min-width:32px;min-height:24px;border:0;border-radius:999px;background:rgba(255,255,255,.18);color:#fff;font:inherit;cursor:pointer";
      b.addEventListener("click", function () { startFlag(v[0]); });
      bar.appendChild(b);
    });
    /* THE WHOLE BOARD, MARKED GOOD (the owner, 3 Oct 2026: "mark a board as
       good so it turns green on the selector view"). Reads what was last said
       about this board, and toggles it. */
    var good = document.createElement("button");
    good.type = "button";
    good.id = "xiPreviewGood";
    good.setAttribute("aria-pressed", "false");
    good.textContent = "\u2713 Good";
    good.style.cssText = "min-height:24px;padding:0 10px;border:1px solid rgba(255,255,255,.6);border-radius:999px;" +
      "background:transparent;color:#fff;font:inherit;cursor:pointer";
    function showGood(on) {
      good.setAttribute("aria-pressed", on ? "true" : "false");
      good.textContent = on ? "\u2713 Marked good" : "\u2713 Good";
      good.style.background = on ? "#1d6b35" : "transparent";
    }
    good.addEventListener("click", function () {
      var on = good.getAttribute("aria-pressed") !== "true";
      good.disabled = true;
      window.fetch("/api/admin/review-flag", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-XI-Games": "1" },
        body: JSON.stringify({ game: P.game, day: DAY, verdict: on ? "approved" : "unapproved" }),
      }).then(function (r) { good.disabled = false; if (r.ok) showGood(on); })
        .catch(function () { good.disabled = false; });
    });
    bar.appendChild(good);
    window.fetch("/api/admin/review-flags?game=" + encodeURIComponent(P.game || "") + "&day=" + DAY, { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var rows = (j && j.flags) || [];                 // newest first
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].verdict === "approved") { showGood(true); return; }
          if (rows[i].verdict === "unapproved") { showGood(false); return; }
        }
      }).catch(function () {});
    document.body.insertBefore(bar, document.body.firstChild);
  }

  /* WHAT THE WORDS WERE PART OF, captured with them (the bank master, 3 Oct
     2026: a flag addressed by its words stops matching when a clue is
     reworded). The bank's id from the nearest element a game marks with
     data-xi-item, and the whole clue as shown: that element's text, or else
     the nearest block around the selection. */
  var lastSelection = "", lastContext = { questionId: null, clue: null }, lastSelectedAt = 0;
  /* A selection counts for a short while after it is made -- long enough for
     the tap that clears it -- and not for the next question's flag. */
  var FRESH_MS = 20000;
  function selectionFresh() { return !!lastSelection && RealDate.now() - lastSelectedAt < FRESH_MS; }
  function forgetSelection() { lastSelection = ""; lastContext = { questionId: null, clue: null }; lastSelectedAt = 0; }
  var tidy = function (s, n) { return String(s || "").replace(/\s+/g, " ").trim().slice(0, n); };
  function contextOf(sel) {
    var node = sel && sel.anchorNode;
    return contextOfEl(node && (node.nodeType === 1 ? node : node.parentElement));
  }
  function contextOfEl(el) {
    try {
      if (!el) return { questionId: null, clue: null };
      var marked = el.closest ? el.closest("[data-xi-item]") : null;
      var block = marked || el;
      while (!marked && block.parentElement && block !== document.body &&
             /^inline/.test(window.getComputedStyle(block).display || "")) block = block.parentElement;
      return { questionId: marked ? tidy(marked.getAttribute("data-xi-item"), 80) || null : null,
               clue: tidy(block.textContent, 1000) || null };
    } catch (e) { return { questionId: null, clue: null }; }
  }
  document.addEventListener("selectionchange", function () {
    try {
      var sel = window.getSelection ? window.getSelection() : null;
      var s = tidy(sel ? String(sel) : "", 500);
      if (s) { lastSelection = s; lastContext = contextOf(sel); lastSelectedAt = RealDate.now(); }
    } catch (e) {}
  });

  /* TAP TO PICK (the owner, 3 Oct 2026, on a phone: "it says to select the
     clue on the page. How to do that"). Selecting text on a phone is a long
     press and two handles, and an answer drawn as a button cannot be
     selected at all. So with nothing selected, like and dislike ask for a
     tap instead: the next tap on the page is caught before the game sees it
     -- no move is made -- and the words tapped, with the clue they belong
     to, become the flag. A tap on the banner or the box is left alone. */
  var picking = null;
  var PICK_EVENTS = ["pointerdown", "mousedown", "touchstart", "pointerup", "mouseup", "touchend", "click"];
  function ours(t) { return !!(t && t.closest && t.closest("#xiPreviewBar, #xiPreviewFlagBox, #xiPreviewHint")); }
  function onPick(e) {
    if (!picking || ours(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type !== "click") return;
    var el = e.target && (e.target.nodeType === 1 ? e.target : e.target.parentElement);
    var verdict = picking;
    stopPicking();
    lastSelection = el ? tidy(el.textContent, 500) : "";
    lastContext = contextOfEl(el);
    openFlag(verdict);
  }
  function stopPicking() {
    picking = null;
    PICK_EVENTS.forEach(function (t) { window.removeEventListener(t, onPick, true); });
    var h = document.getElementById("xiPreviewHint");
    if (h) h.remove();
  }
  /* THE CLUES AND QUESTIONS THIS PAGE MARKS (data-xi-item), one each, for
     the box's dropdown -- the owner, 3 Oct 2026: "just give me a dropdown if
     I click up or down or default to the current selection". QuickFire,
     Ballpark and both crosswords mark theirs; a page that marks nothing
     falls back to a tap. */
  function markedItems() {
    var seen = {}, out = [];
    var els = document.querySelectorAll("[data-xi-item]");
    for (var i = 0; i < els.length; i++) {
      var id = tidy(els[i].getAttribute("data-xi-item"), 80);
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push({ id: id, text: tidy(els[i].textContent, 1000), el: els[i] });
    }
    return out;
  }
  function onScreen(el) {
    try {
      var r = el.getBoundingClientRect();
      return r.height > 0 && r.bottom > 0 && r.top < (window.innerHeight || 0);
    } catch (e) { return false; }
  }
  function startFlag(verdict) {
    if (verdict === "note" || selectionFresh() || markedItems().length) { stopPicking(); openFlag(verdict); return; }
    forgetSelection();
    stopPicking();
    picking = verdict;
    PICK_EVENTS.forEach(function (t) { window.addEventListener(t, onPick, true); });
    var hint = document.createElement("div");
    hint.id = "xiPreviewHint";
    hint.setAttribute("role", "status");
    hint.style.cssText = "position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:2147483001;" +
      "display:flex;gap:10px;align-items:center;padding:8px 12px;border-radius:12px;background:#7a2e00;color:#fff;" +
      "font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.35);max-width:calc(100vw - 24px)";
    var t = document.createElement("span");
    t.textContent = (verdict === "like" ? "👍" : "👎") + " Tap the clue or answer";
    var x = document.createElement("button");
    x.type = "button"; x.textContent = "Cancel";
    x.style.cssText = "min-height:32px;padding:0 10px;border:1px solid rgba(255,255,255,.6);border-radius:8px;background:transparent;color:#fff;font:inherit";
    x.addEventListener("click", stopPicking);
    hint.appendChild(t); hint.appendChild(x);
    document.body.appendChild(hint);
  }

  function openFlag(verdict) {
    var old = document.getElementById("xiPreviewFlagBox");
    if (old) old.remove();
    var box = document.createElement("form");
    box.id = "xiPreviewFlagBox";
    box.style.cssText = "position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:2147483001;" +
      "width:min(92vw,420px);padding:12px;border-radius:12px;background:#fff;color:#182219;" +
      "box-shadow:0 4px 18px rgba(0,0,0,.35);font:14px/1.4 system-ui,sans-serif;display:flex;flex-direction:column;gap:8px";
    var title = document.createElement("strong");
    title.textContent = verdict === "like" ? "👍 Like" : verdict === "dislike" ? "👎 Dislike" : "✎ Note";
    var context = lastContext;
    var where = document.createElement("small");
    where.style.cssText = "color:#5A675D";
    function showWhere() {
      where.textContent = context.questionId ? "Question " + context.questionId : (context.clue ? "From: " + context.clue.slice(0, 80) : "");
    }
    var item = document.createElement("textarea");
    item.name = "item"; item.rows = 2; item.value = lastSelection;
    item.placeholder = "The clue or answer";
    /* The dropdown: every marked clue, set to the one selected or tapped, or
       else the one on screen. Choosing one fills the words box with it,
       which stays editable for a single answer or word. */
    var items = markedItems(), pick = null;
    if (items.length) {
      pick = document.createElement("select");
      pick.name = "which";
      pick.style.cssText = "width:100%;min-height:44px;font:inherit;padding:6px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#182219";
      var at = -1;
      for (var i = 0; i < items.length; i++) {
        var o = document.createElement("option");
        o.value = String(i);
        o.textContent = items[i].text.slice(0, 90) || items[i].id;
        pick.appendChild(o);
        if (at < 0 && context.questionId && items[i].id === context.questionId) at = i;
      }
      if (at < 0) for (var j = 0; j < items.length; j++) if (onScreen(items[j].el)) { at = j; break; }
      if (at < 0) at = 0;
      pick.value = String(at);
      var choose = function (k, keepWords) {
        context = { questionId: items[k].id, clue: items[k].text };
        if (!keepWords) item.value = items[k].text.slice(0, 500);
        showWhere();
      };
      /* Words already selected or tapped are kept; otherwise the clue's own. */
      choose(at, !!item.value && context.questionId === items[at].id);
      pick.addEventListener("change", function () { choose(Number(pick.value), false); });
    }
    showWhere();
    var note = document.createElement("textarea");
    note.name = "note"; note.rows = 3; note.placeholder = "Why? (optional)";
    [item, note].forEach(function (x) { x.style.cssText = "width:100%;box-sizing:border-box;font:inherit;padding:6px;border:1px solid #ccc;border-radius:8px"; });
    var said = document.createElement("span");
    said.style.cssText = "font-size:13px;color:#5A675D";
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
    var cancel = document.createElement("button");
    cancel.type = "button"; cancel.textContent = "Cancel";
    var save = document.createElement("button");
    save.type = "submit"; save.textContent = "Save";
    [cancel, save].forEach(function (x) { x.style.cssText = "min-height:44px;padding:0 16px;border-radius:10px;border:1px solid #ccc;background:#fff;font:inherit;cursor:pointer"; });
    cancel.addEventListener("click", function () { box.remove(); forgetSelection(); });
    row.appendChild(cancel); row.appendChild(save);
    [title, pick, where, item, note, said, row].forEach(function (x) { if (x) box.appendChild(x); });
    box.addEventListener("submit", function (e) {
      e.preventDefault();
      save.disabled = true;
      said.textContent = "Saving…";
      window.fetch("/api/admin/review-flag", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-XI-Games": "1" },
        body: JSON.stringify({ game: P.game, day: DAY, verdict: verdict, item: item.value, note: note.value,
          questionId: context.questionId, clue: context.clue }),
      }).then(function (r) {
        if (r.ok) {
          said.textContent = "Saved."; forgetSelection();
          setTimeout(function () { box.remove(); }, 700); return;
        }
        save.disabled = false;
        return r.json().then(function (j) { said.textContent = (j && j.error) || "Not saved."; }, function () { said.textContent = "Not saved."; });
      }).catch(function () { save.disabled = false; said.textContent = "Not saved: no connection."; });
    });
    document.body.appendChild(box);
    (item.value ? note : item).focus();
  }
  if (document.body) banner(); else document.addEventListener("DOMContentLoaded", banner);

  window.XIPreview = { active: true, day: DAY, game: P.game || null, storageHeld: swapped, header: HEADER };
})();
