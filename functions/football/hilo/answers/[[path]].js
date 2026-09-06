/* GET /football/hilo/answers/ and /football/hilo/answers/<day>
 *
 * The published archive. HiLo XI had none, for the same reason Scrambled and
 * Vowels had none: the crossword got one, the word search copied it, and the
 * three games built afterwards were never given theirs.
 *
 * WHAT AN ANSWER IS HERE: the twelve values, in the order they were called.
 * The chain IS the board — the game is whether the next one is higher or lower
 * — so publishing the values publishes the board, which is exactly what an
 * archive is for once the seal is past.
 *
 * ADDRESSED BY DAY, because that is what HiLo's schedule is keyed on. The
 * SEAL is still the family's one window: a day is published when the board
 * NUMBER it stands for has aged past it, so the two kinds of game cannot drift
 * into two different rules. See _lib/answers-page.js dayIsPublished.
 */
import { loadBank, boardById } from "../../../_lib/hl-board.js";

/* HiLo's bank exposes its calendar as a map rather than a lookup, so the day is
   resolved here — one line, and it stays beside the only caller that needs it
   rather than becoming a second boardForDay in the shared lib. */
const boardForDay = (bank, day) => {
  const id = (bank.schedule || {})[String(day)];
  return id ? boardById(bank, id) : null;
};
import {
  answersIndex, answersBoard, dayIsPublished, sealed,
} from "../../../_lib/answers-page.js";
import { dailyNumber, dailyDayKey, answersAvailable } from "../../../_lib/daily.js";

const NAME = "HiLo XI";
const GAME = "hilo";

const dayLabel = (d) => {
  const M = ["January", "February", "March", "April", "May", "June", "July",
             "August", "September", "October", "November", "December"];
  const [y, m, dd] = String(d).split("-");
  return M[Number(m) - 1] ? `${Number(dd)} ${M[Number(m) - 1]} ${y}` : String(d);
};

export async function onRequestGet({ env, params }) {
  const parts = [].concat((params && params.path) || []).filter(Boolean);
  if (parts.length > 1) return sealed();

  const bank = await loadBank(env);
  const today = dailyNumber();

  if (!parts.length) {
    /* Every day the schedule has, back to board one, that is past the seal. */
    const published = [];
    for (let no = today; no >= 1; no--) {
      const day = dailyDayKey(no);
      if (!day || !answersAvailable(no, today)) continue;
      const board = boardForDay(bank, day);
      if (!board) continue;
      /* The permalink key is the board NUMBER, even here where the answers
         are addressed by day: one address shape for every game, decided on
         6 Sep 2026. The number is already in hand — it is the loop. */
      published.push({ key: day, board: String(no),
                       label: dayLabel(day) + " — " + board.category });
    }
    return answersIndex({ game: GAME, name: NAME, published });
  }

  const day = parts[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return sealed();
  if (!dayIsPublished(GAME, day)) return sealed();

  const board = boardForDay(bank, day);
  if (!board) return sealed();

  /* THE WHOLE CHAIN, values and all. The first row is the one the player was
     given; the eleven after it are the calls. Numbered so the page reads as
     the board did. */
  const rows = (board.chain || []).map((r, i) => ({
    label: i === 0 ? "Given" : "Call " + i,
    answer: r.name,
    note: r.value == null ? null : String(r.value) + (board.unit === "year" ? "" : ""),
  }));

  return answersBoard({
    game: GAME, name: NAME, key: day,
    heading: dayLabel(day),
    sub: board.category + (board.subtitle ? " — " + board.subtitle : ""),
    rows,
    prev: null, next: null,
  });
}
