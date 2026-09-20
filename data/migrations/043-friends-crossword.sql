-- 043 — the Friends crossword's boards. The first table of the second theme.
--
-- ONE TABLE, AND DELIBERATELY NOT `puzzles`. The football crossword's bank
-- lives in `puzzles`, and the temptation is to add a column naming the theme
-- and share it. games.js states the rule the other way — "a new game adds a
-- prefix, never a column" — and beyond the rule, sharing would mean every
-- query that reads `puzzles` has to learn about themes or silently serve a
-- Friends board to a football player. A separate table cannot make that
-- mistake, and it is what every game since the first has done: ws_, gd_, qf_,
-- wa_, bp_, hl_, cw_.
--
-- WHAT A ROW IS. A whole generated board as JSON, exactly as the football
-- crossword stores one: the layout, the eleven entries, and the ANSWERS. The
-- payload is the server's copy and never leaves it whole —
-- functions/_lib/puzzle.js publicPuzzle() rebuilds a public row from named
-- fields, so anything not on its allowlist cannot reach a browser.
--
-- THAT ALLOWLIST MATTERS MORE HERE THAN IT DOES FOR FOOTBALL, and the reason
-- is worth writing down where the table is defined. A Friends clue row carries
-- a `sourceQuote`: the sentence the answer was verified against. The bank's
-- sourcing standard REFUSES any row whose answer does not appear literally in
-- that sentence, so the quote contains the answer in 3,028 of 3,053 rows as a
-- whole word, and 3,035 letters-only. A projection that deleted known-bad
-- fields would leak the day somebody added a field; one that copies known-good
-- fields cannot. publicPuzzle() is the second kind, and the importer proves it
-- by execution against the real function rather than by reading it.
--
-- NO CLUE TABLE. Boards are generated offline by tools/import_friendscrossword
-- .mjs, which owns the bank, the layout engine and the seeds. Nothing at
-- request time needs a clue that is not already inside a board, so the 3,053
-- rows stay outside this database entirely — the smallest copy of a secret is
-- the one you never made.
--
-- daily_no IS THE BOARD NUMBER, not a date. The calendar that turns a number
-- into a day is the family's, in functions/_lib/daily.js, the same arithmetic
-- the football crossword uses: a ring game resolves every number up to today.
-- Keeping the day out of the table means the run-in can be re-based without
-- rewriting a board, which is exactly what the reset of 18 September 2026 had
-- to do across the family.

CREATE TABLE IF NOT EXISTS fr_puzzles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mode        TEXT NOT NULL,           -- 'daily'; practice has no pool yet
  daily_no    INTEGER,                 -- the board number, 1-based
  daily_date  TEXT,                    -- optional, human-readable only
  payload     TEXT NOT NULL,           -- JSON: { salt, puzzle } — HOLDS ANSWERS
  clue_ids    TEXT,                    -- JSON array, so a board can be chosen
                                       -- by what a player has not seen without
                                       -- unpacking every payload
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- RE-IMPORT MUST REPLACE RATHER THAN DUPLICATE. Without this the id is the only
-- unique column, so INSERT OR REPLACE would insert a second copy of board 1 and
-- the next reader would get whichever came back first. The importer re-emits
-- every board every run, so this index is what makes that safe.
CREATE UNIQUE INDEX IF NOT EXISTS fr_puzzles_daily
  ON fr_puzzles(mode, daily_no);
