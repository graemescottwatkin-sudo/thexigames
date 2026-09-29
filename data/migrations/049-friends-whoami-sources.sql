-- 049-friends-whoami-sources.sql — Who Am I XI: Friends: where each clue came
-- from, shown to the player once the card is over.
--
-- THE OWNER'S RULING, 29 Sep 2026, asked whether a clue's source should be
-- shown after the round: "Yes show the source after the round". Every clue in
-- the deck is verified, and the deck carries what it was verified against —
-- the line of the script it rests on, or the published page and the sentence
-- on it. fr_wa_clue already holds the episode (`ep`); this holds the rest.
--
-- AFTER, NEVER DURING. A source is a clue nobody paid for: the quoted line
-- usually names the moment outright. So nothing here is read by the rungs or
-- the guess endpoint — only by /finish, for a card that is closed, and only
-- for the clues that card actually dealt.
--
-- ONE ROW PER CITATION, and a clue may have two: the deck's own order is the
-- script line (or the published page, or the phrase's episode), then the
-- article the clue's `src` names. `seq` keeps that order.
--
-- Applied once. Every statement is CREATE ... IF NOT EXISTS, so re-running it
-- is safe. 048 is Word Search XI: Friends's, held on its branch; this was
-- applied first, which the 022/023 pair did before it.

CREATE TABLE IF NOT EXISTS fr_wa_source (
  card_id   TEXT NOT NULL,
  n         INTEGER NOT NULL,          -- the clue, fr_wa_clue.n
  seq       INTEGER NOT NULL,          -- 1, 2: the deck's order
  kind      TEXT NOT NULL,             -- 'script' | 'web' | 'phrase' | 'article'
  ep        TEXT,                      -- script, phrase: the episode it cites
  line      INTEGER,                   -- script: the line in that transcript
  url       TEXT,                      -- web, article: the page
  name      TEXT,                      -- article: the publisher and title
  quote     TEXT,                      -- the words it rests on
  PRIMARY KEY (card_id, n, seq)
);
