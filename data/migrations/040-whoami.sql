-- 040-whoami.sql — Who Am I XI.
--
-- Eight CREATE ... IF NOT EXISTS and nothing else, so it is safe to re-run.
-- Nothing here is dropped and nothing is altered: every other migration in this
-- folder is idempotent and 039 was the one exception, for a reason it states in
-- capitals. This one needs no exception.
--
-- THE GAME, because the schema only makes sense against it. A board is ELEVEN
-- DOORS, each a club and the year a player last left it. Behind each door is
-- one player. A person picks ONE door — their own club, usually — and tries to
-- name him. The first clue is free: the spell behind that door, its years and
-- appearances. A substitution buys the full career, a second buys age and
-- nationality, a third gives him up and loses the board.
--
-- WHY THAT MAKES THE SECRECY RULE HARDER THAN ANY GAME BEFORE IT. Only one door
-- is played per person per day, and the other ten stay live for everybody else
-- who picks a different club. So a leak does not spoil one answer, it spoils ten
-- answers for every other player that day. QuickFire leaked eleven answers to
-- one player; this would leak ten to all of them.
--
-- AND THE CAREER IS THE ANSWER. "Cobreloa, Udinese, Barcelona, Arsenal, Man
-- United, Inter" is Sanchez to anyone who can read, so the club history is not
-- a hint that happens to be strong — it is the answer written out, and it must
-- not leave this database until a substitution has been spent. Same for the
-- birthplace and the age. What may be sent freely is the door itself: a club
-- and a year, which is the board and has to be visible to choose from.
--
-- ONE RESULT A DAY, NOT ELEVEN. Eleven doors, one attempt. The family's rule is
-- eleven of something per board and this game's eleven are the CLUBS rather
-- than the answers — granted explicitly by the owner on 11 Sep 2026, and
-- written down here so the next game citing it cites a rule rather than a
-- precedent nobody wrote down.

-- ---- the bank -------------------------------------------------------------

-- A player. The `clubs` JSON is the full career and is the most dangerous
-- column in this database: reading it is solving the puzzle. Nothing selects it
-- except the clue endpoint, after a substitution has been charged.
CREATE TABLE IF NOT EXISTS wa_player (
  id          TEXT PRIMARY KEY,        -- stable, from the folded name
  name        TEXT NOT NULL,           -- as displayed and as guessed against
  search_key  TEXT NOT NULL,           -- pre-folded for matching; see wadata.js
  full_name   TEXT,
  nationality TEXT,
  position    TEXT,
  birth_year  INTEGER,
  birth_place TEXT,
  main_club   TEXT,
  club_count  INTEGER NOT NULL DEFAULT 0,
  club_history TEXT,                   -- the pre-rendered career string
  clubs       TEXT,                    -- JSON: [{club,from,to,apps,goals,loan}]
  caps        TEXT,
  article     TEXT,
  status      TEXT NOT NULL DEFAULT 'verified'
);

-- The name list a player types against is every row of the above, and it is the
-- answer SPACE rather than an answer: the same 3,146 names back all 365 days,
-- so knowing them tells you nothing about today. Indexed because it is fetched
-- whole, once, on every visit.
CREATE INDEX IF NOT EXISTS idx_wa_player_search ON wa_player (search_key);

-- ---- the boards -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS wa_board (
  play_date   TEXT PRIMARY KEY,        -- YYYY-MM-DD, the day it is the daily
  status      TEXT NOT NULL DEFAULT 'published'
);

-- ONE DOOR. `player_id` is the answer and is the reason this table is not the
-- one the daily endpoint reads from directly.
CREATE TABLE IF NOT EXISTS wa_door (
  play_date   TEXT NOT NULL,
  slot        INTEGER NOT NULL,        -- 1 to 11, the order they are shown
  club        TEXT NOT NULL,           -- shown
  leave_year  INTEGER NOT NULL,        -- shown
  player_id   TEXT NOT NULL,           -- NEVER shown
  PRIMARY KEY (play_date, slot)
);

CREATE INDEX IF NOT EXISTS idx_wa_door_date ON wa_door (play_date);

-- ---- a sitting ------------------------------------------------------------

-- A person's attempt at one door. The clock and the substitutions are issued
-- here and never sent up, for the reason every game in this family now states:
-- a clock the client reports is a score the client chooses.
CREATE TABLE IF NOT EXISTS wa_round (
  play_id     TEXT PRIMARY KEY,
  play_date   TEXT NOT NULL,
  slot        INTEGER NOT NULL,        -- which door was chosen
  started_ms  INTEGER NOT NULL,
  subs_used   INTEGER NOT NULL DEFAULT 0,
  -- 0 while playing, 1 once the door is closed either way. A finished round is
  -- not reopened: the answer has been on the screen.
  finished    INTEGER NOT NULL DEFAULT 0,
  solved      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_wa_round_date ON wa_round (play_date);

-- Every name tried, and what the server said about it. Kept rather than
-- counted, because "right club, wrong player" is a distinct outcome that costs
-- no substitution, and a count cannot tell the three apart afterwards.
CREATE TABLE IF NOT EXISTS wa_guess (
  play_id     TEXT NOT NULL,
  n           INTEGER NOT NULL,        -- 1, 2, 3 … in the order they were made
  guess       TEXT NOT NULL,           -- what they typed, normalised
  verdict     TEXT NOT NULL,           -- 'right' | 'right-club' | 'wrong'
  at_ms       INTEGER NOT NULL,
  PRIMARY KEY (play_id, n)
);
