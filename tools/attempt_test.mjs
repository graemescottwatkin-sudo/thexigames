/* attempt_test.mjs — the crossword's verified score, and the three ways it
 * could be had for nothing.
 *
 * WHY THIS FILE EXISTS. An independent review on 7 September 2026 reproduced
 * three faults in the crossword's server-side scoring. They are one fault in
 * three places: the endpoints marked, revealed and scored against a TOKEN and
 * wrote against a PLAY ID, and nothing checked the two were the same attempt.
 *
 *   1  /api/finish  stamped a verified score onto a play row by id alone. A
 *      solved practice board returned 114 onto a row whose own columns said
 *      game "hilo", board "hl:999".
 *   2  /api/reveal  served the whole answer with no play id, charging nothing,
 *      so help could be collected on one request and the board finished on
 *      another as a clean score.
 *   3  /api/verify  counted only FILLED squares as wrong, so a grid holding one
 *      letter answered "is that letter right?" free. 148 requests recovered the
 *      first twelve letters of a bundled board.
 *
 * EVERY CHECK BELOW WAS RUN AGAINST THE OLD CODE FIRST and seen to fail; the
 * walk in the last block is the review's own attack, executed.
 *
 * THE STUB MODELS ITS PREDICATES. A fake that answers changes:1 to every
 * UPDATE reports success for a charge that never landed — which is exactly
 * what hid fault 2 — so this one holds a table and honours the WHERE.
 *
 *   node tools/attempt_test.mjs        (from the repo root)
 */
import { onRequestPost as finish } from "../functions/api/finish.js";
import { onRequestPost as reveal } from "../functions/api/reveal.js";
import { onRequestPost as verify } from "../functions/api/verify.js";
import { onRequestPost as check } from "../functions/api/check-answer.js";
import { SAMPLE_PUZZLES } from "../functions/_lib/sample-puzzles.js";
import { attemptMatches, boardKeyForToken } from "../functions/_lib/attempt.js";
import { onRequestPost as play } from "../functions/api/play.js";
import { onRequestGet as dailyGet } from "../functions/api/daily.js";
import { dailyDayKey } from "../functions/_lib/daily.js";
import fs from "node:fs";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const sample = SAMPLE_PUZZLES.practice[0];
const puzzle = sample.puzzle;
const TOKEN = "practice:" + sample.rowId;
const order = Object.keys(puzzle.cells).sort();
const truth = order.map((k) => puzzle.cells[k].ch);
const solved = {};
for (const [k, c] of Object.entries(puzzle.cells)) if (c && c.ch) solved[k] = c.ch;

/* A table of play rows, and an UPDATE that only touches rows its WHERE names. */
function makeEnv(rows) {
  const plays = new Map(rows.map((r) => [r.play_id, { ...r }]));
  const db = {
    _plays: plays,
    prepare(q) {
      const sql = q.replace(/\s+/g, " ").trim();
      return {
        bind: (...a) => ({
          first: async () => {
            if (/FROM puzzles/.test(sql)) {
              return { id: sample.rowId, payload: JSON.stringify(sample) };
            }
            if (/FROM plays/.test(sql)) return plays.get(String(a[0])) || null;
            if (/rate_limits/.test(sql)) return null;      // always a fresh window
            return null;
          },
          run: async () => {
            if (/rate_limits/.test(sql)) return { meta: { changes: 1 } };
            if (!/UPDATE plays/.test(sql)) return { meta: { changes: 0 } };
            /* The play id is not always the first bind — the tally puts it
               first, the finish puts it last — so the row is found by which
               bound value names one, rather than by position. */
            const row = plays.get(String(a.find((v) => plays.has(String(v)))));
            if (!row) return { meta: { changes: 0 } };
            /* The predicates this suite has to honour, because they are the
               fix: the game, the board where one is named, and srv_score IS
               NULL for the write that must not overwrite a banked score. */
            if (/game = \?/.test(sql) && String(a[1]) !== String(row.game)) {
              return { meta: { changes: 0 } };
            }
            if (/game = 'crossword'/.test(sql) && String(row.game) !== "crossword") {
              return { meta: { changes: 0 } };
            }
            if (/board_key IS NULL OR board_key = \?/.test(sql)) {
              const want = String(a[2]);
              if (row.board_key !== null && String(row.board_key) !== want) {
                return { meta: { changes: 0 } };
              }
            }
            if (/srv_score IS NULL/.test(sql) &&
                row.srv_score !== null && row.srv_score !== undefined) {
              return { meta: { changes: 0 } };
            }
            for (const col of ["srv_checks", "srv_check_alls",
                               "srv_reveal_letters", "srv_reveal_answers"]) {
              if (new RegExp(col + " =").test(sql)) row[col] = (row[col] || 0) + 1;
            }
            if (/srv_score = \?/.test(sql)) { row.srv_score = a[0]; row.completed = 1; }
            /* THE BEACON'S OWN STATEMENT, IN BOTH ITS SHAPES. The fix is the
               CASE — solved and completed move only while srv_score is null —
               and the shape it replaced wrote them unconditionally. Modelling
               only the new one would have made this check pass against the old
               code for the wrong reason: the statement simply would not have
               matched, so nothing would have been written and "not undone"
               would have looked true. Binds: solved, completed, elapsed,
               checks, reveals, detail, id. */
            if (/solved = CASE WHEN srv_score IS NULL/.test(sql)) {
              if (row.srv_score === null || row.srv_score === undefined) {
                row.solved = a[0];
                row.completed = a[1];
              }
            } else if (/SET solved = \?, completed = \?/.test(sql)) {
              row.solved = a[0];
              row.completed = a[1];
            }
            return { meta: { changes: 1 } };
          },
          all: async () => ({ results: [] }),
        }),
        first: async () => null,
        run: async () => ({ meta: { changes: 1 } }),
        all: async () => ({ results: [] }),
      };
    },
  };
  return { DB: db };
}

