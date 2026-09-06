/* grid/live_check.mjs — what the live site is actually doing with Grid XI.
 *
 * The gap this fills: every suite in this repo runs against the working tree.
 * They tell you the code is right; they cannot tell you the deploy landed, the
 * migration took, or that the board being served is the one you imported.
 *
 * Reads only, with ONE deliberate exception, and it is worth naming: proving
 * that a guess is marked server-side means POSTING a guess. It is done with a
 * play id of null, so no round is opened and no row is written — the same
 * request an older page or a suite makes, and the arrangement gd-round.js was
 * built to allow. Nothing here starts a round, banks a score or signs in.
 *
 *   node football/grid/live_check.mjs
 *   node football/grid/live_check.mjs --expect v001
 *
 * GRID XI IS NOT LAUNCHED. So this checks two things at once: that the parts
 * that exist work, and that the parts that must NOT exist yet still do not —
 * a game with a live API is a game that can leak before anybody has heard of
 * it, and the sitemap and the hub are where that would show.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gamePath } from "../../functions/_lib/permalink.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const HUB = "https://www.thexigames.com";
const SITE = HUB + gamePath("grid").replace(/\/$/, "");
const want = (() => {
  const i = process.argv.indexOf("--expect");
  return i > -1 ? process.argv[i + 1] : null;
})();

let pass = 0, fail = 0, warn = 0, reached_end = false;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const w = (n, d) => { warn++; console.log(`  ??  ${n}${d ? "  — " + d : ""}`); };

/* THE FLOOR, and it is the second net under the completion guard: the marker
   catches a crash, this catches a block that goes quiet without crashing. Set
   BELOW the run's real count on purpose, by the number of assertions that can
   legitimately skip. Reviewed when assertions are added — a floor set to the
   exact count flaps on a legitimate skip, and a floor left alone for five
   releases stops being able to refuse anything. */
const MIN_ASSERTIONS = 18;

const get = (url) => fetch(url, { headers: { accept: "application/json" } });

console.log(`\n${SITE}\n`);

