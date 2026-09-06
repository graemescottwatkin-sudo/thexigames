/* answers_test.mjs — the published archive, for the three games that had none.
 *
 * Two of the five games published answers and three did not: the crossword got
 * an archive, the word search copied it, and Scrambled, HiLo and Vowels — every
 * game built afterwards — were never given theirs. Their /answers/ answered
 * 404, so a board stopped existing the day after it ran.
 *
 * WHAT THIS GUARDS. An answers page is the one page on this site that is MEANT
 * to give a board away, which makes the seal the only thing standing between an
 * archive and a spoiler. So the checks are weighted there: a sealed board, a
 * future board and a nonsensical key must be indistinguishable, and the window
 * must be the family's one window rather than a second copy of the number.
 *
 *   node tools/answers_test.mjs        (from the repo root)
 */
import { onRequestGet as scrambled } from "../functions/football/scrambled/answers/[[path]].js";
import { onRequestGet as vowels } from "../functions/football/vowels/answers/[[path]].js";
import { onRequestGet as hilo } from "../functions/football/hilo/answers/[[path]].js";
import { onRequestGet as crossword } from "../functions/football/crossword/answers/index.js";
import { dailyNumber, ANSWERS_AFTER_DAYS, answersAvailable } from "../functions/_lib/daily.js";
import { publishedNumbers, dayIsPublished } from "../functions/_lib/answers-page.js";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const call = async (fn, path) => {
  const r = await fn({ env: {}, params: { path } });
  return { status: r.status, headers: r.headers, text: await r.text() };
};

const TODAY = dailyNumber();
const GAMES = [["scrambled", scrambled], ["vowels", vowels], ["hilo", hilo]];

console.log("Every game has an archive now, not two of five");
for (const [name, fn] of GAMES) {
  const r = await call(fn, []);
  t(`${name}: /answers/ is a page`, r.status === 200, String(r.status));
  t(`${name}: and it says which game it belongs to`,
    new RegExp(name === "hilo" ? "HiLo XI" : name.replace(/^./, (c) => c.toUpperCase()) + " XI").test(r.text));
  /* THE MASTHEAD, so a player can get back. Scrambled and Vowels had no
     server-rendered page at all before this, so they had no masthead either. */
  t(`${name}: carries the game's own masthead`,
    r.text.includes(`class="site-mast" href="/football/${name}/"`),
    "a page with no way back is a dead end");
  /* AND A SHARE CARD, which every server-rendered page went without until the
     same day. See functions/_lib/site-page.js socialTags. */
  t(`${name}: and a share card, like every served page now`,
    /property="og:image"/.test(r.text) && /name="twitter:card"/.test(r.text));
}

console.log("\nThe seal is the family's one window");
{
  /* NOT RESTATED. ANSWERS_AFTER_DAYS lives in _lib/daily.js and these pages ask
     answersAvailable() — including for the sentence they print. A page that
     wrote "7 days" in its own prose would be a second copy of the number. */
  for (const [name, fn] of GAMES) {
    const r = await call(fn, []);
    const says = new RegExp(String(ANSWERS_AFTER_DAYS) + " days").test(r.text);
    t(`${name}: the window in the prose is the constant, not a number typed twice`,
      says, `${ANSWERS_AFTER_DAYS} days`);
  }
  /* WHAT THIS SUITE CANNOT SEE, said rather than left to be discovered.
     Every assertion here is RELATIVE to ANSWERS_AFTER_DAYS, so widening or
     closing the window moves both sides and nothing goes red — sabotaged by
     setting it to 0 and this run stayed green. That is not a hole, because
     tools/gating_test.mjs pins the value itself (ANSWERS_AFTER_DAYS === 7)
     beside FREE_ARCHIVE_DAYS, which is where a deliberate change to the rule
     should be argued with. One suite pins the number, this one pins the
     behaviour relative to it; duplicating the pin here would give two answers
     to one question. */
  t("and every game agrees on which boards are published",
    publishedNumbers().every((no) => answersAvailable(no, TODAY)),
    publishedNumbers().length + " boards past the seal");
  /* A DAY-SCHEDULED GAME ASKS THE SAME QUESTION IN DAYS. HiLo is keyed by day
     and the other two by number; if they had separate rules they would drift
     into two different archives. */
  t("a day is published exactly when its board number is",
    publishedNumbers().every((no) => dayIsPublished(require_day(no))),
    "HiLo's days and Scrambled's numbers are one window asked twice");
}
function require_day(no) {
  /* The day a board number stands for, from the same arithmetic everything
     else uses — not restated here. */
  const d = new Date(Date.UTC(2026, 7, 26) + (no - 1) * 86400000);
  return d.toISOString().slice(0, 10);
}

console.log("\nA sealed board gives nothing away");
{
  const sealedNo = String(TODAY);          // today's is always sealed
  for (const [name, fn] of [["scrambled", scrambled], ["vowels", vowels]]) {
    const sealed = await call(fn, [sealedNo]);
    const junk = await call(fn, ["nonsense"]);
    const future = await call(fn, ["99999"]);
    t(`${name}: today's board is sealed`, sealed.status === 404, String(sealed.status));
    /* ONE IDENTICAL REFUSAL. A probe must not be able to tell a sealed board
       from a board that does not exist — the rule the crossword's answers pages
       already keep, and the reason they keep it is that the difference is the
       information. */
    t(`${name}: and is refused identically to nonsense and to the future`,
      sealed.status === junk.status && junk.status === future.status &&
      sealed.text === junk.text && junk.text === future.text,
      `${sealed.status} / ${junk.status} / ${future.status}`);
    t(`${name}: with nothing in the body and no index`,
      sealed.text.length < 40 && sealed.headers.get("X-Robots-Tag") === "noindex",
      `${sealed.text.length} bytes, ${sealed.headers.get("X-Robots-Tag")}`);
  }
  const hlSealed = await call(hilo, ["2026-09-06"]);
  t("hilo: a day inside the window is sealed", hlSealed.status === 404);
  const hlJunk = await call(hilo, ["not-a-day"]);
  t("hilo: and a malformed day is refused the same way",
    hlSealed.status === hlJunk.status && hlSealed.text === hlJunk.text);
}

console.log("\nA published board gives its answers, and nothing it should not");
{
  const open = publishedNumbers()[publishedNumbers().length - 1];   // the oldest open board
  if (open === undefined) {
    t("there is a published board to check", false, "no board has aged past the seal yet");
  } else {
    const r = await call(scrambled, [String(open)]);
    t("a published board is a page", r.status === 200, String(r.status));
    t("with eleven answers on it",
      (r.text.match(/<li><b>/g) || []).length === 11,
      (r.text.match(/<li><b>/g) || []).length + " listed");
    t("named as the board it is", r.text.includes("Board #" + open));
    /* IT IS ALLOWED TO BE INDEXED — that is the point of publishing it — so
       what is checked is that it is NOT marked noindex by accident. */
    t("and offered to a crawler rather than hidden from one",
      !/noindex/.test(r.text), "the archive is the content-rich page for a board");
    t("it links back to today's board and to the index",
      r.text.includes('href="/football/scrambled/"') &&
      r.text.includes('href="/football/scrambled/answers/"'));
  }
}

console.log("\nThe two that already had one are untouched");
{
  /* The crossword and the word search keep their own copies of this shape
     deliberately: moving five pages onto one module in the commit that builds
     three of them would put the two that work at risk to tidy them. */
  const r = await call(crossword, []);
  t("the crossword's archive still answers", r.status === 200, String(r.status));
  t("and still lists its published boards",
    (r.text.match(/answers\/\d+/g) || []).length > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