const row = (over) => Object.assign({
  play_id: "p-crossword-1", game: "crossword", board_key: "practice", mode: "practice",
  started_at: "2026-09-08 09:00:00", srv_checks: 0, srv_check_alls: 0,
  srv_reveal_letters: 0, srv_reveal_answers: 0, srv_score: null, completed: 0,
}, over || {});

const post = (fn, env, body) => fn({
  request: new Request("https://www.thexigames.com/", {
    method: "POST", headers: { "Content-Type": "application/json", "X-XI-Games": "1" },
    body: JSON.stringify(body),
  }),
  env,
});

console.log("A finish belongs to the attempt it was played on");
{
  /* THE REVIEW'S OWN CASE. A play row for another game entirely, and a
     correctly solved crossword offered against it. */
  const env = makeEnv([row({ play_id: "p-hilo", game: "hilo", board_key: "hl:999", mode: "daily" })]);
  const r = await (await post(finish, env, { token: TOKEN, playId: "p-hilo", letters: solved })).json();
  t("a play from another game is not verified", r.verified === false, JSON.stringify(r));
  t("and nothing is written to it", env.DB._plays.get("p-hilo").srv_score === null,
    "score 114 was written onto a hilo row before this");
  /* THE BOARD IS STILL SOLVED. Refusing the verification must not take Full
     Time away from somebody whose play row is simply not this one. */
  t("but the player is still told the grid is complete", r.complete === true,
    "a refusal that hides Full Time would be a worse fault than the one it fixes");
}
{
  const env = makeEnv([row({ play_id: "p-other-board", board_key: "daily:12", mode: "daily" })]);
  const r = await (await post(finish, env, { token: TOKEN, playId: "p-other-board", letters: solved })).json();
  t("nor is a play from another board of this game", r.verified === false, JSON.stringify(r));
}
{
  const env = makeEnv([row({})]);
  const r = await (await post(finish, env, { token: TOKEN, playId: "p-crossword-1", letters: solved })).json();
  t("the attempt it WAS played on is verified", r.verified === true && r.score > 0,
    "score " + r.score);
  t("and the score is banked", env.DB._plays.get("p-crossword-1").srv_score === r.score);
}
{
  /* A SCORE ALREADY BANKED IS THE ONE THAT STANDS. The predicate carries this,
     not just the branch above it: two finishes racing must not both write. */
  const env = makeEnv([row({ srv_score: 40 })]);
  const r = await (await post(finish, env, { token: TOKEN, playId: "p-crossword-1", letters: solved })).json();
  t("a second finish returns the first score rather than improving it",
    r.already === true && r.score === 40, JSON.stringify(r));
  t("and the row still holds it", env.DB._plays.get("p-crossword-1").srv_score === 40);
}

