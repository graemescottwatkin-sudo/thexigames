/* bot_solve_test.mjs — can a bot finish each game without being told anything?
 *
 * The whole design of item 14 rests on this being true. If a bot needed the
 * bank, the bank would have to reach CI, and a public repo holding the forward
 * bank in its secrets is a worse problem than the one the bot solves. So the
 * claim is checked rather than asserted:
 *
 *   every word on a real board is located from the GRID ALONE, using only the
 *   payload a browser is given — which has no placements in it
 *
 * and located against the real judge: the coordinates the solver produces are
 * fed to ws-round's own judge(), the same function production uses, so a
 * solver that found the right word in the wrong direction fails here rather
 * than at 01:10 in the morning.
 *
 *   node tools/bot_solve_test.mjs        (from the repo root)
 */
import {
  findWord, solveWordsearch, aFoul, hiloCalls,
  slotsToReveal, entriesToReveal, sessionPlan, SESSIONS, describeFailure,
} from "./bot_solve.mjs";
import { publicPuzzle } from "../functions/_lib/ws-public.js";
import { judge, selectionCells } from "../functions/_lib/ws-round.js";
import { SAMPLE_PUZZLES } from "../functions/_lib/ws-sample.js";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const BOARDS = Object.values(SAMPLE_PUZZLES);

console.log("Every word, from the grid alone");
{
  t("there are real boards to solve", BOARDS.length > 0, BOARDS.length + " boards");

  let words = 0, boards = 0, ms = 0;
  const failures = [];
  for (const board of BOARDS) {
    /* THE PAYLOAD A BROWSER GETS, not the board. publicPuzzle strips every
       placement — if the solver reached past it into the raw board this whole
       suite would be theatre, so it is handed the public shape and nothing
       else. */
    const seen = publicPuzzle(board);
    const started = Date.now();
    const solved = solveWordsearch(seen);
    ms += Date.now() - started;
    boards++;
    words += solved.found.length;
    if (solved.missing.length) failures.push(solved.missing.join(", "));
  }
  t("no placements travel in the payload the solver is given",
    JSON.stringify(publicPuzzle(BOARDS[0])).indexOf("placement") === -1,
    "the grid and the words, and nothing about where they are");
  t("every word on every board is located",
    failures.length === 0, failures.length ? "NOT FOUND: " + failures.join(" | ")
      : `${words} words across ${boards} boards`);
  t("and it takes no time worth measuring", ms < 2000, ms + "ms for " + boards + " boards");
}

console.log("\nAnd the real judge agrees with every one of them");
{
  /* THE CHECK THAT MATTERS. Finding the letters is not the same as producing
     the drag a player would make: a solver that ran a word backwards, or that
     was off by one at the end, would still "find" it and be refused by the
     server every night. So the coordinates go to the same judge production
     uses. */
  let judged = 0;
  const wrong = [];
  for (const board of BOARDS) {
    const seen = publicPuzzle(board);
    const solved = solveWordsearch(seen);
    const already = [];
    for (const f of solved.found) {
      const hit = judge(board, f.from, f.to, already);
      judged++;
      if (!hit || hit.bonus) { wrong.push(f.display); continue; }
      const got = (hit.item && hit.item.display) || "";
      if (got !== f.display) wrong.push(`${f.display} judged as ${got || "nothing"}`);
      else already.push(got);
    }
    /* AND THE BOARD IS ACTUALLY FINISHED, not merely eleven-things-judged:
       every named answer accounted for, once each. */
    if (already.length !== (seen.answers || []).length) {
      wrong.push(`board finished ${already.length}/${(seen.answers || []).length}`);
    }
  }
  t("the server's own judge accepts every selection the solver makes",
    wrong.length === 0, wrong.length ? "REFUSED: " + wrong.join(" | ") : judged + " selections judged");
}

console.log("\nA word that is not in the grid is a verdict about the board");
{
  const board = BOARDS[0];
  const seen = publicPuzzle(board);
  const bent = JSON.parse(JSON.stringify(seen));
  bent.answers[2] = { display: "Nobody", grid: "QQQQQQQ" };
  const solved = solveWordsearch(bent);
  t("it is reported as missing rather than crashing or being skipped",
    solved.missing.length === 1 && solved.missing[0] === "Nobody",
    JSON.stringify(solved.missing));
  t("and the rest of the board is still solved",
    solved.found.length === seen.answers.length - 1);
}

