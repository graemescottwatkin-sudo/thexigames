/* xi-push.js — reminders, inside the app and nowhere else.
 *
 * Loaded by xi-chrome.js only when the page is running inside The XI Games
 * app, which puts its XiPush plugin at window.Capacitor.Plugins.XiPush. In a
 * browser this file is never fetched, and the site looks exactly as it did.
 *
 * WHAT IT DOES
 *   - After a finished game, once per device: "Want a nudge when tomorrow's
 *     puzzles are out?" A yes asks Android for permission and registers the
 *     phone. A "not now" is remembered, and the offer is not made again.
 *   - Adds Reminders rows to the Settings menu: on or off, the morning time,
 *     the streak nudge and challenge results.
 *   - Re-registers on every start while reminders are on. Tokens rotate, and
 *     the server prunes a phone it has not heard from in 60 days.
 *
 * NOTHING IS OFFERED UNTIL THE APP CAN DELIVER IT. XiPush.status().configured
 * is false until the app is built with a Firebase config. Until then this
 * file adds no rows and asks nothing: a switch that cannot work would be
 * worse than no switch.
 *
 * THE SERVER DECIDES THE DAY. The phone sends its time zone name and the
 * minute of the morning it wants. It never sends a date. The rules for when
 * each message goes are functions/_lib/push.js.
 *
 * Kept on the device under xi.push.v1 (family-wide, in RECORD_KEEP): whether
 * the offer was made, whether reminders are on, and the token, so that
 * turning them off can tell the server which phone to forget.
 */
