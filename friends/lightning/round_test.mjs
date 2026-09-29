/* friends/lightning/round_test.mjs — the deal, the clock and the marking,
 * run against a real SQLite with the real migration.
 *
 *   node friends/lightning/round_test.mjs
 *
 * EXECUTED, NOT READ. Every statement lr-play.js sends goes through
 * node:sqlite with data/migrations/047-friends-lightning.sql applied, so a
 * column named wrongly fails here and not in production.
 *
 * The pool is a synthetic one built below, plus the real pool when
 * LightningRoundXI_Friends/export/lightning-pool.json sits beside the repo
 * (it is generated there and never committed). Absent, those checks say they
 * did not run; that is not a pass.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  deal, shape, judge, msLeft, orderOptions, rngFrom, SECRET_FIELDS,
  RUN_MS, WRONG_PENALTY_MS, LATE_GRACE_MS, RUN_LENGTH,
} from "../../functions/_lib/lr-round.js";
import { startRun, answerRun, finishRun, resumeRun, getRun, dailySeq, cleanRecent, boardFor } from "../../functions/_lib/lr-play.js";
import { onRequestPost as startRoute } from "../../functions/api/lightning_fr/start.js";
import { onRequestPost as answerRoute } from "../../functions/api/lightning_fr/answer.js";
import CONFIG from "./js/config.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* ---- D1, over node:sqlite ------------------------------------------------ */
function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(ROOT, "data/migrations/047-friends-lightning.sql"), "utf8"));
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args),
  });
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec("BEGIN");
      try {
        for (const s of list) db.prepare(s.sql).run(...s.args);
        db.exec("COMMIT");
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

/* ---- a synthetic pool ---------------------------------------------------- */
function synthetic() {
  const qs = [];
  const add = (diff, n, start) => {
    for (let i = 0; i < n; i++) {
      const id = diff[0] + "XX" + String(start + i).padStart(4, "0");
      qs.push({ id, diff, clue: `Question ${id}?`, answer: "Right " + id,
        options: ["Right " + id, "Wrong A", "Wrong B", "Wrong C"], pgk: "Subject " + (i % 25) });
    }
  };
  add("Easy", 60, 0); add("Medium", 300, 0); add("Hard", 160, 0);
  const pairs = [["EXX0000", "MXX0000"], ["MXX0001", "MXX0002"], ["HXX0003", "MXX0003"]];
  return { questions: qs, pairs };
}

function load(env, pool) {
  for (const q of pool.questions) {
    env.DB.raw.prepare("INSERT INTO fr_lr_question (id, diff, clue, answer, option_1, option_2, option_3, option_4, pgk) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(q.id, q.diff, q.clue, q.answer, ...q.options, q.pgk);
  }
  for (const [a, b] of pool.pairs) env.DB.raw.prepare("INSERT INTO fr_lr_pair (a, b) VALUES (?, ?)").run(a, b);
}

const REAL_PATH = path.join(ROOT, "..", "Other", "LightningRoundXI_Friends", "export", "lightning-pool.json");
const real = fs.existsSync(REAL_PATH) ? JSON.parse(fs.readFileSync(REAL_PATH, "utf8")) : null;

/* ---- the deal ------------------------------------------------------------ */
function checkDeal(label, pool) {
  const byId = new Map(pool.questions.map((q) => [q.id, q]));
  const pairs = pool.pairs;
  const partner = new Set(pairs.map(([a, b]) => a + "|" + b));
  const seqs = [];
  for (let i = 0; i < 300; i++) seqs.push(deal(pool.questions, pairs, `${label}:${i}`));

  t(`${label}: every run is ${RUN_LENGTH} long`, seqs.every((s) => s.length === RUN_LENGTH));
  t(`${label}: every run opens on an Easy one`, seqs.every((s) => byId.get(s[0]).diff === "Easy"));
  t(`${label}: no question twice in a run`, seqs.every((s) => new Set(s).size === s.length));
  const clash = seqs.find((s) => s.some((a) => s.some((b) => partner.has(a + "|" + b))));
  t(`${label}: no pair ever served together`, !clash);
  const gapBroken = seqs.filter((s) => s.some((id, i) => {
    const p = byId.get(id).pgk;
    return p && s.slice(Math.max(0, i - CONFIG.SUBJECT_GAP), i).some((x) => byId.get(x).pgk === p);
  })).length;
  t(`${label}: no subject within ${CONFIG.SUBJECT_GAP} of itself`, gapBroken === 0, `${gapBroken} runs broke it`);

  /* The mix, over the first forty (as far as a run gets), after slot one. */
  const counts = { Easy: 0, Medium: 0, Hard: 0 };
  let n = 0;
  for (const s of seqs) for (const id of s.slice(1, 40)) { counts[byId.get(id).diff]++; n++; }
  const pct = (d) => (100 * counts[d]) / n;
  const near = (d) => Math.abs(pct(d) - CONFIG.MIX[d]) <= 2.5;
  t(`${label}: the mix is ${CONFIG.MIX.Easy}/${CONFIG.MIX.Medium}/${CONFIG.MIX.Hard}`,
    near("Easy") && near("Medium") && near("Hard"),
    `measured ${pct("Easy").toFixed(1)}/${pct("Medium").toFixed(1)}/${pct("Hard").toFixed(1)}`);

  const a = deal(pool.questions, pairs, "same"), b = deal(pool.questions, pairs, "same");
  t(`${label}: one seed deals one run`, a.join() === b.join());
  const shuffled = [...pool.questions].reverse();
  t(`${label}: whatever order the pool arrives in`, deal(shuffled, pairs, "same").join() === a.join());
  t(`${label}: another seed deals another`, deal(pool.questions, pairs, "other").join() !== a.join());

  /* Practice: avoid the recent, and fall back to the longest-ago. */
  const recent = deal(pool.questions, pairs, "recent-a", { length: 400 });
  const next = deal(pool.questions, pairs, "recent-b", { recent });
  const reused = next.filter((id) => recent.includes(id));
  const easyLeft = pool.questions.filter((q) => q.diff === "Easy" && !recent.includes(q.id)).length;
  t(`${label}: practice avoids the last ${recent.length} seen`, easyLeft === 0 || reused.length === 0,
    `${reused.length} reused, ${easyLeft} unseen Easy left`);
  const daily = deal(pool.questions, pairs, "daily:x");
  const practice = deal(pool.questions, pairs, "p", { avoid: daily });
  t(`${label}: practice avoids today's daily`, !practice.some((id) => daily.includes(id)));

  /* Everything seen: still a full run, least-recent first. */
  const all = pool.questions.map((q) => q.id);
  const full = deal(pool.questions, pairs, "tired", { recent: all });
  t(`${label}: a player who has seen everything still gets a full run`, full.length === RUN_LENGTH);
}

console.log("=== The deal ===");
checkDeal("synthetic", synthetic());
if (real) checkDeal("real pool", real);
else console.log("  --  the real pool was NOT checked: " + REAL_PATH + " is absent. This is not a pass.");

console.log("\n=== What leaves the server ===");
{
  const row = { id: "EXX0001", clue: "c?", answer: "Right", option_1: "Right", option_2: "B", option_3: "C", option_4: "D" };
  const s = shape(row, "seed", 1);
  t("a served question carries no answer", SECRET_FIELDS.every((f) => !(f in s)) && !JSON.stringify(s).includes('"answer"'));
  t("and its four options, all of them", s.options.slice().sort().join() === ["Right", "B", "C", "D"].sort().join());
  t("in an order fixed by the run's seed", orderOptions(row, "seed").join() === orderOptions(row, "seed").join());
  let firsts = new Set();
  for (let i = 0; i < 40; i++) firsts.add(orderOptions(row, "s" + i).indexOf("Right"));
  t("and the right one is not always in the same place", firsts.size === 4);
  t("a pick not offered is refused, not marked wrong", judge(row, "Elsewhere").offered === false);
  t("case and spacing do not matter", judge(row, "  right ").correct === true);
}

console.log("\n=== A run ===");
{
  const env = { DB: d1() };
  load(env, synthetic());
  const T0 = Date.parse("2026-09-28T12:00:00Z");

  const r = await startRun(env, { mode: "daily", now: T0 });
  t("a daily starts with the full clock", r.msLeft === RUN_MS);
  t("and question one", r.question && r.question.idx === 1 && r.question.options.length === 4);
  t("which is not carrying its answer", !("answer" in r.question));

  let run = await getRun(env, r.runId);
  const right = (q) => "Right " + q.id;
  const wrongPick = (q) => q.options.find((o) => o !== right(q));

  let a1 = await answerRun(env, run, 1, right(r.question), T0 + 2000);
  t("a right answer scores one", a1.correct && a1.score === 1);
  t("and names the right one, which is the pick", a1.answer === right(r.question));
  t("and the next question comes back with it", a1.next && a1.next.idx === 2);
  t("the clock is the server's", a1.msLeft === RUN_MS - 2000);

  run = await getRun(env, r.runId);
  const again = await answerRun(env, run, 1, wrongPick(r.question), T0 + 2500);
  t("answering the same question again changes nothing", again.replayed && again.correct && again.score === 1);

  run = await getRun(env, r.runId);
  let a2 = await answerRun(env, run, 2, wrongPick(a1.next), T0 + 4000);
  t("a wrong answer scores nothing", !a2.correct && a2.score === 1 && a2.wrong === 1);
  t(`and costs ${WRONG_PENALTY_MS / 1000} seconds`, a2.penaltyMs === WRONG_PENALTY_MS && a2.msLeft === RUN_MS - 4000 - WRONG_PENALTY_MS);
  /* THE ANSWER THE MOMENT IT IS MISSED (the owner, 29 Sep 2026, reversing the
     28 Sep hold to the end): the page lights it green straight away. */
  t("and says what it was, straight away", a2.answer === "Right " + a1.next.id);
  run = await getRun(env, r.runId);
  const replayWrong = await answerRun(env, run, 2, right(a1.next), T0 + 4200);
  t("and the same on a replay of it", replayWrong.replayed && replayWrong.answer === "Right " + a1.next.id && !replayWrong.correct);

  run = await getRun(env, r.runId);
  t("a question not yet served cannot be answered", (await answerRun(env, run, 5, "x", T0 + 5000)).error);
  t("a pick that was not offered is refused", (await answerRun(env, run, 3, "Nonsense", T0 + 5000)).error === "that was not one of the options");

  const early = await finishRun(env, run, T0 + 10000);
  t("the run cannot be ended while there is time", early.error && early.msLeft > 0);

  const res = await resumeRun(env, run, T0 + 10000);
  t("a reload picks up at the question on screen", res.question && res.question.idx === 3 && res.score === 1);

  /* Time runs out at 60 s less the 3 s charged: T0 + 57 000. */
  const end = T0 + RUN_MS - WRONG_PENALTY_MS;
  t("a pick just after zero is forgiven", !(await answerRun(env, run, 3, right(res.question), end + LATE_GRACE_MS - 100)).error);
  run = await getRun(env, r.runId);
  const late = await answerRun(env, run, 4, "x", end + LATE_GRACE_MS + 100);
  t("a pick well after zero is not marked", late.error === "time is up");

  const fin = await finishRun(env, run, end + 2000);
  t("the whistle counts the server's rows", fin.score === 2 && fin.wrong === 1 && fin.answered === 3,
    JSON.stringify({ score: fin.score, wrong: fin.wrong, answered: fin.answered }));
  t("and every answer carries its question's id, for reporting",
    fin.answers.length === 3 && fin.answers.every((a) => typeof a.id === "string" && a.id.length > 0));
  t("and lists the one they missed, with its answer, now", fin.missed.length === 1 && fin.missed[0].answer === "Right " + a1.next.id);
  t("and the marks in order", fin.marks.join("") === "101");
  t("and the time the misses cost", fin.lostMs === WRONG_PENALTY_MS, String(fin.lostMs));
  run = await getRun(env, r.runId);
  t("finishing twice is the same result", (await finishRun(env, run, end + 9000)).score === 2);
  t("and a finished run takes no more answers", (await answerRun(env, run, 4, "x", end + 9000)).error);

  const r2 = await startRun(env, { mode: "daily", now: T0 + 3600e3 });
  const run2 = await getRun(env, r2.runId);
  t("everyone gets the same daily", run2.seq === (await getRun(env, r.runId)).seq);
  env.DB.raw.exec("DELETE FROM fr_lr_question WHERE id LIKE 'M%' AND id > 'MXX0250'");
  const kept = await dailySeq(env, "2026-09-28");
  t("and a rebuilt pool does not change today's", JSON.stringify(kept) === run2.seq);
}

console.log("\n=== Which board a number is ===");
{
  const LAUNCH = Date.parse("2026-09-28T12:00:00Z");      // board 11, launch day
  const LATER = Date.parse("2026-10-02T09:00:00Z");       // board 15
  t("today's board, unasked, is today's number and day",
    JSON.stringify(boardFor(null, LATER)) === JSON.stringify({ no: 15, day: "2026-10-02", isToday: true }));
  t("a past board is its own day, not today's",
    JSON.stringify(boardFor(12, LATER)) === JSON.stringify({ no: 12, day: "2026-09-29", isToday: false }));
  t("the launch day's board is the first there is", boardFor(11, LATER) && boardFor(10, LATER) === null);
  t("tomorrow's is no board", boardFor(16, LATER) === null);
  t("and a number that is not a number is no board", boardFor("x", LATER) === null && boardFor(12.5, LATER) === null);

  const env = { DB: d1() };
  load(env, synthetic());
  const past = await startRun(env, { mode: "daily", no: 12, now: LATER });
  const pastRun = await getRun(env, past.runId);
  t("a past board is played as its own day's run", past.no === 12 && past.isToday === false && pastRun.play_date === "2026-09-29");
  t("dealt from that day's seed, the same run everybody got",
    pastRun.seq === JSON.stringify(await dailySeq(env, "2026-09-29")) && pastRun.seed === "daily:2026-09-29");
  t("a board from the future does not start", (await startRun(env, { mode: "daily", no: 16, now: LATER })).error === "no such board");
  t("nor one from before the launch", (await startRun(env, { mode: "daily", no: 10, now: LAUNCH })).error === "no such board");
  const fin = await finishRun(env, pastRun, LATER + RUN_MS + 1000);
  t("and its result names its board", fin.no === 12 && fin.day === "2026-09-29");
}

console.log("\n=== Practice and what has been seen ===");
{
  const env = { DB: d1() };
  load(env, synthetic());
  const T0 = Date.parse("2026-09-28T12:00:00Z");
  const daily = await dailySeq(env, "2026-09-28");
  const p = await startRun(env, { mode: "practice", userId: "u1", now: T0 });
  const run = await getRun(env, p.runId);
  const seq = JSON.parse(run.seq);
  t("practice never deals today's daily", !seq.some((id) => daily.includes(id)));
  t("a signed-in player's serve is recorded",
    !!env.DB.raw.prepare("SELECT 1 FROM fr_lr_seen WHERE user_id='u1' AND question_id=?").get(seq[0]));
  const p2 = await startRun(env, { mode: "practice", userId: "u1", now: T0 + 1000 });
  t("and the next practice avoids it", !JSON.parse((await getRun(env, p2.runId)).seq).includes(seq[0]));
  const guest = await startRun(env, { mode: "practice", recent: [seq[0], seq[1]], now: T0 });
  const gs = JSON.parse((await getRun(env, guest.runId)).seq);
  t("a guest's own list is honoured", !gs.includes(seq[0]) && !gs.includes(seq[1]));
  t("a list sent up is checked for shape", cleanRecent(["EXX0001", "'; DROP", 7, "EXX0001"]).join() === "EXX0001");
}

console.log("\n=== The routes ===");
{
  const env = { DB: d1() };
  load(env, synthetic());
  const post = (fn, body, header = true) => fn({
    env, request: new Request("https://x/api/lightning_fr", {
      method: "POST", body: JSON.stringify(body),
      headers: header ? { "X-XI-Games": "1", "Content-Type": "application/json" } : { "Content-Type": "application/json" },
    }),
  });
  t("a post without the family header is refused", (await post(startRoute, { mode: "daily" }, false)).status === 403);
  t("an unknown mode is refused", (await post(startRoute, { mode: "weekly" })).status === 400);
  const s = await post(startRoute, { mode: "daily" });
  const body = await s.json();
  t("a daily starts", s.status === 200 && body.runId && body.question);
  t("and the whole response carries no answer", !/"answer"/.test(JSON.stringify(body)));
  const a = await post(answerRoute, { runId: body.runId, idx: 1, pick: body.question.options[0] });
  t("an answer is marked", a.status === 200);
  const verdict = await a.json();
  t("and its verdict names the right one, and only that question's",
    typeof verdict.answer === "string" && body.question.options.includes(verdict.answer) &&
      !(verdict.next && "answer" in verdict.next));
  t("the store keeps nothing cached", s.headers.get("Cache-Control") === "no-store");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
