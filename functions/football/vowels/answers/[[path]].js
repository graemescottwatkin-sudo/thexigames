/* GET /football/vowels/answers/ and /football/vowels/answers/<no>
 *
 * The published archive. Vowels XI had none — the crossword got one, the
 * word search copied it, and the three games built afterwards were never given
 * theirs. A board nobody can look up is a board that stops existing the day
 * after it runs, and this is also the only page about a board with anything on
 * it to read: the game's own page is a shell that fills in by script.
 *
 * WHAT AN ANSWER IS HERE: the eleven names, in the positions they played. The
 * CYPHER is not shown, because the missing vowels are not the answer — they
 * are the question, and the same board asks a different one in Scrambled.
 */
import { loadBoards, boardForNumber } from "../../../_lib/sc-board.js";
import {
  answersIndex, answersBoard, publishedNumbers, sealed,
} from "../../../_lib/answers-page.js";
import { answersAvailable } from "../../../_lib/daily.js";
import { dailyNumber } from "../../../_lib/daily.js";

const NAME = "Vowels XI";
const GAME = "vowels";

export async function onRequestGet({ env, params }) {
  const parts = [].concat((params && params.path) || []).filter(Boolean);
  if (parts.length > 1) return sealed();

  const boards = await loadBoards(env);

  if (!parts.length) {
    return answersIndex({
      game: GAME, name: NAME,
      published: publishedNumbers().map((no) => ({
        key: String(no), label: "Board #" + no + " — the eleven",
      })),
    });
  }

  /* ONE BOARD, AND THE SEAL IS ASKED FOR RATHER THAN ASSUMED. A malformed
     number, a future one and a sealed one all get the same refusal. */
  if (!/^[1-9][0-9]{0,5}$/.test(parts[0])) return sealed();
  const no = Number(parts[0]);
  if (!answersAvailable(no, dailyNumber())) return sealed();

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
