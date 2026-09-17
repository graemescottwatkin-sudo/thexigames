/* xi-chrome.js v1 — the bar, the drawer and the footer, built once.
 *
 * WHY THE MARKUP IS BUILT HERE RATHER THAN WRITTEN INTO EACH PAGE. A squad list
 * copied into two HTML files is two lists, and game three makes it three. The
 * night this was written had already produced: a palette declared twice, the
 * word search's name in six places that had to be changed together, a build tag
 * three regexes disagreed about, and an INSERT whose columns and placeholders
 * stopped matching. Every one of them was the same fault. The squad is declared
 * once, below, and both games ask for it.
 *
 * RELEASED GAMES ARE NAMED; UNRELEASED ONES ARE NOT. live_check asserts the
 * site names no unbuilt game, and the hub already obeys it. A shirt number and
 * a status is all an unreleased slot gets — which happens to read as a team
 * sheet filling up.
 *
 * NO FRAMEWORK, NO BUILD STEP. Pages skips the build because there is no
 * package.json, by design. This is a plain script that runs on both games.
 *
 * THE ACCOUNT AND THE SETTINGS ARE IN HERE TOO. They were the crossword's: a
 * Sign in / Account / Settings trio in its bar, an account sheet of its own
 * and a settings menu built from its footer. Every other game had a sign-in
 * row hidden in the drawer and no settings at all, so "account and settings"
 * meant one thing on shirt 1 and nothing on the rest. The owner's rule is
 * that they are universal, so they are built here: one sheet, one menu, one
 * session, drawn into every bar the family has. A game adds its own rows to
 * the menu through XIChrome.addSetting and hears about the account through
 * the xi:account event; it draws none of this itself.
 */
