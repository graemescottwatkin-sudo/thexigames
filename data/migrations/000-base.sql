-- 000 -- the tables that were here before migrations were.
--
-- WHAT THIS IS AND WHY IT IS NUMBERED ZERO. Five tables -- clues, puzzles,
-- results, sessions, users -- predate data/migrations entirely. They were
-- created by hand against production when the crossword was the only game, and
-- until now they were defined NOWHERE in this repository. Forty-three
-- migrations existed and not one of them said what a `results` row is.
--
-- HOW THAT SURFACED, because it was invisible until something needed it. CI's
-- viewport job runs `wrangler pages dev` with no D1, so every endpoint takes
-- its "there is no database" path; binding a real one and seeding a board made
-- the board correct and broke everything else, because the other endpoints then
-- reached D1 and failed on missing tables. The fix -- create the schema empty --
-- turned out to be unavailable: the schema did not exist in the tree to create.
--
-- CAPTURED FROM PRODUCTION, NOT WRITTEN FROM MEMORY. Every statement below is
-- sqlite_master.sql as the live database reports it, on 21 September 2026, with
-- IF NOT EXISTS added so the file is safe to re-run. It is a RECORD of what is
-- already there, not a change: applying it to production does nothing, which is
-- the only safe thing for a migration numbered below one that has already run.
--
-- SCHEMA ONLY. Not one row. `clues` is the crossword's bank table and its
-- CONTENTS are the secret this project guards hardest -- the column names are
-- not. Nothing here may ever grow an INSERT.
--
-- IF A COLUMN IS ADDED TO ONE OF THESE FIVE, it goes in a NEW migration with
-- the next free number, exactly as it would for any other table. This file is
-- the starting point and is not edited again.


CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,        -- internal id, never the email
  provider      TEXT NOT NULL,           -- 'google' | 'apple' | 'email'
  provider_id   TEXT NOT NULL,           -- the provider's subject claim
  email         TEXT,                    -- may be absent or a relay address
  display_name  TEXT NOT NULL,
  club          TEXT,                    -- the club the league table plays as
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
, is_admin INTEGER DEFAULT 0, is_bot INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,          -- opaque random id, sent as a cookie
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clues (
  id            TEXT PRIMARY KEY,      -- stable id from the source bank
  game_type     TEXT NOT NULL DEFAULT 'crossword',
  category      TEXT NOT NULL,         -- e.g. "Transfers", "Grounds", "Caps"
  clue          TEXT NOT NULL,
  answer        TEXT NOT NULL,         -- display form, e.g. "Paris St Germain"
  grid          TEXT NOT NULL,         -- letters only, e.g. "PARISSTGERMAIN"
  enumeration   TEXT,                  -- e.g. "(5,2,7)"
  entity        TEXT,                  -- club or subject the clue belongs to
  difficulty    TEXT,                  -- 'Easy' | 'Medium' | 'Hard' â€” a label, not a number
  era           TEXT,                  -- "1990s".."2020s", "Timeless", "Pre-1990"
  puzzle_group  TEXT,                  -- rows that must not share a puzzle
  max_per       INTEGER DEFAULT 1,     -- 0 archives a row without deleting it
  active        INTEGER NOT NULL DEFAULT 1,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS puzzles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mode        TEXT NOT NULL,           -- 'daily' | 'practice'
  daily_no    INTEGER,                 -- set for daily, NULL for practice
  daily_date  TEXT,                    -- optional human-readable date
  category    TEXT,                    -- set only for filtered practice pools
  payload     TEXT NOT NULL,           -- JSON: { salt, poolId?, puzzle }
  clue_ids    TEXT,                    -- JSON array of the clue ids inside it,
                                       -- so a puzzle can be chosen by what the
                                       -- player has not seen without unpacking
                                       -- every payload on every request
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS results (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_token      TEXT NOT NULL,       -- 'daily:5' | 'practice:37'
  mode              TEXT NOT NULL,       -- 'daily' | 'practice'
  daily_no          INTEGER,
  played_on         TEXT,                -- local date key, for streaks
  solved            INTEGER NOT NULL DEFAULT 0,
  score             INTEGER,             -- as the client calculated it
  elapsed_seconds   INTEGER,
  checks            INTEGER DEFAULT 0,
  check_alls        INTEGER DEFAULT 0,
  revealed_letters  INTEGER DEFAULT 0,
  revealed_answers  INTEGER DEFAULT 0,
  substitutions     INTEGER DEFAULT 0,
  club              TEXT,
  season            TEXT,
  started_at        TEXT,
  completed_at      TEXT,
  source            TEXT NOT NULL DEFAULT 'live',  -- 'live' | 'migrated'
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
, game TEXT NOT NULL DEFAULT 'crossword', entry_key TEXT, detail TEXT, pauses INTEGER DEFAULT 0, paused_seconds INTEGER DEFAULT 0);


-- The indexes those tables carry, likewise as production reports them.

CREATE INDEX IF NOT EXISTS idx_clues_active   ON clues (active, max_per);

CREATE INDEX IF NOT EXISTS idx_clues_category ON clues (category);

CREATE INDEX IF NOT EXISTS idx_clues_era      ON clues (era);

CREATE UNIQUE INDEX IF NOT EXISTS idx_puzzles_daily ON puzzles (daily_no) WHERE mode = 'daily';

CREATE INDEX IF NOT EXISTS idx_puzzles_mode ON puzzles (mode, category);

CREATE UNIQUE INDEX IF NOT EXISTS idx_results_daily ON results (user_id, daily_no)
  WHERE mode = 'daily' AND daily_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_results_entry
  ON results (user_id, game, entry_key);

CREATE INDEX IF NOT EXISTS idx_results_user ON results (user_id, played_on);

CREATE INDEX IF NOT EXISTS idx_results_user_game
  ON results (user_id, game, played_on DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider ON users (provider, provider_id);
