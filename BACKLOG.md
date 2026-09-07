# Backlog — The XI Games

What is queued, what is waiting on the owner, and what is done. One list, in
the repo, because a queue that lives in a chat session dies with it.

Rules of this file: an item says what it is, why, and what is UNDECIDED. An
open question written down is worth more than a plan built on a guess. Move an
item to **Shipped** with its tag when it lands; delete nothing.

THE NUMBERS ARE THE ORDER THINGS WERE ADDED, not an order to do them in, and
they never change. Item 5 was "move the scoring server-side" and 5a, 5b and 5c
were its three games. The gaps are the shipped ones. A number that moves is a
reference that rots — a commit message or a note saying "item 9" has to still
mean item 9 next month — so they are left alone and the list is reordered by
moving the items, not by renumbering them.

---

## Waiting on the owner

### The numbering resets to 1 when the next games land

Decided 6 Sep 2026, with the site at zero users. Every game is addressed by the
family's day number from 26 August 2026, so today is #12 in all five — one
epoch, one function, no per-game constant to keep. The owner's intent is that
when the next few games roll out, ALL of them reset to day 1 together, so the
family shares a genuine first day rather than the crossword's.

**This has to happen before there are users.** A reset renumbers every
permalink, and a permalink that moves is the one thing this whole scheme exists
to prevent. It is free today and it is a broken promise the day somebody has
posted a link. Whoever ships the next launch does the reset in the same
release: it is EPOCH in functions/_lib/daily.js and DAILY_EPOCH in
football/crossword/js/engine.js, which epoch_test pins together, and it moves
results keys with it — daily:N, sc:N and vw:N are all counted from the same
day, so they renumber too, and the rows for them will have to be migrated or
cleared. That last part is why this is cheap now and expensive later.



Nothing. Every open question has been answered — the last was where the source
press counts get read, and the answer was a table and a query until the admin
panel (item 9) has somewhere to show them.

---

## Queued

### 11. One season, at the top level — and a live table in each game

**STATE, 5 Sep 2026. Two of the three parts are done; one is left.**

