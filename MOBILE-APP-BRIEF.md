# The XI Games on iPhone and Android — a starting point

Written 21 September 2026. This is the message to hand a session that is going
to start the app. It is not a plan: it is what the app must not break, what it
can already use, and the decisions that have to be made by a person before any
of it is worth building.

**The uniform mobile look on the website is explicitly LATER.** The owner has
said so. Do not begin by redesigning the site — the app and the site converging
is a separate piece of work, and doing it first would block the app on a
ten-game CSS change.

---

## 1. What exists today

Ten live daily games at **thexigames.com**, plus an eleventh built and not
launched. Cloudflare Pages, a D1 database, and Functions at the repo root shared
by every game. There is no build step and no package.json — Pages must not
build.

**Do not take a count from this document.** `LAUNCHED` in
`functions/_lib/games.js` records which games are live, with a date each. This
file said FIVE for eight days after it stopped being true and a session planned
work around it. A count in a document is a measurement wearing a law's clothes.

The games are themed. The theme is the first path segment —
`/football/crossword/` — and a game's **id is not its directory**: the Friends
crossword is `crossword_fr` and lives at `friends/crossword`. One function
owns this, `gamePath()` in `functions/_lib/permalink.js`. Nothing else may
assemble a path.

---

## 2. The five laws an app must not break

These are not style preferences. Each exists because its absence cost a real
release, and an app is a new client that can break every one of them again.

**THE SERVER DECIDES WHAT DAY IT IS, in UTC.** Never compute a date on the
device and send it up. A phone an hour behind UTC decides a run was broken at
eleven in the evening. Every board, every streak and every result is dated by
the server; the client's job is to display what it is told. This is the single
easiest law for a mobile app to break, because a phone has a clock and a time
zone and both are wrong for this purpose.

**THE ANSWER NEVER REACHES THE CLIENT.** Not in the payload, not in the app
bundle, not in whatever state the screen is holding. Every game serves a public
projection — `publicPuzzle()` for the crosswords, `publicBoard()` for Codeword
and Grid, `publicPuzzle` equivalents elsewhere — that copies known-good fields
rather than deleting known-bad ones. Marking is a server call. An app that
caches a board for offline play must cache the PUBLIC board and must not
acquire the ability to mark it.

**ONE FACT, ONE PLACE.** Every major bug in this project traces to a value
computed or stored twice that drifted. An app is a second client and therefore a
second place for every rule it re-implements: scoring, what counts as played, a
streak, what day it is. Re-implement none of them. Ask the server.

**EACH GAME OWNS ITS STORAGE PREFIX.** On the web: `fcw.`, `xiws.`, `xisc.` and
so on, with family-wide facts under `xi.`. An app has its own storage and the
same rule applies — and it must decide, deliberately, whether a device that has
played on the web and then installs the app is the same player. See §5.

**A GAME THAT IS NOT LAUNCHED IS NAMED NOWHERE.** Unreleased games appear as a
shirt number and a status, never a name. An app store listing, a screenshot, or
a hardcoded game list is a new place to leak one.

---

## 3. What the app can already use

The web client is a thin layer over a real API. Most of an app already exists
server-side. Read `functions/api/` for the true surface; the shape is:

| what | endpoint |
|---|---|
| today's board | `/api/<game>/daily`, optionally `?no=N` |
| mark an answer | per game — `/api/check-answer`, `/api/grid/guess`, `/api/wordsearch/find`, … |
| finish a board | `/api/finish`, `/api/<game>/finish` |
| the season | `/api/season` — also answers which games were played today |
| sign in | `/api/auth/google`, `/api/auth/session`, `/api/auth/signout` |
| play telemetry | `/api/play` |

Two things every request needs:

- **The CSRF header `X-XI-Games: 1`.** Defined once in
  `functions/_lib/auth.js`. The legacy `X-Crossword-XI` is still accepted.
- **Session cookies**, if signed in. An app will need to decide how it holds a
  session — see §5.

`shared/xi-played.js` holds the one table of what counts as played today, per
game: the storage key, the endpoint, and the probe. An app should read the same
table rather than inventing a second one.

---

## 4. The decisions, in the order they bite

