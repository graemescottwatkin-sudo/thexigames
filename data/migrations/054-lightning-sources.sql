-- 054-lightning-sources.sql — Lightning Round (Friends): each question's source.
--
-- The owner, 2 Oct 2026, playing: "I'm not seeing any sources when playing",
-- and then: "Show any source, whatever it is and the part that is referenced".
-- So every question carries its citation -- the publisher, the link, and the
-- line the fact rests on -- and a player opens it from the review after the
-- whistle, one question at a time, on an account and under the family's
-- fifty-a-day cap (functions/_lib/sources.js). Only for a question already
-- answered in that run: the answer has been shown by then, so the citation
-- gives nothing away.
--
-- LOADED FROM OUTSIDE THE REPO, like the pool: LightningRoundXI_Friends/
-- scripts/build_pool.py takes it from the bank row (sourceName, the first
-- source URL, sourceQuote), and reload_production.py writes only what changed.
--
-- A new table, not columns on fr_lr_question, so this file is safe to run
-- twice: CREATE ... IF NOT EXISTS, no ALTER.
CREATE TABLE IF NOT EXISTS fr_lr_source (
  id    TEXT PRIMARY KEY,              -- the question's id, as in fr_lr_question
  name  TEXT NOT NULL,                 -- the publisher, as a label ("Wikipedia: Ross Geller")
  url   TEXT,                          -- http(s) only, or empty
  text  TEXT                           -- the quoted line the fact rests on
);
