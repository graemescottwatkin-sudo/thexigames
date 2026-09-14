-- 036-codeword.sql — Codeword XI's tables.
--
-- A filled crossword grid with its letters replaced by numbers 1-26, three
-- starter letters given, eleven football answers and no clues. The cipher IS
-- the puzzle.
--
-- THE FOLDER THAT PRODUCED THESE MUST NEVER BE SERVED, and this table is the
-- reason it does not have to be. Every board file carries the filled grid, all
-- eleven answers and the whole cipher — it has to, because the page needs them
-- to render today's puzzle — and the producing side staged 365 of them as
-- static JSON. Anyone could have fetched daily/0200.json today and read the
-- solution to 2 April 2027; the Codeword session confirmed it by doing it.
-- That is the word search's fault of 6 September in a new costume: a queue
-- pre-filled with inventory, readable as though it had run. The whole year
-- lands HERE instead, and the route serves one board chosen by this server's
-- clock.
--
-- SCHEDULED, NOT A RING, and cw_schedule exists to say so. Crossword, Scrambled
-- and Vowels derive a board from the day by formula and cannot run out; this
-- game picks from a finite queue and CAN. Past its last day the page does not
-- error and does not blank — it clamps to the highest board it holds and serves
-- that to everyone, every day, with every health check green. Silent expiry by
-- construction. tools/runway_check.mjs asks sqlite_master for every table whose
-- name ends _schedule, so shipping this table is what puts the game in the
-- check; there is no list to add it to and no list to forget.
--
-- Applied once. Every statement is CREATE ... IF NOT EXISTS and there is
-- nothing else here, so re-running it is safe.

-- The queue. One row per board, keyed on the id the producing side assigned.
--
-- THE ID IS THE IDENTITY AND THE DATE IS DERIVED FROM IT: date = epoch + no
-- days, epoch 2026-09-14, counted in UTC. That is a fixed bijection and it is
-- why this table is keyed on `no` rather than on the date. Keying on the date
-- would invite the same arithmetic to be done again somewhere in local time,
-- which moves the boundary for everyone ahead of UTC — a bug the crossword
-- shipped once. HiLo's club boards reassign their ids at every refresh and that
-- silently moved every club URL until it was fixed on 14 September; nothing
-- renumbers here, which is what makes the id safe to key on.
CREATE TABLE IF NOT EXISTS cw_board (
  no          INTEGER PRIMARY KEY,     -- 1 upward, contiguous, assigned once
  day         TEXT NOT NULL,           -- YYYY-MM-DD, UTC, derived from `no`
  payload     TEXT NOT NULL,           -- JSON: grid, answers, cipher, hints, breaks
  updated_at  TEXT NOT NULL            -- server clock, ISO, set on every write
);

-- Which board is which day. Separate from cw_board even though the date is
-- derivable, for the reason every other game in the family has one: a calendar
-- can be re-based for a launch without the queue being re-emitted, and the
-- runway check reads THIS table rather than knowing how to do a game's date
-- arithmetic.
CREATE TABLE IF NOT EXISTS cw_schedule (
  day         TEXT PRIMARY KEY,        -- YYYY-MM-DD, UTC, the server's day
  board_no    INTEGER NOT NULL         -- the cw_board row that is that day's
);

CREATE INDEX IF NOT EXISTS idx_cw_schedule_no ON cw_schedule (board_no);
