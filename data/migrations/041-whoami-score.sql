-- 041-whoami-score.sql — Who Am I keeps a score and the minute it was struck.
--
-- 040 gave wa_round a clock (started_ms) and a count of substitutions, and no
-- score. That was 040 written before the game had one: the design at the time
-- charged substitutions against a bench of three and counted them, and the
-- owner's actual game is a 90-minute match scoring down from 114 like every
-- other game in the family, with substitutions priced in POINTS.
--
-- WHY THE SCORE IS STORED AND NOT RECOMPUTED. A finished board's score is
-- struck from the curve at the minute it was struck. Deriving it later would
-- use TODAY's curve, so the day anybody tunes one every past board would
-- silently become a different board — the same call QuickFire's session made
-- about its scoring bands, for the same reason.
--
-- WHY IT DROPS AND RECREATES RATHER THAN ALTERING. ALTER TABLE ADD COLUMN is
-- not idempotent, and this repository's rule is that a migration must be safe
-- to re-run. THAT IS ONLY SAFE BECAUSE THE TABLE IS EMPTY, and it was checked
-- rather than assumed: SELECT COUNT(*) FROM wa_round returned 0 against
-- production immediately before this was written. Who Am I is not launched —
-- it holds no shirt, is named nowhere in served markup and is absent from the
-- hub and the sitemap — so nobody has played it. IF wa_round EVER HOLDS A
-- ROUND, THIS MIGRATION MUST NOT BE RE-RUN: it would delete somebody's board.
--
-- wa_guess is untouched and is not recreated here: it holds no score and 040's
-- shape is still right.

DROP TABLE IF EXISTS wa_round;

-- A person's attempt at one door. The clock and the score are issued HERE and
-- never sent up: a minute the client reports is a score the client chooses.
CREATE TABLE IF NOT EXISTS wa_round (
  play_id     TEXT PRIMARY KEY,
  play_date   TEXT NOT NULL,
  slot        INTEGER NOT NULL,        -- which door was chosen, 1 to 11
  started_ms  INTEGER NOT NULL,        -- kick off, by this server's clock
  -- POINTS SPENT ON SUBSTITUTIONS, not a count of them. Two substitutions —
  -- the full career and then nationality and age — priced in points off a
  -- score that is already falling. How many were taken is DERIVED from this,
  -- because rungs are bought in order and two records of one fact drift.
  subs_used   INTEGER NOT NULL DEFAULT 0,
  -- 0 while playing, 1 once the door is closed either way. A finished round is
  -- not reopened: the answer has been on the screen.
  finished    INTEGER NOT NULL DEFAULT 0,
  solved      INTEGER NOT NULL DEFAULT 0,
  -- Struck when the board closed, from the curve at that minute, less what the
  -- substitutions cost. NULL while the board is still open, because a board in
  -- play has no score — only what it is currently worth, which is not the same
  -- thing and is never stored.
  score       INTEGER,
  minute      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_wa_round_date ON wa_round (play_date);
