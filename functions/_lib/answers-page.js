/* answers-page.js — the published archive, for every game that has one.
 *
 * WHY THIS EXISTS. Two of the five games published an answers archive and
 * three did not: /football/crossword/answers/ and /football/wordsearch/answers/
 * answered 200, and Scrambled, HiLo and Vowels answered 404. That was not a
 * decision anybody made — the crossword got one, the word search copied it, and
 * the three games built afterwards were never given theirs.
 *
 * It matters twice over. A board nobody can look up is a board that stops
 * existing the day after it runs; and the answers page is the CONTENT-RICH page
 * for a board — the game's own page is a shell that fills in by script, so the
 * answers page is where a search engine finds anything to read.
 *
 * ONE MODULE, NOT THREE ROUTES EACH. The crossword and the word search each
 * carry their own copy of this shape, and the two have already drifted — one
 * says "clues and answers", the other "the grid and the words". Rather than add
 * three more copies, the SHAPE is here and a game supplies only what is its
 * own: what a board is called, which boards are published, and what an answer
 * looks like. The two existing pages are left alone deliberately; moving them
 * onto this is a separate change with its own risk, and doing it in the same
 * commit as building three new ones would put five pages at risk to tidy two.
 *
 * THE SEAL IS NOT REDEFINED HERE. ANSWERS_AFTER_DAYS lives in _lib/daily.js
 * and is the one window; this asks answersAvailable() and never restates the
 * number, including in the sentence it prints.
 */
import { dailyNumber, answersAvailable, ANSWERS_AFTER_DAYS, dailyDayKey } from "./daily.js";
import { sitePage, htmlResponse } from "./site-page.js";
import { gamePath, permalinkPath } from "./permalink.js";
import { launchNumber } from "./games.js";

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SITE = "https://www.thexigames.com";

/* ONE IDENTICAL REFUSAL for a board that is sealed, that does not exist, or
   whose key is nonsense — the rule the crossword's answers pages already keep,
   so a probe cannot tell which of the three it hit. No content, no index. */
export function sealed() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

/* ---- the index ---------------------------------------------------------- */

/* `game` is the id; `name` is what it is called; `published` is the list of
   { key, label, board } the archive may show, newest first, which the caller
   builds because only it knows what a board is called. `board` is that board's
   PERMALINK key — the same board, at the address that plays it — and it is the
   caller's to supply because two games are addressed by a day here and by a
   number there. An entry without one simply gets no play link. */
export function answersIndex({ game, name, published, blurb }) {
  const base = SITE + gamePath(game) + "answers/";
  /* AND EACH ENTRY LINKS THE BOARD ITSELF. The permalinks shipped and nothing
     pointed at them: an answers DETAIL page linked the board it was about and
     that was the whole of it, five links for four hundred addresses. The
     detail pages are also the pages a reader reaches LAST, so the link was
     behind the answer — which is the wrong way round for anybody who wanted
     to play the board rather than read what it was. */
  const links = published.map((b) =>
    `<li><a href="${esc(gamePath(game))}answers/${esc(b.key)}">${esc(b.label)}</a>` +
    (b.board
      ? ` <a class="meta" href="${esc(permalinkPath(game, b.board))}">Play this board</a>`
      : "") + "</li>").join("");
  const body = published.length
    ? `<h1>${esc(name)} — answers</h1>
<p class="sub">Answers for every board more than ${ANSWERS_AFTER_DAYS} days old.
Newer boards stay sealed so the archive is worth playing.</p>
<ol>${links}</ol>
<a class="cta" href="${esc(gamePath(game))}">Play today's board</a>
<a class="cta ghost" href="${esc(gamePath(game))}archive/">Every board</a>`
    : `<h1>${esc(name)} — answers</h1>
<p class="sub">Answers appear here once a board is more than ${ANSWERS_AFTER_DAYS} days old.
The game is new — the first will arrive shortly.</p>
<a class="cta" href="${esc(gamePath(game))}">Play today's board</a>
<a class="cta ghost" href="${esc(gamePath(game))}archive/">Every board</a>`;

  /* An hour: long enough to be cheap, short enough that a board crossing the
     line appears the same morning. */
  return htmlResponse(sitePage({
    title: `${name} answers — every published board`,
    description: `Answers for past ${name} boards. Boards are published ${ANSWERS_AFTER_DAYS} days after they run.`,
    canonical: base,
    current: gamePath(game) + "answers/",
    game,
    body,
  }), { maxAge: 3600 });
}

