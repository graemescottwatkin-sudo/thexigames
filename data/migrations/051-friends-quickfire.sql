-- 051 — QuickFire XI: Friends. Football QuickFire's tables (022, 035, 037,
-- 039), under fr_qf_ so neither game's rows can reach the other's: the two
-- banks' ids collide (EVT0002 is in both), and a question's id is its key.
-- Which game reads which is functions/_lib/qf-sets.js.
--
-- The owner's go, 30 Sep 2026: add QuickFire XI: Friends "the way Lightning
-- Round was added", first daily 29 Sep, reusing the football engine.
--
-- NO WEEKLY TABLES: the weekly round is football's alone, and the importer
-- refuses a Friends bank that carries one rather than dropping it unwritten.
--
-- fr_qf_round CARRIES sub_slots FROM THE START: which slot each skip was spent
-- on, in order, so a pick is judged against the question the skip put on
-- screen (qf-play.js questionInSlot). Football's qf_round gains it in 052.
--
-- Only CREATE ... IF NOT EXISTS: safe to re-run.

CREATE TABLE IF NOT EXISTS fr_qf_question (
  id            TEXT PRIMARY KEY,      -- the bank's own id: EVT0721
  answer        TEXT NOT NULL,
  answer_norm   TEXT NOT NULL,
  answer_type   TEXT NOT NULL,
  aliases       TEXT,
  clue          TEXT NOT NULL,
  source        TEXT,
  difficulty    TEXT,
  char_count    INTEGER,
  word_count    INTEGER,
  status        TEXT NOT NULL DEFAULT 'draft',  -- 'verified' is the ONLY served value
  origin        TEXT,
  verified_at   TEXT,
  option_1      TEXT NOT NULL,
  option_2      TEXT NOT NULL,
  option_3      TEXT NOT NULL,
  option_4      TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fr_qf_daily (
  play_date   TEXT PRIMARY KEY,        -- YYYY-MM-DD
  status      TEXT NOT NULL DEFAULT 'draft'   -- 'published' is the only served value
);

CREATE TABLE IF NOT EXISTS fr_qf_daily_slot (
  play_date   TEXT NOT NULL,
  slot        INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  role        TEXT NOT NULL,           -- 'xi' | 'bench' (a skip brings a bench question on)
  PRIMARY KEY (play_date, role, slot)
);

CREATE TABLE IF NOT EXISTS fr_qf_answer (
  play_id     TEXT NOT NULL,
  idx         INTEGER NOT NULL,        -- which question, 1 to 11
  question_id TEXT NOT NULL,
  pick        TEXT,                    -- NULL on a timeout
  correct     INTEGER NOT NULL,
  points      INTEGER NOT NULL,
  minute      INTEGER NOT NULL,        -- the engine's clock unit: 90 of them to a question's 30 seconds
  at_ms       INTEGER NOT NULL,
  PRIMARY KEY (play_id, idx)
);

CREATE TABLE IF NOT EXISTS fr_qf_round (
  play_id         TEXT PRIMARY KEY,
  play_date       TEXT NOT NULL,
  started_ms      INTEGER NOT NULL,
  subs_used       INTEGER NOT NULL DEFAULT 0,
  question_idx    INTEGER NOT NULL DEFAULT 0,
  question_ms     INTEGER NOT NULL DEFAULT 0,
  penalty_minutes INTEGER NOT NULL DEFAULT 0,
  sub_slots       TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_fr_qf_daily_slot_question ON fr_qf_daily_slot (question_id);
CREATE INDEX IF NOT EXISTS idx_fr_qf_question_status     ON fr_qf_question (status);
CREATE INDEX IF NOT EXISTS idx_fr_qf_round_date          ON fr_qf_round (play_date);
