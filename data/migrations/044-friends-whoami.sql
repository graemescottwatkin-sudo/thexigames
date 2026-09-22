-- 044 — the Friends Who Am I deck. The second game of the second theme.
--
-- WHY NOT THE wa_* TABLES. Football's Who Am I hides a FOOTBALLER behind a
-- door, and its clues are that player's attributes: nationality, position,
-- year of birth, a pre-rendered club history. wa_player has a column for each.
-- A Friends card has none of them. Its clues are twelve written sentences,
-- ordered hard to easy, and there is no attribute to reveal — the clue IS the
-- content. Adding a `theme` column to wa_player and leaving eleven football
-- columns null for every Friends row would be a table pretending to be two
-- things, which is the fault games.js already states the rule against: "a new
-- game adds a prefix, never a column".
--
-- WHAT IS SHARED IS THE MACHINERY, NOT THE STORAGE. wa_round, wa_guess and the
-- scoring in wa-play.js are about PLAYING a board — a round, a spend, a guess,
-- a score — and none of that cares what is behind the door. Those are reused.
-- This file holds only what a Friends card IS.
--
-- THE BANDING IS THE DECK'S OWN AND IS RECORDED, NOT RE-DERIVED. Clues 1-4 are
-- hard, 5-8 medium, 9-12 easy, which yields four fixed rounds that each read
-- hard to easy with no clue shared between them:
--
--     A = 1·5·9    B = 2·6·10    C = 3·7·11    D = 4·8·12
--
-- A location card may be shallower — twelve clues give four rounds, six give
-- two (A = 1·3·5, B = 2·4·6), three give one. So the round a clue belongs to
-- cannot be computed from its number alone without also knowing the card's
-- depth, and a rule that needs two facts to answer one question is a rule that
-- will be applied with one of them missing. `round_letter` is stored.

-- ---- the cards -------------------------------------------------------------
--
-- THREE DECKS IN ONE TABLE, distinguished by `deck`: the main 55 characters,
-- an expert pile of 18 for fanatics, and 30 locations played as "Where am I?".
-- One table because they are the same shape and are dealt from the same
-- rotation; a column because which deck a card is from changes whether it is
-- dealt to everybody.
CREATE TABLE IF NOT EXISTS fr_wa_card (
  id          TEXT PRIMARY KEY,        -- stable, from the folded name
  name        TEXT NOT NULL,           -- as displayed once solved
  deck        TEXT NOT NULL,           -- 'main' | 'expert' | 'location'
  -- WHAT THE DOOR SAYS BEFORE IT IS OPENED. Football's door shows a club and a
  -- leave year: enough of a hook to choose between eleven doors, not enough to
  -- name the player. A Friends door needs the same kind of narrowing, and the
  -- deck already has it -- "Loves & Exes", "Family & Relatives", "Locations".
  -- Stored rather than derived from `deck`, because the three decks collapse
  -- six sections and it is the SECTION that makes a door worth choosing.
  section     TEXT NOT NULL,
  card_no     INTEGER,                 -- the deck's own numbering, for tracing
  depth       INTEGER NOT NULL,        -- 12, 6 or 3 clues
  rounds      INTEGER NOT NULL,        -- 4, 2 or 1
  status      TEXT NOT NULL DEFAULT 'published'
);

-- ---- the clues -------------------------------------------------------------
--
-- THE CLUE TEXT NEVER LEAVES THE SERVER UNBOUGHT. A round serves one clue at a
-- time and charges for the next; shipping the card whole would be the leak this
-- family has closed four times in four games.
--
-- `vs` and `ep` are the SOURCING, carried through from the corpus: 511 of 1,098
-- clues have evidence and 111 have an exact phrase located in a named episode.
-- Kept because a wrong clue in front of Friends fans is the failure mode that
-- matters most here, and a citation nobody stored is a citation nobody can
-- check.
CREATE TABLE IF NOT EXISTS fr_wa_clue (
  card_id     TEXT NOT NULL,
  n           INTEGER NOT NULL,        -- 1..12, the deck's own numbering
  round_letter TEXT NOT NULL,          -- 'A'|'B'|'C'|'D' — see the note above
  step        INTEGER NOT NULL,        -- 1..3 within the round, hard to easy
  text        TEXT NOT NULL,
  vs          TEXT,                    -- evidence tier: 'ep'|'weak'|'meta'|'none'
  ep          TEXT,                    -- episode code, where one is known
  PRIMARY KEY (card_id, n)
);

-- ---- what counts as a correct answer ---------------------------------------
--
-- TWO LISTS PER CARD, AND THE DIFFERENCE MATTERS. `kind` is 'accept' for a
-- string that IS the answer, and 'suggest' for one that merely surfaces the
-- card as a candidate: "museum" names exactly one card and is accepted, while
-- "apartment" matches five and must offer a choice rather than pick one.
--
-- COLLISIONS ARE RESOLVED AT IMPORT, NOT AT PLAY. A string is only ever
-- accepted when it points at exactly one card, and the importer refuses a deck
-- where an 'accept' row is ambiguous — so adding a card cannot silently turn an
-- existing answer into a wrong one. That property is worth more than the
-- convenience of deciding it in the guess endpoint, where it would be re-derived
-- on every keystroke and could disagree with itself between two requests.
CREATE TABLE IF NOT EXISTS fr_wa_answer (
  card_id     TEXT NOT NULL,
  answer      TEXT NOT NULL,           -- folded for matching; see wadata.js
  kind        TEXT NOT NULL,           -- 'accept' | 'suggest'
  PRIMARY KEY (answer, card_id)
);
CREATE INDEX IF NOT EXISTS fr_wa_answer_card ON fr_wa_answer (card_id);