/* ---- one board ---------------------------------------------------------- */

/* `rows` is [{ label, answer, note }] — whatever an answer is in that game.
   The caller decides; this decides nothing about content and only how it is
   laid out, which is the half that should look the same in all five. */
export function answersBoard({ game, name, key, heading, sub, rows, prev, next }) {
  const base = SITE + gamePath(game) + "answers/" + key;
  const list = rows.map((r) =>
    `<li><b>${esc(r.label)}</b> ${esc(r.answer)}` +
    (r.note ? ` <span class="meta">${esc(r.note)}</span>` : "") + "</li>").join("");
  const nav = [
    prev ? `<a href="${esc(gamePath(game))}answers/${esc(prev)}">&larr; Previous board</a>` : "",
    next ? `<a href="${esc(gamePath(game))}answers/${esc(next)}">Next board &rarr;</a>` : "",
  ].filter(Boolean).join(" &middot; ");

  const body = `<h1>${esc(heading)}</h1>
${sub ? `<p class="sub">${esc(sub)}</p>` : ""}
<ol class="answers">${list}</ol>
${nav ? `<p class="sub">${nav}</p>` : ""}
<a class="cta" href="${esc(gamePath(game))}">Play today's board</a>
<p class="sub"><a href="${esc(gamePath(game))}answers/">All published answers</a>
&middot; <a href="${esc(gamePath(game))}archive/">Every board</a></p>`;

  return htmlResponse(sitePage({
    title: `${heading} — ${name} answers`,
    description: `The answers to ${heading}: all ${rows.length} of them, with the board they came from.`,
    canonical: base,
    current: gamePath(game) + "answers/",
    game,
    body,
  }), { maxAge: 86400 });      // a published board never changes again
}

/* ---- which boards are published ----------------------------------------- */

/* FOR A GAME COUNTED IN BOARD NUMBERS. Every number from the game's LAUNCH up
   to the newest that has aged past the window — asked of answersAvailable
   rather than computed here, so the seal has one definition.
 *
 * FROM THE LAUNCH, NOT FROM ONE, and the difference is four pages per game.
 * This counted down to board 1 for every game, so Scrambled — launched on
 * 1 September, board seven — published answers for boards 1 to 4, which are
 * days it did not exist, and Vowels published the same four. Nobody played
 * those boards; the ring generates them for any number, which is what made
 * them look real. The launch is games.js's fact and the game is now named
 * when this is asked. */
export function publishedNumbers(game, now = Date.now()) {
  const today = dailyNumber(now);
  const from = launchNumber(game);
  if (!from) return [];
  const out = [];
  for (let no = today; no >= from; no--) if (answersAvailable(no, today)) out.push(no);
  return out;
}

/* FOR A GAME SCHEDULED BY DAY. Same question, asked in days: a day is
   published when the board number it stands for has aged past the window, so
   the two kinds of game cannot drift into two different windows. The game is
   named for the same reason as above — a day before it launched is not a day
   it ran, whichever way the board is addressed. */
export function dayIsPublished(game, day, now = Date.now()) {
  const today = dailyNumber(now);
  const from = launchNumber(game);
  if (!from) return false;
  for (let no = from; no <= today; no++) {
    if (dailyDayKey(no) === String(day)) return answersAvailable(no, today);
  }
  return false;
}
