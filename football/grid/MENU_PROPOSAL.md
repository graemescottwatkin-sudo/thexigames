# Grid XI — a pre-game menu, proposed

Written 8 September 2026 alongside the pre-game menu redesign of the other five
games. **Nothing here is built.** The brief said to flag a proposed new start
screen separately, and this is that flag: for Grid XI a menu is not a redesign,
it is a new screen with consequences for how the game starts.

## What Grid XI does today

It opens straight onto the board. There is no landing: `/football/grid/` loads
`gd-wrap`, fetches the day's board and draws the grid, the turn counter and the
keyboard. Every other game in the family opens on a menu and waits.

## Why that might be deliberate

Two reasons to leave it alone, and they are worth answering before building:

1. **The route from landing to playing is already as short as it can be.** The
   brief for the other five asks to shorten that route. Grid has no route.
2. **The title is the entire clue.** A menu that shows "Today's puzzle" and
   nothing else is honest but empty; a menu that shows the board's title has
   given the player the clue before the game starts. In a game with a turn
   budget rather than a clock that costs nothing directly — but it does mean
   the puzzle begins before the player has pressed anything, which is exactly
   the ambiguity a kick-off exists to remove.

## What a menu would buy

- **The two streaks.** Grid is the only game where a player cannot see their
  run without finishing a board.
- **The catalogue.** `/api/grid/catalog` shipped on 8 September and nothing
  links to it. A menu is the natural home for "boards that are not today's".
- **Consistency.** Five games open one way and the sixth another; a player
  arriving from the hub meets a different shape.
- **A place for the season summary**, which every other game now carries.

## What it would cost

- **The board must not start until asked.** Today the fetch-and-draw happens on
  load. Deferring it is small, but it changes when `/api/play` records a start —
  and that start is what the season counts as "turned up". A menu that draws
  the board on load and merely hides it would record a start for somebody who
  never played, which would turn a quiet day into a loss.
- **One more decision: does the menu show the title?** My recommendation is
  **no** — say "Today's grid" and keep the title for the board, so the clue and
  the kick-off arrive together.
- A tag bump, and the usual gates.

## What it would look like

The same shell as the other five, which is already shared:

- identity row — the Grid mark, `FOOTBALL / GRID`, "Eleven names. Shared letters."
- tabs — **Today · Previous puzzles · How to play**. Those are the routes Grid
  actually has (`/archive/`, `#how`); it has no clubs and no themes, so it gets
  no tab for them.
- today's card — "Today's grid", state and **Kick off / Resume / View result**,
  with no title shown.
- the two streaks, and the shared season summary.
- when the catalogue has a screen, a "More to play" card pointing at it.

## The decision

Three answers needed:

1. Should Grid open on a menu at all, or is going straight to the board right?
2. If yes: does the menu show the board's title, or withhold it until kick-off?
3. Should the start beacon move to kick-off — which is a behaviour change to
   what the season counts as a start, and must not be made silently?
