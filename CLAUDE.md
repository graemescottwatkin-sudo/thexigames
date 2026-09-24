# CLAUDE.md — The XI Games monorepo

Read this before doing anything. It is the project's law, learned the hard way;
every rule below exists because its absence cost a real release.

## What this is

A family of football-themed daily puzzle games at **thexigames.com**, targeting
eleven titles. **Which games are live is not written here.** `LAUNCHED` in
`functions/_lib/games.js` is the one place that records it, with a date per
game — so read that rather than a count in this file. As of 21 Sep 2026 it holds
ELEVEN, Crossword XI: Friends being the eleventh and the first of a second
theme.

**AND BEING IN `LAUNCHED` IS NO LONGER THE SAME AS BEING FINDABLE**, since that
day. `UNLISTED`, beside it in the same file, names a game that is live — it
serves boards, banks results and counts a streak — and that nothing on the site
advertises: no sitemap entry, none of its board URLs, no name on the team sheet,
and the noindex stays on its page. `isListed(game)` is the two questions joined,
and it is what every surface that could disclose a game asks.

It exists because launching is FIVE things that move together and the gates
treat them that way on purpose: half-launched is the state nobody notices.
Shipping a hidden game by simply not making four of the five edits produces
exactly that tree, indistinguishable from somebody having forgotten — which is
how a noindex outlives a launch and a live game never appears in a search
result. DELETING A LINE FROM `UNLISTED` IS THE PUBLICATION: it turns the tree
red in three places at once, so the gates say what is left to do.

This line said FIVE for eight days after it stopped being true, and named the
five. Four games launched in the week it went stale, and a session on 16 Sep
planned work around it before checking. A COUNT IN A DOCUMENT IS A MEASUREMENT
WEARING A LAW'S CLOTHES: laws do not rot, measurements do, and this file is read
first by everyone. Where a number matters below, it now says how to derive it.

Cloudflare Pages + D1 (database `crosswordxi`) + Functions at the
repo root, shared by all games. The hub is `/index.html`; shared assets in
`shared/` (tokens, chrome). No package.json in the repo — Pages must not build.

**THE THEME IS THE FIRST PATH SEGMENT**, since 5 Sep 2026: other kinds of quiz
are coming — Friends, Game of Thrones — and XI never meant football. It is
three meanings: eleven clues, eleven games, eleven players to a team.

Where a game lives is ONE fact in ONE place, `functions/_lib/permalink.js`:
`gamePath(game)` for a URL, `gameDir(game)` for a file path, `THEME_OF` for the
map. Nothing else may assemble `"/" + game + "/"`. The move rewrote a hundred
literal paths across ninety files and every one of them was a place the theme
could later be wrong; the next theme is one function, not another sweep.

A game's **id is not its directory**. It is identified as `crossword` — in the
server's game list, in its results rows, in its storage prefix — and it LIVES at
`football/crossword`. They were the same word until the move and a dozen checks
assumed it. The id must not change when the theme does.

Old paths 301 to the new ones and always will: `/crossword/daily/5` is somebody's
link. `/football/` 302s to the hub — deliberately temporary, because the day a
second theme lands `/` becomes the picker and `/football/` becomes the football
hub. A 301 there would have to be un-cached from every browser that ever saw it.

## The tag law (non-negotiable)

- Versions: `vNNN` majors, minors walk the alphabet (`v001a` … `v001z < v002`).
- Each game's `deploy_check.mjs` holds `LAST_SHIPPED` (what is live) beside
  `LAST_SHIPPED_ASSETS` (a hash of the bytes it names). **A tag is burned the
  moment it ships, and a tag never goes backwards.** `LAST_PRESENTED` was
  retired in v001v: it tracked packages handed over, the zips have stopped, and
  a constant nothing moves is a comparison against nothing — the sentinel fault
  under another name.
- **Never change a tag or a `LAST_*` constant without saying so explicitly.**
- After every deploy: bump `LAST_SHIPPED` in BOTH gates to what is now live,
  commit, push. Skipping this widens the range the gate cannot refuse.
