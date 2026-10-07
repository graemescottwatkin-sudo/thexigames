/* friends/wordsearch/live_check.mjs — Wordsearch XI: Friends, proved against
 * production.
 *
 *   node friends/wordsearch/live_check.mjs [--expect v001a]
 *
 * THE GATE READS THE TREE AND CANNOT ANSWER ANY OF THIS. The tables (migration
 * 048) and the boards are put into D1 by hand, apart from the deploy, and a
 * stubbed database cannot prove a query. Only production says whether all
 * three landed.
 *
 * WHAT THIS EXISTS TO CATCH, in order of how badly it would hurt:
 *
 *   1. an ANSWER leaving the server with today's board. The list is CLUES and
 *      the answers are what is hunted, so the served daily carries clues and
 *      lengths only: no word, no placement, no secret.
 *   2. today's board served WHOLE through the free-play route.
 *   3. the game NOT being found: it launched public, so a noindex, a missing
 *      sitemap entry or a team sheet without it is the fault.
 *   4. the endpoints simply being down, or the tables or boards absent.
 *
 * IT NEVER PLAYS THE DAILY. No round is started: a drag sent with no round is
 * judged against today's board and recorded nowhere, so this file costs nobody
 * a daily and writes no row.
 *
 * MIN_ASSERTIONS is the second net under the completion marker: the marker
 * catches a crash, the floor catches a block that goes quiet without crashing.
 */
import { gamePath } from "../../functions/_lib/permalink.js";

const BASE = "https://www.thexigames.com";
const GAME = "wordsearch_fr";
const PATH = gamePath(GAME);
const API = "/api/wordsearch_fr/";
/* Every assertion below runs on a healthy deploy; none skips by design. */
const MIN_ASSERTIONS = 18;

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
const post = (path, body, headers) => get(path, { method: "POST", body: JSON.stringify(body),
  ...(headers ? { headers } : {}) });

console.log("Wordsearch XI: Friends — live\n");

/* ---- the page ---- */
const page = await get(PATH);
t("the page answers", page.status === 200, String(page.status));
if (EXPECT) {
  t("the build tag is what was expected", new RegExp(`js/game\\.js\\?v=${EXPECT}\\b`).test(page.text), EXPECT);
}
const tags = [...page.text.matchAll(/(?:href|src)="(?:css|js)\/[^"?]+\?v=([^"]+)"/g)].map((m) => m[1]);
t("every one of this game's assets carries the same tag", tags.length >= 2 && new Set(tags).size === 1, tags.join(" "));
if (page.status === 200) {
  t("the served page is indexable, and is this game's page",
    !/<meta[^>]+name="robots"[^>]+noindex/i.test(page.text)
      && page.text.includes('<link rel="canonical" href="' + BASE + PATH + '">'));
} else {
  console.log("  --  indexing NOT checked: the page did not answer 200. This is not a pass.");
}
const sitemap = await get("/sitemap.xml");
t("the sitemap advertises this game's front page", sitemap.status === 200 && sitemap.text.includes(BASE + PATH + "<"));
const chromeRef = (page.text.match(/src="(\/shared\/xi-chrome\.js\?v=[^"]+)"/) || [])[1];
const chrome = chromeRef ? await get(chromeRef) : { status: 0, text: "" };
t("the shipped chrome puts it on the Friends team sheet, named and linked",
  chrome.status === 200 && chrome.text.includes('name: "Wordsearch XI: Friends", href: "' + PATH + '"'),
  chromeRef || "no chrome reference on the page");

/* ---- today's board, as a player is served it ---- */
const daily = await get(API + "daily");
const p = daily.json && daily.json.puzzle;
t("today's board is served: the tables and the boards are there", daily.status === 200 && !!p && /^FRWS-\d{4}$/.test(p.id),
  daily.text.slice(0, 120));
t("with its day and its board number", !!daily.json && /^\d{4}-\d{2}-\d{2}$/.test(daily.json.day) && Number.isInteger(daily.json.no));
/* THE ANSWERS ARE THE LIST since 6 Oct 2026 (the owner: "no clues just
   answers"): each entry is its place, its word and its length, and nothing
   else -- no clue, no placement. The secret word is still withheld; /secret
   names it once it is earned. */
t("eleven answers, each only its place, its word and its length",
  !!p && p.answers.length === 11 && p.answers.every((a, i) => a.n === i && typeof a.display === "string" && a.display &&
    Number.isInteger(a.len) && Object.keys(a).sort().join() === "display,len,n"));
t("THE BOARD CARRIES NO PLACEMENT AND NO SECRET WORD",
  !!p && !/placement|start_row/.test(JSON.stringify({ ...p, grid: [] })) &&
    !!p.bonus && !("display" in p.bonus) && !("grid" in p.bonus) && Number.isInteger(p.bonus.showAfter));
t("a 14 by 12 grid", !!p && p.grid.length === 14 && p.grid.every((r) => /^[A-Z]{12}$/.test(r)));

const whole = p ? await get(API + "puzzle?id=" + p.id) : { status: 0 };
t("and today's board is refused whole by the free-play route", whole.status === 404, String(whole.status));
const cat = await get(API + "catalog");
t("the catalogue answers and does not list today's board",
  cat.status === 200 && !!cat.json && Array.isArray(cat.json.boards) && !!p && !cat.json.boards.some((b) => b.id === p.id));

/* ---- the judging, touching nothing ---- */
const noHeader = await post(API + "find", { from: [0, 0], to: [0, 3] }, { "Content-Type": "application/json" });
t("a selection without the family header is refused", noHeader.status === 403, String(noHeader.status));
const miss = await post(API + "find", { from: [13, 0], to: [13, 0] });
t("a selection is judged by the server and says no more than no",
  miss.status === 200 && !!miss.json && miss.json.hit === null && miss.json.foul === true && !miss.json.fouls,
  miss.text.slice(0, 120));
const fin = await post(API + "finish", {});
t("finishing a round nobody named is refused", fin.status === 400, String(fin.status));

/* ---- its addresses ---- */
const perma = daily.json && Number.isInteger(daily.json.no) ? await get(PATH + "daily/" + daily.json.no) : { status: 0 };
t("today's board has its own address", perma.status === 200, String(perma.status));
const archivePage = await get(PATH + "archive/");
t("and the archive page answers", archivePage.status === 200, String(archivePage.status));
const archive = await get(API + "archive");
t("the previous dailies stop before today, each with its number",
  archive.status === 200 && !!archive.json && archive.json.days.every((d) => d.day < archive.json.today && Number.isInteger(d.no)));

/* ---- the end ---- */
console.log(`\n${pass} passed, ${fail} failed`);
const complete = ran >= MIN_ASSERTIONS;
if (!complete) console.log(`FAIL  only ${ran} assertions ran; a complete run makes at least ${MIN_ASSERTIONS}`);
console.log("live_check complete");
process.exit(fail || !complete ? 1 : 0);
