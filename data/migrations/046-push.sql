-- 046-push.sql — reminders on a phone: who asked for them, what is waiting to
-- go, and whether the sender is running.
--
-- THE ONE PLACE THE SITE STORES SOMETHING FOR A PLAYER WITHOUT AN ACCOUNT.
-- Everywhere else, nothing is written for a signed-out player. The owner
-- relaxed that rule for this feature on 23 Sep 2026: anyone may opt in to
-- reminders, and a signed-out player's opt-in is a device token with no
-- account behind it. What is kept is the least that can do the job: the
-- token, the phone's time zone and the four switches. There is no name, no
-- email and no game history. The privacy policy needs a line for it; that
-- wording is the owner's.
--
-- Written by /api/push/device (functions/api/push/device.js) and read by the
-- sender Worker (workers/push/). The rules both of them follow are in
-- functions/_lib/push.js.
--
-- All CREATE ... IF NOT EXISTS and nothing else, so it is safe to re-run.

CREATE TABLE IF NOT EXISTS push_device (
  token          TEXT PRIMARY KEY,     -- FCM registration token
  platform       TEXT NOT NULL,        -- 'android' (later 'ios')
  user_id        TEXT,                 -- the account it was registered under; NULL signed out
  tz             TEXT NOT NULL,        -- IANA zone from the phone, validated server-side
  morning_minute INTEGER NOT NULL DEFAULT 540,   -- 09:00 local
  want_morning   INTEGER NOT NULL DEFAULT 1,
  want_streak    INTEGER NOT NULL DEFAULT 1,     -- only acted on when user_id is set
  want_challenge INTEGER NOT NULL DEFAULT 1,     -- likewise: a challenge knows its creator's account, not a device
  created_at     TEXT NOT NULL,
  seen_at        TEXT NOT NULL,        -- refreshed on every register; stale tokens are pruned
  sent_morning   TEXT,                 -- the UTC board day last sent, so one per day
  sent_streak    TEXT
);
CREATE INDEX IF NOT EXISTS push_device_user ON push_device(user_id);

-- Messages that wait for the sender. A challenge result is an event that
-- happens inside a Pages Function, and the only thing holding the FCM key is
-- the Worker; so the Function writes the message here and the Worker sends it
-- on its next run. One key, in one place, is the reason for the queue.
CREATE TABLE IF NOT EXISTS push_outbox (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,            -- 'challenge'
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  url        TEXT NOT NULL,            -- a path on this site, never a full address
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS push_outbox_created ON push_outbox(created_at);

-- One row per run of the sender, so a check can ask whether it is running at
-- all. A cron that has stopped firing sends nothing and reports nothing, which
-- looks exactly like a quiet day.
CREATE TABLE IF NOT EXISTS push_run (
  ran_at  TEXT PRIMARY KEY,
  sent    INTEGER NOT NULL,
  failed  INTEGER NOT NULL,
  pruned  INTEGER NOT NULL
);