- A tag equal to `LAST_SHIPPED` is the RESTING state and passes: the tree is
  what is live. The gate refuses a tag that goes BACKWARDS, and the paired
  asset-hash check refuses changed bytes under a tag that has not moved —
  which is the half that carries the law. Until 3 Sep 2026 the gate demanded
  the tag be strictly ahead, so every commit after a post-deploy bump was red
  on every game, including games it never touched, and that red was expected
  and therefore unread.

## The deploy sequence

1. `rmdir /s /q node_modules` if present — **gates must run with no
   node_modules, no package.json, no .wrangler in the tree** (the gate checks).
2. **EVERY GAME'S GATE — one per game, and the list is the directory, not this
   sentence.** `for %g in (football\*) do node %g\deploy_check.mjs`, or read
   `dir football\*\deploy_check.mjs` and run each. Expect **0 failed** on each.
   As of 21 Sep 2026 that is ELEVEN, and the directory to read is no longer
   `football\*` alone — `friends\crossword\deploy_check.mjs` is the eleventh
   and the second theme will not be the last. `for %t in (football friends) do
   for %g in (%t\*) do node %g\deploy_check.mjs`.

   THIS SAID "there are EIGHT" while there were nine, and said seven before
   that. Every time a game launched, this number was wrong and the person
   following it ran one gate fewer than exists — which is the same fault as
   Grid XI's gate being absent from CI for a day, one level up: a gate nobody
   runs cannot refuse anything, and here the instruction itself was what
   stopped it being run. The count is derived now, so a new game is covered by
   existing, not by somebody remembering to edit this line.

   Grid XI's and Codeword XI's also
   refuse the things a LAUNCH would have to change — absence from GAMES, from
   the squad, from the sitemap — so a game cannot go live by drift. Codeword's
   adds the two refusals its own integration exists for: no board files
   committed into the tree, and a board served through `publicBoard()` carrying
   none of the filled grid, the answers or the cipher, proved by execution.
   **Until 14 September 2026 the CI block ran only SIX of these** — Grid's was
   never in it. This file said seven, the local sweep ran seven and reported
   green, and the gap was invisible from both ends. A gate nobody runs cannot
   refuse anything; when a gate is added it goes in BOTH places.
3. **Run the suites, CI-shaped.** There was no step 3 here for months and the
   gap was exactly this — on 5 Sep 2026 a push went out on green gates alone,
   and CI caught a suite the gates never run. Gates check the SHAPE of the
   tree; suites check its BEHAVIOUR, and neither substitutes for the other.
   `npm install -D jsdom acorn --no-save`, run every `*_test.mjs` from the
   repo root, then `rmdir /s /q node_modules` before going back to step 1.
   **The workflow's BUILD steps come first, and the roster is not the whole
   job.** `checks.yml` runs `tools/build_vowels.js --check`,
   `tools/build_scrambled_tester.js`, `tools/build_scrambled.js --check` and
   `tools/import_hilo.js --check` before or among the suites, and one of them
   WRITES: `scrambled-tester.html` is gitignored and rebuilt from Scrambled's
   files every run. On 6 Sep 2026 a green local sweep and a red CI differed by
   exactly that — the suite read a stale tester from a previous build while CI
   read a fresh one. Running the suites without the generators is not a
   CI-shaped run, it is a run against yesterday's artefacts.
   **And a runner has no BANK beside it.** `..\scrambledxi-source` and
   `..\crosswordxi-source` exist on the owner's machines and nowhere else, so
   generators fall back to the four-board sample in CI and a suite can pass
   here and fail there on nothing but board COUNT — the scrambled tester wraps
   the ring modulo its own set, resolving #12 with the bank and #4 without.
   To reproduce a runner, AND MIND THE LINE ENDINGS:
   `git -c core.autocrlf=false archive HEAD | tar -x -C <tmp>` and run there,
   where no bank is beside the checkout. Two red CI runs on 6 Sep 2026 were the
   same fix attempted twice without doing this once. The `-c` is not decoration
   on Windows: `git archive` applies autocrlf exactly as a checkout does, so the
   copy comes out CRLF while the runner it is imitating is LF, and the two
   generators that COMPARE TEXT rather than behaviour — `build_scrambled.js
   --check` and `build_vowels.js --check` — refuse a tree that is otherwise
   perfect. Measured 14 Sep 2026: 4,582 carriage returns in an archived
   `sc-boards.js` against none in the worktree's, reproduced on an unmodified
   HEAD that CI was green on. With the flag: "4 boards gated, and the stored
   module matches", which is what the generator's own comment always said would
   happen. A recipe that prints two reds on a good tree is as dangerous as a
   green one that proves nothing — it teaches you which reds to ignore, and the
   next real one looks the same.
   THE GENERATORS NO LONGER CARE, since 23 Sep 2026: they read text through
   `tools/text.js`, which folds CRLF to LF on the way in, so `build_vowels`,
   `build_scrambled`, `build_friendscrossword` and `build_friendswhoami` pass
   `--check` on a Windows checkout and still refuse real drift. That was
   measured on both kinds of archive, with drift appended to each output. Any
   new generator that anchors on or compares text reads it through that module
   too. The LF archive is still how to imitate a runner, because it has no
   bank beside it; line endings are just no longer the reason.
   WHICH SUITES CANNOT RUN OFFLINE IS STATED ONCE, in the rules of evidence
   below. It was stated here as well until 14 Sep 2026; the two copies
   disagreed about `journey_test`, a sweep read this one, went green over 77
   suites without running the suite that would fail, and CI caught it. Two
   copies of a skip list are two answers about what was actually run.