(function () {
  "use strict";

  /* THE SQUAD. One list, and THREE states, not two.
       name + href  — released: named, linked, in the footer.
       href only    — built and playable but not launched: a way in for
                      whoever is testing it, and still NO NAME anywhere.
       neither      — a number and a status, as before.
     The middle state is new. The owner asked for a game that is available for
     testing to be reachable from the front door, under "the rest of the XI"
     rather than "Out now". Naming it is the part that was NOT asked for and
     is the part with a price: the hub is indexed, and two competitors ship
     regularly and already hold the names some of these were built under. So a
     game in testing gets a route in and keeps its silence, and the rule the
     gates enforce is unchanged — an unreleased game is named nowhere.
     Order is the shirt number. */
  var SQUAD = [
    { n: 1,  name: "Crossword XI",   href: "/football/crossword/" },
    { n: 2,  name: "Wordsearch XI",  href: "/football/wordsearch/" },
    { n: 3,  name: "Scrambled XI",   href: "/football/scrambled/" },
    { n: 4,  name: "HiLo XI",        href: "/football/hilo/" },
    /* Vowels XI launched on 4 Sep 2026 and took the next free number, which
       is what launching does. QuickFire was sitting at 5 while in testing and
       moves down: a game that is not out does not hold a shirt, and the rule
       says so — "only a launched game holds a number ... and moves down when a
       game ships past it". */
    { n: 5,  name: "Vowels XI",      href: "/football/vowels/" },
    /* Grid XI launched on 7 Sep 2026 and took the next free number, which is
       what launching does. QuickFire moves from 6 to 7 for the same reason it
       moved from 5 to 6 when Vowels went out: a game in testing does not hold
       a shirt, and it moves down when a game ships past it. */
    { n: 6,  name: "Grid XI",        href: "/football/grid/" },
    /* A GAME IN TESTING DOES NOT HOLD A SHIRT. Where one sits in this list
       while it is unreleased is the OWNER'S ORDERING of what comes next, not a
       number it owns — it says a status and nothing else, and its name stays
       off every served page until the day it launches. The link is for whoever
       is testing it. */
    /* Codeword XI launched on 14 September 2026 and took the next free number,
       which is what launching does. Ballpark was sitting on the seven as the
       owner's ORDERING of what came next and moves down: that was never a
       shirt, and the comment above says so. */
    { n: 7,  name: "Codeword XI",   href: "/football/codeword/" },
    /* QUICKFIRE XI LAUNCHED ON 15 SEPTEMBER 2026 and takes the eight, the next
       free number. It had sat on the eleven as the owner's ordering since
       9 September; Ballpark moves from eight to nine for the same reason
       QuickFire itself moved from five to six and six to seven while it was in
       testing. The tail drops one and the squad loses an unsigned slot rather
       than growing a twelfth.
       WHAT ACTUALLY CHANGED ON THE DAY, because "in testing" had stopped
       describing it: the game served the ANSWER to every question in its
       payload — eleven a day, in plain text — because the page was a typing
       game that revealed letters out of the answer string. It became a
       four-option picker with the marking, the clock and the score on the
       server, and it banked its first result ever; until then a finished round
       reached neither the account nor the season. LAUNCHED in games.js reads
       2026-09-14 and stays there: that is the day its first BOARD ran, which is
       what board numbering counts from, and it is not the same question as
       which day the game was released. */
    { n: 8,  name: "QuickFire XI",  href: "/football/quickfire/" },
    /* WHO AM I XI LAUNCHED ON 15 SEPTEMBER 2026 and takes the nine, the next
       free number. Ballpark moves from nine to ten — its third move in three
       days, having been on the seven until Codeword took it and the eight until
       QuickFire did. That is the rule working rather than churn: a game that is
       not out does not hold a shirt and moves when one ships past it, and the
       kit goes with the GAME rather than the number.
       Eleven shirts, so the tail loses its last unsigned slot rather than the
       squad growing a twelfth. */
    { n: 9,  name: "Who Am I XI",   href: "/football/whoami/" },
    { n: 10, name: "Ballpark XI",   href: "/football/ballpark/" },
    { n: 11, status: "In build" }
  ];

  /* WHERE A GAME LIVES, read off the squad rather than assembled from its id.
     The two were the same word until the theme move — "/" + game + "/" — and
     every place that assumed it broke at once. The squad's hrefs are the one
     statement of a game's address on the client side; this is how the rest of
     the chrome asks for it. */
  function pathOfGame(game) {
    for (var i = 0; i < SQUAD.length; i++) {
      var h = SQUAD[i].href;
      if (h && h.slice(-(game.length + 2)) === "/" + game + "/") return h;
    }
    return "/" + game + "/";
  }

  /* The pages every game shares. Kept here for the same reason as the squad:
     a footer written into each page is a footer that drifts. */
  /* THE FOOTER'S "MORE" LINKS, AND THEY BELONG TO THE GAME YOU ARE ON.
   *
   * This was one hardcoded list pointing at the crossword's pages, printed on
   * every page of every game. So Who Am I's footer offered "How to play" and
   * "Answers" for the crossword — a player on the ninth game sent to the first
   * game's rules, and to an answers page for a puzzle they were not playing.
   * Nine games shared one game's footer, which is the family's oldest fault in
   * the one place every single page renders.
   *
   * PRIVACY IS THE EXCEPTION AND STAYS PUT. It is the site's privacy policy
   * rather than the crossword's; it lives under that path for historical
   * reasons and moving it would break a link somebody has bookmarked, which is
   * a worse trade than an odd-looking URL.
   *
   * WHAT A GAME OFFERS IS ITS OWN. Not every game has an answers page — a
   * codeword's solution IS its grid, QuickFire's answers are the three options
   * you did not pick, and Who Am I's would publish ten doors other people have
   * not opened — so the list is per game and an absent entry is a decision
   * rather than an oversight. */
  var PRIVACY_HREF = "/football/crossword/privacy";
  var GAME_PAGES = {
    crossword:  [["How to play", "/football/crossword/how-to-play"],
                 ["Answers", "/football/crossword/answers/"]],
    wordsearch: [["How to play", "/football/wordsearch/#how"],
                 ["Answers", "/football/wordsearch/answers/"]],
    scrambled:  [["How to play", "/football/scrambled/#how"],
                 ["Answers", "/football/scrambled/answers/"]],
    hilo:       [["How to play", "/football/hilo/#how"],
                 ["Answers", "/football/hilo/answers/"]],
    vowels:     [["How to play", "/football/vowels/#how"],
                 ["Answers", "/football/vowels/answers/"]],
    grid:       [["How to play", "/football/grid/#how"],
                 ["Answers", "/football/grid/answers/"]],
    /* No answers page: the solution is the grid itself. */
    codeword:   [["How to play", "/football/codeword/#how"]],
    /* No answers page: the answers are the three options you did not pick. */
    quickfire:  [["How to play", "/football/quickfire/#how"]],
    /* No answers page: it would publish ten doors nobody has opened yet. */
    whoami:     [["How to play", "/football/whoami/#how"]],
    /* No answers page: a Ballpark answer is a number and the board shows the
       true value at full time, so there is nothing an answers page would add
       that finishing the board does not. */
    ballpark:   [["How to play", "/football/ballpark/#how"]]
  };

  /* WHICH GAME THIS PAGE BELONGS TO, read off the path. The hub and the
     site-wide pages belong to none, and get the crossword's — they have to get
     something, and it is the game the privacy page already lives under. */
  function pagesHere() {
    var m = /^\/football\/([a-z]+)\//.exec(location.pathname || "");
    var own = (m && GAME_PAGES[m[1]]) || GAME_PAGES.crossword;
    return own.map(function (p) { return { name: p[0], href: p[1] }; })
      .concat([{ name: "Privacy", href: PRIVACY_HREF }]);
  }
  var PRIVACY = "/football/crossword/privacy";

  /* xic-xi, not xi. The chrome owns its markup and every class in it lives in
     the xic- namespace, because a bare .xi is a class any game may already
     have — and Crossword XI does: a dark green badge for its own branding.
     It landed on the shared wordmark, which sets its own colour, and the two
     together produced dark letters on a dark box. Invisible on one game and
     right on the other, from one unnamespaced class. */
  var WORDMARK = 'The <span class="xic-xi">XI</span> Games';

  var CSRF = { "X-XI-Games": "1" };

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function btn(cls, text) {
    var b = el("button", cls, text);
    b.type = "button";
    return b;
  }
  function emit(name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (e) {}
  }
  function api(path, body, method) {
    var opts = { method: method || (body ? "POST" : "GET"), headers: {}, credentials: "same-origin" };
    for (var k in CSRF) opts.headers[k] = CSRF[k];
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.error) || String(r.status));
        return j;
      });
    });
  }

  /* Is this slot the page we are on? Compared on the path only: a query string
     or a token must not stop the drawer marking where you are. */
  function isHere(href) {
    return href && location.pathname.indexOf(href) === 0;
  }

  function squadList() {
    var ul = el("ul", "xic-squad");
    SQUAD.forEach(function (g) {
      var li = document.createElement("li");
      var shirt = '<span class="xic-shirt">' + g.n + "</span>";
      if (g.href && g.name) {
        var a = el("a", "xic-slot", shirt + "<span>" + g.name + "</span>");
        a.href = g.href;
        if (isHere(g.href)) a.setAttribute("aria-current", "page");
        li.appendChild(a);
      } else if (g.href) {
        /* In testing: the slot opens, and says only what the span said. Marked
           nofollow because the hub is indexed and the page at the other end
           carries the game's name — the link is for whoever is testing it,
           not an announcement. */
        var t = el("a", "xic-slot soon", shirt + '<span class="xic-status">' + g.status + "</span>");
        t.href = g.href;
        t.rel = "nofollow";
        if (isHere(g.href)) t.setAttribute("aria-current", "page");
        li.appendChild(t);
      } else {
        /* A span, not a disabled link: there is nowhere to go, and a link that
           goes nowhere is a promise the site cannot keep. */
        li.appendChild(el("span", "xic-slot soon",
          shirt + '<span class="xic-status">' + g.status + "</span>"));
      }
      ul.appendChild(li);
    });
    return ul;
  }

  var scrim, drawer, opener;

  function close() {
    if (!drawer) return;
    drawer.classList.remove("open");
    scrim.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    if (opener) { opener.setAttribute("aria-expanded", "false"); opener.focus(); }
  }

  function open(btn) {
    opener = btn;
    drawer.classList.add("open");
    scrim.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    btn.setAttribute("aria-expanded", "true");
    var first = drawer.querySelector(".xic-close");
    if (first) first.focus();
  }

  /* ======================================================================
     THE ACCOUNT — one session, one sheet, every bar.

     The session cookie has been scoped Domain=.thexigames.com since accounts
     existed, so signing in on one game already signs you in on all of them.
     The endpoints are the family's — /api/auth/session, /api/auth/google,
     /api/auth/signout, /api/account/profile and /api/account/code sit at the
     repository root. What was per-game was the CONTROL, and now it is not.

     THE CHROME OWNS THE IDENTITY; THE GAME OWNS ITS RESULTS. Signing in,
     signing out, renaming and linking a device code happen here and are
     announced on document as "xi:account" with { type, user, via }. A game
     that keeps results locally listens, pushes what this device has and
     pulls what the account holds. Nothing here touches a game's storage.
     ====================================================================== */
  var acct = { known: false, user: null, accounts: false, googleClientId: null };
  var sheet = null, sheetOpener = null, gsiReady = false;

  /* ---- the device code -------------------------------------------------
     A twelve-character code that identifies this player without an account.
     Generated here and kept in this browser; nothing reaches the server until
     they ask to link. Family key xi.deviceCode, with the crossword's old key
     read as a fallback so a code shown before this move still works.
     Crockford base32 with 0 and 1 dropped as well: 0/O and 1/I are exactly
     what people get wrong copying a code from an iPad onto a laptop. */
  var CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
  var CODE_KEY = "xi.deviceCode", CODE_LEGACY = "fcw.deviceCode";
  function makeCode() {
    var out = "";
    try {
      var buf = new Uint32Array(12);
      crypto.getRandomValues(buf);
      for (var i = 0; i < 12; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
    } catch (e) {
      for (var j = 0; j < 12; j++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return out;
  }
  function deviceCode() {
    var c = null;
    try { c = localStorage.getItem(CODE_KEY) || localStorage.getItem(CODE_LEGACY); } catch (e) {}
    if (c && c.length === 12) return c;
    c = makeCode();
    try { localStorage.setItem(CODE_KEY, c); } catch (e) {}
    return c;
  }
  function formatCode(c) {
    return String(c || "").replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3");
  }

  function userName() {
    return acct.user ? (acct.user.displayName || "Account") : "";
  }

  /* Everything that shows the session, painted from the one record. */
  function paintAccount() {
    Array.prototype.forEach.call(document.querySelectorAll(".xic-signin"), function (b) {
      b.hidden = !acct.known || !!acct.user || !acct.accounts;
    });
    Array.prototype.forEach.call(document.querySelectorAll(".xic-account"), function (b) {
      b.hidden = !acct.user;
      b.textContent = userName();
      b.title = acct.user ? "Your account" : "";
    });
    var row = drawer && drawer.querySelector(".xic-acct");
    if (row) {
      row.hidden = !acct.known || (!acct.user && !acct.accounts);
      row.querySelector(".xic-acct-state").textContent =
        acct.user ? "Signed in as " + userName() : "Not signed in";
      row.querySelector(".xic-acct-btn").textContent = acct.user ? "Account" : "Sign in";
    }
    if (!sheet) return;
    var s = sheet;
    s.querySelector(".xic-sub").textContent = acct.user
      ? "Signed in" + (acct.user.provider === "google" ? " with Google" : acct.user.provider === "code" ? " with a device code" : "")
      : "Playing as a guest on this device";
    s.querySelector(".xic-out").hidden = !!acct.user;
    s.querySelector(".xic-in").hidden = !acct.user;
    s.querySelector(".xic-unavail").hidden = !!acct.accounts;
    s.querySelector(".xic-gsi").hidden = !acct.accounts;
    if (acct.user) s.querySelector(".xic-name").value = acct.user.displayName || "";
  }

  function say(text) {
    if (!sheet) return;
    var m = sheet.querySelector(".xic-msg");
    m.textContent = text || "";
  }

  function setUser(user, via) {
    acct.user = user || null;
    paintAccount();
    emit("xi:account", { type: "signin", user: acct.user, via: via });
  }

  function signOut() {
    api("/api/auth/signout", {}).then(function () {
      acct.user = null;
      paintAccount();
      say("");
      /* The Google button has to be drawn again: the library renders it once
         into an element and does not restore it when the session it was
         drawn for ends. */
      renderGoogle();
      emit("xi:account", { type: "signout", user: null });
    }).catch(function () {
      /* A failed sign-out is the one that MISLEADS if silent: the page would
         show signed-out while the cookie is still live. */
      say("Could not sign out. Try again in a moment.");
    });
  }

  function saveName() {
    var name = sheet.querySelector(".xic-name").value;
    api("/api/account/profile", { displayName: name }).then(function (r) {
      acct.user = r.user || acct.user;
      paintAccount();
      say("Saved.");
      emit("xi:account", { type: "profile", user: acct.user });
    }).catch(function (e) {
      say(String(e && e.message || "Could not save that name."));
    });
  }

  function claimCode() {
    var raw = sheet.querySelector(".xic-code-in").value || "";
    var code = String(raw).toUpperCase().replace(/[^0-9A-Z]/g, "");
    var note = sheet.querySelector(".xic-code-msg");
    if (code.length !== 12) { note.textContent = "Twelve characters, like XXXX-XXXX-XXXX."; return; }
    api("/api/account/code", { code: code }).then(function (d) {
      if (!d || !d.user) { note.textContent = "That code is not right. Check it and try again."; return; }
      try { localStorage.setItem(CODE_KEY, code); } catch (e) {}
      note.textContent = "";
      setUser(d.user, "code");
      say("Devices linked. Your results are saved and will follow you.");
    }).catch(function () {
      note.textContent = "That code is not right, or the server could not be reached.";
    });
  }

  function copyCode() {
    var code = formatCode(deviceCode());
    var note = sheet.querySelector(".xic-code-msg");
    try {
      navigator.clipboard.writeText(code).then(function () {
        note.textContent = "Code copied. Enter it on your other device.";
      }, function () { note.textContent = "Copy it by hand: " + code; });
    } catch (e) { note.textContent = "Copy it by hand: " + code; }
  }

  /* Google's button, into the sheet. Drawn when the sheet first opens, not at
     boot: most visitors never open it, and the script is not free. */
  function renderGoogle() {
    if (!sheet || !acct.accounts || !acct.googleClientId) return;
    var mount = sheet.querySelector(".xic-gsi");
    mount.innerHTML = "";
    function draw() {
      if (!window.google || !window.google.accounts) return;
      if (!gsiReady) {
        window.google.accounts.id.initialize({
          client_id: acct.googleClientId,
          callback: function (resp) {
            api("/api/auth/google", { credential: resp.credential })
              .then(function (r) {
                setUser(r.user, "google");
                say("Signed in. Your results on this device are being saved to your account.");
              })
              .catch(function (e) { say(String(e && e.message || "Sign-in failed.")); });
          },
        });
        gsiReady = true;
      }
      window.google.accounts.id.renderButton(mount,
        { theme: "outline", size: "large", text: "signin_with", shape: "pill" });
    }
    if (window.google && window.google.accounts) return draw();
    if (document.querySelector('script[src^="https://accounts.google.com/gsi/client"]')) {
      /* Already loading; draw when it lands. */
      var wait = setInterval(function () {
        if (window.google && window.google.accounts) { clearInterval(wait); draw(); }
      }, 150);
      setTimeout(function () { clearInterval(wait); }, 15000);
      return;
    }
    var sc = document.createElement("script");
    sc.src = "https://accounts.google.com/gsi/client";
    sc.async = true; sc.defer = true;
    sc.onload = draw;
    sc.onerror = function () {
      acct.accounts = false;
      var u = sheet.querySelector(".xic-unavail");
      u.textContent = "Could not reach the sign-in service.";
      paintAccount();
    };
    document.head.appendChild(sc);
  }

  function buildSheet() {
    sheet = el("div", "xic-sheet");
    sheet.hidden = true;
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "xicAcctTitle");
    sheet.innerHTML =
      '<div class="xic-sheet-card">' +
        '<h3 id="xicAcctTitle">Your account</h3>' +
        '<div class="xic-sub">Playing as a guest on this device</div>' +
        '<div class="xic-out">' +
          '<p class="xic-why">' + WHY_DEFAULT + '</p>' +
          '<div class="xic-gsi"></div>' +
          '<p class="xic-small xic-unavail" hidden>Sign-in is not switched on for this site yet.</p>' +
          /* Two controls, not one prompt. The device that has the progress
             needs to be GIVEN a code; the device that does not needs to ENTER
             one. Each says what it is for, and the second answers the question
             anybody hesitating actually has: will this wipe what I have here? */
          '<div class="xic-code">' +
            '<div class="xic-code-or">or, without an account</div>' +
            '<div class="xic-code-lbl">This device</div>' +
            '<div class="xic-code-row"><code class="xic-code-mine">&mdash;</code>' +
              '<button type="button" class="xic-btn outline xic-code-copy">Copy</button></div>' +
            '<div class="xic-code-note">Enter this on another device to play on both.</div>' +
            '<div class="xic-code-lbl">Playing somewhere else already?</div>' +
            '<div class="xic-code-row"><input class="xic-code-in" type="text" inputmode="latin" ' +
              'autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX" maxlength="14" aria-label="Device code">' +
              '<button type="button" class="xic-btn xic-code-go">Use code</button></div>' +
            '<div class="xic-code-note">Your results from both devices will be merged.</div>' +
            '<div class="xic-code-note xic-code-msg" aria-live="polite"></div>' +
          '</div>' +
          /* Directly under the sign-in button rather than in a footer: signing
             in is the one moment somebody hands over an identity, so the
             explanation of what happens to it belongs at that button. */
          '<p class="xic-small">Signing in shares your name and email address with us. ' +
            '<a href="' + PRIVACY + '">What we do with it</a>.</p>' +
        '</div>' +
        '<div class="xic-in" hidden>' +
          '<label class="xic-field"><span>Display name</span>' +
            '<input class="xic-name" type="text" maxlength="40" autocomplete="nickname"></label>' +
          '<div class="xic-actions">' +
            '<button type="button" class="xic-btn xic-save">Save</button>' +
            '<button type="button" class="xic-btn outline" id="xicAcctSignOut">Sign out</button>' +
          '</div>' +
          '<div class="xic-small xic-msg" aria-live="polite"></div>' +
        '</div>' +
        /* TRUE AFTER THE ARCHIVE GATE, not before it. This read "Signing in
           is optional. Every game works without an account," which stopped
           being the whole truth the day the archive beyond a week started
           asking for one. Every game still PLAYS without an account — today
           and the week behind it — and the line now says what an account
           adds rather than implying it adds nothing. The window itself is not
           named here: the number lives on the server and the page that draws
           it is told, so a copy in the chrome would be a second window. */
        '<p class="xic-small">Signing in is optional &mdash; every game plays without an ' +
          'account. An account opens the older archive and keeps your results across devices.</p>' +
        '<button type="button" class="xic-btn outline xic-sheet-close" id="xicAcctClose">Close</button>' +
      '</div>';
    sheet.addEventListener("click", function (ev) { if (ev.target === sheet) closeSheet(); });
    sheet.querySelector(".xic-sheet-close").addEventListener("click", closeSheet);
    sheet.querySelector("#xicAcctSignOut").addEventListener("click", signOut);
    sheet.querySelector(".xic-save").addEventListener("click", saveName);
    sheet.querySelector(".xic-code-copy").addEventListener("click", copyCode);
    sheet.querySelector(".xic-code-go").addEventListener("click", claimCode);
    sheet.querySelector(".xic-code-in").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") claimCode();
    });
    document.body.appendChild(sheet);
  }

  /* WHY THE SHEET IS OPEN. Usually nobody has asked — somebody pressed
     Account — and this is the standing case for having one. When something
     sent them here, that reason goes first and this follows it, so the line
     reads as an answer rather than as an advert. Restored on every open, or
     a reason given once would still be on screen a week later. */
  var WHY_DEFAULT = "Create a free account to keep your form, streaks and " +
    "results across devices and across every XI game. Your progress on this " +
    "device comes with you.";
  function setWhy(reason) {
    if (!sheet) return;
    var el = sheet.querySelector(".xic-why");
    if (el) el.textContent = reason ? reason + " " + WHY_DEFAULT : WHY_DEFAULT;
  }

  function openSheet(from) {
    if (!sheet) buildSheet();
    setWhy(null);
    sheetOpener = from || null;
    close();
    closePop();
    paintAccount();
    /* Shown when the sheet opens rather than at boot, so a code is only put
       on screen for somebody who went looking for it. */
    sheet.querySelector(".xic-code-mine").textContent = formatCode(deviceCode());
    sheet.querySelector(".xic-code-msg").textContent = "";
    sheet.hidden = false;
    if (!acct.user) renderGoogle();
    var first = sheet.querySelector(".xic-sheet-close");
    if (first) first.focus();
  }
  function closeSheet() {
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    if (sheetOpener && sheetOpener.focus) sheetOpener.focus();
  }

  /* ======================================================================
     THE SETTINGS — one menu, anchored under whichever button opened it.

     The family's rows are here: the theme. A game's rows come through
     XIChrome.addSetting({ label, state, press, shown, closes }) — label is
     the text, state() the value shown beside it, press() what the row does,
     shown() whether it applies right now, closes whether pressing it should
     shut the menu (it opens a sheet, say). The menu is built from those at
     open time, so each row shows what its control currently says and
     nothing here is a second copy of a game's settings.
     ====================================================================== */
  var settings = [], pop = null, popOpener = null;

  var THEME_ROW = {
    label: "Theme",
    state: function () { return window.XITheme ? window.XITheme.get() : "light"; },
    press: function () {
      if (!window.XITheme) return;
      var choice = window.XITheme.cycle();
      emit("xi:theme", { choice: choice });
    },
  };

  function addSetting(row) {
    if (!row || !row.label || typeof row.press !== "function") return;
    settings.push(row);
  }

  function buildPop() {
    pop = el("div", "xic-pop");
    pop.hidden = true;
    pop.setAttribute("role", "menu");
    pop.setAttribute("aria-label", "Settings");
    pop.addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-row]");
      if (!b) { ev.stopPropagation(); return; }     // a link looks after itself
      ev.stopPropagation();
      var row = b.getAttribute("data-row") === "theme" ? THEME_ROW : settings[Number(b.getAttribute("data-row"))];
      if (!row) return;
      try { row.press(); } catch (e) {}
      /* Rebuilt rather than closed: changing the theme is something people do
         two or three times in a row. Anything that opens a sheet closes it,
         because the menu would be behind the sheet. */
      if (row.closes) { closePop(); return; }
      fillPop();
    });
    document.body.appendChild(pop);
    document.addEventListener("click", function (ev) {
      if (pop.hidden) return;
      if (pop.contains(ev.target) || (popOpener && popOpener.contains(ev.target))) return;
      closePop();
    });
  }

  function rowHtml(key, row) {
    var st = "";
    try { st = row.state ? String(row.state() || "") : ""; } catch (e) {}
    return '<button type="button" role="menuitem" class="xic-row" data-row="' + key + '">' +
      escapeHtml(row.label) + '<span class="xic-pc">' + escapeHtml(st) + "</span></button>";
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fillPop() {
    var html = rowHtml("theme", THEME_ROW);
    settings.forEach(function (row, i) {
      var on = true;
      try { on = row.shown ? !!row.shown() : true; } catch (e) {}
      if (on) html += rowHtml(String(i), row);
    });
    html += '<a role="menuitem" class="xic-row" href="' + PRIVACY + '">Privacy<span class="xic-pc">&rsaquo;</span></a>';
    var tag = document.getElementById("buildTag");
    if (tag && tag.textContent) html += '<div class="xic-set-build">' + escapeHtml(tag.textContent) + "</div>";
    pop.innerHTML = html;
  }

  function openPop(from) {
    if (!pop) buildPop();
    if (!pop.hidden && popOpener === from) { closePop(); return; }
    popOpener = from || null;
    closeSheet();
    fillPop();
    pop.classList.remove("as-sheet");
    var inBar = from && from.closest && from.closest(".xic-bar");
    if (inBar && from.getBoundingClientRect) {
      /* Under the button that opened it, on the right. Fixed, so a bar that
         has scrolled off the top still gets a menu that is on screen. */
      var r = from.getBoundingClientRect();
      pop.style.top = Math.round(r.bottom + 5) + "px";
      pop.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + "px";
    } else {
      /* From the drawer: the button is about to slide away, so the menu sits
         in the middle as a small sheet of its own. */
      pop.style.top = ""; pop.style.right = "";
      pop.classList.add("as-sheet");
      close();
    }
    pop.hidden = false;
    if (from) from.setAttribute("aria-expanded", "true");
    var first = pop.querySelector(".xic-row");
    if (first) first.focus();
  }
  function closePop() {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    if (popOpener) { popOpener.setAttribute("aria-expanded", "false"); if (popOpener.focus) popOpener.focus(); }
  }

  /* ---- the drawer ------------------------------------------------------ */
  function accountRow() {
    var row = el("div", "xic-acct");
    row.hidden = true;
    row.innerHTML = '<span class="xic-acct-state">&hellip;</span>';
    var b = btn("xic-acct-btn", "Sign in");
    b.addEventListener("click", function () { openSheet(b); });
    row.appendChild(b);
    return row;
  }

  function buildDrawer() {
    scrim = el("div", "xic-scrim");
    scrim.addEventListener("click", close);

    drawer = el("aside", "xic-drawer");
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("aria-label", "The XI Games");

    var head = el("div", "xic-dhead");
    var home = el("a", "xic-home", WORDMARK);
    home.href = "/";
    head.appendChild(home);
    var x = el("button", "xic-close", "&times;");
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", close);
    head.appendChild(x);
    drawer.appendChild(head);

    drawer.appendChild(el("div", "xic-dlabel", "The squad"));
    drawer.appendChild(squadList());

    var foot = el("div", "xic-dfoot");
    /* Settings first, because on a narrow phone the bar drops its Settings
       button and this is where it lives instead. */
    var set = btn("xic-slot xic-dsettings", "<span>Settings</span>");
    set.setAttribute("aria-haspopup", "menu");
    set.setAttribute("aria-expanded", "false");
    set.addEventListener("click", function () { openPop(set); });
    foot.appendChild(set);
    pagesHere().forEach(function (p) {
      var a = el("a", "xic-slot", "<span>" + p.name + "</span>");
      a.href = p.href;
      foot.appendChild(a);
    });
    drawer.appendChild(accountRow());
    drawer.appendChild(foot);

    document.body.appendChild(scrim);
    document.body.appendChild(drawer);

    /* Escape closes whichever of them is open. A drawer that traps a keyboard
       player is worse than no drawer, and the close button is focused on open
       so Escape is reachable without a mouse. */
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (drawer.classList.contains("open")) close();
      if (pop && !pop.hidden) closePop();
      if (sheet && !sheet.hidden) closeSheet();
    });
  }

  /* Fill a bar that the page has already placed. The page owns WHERE the bar
     sits — in the crossword that is two different views — and this owns what is
     in it, so the two games cannot drift apart.

     IDEMPOTENT. init() is called by this script on load and again by any page
     or suite that asks; a bar filled twice had two burgers, which the chrome
     test never noticed because it asked whether a burger existed, not how
     many. */
  function fillBar(bar) {
    if (bar.querySelector(".xic-burger")) return;
    var burger = el("button", "xic-burger",
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" aria-hidden="true">' +
      '<path d="M4 7h16M4 12h16M4 17h16"/></svg>');
    burger.type = "button";
    burger.setAttribute("aria-label", "Games and settings");
    burger.setAttribute("aria-expanded", "false");
    burger.addEventListener("click", function () { open(burger); });
    bar.insertBefore(burger, bar.firstChild);

    /* The wordmark goes home from every view, including mid-board. That is the
       fix for being stranded on a puzzle with no route out. */
    if (!bar.querySelector(".xic-home")) {
      var home = el("a", "xic-home", WORDMARK);
      home.href = "/";
      bar.insertBefore(home, burger.nextSibling);
    }

    /* THE UNIVERSAL TRIO, at the right-hand end of every bar, after anything
       the page put there itself (a game's How to play). Sign in and Account
       are the same slot in two states, so only one shows; Settings is
       optional under 430px because the drawer carries it there. */
    var right = bar.querySelector(".xic-right");
    if (!right) { right = el("div", "xic-right"); bar.appendChild(right); }
    var si = btn("xic-ghost xic-signin", "Sign in");
    si.hidden = true;
    si.addEventListener("click", function () { openSheet(si); });
    var ac = btn("xic-ghost xic-account", "Account");
    ac.hidden = true;
    ac.addEventListener("click", function () { openSheet(ac); });
    var st = btn("xic-ghost xic-settings", "Settings");
    st.setAttribute("data-optional", "");
    st.setAttribute("aria-haspopup", "menu");
    st.setAttribute("aria-expanded", "false");
    st.addEventListener("click", function (ev) { ev.stopPropagation(); openPop(st); });
    right.appendChild(si); right.appendChild(ac); right.appendChild(st);
    paintAccount();
  }

  function buildFooter(foot) {
    var inner = el("div", "xic-foot-in");

    var games = el("div", null, "<h2>The XI Games</h2>");
    var gl = el("ul");
    /* Named AND linked: released. A game in testing has a href and no name,
       and would otherwise have put an empty link in the footer of every page
       on the site. */
    SQUAD.filter(function (g) { return g.href && g.name; }).forEach(function (g) {
      var li = document.createElement("li");
      var a = el("a", null, g.name);
      a.href = g.href;
      li.appendChild(a);
      gl.appendChild(li);
    });
    games.appendChild(gl);

    var more = el("div", null, "<h2>More</h2>");
    var ml = el("ul");
    pagesHere().forEach(function (p) {
      var li = document.createElement("li");
      var a = el("a", null, p.name);
      a.href = p.href;
      li.appendChild(a);
      ml.appendChild(li);
    });
    more.appendChild(ml);

    inner.appendChild(games);
    inner.appendChild(more);
    inner.appendChild(el("div", "xic-note",
      "The <b>XI</b> Games &middot; unofficial football puzzles. " +
      "Not affiliated with or endorsed by any club, league, competition or " +
      "governing body."));
    foot.appendChild(inner);
  }

  /* THE SESSION IS ASKED FOR ONCE, here, and announced as "xi:session". An
     environment without fetch — an old browser, a suite driving the chrome in
     jsdom — gets a working bar with the account controls hidden, not an
     exception thrown halfway through building it. */
  var sessionAsked = false;
  function loadSession() {
    if (sessionAsked) return;
    sessionAsked = true;
    if (typeof fetch !== "function") { acct.known = true; paintAccount(); return; }
    api("/api/auth/session").then(function (d) {
      acct.known = true;
      acct.user = (d && d.user) || null;
      acct.accounts = !!(d && d.googleClientId);
      acct.googleClientId = (d && d.googleClientId) || null;
      paintAccount();
      emit("xi:session", { user: acct.user, accounts: acct.accounts });
    }).catch(function () {
      /* A failed session call is not a signed-out player; it is an unknown
         one. The controls stay hidden rather than offering a sign-in that may
         already be true. */
      acct.known = false;
      paintAccount();
    });
  }

  function init() {
    if (!document.querySelector(".xic-drawer")) buildDrawer();
    Array.prototype.forEach.call(document.querySelectorAll(".xic-bar"), fillBar);
    Array.prototype.forEach.call(document.querySelectorAll(".xic-foot"), function (f) {
      if (!f.querySelector(".xic-foot-in")) buildFooter(f);
    });
    loadSession();
    /* WARMED HERE, so the synchronous check below has an answer by the time a
       human can click anything. Fired and not awaited: the chrome must not
       hold up a page for a question that only matters when a board is
       started. */
    try { playedToday(); } catch (e) { /* a season that cannot be asked decides nothing */ }
    try { autoPlay(); } catch (e) { /* a hub link must never break a landing */ }
  }

  /* ---- ?play=1 — "Play today" from the hub, straight into the board ------
   *
   * The hub's card has three destinations and they are three different things:
   * the picture goes to the game's own home, "Past puzzles" goes to the
   * archive, and "Play today" is meant to skip the cover and start.
   *
   * IT CANNOT BE A LINK TO THE BOARD. The hub is a static file, so a direct
   * /daily/N would have to be built from the DEVICE's clock — and this
   * project's rule is that the server decides what day it is. A wrong clock
   * would link to a board that is not out yet and 403s. So the hub asks for
   * "today" in words and the landing, which already knows the day from its own
   * endpoint, does the starting.
   *
   * ONE IMPLEMENTATION, NOT TEN. Every landing already has the control: eight
   * games use `.home-choice.hero`, QuickFire uses #kickOff, and Grid has no
   * cover at all — it opens on the board, so it needs nothing and gets
   * nothing. Putting this in each game.js would be ten copies of one rule, ten
   * tags and ten deploys, which is the fault this file exists to avoid.
   *
   * THE PARAMETER IS REMOVED ONCE IT HAS FIRED. Otherwise a refresh mid-board,
   * or the back button, re-clicks a cover that is no longer there — and on a
   * game that has already started, re-clicking start is not harmless. */
  function autoPlay() {
    if (!/(^|[?&])play=1(&|$)/.test(location.search)) return;
    /* Taken out of the address first, so nothing below can fire twice. */
    try {
      var url = location.pathname + location.search.replace(/(^|[?&])play=1(&|$)/, "$1")
        .replace(/[?&]$/, "") + location.hash;
      history.replaceState(null, "", url);
    } catch (e) { /* an address that cannot be rewritten is still worth playing */ }

    /* The cover is drawn when the daily lands, which is a network round trip
       after this runs — so wait for it rather than assuming it is there. Four
       seconds of looking, then give up and leave the player on the home page,
       which is a page they asked for rather than an error. */
    var tries = 0;
    (function look() {
      var el = document.querySelector(".home-choice.hero, #kickOff");
      var shown = el && !el.hidden && el.offsetParent !== null && !el.disabled;
      if (shown) { el.click(); return; }
      if (++tries < 40) setTimeout(look, 100);
    })();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* ---- FORM, THE WAY FOOTBALL SHOWS IT --------------------------------

     Five results as W, D or L rather than a sentence. "Run of 3 · best 7" is
     a stat line; W W D W L is the same information in the language the rest
     of the family speaks, and a red L is something you want to fix tomorrow
     in a way "run of 0" is not.

     IT LIVES HERE BECAUSE BOTH GAMES DRAW IT. The thresholds are the part
     that must never disagree: a 76 that is a win on the crossword and a draw
     on the word search is the same fact told twice, and the player would be
     the one to find out. Each game still owns what a RESULT is — a numbered
     day here, a dated one there — and hands over the scores it wants shown.

     FORM_LENGTH is five, and the empty slots are drawn from the same number,
     so a new player can see the shape of what is coming rather than a blank
     box beside "play today to start one". */
  var FORM_LENGTH = 5;

  /* The band a score falls in. Stated once, as a table, so adding a band is
     one edit and not a chain of ternaries in two games. */
  var BANDS = [
    { at: 76, key: "w" },
    { at: 38, key: "d" },
    { at: 0,  key: "l" },
  ];
  function band(score) {
    var v = typeof score === "number" ? score : 0;
    for (var i = 0; i < BANDS.length; i++) if (v >= BANDS[i].at) return BANDS[i].key;
    return "l";
  }

  /* scores: most recent LAST, as a game would naturally keep them. */
  function formChips(scores) {
    var recent = (scores || []).slice(-FORM_LENGTH);
    var html = "";
    for (var i = 0; i < recent.length; i++) {
      var k = band(recent[i]);
      html += '<span class="xic-rc xic-' + k + '">' + k.toUpperCase() + "</span>";
    }
    /* Unplayed slots after the played ones, so the row is always the same
       width and the eye is not asked to re-find where form starts. */
    for (var j = recent.length; j < FORM_LENGTH; j++) {
      html += '<span class="xic-rc xic-none"></span>';
    }
    return '<span class="xic-form">' + html + "</span>";
  }

  /* ======================================================================
     CLEARING A RECORD, for the whole family.

     "Clear everything" cleared everything the CROSSWORD had written and left
     the word search, Scrambled and HiLo untouched — so a player who asked for
     a clean slate got one quarter of one, and no warning that the rest had
     survived. The server side was already right: the endpoint deletes every
     result the account holds, whatever game it came from.

     IT LIVES HERE BECAUSE IT HAS TO. The project's rule is that a game never
     writes another game's prefix, and it is a good rule — this is the one
     operation that has to reach all of them, so it belongs to the layer that
     belongs to all of them. A game asks; the chrome sweeps.

     WHAT IS A RECORD AND WHAT IS A PREFERENCE. A reset clears what you have
     DONE, never how you like the thing to look, and never who you are: the
     club you play as, the palette, the board settings and the device code all
     stay. The keeps are listed by name so each one reads as a decision rather
     than a gap, which is how the crossword's own list was written and the one
     part of it worth carrying over. */
  /* AND IT HAPPENED AGAIN, to this very list. The comment above records the
     crossword-only sweep being widened to four games; five more games have
     launched since and none of them was added. Measured 17 Sep 2026: Vowels
     (xivw.), Grid (xigd.), Codeword (xicw.), Who Am I (xiwa.) and Ballpark
     (xibp.) all write records and none was swept, so "Clear everything"
     cleared five games of ten and the hub went on lighting the other five.
     A player who asked for a clean slate got half of one, again, and again
     with no warning that the rest had survived.
     A HAND-WRITTEN LIST OF GAMES IS A LIST THAT GOES STALE AT THE NEXT LAUNCH
     — twice now — so the check moved rather than the habit: tools/aligned_test
     asserts this array holds every prefix in its GAMES table, which is the
     table a new game must be added to anyway for its integration to pass. The
     list still lives here, because a browser file cannot import one; what is
     new is that leaving a game out of it now fails a suite. */
  /* AND A THIRD TIME, from a direction the guard could not see. The sweep held
     ten GAME prefixes and the aligned_test check added last time asserts it
     holds every prefix in the GAMES table — so a missing GAME is now caught.
     The season is not a game. It lives at xi.season.v1, a FAMILY-level key,
     has no row in GAMES, and was therefore invisible to both the sweep and the
     check written to protect the sweep. Reported 17 Sep 2026: "if i click clear
     all on the admin panel i still see my season stats on the home page".

     SO THE FAMILY PREFIX IS SWEPT TOO, and the polarity is inverted with it.
     Before, a key was kept unless it was listed for clearing, so anything new
     survived a reset in silence. Now everything under xi. is CLEARED unless it
     is named in RECORD_KEEP — so the next family-level record is cleared by
     existing, and the next family-level PREFERENCE fails a suite until somebody
     classifies it. A list that forgets should forget in the safe direction. */
  var RECORD_PREFIXES = ["fcw.", "xiws.", "xisc.", "xihl.", "xivw.",
                         "xigd.", "qfx.", "xicw.", "xiwa.", "xibp.", "xi."];
  var RECORD_KEEP = [
    /* Identity. Wiping this would cut the player off from results already
       synced to their account, which clearing local history has no business
       doing. */
    "xi.deviceCode", "fcw.deviceCode",
    /* THE ENTRANT KEY IS IDENTITY, not a record. It names a PERSON in a
       challenge table, and xi-challenge.js says why a new one is worse than
       none: re-keying silently gives somebody a second entry in a table they
       are already in. Adopted from fcw.entrant for exactly that reason. */
    "xi.entrant", "fcw.entrant",
    /* Campaign attribution, which the player never chose and clearing would
       only corrupt reporting for. A reset clears what you have DONE; how you
       arrived is neither that nor a preference. */
    "xi.attr", "fcw.attr",
    /* Who you play as, family-wide and per game. */
    "xi.club", "fcw.clubPref",
    /* How it looks and plays. */
    "xi.theme", "fcw.theme", "fcw.pitch", "fcw.bank", "fcw.skip", "fcw.fxmode",
    "fcw.filter", "xiws.zoom", "xisc.zoom", "xihl.zoom",
  ];
  function clearRecords() {
    var doomed = [], i, k;
    try {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if (!k || RECORD_KEEP.indexOf(k) !== -1) continue;
        for (var j = 0; j < RECORD_PREFIXES.length; j++) {
          if (k.indexOf(RECORD_PREFIXES[j]) === 0) { doomed.push(k); break; }
        }
      }
      /* Collected first, removed after: removing inside the loop shifts every
         later index and skips half of them. The crossword's sweep learned
         that the hard way and the comment went with the code. */
      doomed.forEach(function (key) { localStorage.removeItem(key); });
    } catch (e) { /* storage blocked: nothing was written, nothing to clear */ }
    return doomed.length;
  }

  /* ======================================================================
     THE PERMALINK, on the client — the same shape functions/_lib/permalink.js
     keeps on the server, said once here rather than four times.

     Reading it was already done in all four games; WRITING it was not, which
     is why opening a board from the archive left the address bar saying
     /football/crossword/ and gave the player nothing to copy. A board that can be
     addressed should say its address while you are on it.

     replaceState, not pushState: the page is not re-rendered by going back,
     so an entry per board would leave the back button walking through URLs
     the page ignores. One entry, and back leaves the game as it always did.

     Today's board is deliberately NOT given a number. Somebody who asked for
     "today" gets /<game>/daily or the game's front page; the number is what
     the archive is for. */
  var PERMA = /\/daily(?:\/([^/?#]+))?\/?$/;
  function permaRead() {
    var m = PERMA.exec(location.pathname || "");
    return m && m[1] ? decodeURIComponent(m[1]) : null;
  }
  function permaWrite(path) {
    try {
      if (location.pathname === path) return;
      history.replaceState(null, "", path + (location.search || "") + (location.hash || ""));
    } catch (e) { /* a browser that will not have it keeps the address it has */ }
  }
  /* ARRIVING AT AN OLD BOARD FROM A LINK.
     Somebody who picked a board out of the archive knows how old it is —
     they were just looking at the list. Somebody who followed a link from a
     thread posted last Tuesday does not, and the board gives no sign: it
     plays exactly like today's. So a line, once, only when the page was
     OPENED at a permalink, saying how old the board is and offering today's.
     Not a toast: this is a fact about what you are looking at for as long as
     you are looking at it, and a message that fades is one you can miss. */
  function permaAged(game, days) {
    if (!game || !(days > 0) || document.querySelector(".xic-aged")) return;
    var bar = document.querySelector(".xic-bar");
    if (!bar || !bar.parentNode) return;
    var box = el("div", "xic-aged");
    var says = days === 1 ? "yesterday's puzzle" : "a puzzle from " + days + " days ago";
    box.innerHTML = '<span>You followed a link to ' + says +
      '. It is yours to play, and it does not count towards a run.</span>';
    var go = el("a", "xic-aged-go", "Play today's");
    /* THE GAME'S PATH, ASKED OF THE SQUAD. This built "/" + game + "/daily",
       which was the address until the games moved under a theme and is
       /football/crossword/daily now. The squad list above already holds every
       game's href — one statement of where a game lives — so this reads it
       rather than adding a second, and it follows the day a game changes
       theme. */
    go.href = pathOfGame(game) + "daily";
    box.appendChild(go);
    var x = btn("xic-aged-x", "&times;");
    x.setAttribute("aria-label", "Dismiss");
    x.addEventListener("click", function () { box.remove(); });
    box.appendChild(x);
    bar.parentNode.insertBefore(box, bar.nextSibling);
  }

  /* THE GAME'S PATH, ASKED OF THE SQUAD — the same fix permaAged already
     carried and these two were missed by. They built "/" + game + "/daily/",
     which was the address until the games moved under a theme on 5 September
     2026, so opening an archive board rewrote a correct
     /football/hilo/daily/9 into /hilo/daily/9: an address that still works,
     because old paths 301, but that is the OLD one, shown in the bar for
     copying and put into history for the back button. A redirect is not a
     name. Found while moving the permalinks onto board numbers; the theme
     move's own sweep could not see it because neither line writes the path
     literally. */
  function permaShow(game, key) {
    if (!game || !key) return;
    permaWrite(pathOfGame(game) + "daily/" + encodeURIComponent(key));
  }
  /* Off a numbered address and back to the game's own. Called when today's
     board is opened, and does nothing anywhere else — leaving /<game>/daily
     alone, which is a name for today and correct as it stands. */
  function permaClear(game) {
    if (!game || !PERMA.test(location.pathname || "")) return;
    if (!permaRead()) return;
    permaWrite(pathOfGame(game));
  }

  /* Exposed for the games and the suites. account.user() is the session as
     the chrome last heard it; account.say() puts a line in the open sheet,
     which is how a game reports what it carried over after a sign-in. */
  /* ---- WHAT THE ACCOUNT SAYS HAS BEEN PLAYED TODAY ----------------------
   *
   * ONE FETCH, ONE ANSWER, FOR THE WHOLE FAMILY. Every game asked its own
   * localStorage whether today's board had been played, and the hub lit its
   * shirts the same way — which is device-local by construction. A player
   * signed in on a phone and a laptop saw a shirt on one and not the other,
   * and could play today's board twice: the second device had never heard of
   * the first, so it offered the board, banked a score the account then
   * refused, and went on showing a number nobody else could see.
   *
   * The account knew all along. /api/season already authenticates and already
   * reads season_play; it names the games now, and this is the one place that
   * asks. Cached for the life of the page, because the answer cannot change
   * without this device being the one that changed it.
   *
   * NULL IS NOT AN EMPTY LIST, and the difference is the whole point: null
   * means "not signed in, or could not ask", and a caller must then fall back
   * to its own storage rather than conclude nothing has been played. An empty
   * ARRAY means the account answered and today is untouched.
   */
  var playedPromise = null;
  var playedSnapshot = null;
  function playedToday(force) {
    if (playedPromise && !force) return playedPromise;
    playedPromise = fetch("/api/season", { headers: { accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.account) return null;      // no account: the device is all there is
        playedSnapshot = { today: d.today, games: d.todayGames || [] };
        return playedSnapshot;
      })
      .catch(function () { return null; });     // a season that cannot be read decides nothing
    return playedPromise;
  }

  /* THE SAME ANSWER, SYNCHRONOUSLY, for the checks that cannot wait. Every
     game's "have I played today" test is a synchronous read of localStorage
     inside a click handler, and rewriting five of those into promises to ask
     one question would be a large change for a small fact. So the fetch is
     started at init and this reads what came back.
   *
   * NULL MEANS "NOT KNOWN", and never "not played". Not signed in, the answer
     not yet arrived, or the request failed — in all three the caller falls
     back to its own record, which is exactly right for a signed-out player and
     is the behaviour every game already had. The window where it is null and
     an account exists is the moment between load and the season answering;
     HiLo's kick-off closes that one properly by awaiting the promise, and it
     is the pattern to copy if any other game turns out to need it. */
  function playedTodaySync() { return playedSnapshot; }

  function playedTodayHas(game) {
    return !!(playedSnapshot && playedSnapshot.games.indexOf(game) !== -1);
  }

  /* "pages" is a FUNCTION now, not a constant. It read "pages: PAGES" and PAGES
     no longer exists — which would have thrown a ReferenceError as this object
     literal was built, at module init, on every page of the site. node --check
     cannot see it: it proves a file parses, not that it runs. That is the third
     time today a name has been removed from one place and left referenced in
     another, and the second time it would have taken the whole site down. */
  window.XIChrome = { init: init, squad: SQUAD, pages: pagesHere, close: close,
    formChips: formChips, formBand: band, FORM_LENGTH: FORM_LENGTH,
    playedToday: playedToday, playedTodaySync: playedTodaySync,
    playedTodayHas: playedTodayHas,
    /* A BOARD THE PLAYER HAS TO REGISTER FOR, asked for once and answered the
       same way in every game. The archive is open for today and the week
       behind it; older boards need an account — see functions/_lib/archive.js,
       which is where the rule lives and the only place it is enforced.

       The sheet rather than a toast: this is a thing to DO, not a thing to
       notice, and the sheet is where signing in happens. The reason goes in
       the sheet's own message line so it reads as an invitation rather than
       an error somebody has to interpret. */
    archive: {
      askToRegister: function (reason) {
        openSheet();
        /* Into .xic-why, at the top, and NOT through say(): that writes to a
           line inside the signed-in half of the sheet, which is hidden for
           precisely the people this is shown to. The reason was being set on
           an element nobody could see. */
        setWhy(reason || "Sign in to play the full archive.");
      },
    },
    account: { open: openSheet, close: closeSheet, user: function () { return acct.user; },
               known: function () { return acct.known; }, available: function () { return acct.accounts; },
               say: say, deviceCode: deviceCode },
    settings: { open: openPop, close: closePop, add: addSetting },
    permalink: { read: permaRead, show: permaShow, clear: permaClear, aged: permaAged },
    records: { clear: clearRecords, prefixes: RECORD_PREFIXES, keep: RECORD_KEEP },
    addSetting: addSetting };
})();
