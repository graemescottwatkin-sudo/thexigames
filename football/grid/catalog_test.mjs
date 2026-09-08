/* catalog_test.mjs — Grid XI's catalogue door, EXECUTED.
 *
 * WHAT THIS DOOR IS. Grid XI launched with 236 boards and every one of them was
 * a daily: one per day, the calendar's, gone the next morning. A FREE board is
 * never in the calendar — it is the one somebody goes looking for rather than
 * the one set for everybody today — and the owner's plan for them is the older
 * and more obscure elevens, which make a poor daily and a good thing to find.
 *
 * WHY IT NEEDS A SUITE OF ITS OWN. This is a second door onto the same bank,
 * and this game has already had one of those go wrong: the guess route would
 * judge tomorrow's board and every board after it, which is how a player could
 * be handed a board whose day had not come. A door that reads the bank must
 * prove, by RUNNING, that it hands over only what it is allowed to.
 *
 * Three claims, and each one is watched failing before it is trusted:
 *   1  the list is free boards only — a daily is never in it, and never
 *      obtainable through it however it is asked for;
 *   2  the list is a MENU: ids and titles, never a payload. Sending the boards
 *      themselves would send every grid in the bank to anyone who opened the
 *      page, which is the leak the word search closed;
 *   3  no letter of any answer reaches a browser. The grid starts empty, so
 *      every letter in it is an answer and a board sent whole is a board
 *      solved. Checked against the real JSON text, not against the object.
 *
 *   node football/grid/catalog_test.mjs        (from the repo root)
 */
import { onRequestGet as catalog } from "../../functions/api/grid/catalog.js";
import { todayKey } from "../../functions/_lib/gd-board.js";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* ---- a bank in a D1 stand-in -------------------------------------------
 * The SAMPLE bank has no free boards at all — nothing in it carries a `kind`
 * — so a suite run against it would be asking an empty catalogue whether it
 * kept a secret. These rows are the shape gd_board actually holds, answers
 * included, because the answers are the thing that must not come back out. */
const ROWS = [
  { id: "gx-0001", set_id: "milan-1958", kind: "daily", title: "AC Milan — 1958",
    rows: 3, cols: 9,
    payload: JSON.stringify({ entries: [
      { n: 1, dir: "across", r: 1, c: 0, len: 8, cells: ["1,0"], answer: "MALDINI", member: "Cesare Maldini" },
    ], crossings: [] }) },
  { id: "gx-0002", set_id: "leeds-1972", kind: "daily", title: "Leeds United — 1972",
    rows: 3, cols: 9,
    payload: JSON.stringify({ entries: [
      { n: 1, dir: "across", r: 1, c: 0, len: 6, cells: ["1,0"], answer: "BREMNER", member: "Billy Bremner" },
    ], crossings: [] }) },
  { id: "gx-0300", set_id: "burnley-1960", kind: "free", title: "Burnley — 1960 champions",
    rows: 4, cols: 10,
    payload: JSON.stringify({ entries: [
      { n: 1, dir: "across", r: 1, c: 0, len: 9, cells: ["1,0", "1,1"], answer: "MCILROY", member: "Jimmy McIlroy" },
      { n: 2, dir: "down", r: 0, c: 3, len: 6, cells: ["0,3", "1,3"], answer: "ADAMSON", member: "Jimmy Adamson" },
    ], crossings: [] }) },
  { id: "gx-0301", set_id: "ipswich-1962", kind: "free", title: "Ipswich Town — 1962 champions",
    rows: 4, cols: 10,
    payload: JSON.stringify({ entries: [
      { n: 1, dir: "across", r: 2, c: 1, len: 7, cells: ["2,1"], answer: "PHILLIPS", member: "Ted Phillips" },
    ], crossings: [] }) },
];
const ANSWERS = ROWS.flatMap((r) => JSON.parse(r.payload).entries.map((e) => e.answer));
const FREE = ROWS.filter((r) => r.kind === "free").map((r) => r.id);
const DAILY = ROWS.filter((r) => r.kind === "daily").map((r) => r.id);

function makeDb(rows) {
  return {
    prepare(sql) {
      return {
        bind: () => ({ all: async () => ({ results: [] }), first: async () => null }),
        async all() {
          if (/FROM gd_board/.test(sql)) return { results: rows };
          if (/FROM gd_schedule/.test(sql)) {
            return { results: [{ day: todayKey(), board_id: DAILY[0] }] };
          }
          throw new Error("no such table");
        },
        async first() { return null; },
        async run() { return { success: true }; },
      };
    },
  };
}

