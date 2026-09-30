/* tools/quickfire_sets_test.mjs — one QuickFire engine, two games, and a sub
 * judged against the question it put on screen.
 *
 * RUNS THE REAL ROUTES against a real SQLite built from every migration, the
 * way lock_fixtures does -- so the SQL is the SQL that ships, table names
 * included. Two things are proved:
 *
 * 1. THE SETS DO NOT MEET (functions/_lib/qf-sets.js). QuickFire XI and
 *    QuickFire XI: Friends are seeded with the SAME question ids and different
 *    questions, the collision that is real in the two banks (EVT0002 is in
 *    both). Each route must serve, open, answer and finish in its own tables
 *    only, and a round opened on one game must not exist on the other.
 *
 * 2. A SUB IS ANSWERED AS THE QUESTION IT BROUGHT ON. Until 30 Sep 2026 the
 *    page put the bench question in the slot and /answer judged the pick
 *    against the question it replaced, so every pick after a sub was refused as
 *    "not one of the options". lock_fixtures gives all its questions the same
 *    four options, which is exactly why no suite could see it: here every
 *    question's options are its own.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const done = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };

let sqlite;
try { sqlite = await import("node:sqlite"); } catch (e) { sqlite = null; }
/* ABSENT IS NOT A PASS. */
if (!sqlite) { t("node:sqlite is available", false); done(); }

const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { today } = await imp("functions/_lib/qfdata.js");
const R = {};
for (const g of ["quickfire", "quickfire_fr"]) {
  R[g] = {};
  for (const name of ["daily", "play", "next", "sub", "answer", "finish"]) R[g][name] = await imp(`functions/api/${g}/${name}.js`);
}

