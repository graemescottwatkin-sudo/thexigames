/* friends/wordsearch/round_test.mjs — Wordsearch XI: Friends, the server.
 *
 *   node friends/wordsearch/round_test.mjs      (from the repo root; no dependencies)
 *
 * EXECUTED, NOT READ. Every route is called as Pages would call it, and every
 * statement it sends runs in node:sqlite against migration 048 (see
 * fixture.mjs). What it proves:
 *
 *   - THE DAILY IS CLUES. Football's list is names; this game's list is clues
 *     and the answers are the thing hunted, so the served daily carries no
 *     answer, no placement and no secret — checked by searching the response
 *     for every word on the board, not by reading field names.
 *   - The release rule: today's board is never served whole, tomorrow's is
 *     refused with the same 404 as an unknown id, a past board opens.
 *   - The round: the server judges a drag (forwards and backwards), a miss is
 *     a foul, a word is found once, the first clock is kept.
 *   - A round whose board STOPS BEING TODAY'S (the schedule reloaded under it)
 *     is answered `stale` rather than judged against the old board — the fault
 *     a phone test found on 28 Sep 2026, when every right drag was a foul.
 *   - Full time: nothing is revealed early; once the round is over the
 *     answers and the secret are; a finished board is scored by the family's
 *     rule, from the server's own rows.
 *
 * The real boards are generated outside this repo. When
 * ../Other/WordsearchXI_Friends/export/boards.json sits beside the checkout,
 * every real board is also checked; absent, that block says it did not run.
 */
import fs from "node:fs";
import path from "node:path";
import { clock, TODAY, YESTERDAY, LONG_AGO, BOARDS, WORDS, BONUS, freshEnv, call, dragFor, ROOT } from "./fixture.mjs";
import { LAUNCHED } from "../../functions/_lib/games.js";
import XIWS_SCORING from "../../football/wordsearch/js/scoring.js";
import { publicPuzzle } from "../../functions/_lib/frws-public.js";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const skip = (n, why) => console.log(`  --  ${n}  — NOT CHECKED: ${why}`);

/* Every answer on a board, in every form a leak could take. */
const secrets = (b) => b.answers.flatMap((a) => [a.grid, a.display]).concat([b.bonus.grid, b.bonus.display]);
const leaks = (text, b) => secrets(b).filter((s) => text.includes(s));
/* THE GRID IS THE PUZZLE and is served on purpose — it spells every word by
   construction — so a leak is searched for in everything EXCEPT the grid. */
const withoutGrid = (text) => { try { return JSON.stringify(JSON.parse(text), (k, v) => (k === "grid" && Array.isArray(v) ? undefined : v)); } catch (e) { return text; } };

console.log("=== The daily is clues, not answers ===");
{
  const env = freshEnv();
  const r = await call(env, "daily");
  const p = r.body && r.body.puzzle;
  t("today's board is served", r.status === 200 && p && p.id === BOARDS.today.id, p && p.id);
  t("PRECONDITION: the stored board does hold its answers", leaks(JSON.stringify(BOARDS.today), BOARDS.today).length > 0);
  t("PRECONDITION: the leak search can see a word (the grid spells them all)", leaks(r.text, BOARDS.today).length > 0);
  t("the response names no answer and no secret, in any field but the grid", leaks(withoutGrid(r.text), BOARDS.today).length === 0,
    leaks(withoutGrid(r.text), BOARDS.today).join(", ") || "none of " + secrets(BOARDS.today).length + " found");
  t("and no placement", !/placement|start_row|direction/.test(r.text));
  t("eleven clues, each with its place and its length",
    p.answers.length === 11 && p.answers.every((a, i) => a.n === i && a.clue && a.len === WORDS[i].length),
    p.answers.map((a) => a.len).join(","));
  t("the bonus is a clue and a length", p.bonus && p.bonus.has && p.bonus.clue && p.bonus.len === BONUS.length);
  t("the grid is the grid", JSON.stringify(p.grid) === JSON.stringify(BOARDS.today.grid));
  t("never cached, never indexed", r.headers.get("Cache-Control") === "no-store" &&
    r.headers.get("X-Robots-Tag") === "noindex");
  const none = await call({ DB: freshEnv({}).DB }, "daily");
  t("a day with no board is a null puzzle, not an error", none.status === 200 && none.body.puzzle === null);
  const nodb = await call({}, "daily");
  t("and so is no database: no sample boards in this repo", nodb.status === 200 && nodb.body.puzzle === null);
}

