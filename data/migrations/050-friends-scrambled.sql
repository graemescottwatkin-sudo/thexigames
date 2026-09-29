-- 050-friends-scrambled.sql — the boards for Scrambled XI: Friends and
-- Vowels XI: Friends.
--
-- The owner, 29 Sep 2026: "start the Friends Scrambled and Vowels build".
-- Football's boards are sc_board (023); these are the same shape in a table of
-- their own, because the two sets must never mix: sc_board is read whole and
-- its ids count football's ring, and a Friends board in it would join
-- football's daily rotation -- or, replaced whole by one importer, wipe the
-- other game's set.
--
-- One row per board, the whole board as JSON (answers included), written by
-- tools/build_scrambled_fr.js --sql from the bank that lives outside the
-- repository. Vowels XI: Friends reads the same rows, half a ring apart.
--
-- The plays themselves share sc_round and sc_solve (029) with football: a
-- Friends play token carries its own prefix (frsc:), so a round always says
-- which set its board came from.
--
-- Applied once. Only CREATE ... IF NOT EXISTS, so re-running it is safe.

CREATE TABLE IF NOT EXISTS fr_sc_board (
  id         INTEGER PRIMARY KEY,      -- the board number, as the ring counts
  title      TEXT NOT NULL,            -- the list's header: the theme
  payload    TEXT NOT NULL,            -- JSON: the whole board, answers included
  source     TEXT NOT NULL,            -- where the answers were checked
  updated_at TEXT NOT NULL             -- server clock, ISO, set on every write
);