/* ---- the database: every migration, as production has them ---------------- */
const db = new sqlite.DatabaseSync(":memory:");
const dir = path.join(ROOT, "data", "migrations");
for (const f of fs.readdirSync(dir).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort()) {
  try { db.exec(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { /* ALTERs the base already has */ }
}
const env = { DB: {
  prepare(sql) {
    const make = (args) => ({
      bind: (...a) => make(a),
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    });
    return make([]);
  },
} };

/* One reading of the day, handed to the seed and asked of the server's own
   today() -- the suite does not decide what day it is. */
const DAY = today();
/* The same ids in both games, different questions: each game's answer to Q n
   is "<game> answer n", and its four options are its own. */
const TAG = { quickfire: "Football", quickfire_fr: "Friends" };
for (const [g, pre] of [["quickfire", "qf_"], ["quickfire_fr", "fr_qf_"]]) {
  const ins = db.prepare(`INSERT INTO ${pre}question (id, answer, answer_norm, answer_type, clue, status,
    option_1, option_2, option_3, option_4) VALUES (?, ?, ?, 'person', ?, 'verified', ?, ?, ?, ?)`);
  const slot = db.prepare(`INSERT INTO ${pre}daily_slot (play_date, slot, question_id, role) VALUES (?, ?, ?, ?)`);
  for (let i = 1; i <= 14; i++) {
    const id = "EVT" + String(i).padStart(4, "0");
    const a = `${TAG[g]} answer ${i}`;
    ins.run(id, a, a.toLowerCase(), `${TAG[g]} clue ${i}`, a, `${TAG[g]} wrong ${i}a`, `${TAG[g]} wrong ${i}b`, `${TAG[g]} wrong ${i}c`);
    slot.run(DAY, i <= 11 ? i : i - 11, id, i <= 11 ? "xi" : "bench");
  }
  db.prepare(`INSERT INTO ${pre}daily (play_date, status) VALUES (?, 'published')`).run(DAY);
}

const post = async (g, name, body) => {
  const res = await R[g][name].onRequestPost({ request: new Request("http://x/api/" + g + "/" + name,
    { method: "POST", body: JSON.stringify(body) }), env });
  return { status: res.status, ...(await res.json()) };
};
const open = async (g) => (await post(g, "play", {})).playId;

/* ---- 1. the sets do not meet --------------------------------------------- */
console.log("Two games, one engine, their own tables");
for (const g of ["quickfire", "quickfire_fr"]) {
  const res = await R[g].daily.onRequestGet({ request: new Request("http://x/api/" + g + "/daily"), env });
  const j = await res.json();
  const clues = ((j.daily && j.daily.questions) || []).map((q) => q.clue);
  t(`${g}: /daily serves its own board -- eleven questions, every clue its own game's`,
    res.status === 200 && clues.length === 11 && clues.every((c) => c.startsWith(TAG[g] + " clue")), clues[0]);
  /* The answer is one of the four options by design, so its words are in the
     payload; what must never be is WHICH one -- an answer field on a question. */
  const qs = [...((j.daily && j.daily.questions) || []), ...((j.daily && j.daily.bench) || [])];
  t(`${g}: and no question carries its answer`,
    qs.length === 14 && qs.every((q) => !("answer" in q) && !("answer_norm" in q) && !("aliases" in q)),
    `${qs.length} questions; keys ${Object.keys(qs[0] || {}).join(",")}`);
  t(`${g}: and no weekly round where the game has none`, g === "quickfire" || j.week === null, String(j.week));
}
{
  const fid = await open("quickfire");
  const rid = await open("quickfire_fr");
  const cross1 = await post("quickfire_fr", "next", { playId: fid, idx: 1 });
  const cross2 = await post("quickfire", "next", { playId: rid, idx: 1 });
  t("a football round does not exist on the Friends routes, nor a Friends round on football's",
    cross1.status === 400 && cross1.error === "no round" && cross2.status === 400 && cross2.error === "no round",
    `${cross1.error} / ${cross2.error}`);
  await post("quickfire_fr", "next", { playId: rid, idx: 1 });
  const right = await post("quickfire_fr", "answer", { playId: rid, idx: 1, pick: "Friends answer 1" });
  const theirs = await post("quickfire_fr", "answer", { playId: rid, idx: 1, pick: "Football answer 1" });
  t("a Friends pick is marked against the Friends question with the colliding id",
    right.status === 200 && right.correct === true && theirs.replayed === true, JSON.stringify(right).slice(0, 80));
  const rows = (pre) => db.prepare(`SELECT count(*) n FROM ${pre}answer`).get().n;
  t("and its answer is written to fr_qf_answer, not football's qf_answer", rows("fr_qf_") === 1 && rows("qf_") === 0,
    `fr_qf_ ${rows("fr_qf_")}, qf_ ${rows("qf_")}`);
}

/* ---- 2. a sub is answered as the question it brought on ------------------- */
for (const g of ["quickfire", "quickfire_fr"]) {
  console.log(`\n${g}: a substitution`);
  const n = TAG[g];
  {
    const id = await open(g);
    await post(g, "next", { playId: id, idx: 1 });
    const sub = await post(g, "sub", { playId: id });
    t("a sub on question 1 is taken", sub.status === 200 && sub.subsLeft === 2, JSON.stringify(sub));
    const a = await post(g, "answer", { playId: id, idx: 1, pick: `${n} answer 12` });
    t("and the right answer to the question it brought on (the first bench question) is marked right",
      a.status === 200 && a.correct === true, JSON.stringify(a).slice(0, 100));
  }
  {
    const id = await open(g);
    await post(g, "next", { playId: id, idx: 1 });
    await post(g, "sub", { playId: id });
    const a = await post(g, "answer", { playId: id, idx: 1, pick: `${n} answer 1` });
    t("the question it replaced is gone: its answer is not one of the options now",
      a.status === 400 && a.error === "that was not one of the options", JSON.stringify(a));
  }
  {
    const id = await open(g);
    await post(g, "next", { playId: id, idx: 1 });
    const a = await post(g, "answer", { playId: id, idx: 1, pick: `${n} answer 12` });
    t("and with no sub, a bench question's answer is not an option: the slot is the board's own",
      a.status === 400 && a.error === "that was not one of the options", JSON.stringify(a));
  }
  {
    /* TWO SUBS ON ONE QUESTION: the slot holds the question the LAST one
       brought on, the second bench question. */
    const id = await open(g);
    await post(g, "next", { playId: id, idx: 1 });
    await post(g, "sub", { playId: id });
    await post(g, "sub", { playId: id });
    const a = await post(g, "answer", { playId: id, idx: 1, pick: `${n} answer 13` });
    t("two subs on one question: the second bench question is the one answered", a.status === 200 && a.correct === true, JSON.stringify(a).slice(0, 100));
  }
  {
    /* A SUB LATER IN THE ROUND: slot 1 keeps its own question, slot 2 takes the
       first bench question. */
    const id = await open(g);
    await post(g, "next", { playId: id, idx: 1 });
    const a1 = await post(g, "answer", { playId: id, idx: 1, pick: `${n} answer 1` });
    const late = await post(g, "sub", { playId: id });
    await post(g, "next", { playId: id, idx: 2 });
    await post(g, "sub", { playId: id });
    const a2 = await post(g, "answer", { playId: id, idx: 2, pick: `${n} answer 12` });
    t("a question already answered cannot be subbed", late.status === 400 && late.error === "that question has already been answered", JSON.stringify(late));
    t("and a sub on question 2 leaves question 1 as it was and brings the bench question on at 2",
      a1.correct === true && a2.status === 200 && a2.correct === true, `${a1.correct} / ${JSON.stringify(a2).slice(0, 80)}`);
  }
  {
    const id = await open(g);
    const early = await post(g, "sub", { playId: id });
    t("and no sub is spent before a question is in play", early.status === 400 && early.error === "there is no question in play", JSON.stringify(early));
  }
}

done();
