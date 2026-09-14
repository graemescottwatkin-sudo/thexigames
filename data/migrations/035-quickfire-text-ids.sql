-- 035-quickfire-text-ids.sql — QuickFire's ids become TEXT, and its options
-- become required.
--
-- WHY THIS EXISTS AT ALL, and it is my error rather than a change of mind.
-- 022 line 39 declared:
--
--     id INTEGER PRIMARY KEY,   -- the bank's own id; import writes it unquoted
--
-- The comment says the column holds the bank's own id. The bank's own id is
-- V30288, PL0708, EVT0004 — 1,829 of 1,924 rows are non-numeric. The comment
-- and the type were written on the same line and contradict each other, and the
-- type is the half that was wrong. A synthetic integer would have been a second
-- identity for every row: master bank's resourced.csv, CrosswordXI's
-- re-sourcing files, the options CSV and the aliases all key on that string, so
-- the real id would have been demoted to a non-key column while a made-up one
-- became the key. That is the "one fact, one place" rule inverted.
--
-- TEXT PRIMARY KEY IS THIS PROJECT'S HOUSE PATTERN, not a departure. 003-admin,
-- 005-plays, 006-themes, 012-challenges and 019-wordsearch all declare one,
-- several with comments making exactly this point — "'man-united', used in
-- URLs", "XIWS-0001", "short and URL-safe: k3f9p2". qf_question was the
-- outlier. Note that TEXT PRIMARY KEY is not the rowid alias INTEGER PRIMARY
-- KEY is, so these tables carry a real index rather than the implicit one; at
-- 1,924 rows that is a footnote.
--
-- THREE TABLES, NOT ONE, and this is the part it would be easy to get wrong.
-- qf_daily_slot.question_id and qf_week_slot.question_id are the join to
-- qf_question.id and are INTEGER too. Change the key alone and SQLite does not
-- complain — it compares a TEXT id against an INTEGER one, matches nothing, and
-- every board comes back empty. That surfaces to a player as "no board
-- published for today" rather than as a fault, which is the worst shape a bug
-- can take: silent, total, and indistinguishable from having no content.
--
-- OPTIONS BECOME NOT NULL in the same pass. That was a separate decision while
-- it was a separate migration: recreating a live table to add a constraint the
-- importer already enforces is risk without much return. A recreate is
-- happening anyway for the id, so the constraint is free, and free now is the
-- only time it is free — the window closes the moment a board exists.
--
-- IT DOES END SOMETHING THE IMPORTER CURRENTLY ALLOWS, deliberately and on the
-- owner's word: tools/import_quickfire.js permits a row with no options at all
-- ("the bank is mid-pivot and rows without them still import"). After this, a
-- row must carry four. Every one of the 1,924 questions in the feed does, and
-- the generator refuses to write the file otherwise. The alternative considered
-- and not taken was a CHECK requiring all-four-or-none, which would have kept
-- the mid-pivot allowance; it was not wanted.
--
-- SAFE TO RUN ONCE, AND ONLY ONCE. Unlike 022 this is not idempotent: it drops
-- and recreates. It is safe today because all three tables are EMPTY — verified
-- against the live database immediately before writing this, qf_question 0
-- rows — so there is nothing to preserve and no copy step to get wrong. Do not
-- re-run it after an import; it would take the bank with it.
--
-- 022 is left exactly as applied. The record of what was applied is not the
-- place to correct what should have been.

DROP TABLE IF EXISTS qf_week_slot;
DROP TABLE IF EXISTS qf_daily_slot;
DROP TABLE IF EXISTS qf_question;

-- The questions themselves. Every column as 022 wrote it except `id`, which is
-- now the type its own comment always described, and the four options, which
-- are now required.
CREATE TABLE qf_question (
  id            TEXT PRIMARY KEY,      -- the bank's own id: V30288, PL0708
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

  -- THE FOUR OPTIONS, now required. Exactly one must equal `answer`, compared
  -- against the same source the answer came from — enforced in
  -- tools/import_quickfire.js, which is the only writer. Position is NOT stored:
  -- it is derivable from that rule, and a stored copy would be a second
  -- statement of which option is correct, free to drift from the first.
  option_1      TEXT NOT NULL,
  option_2      TEXT NOT NULL,
  option_3      TEXT NOT NULL,
  option_4      TEXT NOT NULL,

  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The eleven and the bench for a day. question_id is TEXT to match the key it
-- joins to; see the note above about what happens when it does not.
CREATE TABLE qf_daily_slot (
  play_date   TEXT NOT NULL,
  slot        INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  role        TEXT NOT NULL,           -- 'xi' | 'bench'
  PRIMARY KEY (play_date, role, slot)
);

-- The week's slots. Carries a `theme` the daily does not — set for the eleven,
-- NULL for the bench, exactly as tools/import_quickfire.js emits it.
CREATE TABLE qf_week_slot (
  week_ending TEXT NOT NULL,
  slot        INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  role        TEXT NOT NULL,           -- 'xi' | 'bench'
  theme       TEXT,
  PRIMARY KEY (week_ending, role, slot)
);

-- The indexes 022 created were dropped with their tables. qf_daily and qf_week
-- are untouched, so idx_qf_question_status and the two slot indexes are
-- recreated here and nothing else is.
CREATE INDEX IF NOT EXISTS idx_qf_daily_slot_question ON qf_daily_slot (question_id);
CREATE INDEX IF NOT EXISTS idx_qf_week_slot_question  ON qf_week_slot (question_id);
CREATE INDEX IF NOT EXISTS idx_qf_question_status     ON qf_question (status);