console.log("\nHelp that cannot be charged is not served");
{
  const env = makeEnv([row({})]);
  const noId = await post(reveal, env, { token: TOKEN, entry: 0 });
  const body = await noId.json();
  t("a reveal with no play id is refused", noId.status === 409 && !body.answer,
    "it returned the whole answer before this");
  const unknown = await post(reveal, env, { token: TOKEN, entry: 0, index: 1, playId: "p-nope-1234" });
  t("and one naming an attempt that does not exist", unknown.status === 409);
  const alien = await post(reveal, env,
    { token: TOKEN, entry: 0, index: 1, playId: "p-crossword-1" });
  t("but the attempt's own reveal is served", alien.status === 200);
  t("and charged to it", env.DB._plays.get("p-crossword-1").srv_reveal_letters === 1,
    "an uncharged reveal is a verified score that does not know about it");
}
{
  /* THE PAID DOOR SHARES THE TALLY, BUT NOT THE REFUSAL, and this is where
     the review's "apply the same reasoning to paid checks" stops.

     A grid check is ONE press that takes eleven requests — one per entry,
     because the player is owed the position of every wrong letter — and only
     the first carries the play id, so that a nine-point press is charged once
     rather than eleven times. Refusing a check that could not be charged
     therefore refuses the other ten: the player pays, gets one answer marked
     and ten failures. That was written, and blank_test, functions_test and
     frontend_test all said so.

     So what is asserted here is the part that IS fixed — a check that names an
     attempt is charged to THAT attempt and no other — and the part that is
     not: a check with no id is still served and still counts nothing. Closing
     it needs one request for one press, in the browser and in the endpoint
     together. Written down rather than quietly asserted the other way. */
  const env = makeEnv([row({}),
    row({ play_id: "p-wordsearch-1", game: "wordsearch", board_key: "ws:2026-09-08" })]);
  const noId = await post(check, env, { token: TOKEN, entry: 0, guess: truth.join("").slice(0, 3) });
  t("a check with no play id is still served, and still charges nothing",
    noId.status === 200 && env.DB._plays.get("p-crossword-1").srv_checks === 0,
    "the eleven requests of one press carry the id once; refusing here refuses ten of them");
  const ok = await post(check, env, { token: TOKEN, entry: 0, guess: "REALMADRID", playId: "p-crossword-1" });
  t("and the attempt's own check is served", ok.status === 200);
  t("and charged", env.DB._plays.get("p-crossword-1").srv_checks === 1);
  /* The half that IS closed on this door: a check naming another game's row of
     the same id counts nothing against it, because the identity is in the
     UPDATE's predicate rather than in a lookup before it. */
  const alien = await post(check, env,
    { token: TOKEN, entry: 0, guess: "REALMADRID", playId: "p-wordsearch-1" });
  t("but a check cannot be charged to another game's row",
    alien.status === 200 && env.DB._plays.get("p-wordsearch-1").srv_checks === 0,
    "one id, two games, and the charge must land on the crossword's row or nowhere");
}
{
  /* Offline, nothing can be verified and nothing is refused: /api/finish says
     verified:false on its own, so help must stay free rather than vanish. */
  const r = await post(reveal, {}, { token: TOKEN, entry: 0 });
  t("with no database at all, help is served as it always was", r.status === 200,
    "there is nothing to verify offline, so there is nothing to protect");
}

console.log("\nThe free nudge is not a letter oracle");
{
  const env = makeEnv([row({})]);
  const ask = async (grid) => (await (await post(verify, env, { token: TOKEN, grid, detail: 1 })).json());

  const one = await ask([truth[0]]);
  t("a grid with one letter in it says nothing about that letter",
    one.wrongCells === null && one.full === false, JSON.stringify(one));

  /* THE REVIEW'S ATTACK, RUN. Walk the alphabet a square at a time and see
     what comes back: before the fix this returned the board's own letters. */
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let found = "";
  for (let pos = 0; pos < 4; pos++) {
    for (const ch of A) {
      const r = await ask(found.split("").concat([ch]));
      if (r.wrongCells === 0) { found += ch; break; }
    }
  }
  t("and the walk recovers nothing", found === "",
    found ? "recovered " + found : "148 requests recovered twelve letters before this");

  /* AND THE FEATURE IT EXISTS FOR STILL WORKS. The page asks only when the
     last square has just been filled, which is the case below. */
  const bent = truth.slice();
  bent[0] = bent[0] === "Z" ? "Y" : "Z";
  bent[5] = bent[5] === "Z" ? "Y" : "Z";
  const full = await ask(bent);
  t("a full grid still says how much is wrong",
    full.wrongCells === 2 && full.wrongEntries >= 1 && full.total === truth.length,
    JSON.stringify(full));
  const right = await ask(truth);
  t("and a correct one says nothing is", right.wrongCells === 0);
}

