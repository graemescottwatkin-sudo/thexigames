-- 053 — a device the owner marks as his own, so his testing stops reading as
-- players.
--
-- THE FAULT, FOR THE THIRD TIME. by_owner is read from the session, which
-- answers "was there an admin cookie on this request" and not "was this the
-- owner". Every signed-out tab, second browser, private window and Claude
-- session driving the live site lands in the visitor column. The play bot got
-- its own flag in 042 and the render gate's ?r=gate tag was finally read on
-- 22 Sep; this is the same hole a third time, and the largest of the three.
--
-- WHAT IT COST. Over 27-30 Sep the figures read as 59 genuine plays. Three
-- blocks of them — twelve games in one hour, twelve in another, thirteen
-- across all ten games in a third — are sweeps, not players, and the _fr rows
-- among them are for a theme that is launched but unadvertised and reachable
-- only by someone holding the address. Roughly 37 of the 59 were the owner or
-- a session. The honest figure was about seven.
--
-- WHY A CLIENT-SET FLAG IS ACCEPTABLE HERE, when play.js's own comment says
-- "a flag the client could set is a flag anyone could set about anyone".
-- That objection is about a flag that can EXCLUDE somebody. This one can only
-- exclude the sender: a stranger who sets it removes only their own rows from
-- the visitor count, which makes the owner's numbers more conservative and
-- gives the sender nothing. It cannot be aimed at anyone else, it carries no
-- privilege, and no endpoint reads it for anything but this counter.
--
-- A separate column, not by_owner. The owner's signed-in attempts are real
-- play worth reading back; a device sweep is not, and folding them together
-- would lose the distinction the way 042 was careful not to for the bot.
--
-- Safe to re-run: a duplicate-column error is harmless.

ALTER TABLE plays ADD COLUMN by_dev INTEGER DEFAULT 0;

-- Every funnel query filters on this, as it does on by_bot.
CREATE INDEX IF NOT EXISTS idx_plays_by_dev ON plays (by_dev);
