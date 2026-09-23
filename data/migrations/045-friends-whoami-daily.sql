-- 045 — the Friends Who Am I DAILY rounds, built from verified clues only.
--
-- THE OWNER'S RULING, 23 September 2026: a daily deals verified clues only, and
-- endless play keeps the full deck. "Verified" is the deck's own flag
-- (`"verified": true` in its export — a clue matched to an episode in the
-- scripts, backed by an article, or confirmed by an exact phrase). The rule
-- belongs to the deck; this repository reads the flag and never rebuilds it.
--
-- WHY A TABLE OF ITS OWN, AND NOT A COLUMN ON fr_wa_clue. A card's DAILY rounds
-- and its ENDLESS rounds are two different structures over the same clues. The
-- full card is banded by stride r = depth / 3; the daily card is the verified
-- subset, banded by its own stride r' = floor(m / 3). So one clue can be step 3
-- of daily round A and step 1 of endless round D at the same time. fr_wa_clue
-- carries ONE round_letter per clue — the endless one — and a second letter on
-- the same row would be two answers to "which round is this clue in" stored
-- side by side, the fault this project traces every major bug back to.
--
-- So this table holds only the daily STRUCTURE, and points into fr_wa_clue for
-- the text: (card, daily letter, step) -> n, the clue's position on the full
-- card. The sentence, its sourcing and its episode are stored once.
--
-- THE BANDING, the deck's rule applied to the verified subset. Take a card's
-- verified clues in their original order, m of them; r' = floor(m / 3); daily
-- round k takes the k-th, (k + r')-th and (k + 2r')-th of those. Each round still
-- reads hard to easy because the subset keeps the card's order. A card with
-- fewer than three verified clues has no daily rounds and no rows here; it
-- appears in endless play only. At deck commit 1015a3e: 151 daily rounds from
-- 66 of the 73 character cards.
--
-- fr_wa_door's round_letter is a DAILY letter from 045 on: the calendar deals
-- from this table, and every daily door resolves its clues through it.
--
-- SAFE TO RE-RUN: one CREATE TABLE IF NOT EXISTS and one CREATE INDEX IF NOT
-- EXISTS, nothing else.

CREATE TABLE IF NOT EXISTS fr_wa_daily_clue (
  card_id      TEXT NOT NULL,
  round_letter TEXT NOT NULL,          -- the DAILY letter, A.. per card
  step         INTEGER NOT NULL,       -- 1..3 within the round, hard to easy
  n            INTEGER NOT NULL,       -- the clue's position on the full card:
                                       -- fr_wa_clue (card_id, n)
  PRIMARY KEY (card_id, round_letter, step)
);

CREATE INDEX IF NOT EXISTS fr_wa_daily_clue_clue ON fr_wa_daily_clue (card_id, n);
