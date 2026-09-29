/* friends/scrambled/board_test.mjs — the Friends board set on Scrambled's
 * engine, offline.
 *
 *   node friends/scrambled/board_test.mjs      (from the repo root)
 *
 * One engine serves two board sets that must never mix (the owner, 29 Sep
 * 2026: "start the Friends Scrambled and Vowels build", five answers a board,
 * no clock). This proves the rules that keep them apart and the rules that
 * make the Friends set its own, by executing the real functions:
 *   - the Friends ring starts on the launch day, and Vowels reads it half a
 *     turn round; before the first day there is no board;
 *   - a token names its set, and a Friends token is judged against the
 *     Friends boards (and read from fr_sc_board, never sc_board);
 *   - football's ring, tokens and table are exactly what they were;
 *   - the Friends prices and score: no clock, out of 100, 20 to give up;
 *   - a Friends finish lands only on a Friends play.
 * A stub database cannot prove a query; it proves the table named and the
 * rows read. The query itself is proved by the live_check against D1.
 */
import { SETS, setOf, loadBoards, boardForNumber, boardForToken, scKey, tokenCypher,
  playableTokenNo, publicBoard } from "../../functions/_lib/sc-board.js";
import { costOf, verifiedScore } from "../../functions/_lib/sc-round.js";
import { FR_SC_BOARDS } from "../../functions/_lib/fr-sc-boards.js";
import { SC_BOARDS } from "../../functions/_lib/sc-boards.js";
import { launchNumber, entryKey, ENGINE_GAMES } from "../../functions/_lib/games.js";
import { dailyNumber } from "../../functions/_lib/daily.js";
import { onRequestPost as finishPost } from "../../functions/api/scrambled/finish.js";
import { onRequestPost as guessPost } from "../../functions/api/scrambled/guess.js";
import FR_SCORING from "../../friends/scrambled/js/scoring.js";
import FB_SCORING from "../../football/scrambled/js/scoring.js";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const L = launchNumber("scrambled_fr");
const TODAY = dailyNumber();
const LEN = FR_SC_BOARDS.length;
t("PRECONDITION: the Friends game has launched and the sample has boards", Number.isInteger(L) && LEN >= 4, `launch ${L}, ${LEN} sample boards`);

console.log("\nThe ring");
t("the launch day is board 1", boardForNumber(L, FR_SC_BOARDS, null, "frsc").id === FR_SC_BOARDS[0].id);
t("and the next day board 2", boardForNumber(L + 1, FR_SC_BOARDS, null, "frsc").id === FR_SC_BOARDS[1].id);
t("Vowels reads it half a turn round", boardForNumber(L, FR_SC_BOARDS, "consonants", "frsc").id === FR_SC_BOARDS[Math.floor(LEN / 2)].id);
t("and it wraps", boardForNumber(L + LEN, FR_SC_BOARDS, null, "frsc").id === FR_SC_BOARDS[0].id);
t("before the launch day there is no board", boardForNumber(L - 1, FR_SC_BOARDS, null, "frsc") === null);
t("football's ring is untouched: board 1 is board 1, from the family's first day",
  boardForNumber(1, SC_BOARDS, null).id === SC_BOARDS[0].id && boardForNumber(1, SC_BOARDS, null, "sc").id === SC_BOARDS[0].id);

console.log("\nTokens");
t("a Friends token has its own prefix, and names its cypher",
  scKey(L, null, "frsc") === "frsc:" + L && scKey(L, "consonants", "frsc") === "frsc:c:" + L &&
    tokenCypher("frsc:c:" + L) === "consonants" && tokenCypher("frsc:" + L) === "anagram");
t("football's are what they were", scKey(5) === "sc:5" && scKey(5, "consonants") === "sc:c:5" && setOf("sc:5") === "sc");
t("the set is read off the token", setOf("frsc:" + L) === "frsc" && setOf("frsc:c:" + L) === "frsc");
t("a Friends number before the launch is refused", playableTokenNo("frsc:" + (L - 1)) === false);
t("tomorrow is refused, for both sets", playableTokenNo("frsc:" + (TODAY + 1)) === false && playableTokenNo("sc:" + (TODAY + 1)) === false);
t("today is playable", playableTokenNo("frsc:" + TODAY) === TODAY);
t("a Friends token resolves a Friends board, and not football's",
  FR_SC_BOARDS.includes(boardForToken("frsc:" + L, FR_SC_BOARDS)) && !SC_BOARDS.includes(boardForToken("frsc:" + L, FR_SC_BOARDS)));

console.log("\nThe served board");
/* What is SENT: the payload as the route serialises it. */
const pub = JSON.parse(JSON.stringify(publicBoard(boardForNumber(L, FR_SC_BOARDS, null, "frsc"), L, scKey(L, null, "frsc"))));
t("it is a list of five, each with its row and its scramble",
  pub.layout === "list" && pub.slots.length === 5 && pub.slots.every((s, i) => s.row === i + 1 && typeof s.scramble === "string"));
