-- 056-play-finish.sql — who finished, as a device, never as a person.
--
-- The owner, 11 Oct 2026: "I think we should have a shadow table for finished
-- games so we know who's finishing and can tell if 1 person finished 13 games
-- or 13 people did". `plays` is one row per ATTEMPT and names nobody, by
-- design, so thirteen finishes were thirteen rows and nothing more.
--
-- One row per finished play, beside it rather than in it: `who` is the SHA-256
-- of a random key the device made for itself (xi.visitor, shared/xi-plays.js),
-- never the key, never an account, never the transfer code. Asked whether the
-- key should change daily or stay, the owner chose "Across days", so returning
-- players can be counted too. Joined to `plays` by play_id, which is where the
-- owner, bot, device and render-gate flags live.
--
-- Only CREATE ... IF NOT EXISTS, so it is safe to re-run.
CREATE TABLE IF NOT EXISTS play_finish (
  play_id     TEXT PRIMARY KEY,                       -- plays.play_id
  who         TEXT NOT NULL,                          -- sha256 of the device's own random key
  game        TEXT NOT NULL,
  board_key   TEXT,
  mode        TEXT,
  day         TEXT NOT NULL,                          -- the server's UTC day of the finish
  finished_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_play_finish_day ON play_finish (day, game);
CREATE INDEX IF NOT EXISTS idx_play_finish_who ON play_finish (who, day);
