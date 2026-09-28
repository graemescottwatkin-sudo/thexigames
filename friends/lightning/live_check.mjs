/* friends/lightning/live_check.mjs — Lightning Round XI: Friends, proved
 * against production.
 *
 *   node friends/lightning/live_check.mjs [--expect v001a]
 *
 * THE GATE READS THE TREE AND CANNOT ANSWER ANY OF THIS. Its tables (migration
 * 047) and its pool are applied to D1 by hand, separately from the deploy, and
 * a stubbed database cannot prove a query: Who Am I XI: Friends' daily answered
 * "no such table" in production while every suite was green. Only production
 * says whether all three landed.
 *
 * WHAT THIS EXISTS TO CATCH, in order of how badly it would hurt:
 *
 *   1. an ANSWER leaving the server mid-run. Answers are held back until the
 *      run is over (the owner, 28 Sep 2026); a verdict carrying one would make
 *      unlimited practice a way to read the bank out.
 *   2. a run being ended early, or a pick being marked, on the page's say-so
 *      rather than the server's clock.
 *   3. a board from the future, which is a daily seen before its day.
 *   4. the game NOT being found: it launched public, so a noindex, a missing
 *      sitemap entry or a team sheet without it is the fault.
 *   5. the endpoints simply being down, or the tables absent.
 *
 * IT PLAYS A PRACTICE RUN, NOT THE DAILY. A practice run is anonymous, is never
 * banked and takes nothing from anybody; a daily started by this file would be
 * a daily played. Each run of this file costs one practice start against the
 * hourly cap, from wherever it is run.
 *
 * MIN_ASSERTIONS is the second net under the completion marker: the marker
 * catches a crash, the floor catches a block that goes quiet without crashing.
 */
import { gamePath } from "../../functions/_lib/permalink.js";

const BASE = "https://www.thexigames.com";
const GAME = "lightning_fr";
const PATH = gamePath(GAME);
/* Every assertion below runs on a healthy deploy; none skips by design. */
const MIN_ASSERTIONS = 20;

const expectAt = process.argv.indexOf("--expect");
const EXPECT = expectAt > -1 ? process.argv[expectAt + 1] : null;

let pass = 0, fail = 0, ran = 0;
const t = (n, ok, d) => {
  ran++; ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`);
};

const get = async (path, opts = {}) => {
  const r = await fetch(BASE + path, {
    headers: { "X-XI-Games": "1", "Content-Type": "application/json" }, cache: "no-store", ...opts,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* a page, not an endpoint */ }
  return { status: r.status, headers: r.headers, text, json };
};
const post = (path, body) => get(path, { method: "POST", body: JSON.stringify(body) });

console.log("Lightning Round XI: Friends — live\n");

/* ---- the page ---- */
const page = await get(PATH);
t("the page answers", page.status === 200, String(page.status));
if (EXPECT) {
  t("the build tag is what was expected",
    new RegExp(`js/game\\.js\\?v=${EXPECT}\\b`).test(page.text), EXPECT);
}
const tags = [...page.text.matchAll(/(?:href|src)="(?:css|js)\/[^"?]+\?v=([^"]+)"/g)].map((m) => m[1]);
t("every one of this game's assets carries the same tag",
  tags.length >= 3 && new Set(tags).size === 1, tags.join(" "));
if (page.status === 200) {
  t("the served page is indexable, and is this game's page",
    !/<meta[^>]+name="robots"[^>]+noindex/i.test(page.text)
      && page.text.includes('<link rel="canonical" href="' + BASE + PATH + '">'));
} else {
  console.log("  --  indexing NOT checked: the page did not answer 200. This is not a pass.");
}

const sitemap = await get("/sitemap.xml");
t("the sitemap advertises this game's front page", sitemap.status === 200 && sitemap.text.includes(BASE + PATH + "<"));

/* THE SHIPPED CHROME, at the address the page asks for, ?v= and all: the
   CDN holds each version for a year, so an unversioned fetch reads bytes no
   page downloads. */
const chromeRef = (page.text.match(/src="(\/shared\/xi-chrome\.js\?v=[^"]+)"/) || [])[1];
const chrome = chromeRef ? await get(chromeRef) : { status: 0, text: "" };
t("the shipped chrome puts it on the Friends team sheet, named and linked",
  chrome.status === 200 && chrome.text.includes('name: "Lightning Round XI: Friends", href: "' + PATH + '"'),
  chromeRef || "no chrome reference on the page");

/* ---- which board ---- */
const today = await get("/api/lightning_fr/daily");
t("the board endpoint answers today's number and day",
  today.status === 200 && !!today.json && Number.isInteger(today.json.no) && /^\d{4}-\d{2}-\d{2}$/.test(today.json.day)
    && today.json.isToday === true, today.text.slice(0, 120));
const tomorrow = today.json ? await get("/api/lightning_fr/daily?no=" + (today.json.no + 1)) : { status: 0 };
t("and tomorrow's board is no board", tomorrow.status === 404, String(tomorrow.status));
const perma = today.json ? await get(PATH + "daily/" + today.json.no) : { status: 0 };
t("today's board has its own address", perma.status === 200, String(perma.status));
const archive = await get(PATH + "archive/");
t("and the archive answers", archive.status === 200, String(archive.status));

/* ---- a practice run, against the real tables ---- */
const refused = await get("/api/lightning_fr/start", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "practice" }),
});
t("a start without the family header is refused", refused.status === 403, String(refused.status));

const start = await post("/api/lightning_fr/start", { mode: "practice" });
t("a practice run starts: the tables and the pool are there", start.status === 200 && !!start.json && !!start.json.runId,
  start.status === 200 ? "" : start.text.slice(0, 160));
const q1 = start.json && start.json.question;
t("with question one and four options", !!q1 && typeof q1.clue === "string" && Array.isArray(q1.options) && q1.options.length === 4);
t("and no answer anywhere in it", !/"answer"/.test(start.text));
t("and the full minute on the server's clock", !!start.json && start.json.msLeft === 60000, start.json && String(start.json.msLeft));

let verdict = null;
if (q1) {
  /* A pick that is not one of the four is refused, not marked. */
  const bad = await post("/api/lightning_fr/answer", { runId: start.json.runId, idx: 1, pick: "Not an option at all" });
  t("a pick that was not offered is refused", bad.status === 400, String(bad.status));
  verdict = await post("/api/lightning_fr/answer", { runId: start.json.runId, idx: 1, pick: q1.options[0] });
  t("a pick is marked", verdict.status === 200 && !!verdict.json && typeof verdict.json.correct === "boolean",
    verdict.text.slice(0, 120));
  /* THE ONE THIS FILE EXISTS FOR: right or wrong, the verdict names nothing. */
  t("and the verdict carries no answer, right or wrong", !/"answer"/.test(verdict.text));
  t("and brings the next question with it",
    !!verdict.json && !!verdict.json.next && verdict.json.next.idx === 2 && verdict.json.next.options.length === 4);
  const early = await post("/api/lightning_fr/finish", { runId: start.json.runId });
  t("the run cannot be ended while the server's clock has time on it", early.status === 409, String(early.status));
} else {
  console.log("  --  the run was NOT played: no question came back. This is not a pass.");
}

/* ---- the end ---- */
console.log(`\n${pass} passed, ${fail} failed`);
const complete = ran >= MIN_ASSERTIONS;
if (!complete) console.log(`FAIL  only ${ran} assertions ran; a complete run makes at least ${MIN_ASSERTIONS}`);
console.log("live_check complete");
process.exit(fail || !complete ? 1 : 0);
