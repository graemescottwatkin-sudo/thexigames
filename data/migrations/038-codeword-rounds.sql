-- 038-codeword-rounds.sql — Codeword XI's sittings.
--
-- SEPARATE FROM 036 DELIBERATELY. 036 creates the queue and was handed to the
-- owner to apply before these tables existed, and folding them in afterwards would
-- mean the version he holds and the version in the tree are different files
-- with the same number, and whichever he ran would be the one nobody could
-- name later. A new number costs nothing and says exactly what happened.
--
-- WHY THE SERVER HAS TO OWN A ROUND AT ALL. The page cannot hold the solution
-- — cw_board.payload carries the filled grid, every answer and the cipher, and
-- publicBoard() sends none of them — so marking, revealing and scoring all
-- happen here. That was the owner's decision on 14 September 2026: family
-- standard, the same shape Grid XI and Ballpark XI already have.
--
-- Applied once. Every statement is CREATE ... IF NOT EXISTS and nothing else,
-- so re-running it is safe.

-- A sitting.
--
-- THE RATE IS STORED AND IS NOT A CONSTANT, which is the field this table
-- would not have had if the producing side had not said so. The page offers two
-- clocks — 3 real seconds to the match minute, or 20 — so the server cannot
-- turn started_ms into a match minute without knowing which. Without it every
-- score computed here would have been wrong for everyone on the slow clock,
-- silently, and in their favour or against depending on which way it guessed.
--
-- AND IT IS FIXED AT KICK-OFF. Codeword's own demo let the rate change
-- mid-match and computed the minute as elapsed/rate over the whole match, so
-- switching to the slow clock REWOUND the match clock — seventeen minutes of
-- decay handed back for one click, and the higher score with it. Settable
-- before, refused after.
CREATE TABLE IF NOT EXISTS cw_round (
  play_id       TEXT PRIMARY KEY,      -- the attempt
  board_no      INTEGER NOT NULL,      -- which board, so a round cannot change it
  day           TEXT NOT NULL,         -- the day that board was the daily
  started_ms    INTEGER NOT NULL,      -- kick off, by THIS server's clock
  rate_secs     INTEGER NOT NULL,      -- real seconds per match minute, fixed here
  subs_used     INTEGER NOT NULL DEFAULT 0,
  spent_minutes INTEGER NOT NULL DEFAULT 0,   -- charged by helpers, added to elapsed
  confirms_used INTEGER NOT NULL DEFAULT 0,   -- rate limit, eleven to a round
  -- A REPLAY IS PLAYABLE AND NOT RECORDED. Replaying a board you have finished
  -- is a good thing to allow and a bad thing to record: refusing it outright
  -- would make showing somebody the grid indistinguishable from re-running the
  -- board with the answers you just learned. scored=0 rounds compute and
  -- display a score and bank nothing.
  scored        INTEGER NOT NULL DEFAULT 1,
  finished_ms   INTEGER,               -- NULL until the whistle
  -- WHAT WAS TRUE WHEN IT WAS GIVEN. The final figures are stored rather than
  -- recomputed, because a re-derivation would use TODAY's curve: the day
  -- anybody tunes the decay, every past round would silently become a
  -- different round. Ballpark's bp_answer stores its grade for this reason.
  score         INTEGER,
  solved        INTEGER,
  result        TEXT                   -- 'W', 'D' or 'L'
);

-- A revealed number.
--
-- STORED PER NUMBER, NOT COUNTED. Revealing 14 twice must return the same
-- letter and charge once — asking twice has to tell you nothing that asking
-- once did not, and must not cost twice either. A counter would have made a
-- refresh mid-reveal cost a substitution for a letter the player already had.
CREATE TABLE IF NOT EXISTS cw_reveal (
  play_id     TEXT NOT NULL,
  n           INTEGER NOT NULL,        -- the cipher number revealed, 1..26
  letter      TEXT NOT NULL,           -- what it stood for
  at_ms       INTEGER NOT NULL,
  PRIMARY KEY (play_id, n)
);

-- A slot confirmed complete and correct.
--
-- WHY THIS IS A TABLE AND NOT A COUNT. /finish computes `solved` from these
-- rows, and a count could not say WHICH slots — which the page needs to lock
-- them, and which a re-confirm needs so it can be free. Confirming a slot that
-- is already here costs nothing and does not count against the eleven: the page
-- may legitimately re-ask after a reveal changes a square, and charging for
-- that would be charging for the same helper twice.
CREATE TABLE IF NOT EXISTS cw_solved (
  play_id     TEXT NOT NULL,
  slot        INTEGER NOT NULL,        -- index into the board's slots
  at_ms       INTEGER NOT NULL,
  PRIMARY KEY (play_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_cw_round_day ON cw_round (day);