const call = async (url, env) => {
  const r = await catalog({
    request: new Request("https://www.thexigames.com" + url), env,
  });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { /* a check may want the text */ }
  return { status: r.status, body, text };
};

const env = { DB: makeDb(ROWS) };

console.log("The catalogue is a menu of the free boards");
{
  const r = await call("/api/grid/catalog", env);
  t("it is served, from the bank rather than the sample",
    r.status === 200 && r.body.source === "d1", `${r.status} ${r.body && r.body.source}`);
  t("and it lists the free boards", Array.isArray(r.body.boards) &&
    FREE.every((id) => r.body.boards.some((b) => b.id === id)),
    (r.body.boards || []).map((b) => b.id).join(", "));
  /* THE HALF THAT MATTERS. A catalogue that also listed the dailies would be a
     way to read tomorrow's title today, and past that the id of a board whose
     day has not come. */
  t("and no daily is in it, so tomorrow is not on a menu",
    !(r.body.boards || []).some((b) => DAILY.indexOf(b.id) > -1),
    DAILY.join(", ") + " must not appear");
  t("the count is the list's own length",
    r.body.count === (r.body.boards || []).length, String(r.body.count));
  /* IDENTITY ONLY. Sending the boards themselves would send every grid in the
     bank to anyone who opened the page. */
  t("each row is an id and a title, never a payload",
    (r.body.boards || []).every((b) =>
      Object.keys(b).sort().join(",") === "id,set_id,title"),
    (r.body.boards || []).map((b) => Object.keys(b).join("+")).join(" | "));
  t("and not one letter of an answer is in the whole response",
    !ANSWERS.some((a) => r.text.includes(a)),
    "the grid starts empty, so every letter in it is an answer");
  t("the titles are in an order somebody could scan",
    (r.body.boards || []).map((b) => b.title).join("|") ===
      (r.body.boards || []).map((b) => b.title).sort().join("|"));
}

console.log("\nOne board, opened");
{
  const r = await call("/api/grid/catalog?id=" + FREE[0], env);
  t("a free board opens", r.status === 200 && !!r.body.board, String(r.status));
  const b = r.body.board || {};
  t("it carries its own token, which is how a guess names it",
    b.token === "gd:" + FREE[0], b.token);
  t("and the shape of the grid: where the entries are and how long they are",
    Array.isArray(b.entries) && b.entries.length === 2 &&
    b.entries.every((e) => Array.isArray(e.cells) && typeof e.len === "number"),
    (b.entries || []).length + " entries");
  t("and no answer, no member, no first letter, nothing to brute-force",
    (b.entries || []).every((e) =>
      !("answer" in e) && !("member" in e) && !("given" in e)),
    Object.keys((b.entries || [])[0] || {}).join(", "));
  t("and not one letter of an answer is in the whole response",
    !ANSWERS.some((a) => r.text.includes(a)),
    "checked against the JSON that goes out, not the object it came from");
  t("the title is the whole clue, and it is sent",
    b.title === "Burnley — 1960 champions", b.title);
}

console.log("\nWhat is refused, and refused identically");
{
  const daily = await call("/api/grid/catalog?id=" + DAILY[0], env);
  const unknown = await call("/api/grid/catalog?id=gx-9999", env);
  t("a daily asked for by name is refused",
    daily.status === 404 && !daily.body.board, String(daily.status));
  /* ONE ANSWER FOR BOTH. Telling them apart would let the id space be walked
     to find where the calendar begins. */
  t("and it is refused in exactly the words an unknown id gets",
    daily.status === unknown.status && daily.text === unknown.text,
    daily.text.slice(0, 60));
  t("and nothing of it rides along with the refusal",
    !ANSWERS.some((a) => daily.text.includes(a)) && !daily.text.includes("Milan"));
  for (const bent of ["../gx-0300", "gx 0300", "'; DROP TABLE gd_board;--", "x".repeat(60)]) {
    const r = await call("/api/grid/catalog?id=" + encodeURIComponent(bent), env);
    t(`a malformed id is refused before the bank is asked — ${bent.slice(0, 18)}`,
      r.status === 404 && !r.body.board, String(r.status));
  }
}

console.log("\nWith no database at all");
{
  /* The sample bank has no free boards, so the honest answer is an empty
     catalogue that SAYS which bank it came from — not an error, and not a
     fixture served while claiming to be the bank. */
  const r = await call("/api/grid/catalog", {});
  t("the catalogue is empty rather than broken",
    r.status === 200 && Array.isArray(r.body.boards) && r.body.boards.length === 0,
    `${r.status}, ${(r.body.boards || []).length} boards`);
  t("and it says which bank that was", r.body.source === "sample", r.body.source);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
