-- 048 — Wordsearch XI: Friends. Football's word search (019 + 031), with its
-- own tables under fr_ws_ so neither game's rows can reach the other's.
--
-- The board is football's shape — a 14x12 grid, eleven words and a secret
-- bonus — and the payload is the same JSON, with one addition: every answer
-- carries a `clue`. Football lists the eleven names; this game lists eleven
-- clues ("The One with the _____", or a question from the Friends bank) and
-- the player finds the answer. So the list itself is a secret here, which it
-- is not in football, and the served board carries clues and lengths only.
--
-- Only CREATE ... IF NOT EXISTS, so it is safe to run twice.

CREATE TABLE IF NOT EXISTS fr_ws_puzzles (
  id         TEXT PRIMARY KEY,          -- FRWS-0001
  theme      TEXT NOT NULL,
  category   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ready',
  hash       TEXT NOT NULL,
  version    INTEGER NOT NULL,
  share_key  TEXT NOT NULL,
  payload    TEXT NOT NULL              -- JSON: { grid, answers[{clue,display,grid,placement}], bonus }
);

CREATE TABLE IF NOT EXISTS fr_ws_schedule (
  day        TEXT PRIMARY KEY,          -- yyyy-mm-dd, the server's UTC day
  puzzle_id  TEXT NOT NULL REFERENCES fr_ws_puzzles(id)
);
CREATE INDEX IF NOT EXISTS idx_fr_ws_schedule_puzzle ON fr_ws_schedule (puzzle_id, day);

-- The round: football's 031, the same three tables for the same reasons.
CREATE TABLE IF NOT EXISTS fr_ws_round (
  play_id     TEXT PRIMARY KEY,
  puzzle_id   TEXT NOT NULL,
  day         TEXT NOT NULL,
  started_ms  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fr_ws_find (
  play_id     TEXT NOT NULL,
  word        TEXT NOT NULL,
  is_bonus    INTEGER NOT NULL DEFAULT 0,
  at_ms       INTEGER NOT NULL,
  PRIMARY KEY (play_id, word)
);

CREATE TABLE IF NOT EXISTS fr_ws_foul (
  play_id     TEXT NOT NULL,
  idx         INTEGER NOT NULL,
  at_ms       INTEGER NOT NULL,
  PRIMARY KEY (play_id, idx)
);