/* ---- the page ----------------------------------------------------------- */
console.log("The page is being served");
const page = await fetch(SITE + "/");
const html = await page.text();
t("the page answers", page.status === 200, String(page.status));
const tag = (html.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1];
t("and names a build tag", !!tag, tag);
if (want) t(`and it is the version expected (${want})`, tag === want, `live ${tag}`);
else w("no --expect given, so the version is unjudged", tag);
t("the shared layer is on its own plain vN, not this game's", (() => {
  const shared = [...html.matchAll(/\/shared\/[a-z-]+\.(?:css|js)\?v=(v\d+)"/g)].map((m) => m[1]);
  return shared.length > 0 && shared.every((x) => /^v\d+$/.test(x) && x !== tag);
})());
t("NO ANSWER IS IN THE MARKUP", !/answer"\s*:/.test(html),
  "the grid starts empty; a letter in the page is a letter given away");

/* ---- the board the API serves ------------------------------------------- */
console.log("\nThe board, from D1");
const dailyRes = await get(HUB + "/api/grid/daily");
const daily = await dailyRes.json();
t("/api/grid/daily answers", dailyRes.status === 200, String(dailyRes.status));
t("and it is serving from the database, not the two-board sample",
  daily.source === "d1", daily.source);
t("with a board for today", !!daily.board, daily.board ? daily.board.id : "none");
t("eleven entries, and the shape of the grid",
  !!daily.board && daily.board.entries.length === 11 &&
  daily.board.rows > 0 && daily.board.cols > 0,
  daily.board ? `${daily.board.rows}x${daily.board.cols}` : "");
t("the title travels, because the title IS the clue",
  !!daily.board && typeof daily.board.title === "string" && daily.board.title.length > 0,
  daily.board && daily.board.title);

/* THE CHECK THIS FILE EXISTS FOR. Asked of the response TEXT and of its shape,
   on production, where the board has been through a database and a JSON round
   trip that no offline suite performs. */
const text = JSON.stringify(daily);
t("no entry carries an answer or a member name", (() => {
  const allowed = ["n", "dir", "r", "c", "len", "cells"];
  return !!daily.board &&
    daily.board.entries.every((e) => Object.keys(e).every((k) => allowed.includes(k)));
})(), daily.board ? Object.keys(daily.board.entries[0]).join(", ") : "");
t("and no run of capitals survives anywhere in the response", (() => {
  const stripped = text
    .replace(/"(token|id|title|dir|cell|entries|crossings|rows|cols|len|n|r|c|no|day|today|board|source|freeArchiveDays)"/g, "")
    .replace(/"gd:[^"]*"/g, "").replace(/"(across|down)"/g, "")
    .replace(/"[^"]*"/g, (m) => (daily.board && m === '"' + daily.board.title + '"' ? "" : m));
  return !/[A-Z]{2,}/.test(stripped);
})(), "the title is the only text a board is allowed to carry");
t("nothing is given at the start",
  !!daily.board && !("given" in daily.board) && !("opening" in daily.board));
t("the future is shut", (await get(HUB + "/api/grid/daily?no=99999")).status === 403);

/* ---- the marking is the server's ---------------------------------------- */
console.log("\nA guess is marked by the server, not the page");
{
  const e = daily.board && daily.board.entries[0];
  if (!e) { w("no board, so the marking is unjudged"); }
  else {
    /* playId null on purpose: no round is opened and no row is written. */
    const res = await fetch(HUB + "/api/grid/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-XI-Games": "1" },
      body: JSON.stringify({ token: daily.board.token, playId: null, n: e.n,
                             guess: "Z".repeat(e.len) }),
    });
    const body = await res.text();
    const j = JSON.parse(body);
    t("a guess comes back marked, per letter",
      res.status === 200 && Array.isArray(j.marks) && j.marks.length === e.len,
      `${res.status}, ${j.marks && j.marks.length} marks`);
    t("and the verdict carries no answer",
      !/"answer"/.test(body) && !/[A-Z]{3,}/.test(body.replace(/"(correct|present|absent|confirms|marks|scored|n)"/g, "")),
      "a wrong guess must not teach the word");
    t("an unscored round says so rather than inventing a score",
      j.scored === false, "no play id, so no round: the game does not depend on being scored");
    const noCsrf = await fetch(HUB + "/api/grid/guess", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: daily.board.token, n: e.n, guess: "A" }),
    });
    t("and a request without the family's header is refused", noCsrf.status === 403,
      String(noCsrf.status));
  }
}

/* ---- and it is still unlaunched ----------------------------------------- */
console.log("\nAnd Grid XI is still not launched");
{
  const map = await (await fetch(HUB + "/sitemap.xml")).text();
  t("the sitemap names no grid page", !/\/football\/grid\//.test(map),
    "236 boards in a sitemap is a game announced by a crawler");
  const hub = await (await fetch(HUB + "/")).text();
  t("the hub does not name it", !/Grid XI/i.test(hub.replace(/<!--[\s\S]*?-->/g, "")));
  const perma = await fetch(SITE + "/daily/1", { redirect: "manual" });
  t("and it has no permalink route yet", perma.status === 404,
    `${perma.status} — the route is a launch step, because it puts boards in the sitemap`);
}

/* ---- the floor and the marker ------------------------------------------- */
reached_end = true;
console.log(`\n${pass} passed, ${fail} failed, ${warn} unjudged`);
if (!reached_end) { console.log("INCOMPLETE — the run did not reach the end"); process.exit(1); }
if (pass + fail < MIN_ASSERTIONS) {
  console.log(`INCOMPLETE — only ${pass + fail} assertions ran, floor is ${MIN_ASSERTIONS}`);
  process.exit(1);
}
process.exit(fail ? 1 : 0);
