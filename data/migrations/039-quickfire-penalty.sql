-- 039-quickfire-penalty.sql — the clock QuickFire actually has, and what a
-- wrong pick costs on it.
--
-- WHY THIS IS NOT PART OF 037. 037 created qf_round hours earlier, before the
-- owner had decided what a wrong pick costs — the typing game had no such
-- concept, because a wrong guess just cleared the cells and you typed again.
-- With four options a wrong pick is a discrete event, it costs match minutes,
-- and the server has to remember how many have been spent.
--
-- AND 037 GOT THE CLOCK WRONG, which is the larger half of this file and was
-- found before it ever ran. It gave the SITTING one `started_ms` and measured
-- every question from it. QuickFire does not have a sitting clock: each
-- question has its own 0' to 90', worth one question's real time — thirty
-- seconds — and a fresh one starts at 0' when the question is served. Measured
-- from the sitting, question one would score and question two would land at
-- 99' and be worth nothing, as would every question after it. An eleven-
-- question game would have had at most one scoring question, and the symptom —
-- "everything after the first is zero" — would have read as a scoring bug
-- rather than a clock one. The same mistake made penalty_minutes round-wide:
-- a wrong pick on question two would still have been taxing question eleven.
--
-- So the clock is per QUESTION and lives in three columns that move together:
-- which question it is on, when that question was served, and what wrong picks
-- have added TO THAT QUESTION. Serving the next question stamps all three.
--
-- WHY IT DROPS AND RECREATES RATHER THAN ALTERING. ALTER TABLE ADD COLUMN is
-- not idempotent, and this repository's rule is that a migration must be safe
-- to re-run — every other one here is CREATE ... IF NOT EXISTS and nothing
-- else, so a half-remembered "did I apply that?" costs nothing. An ALTER would
-- make this the one file where the answer matters.
--
-- THAT IS ONLY SAFE BECAUSE THE TABLE IS EMPTY, and it was checked rather than
-- assumed: qf_round 0 rows, qf_answer 0 rows, immediately before this was
-- written. Nothing has fed them since 037 was applied — the endpoints that will
-- are in the same change as this file. IF EITHER TABLE EVER HOLDS A ROUND,
-- THIS MIGRATION MUST NOT BE RE-RUN: it would delete a player's sitting. That
-- is a real difference from every other migration here and it is why the
-- sentence is in capitals.
--
-- qf_answer is untouched. It is recreated here only so the two tables stay in
-- one file for anyone reading the pair, and its shape is unchanged from 037.

DROP TABLE IF EXISTS qf_round;

-- A sitting. The clock is issued HERE and never sent up: QuickFire scores by
-- the minute — 100 points inside 9 minutes down to 36 at 89, per question — so
-- a clock the client reports is a score the client chooses.
CREATE TABLE IF NOT EXISTS qf_round (
  play_id         TEXT PRIMARY KEY,        -- the attempt
  play_date       TEXT NOT NULL,           -- the day it was the daily, YYYY-MM-DD
  started_ms      INTEGER NOT NULL,        -- the sitting kicked off, by this server's clock
  subs_used       INTEGER NOT NULL DEFAULT 0,
  -- THE QUESTION CLOCK. `question_idx` is which of the eleven is being played,
  -- 0 before any has been served; `question_ms` is when THAT question was put
  -- in front of the player, and every match minute is measured from it. The
  -- pair is stamped once per question and never restamped — a second stamp
  -- would rewind the match and hand back the decay, which is the exact fault
  -- Codeword found in its own demo where the clock rate was switchable
  -- mid-round.
  question_idx    INTEGER NOT NULL DEFAULT 0,
  question_ms     INTEGER NOT NULL DEFAULT 0,
  -- MATCH MINUTES BOUGHT BY WRONG PICKS ON THE CURRENT QUESTION, reset when
  -- the next question is served. Added to the elapsed clock rather than
  -- deducted from the score: the clock already punishes hesitation, so a points
  -- penalty would punish twice, and a time penalty costs more the earlier you
  -- were because the curve is steepest there.
  --
  -- HOW MANY MINUTES IS NOT WRITTEN HERE, deliberately. This comment said "five
  -- at a time" for the few hours between the draft and the owner settling on
  -- ten, and it was applied to production in that state — so the one place a
  -- person reading the DATABASE can see the number was the one place saying the
  -- wrong one. A schema comment cannot be kept in step with a tunable: it is
  -- frozen at apply time and the tunable is meant to move. The number lives in
  -- WRONG_GUESS_MINUTE_PENALTY in football/quickfire/js/config.js, which the
  -- server reads rather than copying, and that is the only place to look.
  penalty_minutes INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_qf_round_date ON qf_round (play_date);
