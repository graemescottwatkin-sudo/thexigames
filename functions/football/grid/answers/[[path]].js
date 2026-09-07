/* GET /football/grid/answers/ and /football/grid/answers/<no>
 *
 * The published archive. A board nobody can look up is a board that stops
 * existing the day after it runs, and this is also the only page about a Grid
 * XI board with anything on it to read: the game's own page is a shell that
 * fills in by script, and the grid itself arrives with no letters in it.
 *
 * WHAT AN ANSWER IS HERE: the eleven names, in the entries they filled. The
 * title travels with them because in this game the title IS the clue — "the
 * eleven who started the 1999 final" is the whole of what a player is given —
 * so an answers page that withheld it would be answering a question it had not
 * asked.
 *
 * THE SEAL IS THE FAMILY'S ONE WINDOW: ANSWERS_AFTER_DAYS in _lib/daily.js,
 * asked through publishedNumbers, never restated here. A sealed board, a board
 * from before the game launched and a nonsensical key get one identical 404.
 */
import { loadBank, boardForDay, answersOf } from "../../../_lib/gd-board.js";
import {
  answersIndex, answersBoard, publishedNumbers, sealed,
} from "../../../_lib/answers-page.js";
import { dailyDayKey } from "../../../_lib/daily.js";

const NAME = "Grid XI";
const GAME = "grid";

export async function onRequestGet({ env, params }) {
  const parts = [].concat((params && params.path) || []).filter(Boolean);
  if (parts.length > 1) return sealed();

  const bank = await loadBank(env);
  /* Only the boards the calendar actually ran: this game is scheduled, so a
     number the calendar does not hold is not a board rather than a board with
     nothing in it. */
  const published = publishedNumbers(GAME).filter((no) => !!boardForDay(bank, dailyDayKey(no)));

  if (!parts.length) {
    return answersIndex({
      game: GAME, name: NAME,
      published: published.map((no) => {
        const b = boardForDay(bank, dailyDayKey(no));
        return { key: String(no), board: String(no), label: "Board #" + no + " — " + b.title };
      }),
    });
  }

  if (!/^[1-9][0-9]{0,5}$/.test(parts[0])) return sealed();
  const no = Number(parts[0]);
  if (published.indexOf(no) === -1) return sealed();

  const board = boardForDay(bank, dailyDayKey(no));
  if (!board) return sealed();

  const rows = answersOf(board).map((a) => ({
    label: "#" + a.n,
    answer: a.answer,
    note: a.member || null,
  }));
  return answersBoard({
    game: GAME, name: NAME, key: String(no),
    heading: "Board #" + no,
    sub: board.title,
    rows,
    prev: published.indexOf(no - 1) > -1 ? String(no - 1) : null,
    next: published.indexOf(no + 1) > -1 ? String(no + 1) : null,
  });
}
