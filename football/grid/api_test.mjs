/* api_test.mjs — Grid XI's two endpoints, EXECUTED.
 *
 * The one thing this file exists to prove: NO LETTER OF ANY ANSWER REACHES A
 * BROWSER. The grid starts empty, so every letter in it is an answer and a
 * board sent whole is the board solved. The word search shipped its board with
 * every answer's exact start and end square and had two live leaks to close
 * before its score could mean anything; this game is built the other way round
 * and this is where that is held.
 *
 * The rest of it is the other half of the same claim: the SCORE is the
 * server's. Turns, misses and which entries are solved are read back out of
 * the round's own rows, so a page cannot claim a turn it never had, replay a
 * guess to un-spend one, or keep playing past full time.
 *
 * Run against the real handlers with a D1 stand-in that stores rows in memory —
 * not a parse, not a regex. A regex cannot count turns and cannot catch a rule
 * bug, and both of those are what this file is about.
 *
 *   node football/grid/api_test.mjs        (from the repo root)
 */
import { onRequestGet as daily } from "../../functions/api/grid/daily.js";
import { onRequestPost as guess } from "../../functions/api/grid/guess.js";
import { playable } from "../../functions/_lib/gd-board.js";
import { GD_SAMPLE_BOARDS } from "../../functions/_lib/gd-sample.js";
import { loadBank, boardForDay, todayKey, boardToken, RULES } from "../../functions/_lib/gd-board.js";
import { roundState } from "../../functions/_lib/gd-round.js";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* ---- a D1 stand-in that actually stores things -------------------------- */
/* Enough SQL to be honest about THIS code: the four statements gd-round.js
   issues, and nothing else. A stub that returned canned answers would prove
   the endpoints call it, which is not the claim — the claim is that turns and
   misses come out right after a sequence of guesses, and only real storage can
   show that. */
function makeDb() {
  const guesses = [];          // { play_id, idx, entry_n, guess, correct, at_ms }
  const hints = [];            // { play_id, cell, at_ms }
  const rounds = [];
  return {
    _guesses: guesses, _hints: hints, _rounds: rounds,
    prepare(sql) {
      return {
        bind(...a) {
          return {
            async run() {
              if (/INSERT OR IGNORE INTO gd_round/.test(sql)) {
                if (!rounds.some((r) => r.play_id === a[0])) {
                  rounds.push({ play_id: a[0], board_id: a[1], day: a[2], started_ms: a[3] });
                }
              } else if (/INSERT OR IGNORE INTO gd_guess/.test(sql)) {
                if (!guesses.some((g) => g.play_id === a[0] && g.idx === a[1])) {
                  guesses.push({ play_id: a[0], idx: a[1], entry_n: a[2],
                                 guess: a[3], correct: a[4], at_ms: a[5] });
                }
              } else if (/INSERT OR IGNORE INTO gd_hint/.test(sql)) {
                if (!hints.some((h) => h.play_id === a[0] && h.cell === a[1])) {
                  hints.push({ play_id: a[0], cell: a[1], at_ms: a[2] });
                }
              }
              return { success: true };
            },
            async first() {
              if (/COUNT\(\*\) AS n FROM gd_guess/.test(sql)) {
                return { n: guesses.filter((g) => g.play_id === a[0]).length };
              }
              if (/COUNT\(\*\) AS n FROM gd_hint/.test(sql)) {
                return { n: hints.filter((h) => h.play_id === a[0]).length };
              }
              return null;
            },
            async all() {
              if (/FROM gd_guess WHERE play_id/.test(sql)) {
                return { results: guesses.filter((g) => g.play_id === a[0])
                  .sort((x, y) => x.idx - y.idx) };
              }
              if (/FROM gd_hint WHERE play_id/.test(sql)) {
                return { results: hints.filter((h) => h.play_id === a[0]) };
              }
              /* gd_board and gd_schedule are deliberately absent: this suite
                 runs on the SAMPLE bank, which is what every offline run and
                 every fresh clone gets. The D1 path for the bank is proved by
                 the importer's own check, not by a fixture of itself. */
              throw new Error("no such table");
            },
          };
        },
      };
    },
  };
}

const REQ = (url, body) => new Request("https://www.thexigames.com" + url, body ? {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-XI-Games": "1" },
  body: JSON.stringify(body),
} : {});

const call = async (fn, url, body, db) => {
  const r = await fn({ request: REQ(url, body), env: db ? { DB: db } : {} });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* not JSON, which a check may want */ }
  return { status: r.status, body: json, text };
};

/* ---- 1. the board that goes out ---------------------------------------- */

