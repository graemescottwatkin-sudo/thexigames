/* POST /api/crossword_fr/check   mark a Friends board, entry by entry
     { no, filled: { "3,4": "M", ... }, revealed: ["FIX0001", ...] }
  -> { no, entries: [{ id, num, dir, correct }], correct, revealed, score, kept }

   THE SERVER MARKS, BECAUSE THE SERVER IS THE ONLY SIDE THAT HAS THE ANSWERS.
   That is not a policy choice here, it is the consequence of the one in
   daily.js: the board goes out through publicPuzzle(), which cannot carry a
   letter, so the page has nothing to compare against and could not mark itself
   if it wanted to. The football crossword answers the same way through
   /api/check-answer.

   PER ENTRY, NEVER PER CELL, and the difference is the whole security of it.
   Marking one cell at a time turns this endpoint into an oracle: twenty-six
   requests read a letter, and a few hundred read the board. Marking an entry
   tells a player only what they already staked a whole answer on — which is
   what checking IS — and a brute-force costs the full search space of the word.

   AND IT NEVER SENDS A LETTER BACK, right or wrong. A response that named the
   correct letters of a wrong entry would be a reveal that the player did not
   ask for and was not charged for. What comes back is a boolean an entry at a
   time, and the score. Revealing is a separate, priced act — see fr-score.js. */

import { json, bad, cellKey } from "../../_lib/puzzle.js";
import { csrfOk } from "../../_lib/auth.js";
import { boardScore, keptTheDay, ENTRIES, TOTAL } from "../../_lib/fr-score.js";
import { storedNo } from "../../_lib/fr-board.js";

const norm = (s) => String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function onRequestPost({ request, env }) {
  if (!csrfOk(request)) return bad("Refused.", 403);

  let sent;
  try {
    sent = await request.json();
  } catch {
    return bad("Not a request.");
  }

  const no = Number(sent && sent.no);
  if (!Number.isInteger(no) || no < 1) return bad("Not a board number.");

  /* A PLAIN OBJECT OF CELLS, AND NOTHING LARGER. An unbounded body is an
     unbounded amount of work per request, and the largest board the bank holds
     is 15x16 — so a filled grid cannot honestly carry more cells than that.
     Refused rather than truncated: a truncated grid would be marked as if the
     player had left the rest blank, which is a wrong answer invented by the
     server. */
  const filled = sent && sent.filled;
  if (!filled || typeof filled !== "object" || Array.isArray(filled)) {
    return bad("Not a grid.");
  }
  if (Object.keys(filled).length > 400) return bad("Not a grid.");

  const revealed = Array.isArray(sent && sent.revealed)
    ? sent.revealed.slice(0, ENTRIES).map((v) => String(v).slice(0, 40))
    : [];

  /* THE SAME CONVERSION THE DAILY ROUTE MAKES, from the same place. Marking a
     grid against the wrong board would tell a player every answer was wrong,
     which is the loudest possible way to be off by the launch offset. */
  const board = storedNo(no);
  const row = board === null ? null : await env.DB.prepare(
    "SELECT payload FROM fr_puzzles WHERE mode = 'daily' AND daily_no = ?1"
  ).bind(board).first();
  if (!row) return bad("No such board.", 404);

  let puzzle;
  try {
    puzzle = JSON.parse(row.payload).puzzle;
  } catch {
    puzzle = null;
  }
  if (!puzzle || !puzzle.cells || !Array.isArray(puzzle.entries)) {
    console.error("crossword_fr: board " + no + " is not markable");
    return bad("That board is unavailable.", 500);
  }

  const wasRevealed = new Set(revealed);
  let correct = 0;
  let shown = 0;

  const entries = puzzle.entries.map((e) => {
    const want = (e.cells || []).map((c) => {
      const cell = puzzle.cells[cellKey(c)];
      return cell && cell.ch ? cell.ch : "";
    }).join("");
    const got = (e.cells || []).map((c) => filled[cellKey(c)] || "").join("");

    /* An entry with no stored letters cannot be marked, and marking it correct
       because two empty strings match is the shape of bug that hands a player
       a point for nothing. It is wrong instead, and the board is logged. */
    const ok = norm(want).length > 0 && norm(want) === norm(got);
    if (ok) correct++;
    if (ok && wasRevealed.has(e.row && e.row.id)) shown++;

    return {
      id: e.row && e.row.id,
      num: e.num,
      dir: e.dir,
      correct: ok,
    };
  });

  const total = entries.length || ENTRIES;

  return json({
    no,
    entries,
    correct,
    revealed: shown,
    score: boardScore(correct, shown, total),
    /* THE CEILING TRAVELS WITH THE SCORE. The full-time panel renders "88/110"
       and the share text says the same, and the only way for the page to know
       the 110 was to write it down a second time -- which is exactly how a
       total changes on the server and a page goes on showing the old one. It is
       sent, so fr-score.js stays the only place the rule LIVES and the page
       only draws it. The same reasoning as answersAfter on the daily. */
    total: TOTAL,
    kept: keptTheDay(correct, total),
  });
}
