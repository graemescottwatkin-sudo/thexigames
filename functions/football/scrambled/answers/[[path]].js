/* GET /football/scrambled/answers/ and /football/scrambled/answers/<no>
 *
 * The published archive. Scrambled XI had none — the crossword got one, the
 * word search copied it, and the three games built afterwards were never given
 * theirs. A board nobody can look up is a board that stops existing the day
 * after it runs, and this is also the only page about a board with anything on
 * it to read: the game's own page is a shell that fills in by script.
 *
 * WHAT AN ANSWER IS HERE: the eleven names, in the positions they played. The
 * SCRAMBLE is not shown, because the scramble is not the answer — it is the
 * question, and it is different in Vowels off the same board.
 */
import { loadBoards, boardForNumber } from "../../../_lib/sc-board.js";
import {
  answersIndex, answersBoard, publishedNumbers, sealed,
} from "../../../_lib/answers-page.js";
import { answersAvailable } from "../../../_lib/daily.js";
import { dailyNumber } from "../../../_lib/daily.js";

const NAME = "Scrambled XI";
const GAME = "scrambled";

export async function onRequestGet({ env, params }) {
  const parts = [].concat((params && params.path) || []).filter(Boolean);
  if (parts.length > 1) return sealed();

  const boards = await loadBoards(env);

  if (!parts.length) {
    return answersIndex({
      game: GAME, name: NAME,
      published: publishedNumbers(GAME).map((no) => ({
        key: String(no), board: String(no), label: "Board #" + no + " — the eleven",
      })),
    });
  }

  /* ONE BOARD, AND THE SEAL IS ASKED FOR RATHER THAN ASSUMED. A malformed
     number, a future one and a sealed one all get the same refusal. */
  if (!/^[1-9][0-9]{0,5}$/.test(parts[0])) return sealed();
  const no = Number(parts[0]);
  /* AND NOT A BOARD FROM BEFORE THE GAME LAUNCHED. The ring generates a board
     for any number, so boards 1 to 6 look exactly like boards this game once
     ran; it did not, and an answers page for one is a page about a day that
     never happened. publishedNumbers is the list and this is the same rule
     asked of one number. */
  if (!publishedNumbers(GAME).includes(no)) return sealed();

  const board = boardForNumber(no, boards);
  if (!board) return sealed();

  const rows = (board.slots || []).map((s) => ({
    label: s.pos,
    answer: s.display || s.name,
    note: null,
  }));
  const today = dailyNumber();
  return answersBoard({
    game: GAME, name: NAME, key: String(no),
    heading: "Board #" + no,
    sub: board.title,
    rows,
    prev: no > 1 ? String(no - 1) : null,
    next: answersAvailable(no + 1, today) ? String(no + 1) : null,
  });
}
