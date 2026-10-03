-- 055-review-flags.sql — the owner's verdicts on clues and answers, from a preview.
--
-- The owner, 3 Oct 2026: "flagging clues / answers I like and don't like so it
-- can be picked up by Claude for review". Made while previewing a day before
-- it is served (/admin/<theme>/<game>/<day>): select a clue's or an answer's
-- words on the page, tap like or dislike, add a note. One row each, written
-- only through /api/admin/review-flag (admin-checked on every request), and
-- read back by tools/export_reports.mjs into the banks' inboxes.
--
-- THE ADDRESS IS THE ID, NOT THE WORDS (the bank master, 3 Oct 2026). Clues
-- are reworded in place -- 81 Friends Who Am I texts in one commit, ids
-- unchanged -- so a flag matched by its words finds nothing afterwards, or a
-- substring finds the wrong row. question_id where the page marks one
-- (data-xi-item), the whole clue as shown always, and the selected words as
-- what the owner actually objected to.
--
-- KEPT APART FROM clue_reports on purpose: those are players telling us
-- something is WRONG, this is the owner saying what is GOOD or NOT, and a
-- triage that mixed them would read a taste as a fault.
--
-- A new table and an index, both IF NOT EXISTS: safe to run twice.
CREATE TABLE IF NOT EXISTS review_flags (
  id          TEXT PRIMARY KEY,
  game        TEXT NOT NULL,               -- the game's id: quickfire, whoami_fr, ...
  day         TEXT NOT NULL,               -- the day previewed, YYYY-MM-DD
  verdict     TEXT NOT NULL,               -- 'like' | 'dislike' | 'note'
  question_id TEXT,                        -- the bank's id for the clue, where the page marks it
  clue        TEXT,                        -- the whole clue or answer the words were in, as shown
  item        TEXT,                        -- the words the owner selected, as shown
  note        TEXT,                        -- what the owner wrote, if anything
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_review_flags_created ON review_flags (created_at);