4. Stage BY NAME, then commit and push. Not `git add -A`: other sessions edit
   this tree, and `-A` pushes their work past gates you never ran on it.
   Watch the Actions run. **It is TWO jobs**, not thirty: `Test suites` and
   `Sixteen viewports, real browser`, which are the two in `checks.yml` and the
   only two that trigger on a push. This line said "30+ jobs" until 21 Sep
   2026, and a reader who counted jobs and saw two would reasonably conclude
   that most of CI had failed to fire and go looking for a fault that was not
   there — the stale-measurement fault pointing the other way for once, raising
   an alarm rather than hiding one.
   The thirty were STEPS, which is what you are actually watching go green:
   26 and 11 on 21 Sep 2026. `nightly.yml` and `playbot.yml` are the other two
   workflows and neither runs on push, so a push showing one workflow is
   correct and not a gap.
   THE BROWSER JOB IS THE HALF A LOCAL SWEEP CANNOT DO. `render_test`,
   `signin_test` and the crossword's `journey_test` run only there, so a green
   local sweep and a red `Sixteen viewports` is the expected shape of a
   failure, not a contradiction. A push is not verified until BOTH are green.
5. **EVERY LAUNCHED GAME'S live_check with `--expect`, one per game**, and the
   list is `dir football\*\live_check.mjs` rather than a number here — same
   reasoning as step 2, and this line was wrong in the same way, saying five
   while ten existed. Take each game's tag from its own live page rather than
   assuming they share one; they do not.
   `node football\crossword\live_check.mjs --expect vNNN` and the same for each
   — including the HEAD assertions
   (production proof of `functions/_middleware.js`). The paths are under
   `football\` since the theme move; `node crossword\live_check.mjs` is a
   file that no longer exists.
6. `node tools\post_deploy.mjs` to see what it would record, then
   `--write` to apply it; commit "LAST_SHIPPED …", push. The script DERIVES:
   it reads the tag from the live page, recomputes each game's asset hash from
   the tree, and refuses unless the live tag equals the tree's AND that game's
   live_check passes — so a bump cannot be recorded for a deploy that never
   landed. It refuses for ALL games if any one is refused. Step 5 is still
   worth running by eye; the script runs it again as evidence, not as theatre.

A red gate is a stop, not a speed bump. If a gate fails, name the failing check
and diagnose before anything ships. Never push past a red gate.

## Reviewing a deployment (what "check the deploy" means)

- Live build tags match `origin/main`: footer `buildTag`, `js/game.js?v=` on
  every live game. Game assets must match the footer; `shared/` assets carry their
  own plain `vN` lifecycle and must NOT match the game tag.
- Every live_check passes with `--expect` — one per game, and the count is the
  directory rather than a figure here.
- `results`/`plays` sanity via wrangler if relevant:
  `npx wrangler d1 execute crosswordxi --remote --command="..."`.
  **Never run a migration that is already applied** — `ALTER TABLE` is not
  idempotent. Migration state: **001–046 all applied** (as of 24 Sep 2026 —
  check production) — 035 (QuickFire text
  ids), 036 and 038 (Codeword and its rounds), 037 and 039 (QuickFire rounds
  and the wrong-pick penalty), 040 and 041 (Who Am I and its score) all landed
  between 13 and 15 Sep 2026 and this line still read "001–034" afterwards.

  **042 IS THE PROOF THAT THIS KEEPS HAPPENING.** On 20 Sep 2026 this line read
  "001–041" while 042 (`bot-plays`) was already live — verified that day against
  production: `users.is_bot`, `plays.by_bot` and `idx_plays_by_bot` all present.
  042 is the dangerous kind, two bare `ALTER TABLE ... ADD COLUMN` with no
  guard, so a reader trusting the number would have re-run it straight into an
  error on two live tables. It was found only because somebody applying 043
  stopped to check what the previous number actually was. CHECK PRODUCTION, DO
  NOT TRUST THIS SENTENCE — the query is three lines and is in this bullet.

  043 (Friends crossword: `fr_puzzles` plus the unique index
  `fr_puzzles_daily` on `(mode, daily_no)`) applied 20 Sep 2026 and verified
  from production the same minute: both objects present, seven columns,
  `pragma_index_list` reporting `unique: 1`, zero rows. It is one
  `CREATE TABLE IF NOT EXISTS` and one `CREATE INDEX IF NOT EXISTS` and nothing
  else, so it is safe to re-run. The unique index is not decoration: the
  importer re-emits every board every run, and without it `INSERT OR REPLACE`
  would insert a second copy of board 1 rather than replacing it.

  044 (Friends Who Am I: `fr_wa_card`, `fr_wa_clue`, `fr_wa_answer`,
  `fr_wa_board`, `fr_wa_door`, `fr_wa_round`, `fr_wa_guess`) applied 22 Sep
  2026 and verified from production: all seven tables present. Ten
  `CREATE ... IF NOT EXISTS` and nothing else, so it is safe to re-run. It was
  first run from the wrong folder and landed nowhere — `sqlite_master` said
  NONE while the person running it believed it done — which is why "applied"
  here means checked, not reported.
  045 (`fr_wa_daily_clue`: the DAILY rounds, verified clues only, by the
  owner's ruling of 23 Sep 2026) applied 23 Sep 2026 and verified from
  production the same minute: the table and its index `fr_wa_daily_clue_clue`
  present. One `CREATE TABLE IF NOT EXISTS` and one `CREATE INDEX IF NOT
  EXISTS`, so it is safe to re-run. The deck import that fills it followed
  and was checked too: 663 daily rows over 73 characters, and 0 daily rows
  without a matching clue.
  046 (`push_device`, `push_outbox`, `push_run`: reminders on a phone, the
  one place the site stores something for a player without an account, by
  the owner's ruling of 23 Sep 2026) applied 24 Sep 2026 from the repo root
  and verified from production the same minute: the three tables, the two
  indexes and all twelve `push_device` columns present, zero rows. Only
  `CREATE ... IF NOT EXISTS`, so it is safe to re-run, and `push_test`
  applies it twice to prove it. The sender Worker (`workers/push/`,
  `thexigames-push`, cron every 15 minutes, no public address) was deployed
  straight after it; it sends nothing until its FCM_SERVICE_ACCOUNT secret is
  set, and it writes a `push_run` row per run only once it has one.
  A STALE MIGRATION NUMBER IS THE MOST DANGEROUS FIGURE IN THIS FILE, because
  the sentence immediately before it tells you never to re-run an applied one
  and `ALTER TABLE` is not idempotent — so a reader trusting "034" could
  re-run 035 and break a live table. `dir data\migrations` is the list that
  cannot go stale; this line is a record of what has been APPLIED, which the
  directory cannot tell you, so it must be updated by hand every time one is.
  (002 was applied late,
  27 Aug; 022 was the slot 023 reserved for QuickFire XI and stayed empty for
  weeks — written and applied 13 Sep 2026, five tables and three indexes
  confirmed live, `qf_question` carrying the four option columns and the
  `status` filter that decides whether a row is ever served. It is eight
  `CREATE ... IF NOT EXISTS` and nothing else, so it is safe to re-run.
  THE TABLES ARE FULL, since 14 Sep 2026, and the three paragraphs that used to
  stand here said the opposite for a day after it stopped being true. They said
  there was no `bank.json`, that the tables were empty, and that the option
  columns were inert — all correct when written on the 13th, all false by the
  evening of the 14th, and a session on the 15th planned a day's work around
  them before checking. A stale law is worse than no law: nobody re-checks what
  the project's own file states as fact. VERIFIED from the bank on 15 Sep 2026:
  1,921 questions, 0 rows without four options, 0 rows failing the
  exactly-one-option-equals-answer rule, 89 dailies running 2026-09-14 to
  2026-12-11 with no gaps. The chain, which is four steps and only the last
  touches this repo:
  `..\..\Other\QuickfireXI\data\DAILY-BANK.xlsx` -> `scripts/build-bank-json.py`
  -> `..\..\Other\QuickfireXI\export\quickfirexi-source\bank.json` ->
  `tools/import_quickfire.js --source <that folder>` -> `data/qf-production.sql`
  -> `wrangler d1 execute --remote --file=`.
  THE OPTION COLUMNS ARE LIVE ON BOTH SIDES and the ordering that governed them
  was followed: (1) the importer refuses a row unless exactly one option equals
  `answer` — `tools/import_quickfire.js`, faulting on count, on duplicates and
  on no match; (2) `QUESTION_COLUMNS` in `functions/_lib/qfdata.js` selects
  them. Two before one would have served unvalidated options, which is a player
  pressing the right button and being told they are wrong. That risk is not
  fully retired and cannot be by code: the importer proves exactly one option
  equals the RECORDED answer, and nothing can prove a distractor is not also
  true in the world. The defence is clue specificity — "Portugal may have won
  the Nations League in 2019, but who were runners-up?" names the winner inside
  the question — and that is a property of how a clue is WRITTEN, checkable by
  nobody downstream of it.). Verified 5 Sep
  2026 against the live database: every table each migration creates exists,
  and `results.game` and `plays.game` are present for the two that only ALTER.
  031 (`ws_round`, `ws_find`, `ws_foul`) and 032 (`season_play`) confirmed
  present the same day. 033 (Grid XI: `gd_board`, `gd_schedule`, `gd_round`,
  `gd_guess`, `gd_hint`) applied 6 Sep 2026 and all five confirmed present; it
  is seven `CREATE ... IF NOT EXISTS` and nothing else, so it is safe to re-run.
  236 boards and 236 days imported the same day by `tools/import_grid.js`, and
  the calendar runs 2026-09-06 to 2027-04-29. THAT CALENDAR IS A PLACEHOLDER:
  it starts on the day of the import because the game has no page yet, and it
  must be re-imported with `--from=<launch day>` when Grid XI launches — the
  SQL clears `gd_schedule` first, so re-running it is the whole fix.
- HEAD on `/api/daily` and every game's `/…/answers/` answers 200, empty body,
  and `/api/*` carries `X-Robots-Tag: noindex`.

## Tests and gates — the rules of evidence

- **Every new check must be proven to FAIL before it is trusted.** Sabotage the
  thing it guards, watch it fail, restore. Six vacuous checks have been found
  in this project's history; this rule exists because of them.
  Proven by EXECUTION, not by parse — `node --check` proves a file parses, not
  that it runs; the crossword live_check's HEAD block shipped referencing a
  variable from the other game's file and crashed on first contact with
  production. And a check's name must not be broader than its behaviour — a
  check that samples one row while claiming to check all of them is the same
  fault quieter.
- **The live_check floors are a contract, not a formality.** `MIN_ASSERTIONS`
  in each `live_check.mjs` is the SECOND net under the completion guard: the
  end-of-run marker catches a crash, the floor catches a block that goes quiet
  without crashing. It is set BELOW the run's real count on purpose, by the
  number of assertions that can legitimately skip (a branch with nothing to
  refuse). So when assertions are added, REVIEW the floor rather than raising
  it by reflex — a floor set to the exact count flaps on a legitimate skip, and
  a floor left alone for five releases stops being able to refuse anything.
  Both floors drifted once already, in the release that introduced them.
- **A suite must not decide for itself what day it is.** The page decides from
  the server's Date header and falls back to LOCAL calendar days when it has
  none; a suite that computes the day from `Date.now()` disagrees with it
  across UTC midnight and all evening on any machine ahead of UTC, and the
  disagreement reads as lost saves. Take ONE reading, hand it to both sides
  (`save_test`, `adopt_test`, `tabs_test` pin their server's Date header to
  it), and ask first whether the page agrees. Where a zone is what is being
  proved, set `process.env.TZ` as fixture — `clock_test` does.
- **Every hash of shipped bytes normalises CRLF to LF.** What ships is what is
  in git, and a Windows checkout writes CRLF — so a hash of the working tree
  answers a different question on each machine. The five game asset hashes did
  this already; `aligned_test`'s shared hash did not, and a plain `git checkout`
  of an untouched shared file turned it red locally while CI stayed green
  (7 Sep 2026). Six places now, and any seventh must do the same.
- **A stubbed database cannot prove a query.** The suites stub D1 and the
  stubs re-apply each rule in JS, which is right — a stub that rubber-stamped
  would prove nothing — but it means a bound dropped from real SQL passes
  offline. Found on 6 Sep 2026: removing the launch bound from the word
  search's seal left its suite green. What a suite can prove is that the code
  passes the right binds and reads the results correctly; the QUERY is proved
  in a live_check, and the check should be DERIVED (the answers index may not
  list more boards than the game has had days) rather than pinned to an id.
- **Regexes cannot count and cannot catch rule-bugs.** Anything about SQL
  arity, merge behaviour, or ordering must EXECUTE the real code.
- Totals only from CI-shaped runs: suites run **from the repo root**, after
  `npm install -D jsdom acorn --no-save`, and node_modules removed again before
  gates. Suite roster is in `.github/workflows/checks.yml`; the crossword gate
  asserts every `*_test.mjs` ANYWHERE in the repo is named there, and that
  every suite the workflow names exists. It walks the tree rather than holding
  a list of folders: it held `crossword`, `wordsearch`, `tools`, and when the
  games moved under `football/` two of those three stopped resolving and were
  skipped in silence — narrowing the check to `tools/` while it still reported
  a pass. Fifty-six suites in six folders were covered by nothing for a day.
  A floor refuses a walk that finds implausibly few, because a check that
  passes when it finds no problems also passes when it finds nothing at all.
- `tools/aligned_test.mjs` is the cross-game contract. **A new game is a row in
  its GAMES table** (dir, team-sheet name, storage prefix); its failures are
  the integration checklist. Run it first when integrating a game.
- Browser suites (`render_test`, `signin_test`) run in the CI render job, not
  offline. `render_test` needs
  `BASE=http://127.0.0.1:8788/football/crossword/` against `wrangler pages dev`.
  **`journey_test` IS NOT ONE OF THEM, except the crossword's.** Grid's, HiLo's
  and Scrambled's all run offline against jsdom and pass in seconds; only
  `football/crossword/journey_test.mjs` needs the browser job. This line used to
  name all three families and that cost a red CI on 14 Sep 2026: a local sweep
  skipped `*journey_test*` on the strength of it, went green over 77 suites, and
  the push failed on an assertion in Scrambled's — which had been runnable here
  all along. A skip list copied from a sentence is a sweep that is CI-shaped in
  name only. When in doubt, run it: a suite that cannot run offline says so in
  about a second.

## One fact, one place (the project's core principle)

Every major bug traced to a value computed or stored twice that drifted.
Where facts live — extend these, never copy them:

- Games list + entry keys + `played_on`: `functions/_lib/games.js`
  (`daily:N` / `ws:YYYY-MM-DD`; a new game adds a prefix, never a column;
  game-specific facts go in `results.detail` as JSON).
- Daily key composition: `dailyKey()` in `functions/_lib/daily.js`, beside
  `ANSWERS_AFTER_DAYS` (the ONE answers window — never restate the number).
- WHEN EACH GAME LAUNCHED: `LAUNCHED` in `functions/_lib/games.js`, with
  `launchNumber()` beside it. A schedule cannot answer this — the word
  search's begins eight months before the game did, and the ring games have
  no schedule — and three pages were each guessing. Null means not launched,
  and a caller must not read that as day one.
- WHICH BOARDS EXIST: `boardKeys()` in `permalink.js` — the sitemap, each
  game's `/archive/` index and the route itself all ask it, so a ring game's
  1..today and a scheduled game's gaps have one answer. It promises nothing
  without a database (a list that 404s is worse than an empty page) where
  `ranOn` serves anyway (refusing a player who followed a link is worse).
- CSRF: `csrfOk`/`CSRF_HEADER` in `functions/_lib/auth.js` (`X-XI-Games`;
  legacy `X-Crossword-XI` accepted).
- Palette: `shared/xi-tokens.css`. Chrome (bar/drawer/footer + squad list):
  `shared/xi-chrome.{css,js}`. Games must not define `.xic-` rules or restate
  tokens — the gates check.
- localStorage: each game under its own prefix — `fcw.`, `xiws.`, `xisc.`,
  `xihl.`, `xivw.`; family-wide facts under `xi.` (`xi.theme`, `xi.attr`,
  `xi.season.v1`). Never write another game's prefix; reading one is fine and
  is how the hub knows what was played today.
- The season (one, at the top level, counting DAYS not points):
  `shared/xi-season.js` holds the rule AND the device's record, and
  `functions/_lib/season.js` imports that file rather than restating it — the
  hub computes a season for a player with no account, the server computes one
  for a player with an account, and two copies would be two answers about what
  a Tuesday was. Rows for a signed-in player: `functions/_lib/season-store.js`.
  Nothing is written for a player without an account.
- Merge rule (every game): **first result banked wins; the account's row wins
  outright on pull; unpushed local rows survive.**
- Account sync failures: log via `accountNote()`, stay caught, never surface
  to the player. A transient session failure is NOT signed-out.

## Shirt numbers

- A game takes the **next free number when it LAUNCHES**. Only a launched
  game holds a number; a game that is in build, on the drawing board or in
  testing does not, and moves down when a game ships past it. HiLo XI went
  out on 10 (its build brief said so), was renumbered to 9, and is 4 — the
  fourth game to launch — from 3 Sep 2026. **Which numbers are taken is the
  squad list in `shared/xi-chrome.js`, not a range written here**: a slot with a
  `name` is launched and a slot with a `status` is not, and the two are never
  both. This said "1 to 5" while ten were taken — it was rewritten for Vowels on
  4 Sep and then went stale through five more launches, because a range is a
  measurement and the rule underneath it is not.
  Eleven shirts PER THEME, since 21 Sep 2026: `SQUADS` in `shared/xi-chrome.js`
  is one list per theme and `themeHere()` picks the reader's. A launch pushes
  that theme's tail down one and its squad loses an unsigned slot rather than
  growing a twelfth. Football wears ten with one slot unsigned; Friends wears
  one. A NUMBER IS ONLY UNIQUE WITHIN ITS THEME — there are two number 1s and
  `aligned_test` checks uniqueness per squad, not across the family.
  An UNLISTED game's slot carries NEITHER a name NOR an href — only its shirt
  number and a status, the same shape as a game in build. `shared/xi-chrome.js`
  is downloaded by every page, so an href in it is the site stating where the
  game is, which is the one thing "not publicly visible" cannot allow. This
  file said the opposite for three hours on 21 Sep 2026, because the slot first
  shipped with a way in and no name and that WAS the pre-launch convention here
  — Ballpark sat that way for twenty-one days. The owner's ruling the same day
  changed it. Be honest about what it buys: `/friends/crossword/` is guessable,
  and this removes the site TELLING anyone, not the reachability.
  The THEME KEY still has to exist: `themeHere()` falls back to football for an
  unknown segment, so a theme with no squad shows its own players the wrong
  team sheet. `suggestNext()` requires `g.name`, so an unlisted game is never
  offered at full time — the same fact doing both jobs, rather than a second
  flag.
- The reorder is cheap and stays cheap: the number lives in the squad list in
  `shared/xi-chrome.js`, and the hub carries the strip, the card, the kit
  colour and the played-today check. Nothing else may hold a shirt number.
- Kit colours follow the GAME, not the number — `--kit-NN` is defined for the
  number a game actually wears.

## Content and safety rules

- **An unreleased game is named NOWHERE in served markup** (HTML comments
  exempt). Enforced by `chrome_test`, `aligned_test` and both live_checks.
  Unbuilt games appear only as shirt numbers + status.
- **The banks are secret.** `bank.json`, `ws-production.sql`, daily SQL files
  are gitignored and live OUTSIDE the repo
  (`..\crosswordxi-source`, `..\wordsearchxi-source`). Never commit them,
  never print answers into anything that ships. The D1 database is the only
  authoritative copy of the crossword bank — treat it accordingly.
- Answers pages: sealed until `ANSWERS_AFTER_DAYS` past a board's first day
  AS THE DAILY — which is not its first row in a schedule table. The word
  search's `ws_schedule` holds two years of inventory from 1 January 2026 and
  the game launched on 27 August, so the older rule published 233 boards that
  are dailies still to come: names, placements and the secret bonus word, live
  (found and closed 6 Sep 2026). A board that has never run publishes nothing;
  whether free play may OPEN it is a different question and still `released()`.
  Sealed/unknown/malformed ids get one identical 404 (no-store, noindex, zero
  content).
- **WORD SEARCH FREE PLAY SERVES THE SOLVED BOARD, AND THAT IS THE DECISION —
  stop reporting it as a leak.** `/api/wordsearch/puzzle` returns the raw board
  — every placement and the secret bonus word — for any id `released()` allows,
  and `released()` asks `firstScheduledDay`, which reads the pre-launch
  inventory on purpose. Free play marks finds LOCALLY (`judgedHere()` in its
  game.js), so it cannot work without them; the daily judges server-side
  through `/api/wordsearch/find` and is not affected.
  MEASURED 17 Sep 2026, and the figure everyone reaches for is the wrong one:
  it is not "233 future boards". `ws_schedule` holds 374 boards, **370 of which
  have a row after today** — the schedule is a ROTATION, so a board that has
  already run will run again. Narrowing `released()` to boards that have run
  leaves 22 boards in free play and still exposes all 22. There is no subset
  that is safe; only 4 boards in the whole bank have no future day.
  So the exposure is structural and it is accepted: anyone who opens free play
  can read a future daily. Closing it means serving `publicPuzzle` and judging
  free play through `/find` like the daily — which also ends offline free play.
  Owner's call, 17 Sep 2026: LEAVE IT. Written down here because two separate
  reviews have now found it and filed it as a leak, and the second one cost a
  day's work before anybody checked whether it was already known.
- Date/time: the SERVER decides what day it is, in UTC. Never compute a date
  client-side and send it up.

## Working style

- Root cause before solution: name the failure pattern, then fix it.
- Findings over vibes: five specific findings beat a general assessment.
- Honest failure reports — including when a check turns out vacuous.
- The repo may live at different paths per machine (OneDrive on one, `C:\Users\graem\repos\` on another); never hardcode either — resolve from the repo root.
- OneDrive hosts the repo: transient file locks happen; retry before diagnosing.
- Real-device checks (iPhone/iPad rotation) find bugs suites cannot; treat
  them as real.

## Known open items (do not "fix" without asking)

- Legal review: ON HOLD by owner decision.
- In-progress board sync: SHIPPED and confirmed on two devices (v001u).
- ~~`preview_test` exits 0 with no preview~~ — FIXED, and this line outlived it.
  Measured 16 Sep 2026: with no `crosswordxi-preview-*.html` beside the
  checkout it prints "the preview was NOT checked … this is not a pass" and
  exits **1**. The entry stayed here describing a fault that no longer existed,
  which is the mirror of the stale figures above: a known-open item nobody
  re-checks is a measurement too, and this one was telling readers a working
  check was broken. It is not in `checks.yml` and does not run in CI, which is
  separate and still true — it needs a preview file that only exists on the
  owner's machines.
