-- 022-quickfire.sql — QuickFire XI's tables.
--
-- THE SLOT WAS HELD OPEN FOR THIS. data/migrations jumps 021 -> 023 because
-- 023-scrambled-boards.sql line 3 says so: "022 IS RESERVED for QuickFire XI,
-- whose migration was named in its RUN-ME but not delivered." It has stayed
-- empty since, and the consequence is live: /football/quickfire/ is linked from
-- the hub, returns 200, and /api/quickfire/daily answers 500 with
-- "no such table: qf_daily". The page degrades politely — "Today's questions
-- didn't load. Try again in a moment." — which is a worse failure than a blunt
-- one, because it describes a TRANSIENT fault and nobody reports it. The tables
-- have never existed.
--
-- THE SCHEMA IS NOT INVENTED HERE. It is what the code already reads and
-- writes, reconciled from both ends:
--   READER  functions/_lib/qfdata.js — getDaily joins qf_daily -> qf_daily_slot
--           -> qf_question, getWeek joins qf_week -> qf_week_slot ->
--           qf_question, getPlayedQuestions selects from qf_question.
--   WRITER  tools/import_quickfire.js — its INSERT column lists are the
--           superset and are reproduced faithfully below.
-- Where the two disagree the writer wins, because a column the importer emits
-- and the table lacks is an import that fails on its first run.
--
-- Applied once. Every statement is CREATE ... IF NOT EXISTS and there is
-- nothing else here, so re-running it is safe.

-- The questions themselves.
--
-- WHY `status` IS HERE WHEN NO SELECT MENTIONS IT. qfdata.js never puts
-- q.status in its column list — it only ever FILTERS on it, at getDaily and
-- getWeek: `AND q.status = 'verified'`. So a row is invisible to the site
-- unless its status is exactly that string. A schema derived from the SELECT
-- lists alone would have omitted the one column that decides whether a question
-- is ever served. Found by grepping for q.* rather than reading QUESTION_COLUMNS.
--
-- NOTE THE TWO VOCABULARIES, deliberately different so they cannot be confused:
-- a QUESTION is 'verified', a DAY or WEEK is 'published'. One is a claim about
-- the fact; the other is a claim about the schedule.
CREATE TABLE IF NOT EXISTS qf_question (
  id            INTEGER PRIMARY KEY,   -- the bank's own id; import writes it unquoted
  answer        TEXT NOT NULL,         -- display form, e.g. "Manchester United"
  answer_norm   TEXT NOT NULL,         -- normalised for matching a typed answer
  answer_type   TEXT NOT NULL,         -- 'player' | 'club' | 'year' | 'unknown'
  aliases       TEXT,                  -- pipe-separated; accepted spellings
  clue          TEXT NOT NULL,
  source        TEXT,                  -- where the fact was opened and checked
  difficulty    TEXT,                  -- a label, not a number
  char_count    INTEGER,
  word_count    INTEGER,
  status        TEXT NOT NULL DEFAULT 'draft',  -- 'verified' is the ONLY served value
  origin        TEXT,
  verified_at   TEXT,

  -- THE FOUR OPTIONS. QuickFire is moving from typed answers to four-option
  -- presentation, and these are here rather than in a later amendment because
  -- adding them to a CREATE TABLE that does not yet exist costs a line each,
  -- while adding them afterwards costs a second migration against a live table.
  --
  -- FOUR COLUMNS, NOT ONE DELIMITED CELL, because the validation that matters is
  -- per option: exactly one must equal `answer`, and each has to be individually
  -- inspectable to check that. A pipe-separated cell makes that a parse.
  --
  -- THE TRAP THIS MUST AVOID, and it is measured rather than theoretical:
  -- Crossword XI found 116 rows where the bank's answer string and D1's
  -- disagree — bank "Man Utd", D1 "Manchester United". If the options are built
  -- from one source and the answer checked against another, a player who picks
  -- the right option is told they are wrong on roughly one question in eleven,
  -- and it reads as a broken game rather than a data problem. Import and check
  -- from the SAME source.
  option_1      TEXT,
  option_2      TEXT,
  option_3      TEXT,
  option_4      TEXT,

  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- WHICH DAY A SET OF QUESTIONS BELONGS TO. Keyed by the server's UTC day, like
-- every other scheduled game in the family.
CREATE TABLE IF NOT EXISTS qf_daily (
  play_date   TEXT PRIMARY KEY,        -- YYYY-MM-DD
  status      TEXT NOT NULL DEFAULT 'draft'   -- 'published' is the only served value
);

-- The eleven and the bench for a day. `role` separates them: 'xi' is the board,
-- 'bench' is what a substitution reaches for. Slot numbers restart per role,
-- which is why the primary key carries all three.
CREATE TABLE IF NOT EXISTS qf_daily_slot (
  play_date   TEXT NOT NULL,
  slot        INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  role        TEXT NOT NULL,           -- 'xi' | 'bench'
  PRIMARY KEY (play_date, role, slot)
);

-- The weekly round. Same shape, keyed by the week it closes.
CREATE TABLE IF NOT EXISTS qf_week (
  week_ending TEXT PRIMARY KEY,        -- YYYY-MM-DD
  label       TEXT,                    -- e.g. "The Last 7 Days"
  status      TEXT NOT NULL DEFAULT 'draft'
);

-- The week's slots. Carries a `theme` the daily does not — set for the eleven,
-- NULL for the bench, exactly as tools/import_quickfire.js emits it.
CREATE TABLE IF NOT EXISTS qf_week_slot (
  week_ending TEXT NOT NULL,
  slot        INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  role        TEXT NOT NULL,           -- 'xi' | 'bench'
  theme       TEXT,
  PRIMARY KEY (week_ending, role, slot)
);

-- The two lookups the read layer actually performs: a day's slots joined to
-- their questions, and the same for a week. Indexed on the join column rather
-- than on the key, which the primary keys above already cover.
CREATE INDEX IF NOT EXISTS idx_qf_daily_slot_question ON qf_daily_slot (question_id);
CREATE INDEX IF NOT EXISTS idx_qf_week_slot_question  ON qf_week_slot (question_id);
-- And the filter every served query applies, on a column no SELECT names.
CREATE INDEX IF NOT EXISTS idx_qf_question_status     ON qf_question (status);