-- ---- the calendar ----------------------------------------------------------
--
-- A BOARD IS A DAY, and a day deals eleven doors — the family's number, and the
-- same shape football's Who Am I uses. Each door is one card played at one
-- round letter, which is what the revolving door rules are for: a card comes
-- back no sooner than three weeks later and at the NEXT letter, so four
-- appearances are four different sets of three clues.
CREATE TABLE IF NOT EXISTS fr_wa_board (
  play_date   TEXT PRIMARY KEY,        -- YYYY-MM-DD
  status      TEXT NOT NULL DEFAULT 'published'
);

CREATE TABLE IF NOT EXISTS fr_wa_door (
  play_date    TEXT NOT NULL,
  slot         INTEGER NOT NULL,       -- 1..11, the order shown
  card_id      TEXT NOT NULL,          -- NEVER shown until solved or given up
  round_letter TEXT NOT NULL,          -- which three clues this outing deals
  PRIMARY KEY (play_date, slot)
);
CREATE INDEX IF NOT EXISTS fr_wa_door_card ON fr_wa_door (card_id);

-- ---- playing a board -------------------------------------------------------
--
-- ITS OWN ROUND AND GUESS TABLES, AND THIS IS A CORRECTNESS FIX RATHER THAN
-- TIDINESS. wa_round has no `game` column: a round is identified by a play_id
-- UUID, but wa-play.js resolves what is behind the door with
--
--     doorAnswer(env, round.play_date, round.slot)
--
-- which reads wa_door. A Friends round stored in wa_round would therefore have
-- its answer looked up in FOOTBALL's door table — same date, same slot, a
-- different game — and the player would be marked against a footballer. The
-- round would look perfectly well-formed in the database while being judged
-- against the wrong card.
--
-- THE ALTERNATIVE WAS A `game` COLUMN ON wa_round, and it was rejected twice
-- over. It is an ALTER TABLE on a table a live game is writing to every minute,
-- which this project has a standing rule about; and games.js already states the
-- family's answer — "a new game adds a prefix, never a column". Two tables
-- cannot be confused with each other by a query that forgets to filter.
--
-- The COLUMNS are football's, deliberately unchanged: wa-play.js's arithmetic
-- is the shared machinery and it reads these names. Only the table differs.
CREATE TABLE IF NOT EXISTS fr_wa_round (
  play_id     TEXT PRIMARY KEY,
  -- THE DAILY'S DAY, or NULL for an endless round.
  --
  -- A daily round is found by (play_date, slot) and its answer resolved through
  -- fr_wa_door, exactly as football's is. An ENDLESS round has no door: the
  -- player asked for another card and the server dealt one, so there is nothing
  -- in the calendar to look it up in. Rather than invent a fake day to satisfy
  -- a join -- which is how a practice sitting ends up counted as a daily -- an
  -- endless round names its own card and leaves the calendar columns null.
  play_date   TEXT,
  slot        INTEGER,                 -- which door was chosen, 1 to 3
  -- WHAT AN ENDLESS ROUND IS OF. Null for a daily, where the door answers it.
  -- Both are never set and neither being set is a round that cannot be judged,
  -- which the endpoint refuses rather than storing.
  card_id     TEXT,
  round_letter TEXT,
  started_ms  INTEGER NOT NULL,        -- kick off, by this server's clock
  subs_used   INTEGER NOT NULL DEFAULT 0,
  finished    INTEGER NOT NULL DEFAULT 0,
  solved      INTEGER NOT NULL DEFAULT 0,
  score       INTEGER,
  minute      INTEGER
);

-- THE COLUMNS ARE FOOTBALL'S, EXACTLY, AND THAT IS THE POINT. wa-play.js is the
-- shared machinery: it INSERTs (play_id, n, guess, verdict, at_ms) and reads
-- them back in that shape. A Friends table with its own idea of a guess -- an
-- `at_ms` second, a boolean `correct` instead of a verdict -- was the first
-- version here, and it would have failed on the first guess anybody made,
-- because the SQL that writes it is not this file's to choose.
-- Only the TABLE NAME differs. Everything else is the interface.
CREATE TABLE IF NOT EXISTS fr_wa_guess (
  play_id     TEXT NOT NULL,
  n           INTEGER NOT NULL,        -- the guess's number within the round
  guess       TEXT NOT NULL,           -- as typed
  verdict     TEXT NOT NULL,           -- what judging made of it
  at_ms       INTEGER NOT NULL,
  PRIMARY KEY (play_id, n)
);
CREATE INDEX IF NOT EXISTS fr_wa_guess_play ON fr_wa_guess (play_id);
