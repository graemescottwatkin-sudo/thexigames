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
import { gamePath } from "./permalink.js";

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
   { key, label } the archive may show, newest first, which the caller builds
   because only it knows what a board is called. */
export function answersIndex({ game, name, published, blurb }) {
  const base = SITE + gamePath(game) + "answers/";
  const links = published.map((b) =>
    `<li><a href="${esc(gamePath(game))}answers/${esc(b.key)}">${esc(b.label)}</a></li>`).join("");
  const body = published.length
    ? `<h1>${esc(name)} — answers</h1>
<p class="sub">Answers for every board more than ${ANSWERS_AFTER_DAYS} days old.
Newer boards stay sealed so the archive is worth playing.</p>
<ol>${links}</ol>
<a class="cta" href="${esc(gamePath(game))}">Play today's board</a>`
    : `<h1>${esc(name)} — answers</h1>
<p class="sub">Answers appear here once a board is more than ${ANSWERS_AFTER_DAYS} days old.
The game is new — the first will arrive shortly.</p>
<a class="cta" href="${esc(gamePath(game))}">Play today's board</a>`;

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
<p class="sub"><a href="${esc(gamePath(game))}answers/">All published answers</a></p>`;

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

/* FOR A GAME COUNTED IN BOARD NUMBERS. Every number from 1 up to the newest
   that has aged past the window — asked of answersAvailable rather than
   computed here, so the seal has one definition. */
export function publishedNumbers(now = Date.now()) {
  const today = dailyNumber(now);
  const out = [];
  for (let no = today; no >= 1; no--) if (answersAvailable(no, today)) out.push(no);
  return out;
}

/* FOR A GAME SCHEDULED BY DAY. Same question, asked in days: a day is
   published when the board number it stands for has aged past the window, so
   the two kinds of game cannot drift into two different windows. */
export function dayIsPublished(day, now = Date.now()) {
  const today = dailyNumber(now);
  for (let no = 1; no <= today; no++) {
    if (dailyDayKey(no) === String(day)) return answersAvailable(no, today);
  }
  return false;
}
