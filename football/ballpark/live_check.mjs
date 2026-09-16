/* football/ballpark/live_check.mjs — Ballpark XI, proved against production.
 *
 *   node football/ballpark/live_check.mjs [--expect v001d]
 *
 * THE GATE READS THE TREE AND CANNOT ANSWER ANY OF THIS. Who Am I's gate passed
 * 38 of 38 on a tree whose daily endpoint answered 500 in production for hours,
 * because the fault was a re-export that binds at import time and nothing in the
 * repo imports a Cloudflare Function. What a deploy actually did is only
 * knowable from outside it.
 *
 * WHAT THIS EXISTS TO CATCH, in order of how badly it would hurt:
 *
 *   1. an answer in the payload. This game's whole arrangement is that the page
 *      is handed a band and never the true value until a question is over.
 *   2. the endpoint being down, which is what happened to Who Am I.
 *   3. a board from the future, which is the leak with a date on it.
 *   4. the archive publishing a day that has not run.
 *
 * MIN_ASSERTIONS is the second net under the completion marker: the marker
 * catches a crash, the floor catches a block that goes quiet without crashing.
 * It is set BELOW the real count by the number that can legitimately skip.
 */
const BASE = "https://www.thexigames.com";
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
    headers: { "X-XI-Games": "1" }, cache: "no-store", ...opts,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* a page, not an endpoint */ }
  return { status: r.status, headers: r.headers, text, json };
};

console.log("Ballpark XI — live\n");

/* ---- the page ---- */
const page = await get("/football/ballpark/");
t("the page answers", page.status === 200, String(page.status));
t("and names the game", /Ballpark XI/.test(page.text));
if (EXPECT) {
  t("the build tag is what was expected",
    new RegExp(`js/game\\.js\\?v=${EXPECT}\\b`).test(page.text), EXPECT);
}
/* Every asset on one tag. The word search shipped with one ?v= left behind and
   the same URL then named different bytes for every browser holding it. */
const tags = [...page.text.matchAll(/(?:href|src)="(?:css|js)\/[^"?]+\?v=([^"]+)"/g)]
  .map((m) => m[1]);
t("every one of this game's assets carries the same tag",
  tags.length > 0 && new Set(tags).size === 1, tags.join(" "));

/* ---- the board ---- */
const daily = await get("/api/ballpark/daily");
t("the daily answers 200 rather than a 500", daily.status === 200,
  daily.status === 200 ? "" : daily.text.slice(0, 120));

if (daily.json && daily.json.board) {
  const b = daily.json.board;
  const qs = b.questions || [];
  t("it is eleven questions", qs.length === 11, String(qs.length));

  /* THE ASSERTION THIS FILE EXISTS FOR. The server judges; the page is handed a
     band and a slider. An answer in the payload ends the game quietly — the
     page would still look and behave exactly the same. */
  t("no answer anywhere in the payload, under any key",
    !/"answer"\s*:/.test(daily.text),
    "the true value arrives only when a question is over");
  /* JUDGED BY THE GAME'S OWN LEAK CHECKER, against the bytes production
     actually served.
     THE FIRST VERSION OF THIS BLOCK ASSERTED A RULE THIS GAME DOES NOT HAVE. It
     refused `tolerance` and `step` as "the answer's neighbours" — and they are
     in PUBLIC_KEYS on purpose, because the page has to draw the slider and show
     how close counts. The live payload was correct and my check was wrong, on
     its first execution, because I wrote down what I imagined the rule to be
     instead of asking the file that states it.
     leaks() IS that file's statement, so this now asks it rather than a second
     copy of my idea of it — and if PUBLIC_KEYS ever changes, this follows. */
  const { leaks } = await import("../../functions/_lib/bp-board.js");
  const leaked = leaks(b);
  t("no field outside the game's own PUBLIC_KEYS reaches the browser",
    leaked.length === 0,
    leaked.length ? leaked.join(", ")
      : [...new Set(qs.flatMap((q) => Object.keys(q)))].join(","));

  t("the board says which day it is", /^\d{4}-\d{2}-\d{2}$/.test(String(daily.json.day || "")),
    String(daily.json.day));
  t("and carries the family board number",
    Number(daily.json.no) > 0, String(daily.json.no));
} else {
  t("the daily returned a board", false, "no board in the payload");
}

/* ---- the bound, which is the leak with a date on it ---- */
const future = await get("/api/ballpark/daily?no=99999");
t("a board by a number that has not run is refused",
  future.status !== 200 || !(future.json && future.json.board),
  String(future.status));

/* ---- the archive ---- */
const arch = await get("/api/ballpark/archive");
t("the archive answers", arch.status === 200, String(arch.status));
if (arch.json && (arch.json.days || arch.json.boards || []).length) {
  const rows = arch.json.days || arch.json.boards;
  t("no day it lists is in the future", (() => {
    const today = new Date().toISOString().slice(0, 10);
    return rows.every((x) => String(x.day || x) <= today);
  })(), `${rows.length} listed`);
  /* IT OPENS WITH TWENTY-ONE DAYS IN IT, because LAUNCHED is the day this game
     began serving rather than the day it took a shirt. Derived rather than
     pinned: the archive may not list more days than the game has had. */
  t("and it lists no more days than the game has existed", (() => {
    const since = Math.floor(
      (Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse("2026-08-26")) / 86400000) + 1;
    return rows.length <= since;
  })(), `${rows.length} listed`);
} else {
  console.log("  --  the archive is empty, so its two assertions skip");
}

/* ---- the permalink, which is the route Who Am I launched with dead ---- */
const perma = await get("/football/ballpark/daily/1");
t("a board permalink resolves rather than 404ing",
  perma.status === 200, String(perma.status));
const archPage = await get("/football/ballpark/archive/");
t("and the archive page the hub links to resolves",
  archPage.status === 200, String(archPage.status));

/* ---- the family's HEAD contract ---- */
const head = await get("/api/ballpark/daily", { method: "HEAD" });
t("HEAD answers 200 with an empty body", head.status === 200 && head.text === "");
t("and /api/* is marked noindex",
  daily.headers.get("x-robots-tag") === "noindex",
  daily.headers.get("x-robots-tag") || "(absent)");

console.log(`\n${pass} passed, ${fail} failed`);
t("the run reached the end", true);
if (ran < MIN_ASSERTIONS) {
  console.log(`FLOOR  only ${ran} assertions ran, fewer than ${MIN_ASSERTIONS} — ` +
    "a block went quiet without crashing");
  process.exit(1);
}
process.exit(fail ? 1 : 0);