console.log("\nThe rule itself");
{
  const r = row({});
  t("a token names the board key a play must carry",
    boardKeyForToken("daily:12", null) === "daily:12" &&
    boardKeyForToken("practice:1", null) === "practice" &&
    boardKeyForToken("theme:240", { themeId: "arsenal", boardNo: 1 }) === "arsenal-1",
    "daily:12 | practice | arsenal-1");
  t("an attempt on this board matches", attemptMatches(r, TOKEN, sample));
  t("one from another game does not",
    !attemptMatches(row({ game: "hilo" }), TOKEN, sample));
  t("nor one from another board",
    !attemptMatches(row({ board_key: "daily:12", mode: "daily" }), TOKEN, sample));
  /* LENIENT WHERE IT MUST BE: production holds theme plays written before the
     board_key column existed, and a player mid-board on one keeps their game. */
  t("a play from before board_key existed is judged on game and mode alone",
    attemptMatches(row({ board_key: null }), TOKEN, sample));
  t("and even then not across games",
    !attemptMatches(row({ board_key: null, game: "hilo" }), TOKEN, sample));
}

console.log("\nA late beacon cannot un-finish a verified board");
{
  /* The review's finding 4. /api/finish writes solved, total and completed = 1
     from the grid it judged; the end beacon fires when the tab closes, which
     can be minutes later, and carried the browser's own idea of the board. It
     filtered on play_id alone, so a stale "completed: false, solved: 0" landed
     on top of a verified row — a score with "abandoned" beside it. */
  const env = makeEnv([row({ srv_score: 96, completed: 1, solved: 11 })]);
  const before = { ...env.DB._plays.get("p-crossword-1") };
  const r = await post(play, env,
    { event: "end", playId: "p-crossword-1", completed: false, solved: 0, elapsed: 30 });
  const after = env.DB._plays.get("p-crossword-1");
  t("the beacon is accepted", r.status === 200, String(r.status));
  t("but a verified completion is not undone",
    after.completed === before.completed && after.solved === before.solved,
    "completed " + after.completed + ", solved " + after.solved);
  /* AND AN UNVERIFIED ROW STILL TAKES THE BEACON'S WORD, which is the case the
     funnel exists for: an abandoned board never reaches /api/finish. */
  const env2 = makeEnv([row({ play_id: "p-abandoned", srv_score: null, completed: 0, solved: 0 })]);
  await post(play, env2,
    { event: "end", playId: "p-abandoned", completed: false, solved: 4, elapsed: 30 });
  t("and an abandoned board still records how far it got",
    env2.DB._plays.get("p-abandoned").solved === 4,
    "solved " + env2.DB._plays.get("p-abandoned").solved);
}

console.log("\nThe hub is told which day it is, rather than asking the device");
{
  /* The review's finding 7: the front page wrote its own date from the device
     clock while the games used the server's UTC day, so a UK evening between
     local and UTC midnight named a day whose boards did not exist. The number
     was already in this payload; the day it stands for was not, and without it
     the only way to name the day on the client was a second copy of the
     epoch. */
  const r = await dailyGet({ request: new Request("https://x/api/daily"), env: {} });
  const j = await r.json();
  t("/api/daily names the day, not only the number",
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(j.day || "")), JSON.stringify(j.day));
  t("and it is the day that number stands for",
    j.day === dailyDayKey(j.dailyNo), j.day + " vs " + dailyDayKey(j.dailyNo));
  const hub = fs.readFileSync("index.html", "utf8");
  t("and the hub takes its date from there",
    /fetch\("\/api\/daily"/.test(hub) && /fromServerDay/.test(hub),
    "the device's date is drawn first so the line is never empty, then replaced");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