console.log("What a browser is handed");
const bank = await loadBank({});
const board = boardForDay(bank, todayKey());
{
  t("the sample bank has today's board, so this suite has something to test",
    !!board, board ? board.id + " — " + board.title : "no board today");

  const r = await call(daily, "/api/grid/daily");
  t("today's board is served", r.status === 200 && !!r.body.board, String(r.status));
  t("and says which bank it came from", r.body.source === "sample", r.body.source);

  /* THE CHECK EVERYTHING ELSE IS FOR. Asked of the RESPONSE TEXT, not of the
     shape — the shape is what a refactor changes, and a leak added next year
     will arrive as a new field rather than as a changed one. */
  const answers = (board.entries || []).map((e) => e.answer);
  const whole = answers.filter((a) => r.text.includes(a));
  t("not one answer appears anywhere in the response",
    whole.length === 0, whole.length ? "LEAKED " + whole[0] : answers.length + " answers withheld");

  /* AND NOT A LETTER OF ONE. The grid starts empty; a single letter is a free
     move the server did not grant. Every string field a board legitimately
     carries is removed first, so what is left is anything that should not be
     there at all. */
  const stripped = r.text
    .replace(/"(token|id|title|dir|cell|entries|crossings|rows|cols|len|n|r|c|no|day|today|board|source|freeArchiveDays)"/g, "")
    .replace(/"gd:[^"]*"/g, "").replace(/"[a-z-]+"/g, "")
    .replace(new RegExp('"' + board.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"', "g"), "");
  t("and no bare letter travels in any field",
    !/[A-Z]{2,}/.test(stripped), stripped.slice(0, 90));

  t("the title travels, because the title IS the clue",
    r.body.board.title === board.title, r.body.board.title);
  t("the shape travels: rows, columns, and where each entry sits",
    r.body.board.rows === board.rows && r.body.board.cols === board.cols &&
    r.body.board.entries.length === 11 &&
    r.body.board.entries.every((e) => e.len > 0 && Array.isArray(e.cells)));
  t("crossings travel as structure, without letters",
    r.body.board.crossings.every((x) => x.cell && Array.isArray(x.entries) && !("at" in x)));
  /* AND NO FIELD THAT COULD CARRY ONE LATER. A key added to the stored board
     must not appear in the public one by accident — the leak that matters is
     the one somebody adds next year. */
  const entryKeys = ["n", "dir", "r", "c", "len", "cells"];
  t("a public entry carries no field beyond the shape",
    r.body.board.entries.every((e) => Object.keys(e).every((k) => entryKeys.includes(k))),
    Object.keys(r.body.board.entries[0]).join(", ") + " — `answer` and `member` must never be here");
  /* THERE IS NO OPENING REVEAL. The owner's ruling of 6 September: a board
     opens on its title alone. */
  t("nothing is given at the start", !("given" in r.body.board) && !("opening" in r.body.board));
}

console.log("\nThe future is shut");
{
  const r = await call(daily, "/api/grid/daily?no=99999");
  t("tomorrow's board is refused", r.status === 403, String(r.status));
  const bad = await call(daily, "/api/grid/daily?no=0");
  t("and zero is not a board number", bad.status === 400, String(bad.status));
  const junk = await call(daily, "/api/grid/daily?no=abc");
  t("nor is anything that is not one", junk.status === 400, String(junk.status));
}

/* ---- 2. the marking, and what comes back ------------------------------- */

console.log("\nA guess is marked by the SERVER");
{
  const db = makeDb();
  const token = boardToken(board.id);
  const e1 = board.entries[0];
  const wrong = "Z".repeat(e1.len);

  const nope = await call(guess, "/api/grid/guess",
    { token, playId: "p1", n: e1.n, guess: wrong }, db);
  t("a wrong guess comes back marked, per letter",
    nope.status === 200 && Array.isArray(nope.body.marks) && nope.body.marks.length === e1.len,
    JSON.stringify(nope.body.marks));
  t("and is not correct", nope.body.correct === false);
  t("and the answer is NOT in the response",
    !nope.text.includes(e1.answer), "a wrong guess must not teach the word");
  t("it cost a turn", nope.body.turns === RULES.TURNS_START - 1, String(nope.body.turns));
  t("and counted as a miss", nope.body.misses === 1, String(nope.body.misses));

  const yes = await call(guess, "/api/grid/guess",
    { token, playId: "p1", n: e1.n, guess: e1.answer }, db);
  t("the right answer solves the entry", yes.body.correct === true);
  t("and gives the turn back",
    yes.body.turns === RULES.TURNS_START, String(yes.body.turns));
  t("and confirms its cells, so the crossings are free",
    yes.body.confirms.length === e1.len, String(yes.body.confirms.length));
  /* THE LETTERS THAT COME BACK ARE THE ONES JUST TYPED, at positions the
     server confirmed — nothing arrives that was not already on screen. */
  t("the letters confirmed are the letters that were typed",
    yes.body.confirms.every((c, i) => c.letter === e1.answer[e1.cells.indexOf(c.cell)]));
  t("solving is recorded against the entry, not counted loosely",
    yes.body.solved === 1 && yes.body.solvedEntries.join() === String(e1.n));

  const again = await call(guess, "/api/grid/guess",
    { token, playId: "p1", n: e1.n, guess: e1.answer }, db);
  t("a solved entry cannot be guessed again to farm turns",
    again.status === 400, `${again.status} — turns would otherwise climb forever`);
}

console.log("\nThe score is the server's, not the page's");
{
  const db = makeDb();
  const token = boardToken(board.id);
  const e = board.entries[0];

  /* Fifteen wrong guesses ends the board, and the sixteenth is refused — with
     the count kept HERE, not by the page. */
  let last = null;
  for (let i = 0; i < RULES.TURNS_START; i++) {
    last = await call(guess, "/api/grid/guess",
      { token, playId: "p2", n: e.n, guess: "Z".repeat(e.len) }, db);
  }
  t("fifteen misses ends the board", last.body.over === true,
    `turns ${last.body.turns}, misses ${last.body.misses}`);
  const after = await call(guess, "/api/grid/guess",
    { token, playId: "p2", n: e.n, guess: e.answer }, db);
  t("and a guess after full time changes nothing",
    after.body.over === true && after.body.marks === null && after.body.solved === 0,
    "the right answer arriving late must not solve an entry");

  t("a board played to nothing scores nothing", last.body.score.total === 0,
    JSON.stringify(last.body.score));

  /* THE DERIVATION'S OWN GUARD, EXERCISED. The check above passes because
     guess.js refuses a late guess before it is ever written — which is the
     right behaviour and means the guard INSIDE roundState, that stops counting
     once the turns are gone, was reachable by nothing and proved by nothing.
     Removing it left the suite green.

     So the rows are put in directly, as they would be by anything that got
     past the endpoint: a retry racing the refusal, a second tab, a future
     caller that forgets the check. The derivation must still call full time
     where full time was. */
  db._guesses.push({ play_id: "p2", idx: 99, entry_n: e.n, guess: e.answer,
                     correct: 1, at_ms: Date.now() });
  const late = await roundState({ DB: db }, "p2");
  t("and the derivation ignores a row that arrived past full time",
    late.over === true && late.solved === 0 && late.turns <= 0,
    `turns ${late.turns}, solved ${late.solved} — a row that got past the endpoint must not revive a board`);
}

console.log("\nWithout a database the game still plays, and says it is unscored");
{
  const r = await call(guess, "/api/grid/guess",
    { token: boardToken(board.id), playId: "p3", n: board.entries[0].n,
      guess: board.entries[0].answer });
  t("a guess is still marked with no D1", r.status === 200 && r.body.correct === true);
  /* AND EVEN HERE THE ANSWER DOES NOT COME BACK. Asserted on the response of a
     CORRECT guess as well as a wrong one: the page has the letters it typed,
     and echoing the word would put an answer on the wire for the ten entries
     still unsolved to be tested against. Checked on the text, because the
     handler picks its fields explicitly and a leak would arrive as a new one. */
  t("and the answer is not echoed back even when the guess was right",
    !r.text.includes(board.entries[0].answer),
    "the response names cells and marks, never the word");
  t("and the response says so rather than inventing a score",
    r.body.scored === false && r.body.score === undefined,
    "a game must not depend on being scored");
}

console.log("\nWhat it refuses");
{
  const db = makeDb();
  const noCsrf = await guess({
    request: new Request("https://www.thexigames.com/api/grid/guess", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: boardToken(board.id), n: 1, guess: "X" }),
    }), env: { DB: db },
  });
  t("a request with no CSRF header is refused", noCsrf.status === 403, String(noCsrf.status));
  const noBoard = await call(guess, "/api/grid/guess",
    { token: "gd:nope", playId: "p4", n: 1, guess: "X" }, db);
  t("a token for a board that does not exist is refused", noBoard.status === 404);
  const notToken = await call(guess, "/api/grid/guess",
    { token: board.id, playId: "p4", n: 1, guess: "X" }, db);
  t("and a bare id is not a token, so a body cannot ask for a row by name",
    notToken.status === 404, String(notToken.status));
  const noEntry = await call(guess, "/api/grid/guess",
    { token: boardToken(board.id), playId: "p4", n: 99, guess: "X" }, db);
  t("an entry that is not on the board is refused", noEntry.status === 400);
  const shortGuess = await call(guess, "/api/grid/guess",
    { token: boardToken(board.id), playId: "p4", n: board.entries[0].n, guess: "AB" }, db);
  t("a guess of the wrong length is refused, not padded", shortGuess.status === 400);
}

