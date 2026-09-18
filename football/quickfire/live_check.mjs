/* live_check.mjs — is the deployed QuickFire XI actually behaving?
 *
 *   node quickfire/live_check.mjs [--expect v001]
 *
 * Assertions only ever READ. Nothing here plays, finishes, or writes.
 *
 * The three questions the gate cannot ask, all of which have caught a sibling
 * game: did the deploy land (bytes, not tags), is the database bound (source,
 * not status), and does the page leak what it should not.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const BASE = "https://www.thexigames.com";
const expectArg = process.argv.indexOf("--expect");
const EXPECT = expectArg > -1 ? process.argv[expectArg + 1] : null;

let pass = 0, fail = 0, warn = 0;
const w = (n, d) => { warn++; console.log(`  ??  ${n}${d ? "  — " + d : ""}`); };

/* ---- the completion guard ----------------------------------------------- */
/* A crash mid-file and a clean run differ only by an exit code nobody reads.
   Two nets: the marker catches a crash anywhere above the last line, the floor
   catches a block that goes quiet without crashing. */
const MIN_ASSERTIONS = 27;
let reachedEnd = false, announced = false;
function incomplete() {
  if (announced) return;
  announced = true;
  console.log(`\nFAIL  the run did not complete — ${pass + fail + warn} assertion(s) ` +
    `ran, floor ${MIN_ASSERTIONS}. A crash mid-file is a failed run, not a ` +
    `short green list.`);
  process.exitCode = 1;
}
process.on("uncaughtException", (e) => {
  console.log("\n" + ((e && e.stack) || e));
  incomplete();
  process.exit(1);
});
process.on("unhandledRejection", (e) => { throw e; });
process.on("exit", () => { if (!reachedEnd) incomplete(); });

function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}
const get = (p, opts) => fetch(BASE + p, { redirect: "manual", ...opts });

console.log(BASE + "/quickfire");

/* ---- the page ----------------------------------------------------------- */
const page = await get("/football/quickfire/");
const pageText = page.status === 200 ? await page.text() : "";
t("the page is served", page.status === 200, "HTTP " + page.status);

/* A 404 body satisfies "carries no answers" and "names no unreleased game"
   without the page existing. That is a vacuous pass, and this family has been
   bitten by three of them — a live catalog reporting zero boards in green among
   them. Everything derived from the page is unknown, not passed, when the page
   is not there. */
const served = page.status === 200;
const onPage = (name, ok, note) =>
  served ? t(name, ok, note) : w(name, "the page did not load");

onPage("index.html is not stored, so nobody is pinned to an old build",
  /no-store/.test(page.headers.get("cache-control") || ""),
  page.headers.get("cache-control"));