- ✅ **The hub season.** Live. One result per DAY across the family, counted
  from finishes: two puzzles done is a win, one a draw, turning up and
  finishing none a defeat. The rule is `shared/xi-season.js` and
  `functions/_lib/season.js` imports that same file, so the account branch
  (server, `season_play`) and the device branch (the browser's own record)
  cannot give two answers about what a Tuesday was. `tools/season_test.mjs`,
  `season_store_test.mjs`, `season_device_test.mjs`.
- ✅ **The fake 38-game strip is out of the crossword** (v002y). It
  factorised one board's score into an invented W/D/L record across 38
  matches — exact arithmetic, still a fiction, and with a real season on the
  hub it was the second answer to "how am I doing". Gone from the engine, the
  in-play panel, the Full Time card and the CSS; the share picture is now ten
  squares showing how much of the 114 was kept. `headless_test.js` asserts the
  engine cannot export either function again.
- ✅ **The live table is shared, and Wordsearch has one** (ws v002j,
  SHARED_TAG v23). `shared/xi-table.js` is the one implementation and the
  crossword's engine delegates to it — `table_test.mjs` compares 840 tables
  between the two and they agree everywhere, so the ladder a crossword player
  watches did not change on the way out. The thirty seasons moved to
  `shared/xi-seasons.js`: 66KB fetched once for the whole family instead of
  per game. The club is `xi.club`, family-wide, so picking Everton in one
  game picks it in all of them.
- ✅ **Scrambled and Vowels have one** (sc v002i, vw v001d). Vowels is
  generated from Scrambled by `tools/build_vowels.js`, so it inherited the
  table from the same edit. The SEED IS THE BOARD'S TOKEN, not its number:
  the two games read one bank half a ring apart, so on any day they are
  different elevens sharing a number 12 — seeding on the number gave both the
  same historical season and made the two games feel like one. Owner spotted
  it before it shipped; `table_test.mjs` now checks fourteen days of both.
- ✅ **HiLo has one too** (v001t) — and it is the one game that CLIMBS.
  Every other board opens on 114 and loses points to the clock; HiLo banks up
  from nothing, so the ladder rises under the player instead of sinking.
  Eleven right at full value plus the run bonus is 114, which is why it
  belongs on the same ladder. It needed a `liveScore()` written first: the
  score was computed inline wherever it was wanted and existed nowhere by
  name.

**ITEM 11 IS DONE.** One season at the top level, no invented 38-game strip
anywhere, and a live league table in all five football games.

**There is ONE season and it belongs to the hub.** Decided 4 Sep, correcting an
earlier reading of this item: a game does not have a season of its own.

**The 38-match strip comes out of every game.** Today the crossword turns one
board's score into a fake 38-game record — 114 points is 38 matches at 3 a win,
so any score resolves to a unique W/D/L split (`seasonRecord` /
`seasonFromActions` in `football/crossword/js/engine.js`, the `#seasonPanel` strip in
`football/crossword/index.html`, and about twenty other references). All of it goes. The
word search already refused to do this and left the reason in a comment beside
its share text — "v4.3 factorised one board's score into a fake 38-game strip;
that is the fault Crossword's season rules retire, not a convention to keep."
Scrambled and HiLo never had one.

**What each game keeps instead is a live table for the board at play.** The
crossword already has it: pick your club and the board's running score moves
you up and down a real league table while you play (`#tablePanel`,
`renderLeagueRows`). That is the per-game view, and it wants rolling out to the
other three.

**What is new is one result a DAY, across the family, on the hub:**

| the day | result |
|---|---|
| finished 2 or more puzzles | **Win** |
| finished exactly 1 | **Draw** |
| started a puzzle and did not finish it, with none finished | **Loss** |
| started nothing | no fixture |

At most one win a day. Finishing one and abandoning another is still a Draw,
not a Loss — an unfinished puzzle only counts against a day with nothing
completed.

What has to be decided before this is built:

- ~~What does each game's live table rank?~~ **ANSWERED 4 Sep: it is all
  personal.** Every game scores a board out of 114, and that score gives the
  player a table position in a random season, from that one game. Nobody is
  ranked against anybody. So it is the crossword's existing mechanism lifted
  into the other four, not the challenge tables of item 6 — those stay their
  own thing. The hub is where the season lives, and the season is the daily
  W/D/L below.
- **When does a day settle?** A loss cannot be known until the day is over, so
  the result is provisional while the day runs and final at midnight UTC. The
  server decides what day it is (project law); nothing about this may be
  computed on the device.
- **What counts as started, and as finished?** The honest sources already exist
  — a play row is a start, a result row is a finish, and both are keyed per
  game in `functions/_lib/games.js`. Signed-out players have only their own
  device, so a signed-out day can only ever be that device's day.
- **Out of how many?** Four games are live, so "2 or more" is 2 of 4 today and
  2 of 5 the day a fifth launches. The rule as written does not change when a
  game launches, which is probably right, but it does get easier.

**BEFORE THERE IS A SEASON, THE HUB INVITES ONE.** Owner, 5 Sep: "there should
be a message to play your 1st game to start your season."

A player with no results has no season, and the honest empty state is not a
blank strip or a row of zeros — it is the sentence that says what starting one
takes. The season BEGINS with the first game played, so the hub says so, and
the invitation is gone the moment there is anything to show.

Three states, and the middle one is the one that is easy to forget:

  nothing played ever      "Play your first game to start your season."
  played today, no result   the day is in flight — provisional, not a fixture
                            yet, because a loss cannot be known until the day
                            is over
  a settled day or more     the season, as W/D/L

The second is why this cannot be "do they have any results": a player who
started a puzzle an hour ago has a season under way and no settled day in it,
and telling them to start one would be wrong. The invitation is for a player
with no PLAY, not for one with no result.

**WHOSE SEASON IS IT.** Owner, 5 Sep: "Per account if registered, per device
if not, unless they linked their 2 accounts with the code in settings."

That last clause resolves itself, and the resolution is worth writing down so
nobody builds a third mode for it. The device code is not an alternative to an
account — `POST /api/account/code` turns a code INTO one, `provider = 'code'`
with the code as the provider id, and `users`, `sessions` and the results pull
all work unchanged. Entering the same code on a second device makes both
devices sessions of ONE account. So "linked with the code" IS the registered
case, and the rule has two branches:

  an account   the season is the account's, from results and plays on the
               server, and it follows the player to any device they sign in on
  no account   the season is this device's, from localStorage, and it is the
               only season that device can honestly show

WHAT HAPPENS WHEN A DEVICE REGISTERS. The family already has this rule and it
is not re-invented here: first result banked wins, the account's row wins
outright on pull, unpushed local rows survive. A player with three days on a
device who then enters a code keeps those three days.

WHAT THIS COSTS TO BUILD. The hub reads five localStorage blocks today, one per
game, written out longhand — enough to dim a shirt, not enough for a season. A
season has to outlive a device, so the account branch needs the day rule applied
SERVER-side against `plays` and `results`, both already keyed per game in
`functions/_lib/games.js`. That is the new endpoint; the device branch is the
same rule applied to what the browser already has.

One fact, one place: the day rule goes in ONE module read by both the hub and
the server. It must not be written once for the page and once for the API —
and with two branches reading it, that stops being a principle and starts being
the only way the two can agree about what a Tuesday was.

**THE TWO HALVES SPLIT BY THEME, and that decides where each one lives.**
Recorded 4 Sep, when the owner said other themes are coming — Friends, Game of
Thrones — and that they will drop the 114 scoring for something more
appropriate. XI is a triple meaning and none of them is football: eleven clues,
eleven games, eleven players to a team.

- The HUB SEASON counts finishes, not points: two puzzles done is a win, one a
  draw. Nothing in that rule knows what a puzzle scores out of, so it works
  whatever a Friends crossword is marked on. It is the family-wide half.
- The PER-GAME LIVE TABLE does not. It is 114 = 38 matches at 3 points a win
  (`MAX_SCORE: 114` and `SEASON_GAMES: 38`, both in `football/crossword/js/engine.js`),
  and it puts the player in a real league season by way of their chosen club. A
  Friends crossword cannot have a position in the Premier League table.

So the live table is a FOOTBALL-THEME feature, not a family-wide one, and it
should be built as one — rolled out to the four football games and not assumed
of whatever comes next. The half that spans themes is the half that does not
depend on scoring, which is a good sign it is the right half to make universal.

### 14. Automated testing against the live site

**STATE, 5 Sep 2026.**

- ✅ **14a, /api/preflight.** Live. Walks the next fortnight of every game's
  schedule and answers with verdicts, never boards. `.github/workflows/
  nightly.yml` asks it at 01:10 UTC. **NEEDS ONE MANUAL STEP: set
  `PREFLIGHT_SECRET` as a Cloudflare Pages environment variable AND as a
  GitHub repository secret.** Until both exist the endpoint refuses everybody
  (by design — no secret configured is no access) and the nightly job fails
  loudly rather than passing on nothing.
- ✅ **14b, the bot's reasoning half.** `tools/bot_solve.mjs`, proved by
  `bot_solve_test.mjs` against real boards AND against production's own
  judge: 33 words located from the grid a browser is given, in 1ms, with no
  placements in the payload. The claim that no bot needs to be told anything
  is now checked rather than asserted — which is what keeps the bank out of
  CI on a public repo.
- ✅ **14b, the driver.** `tools/play_bot.mjs` plays ten sessions — complete
  and abandon, per game — signing in first and refusing to run if it cannot.
  **NEEDS TWO MANUAL STEPS: create a bot account from any game's Settings
  device code, put that code in the repository secret `XI_BOT_CODE`, then
  uncomment the `schedule` in `.github/workflows/playbot.yml`.** It is
  dispatch-only until then, so nothing runs red nightly while it waits.
- ⚠️ **The bot cannot produce a LOSS, and the spec assumed it would.**
  season_play is keyed (user_id, day, game), so the abandon session and the
  completion for the SAME game on the SAME day collapse into one row and the
  completion wins. Confirmed against production on the first run: ten sessions
  in, five rows out, all finished — the bot's day is a Win. The abandon still
  exercises the unfinished row in `plays`, which is what it was written for,
  but the season's loss condition is untouched by it. Exercising that needs a
  day on which the bot ONLY abandons — a weekly variant, or a second bot
  account that never finishes anything. Worth doing before anything is built
  on the loss branch; season_test.mjs proves the RULE, so what is missing is
  proof of the wiring, not of the arithmetic.
- ⬜ **Not yet: the cheating probes.** "Claim a score, claim a smaller board,
  replay a word, omit the CSRF header" — every one of those is already proved
  offline in the games' `verified_test.mjs` suites against the real handlers.
  Doing it again over the wire proves the deployment rather than the rule, so
  it is worth having and is not urgent.
- ⬜ **Not yet: a browser session.** The bot drives the API, which is what
  proves the wiring. Whether the PAGE plays is `journey_test`'s question and
  it still runs against `wrangler pages dev` rather than production.


Raised by the owner on 5 Sep: "can agent or automation be made to test the game
when these updates go live where the aim is to see if the game breaks".

**WHAT EXISTS AND WHAT DOES NOT.** Five `live_check.mjs` hit production but only
READ — grepped, they contain zero clicks and zero drags between them.
`journey_test` and `render_test` play, in a real browser for the second, but
against `wrangler pages dev` with sample data. CI runs on push and
pull_request; there is no schedule. So nothing plays the live site and nothing
runs unless somebody pushes.

**AND DEPLOYS ARE NOT THE MAIN RISK.** Every game serves a different board at
midnight UTC with no deploy at all. A malformed board, a hole in a schedule, a
board whose bonus is missing — none of that involves a code change and nothing
would catch it. On 5 Sep the HiLo journey went red at 00:06 because a new board
came round with a one-sentence subtitle; that was a fault in the check rather
than the board, but it is the class exactly: the site's behaviour changes daily
on its own.

**TWO QUESTIONS, AND ONLY ONE OF THEM NEEDS A BROWSER.**

*Are the upcoming boards good?* is a DATA question. Answer it where the data
already is: `/api/preflight`, gated by a shared secret, walking the next N days
of every game's schedule and applying the shape rules the importers already
enforce. **It returns verdicts, never boards** —

    { "checked": 70, "days": 14,
      "problems": [ { "game": "hilo", "day": "2026-09-12", "why": "no board" } ] }

no grid, no answer, no name. If that secret leaked, an attacker learns whether
the next fortnight is well-formed and nothing else. This is the higher-value
half — it catches a bad board BEFORE a player sees it — and it needs no browser
at all. Build it first.

*Does the game play?* is a browser question, and it is asked of TODAY's board,
because that is what a player gets.

**NO BOT NEEDS TO BE TOLD ANYTHING.** Every game can reach full time unaided:

  wordsearch    solves the grid — both halves are public and must be, the grid
                IS the puzzle and a word search shows its list. Demonstrated:
                all eleven located in milliseconds from the live payload.
  hilo          calls higher/lower; a wrong call still settles the row
  scrambled     buys a name reveal per slot
  vowels        the same
  crossword     reveal answer per entry, or a published answers page

Withholding the placements never made the board unsolvable by a machine. It
made the SERVER the judge, which is what makes the score mean something. A bot
that solves the grid and drags is a bot playing the game properly.

**TEN SESSIONS A NIGHT.** Per game: one that fouls a few times and then
completes, and one that starts and abandons. The first covers the escalation,
the reset and a clean finish in a single play; splitting them doubles the cost
for no coverage. The second is the only way to exercise an unfinished board —
and the LOSS condition of item 11. Roughly 20-40 seconds each, 5-7 minutes of
Actions time. Cheating is probed without a browser at all: claim a score, claim
a smaller board, replay a word, omit the CSRF header.

**SCORE VARIETY IS FREE; LOW SCORES ARE NOT.** Fouls and the bonus move the
score without moving the clock — 113 with the bonus, 103 clean, 100 with six
minutes of fouls, 93 with fifteen, all in twenty seconds. Reaching 71 means
five real minutes of play and reaching 0 means ten, per game. But the curve is
arithmetic and is already proven offline in milliseconds; what a live bot
uniquely proves is the WIRING — that production applies that rule to a real
play, on a clock it kept, against fouls it recorded. One play proves the
wiring; ten prove it ten times. So: the bot computes its expected score from
the SAME shared module the server uses and asserts production agrees to the
point. A slow run for the bottom of the curve is worth having weekly, not
nightly.

**THE BOT'S PLAYS MUST BE EXCLUDABLE FROM THE START.** Ten sessions a night is
~3,650 rows a year and half of them carry a real `srv_score` — the kind that
would sit in a challenge table once item 6 lands. One bot account, created by
DEVICE CODE rather than Google (no name, no email — exactly the "a code holds a
random string and some scores" case `functions/api/account/code.js` describes),
and every play signed in as it. Then excluding them is one `user_id`, forever,
in any table ever built. Decided before the first run, because retro-fitting it
means working out which historical rows were bots.

**REJECTED: giving a bot admin.** The owner asked whether bots could hold admin
so they could play future boards. Admin is not a "see future boards" flag — the
route also serves `plays.csv` and `reports.csv` (player data, exportable) and
accepts `featured-set`, `challenge-hide`, `reports/clear` and `replay-day`
(mutations). That credential in Actions secrets on a PUBLIC repo is one leak
away from the forward bank, a player-data export and write access. The
preflight endpoint above serves the same goal — knowing a future board is sound
— and gives up nothing if it leaks.

**REJECTED: several bots guessing differently to discover answers.**
Unnecessary, since every game completes unaided, and a fleet submitting wrong
guesses at volume against the rate limits is indistinguishable from an attack
on the service — the one traffic pattern worth being able to block cleanly.

### 6. Challenge tables, switched on per game

**Four of the five carry one, 6 Sep, and the fifth cannot yet.** The flow is
`shared/xi-challenge.js` — one implementation, wired into Scrambled, Vowels
and HiLo, with the crossword still on its own until the shared one has been
proved in three games. **The word search is blocked, for a real reason rather
than a missing button:** its free-play boards are judged BY THE PAGE. The
whole board, placements and all, is handed over on purpose — `judgedHere()`
says so — and only the daily is judged by the server. So a free board has no
score the server computed, and a challenge table is made of exactly that. The
work is to extend the server round to free play, which is the direction the
game already went for its daily; it changes how a free board is served, so it
is its own piece rather than a line in this one.

**Still open: converging the crossword.** It has its own copy of the flow
inside `crossword/js/game.js`, which is where all of this came from. Moving it
onto the shared module is the last step and deliberately not the first: it is
the one game where challenges work today.

**The server half is done, 6 Sep.** A challenge no longer belongs to the
crossword: the board it is about is derived from the play it was created from
— `plays` already records `(game, board_key)` for every game — the entry check
compares that pair rather than rebuilding `theme_id + "-" + board_no`, and what
may be challenged is "any board from the archive, never today's daily" rather
than the crossword's word `theme`. No migration: nothing new is stored.

**What is left is the client half, and two decisions are the owner's.**
Nothing offers a challenge in any game but the crossword. Switching one on is
a Challenge button at full time, the `?c=` link opening that game, and the
standings panel — which should be built ONCE in the shared layer, using the
`.xic-panel` component lifted the same day, rather than copied into four
games. The questions:

- **Which games.** Scrambled and HiLo are the natural first two: their
  catalogue boards (the finals, the club boards) are the ones somebody would
  send a friend, and both already write the server score.
- **What the table shows.** The crossword's columns are score, time and help
  taken. HiLo's help is a different thing from the crossword's checks and
  reveals, and the word search's is different again. Either the table carries
  three fixed columns and some games leave one empty, or each game names its
  own third column.

### 9. A universal admin panel

### A shipped tag is unguarded until post_deploy catches up

Found 5 Sep 2026, the hard way. The asset-hash gate refuses changed bytes
under a tag that has not moved — but only while the tag EQUALS
`LAST_SHIPPED`. Between a tag shipping and `post_deploy` recording it, that
game's assets can be changed again under the same tag and nothing objects.

It happened to HiLo the same day: v001u shipped with the board re-import, the
next commit fixed its body margin without bumping, and `?v=v001u` went on
serving the old stylesheet from every cache that already had it. The origin
had the fix; nobody who had loaded the game that day would have seen it. The
gate was green throughout.

The window is small and the consequence is a player pinned to old bytes,
which is the exact fault the tag law exists to prevent. Options: have the
gate hash assets whenever the tag is at or ahead of `LAST_SHIPPED` and keep a
second hash for "the tag as last built", or make `post_deploy` run
automatically after every deploy so the window closes itself.

### Small

- `data/migrations/README.md` points at `data/schema.sql`, which does not exist.

- **`football/crossword/headless_test.js` cannot load and runs nowhere.** It
  `require`s `./engine.js`, `./data.json` and `./seasons.json` — three paths
  the theme move invalidated — so it throws MODULE_NOT_FOUND on the first
  line. It is not in `checks.yml`, and its `.js` extension means the roster
  gate (which collects `*_test.mjs`) cannot see it either. About 1,500 lines
  of assertions that have not run since 5 Sep. Fix the three paths and add it
  to CI under its real name, or delete it — a test nobody runs is a comment,
  and this one is worse than a comment because it looks like coverage. Found
  5 Sep while taking the 38-game strip out; its season cases were updated in
  place so the file is correct when somebody revives it.

---

## Shipped

- **headless_test revived** — 7 Sep, on the owner's decision. The crossword's
  generator had been covered by nothing since the games moved under
  `football/`: the suite was written to run INSIDE the private archive and
  required `./engine.js` and `./data.json` beside itself. It now runs against a
  bank built from what this repository already ships — `sample-puzzles.js`'s 77
  real answers and every Premier League club — so CI gets 273 assertions on
  generation, numbering, validation, scoring, seasons and the clock. The 56
  that need the real bank's CONTENT skip and are counted; `--source=<archive>`
  asks them.
  **What it found the moment it ran:** ~20 assertions still described the
  scoring model that was replaced when help moved to the clock; the form
  markers were backwards (a Check is the D, a Reveal the L) and Reveal Answer
  was three marks instead of four; the streak and stats fixtures were dated
  from before the epoch reset, so every record was filtered out as late; and a
  filter that matched nothing crashed the generator with a TypeError four
  frames down, which now refuses cleanly and names the filter (crossword
  v003e).
  **And the check it was built around was vacuous.** "100 puzzles pass full
  validation" only asks whether `validatePuzzle` agrees — stubbing it to
  return `[]` left the whole suite green. There is now one that reads the grid
  back: every entry must spell its own answer out of the squares it claims.
  One wrong letter in one square is caught by that check and no other.
- **Vowels XI had never had a score verified** — 6 Sep, found while checking
  every game could carry a challenge. `/api/scrambled/finish` serves both games
  (Vowels is Scrambled's board read half a turn round) and ended its write with
  `AND game = 'scrambled'`, so a Vowels play — whose row says "vowels" —
  matched nothing. 20 plays, 0 scores on production, and the endpoint answered
  `verified: true` every time, which is why it survived. Now scoped to
  `ENGINE_GAMES.scrambled` in games.js, and it answers `verified: false` when
  the write changed nothing. The suite could not see it because its in-memory
  database ignored the WHERE clause: it models the game now, and four checks
  cover both games, a game the engine does not serve, and the honest answer.
- **10. The shared sheet/calendar CSS lift** — 6 Sep. The overlay, the card
  and the seven-column month grid were written out in the crossword's
  stylesheet and again in Scrambled's, with a third copy in Vowels because
  Vowels is generated from Scrambled. One design, three copies: 28 of 33 rules
  byte-identical once whitespace was normalised, and four of the five
  differences were ".85" against "0.85". They live once now, as `.xic-sheet*`
  and `.xic-cal*` in `shared/xi-chrome.css`.
  **The prefix is not decoration, and the name is not `sheet`.** HiLo uses
  `.sheet` for its list of calls at full time and every game loads the shared
  file, so an unprefixed `.sheet` would have turned HiLo's results list into a
  fixed full-screen overlay — and `.xic-sheet` was already taken by the account
  sheet the chrome builds. Lifting it in under that name redefined the chrome's
  and broke the mechanism that opens it; `frontend_test` caught it, because it
  looks for the account sheet by that class and suddenly found three of the
  crossword's. It is `.xic-panel*` now.
  **Left open, deliberately:** the family has two overlay components that look
  alike — the chrome's account sheet (z-index 210, neutral scrim, centred, hides
  by the `hidden` attribute) and this one (55, pitch scrim, left, hides by the
  absence of `.show`). Whether they should be one is a real question; answering
  it changes how a component on every page looks, which is not what a move
  commit should do.
  **A fourth copy turned up in the crossword's own file**: 33 lines of it sat
  inside `@media (prefers-reduced-motion:reduce)`, pasted in front of the one
  rule that query was written for. Identical values, so nothing looked wrong —
  and it would have started looking wrong for reduced-motion players only, the
  moment this lift removed the copy above it.
  Two values moved: the scrim is now a token (`--scrim`, because the shared
  layer may not keep a palette of its own) and `.xic-sheet-empty` takes the
  crossword's 6px top padding over Scrambled's 10px, which was drift rather
  than a decision. Everything else is byte-for-byte what it was.
  As the note it replaced asked: this commit is the move and nothing else.
  SHARED_TAG v28 -> v29 and every one of the seven games' tags with it, because
  a page whose bytes change must say so.
- **The schedule-assumption sweep** — 6 Sep, straight after the answers leak.
  The question asked of every date-keyed read: what does this table mean, and
  does the reader believe it? Four answers were wrong, all the same shape and
  two of them live.
  **1. The word search's free play was walled by phantom days.** `lastScheduledDay`
  measured a board's age from the newest row on or before today, in a table
  that starts eight months before the game launched — so a catalogue board
  that had never run read as 122 days old and the archive gate charged an
  account for it. 238 of 374 boards answered a signed-out player with "That
  board is more than 7 days old. Sign in to play the full archive." The
  seal let too much out; this locked too much away, from one missing fact.
  **2. Ring games charged for boards from before they launched.** A ring
  generates a board for any number, so Scrambled answers to #1-#6 and Vowels
  to #1-#9, and the gate did `today - no` without asking whether the board had
  ever been a daily. `backForBoard()` in archive.js now answers null for those,
  which flows through `beyondFreeArchive` as "not gated" — the rule that file
  already stated in words. One inaccuracy is named in the code rather than
  hidden: `/api/scrambled/daily` serves the ring both games read and the
  request does not say which is asking, so Vowels #7-#9 are still treated as
  back issues.
  **3. HiLo's archive list had the same assumption and got away with it.**
  Its schedule begins on its launch day, so the bug could not fire — luck, not
  design. Bounded anyway: a re-import reaching further back is all it would
  have taken.
  **4. Grid XI's calendar is a placeholder** starting on the day of the import,
  which is the same wrong meaning waiting to happen. `tools/import_grid.js`
  now reads `LAUNCHED.grid`, so the launch day is written once.
  Checks in `tools/gating_test.mjs` (a board that never ran has no age, per
  game, derived from LAUNCHED) and `football/hilo/api_test.mjs`; both sabotaged.
  The word search's live_check gained the proof the offline suite cannot give,
  since it stubs D1: six catalogue boards that have never run must open without
  an account. All six answered 401 before this deployed.
- **When each game launched, and the leak it was hiding** — 6 Sep. Three
  pages were reasoning about "before this game existed" with nothing to ask,
  so `LAUNCHED` now lives in `functions/_lib/games.js` beside the family list:
  crossword 26 Aug (day one), wordsearch 27 Aug, scrambled 1 Sep, hilo 3 Sep,
  vowels 4 Sep, and null for the two that have not launched. A schedule cannot
  answer it — the word search's begins eight months before the game did and
  the ring games have none.
  **What it turned up, live on production:** the word search's answers pages
  were publishing 233 boards that are dailies STILL TO COME — the eleven
  names, every placement and the secret bonus word. `ws_schedule` holds two
  years of inventory pre-filled from 1 January 2026, the seal asked for a
  board's first row in that table, and so every one of them looked months old.
  XIWS-0127 is the daily on 1 January 2027 and its answers were a public page.
  The seal now measures from a board's first day AS THE DAILY, and a board
  that has never run publishes nothing — whether free play may OPEN a board is
  a different question and is still `released()`, which is unchanged.
  Also closed with the same fact: Scrambled and Vowels published answers for
  boards 1-4, which are days neither game existed (the ring generates a board
  for any number, which is what made them look real); every game's archive
  index and the sitemap listed boards from 1, so Vowels advertised nine days
  it did not exist; and the word search's "previous puzzles" list lost the one
  remaining day it was over — the fix that comment asked for.
  Proven by sabotage in each of its four uses. The offline suite stubs D1 and
  therefore cannot catch a bound dropped from the SQL, so the word search's
  live_check gained the check that can: the index may never list more boards
  than the game has had days. It read 241 against a ceiling of 11 before this
  deployed.
- **12. The board permalink pages are no longer orphans** — 6 Sep. Gap 1 was
  already closed by the generated sitemap, which lists every board across the
  five games and nothing that 404s. Gap 2 was still open and it was the whole
  of the item: the only thing on the site linking to a board was an answers
  DETAIL page, which reaches the handful whose answers have aged past the seal
  and no more. Each game now has `/football/<game>/archive/` — every board it
  has ever had, newest first, grouped by month, each at its permanent address —
  built from `boardKeys()` in permalink.js, which is the same rule the sitemap
  uses and the route enforces, so the page cannot advertise a board the route
  would refuse. It is in every game's masthead (so every served page of that
  game links it), in the sitemap, and on both ends of the answers archive: the
  index now carries "Play this board" beside each entry and "Every board"
  beside the CTA. `tools/archive_test.mjs`, 55 checks, five sabotages; the
  crossword's live_check gained five assertions that were red against
  production before the deploy and green after. Owner's call still open and
  cheap to add later: whether the games' own static pages should carry the
  link too — that is five tag bumps, so it was not taken on unasked.
- **A suite could fail at UTC midnight, and did** — 6 Sep. Three suites that
  drive the crossword in jsdom decided what day it was themselves while the
  page decided separately, so a run across UTC midnight seeded a fixture for
  one board and opened another, and — the wider half, found the same night —
  the page falls back to LOCAL calendar days whenever it has no clock it
  trusts, which is every offline run, so a machine ahead of UTC disagreed with
  the fixtures for an hour every evening with no straddle needed. Both were
  proved rather than reasoned: red on a London wall clock at 00:45 BST, green
  under `TZ=UTC` on the same tree the same minute. `save_test`, `adopt_test`
  and `tabs_test` now take ONE reading of the clock and hand it to both sides —
  the day comes from the server's own `dailyNumber()` and every response the
  test server sends carries that instant as its `Date` header, which is the
  channel `syncServerDate` already uses. Each also asks, before anything else,
  whether the page and the fixtures agree what day it is, so the disagreement
  is named once instead of surfacing as half a dozen phantom lost saves. Green
  at UTC+14 and UTC-11; both new checks proved by sabotage. It also removed the
  epoch scraped out of `daily.js` with a regex in all three — a third and
  fourth copy of a number that already lives in two places.
- **13. The theme segment in the URL** — 5 Sep, every game moved to
  /football/<game>/, old paths 301'd with their tails, /football/ 302 to the
  hub. Where a game lives is gamePath/gameDir in permalink.js and nowhere else.
- **Sources behind a register wall** — crossword v002w, migration 030, 4 Sep.
  Needs an account, fifty a day, counted per account per UTC day.
- **Vowels XI launched** — shirt 5, `/football/vowels/`, 4 Sep. The same eleven names
  and the same bank as Scrambled, with the letters left in their own order and
  the vowels taken out. Its page, stylesheet and script are GENERATED from
  Scrambled's by `tools/build_vowels.js`, gated by `--check`, because two
  hand-maintained copies of one engine is the fault this project has paid for
  most. QuickFire moved to 6: a game in testing does not hold a shirt.
- **Sources behind a register wall** — crossword v002w, migration 030, 4 Sep.
- **HiLo's club boards, re-imported** — hilo v001q and v001r, 4 Sep. The owner
  shortened all 274 club subtitles and took the as-at date out of them, so the
  club page now carries the date once at the top and one rule per family; the
  importer refuses a club board with no `trueAsOf`; a row is a set of boards
  rather than one board, so no label is written twice; and the server stopped
  printing a row's source quote when that quote is a slice of JSON, which it is
  for every board sourced from the league's data endpoint.
- **5c. The word search's score, server-side** — wordsearch v002i, migration
  031, 5 Sep. The server judges every selection now; the board no longer
  travels with its placements and the secret no longer travels at all. Closed
  two live leaks with it: today's board was served whole by the free-play
  route, and the bonus word shipped before it was found.
- **5b. Scrambled's score, server-side** — scrambled v002g, migration 029,
  4 Sep. The server owns the clock and counts the board's own slots.
- **5a. HiLo's score, server-side** — hilo v001p, migration 028, 4 Sep.
- **Archive gating** — shared v18: today and the previous seven days are free,
  older asks for an account.
- **One share row in every game** — shared v19.
