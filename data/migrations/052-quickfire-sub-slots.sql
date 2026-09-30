-- 052 — football QuickFire records which slot each substitution was spent on.
--
-- A BARE ALTER TABLE: NOT SAFE TO RE-RUN. Applied once, then recorded in
-- CLAUDE.md's migration line. SQLite has no ADD COLUMN IF NOT EXISTS; check
-- pragma_table_info('qf_round') for sub_slots before running it.
--
-- WHY. Found 30 Sep 2026 while building QuickFire XI: Friends on this engine:
-- after a sub the page puts the bench question in the slot, and /answer judged
-- the pick against the question it replaced -- so every pick after a sub was
-- refused as "not one of the options". No live round had ever spent a sub (0
-- of 43 that day), which is the only reason nobody met it. The engine now
-- records the slot (qf-play.js spendSub) and judges the question it holds
-- (questionInSlot). This column must exist BEFORE that code is deployed: the
-- sub's UPDATE names it. Rounds from before it read as '' -- no subs recorded,
-- which is what every one of them was.
--
-- fr_qf_round (051) was created with the column.

ALTER TABLE qf_round ADD COLUMN sub_slots TEXT NOT NULL DEFAULT '';
