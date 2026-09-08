-- 034-ballpark.sql — Ballpark XI's tables.
--
-- Eleven questions a day, each a number found with a slider. Same 114-point
-- frame as every game in the family. Built to receive the boards produced by
-- the Ballpark content side, which are read and gated by tools/import_ballpark.js.
--
-- THE ANSWER NEVER LEAVES THIS DATABASE. The whole board, answers included,
-- lives in bp_board.payload and is graded server-side; what a browser is handed
-- is the SHAPE of a question — its text, its slider ends, its step, its unit,
-- its tolerance and whether it is strict — and never the number. The word search
-- shipped its boards whole and had two live leaks closed before its score could
-- mean anything; Grid XI was built the other way round because of it, and so is
-- this.
--
-- Applied once. Every statement is CREATE ... IF NOT EXISTS and there is nothing
-- else here, so re-running it is safe.

-- The bank. A board is a day's eleven questions and it is FROZEN once issued:
-- the content side assigns bp-0001 upward, never re-uses a number, and refuses
-- to rebuild a board that has already been issued. That guarantee is why this
-- table can be keyed on the id rather than on a position in a run.
CREATE TABLE IF NOT EXISTS bp_board (
  id          TEXT PRIMARY KEY,        -- the content side's id, 'bp-0001'
  ordinal     INTEGER NOT NULL,        -- its place in the run as issued, 1 upward
  payload     TEXT NOT NULL,           -- JSON: the eleven questions WITH answers
  updated_at  TEXT NOT NULL            -- server clock, ISO, set on every write
);

-- Which board is which day. Keyed by day like the word search's and HiLo's, so
-- the calendar can be re-based — for a launch, or for the whole family
-- restarting on one day one — without the bank being re-emitted.
CREATE TABLE IF NOT EXISTS bp_schedule (
  day         TEXT PRIMARY KEY,        -- YYYY-MM-DD, UTC, the server's day
  board_id    TEXT NOT NULL            -- the bp_board row that is that day's
);

-- A sitting. One row per attempt, so the clock a question was answered against
-- is this server's and not the browser's claim.
CREATE TABLE IF NOT EXISTS bp_round (
  play_id     TEXT PRIMARY KEY,        -- the attempt, from /api/play
  board_id    TEXT NOT NULL,           -- which board, so a round cannot change it
  day         TEXT NOT NULL,           -- the day it was the daily, YYYY-MM-DD
  started_ms  INTEGER NOT NULL,        -- kick off, by this server's clock
  clock_idx   INTEGER NOT NULL,        -- which question the clock below belongs to
  clock_ms    INTEGER NOT NULL         -- when THAT question's clock started
);
-- WHY clock_idx SITS BESIDE clock_ms AND IS NOT A COUNTER. A question's twenty
-- seconds start when it is SHOWN, so the page has to tell the server it has
-- opened one. Without the index, "open question 4" arriving twice — a refresh,
-- a double tap, a retried request — would restart the clock and hand back the
-- seconds already spent. With it, the clock only ever moves FORWARD to a
-- question later than the one it is on, so a re-open is a no-op and there is no
-- way to buy time. The same shape as gd_round's idempotent kick off, one level
-- down: there, a round cannot be started twice; here, nor can a question.

-- One locked guess. The verdict is THIS SERVER'S: the grade, the points and
-- whether it spent a substitution are all computed here from the answer, which
-- the browser has never seen.
--
-- WHY THE GRADE IS STORED AND NOT ONLY THE GUESS. A round is re-derived from
-- these rows — the score, the substitutions, whether the board is over — and a
-- re-derivation that had to re-grade would need the ladder at read time and
-- would silently change every past round the day a ladder moved. The verdict is
-- what was true when it was given.
CREATE TABLE IF NOT EXISTS bp_answer (
  play_id     TEXT NOT NULL,
  idx         INTEGER NOT NULL,        -- which question, 1 to 11
  question_id TEXT NOT NULL,           -- the question's own id, for reporting
  guess       REAL,                    -- as sent, before any judgement; NULL on a timeout
  ballparks   REAL NOT NULL,           -- how far out, in multiples of its tolerance
  grade       TEXT NOT NULL,           -- 'Bang on' .. 'Way out', the ladder's word
  points      INTEGER NOT NULL,        -- what it earned, clock included
  spent_sub   INTEGER NOT NULL,        -- 1 if this answer cost a substitution
  elapsed_ms  INTEGER NOT NULL,        -- measured here, from clock_ms
  at_ms       INTEGER NOT NULL,        -- when it was judged
  PRIMARY KEY (play_id, idx)
);

-- Narrowing the range. Its own table rather than a column on the round, because
-- it happens to a QUESTION and can happen more than once: while substitutions
-- remain it spends one, and once they are gone it costs four seconds of that
-- question's clock instead.
CREATE TABLE IF NOT EXISTS bp_narrow (
  play_id     TEXT NOT NULL,
  idx         INTEGER NOT NULL,        -- which question it was spent on
  spent_sub   INTEGER NOT NULL,        -- 1 if it cost a substitution, 0 if seconds
  lo          REAL NOT NULL,           -- the narrowed range, as it was served
  hi          REAL NOT NULL,
  at_ms       INTEGER NOT NULL,
  PRIMARY KEY (play_id, idx)
);
-- WHY THE WINDOW IS STORED AND NOT RECOMPUTED. It is placed so the answer sits
-- somewhere inside it but not at its centre — a centred window would BE the
-- answer. The demo picks that offset at random, which a server may not do: a
-- retried request would deal a second window, and two windows around one answer
-- intersect on a much smaller range than either. Stored once, returned
-- thereafter, so asking twice tells a player nothing asking once did not.

CREATE INDEX IF NOT EXISTS idx_bp_board_ordinal ON bp_board (ordinal);