t("and carries no name, display or alias", pub.slots.every((s) => !("name" in s) && !("display" in s) && !("aliases" in s)));
t("and no pitch", !("pos" in pub.slots[0]) && !("band" in pub.slots[0]) && !("bands" in pub) && !("formation" in pub));

console.log("\nThe table");
{
  const asked = [];
  const env = { DB: { prepare(q) { asked.push(q); return { all: async () => ({ results: FR_SC_BOARDS.map((b) => ({ payload: JSON.stringify(b) })) }) }; } } };
  const got = await loadBoards(env, "frsc");
  t("the Friends set is read from fr_sc_board", asked.some((q) => /FROM fr_sc_board\b/.test(q)) && !asked.some((q) => /FROM sc_board\b/.test(q)), asked.join(" | "));
  t("and comes back as D1's", got.source === "d1" && got.boards.length === LEN);
  const asked2 = [];
  const env2 = { DB: { prepare(q) { asked2.push(q); return { all: async () => ({ results: [] }) }; } } };
  const fb = await loadBoards(env2);
  t("football's is read from sc_board, as it always was", asked2.some((q) => /FROM sc_board\b/.test(q)) && !asked2.some((q) => /fr_sc_board/.test(q)));
  t("and an empty table falls back to its OWN sample", fb.boards === SC_BOARDS && (await loadBoards({}, "frsc")).boards === FR_SC_BOARDS);
}

console.log("\nPrices and score");
t("football's prices are football's: nine to give up a name", costOf("name") === 9 && costOf("letter") === 2);
t("the Friends answer costs its twenty, a letter or a vowel two",
  costOf("name", "frsc") === 20 && costOf("letter", "frsc") === 2 && costOf("vowel", "frsc") === 2);
t("the Friends score is out of 100 and time costs nothing",
  FR_SCORING.MAX_SCORE === 100 && FR_SCORING.computeScore(0, 0).score === 100 &&
    FR_SCORING.computeScore(99999, 0).score === 100 && FR_SCORING.computeScore(99999, 22).score === 78);
t("while football's still falls with the clock", FB_SCORING.computeScore(600, 0).score < FB_SCORING.MAX_SCORE);

console.log("\nA round, judged and finished");
{
  /* A stub that keeps the round tables in memory and re-applies each rule. */
  const round = { play_id: "play-friends-1", token: "frsc:" + L, started_ms: 1000, help: 20, hinted: 0 };
  const board = boardForNumber(L, FR_SC_BOARDS, null, "frsc");
  const solves = board.slots.map((s, i) => ({ slot_id: s.id, how: i === 1 ? "revealed" : "solved", at_ms: 900000 + i }));
  const updates = [];
  const env = { DB: { prepare(q) {
    return { bind(...a) { return {
      first: async () => (/FROM sc_round/.test(q) ? round : null),
      all: async () => (/FROM sc_solve/.test(q) ? { results: solves }
        : /FROM fr_sc_board/.test(q) ? { results: FR_SC_BOARDS.map((b) => ({ payload: JSON.stringify(b) })) } : { results: [] }),
      run: async () => { if (/UPDATE plays/.test(q)) updates.push(a); return { meta: { changes: 1 } }; },
    }; }, all: async () => (/FROM fr_sc_board/.test(q) ? { results: FR_SC_BOARDS.map((b) => ({ payload: JSON.stringify(b) })) } : { results: [] }) };
  } } };
  const v = await verifiedScore(env, round.play_id);
  t("the server scores a Friends round on the Friends engine: 100 less 20, however long it took",
    !!v && v.score === 80 && v.set === "frsc", JSON.stringify(v));
  const res = await finishPost({ request: new Request("https://x.test/api/scrambled/finish", {
    method: "POST", headers: { "X-XI-Games": "1", "Content-Type": "application/json" },
    body: JSON.stringify({ playId: round.play_id }) }), env });
  const j = await res.json();
  t("and the finish lands on a Friends play only", j.verified === true && updates.length === 1 &&
    updates[0].slice(3).join(",") === ENGINE_GAMES.scrambled_fr.join(",") && !updates[0].includes("scrambled"),
    JSON.stringify(updates[0] || null));
}
{
  const board = boardForNumber(L, FR_SC_BOARDS, null, "frsc");
  const res = await guessPost({ request: new Request("https://x.test/api/scrambled/guess", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "frsc:" + L, guess: board.slots[2].name.toLowerCase() }) }), env: {} });
  const j = await res.json();
  t("the shared guess route marks a Friends answer against a Friends token",
    res.status === 200 && j.solvedId === board.slots[2].id && j.name === (board.slots[2].display || board.slots[2].name), JSON.stringify(j));
}

console.log("\nResults");
t("each game files its results under its own key",
  entryKey("scrambled_fr", { no: L }) === "frsc:" + L && entryKey("vowels_fr", { no: L }) === "frvw:" + L &&
    entryKey("scrambled", { no: L }) === "sc:" + L);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