console.log("\nReading the letters, not the name");
{
  /* "O'Neill" is ONEILL in a grid. A solver comparing the display name would
     report a sound board as broken, which is the wrong way round for a check
     that is meant to find broken boards. */
  const grid = ["XONEILLX", "XXXXXXXX"];
  t("punctuation and case are ignored",
    !!findWord(grid, "O'Neill") && !!findWord(grid, "o'neill"),
    JSON.stringify(findWord(grid, "O'Neill")));
  t("a word that is not there is null", findWord(grid, "Rooney") === null);
  t("and neither an empty word nor an empty grid throws",
    findWord(grid, "") === null && findWord([], "ANY") === null);
}

console.log("\nAll eight directions, including backwards and up");
{
  const grid = [
    "ABCDE",
    "FGHIJ",
    "KLMNO",
    "PQRST",
    "UVWXY",
  ];
  const cases = [
    ["ABCDE", "east"], ["EDCBA", "west"], ["AFKPU", "south"], ["UPKFA", "north"],
    ["AGMSY", "south-east"], ["YSMGA", "north-west"], ["EIMQU", "south-west"],
    ["UQMIE", "north-east"],
  ];
  const missed = cases.filter(([w]) => !findWord(grid, w)).map(([, n]) => n);
  t("a word lying any of the eight ways is found",
    missed.length === 0, missed.length ? "missed: " + missed.join(", ") : "all eight");
  /* AND THE COORDINATES POINT THE RIGHT WAY. A solver returning from/to
     reversed would find every word and drag every one of them backwards. */
  const west = findWord(grid, "EDCBA");
  t("and from/to run in the word's own direction, not always left to right",
    west.from[1] === 4 && west.to[1] === 0, JSON.stringify(west));
  /* THE SELECTION IS A LINE THE SERVER WILL ACCEPT. selectionCells refuses
     anything that is not a row, a column or a true diagonal. */
  const diag = findWord(grid, "AGMSY");
  t("a diagonal produces a selection the server can read",
    selectionCells(diag.from, diag.to).length === 5,
    selectionCells(diag.from, diag.to).join(" "));
}

console.log("\nA foul that is really a foul");
{
  const board = BOARDS[0];
  const seen = publicPuzzle(board);
  const solved = solveWordsearch(seen);
  const foul = aFoul(seen, []);
  t("there is a selection to make that spells nothing", !!foul, JSON.stringify(foul));
  /* PROVED AGAINST THE JUDGE, not assumed. A "foul" that happened to land on a
     word would score points instead of conceding minutes, and the escalation
     it was meant to exercise would never fire. */
  t("and the server judges it as a miss",
    judge(board, foul.from, foul.to, []) === null,
    "a foul the server disagrees with is not a foul");
  const late = aFoul(seen, solved.found);
  t("one is still available once the board is solved",
    !!late && judge(board, late.from, late.to, solved.found.map((f) => f.display)) === null,
    JSON.stringify(late));
}

console.log("\nThe other games need no answers either");
{
  t("HiLo calls every row without knowing a value",
    hiloCalls(11).length === 11 && hiloCalls(11).every((c) => c === "higher"));
  t("and can vary its calls without varying the driver",
    hiloCalls(4, "alternate").join(",") === "higher,lower,higher,lower");
  t("no rows is no calls, rather than an error", hiloCalls(0).length === 0);

  const sc = { slots: [{ id: "a" }, { id: "b", presolved: true }, { id: "c" }] };
  t("the cypher games buy every slot that is not already open",
    slotsToReveal(sc).join(",") === "a,c",
    "buying a presolved slot is a purchase with nothing behind it");
  t("and an empty board asks for nothing", slotsToReveal({}).length === 0);

  const cw = { puzzle: { entries: [{ num: 1, dir: "across" }, { num: 2, dir: "down" }] } };
  t("the crossword buys every entry", entriesToReveal(cw).length === 2);
  t("and a payload with no puzzle in it asks for nothing", entriesToReveal({}).length === 0);
}