console.log("\nThe future is shut on every door, not just the daily's");
{
  /* WHAT THIS IS FOR, and it was live for a few hours on the day Grid XI
     launched. /api/grid/daily refuses a board whose day has not come. The
     guess route, beside it, judged ANY board in the bank: a token is "gd:"
     plus an id, the ids run gx-0001 upward, and every guess came back with
     per-letter marks AND the confirmed letters with their cells. Tomorrow's
     board — and every board of the next eight months — could be solved one
     guess at a time before anybody played it. Nothing here asked the
     question, which is why it shipped.

     Asked of the RULE rather than through the route, so the bank can hold a
     board dated tomorrow without the sample having to carry one. */
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const today = { id: "b-today", kind: "daily" };
  const tomorrow = { id: "b-tomorrow", kind: "daily" };
  const older = { id: "b-old", kind: "daily" };
  const loose = { id: "b-loose", kind: "daily" };      // in the bank, on no day
  const free = { id: "b-free", kind: "free" };
  const bank = {
    boards: [today, tomorrow, older, loose, free],
    schedule: { [day(0)]: "b-today", [day(1)]: "b-tomorrow", [day(-3)]: "b-old" },
  };
  t("today's board may be played", playable(bank, today, Date.now()));
  t("and one from last week", playable(bank, older, Date.now()));
  t("but NOT tomorrow's", !playable(bank, tomorrow, Date.now()),
    "marks and confirmed letters are the whole board, one guess at a time");
  t("nor one the calendar never names", !playable(bank, loose, Date.now()),
    "a board with no day is not a daily nobody scheduled, it is not a daily");
  /* A CATALOGUE BOARD HAS NO DAY AND THAT IS THE POINT: it is the one somebody
     goes looking for rather than the one set for everybody today. */
  t("a catalogue board may always be played", playable(bank, free, Date.now()));
  t("and nothing may be played that is not a board", !playable(bank, null, Date.now()));
}