(function () {
  "use strict";
  var cap = window.Capacitor;
  var P = cap && cap.Plugins && cap.Plugins.XiPush;
  if (!P || window.XIPush) return;

  var KEY = "xi.push.v1";
  var API = "/api/push/device";
  var TIMES = [420, 480, 540, 600, 720];          // the morning choices, then Off
  var configured = false, prefs = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  var state = load();

  function zone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; }
  }

  function call(method, body) {
    var h = { "Content-Type": "application/json", "X-XI-Games": "1" };
    return fetch(API, { method: method, headers: h, credentials: "same-origin", body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
          return j;
        });
      });
  }

  /* Registers the phone, sending only what changed. Left out, a preference
     keeps its stored value, so a start-up post cannot undo a choice. */
  function register(extra) {
    if (!state.token) return Promise.reject(new Error("no token"));
    var body = { token: state.token, platform: state.platform || "android", tz: zone() };
    for (var k in extra || {}) body[k] = extra[k];
    return call("POST", body).then(function (j) { if (j.prefs) prefs = j.prefs; return j; });
  }

  function say(text) {
    var n = document.createElement("div");
    n.className = "xip-toast";
    n.setAttribute("role", "status");
    n.textContent = text;
    document.body.appendChild(n);
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 4000);
  }

  function turnOn() {
    return P.enable().then(function (r) {
      state.token = r.token; state.platform = r.platform || "android";
      state.on = true; state.asked = true; save(state);
      return register();
    }).then(function () {
      say("Reminders are on. Change them in Settings.");
    }, function (e) {
      var code = e && (e.code || e.message);
      if (code === "denied") say("Notifications are turned off for The XI Games in Android settings.");
      else say("Reminders could not be turned on just now.");
    });
  }

  function turnOff() {
    var token = state.token;
    state.on = false; save(state); prefs = null;
    var forget = token ? call("DELETE", { token: token }).catch(function () {}) : Promise.resolve();
    return forget.then(function () { return P.disable(); }).catch(function () {});
  }

  /* ---- the offer, after a finished game ---- */
  function offer() {
    if (!configured || state.asked || state.on || document.querySelector(".xip-ask")) return;
    var box = document.createElement("div");
    box.className = "xip-ask";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Reminders");
    box.innerHTML = '<p>Want a nudge when tomorrow’s puzzles are out?</p>' +
      '<div class="xip-btns"><button type="button" data-a="no">Not now</button>' +
      '<button type="button" data-a="yes" class="xip-yes">Yes</button></div>';
    box.addEventListener("click", function (ev) {
      var a = ev.target && ev.target.getAttribute && ev.target.getAttribute("data-a");
      if (!a) return;
      state.asked = true; save(state);
      box.parentNode.removeChild(box);
      if (a === "yes") turnOn();
    });
    document.body.appendChild(box);
  }

  /* ---- the settings rows ---- */
  function hhmm(m) {
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }
  /* Optimistic: the menu redraws the moment a row is pressed, so the row
     shows the new value at once and the server is told after. A refusal puts
     the old value back and says so. */
  function change(patch, undo) {
    register(patch).catch(function () { undo(); say("That change did not reach us. Try again in a moment."); });
  }
  function needsAccount() {
    return prefs && !prefs.account;
  }

  function addRows() {
    var add = window.XIChrome && window.XIChrome.addSetting;
    if (!add) return;
    add({
      label: "Reminders",
      state: function () { return state.on ? "On" : "Off"; },
      press: function () { if (state.on) turnOff(); else turnOn(); },
    });
    add({
      label: "Morning reminder",
      shown: function () { return !!(state.on && prefs); },
      state: function () { return prefs.wantMorning ? hhmm(prefs.morningMinute) : "Off"; },
      press: function () {
        var was = { m: prefs.morningMinute, w: prefs.wantMorning };
        var i = prefs.wantMorning ? TIMES.indexOf(prefs.morningMinute) : -1;
        if (!prefs.wantMorning) { prefs.wantMorning = true; prefs.morningMinute = TIMES[0]; }
        else if (i === -1 || i === TIMES.length - 1) prefs.wantMorning = false;
        else prefs.morningMinute = TIMES[i + 1];
        change({ wantMorning: prefs.wantMorning, morningMinute: prefs.morningMinute },
          function () { prefs.morningMinute = was.m; prefs.wantMorning = was.w; });
      },
    });
    [["Streak nudge", "wantStreak"], ["Challenge results", "wantChallenge"]].forEach(function (row) {
      add({
        label: row[0],
        shown: function () { return !!(state.on && prefs); },
        /* Both need an account: the server knows a signed-in player's streak
           and challenges, and nothing about a signed-out one. The row says so
           and opens sign-in rather than showing a switch that does nothing. */
        state: function () { return needsAccount() ? "Sign in" : (prefs[row[1]] ? "On" : "Off"); },
        closes: false,
        press: function () {
          if (needsAccount()) {
            if (window.XIChrome && XIChrome.account) XIChrome.account.open();
            return;
          }
          var was = prefs[row[1]];
          prefs[row[1]] = !was;
          var patch = {}; patch[row[1]] = !was;
          change(patch, function () { prefs[row[1]] = was; });
        },
      });
    });
  }

  function style() {
    var css =
      ".xip-ask{position:fixed;left:16px;right:16px;bottom:16px;z-index:60;max-width:420px;margin:0 auto;" +
      "background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:var(--r-lg);" +
      "padding:14px 16px;box-shadow:0 8px 28px rgba(0,0,0,.18);font:inherit}" +
      ".xip-ask p{margin:0 0 10px;font-weight:600}" +
      ".xip-btns{display:flex;gap:8px;justify-content:flex-end}" +
      ".xip-btns button{font:inherit;min-height:var(--tap,44px);padding:0 16px;border-radius:var(--r-pill);" +
      "border:1px solid var(--line);background:transparent;color:var(--ink)}" +
      ".xip-btns .xip-yes{background:var(--pitch);border-color:var(--pitch);color:var(--on-pitch)}" +
      ".xip-toast{position:fixed;left:16px;right:16px;bottom:16px;z-index:61;max-width:420px;margin:0 auto;" +
      "background:var(--ink);color:var(--paper);border-radius:var(--r-md);padding:12px 14px;font:inherit}";
    var s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  }

  window.XIPush = { offer: offer, on: function () { return !!state.on; } };

  P.status().then(function (st) {
    configured = !!(st && st.configured);
    if (!configured) return;
    style();
    addRows();
    document.addEventListener("xi:fulltime", offer);
    /* Permission withdrawn in Android settings: the reminders are off, and
       the server is told, rather than keeping a phone it cannot reach. */
    if (state.on && st.permission === "denied") { turnOff(); return; }
    if (state.on) {
      P.enable().then(function (r) {
        /* A rotated token: the old one is forgotten now rather than left for
           the sender to discover dead. */
        if (state.token && r.token !== state.token) call("DELETE", { token: state.token }).catch(function () {});
        state.token = r.token; state.platform = r.platform || "android"; save(state);
        return register();
      }).catch(function () {});
    }
    /* Signing in or out moves the phone onto or off the account at once, so
       the streak and challenge rows are right the next time Settings opens,
       not after the next start. The server reads the session; nothing about
       the account is sent from here. */
    document.addEventListener("xi:account", function () {
      if (state.on) register().catch(function () {});
    });
  }).catch(function () {});
})();