console.log("\nTen sessions a night");
{
  const plan = sessionPlan(["crossword", "wordsearch", "scrambled", "hilo", "vowels"]);
  t("five games, two sessions each", plan.length === 10, plan.length + " sessions");
  t("one that completes and one that walks away, per game",
    SESSIONS.join(",") === "complete,abandon" &&
    plan.filter((p) => p.kind === "abandon").length === 5,
    "the abandon is the only thing that produces a LOSS in the season");
}

/* ---- a refusal says what it was ------------------------------------------
   For seven nights the bot's report read "a reveal was refused (503)" and the
   cause was in the body it discarded: Cloudflare's error 1102, a Worker over its
   CPU limit (29 Sep 2026). The shapes below are the ones a refusal takes -- our
   own JSON, Cloudflare's plain "error code: NNNN" (what it gives a client that
   is not a browser), its HTML page, and anything else, which is quoted rather
   than dropped. The last two are Cloudflare's documented forms, not bodies
   captured from our own logs: the bot threw those away, which is the point. */
console.log("\nA refusal says what it was");
{
  const cases = [
    ["our own JSON error", describeFailure(403, JSON.stringify({ error: "That board is not playable." }), null),
      `403 "That board is not playable."`],
    ["Cloudflare's plain error code, with the ray", describeFailure(503, "error code: 1102", "a42a4f497829b11d-MAN"),
      "503 Cloudflare error 1102 (ray a42a4f497829b11d-MAN)"],
    ["Cloudflare's page: the code and its title", describeFailure(503,
      "<!DOCTYPE html><html><head><title>Worker exceeded resource limits | www.thexigames.com | Cloudflare</title></head>" +
      "<body><h1>Error 1102</h1><p>Ray ID: x</p></body></html>", "r1"),
      "503 Cloudflare error 1102: Worker exceeded resource limits (ray r1)"],
    ["anything else is quoted, not dropped", describeFailure(502, "<p>Bad   gateway</p>", null), "502 Bad gateway"],
    ["and an empty body is just the status", describeFailure(500, "", null), "500"],
  ];
  for (const [name, got, want] of cases) t(name, got === want, got);
}

/* AND THE BOT SAYS IT, run for real against a stub that refuses the way
   production did: Vowels' reveals answer Cloudflare's 1102, and HiLo's daily an
   edge page. What is asserted is the bot's own report line, so a describer that
   is right and never called -- or a body read twice and lost -- fails here. */
{
  const http = await import("node:http");
  const { spawn } = await import("node:child_process");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const send = (status, body, type = "application/json", h = {}) => {
      res.writeHead(status, { "Content-Type": type, ...h });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    req.resume();
    req.on("end", () => {
      if (u.pathname === "/api/account/code") return send(200, { user: { id: "bot-test" } });
      if (u.pathname === "/api/scrambled/daily") return send(200, { no: 1, token: "sc:c:1", slots: [{ id: 1 }, { id: 2 }] });
      if (u.pathname === "/api/scrambled/reveal") return send(503, "error code: 1102", "text/plain", { "cf-ray": "test-ray-1" });
      if (u.pathname === "/api/hilo/daily") return send(503, "<html><head><title>Service unavailable | x</title></head><body>Error 1102</body></html>", "text/html");
      return send(200, {});
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const run = (games) => new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, "play_bot.mjs")],
      { env: { ...process.env, BASE: base, XI_BOT_CODE: "test-code", GAMES: games } });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => resolve({ code, out }));
  });
  const v = await run("vowels");
  t("the bot's report names Cloudflare's error and the ray for a refused reveal",
    v.code === 1 && v.out.includes("vowels: a reveal was refused (503 Cloudflare error 1102 (ray test-ray-1))"),
    (v.out.split("\n").find((l) => /refused/.test(l)) || v.out.slice(-200)).trim());
  const h = await run("hilo");
  t("and for a daily that never came, what came instead",
    h.code === 1 && h.out.includes("hilo: no daily to play (503 Cloudflare error 1102: Service unavailable)"),
    (h.out.split("\n").find((l) => /no daily/.test(l)) || h.out.slice(-200)).trim());
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