console.log("\n=== Which boards open whole ===");
{
  const env = freshEnv();
  const get = (id) => call(env, "puzzle", { query: "?id=" + encodeURIComponent(id) });
  const today = await get(BOARDS.today.id), tomorrow = await get(BOARDS.tomorrow.id);
  const unknown = await get("FRWS-0000"), bad = await get("XIWS-0001");
  t("TODAY'S BOARD IS REFUSED WHOLE", today.status === 404, String(today.status));
  t("tomorrow's is refused", tomorrow.status === 404);
  t("with the same answer as an unknown id and a malformed one",
    [today, tomorrow, unknown, bad].every((r) => r.status === 404 && r.text === today.text), today.text);
  const yest = await get(BOARDS.yesterday.id), never = await get(BOARDS.never.id), old = await get(BOARDS.old.id);
  t("yesterday's opens, whole, for free play", yest.status === 200 && yest.body.puzzle.answers[0].placement);
  t("a board never scheduled opens", never.status === 200);
  t("an old board opens too while there are no accounts to ask for", old.status === 200, String(old.status));
  const cat = await call(env, "catalog");
  const ids = cat.body.boards.map((b) => b.id).sort();
  t("the catalogue lists what may open, and not today's or tomorrow's",
    JSON.stringify(ids) === JSON.stringify([BOARDS.yesterday.id, BOARDS.old.id, BOARDS.never.id].sort()), ids.join(", "));
  t("and names no answer", Object.values(BOARDS).every((b) => leaks(withoutGrid(cat.text), b).length === 0));
  /* BOUNDED BY THE LAUNCH (games.js LAUNCHED), not the schedule's first row:
     a day before the game launched is not a day it ran. What is expected is
     derived from the fixture's days and the launch, so the check holds on
     launch day (nothing yet) and every day after. */
  const arc = await call(env, "archive");
  const want = [LONG_AGO, YESTERDAY].filter((d) => d >= LAUNCHED.wordsearch_fr && d < TODAY).sort().reverse();
  t("previous dailies are the days since the launch and before today, newest first, each numbered",
    JSON.stringify(arc.body.days.map((d) => d.day)) === JSON.stringify(want) &&
      arc.body.days.every((d) => Number.isInteger(d.no)), arc.body.days.map((d) => d.day).join(", ") || "none, as derived");
  t("and none before the launch", arc.body.days.every((d) => d.day >= LAUNCHED.wordsearch_fr));
  const dly = await call(env, "daily");
  t("today's board carries its board number", Number.isInteger(dly.body.no), String(dly.body.no));
}

console.log("\n=== A round, judged by the server ===");
const env = freshEnv();
const PLAY = "fwtest000000000001";
const find = (drag, playId = PLAY) => call(env, "find", { method: "POST", body: { playId, ...drag } });
{
  const k = await call(env, "round", { method: "POST", body: { playId: PLAY } });
  t("kick off starts a verified round", k.body.verified === true && k.body.startedMs === clock.now());
  clock.advance(5000);
  const again = await call(env, "round", { method: "POST", body: { playId: PLAY } });
  t("kicking off again keeps the first clock", again.body.startedMs === k.body.startedMs);

  const hit = await find(dragFor(BOARDS.today, 0));
  t("a right drag is a hit, naming its clue and its word", hit.body.hit && hit.body.hit.n === 0 &&
    hit.body.hit.grid === "ALPHA" && hit.body.hit.placement.direction === "E", JSON.stringify(hit.body.hit));
  const back = await find(dragFor(BOARDS.today, 3));
  t("a word written backwards is found by dragging it as written", back.body.hit && back.body.hit.n === 3);
  const d = dragFor(BOARDS.today, 1);
  const rev = await find({ from: d.to, to: d.from });
  t("and a word is found whichever end the drag starts from", rev.body.hit && rev.body.hit.n === 1);
  const twice = await find(dragFor(BOARDS.today, 0));
  t("a word already found is not found again, it is a foul", !twice.body.hit && twice.body.foul === true);
  const miss = await find({ from: [13, 0], to: [13, 4] });
  t("a drag across nothing is a foul, and numbered", miss.body.foul === true && miss.body.fouls === 2, JSON.stringify(miss.body));
  t("a miss says nothing about what was nearly found", Object.keys(miss.body).sort().join() === "foul,fouls,hit");
  const bent = await find({ from: [0, 0], to: [2, 5] });
  t("a bent line is not a selection", !bent.body.hit);
  const bonus = await find(dragFor(BOARDS.today, "bonus"));
  t("the secret is found like any word, and flagged", bonus.body.hit && bonus.body.hit.bonus === true && bonus.body.hit.n === null);
  const refused = await call(env, "find", { method: "POST", body: { playId: PLAY, ...dragFor(BOARDS.today, 2) }, csrf: false });
  t("a POST without the family's header is refused", refused.status === 403);
  const rows = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM fr_ws_find WHERE play_id = ?").get(PLAY).n;
  t("the rows are the finds: three words and the secret", rows === 4, String(rows));

  const resumed = await call(env, "round", { method: "POST", body: { playId: PLAY } });
  t("a resumed round is told what it has found, with where", resumed.body.found.length === 4 &&
    resumed.body.found.every((f) => f.placement && f.grid), resumed.body.found.map((f) => f.grid).join(","));
  t("and nothing it has not", leaks(withoutGrid(resumed.text), { answers: BOARDS.today.answers.filter((a, i) => ![0, 1, 3].includes(i)),
    bonus: { grid: "#", display: "#" } }).length === 0);

  const early = await call(env, "finish", { method: "POST", body: { playId: PLAY } });
  t("finishing early reveals nothing and verifies nothing", early.body.verified === false && !early.body.reveal &&
    leaks(withoutGrid(early.text), { answers: BOARDS.today.answers.slice(4), bonus: { grid: "#", display: "#" } }).length === 0, early.text);
}