**a) Native, cross-platform, or a wrapper?**
The games are already responsive web with real phone work behind them — the
crossword's layout was rebuilt after a player could not reach the board. A
wrapper (Capacitor, or a plain WKWebView/WebView shell) would ship in days and
inherit every fix automatically. Native or React Native gives real gestures,
real offline and a real keyboard, and forks the client — which is a second place
for every rule in §2.

This is the decision everything else hangs off, and it is a product decision
rather than a technical one: **what does the app do that the website on a phone
does not?** If the honest answer is "it has an icon and sends notifications",
a wrapper plus push is the right answer and the rest of this document is small.

**b) Notifications.**
This is the strongest argument for an app existing at all — a daily game lives
or dies on returning players. It needs a server-side scheduler, per-device
tokens, and a per-player opt-in. None of that exists today. Apple and Google
both require an opt-in prompt and both penalise apps that abuse it.

**c) Offline.**
The word search's free play already works offline by design. Everything else
marks server-side, which is a deliberate anti-cheat decision and must not be
reversed for offline play. The honest offline story is: cache the public board,
let a player fill it in, submit when there is a connection. Do NOT move marking
onto the device.

**d) The stores.**
Both stores need a privacy policy (one exists at
`/football/crossword/privacy.html`), an age rating, and screenshots. Apple
rejects apps that are only a website in a shell **unless** they add native value
— notifications and offline caching usually qualify, but this is a real risk to
plan for rather than discover at review.

**e) Accounts.**
Sign-in is Google today. An app doing Google sign-in natively is a different
flow from the web's redirect. Apple requires Sign in with Apple to be offered
alongside any other social sign-in. That is a new server-side identity provider,
not a client change.

---

## 5. The trap nobody thinks of first

**A player's history lives on the device until they have an account.** Streaks,
results and season are in browser storage; the server holds them only for
signed-in players, and nothing is written for a player without an account.

So a player who has played for three weeks on the phone's browser and then
installs the app arrives as a **new player with no streak**, unless the app
either shares storage with the browser (it cannot) or the player signs in on
both (they will not know to).

That is a real and visible loss of exactly the thing a daily game is built on,
and it will be blamed on the app. It needs deciding before launch, not after.
The least-bad options are probably: prompt to sign in before installing, or
offer an explicit transfer code. Neither is free.

---

## 6. What is NOT ready, as of today

- **The Friends crossword** is built and unlaunched. It must not appear in an
  app until it launches. `friends/crossword/deploy_check.mjs` lists everything
  its launch day needs.
- **The full-time panel** — score, share and a suggested next game — is being
  built now. An app should adopt it rather than invent its own end-of-game
  screen.
- **The hub** is still the football hub at `/`. When a second theme lands, `/`
  becomes a theme picker and `/football/` becomes the football hub. An app's
  navigation should not assume today's shape.
- **A uniform mobile look across the ten games.** Explicitly later, owner's
  call. The games share tokens, chrome and a keyboard already
  (`shared/xi-tokens.css`, `shared/xi-chrome.*`, `shared/xi-keys.*`), so the
  frame is uniform and the boards are not.

---

## 7. Questions for the owner, before any code

1. **What does the app do that the phone website does not?** The answer decides
   wrapper vs native and everything after it.
2. **One app with all the games, or one per game?** The site is a family with a
   shared hub; an app per game is eleven store listings and eleven review
   queues.
3. **Notifications on day one, or later?** If day one, the server work starts
   before the app work.
4. **What happens to a signed-out player's streak when they install?** §5.
5. **Paid, free, or free with something?** Nothing in the codebase assumes a
   payment model, and adding one later touches accounts, the stores and the
   season.

---

## 8. How to start, if the answers point at a wrapper

In rough order, and none of it is a day's work:

1. Decide 7.1 and 7.2. Nothing below is safe without them.
2. Stand the site up in a WKWebView/WebView shell against production and play
   every launched game on a real device, in both orientations. Real-device
   checks find bugs suites cannot; this project treats them as real.
3. List what actually breaks. That list is the app's real backlog, and it will
   be shorter than expected and different from what anyone predicted.
4. Only then decide whether native is needed, and for which screens.

**Do not begin by writing a native crossword renderer.** The existing one has
had months of phone work — tap-to-switch-direction, the letter bank, the
keyboard, the zoom controls, a contrast fix on the clue numbers — and every bit
of it was a response to something a real player hit.
