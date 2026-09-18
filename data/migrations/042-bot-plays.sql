-- 042 — the bot is counted as the bot, not as a visitor.
--
-- THE FAULT. tools/play_bot.mjs plays the live site every night, signed in as
-- one dedicated device-code account, and its header says why that account is
-- fixed: "Excluding the bot from any table ever built is then one user_id,
-- forever. Decided before the first run, because retro-fitting it means
-- working out which historical rows were bots — and by then nobody can."
--
-- That reasoning was right and the mechanism was missing. `plays` is
-- deliberately anonymous — a random id per attempt and no user_id, so it
-- identifies nobody — which means the one table the bot writes most heavily
-- is precisely the table the user_id cannot exclude it from. Ten sessions a
-- night landed in the visitor column, and on 18 Sep 2026, with the table
-- freshly reset for launch, the bot was the majority of the data.
--
-- THE SHAPE, copied from 003's is_admin rather than invented. A flag on the
-- account, set by hand in the database, read server-side on every request and
-- never accepted from the browser. An account cannot mark itself a bot and
-- nothing the client sends can mark anyone. by_owner already works this way
-- and is the proven pattern here.
--
-- Two flags, not one reused. A bot is not an owner: the owner's attempts are
-- real play worth reading back, and folding the bot into by_owner would
-- quietly corrupt the only honest record of what was tried by hand.
--
-- Safe to re-run: a duplicate-column error is harmless.

ALTER TABLE users ADD COLUMN is_bot INTEGER DEFAULT 0;
ALTER TABLE plays ADD COLUMN by_bot INTEGER DEFAULT 0;

-- Every funnel query filters on this, so it is worth an index of its own.
CREATE INDEX IF NOT EXISTS idx_plays_by_bot ON plays (by_bot);

-- Mark the bot account. Matched on the properties play_bot.mjs gives it — a
-- device-code sign-in with no email — rather than a pasted id, so this runs
-- correctly against a database where the bot was created at a different time.
-- If it has not signed in yet this updates nothing and is still correct: the
-- flag is set by hand afterwards, exactly as is_admin is.
UPDATE users
   SET is_bot = 1
 WHERE provider = 'code'
   AND (email IS NULL OR email = '')
   AND is_admin = 0;
