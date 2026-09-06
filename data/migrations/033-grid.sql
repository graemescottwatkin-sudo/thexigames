-- 033 — Grid XI: its boards, its calendar, and the round the server owns.
--
-- A board is eleven names locked into a small grid with NO CLUES. The only
-- thing the player is given is the board's title — "Bolton Wanderers 2011/12"
-- — and the grid starts EMPTY, on the owner's ruling of 6 September 2026.
--
-- WHICH IS WHY THIS GAME LEAKS WORSE THAN ANY OTHER IF IT LEAKS AT ALL. The
-- word search's grid is public by nature: the letters are on the page and the
-- puzzle is finding a word in them. Here every letter in the grid IS an answer,
-- so one board sent whole is the whole board solved. `payload` therefore holds
-- the answers and never leaves the server — functions/_lib/gd-board.js decides
-- what a browser is handed, and emit_boards.mjs greps every public projection
-- for every answer before a board is ever written.
--
-- Two kinds of board, one table, the same shape HiLo uses. A DAILY board is
-- one the calendar hands out on a day; the calendar is its own table keyed by
-- the day, so a day's board is a lookup rather than arithmetic and the content
-- side can re-schedule without touching a board.
--
-- WHAT A GRID XI SCORE IS MADE OF, and where each part comes from:
--
--   the turns    fifteen to start, one spent on a wrong answer and one given
--                BACK for a right one, so the budget can grow
--   the misses   every wrong submission, which is what efficiency is scaled by
--   the hints    a revealed letter, four points, and never a turn
--   the solved   an entry answered exactly
--
-- ROWS PER EVENT, NOT COUNTERS — the same argument migration 031 makes about
-- fouls, for a different reason. Turns are +1/-1 and a running total would
-- survive any order, but the board ENDS the moment the turns reach zero, so
-- when each submission happened decides which ones count at all. A counter
-- cannot say whether the twelfth guess arrived before or after the board was
-- already over, and a client that retried on a dropped connection would look
-- identical to one that kept playing past full time.
--
-- `correct` IS STORED, and is not a duplicate of the board. It is what the
-- server DECIDED at the time, which is a different fact from what the board
-- says today: a board whose name is corrected next month must not retroactively
-- change a score somebody already has. The guess text is kept beside it for the
-- same reason the word search keeps the word — a score nobody can reconstruct
-- is a score nobody can dispute.
--
-- NOTHING HERE IS KEYED ON A PLAYER. play_id comes from /api/play and is the
-- attempt, not the person; see functions/api/play.js, which is deliberately
-- anonymous.
--
-- Applied once. CREATE TABLE IF NOT EXISTS is idempotent; nothing else here.

CREATE TABLE IF NOT EXISTS gd_board (
  id          TEXT PRIMARY KEY,        -- the emitter's id, e.g. 'gx-0163'
  set_id      TEXT NOT NULL,           -- the verified set it was built from
  kind        TEXT NOT NULL,           -- 'daily' for now; 'club' when there are any
  title       TEXT NOT NULL,           -- THE ENTIRE CLUE. There is nothing else.
  rows        INTEGER NOT NULL,
  cols        INTEGER NOT NULL,
  payload     TEXT NOT NULL,           -- JSON: entries WITH answers, and crossings
  updated_at  TEXT NOT NULL            -- server clock, ISO, set on every write
);

CREATE TABLE IF NOT EXISTS gd_schedule (
  day         TEXT PRIMARY KEY,        -- YYYY-MM-DD, UTC, the server's day
  board_id    TEXT NOT NULL            -- the gd_board row that is that day's
);

CREATE TABLE IF NOT EXISTS gd_round (
  play_id     TEXT PRIMARY KEY,        -- the attempt, from /api/play
  board_id    TEXT NOT NULL,           -- which board, so the server can judge it
  day         TEXT NOT NULL,           -- the day it was the daily, YYYY-MM-DD
  started_ms  INTEGER NOT NULL         -- kick off, by this server's clock
);

CREATE TABLE IF NOT EXISTS gd_guess (
  play_id     TEXT NOT NULL,
  idx         INTEGER NOT NULL,        -- the nth submission of this round
  entry_n     INTEGER NOT NULL,        -- which of the eleven it was typed into
  guess       TEXT NOT NULL,           -- folded to A-Z, as the marker sees it
  correct     INTEGER NOT NULL,        -- what the server decided, at the time
  at_ms       INTEGER NOT NULL,
  PRIMARY KEY (play_id, idx)
);

CREATE TABLE IF NOT EXISTS gd_hint (
  play_id     TEXT NOT NULL,
  cell        TEXT NOT NULL,           -- "r,c" — the cell, because a cell can be
                                       -- revealed once however many entries own it
  at_ms       INTEGER NOT NULL,
  PRIMARY KEY (play_id, cell)
);

CREATE INDEX IF NOT EXISTS idx_gd_board_kind ON gd_board (kind);
CREATE INDEX IF NOT EXISTS idx_gd_guess_play ON gd_guess (play_id, idx);