const tag = (pageText.match(/js\/game\.js\?v=([^"]+)"/) || [])[1];
onPage("the game script carries a build tag", !!tag, tag);
if (EXPECT) onPage("the build is " + EXPECT, tag === EXPECT, "serving " + tag);
else console.log(`      serving ${tag} — pass --expect vNNN to assert it`);

/* Eight assets, not one. A page can serve a current game.js beside seven stale
   library files and look entirely correct by tag. */
const assetTags = [...pageText.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)\?v=([^"]+)"/g)];
onPage("every one of the game's own assets carries that same tag",
  assetTags.length >= 2 && assetTags.every((m) => m[2] === tag),
  `${assetTags.length} assets: ${[...new Set(assetTags.map((m) => m[2]))].join(", ")}`);

onPage("the canonical names this page",
  pageText.indexOf('href="https://www.thexigames.com/football/quickfire/"') > -1);
onPage("the shared chrome is referenced, not copied",
  /shared\/xi-chrome\.css/.test(pageText) && /shared\/xi-chrome\.js/.test(pageText));

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
/* ---- the bytes behind the tag, which the gate cannot see ---------------- */
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const localJs = fs.readFileSync(path.join(here, "js/game.js"), "utf8");
  const localTag = (localJs.match(/BUILD\s*=\s*"(v\d+[a-z]?)"/) || [])[1] || "";
  /* CRLF NORMALISED BEFORE HASHING, which this did not do and the five game
     asset hashes have always done. What ships is what is in git, and a Windows
     checkout writes CRLF — so hashing the working tree's bytes asks a
     different question on each machine. This check was green on every CI run,
     because a Linux runner checks out LF, and red on the owner's machine
     against a deploy that was byte-perfect: "live a356247cf1a01ef1 vs local
     ff442bb764f68eaf", where a356247cf1a01ef1 is what BOTH files hash to once
     the line endings agree. A check that fails only where the release is
     actually made is worse than no check: the person doing the release learns
     to expect its red.
     CLAUDE.md names this rule and counted six places; this is the seventh.
     Split/join rather than a regex, so the pattern cannot be mangled by a
     tool that rewrites this file. */
  const lf = (s) => String(s).split(CR + LF).join(LF);
  const sum = (s) => crypto.createHash("sha256").update(lf(s)).digest("hex").slice(0, 16);
  if (!tag || !localTag || tag !== localTag) {
    w("the deployed game.js is the file in this checkout",
      `not comparable — live ${tag || "?"}, this checkout ${localTag || "?"}`);
  } else {
    const r = await fetch(BASE + "/football/quickfire/js/game.js?v=" + tag);
    const body = r.ok ? await r.text() : "";
    t("the deployed game.js is the file in this checkout",
      r.ok && sum(body) === sum(localJs),
      r.ok ? `live ${sum(body)} vs local ${sum(localJs)}` : `HTTP ${r.status}`);
  }
}

/* ---- nothing names a game that does not exist --------------------------- */
/* QuickFire has left this list. Everything still on it has not shipped, and
   the sibling games' live_check files must drop "QuickFire" the day this one
   goes live or their runs turn red on a correct page. */
const UNRELEASED = ["Scrambled", "Missing XI", "Transfer XI", "Player Chain",
                    "Link XI", "Odd One Out", "Grid XI"];
{
  const clean = pageText.replace(/<!--[\s\S]*?-->/g, "");
  const found = UNRELEASED.filter((n) => clean.indexOf(n) > -1);
  onPage("the game page names no unreleased game", found.length === 0, found.join(", "));
}

/* ---- the page carries no questions -------------------------------------- */
/* The whole reason the board comes from an endpoint. If this ever fails,
   someone has inlined a bank for a "quick fix". */
onPage("the page ships no questions and no answers",
  !/answers?\s*:\s*\[\s*["']/.test(pageText) && !/DAILY_SCHEDULE/.test(pageText));

/* ---- the daily ---------------------------------------------------------- */
const daily = await get("/api/quickfire/daily");
const d = daily.status === 200 ? await daily.json() : null;
t("the daily endpoint answers", daily.status === 200, "HTTP " + daily.status);
t("it is not cacheable", /no-store/.test(daily.headers.get("cache-control") || ""));
t("it returns today's board", !!(d && d.daily), d && d.daily && d.daily.id);
/* The RAW body, kept for the leak check below: a parsed object can only be
   searched under the keys you already suspect. */
const dailyText = d ? JSON.stringify(d) : "";

/* THE BINDING PROBE. A 200 with a fallback source is what a missing D1 binding
   looks like on a sibling game: a working game running on samples. */
t("the board comes from D1", !!d && d.source === "d1", d && "source: " + d.source);

t("eleven questions, which is the whole premise",
  !!(d && d.daily && d.daily.questions && d.daily.questions.length === 11),
  d && d.daily && d.daily.questions && d.daily.questions.length);
t("three on the bench", !!(d && d.daily && d.daily.bench && d.daily.bench.length === 3));
/* THE SHAPE OF A QUESTION, AND IT CHANGED UNDER THIS FILE.
 *
 * Everything from here to the seal used to read q.answer. That was the contract
 * before 15 September 2026, when the game was rewritten from typing a name to
 * picking one of four and the marking moved to the server — and the whole point
 * of that move is that the answer STOPS being published. So this block did not
 * merely go stale: it demanded a leak, and it crashed on the first `q.answer`
 * that was not there, seventeen assertions into a floor of twenty-two. Between
 * the rewrite and now, QuickFire went live on the eighth shirt with a live_check
 * that could not reach its own end, which is the same as not having one.
 *
 * What is provable from outside is now asserted; what is not is named below
 * rather than deleted quietly.
 */
t("every question carries a clue and four options",
  !!(d && d.daily && [...d.daily.questions, ...d.daily.bench].every(
    (q) => q.clue && Array.isArray(q.options) && q.options.length === 4)),
  "four is the whole interface — three or five is a board nobody can play");

/* THE ASSERTION THIS FILE NOW EXISTS FOR. The server marks the guess, so the
   answer has no business in a payload any browser can open. A regex over the
   raw text rather than a walk of the parsed object, because a leak that arrives
   under a key nobody thought to look at is exactly the leak that gets shipped. */
t("and no answer anywhere in the payload, under any key",
  !/"answer"\s*:/.test(dailyText),
  "the server marks the guess; publishing the answer would spoil the day");

t("no option is longer than the board can hold",
  !!(d && d.daily && [...d.daily.questions, ...d.daily.bench].every(
    (q) => q.options.every((o) => o.replace(/[^\p{L}\p{N}]/gu, "").length <= 16))),
  "16 typeable characters is where the row wraps on a phone");

t("no question offers the same option twice", (() => {
  if (!d || !d.daily) return false;
  return [...d.daily.questions, ...d.daily.bench].every((q) => {
    const seen = q.options.map((o) => o.toLowerCase().replace(/[^a-z0-9]/g, ""));
    return new Set(seen).size === 4;
  });
})(), "a repeated option is a question with three answers to choose from");

t("no clue names one of its own options", (() => {
  if (!d || !d.daily) return false;
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  return [...d.daily.questions, ...d.daily.bench].every(
    (q) => q.options.every((o) => !norm(q.clue).includes(norm(o))));
})(), "a clue that contains an option has already been answered");

/* WHAT THIS FILE CAN NO LONGER PROVE, said out loud rather than dropped.
 * Three assertions died with q.answer and they were worth having:
 *   - no answer appears twice on the board
 *   - no clue names ANOTHER question's answer
 *   - no alias is a different length from the answer it stands in for
 * None is checkable without knowing the answer, and the answer is correctly
 * absent from production. They belong to tools/import_quickfire.js, against the
 * source the answer came from, at the point a row is written — which is also
 * where "exactly one option equals the answer" belongs, and is still a sentence
 * in migration 022's comment rather than a line of code. Recorded here so that
 * the coverage is known to be missing rather than assumed to be present. */

/* ---- tomorrow stays sealed ---------------------------------------------- */
/* The endpoint takes no date parameter, by design. If one is ever added, this
   is the check that has to refuse it. */
const future = await get("/api/quickfire/daily?date=2099-01-01");
const f = future.status === 200 ? await future.json() : null;
t("a date parameter cannot pull a future board",
  future.status !== 200 || (f && f.daily && f.daily.date !== "2099-01-01"),
  f && f.daily ? "returned " + f.daily.date : "HTTP " + future.status);

/* ---- challenge links ----------------------------------------------------- */
const badChallenge = await get("/api/quickfire/challenge?x=not-a-real-code");
t("a damaged challenge code is refused", badChallenge.status === 400,
  "HTTP " + badChallenge.status);
t("and the refusal is not cacheable",
  /no-store/.test(badChallenge.headers.get("cache-control") || ""));
{
  /* A crafted code naming ids that have not been played must refuse. 999999 is
     beyond any plausible bank; if it ever isn't, this check needs a new number
     rather than deleting. */
  const code = Buffer.from(JSON.stringify({ v: 1, q: Array(11).fill(999999), b: [] }))
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const crafted = await get("/api/quickfire/challenge?x=" + code);
  t("a crafted challenge cannot read unplayed questions", crafted.status === 404,
    "HTTP " + crafted.status);
  const body = await crafted.text();
  t("and it names nothing", !/answer|clue/i.test(body), body.slice(0, 80));
}

/* ---- HEAD ---------------------------------------------------------------- */
for (const p of ["/api/quickfire/daily"]) {
  const r = await get(p, { method: "HEAD" });
  t(`HEAD ${p} answers like its GET`, r.status === 200, "HTTP " + r.status);
}

/* ---- the schema, asked through the endpoints ----------------------------- */
/* A signed-out results call must be a 401. A 500 means the query itself is
   broken, which is what an unapplied migration looks like from outside. */
for (const [p, wants] of [["/api/account/results?game=quickfire", 401]]) {
  const r = await get(p);
  t(`${p} refuses cleanly rather than erroring`, r.status === wants,
    `HTTP ${r.status}${r.status === 500 ? " — the query is broken, check the schema" : ""}`);
}

const ran = pass + fail + warn;
if (ran < MIN_ASSERTIONS) {
  fail++;
  console.log(`FAIL  the run is short — ${ran} assertion(s) ran, floor is ${MIN_ASSERTIONS}`);
}
reachedEnd = true;
console.log(`\n${pass} passed, ${fail} failed${warn ? `, ${warn} unknown` : ""}`);
process.exit(fail ? 1 : 0);
