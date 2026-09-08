# Restarting the whole set at day one

Written 8 September 2026, at the owner's request: *"at some point i may restart
the who set of games at day 1."* Nothing here is built and nothing is decided.
It exists so the decision is made with the costs in front of you rather than
discovered halfway through.

**The short version:** three of the six games reset for the price of a re-import.
The crossword does not, because its days are NUMBERS and those numbers are in
players' results, in shared links and in the answers seals. Scrambled and Vowels
share a ring and reset together or not at all. The cheapest moment is before you
have players who care, and that is now.

---

## 1. What "day one" means, game by game

| game | a day is addressed by | reset cost |
|---|---|---|
| **Crossword XI** | `daily:14` — a NUMBER counted from an epoch | the hard one, see §2 |
| **Wordsearch XI** | `ws:2026-09-08` — a DATE | re-import the schedule |
| **HiLo XI** | `hl:2026-09-08` — a DATE | re-import the schedule |
| **Grid XI** | a date in `gd_schedule` | re-import — done twice already |
| **Scrambled XI** | `sc:7` — a ring NUMBER | see §3 |
| **Vowels XI** | `vw:7` — the same ring, half a turn round | see §3 |

Those strings are `entryKey()` in `functions/_lib/games.js`. They are what a
result row is filed under, so they are the thing a restart moves.

---

## 2. The crossword is the one that resists

Its day number comes from an epoch that exists in **two** files, deliberately:

- `EPOCH = Date.UTC(2026, 7, 26)` in `functions/_lib/daily.js` — the server's
- `DAILY_EPOCH = { y: 2026, m: 7, d: 25 }` in `football/crossword/js/engine.js`

`epoch_test.mjs` exists to check they agree, so moving one and not the other is
caught. That part is safe.

**What is not safe is everything that already holds a number:**

- **Results.** Every crossword row is filed under `daily:N`. Reset the epoch and
  `daily:14` means a different board — so a player's record says they solved a
  puzzle they never saw. There is no repair for this short of clearing the rows.
- **Permalinks.** `/football/crossword/daily/5` is a real URL and CLAUDE.md's
  standing rule is that somebody's link keeps working. After a restart it opens
  a different puzzle, silently. This is the same fault as the Grid board-id
  renumbering found on 8 September, but at site scale and on links that have
  already been shared.
- **The answers seal.** A page is published `ANSWERS_AFTER_DAYS` past the day a
  board first ran AS THE DAILY. Renumbering re-bases that clock: boards that
  have run become unrun, and — worse in the other direction — a board that has
  not run could inherit a number whose seal has already expired. That is how the
  word search published 233 future dailies in August. It must be checked, not
  assumed.

**So the crossword restart is a decision about history, not a re-import.** Two
honest options:

**A — Reset and clear.** Move both epochs, then delete every crossword row from
`results`, `plays`, `board_state`, and the challenge tables. Old permalinks are
accepted as broken. Clean, and defensible while the player count is what it is.

**B — Reset and keep, with the old numbers frozen.** Keep existing rows, and
make the new epoch produce numbers that cannot collide — start the new run at,
say, `daily:1001`. Nothing breaks, nothing is deleted, and the cost is a number
that reads oddly and a rule to remember forever. I do not recommend it.

---

## 3. Scrambled and Vowels move together

They are one ring read half a turn apart, so board 7 of one is not board 7 of the
other, and `sc_last` tracks where the ring has got to. Resetting one and not the
other would put two different elevens under one key — which is the fault the two
prefixes were introduced to prevent.

Their reset is `sc_last` plus a re-import, and it is cheap, but it is one
decision covering two games.

---

## 4. What else moves, and is easy to forget

- **`LAUNCHED`** in `functions/_lib/games.js` — the launch date of every game, in
  one place. `launchNumber()` reads it, and so do the archives, the sitemap and
  the hub. It must move with the epochs or the archive will offer days that no
  longer exist.
- **The season.** `season_play` per account, `xi.season.v1` per device. A restart
  that leaves the season alone means somebody is on matchday 12 of a competition
  whose games have all been renumbered. Clear it, or accept that.
- **The streaks**, added 8 September, derive from the same completions — so they
  follow the season and need no separate decision.
- **Client storage**, which the server cannot clear: `fcw.`, `xiws.`, `xisc.`,
  `xihl.`, `xivw.`, `xigd.`, `qfx.`, and the family keys `xi.club`, `xi.theme`,
  `xi.attr`. A returning player's device will hold saves and results for boards
  that no longer exist. Games generally ignore a save whose board does not match,
  but that is worth PROVING per game before a restart rather than after.
- **Per-game round tables**: `ws_round`/`ws_find`/`ws_foul`, `hl_round`/`hl_call`,
  `sc_round`/`sc_solve`, `gd_round`/`gd_guess`/`gd_hint`. These hold play, not
  results, and are keyed by play id — but they reference boards and days.

---

## 5. The order that works

1. **Decide the crossword question first** (§2 A or B). Everything else follows
   from it, and it is the only irreversible part.
2. **Pick the new day one** and set it everywhere: both epochs, `LAUNCHED`, and
   each game's schedule import.
3. **Clear what the decision says to clear**, in one session, with the counts
   recorded before and after.
4. **Re-import all six calendars** from the new day one.
5. **Check the seals before anything is public**: `tools/answers_test.mjs` and
   each game's live_check, then walk one board per game by hand.
6. **Then** the tag bumps, the gates and the deploy.

---

## 6. What I would want to build first, if you say yes

A dry run that reports rather than writes: given a proposed day one, print what
each game's calendar would become, which existing rows would be orphaned, and
which permalinks would change meaning. The Grid importer already does the
equivalent for one game — it refuses to move a day that has been played, and
names every day it would rewrite. The same shape, across six games, is what turns
this from a nervous afternoon into a checkable one.
