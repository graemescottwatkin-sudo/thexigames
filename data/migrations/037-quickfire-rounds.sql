-- 037-quickfire-rounds.sql — QuickFire XI's sittings, so the server owns the
-- clock and the marking.
--
-- WHY THIS EXISTS. QuickFire went live on 14 September 2026 serving the ANSWER
-- with every question — eleven a day, plain text, one curl — because the client
-- is a typing game that reveals letters from the string and cannot draw a board
-- without it. The fix is not to delete the field: that takes the game down. It
-- is to move marking to this side, the way Grid XI and Ballpark XI already do,
-- and stop sending the solution as a consequence. These tables are where that
-- marking lives.
--
-- AND THE SAME PASS FIXES THE OPPOSITE FAULT. Nothing QuickFire computes is
-- being written anywhere: it is absent from GAMES, entryKey() returns null for
-- it, and LAUNCHED.quickfire is null — so every result since it went live has
-- been computed, returned and silently dropped, with the client believing it
-- banked. That is the Scrambled fault word for word, and its comment in
-- games.js is the record of it.
--
-- Applied once. Every statement is CREATE ... IF NOT EXISTS and there is
-- nothing else here, so re-running it is safe.

-- A sitting. One row per attempt, so the minute a question was answered in is
-- THIS server's reading and not the browser's claim.
--
-- THE CLOCK IS ISSUED HERE AND NEVER SENT UP. QuickFire scores by the minute:
-- 100 points inside 9 minutes down to 36 at 89, per question. A clock the
-- client reports is a clock the client can wind back, and the whole score is a
-- function of it.
CREATE TABLE IF NOT EXISTS qf_round (
  play_id     TEXT PRIMARY KEY,        -- the attempt, from /api/play
  play_date   TEXT NOT NULL,           -- the day it was the daily, YYYY-MM-DD
  started_ms  INTEGER NOT NULL,        -- kick off, by this server's clock
  subs_used   INTEGER NOT NULL DEFAULT 0
);
-- WHY KICK OFF MUST BE IDEMPOTENT. Two calls from a double tap, a refresh or a
-- retried request must not be two rounds: the second would reset started_ms and
-- hand back every second already spent, which is the same shape as Ballpark's
-- clock_idx guard one level up — there a question cannot be re-opened for
-- profit, here a round cannot be restarted for it.

-- One locked pick. The verdict is THIS SERVER'S: whether it was right, and what
-- it earned at the minute it arrived.
--
-- WHY THE POINTS ARE STORED AND NOT ONLY THE PICK. A round is re-derived from
-- these rows, and a re-derivation that had to re-score would need the bands at
-- read time — so the day a band moved, every past round would silently change.
-- What is stored is what was true when it was given. Ballpark's bp_answer holds
-- its grade for the same reason.
CREATE TABLE IF NOT EXISTS qf_answer (
  play_id     TEXT NOT NULL,
  idx         INTEGER NOT NULL,        -- which question, 1 to 11
  question_id TEXT NOT NULL,           -- the question's own id, for reporting
  pick        TEXT,                    -- what the player chose, NULL on a timeout
  correct     INTEGER NOT NULL,        -- 1 or 0, decided here
  points      INTEGER NOT NULL,        -- what it earned, at the minute it landed
  minute      INTEGER NOT NULL,        -- the match minute, from started_ms
  at_ms       INTEGER NOT NULL,        -- when it was judged
  PRIMARY KEY (play_id, idx)
);
-- PRIMARY KEY (play_id, idx) is the whole anti-replay rule: a question can be
-- answered once per sitting. Without it a player could send the same index
-- repeatedly and keep the best outcome, which is not cheating anybody would
-- have to plan — it is what a retry on a flaky connection does by accident.

CREATE INDEX IF NOT EXISTS idx_qf_round_date ON qf_round (play_date);
