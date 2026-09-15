/* football/whoami/live_check.mjs — Who Am I XI, proved against production.
 *
 *   node football/whoami/live_check.mjs [--expect v001a]
 *
 * THE GATE READS THE TREE AND CANNOT ANSWER ANY OF THIS. It passed 38 of 38 on
 * a tree whose daily endpoint answered 500 in production for hours, because the
 * fault was a re-export that binds at import time — and nothing in the repo
 * imports a Cloudflare Function. What a deploy actually did is only knowable
 * from outside it.
 *
 * WHAT THIS EXISTS TO CATCH, in order of how badly it would hurt:
 *
 *   1. an answer in the payload. Eleven doors a day and only ONE is spent per
 *      person, so the other ten stay live for everybody else — a leak here
 *      spoils ten answers for every other player that day.
 *   2. the career, which IS the answer written out, before it is paid for.
 *   3. a board from the future, which is the same leak with a date on it.
 *   4. the endpoint simply being down, which is what happened.
 *
 * MIN_ASSERTIONS is the second net under the completion marker: the marker
 * catches a crash, the floor catches a block that goes quiet without crashing.
 * It is set BELOW the real count on purpose, by the number that can legitimately
 * skip — the archive block skips every assertion on a day with no past boards.
 */
const BASE = "https://www.thexigames.com";
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
    headers: { "X-XI-Games": "1" }, cache: "no-store", ...opts,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* a page, not an endpoint */ }
  return { status: r.status, headers: r.headers, text, json };
};

console.log("Who Am I XI — live\n");

/* ---- the page ---- */
const page = await get("/football/whoami/");
t("the page answers", page.status === 200, String(page.status));
t("and names the game", /Who Am I XI/.test(page.text));
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
const daily = await get("/api/whoami/daily");
t("the daily answers 200 rather than a 500", daily.status === 200,
  daily.status === 200 ? "" : daily.text.slice(0, 120));

if (daily.json && daily.json.board) {
  const b = daily.json.board;
  t("it is eleven doors", (b.doors || []).length === 11, String((b.doors || []).length));
  t("a door is a club and a year and nothing else",
    (b.doors || []).every((d) => Object.keys(d).sort().join(",") === "club,leave,slot"),
    Object.keys((b.doors || [])[0] || {}).join(","));

  /* THE ASSERTION THIS FILE EXISTS FOR. */
  t("no player_id anywhere in the payload", !/player_id/.test(daily.text));
  t("and no career, which is the answer written out",
    !/club_history/.test(daily.text) && !/"clubs"/.test(daily.text));
  t("and no name, no birth year, no birthplace",
    !/"name"/.test(daily.text) && !/birth_year|birth_place/.test(daily.text));

  /* SORTED, NOT IN SLOT ORDER. Attributed, count[3] is door three's career
     length, which narrows eleven doors to a handful for anyone with the list. */
  const c = b.careers || [];
  /* TWO CLAIMS, AND THEY WERE ONE. This read `c.length === 11 && sorted`, under
     a name that only ever mentioned sortedness — so when the board stopped
     sending one length per DOOR and started sending one per PLAYER, a live
     board of six players failed an assertion about ordering. A check whose name
     is narrower than its behaviour reports the wrong fault, and this one
     reported "not sorted" about 3,6,6,8,10,13. */
  t("the career lengths are sorted, so they attribute to nobody",
    c.length > 0 && c.every((v, i) => i === 0 || v >= c[i - 1]), c.join(","));
  /* ONE PER PLAYER, WHICH IS AT MOST ONE PER DOOR. Eleven doors can be six
     players; eleven lengths would be the grouping given away, which is the
     leak this panel was rebuilt to close. */
  t("and there is no more than one of them per door",
    c.length > 0 && c.length <= (b.doors || []).length,
    `${c.length} lengths for ${(b.doors || []).length} doors`);

  t("the scoring rule travels with the board",
    !!daily.json.scoring && daily.json.scoring.max === 114,
    "the page needs it and must not hold a second copy");
} else {
  t("the daily returned a board", false, "no board in the payload");
}

/* ---- the bound, which is the leak with a date on it ---- */
const future = await get("/api/whoami/daily?date=2027-06-01");
t("a board from the future is refused", future.status === 404, String(future.status));
const farNo = await get("/api/whoami/daily?no=900");
t("and so is one by a number that has not run", farNo.status === 404, String(farNo.status));

/* ---- the answer space, which is not an answer ---- */
const names = await get("/api/whoami/names");
t("the name list answers", names.status === 200, String(names.status));
t("and is the whole bank rather than today's eleven",
  names.json && names.json.count > 1000, String(names.json && names.json.count));

/* ---- the archive, the easiest place to publish tomorrow by accident ---- */
const arch = await get("/api/whoami/archive");
t("the archive answers", arch.status === 200, String(arch.status));
if (arch.json && (arch.json.boards || []).length) {
  t("and lists days and numbers and nothing else",
    arch.json.boards.every((x) => Object.keys(x).sort().join(",") === "day,no"));
  t("no board it lists is in the future",
    arch.json.boards.every((x) => x.day <= arch.json.today), arch.json.today);
} else {
  console.log("  --  the archive is empty, so its two assertions skip");
}

/* ---- the family's HEAD contract ---- */
const head = await get("/api/whoami/daily", { method: "HEAD" });
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