console.log("\n=== Full time ===");
{
  for (let n = 0; n < 11; n++) { clock.advance(10000); await find(dragFor(BOARDS.today, n)); }
  const f = await call(env, "finish", { method: "POST", body: { playId: PLAY } });
  t("eleven found: the server verifies the score", f.body.verified === true && f.body.found === 11, f.text.slice(0, 120));
  const round = env.DB.raw.prepare("SELECT started_ms FROM fr_ws_round WHERE play_id = ?").get(PLAY);
  const last = env.DB.raw.prepare("SELECT MAX(at_ms) AS m FROM fr_ws_find WHERE play_id = ?").get(PLAY).m;
  const fouls = env.DB.raw.prepare("SELECT at_ms FROM fr_ws_foul WHERE play_id = ? ORDER BY idx").all(PLAY).map((r) => r.at_ms);
  const want = XIWS_SCORING.computeScore(Math.round((last - round.started_ms) / 1000), XIWS_SCORING.penaltyFor(fouls), true);
  t("by the family's rule, from the rows the server wrote", f.body.score === want.score && f.body.bonusFound === true,
    `${f.body.score} = ${want.score}`);
  t("and now the answers and the secret are named", f.body.reveal && f.body.reveal.answers.length === 11 &&
    f.body.reveal.answers[2] === BOARDS.today.answers[2].display && f.body.reveal.secret === "Lima");

  const timed = "fwtest000000000002";
  await call(env, "round", { method: "POST", body: { playId: timed } });
  await find(dragFor(BOARDS.today, 0), timed);
  const before = await call(env, "finish", { method: "POST", body: { playId: timed } });
  clock.advance(XIWS_SCORING.REAL_SECONDS * 1000 + 1000);
  const after = await call(env, "finish", { method: "POST", body: { playId: timed } });
  t("a round out of time is over: its answers are named then and not before",
    !before.body.reveal && after.body.reveal && after.body.reveal.answers.length === 11);
  t("but one word found is not a verified score", after.body.verified === false);
  const nobody = await call(env, "finish", { method: "POST", body: { playId: "fwnobodyplayedthis" } });
  t("a round that never kicked off reveals nothing", !nobody.body.reveal && nobody.body.verified === false);
  const junk = await call(env, "finish", { method: "POST", body: { playId: "../../etc" } });
  t("nor does a play id of the wrong shape", !junk.body.reveal);
  clock.reset();
}