console.log("\nAnd the ROUTE asks, not just the rule");
{
  /* THE RULE BEING RIGHT IS NOT THE ROUTE ASKING IT. The checks above prove
     playable(); this one proves /api/grid/guess calls it, because the fault
     that shipped was a route that never asked. Removing the call left every
     check above green.

     A BANK WITH A BOARD DATED TOMORROW, which the sample cannot hold — its
     calendar is today and yesterday — so this is the one place in this suite
     that stubs the D1 bank rather than falling through to the sample. */
  const mkBoard = (id, entries) => ({
    id, set_id: "s", kind: "daily", title: "A board", rows: 3, cols: 11,
    payload: JSON.stringify({ entries, crossings: [] }),
  });
  const ENTRY = [{ n: 1, dir: "across", r: 0, c: 0, len: 4, answer: "KANE",
                   cells: ["0,0", "0,1", "0,2", "0,3"] }];
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const bankDB = {
    prepare(sql) {
      return {
        bind: (...a) => ({
          async run() { return { success: true }; },
          async first() { return null; },
          async all() {
            if (/FROM gd_board/.test(sql)) {
              return { results: [mkBoard("b-today", ENTRY), mkBoard("b-tomorrow", ENTRY)] };
            }
            if (/FROM gd_schedule/.test(sql)) {
              return { results: [{ day: day(0), board_id: "b-today" },
                                 { day: day(1), board_id: "b-tomorrow" }] };
            }
            return { results: [] };
          },
        }),
        async all() {
          if (/FROM gd_board/.test(sql)) {
            return { results: [mkBoard("b-today", ENTRY), mkBoard("b-tomorrow", ENTRY)] };
          }
          if (/FROM gd_schedule/.test(sql)) {
            return { results: [{ day: day(0), board_id: "b-today" },
                               { day: day(1), board_id: "b-tomorrow" }] };
          }
          return { results: [] };
        },
      };
    },
  };

  const ask = (id) => call(guess, "/api/grid/guess",
    { token: "gd:" + id, playId: null, n: 1, guess: "AAAA" }, bankDB);

  const now = await ask("b-today");
  const soon = await ask("b-tomorrow");
  t("today's board is marked by the route", now.status === 200 && !!now.body.marks,
    String(now.status));
  t("and tomorrow's is refused by it", soon.status === 404,
    soon.status + " — a route that does not ask is a route with the future open");
  t("with nothing about the board in the refusal",
    !soon.body.marks && !soon.body.confirms,
    "marks and confirmed letters are what leaked");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
