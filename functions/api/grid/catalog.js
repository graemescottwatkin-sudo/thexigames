/* GET /api/grid/catalog            the catalogue, identity only
 * GET /api/grid/catalog?id=gx-0042 one catalogue board, ready to play
 *
 * WHAT A CATALOGUE BOARD IS. Grid XI launched with 236 boards and every one of
 * them was a daily: one per day, the calendar's, gone the next morning. A FREE
 * board is never in the calendar — it is the one somebody goes looking for
 * rather than the one set for everybody today, and the owner's plan for these
 * is the older and more obscure elevens, which make a poor daily and a good
 * thing to find.
 *
 * IT IS ALSO THE ONLY KIND THAT CAN CARRY A CHALLENGE. A challenge on a daily
 * would be a challenge on the board everybody is already playing, so the
 * server refuses one; and unlike the word search's catalogue, these boards are
 * judged by this server rather than handed over whole, so a score on one is a
 * score a table can be made of.
 *
 * WHAT LEAVES: for the list, ids and titles. For one board, exactly what the
 * daily sends — the grid's shape and the title, never a letter of an answer,
 * through the same publicBoard() and past the same leak check on the real
 * response. A daily asked for here is refused however it is spelled: the daily
 * route is where a daily comes from, and this door would serve one whose day
 * has not come.
 */
import { json, bad } from "../../_lib/puzzle.js";
import {
  loadBank, catalogue, freeBoard, publicBoard, publicText, boardToken,
} from "../../_lib/gd-board.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const bank = await loadBank(env);
  const asked = url.searchParams.get("id");

  if (asked === null) {
    const boards = catalogue(bank);
    return json({ boards, count: boards.length, source: bank.source });
  }

  if (!/^[A-Za-z0-9_-]{1,40}$/.test(asked)) return bad("No such board.", 404);
  const board = freeBoard(bank, asked);
  /* ONE ANSWER FOR "no such board" AND FOR "that one is a daily": both are
     "not one of these", and telling them apart would let the id space be
     walked to find where the calendar begins. */
  if (!board) return bad("No such board.", 404);

  const token = boardToken(board.id);
  const pub = publicBoard(board, token);
  const text = publicText(board, token);
  const leaked = (board.entries || []).filter((e) => e.answer && text.includes(e.answer));
  if (leaked.length) {
    /* Fail closed, loudly in the log and quietly to the player — the same
       posture the daily keeps, and for the same reason: serving the board
       anyway would be serving the answers. */
    console.error("grid: catalogue board leaked an answer", board.id);
    return bad("That board is unavailable.", 500);
  }

  return json({ board: pub, source: bank.source });
}