console.log("\n=== The schedule changes under a round ===");
{
  const env2 = freshEnv();
  const id = "fwtest000000000003";
  await call(env2, "round", { method: "POST", body: { playId: id } });
  /* Reloaded: today is now a different board. */
  env2.DB.raw.prepare("UPDATE fr_ws_schedule SET puzzle_id = ? WHERE day = ?").run(BOARDS.never.id, TODAY);
  const f = await call(env2, "find", { method: "POST", body: { playId: id, ...dragFor(BOARDS.never, 0) } });
  t("a drag on the new board is answered stale, not judged against the old one", f.body.stale === true && !f.body.foul,
    JSON.stringify(f.body));
  const fouls = env2.DB.raw.prepare("SELECT COUNT(*) AS n FROM fr_ws_foul WHERE play_id = ?").get(id).n;
  t("and no foul is written for it", fouls === 0);
  const k = await call(env2, "round", { method: "POST", body: { playId: id } });
  t("kicking off with that id says stale too, so the page starts afresh", k.body.stale === true && k.body.verified === false);
  const fresh = "fwtest000000000004";
  await call(env2, "round", { method: "POST", body: { playId: fresh } });
  const ok = await call(env2, "find", { method: "POST", body: { playId: fresh, ...dragFor(BOARDS.never, 0) } });
  t("a fresh round on the new board is judged normally", ok.body.hit && ok.body.hit.n === 0);

  /* Past midnight is different: yesterday's round plays on yesterday's board. */
  const late = "fwtest000000000005";
  env2.DB.raw.prepare("INSERT INTO fr_ws_round (play_id, puzzle_id, day, started_ms) VALUES (?, ?, ?, ?)")
    .run(late, BOARDS.yesterday.id, YESTERDAY, clock.now() - 60000);
  const y = await call(env2, "find", { method: "POST", body: { playId: late, ...dragFor(BOARDS.yesterday, 5) } });
  t("a round from yesterday is judged on yesterday's board, past midnight", y.body.hit && y.body.hit.n === 5);
}

console.log("\n=== The real boards, when they are beside the checkout ===");
{
  const file = path.join(ROOT, "..", "Other", "WordsearchXI_Friends", "export", "boards.json");
  if (!fs.existsSync(file)) {
    skip("every real board", "WordsearchXI_Friends/export/boards.json is not beside this checkout — this is not a pass");
  } else {
    const { puzzles, schedule } = JSON.parse(fs.readFileSync(file, "utf8"));
    const D = { E: [0, 1], W: [0, -1], S: [1, 0], N: [-1, 0], SE: [1, 1], SW: [1, -1], NE: [-1, 1], NW: [-1, -1] };
    const spells = (g, a) => { const [dr, dc] = D[a.placement.direction] || [9, 9]; let s = "";
      for (let k = 0; k < a.grid.length; k++) s += (g[a.placement.start_row + dr * k] || "")[a.placement.start_col + dc * k] || "";
      return s === a.grid; };
    const bad = [], leaked = [];
    for (const p of puzzles) {
      const all = p.answers.concat([p.bonus]);
      if (p.answers.length !== 11 || p.grid.length !== 14 || p.grid.some((r) => !/^[A-Z]{12}$/.test(r))) bad.push(p.id + " shape");
      for (const a of all) if (!spells(p.grid, a)) bad.push(p.id + " " + a.grid);
      /* THE SECRECY OF THE LIST, on real data: what the player READS on the
         served board — its title, its category and every clue — may not carry
         an answer on that board as a word. Found FRWS-0145 on its first run:
         "Behind the scenes (24)" with BEHIND among its answers. (The grid
         spells every word by design, and a first version that scanned the
         whole payload also flagged READY for `status: "ready"`.) */
      const pp = publicPuzzle(p);
      const read = " " + [pp.theme, pp.category, pp.bonus.clue, ...pp.answers.map((a) => a.clue)].join(" ")
        .toUpperCase().replace(/[^A-Z]+/g, " ") + " ";
      for (const a of all) if (a.grid.length > 3 && read.includes(" " + a.grid + " ")) leaked.push(p.id + " " + a.grid);
    }
    t(`all ${puzzles.length} real boards are 14x12 with eleven words, and every word spells out`, bad.length === 0, bad.slice(0, 5).join(", "));
    t("no real board hands over an answer in its title, category or clues", leaked.length === 0, leaked.slice(0, 5).join(", ") || "checked the served form of every board");
    const ids = new Set(puzzles.map((p) => p.id));
    t("every scheduled day names a real board, and every id is FRWS-NNNN",
      Object.values(schedule).every((id) => ids.has(id)) && [...ids].every((id) => /^FRWS-\d{4}$/.test(id)));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
