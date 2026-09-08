/* api_test.mjs — Ballpark XI's four endpoints, EXECUTED.
 *
 * The one thing this file exists to prove: NO ANSWER REACHES A BROWSER BEFORE
 * THE QUESTION IS LOCKED. Every question in this game is a number and the
 * number is the answer, so a question sent whole is a question already
 * answered. The word search shipped its boards whole and had two live leaks to
 * close before its score could mean anything; this game is built the other way
 * round and this is where that is held.
 *
 * The rest is the other half of the same claim: the SCORE is the server's. The
 * clock is measured here, the ladder is applied here, and which question is in
 * play is read back out of the round's own rows — so a page cannot time itself,
 * cannot refresh its way to more seconds, cannot answer out of order, and
 * cannot buy a second narrowed range for the price of one.
 *
 * Run against the real handlers with a D1 stand-in that stores rows in memory —
 * not a parse, not a regex. A regex cannot count a clock and cannot catch a
 * rule bug, and both of those are what this file is about.
 *
 *   node football/ballpark/api_test.mjs        (from the repo root)
 */
import { onRequestGet as daily } from "../../functions/api/ballpark/daily.js";
import { onRequestPost as open } from "../../functions/api/ballpark/open.js";
import { onRequestPost as answer } from "../../functions/api/ballpark/answer.js";
import { onRequestPost as narrow } from "../../functions/api/ballpark/narrow.js";
import {
  loadBank, boardForDay, todayKey, boardToken, publicBoard, narrowWindow, RULES,
} from "../../functions/_lib/bp-board.js";
import { BP_SAMPLE_BOARDS } from "../../functions/_lib/bp-sample.js";
import { dailyNumber } from "../../functions/_lib/daily.js";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* ---- a D1 stand-in that actually stores things --------------------------
 * Enough SQL to be honest about THIS code: the statements bp-round.js issues,
 * and nothing else. A stub that returned canned answers would prove the
 * endpoints call it, which is not the claim — the claim is that the clock, the
 * substitutions and the score come out right after a sequence of moves, and
 * only real storage can show that.
 *
 * IT ENFORCES THE THINGS THE REAL TABLES ENFORCE: INSERT OR IGNORE on a primary
 * key really ignores, and the clock's `WHERE clock_idx < ?` really refuses. A
 * stub that rubber-stamped those would leave the two guards this game leans on
 * proved by nothing. (What it still cannot prove is the SQL itself — see
 * CLAUDE.md: a stubbed database cannot prove a query. That belongs to a
 * live_check.)
 */
function makeDb(bank) {
  const rounds = [], answers = [], narrows = [];
  return {
    _rounds: rounds, _answers: answers, _narrows: narrows, _bank: bank || null,
    /* A STATEMENT WORKS BOUND OR UNBOUND, because the real code uses both:
       loadBank() calls .prepare(sql).all() with no binds at all, while every
       write goes through .bind(). A stub that only answered bound statements
       made loadBank throw, fall back to the sample, and quietly turn the D1
       path into a second run of the fixture path — green, and proving nothing
       about D1. */
    prepare(sql) {
      const stmt = (a) => {
          return {
            async run() {
              if (/INSERT OR IGNORE INTO bp_round/.test(sql)) {
                if (!rounds.some((r) => r.play_id === a[0])) {
                  rounds.push({ play_id: a[0], board_id: a[1], day: a[2],
                                started_ms: a[3], clock_idx: 0, clock_ms: a[4] });
                }
              } else if (/UPDATE bp_round SET clock_idx/.test(sql)) {
                /* WHERE play_id = ? AND clock_idx < ? — the guard that stops a
                   refresh buying seconds. Enforced here, or it is proved by
                   nothing. */
                const r = rounds.find((x) => x.play_id === a[2] && x.clock_idx < a[3]);
                if (r) { r.clock_idx = a[0]; r.clock_ms = a[1]; }
              } else if (/INSERT OR IGNORE INTO bp_answer/.test(sql)) {
                if (!answers.some((x) => x.play_id === a[0] && x.idx === a[1])) {
                  answers.push({ play_id: a[0], idx: a[1], question_id: a[2],
                    guess: a[3], ballparks: a[4], grade: a[5], points: a[6],
                    spent_sub: a[7], elapsed_ms: a[8], at_ms: a[9] });
                }
              } else if (/INSERT OR IGNORE INTO bp_narrow/.test(sql)) {
                if (!narrows.some((x) => x.play_id === a[0] && x.idx === a[1])) {
                  narrows.push({ play_id: a[0], idx: a[1], spent_sub: a[2],
                                 lo: a[3], hi: a[4], at_ms: a[5] });
                }
              }
              return { success: true };
            },
            async first() {
              if (/FROM bp_round WHERE play_id/.test(sql)) {
                return rounds.find((r) => r.play_id === a[0]) || null;
              }
              if (/FROM bp_narrow WHERE play_id = \? AND idx = \?/.test(sql)) {
                return narrows.find((n) => n.play_id === a[0] && n.idx === a[1]) || null;
              }
              return null;
            },
            async all() {
              if (/FROM bp_answer WHERE play_id/.test(sql)) {
                return { results: answers.filter((x) => x.play_id === a[0])
                  .sort((x, y) => x.idx - y.idx) };
              }
              if (/FROM bp_narrow WHERE play_id/.test(sql)) {
                return { results: narrows.filter((x) => x.play_id === a[0]) };
              }
              /* WITH A BANK, the real D1 path: rows in, rowToBoard() and the
                 schedule out. Without one, no rows — and bp-board.js falls back
                 to the sample and SAYS so, which is the path most of this suite
                 runs on. Both are worth exercising; the fallback is what every
                 offline run and `wrangler pages dev` with no D1 uses. */
              if (/FROM bp_board/.test(sql)) {
                return { results: (bank ? bank.boards : []).map((b) => ({
                  id: b.id, ordinal: b.ordinal || 1,
                  payload: JSON.stringify({ questions: b.questions }) })) };
              }
              if (/FROM bp_schedule/.test(sql)) {
                return { results: Object.keys((bank && bank.schedule) || {})
                  .map((day) => ({ day, board_id: bank.schedule[day] })) };
              }
              return { results: [] };
            },
          };
      };
      const bare = stmt([]);
      return { bind: (...a) => stmt(a), all: bare.all, first: bare.first, run: bare.run };
    },
  };
}

const req = (url, body) => new Request(url, body === undefined ? {} : {
  method: "POST",
  headers: { "X-XI-Games": "1", "content-type": "application/json" },
  body: JSON.stringify(body),
});
const bodyOf = async (r) => { try { return await r.json(); } catch (e) { return null; } };

const today = dailyNumber(Date.now());
const dayAt = (off) => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);

/* A BANK WITH A TOMORROW IN IT. The sample holds two boards, yesterday's and
   today's, so a token naming anything else 404s for being UNKNOWN — which is
   the same 404 a future board gets, and a test that cannot tell the two apart
   proves nothing about the future being shut. This bank has a board dated
   tomorrow, so the refusal under test is the one being claimed. */
function futureBank() {
  const [b1, b2] = BP_SAMPLE_BOARDS;
  const b3 = { ...b2, id: "bp-0003", ordinal: 3 };
  return {
    boards: [b1, b2, b3],
    schedule: { [dayAt(-1)]: b1.id, [dayAt(0)]: b2.id, [dayAt(1)]: b3.id },
  };
}

async function run() {
  const env = { DB: makeDb() };
  const bank = await loadBank(env);
  const board = boardForDay(bank, todayKey());
  const token = boardToken(board.id);

  /* ---- 1. the answers do not travel ------------------------------------ */
  {
    const res = await daily({ request: req("https://x/api/ballpark/daily"), env });
    const b = await bodyOf(res);
    const text = JSON.stringify(b);
    t("daily serves today's board", res.status === 200 && b.board && b.board.questions.length === RULES.QUESTIONS,
      `status ${res.status}`);
    /* THE CLAIM, and it is structural rather than a value grep: numbers
       coincide — 92 is an answer on one board and a slider end on another — so
       a grep for the values would fire on coincidences while catching nothing.
       What must be true is that no field called `answer` survives the
       projection, at any depth. */
    t("no field named answer reaches the browser", !/"answer"/.test(text),
      /"answer"/.test(text) ? "the daily response carries an answer field" : "");
    /* THERE IS DELIBERATELY NO SECOND CHECK OVER THE VALUES, and this is the
       evidence for that rather than an omission. A grep for the answers was
       written here first and it failed immediately on today's sample board:
       "How many League Cups did Pep Guardiola win as a manager?" answers 5, and
       question eleven on the same board carries a tolerance of 5. Nothing
       leaked; two small integers collided, as small integers do.
       That is the whole difference from Grid XI, whose daily route ends with
       exactly this grep and is right to: its answers are WORDS, and a grid
       containing PIRLO contains it on purpose or by a leak. A value check here
       would fire on coincidences while catching nothing — a check whose name is
       broader than its behaviour, which CLAUDE.md names as its own fault. The
       claim above, that no field called `answer` survives the projection, is
       the one that can be made honestly, and publicQuestion()'s allowlist is
       what makes it hold for fields nobody has invented yet. */
    t("the shape the page needs did travel",
      b.board.questions.every((q) => q.question && q.lo !== undefined &&
        q.hi !== undefined && q.tolerance !== undefined && q.step !== undefined),
      "");
    t("it says which bank it came from", b.source === "sample", String(b.source));
  }

  /* ---- 2. the future is shut, at every door ---------------------------- */
  {
    const res = await daily({ request: req(`https://x/api/ballpark/daily?no=${today + 1}`), env });
    t("tomorrow's board is refused by daily", res.status === 403, `status ${res.status}`);

    /* A token is "bp:" + an id and the ids run bp-0001 upward, so a board eight
       months out can be asked for BY NAME. Grid XI shipped with exactly this
       door open beside a daily route that was shut, and it was found hours
       after that game launched. */
    const envF = { DB: makeDb(futureBank()) };
    const bankF = await loadBank(envF);
    t("the D1 path really loaded a bank", bankF.source === "d1" && bankF.boards.length === 3,
      `${bankF.source}, ${bankF.boards.length} boards`);
    const tomorrow = boardToken("bp-0003");
    /* PROVED TO BE ABOUT THE DAY, not about the id: the same board answered
       through today's token is allowed, so the only difference between the two
       calls is which day the board sits on. */
    const okToday = await open({ request: req("https://x/api/ballpark/open",
      { token: boardToken("bp-0002"), playId: "p-ok", idx: 1 }), env: envF });
    t("today's board opens", okToday.status === 200, `status ${okToday.status}`);
    for (const [name, fn] of [["open", open], ["answer", answer], ["narrow", narrow]]) {
      const r = await fn({ request: req("https://x/api/ballpark/" + name,
        { token: tomorrow, playId: "p-future", idx: 1, guess: 1 }), env: envF });
      t(`${name} refuses a board whose day has not come`, r.status === 404, `status ${r.status}`);
    }
  }

  /* ---- 3. the clock is the server's ------------------------------------ */
  {
    const env2 = { DB: makeDb() };
    const play = "p-clock";
    await open({ request: req("https://x/api/ballpark/open", { token, playId: play, idx: 1 }), env: env2 });
    const first = env2.DB._rounds[0].clock_ms;

    /* A REFRESH MUST NOT BUY SECONDS. Re-opening the question already in play
       is a no-op: the UPDATE carries `WHERE clock_idx < ?`. */
    await new Promise((r) => setTimeout(r, 5));
    await open({ request: req("https://x/api/ballpark/open", { token, playId: play, idx: 1 }), env: env2 });
    t("re-opening the current question does not restart its clock",
      env2.DB._rounds[0].clock_ms === first, `${first} -> ${env2.DB._rounds[0].clock_ms}`);

    /* Nor may the page skip ahead: question four cannot be opened while one is
       unanswered, or its clock would run while the earlier ones waited. */
    const skip = await open({ request: req("https://x/api/ballpark/open", { token, playId: play, idx: 4 }), env: env2 });
    t("a question out of turn cannot be opened", skip.status === 400, `status ${skip.status}`);
  }

  /* ---- 4. what the clock is worth -------------------------------------- */
  {
    const q1 = board.questions[0];
    const mk = async (backdateMs) => {
      const e = { DB: makeDb() };
      const play = "p-" + backdateMs;
      await open({ request: req("https://x/api/ballpark/open", { token, playId: play, idx: 1 }), env: e });
      e.DB._rounds[0].clock_ms -= backdateMs;      /* wind this question's clock on */
      const r = await answer({ request: req("https://x/api/ballpark/answer",
        { token, playId: play, idx: 1, guess: q1.answer }), env: e });
      return { e, b: await bodyOf(r) };
    };
    const quick = await mk(0);
    const slow = await mk(15000);
    t("a bang-on inside the grace is worth ten", quick.b.points === RULES.PTS &&
      quick.b.grade === "Bang on", `${quick.b.points} ${quick.b.grade}`);
    t("the same answer fifteen seconds later is worth less",
      slow.b.points < quick.b.points && slow.b.points > 0,
      `${quick.b.points} -> ${slow.b.points}`);
    t("the answer comes back once the question is locked",
      quick.b.answer === Number(q1.answer), String(quick.b.answer));

    /* OUT OF TIME: nought and a substitution, which is what running the clock
       down costs in the demo. It must not be cheaper than a wild guess. */
    const late = await mk(RULES.CLOCK * 1000 + 4000);
    t("past the clock is a timeout, not a slow answer",
      late.b.timedOut === true && late.b.points === 0 &&
      late.b.grade === "Out of time" && late.b.spentSub === true,
      `${late.b.grade} ${late.b.points} sub=${late.b.spentSub}`);
    t("a timeout stores no guess", late.e.DB._answers[0].guess === null,
      String(late.e.DB._answers[0].guess));
  }

  /* ---- 5. one question at a time, once each ---------------------------- */
  {
    const e = { DB: makeDb() };
    const play = "p-order";
    const noOpen = await answer({ request: req("https://x/api/ballpark/answer",
      { token, playId: play, idx: 1, guess: 1 }), env: e });
    t("a question that was never opened cannot be answered", noOpen.status === 400,
      `status ${noOpen.status}`);

    await open({ request: req("https://x/api/ballpark/open", { token, playId: play, idx: 1 }), env: e });
    const jump = await answer({ request: req("https://x/api/ballpark/answer",
      { token, playId: play, idx: 2, guess: 1 }), env: e });
    /* THIS ONE IS HONEST ABOUT WHAT IT PROVES. answer.js carries an order check
       AND a "that question is not open" check, and no request can fail the
       first while passing the second: /open enforces the same order, so a
       question that is open is always the one in play. Deleting the order check
       from answer.js leaves this suite green, which was checked by doing it.
       The order rule is proved at the door that can actually be pushed — the
       /open route, above — and the check in answer.js stays as the second lock
       on the same door, which is the arrangement Grid XI arrived at after
       shipping with one of two doors open. */
    t("answering a question that is not in play is refused", jump.status === 400,
      `status ${jump.status}`);

    await answer({ request: req("https://x/api/ballpark/answer",
      { token, playId: play, idx: 1, guess: board.questions[0].answer }), env: e });
    const before = e.DB._answers.length;
    /* A RETRY IS ONE ROW. The same submission arriving twice — a dropped
       connection, a double tap — must not be graded a second time against a
       later clock, which would quietly cost the player points. */
    await answer({ request: req("https://x/api/ballpark/answer",
      { token, playId: play, idx: 1, guess: board.questions[0].answer }), env: e });
    /* WHAT THIS PROVES AND WHAT IT DOES NOT. It proves the route sends the same
       (play_id, idx) again rather than allocating a new row — which is the part
       that is this code's to get right. It does NOT prove the row is rejected:
       that is the primary key in migration 034, and per CLAUDE.md a stubbed
       database cannot prove a query. Rewriting the statement to a plain INSERT
       turns this suite red, but by breaking the stub rather than by breaking
       the rule, so it is not evidence either. The live_check is where the key
       is proved. */
    t("a replayed submission does not become a second row",
      e.DB._answers.length === before, `${before} -> ${e.DB._answers.length}`);
  }

  /* ---- 6. narrowing --------------------------------------------------- */
  {
    const e = { DB: makeDb() };
    const play = "p-narrow";
    await open({ request: req("https://x/api/ballpark/open", { token, playId: play, idx: 1 }), env: e });
    const r1 = await bodyOf(await narrow({ request: req("https://x/api/ballpark/narrow",
      { token, playId: play, idx: 1 }), env: e }));
    const q1 = board.questions[0];

    t("narrowing halves the slider", (r1.hi - r1.lo) < (q1.hi - q1.lo),
      `${q1.lo}..${q1.hi} -> ${r1.lo}..${r1.hi}`);
    t("the answer stays inside the new range", r1.lo <= q1.answer && q1.answer <= r1.hi,
      `answer ${q1.answer} in ${r1.lo}..${r1.hi}`);
    /* THESE TWO ARE ASKED OF EVERY QUESTION IN THE FIXTURE, AND OF SEVERAL
       ROUNDS, because one question proves neither. Written first against q1
       alone, both passed with the rule deleted from the source: q1's window is
       clamped to the slider's bottom end, and the clamp happened to push the
       answer off the midpoint and happened to keep the band on the track. A
       check that passes when the thing it guards is gone is worse than no
       check, and this project has found six of them. */
    const everyQ = BP_SAMPLE_BOARDS.flatMap((bd) => bd.questions);
    const seeds = ["p-a", "p-b", "p-c", "p-d"];
    let clipped = 0, centred = 0, offsets = new Set();
    for (const q of everyQ) {
      for (const seed of seeds) {
        const w = narrowWindow(q, seed + ":" + q.id);
        if (w.lo > Number(q.answer) - Number(q.tolerance) ||
            w.hi < Number(q.answer) + Number(q.tolerance)) clipped++;
        const m = (w.lo + w.hi) / 2;
        if (m === Number(q.answer)) centred++;
        offsets.add(Math.round((m - Number(q.answer)) * 1000) / 1000);
      }
    }
    /* THE WHOLE BALLPARK MUST STAY REACHABLE, or the question cannot be
       answered well however much the player knows. */
    t("the whole ballpark stays on the slider, for every question",
      clipped === 0, `${clipped} of ${everyQ.length * seeds.length} windows clip the band`);
    /* AND THE ANSWER MUST NOT SIT AT THE MIDDLE, because a window centred on the
       answer would BE the answer — read off in one glance, for the price of a
       substitution that was meant to buy a narrower guess and not a free one. */
    t("no window is centred on its answer", centred === 0,
      `${centred} of ${everyQ.length * seeds.length} windows hand over the answer`);
    /* And the offset genuinely varies, so it cannot be learned and subtracted:
       a constant offset is a centred window with an extra step. */
    t("the offset varies between questions and rounds", offsets.size > everyQ.length,
      `${offsets.size} distinct offsets`);
    /* BOTH ENDS ON THE STEP GRID. A window whose top end is half a step off is
       a top end the control cannot reach: 374..879 stepping by 1 was narrowing
       to 383..635.5, and 635.5 is not a value a slider can stop on. */
    let offGrid = 0;
    for (const q of everyQ) {
      for (const seed of seeds) {
        const w = narrowWindow(q, seed + ":" + q.id);
        const st = Number(q.step) || 1;
        const on = (v) => Math.abs(v / st - Math.round(v / st)) < 1e-9;
        if (!on(w.lo) || !on(w.hi)) offGrid++;
      }
    }
    t("both ends of the window sit on the step grid", offGrid === 0,
      `${offGrid} of ${everyQ.length * seeds.length} windows have an end the slider cannot reach`);
    t("it cost a substitution", r1.cost.sub === 1 && r1.subsUsed === 1,
      JSON.stringify(r1.cost));

    /* ASKING TWICE IS WORTH NOTHING. Two windows placed around one answer
       intersect on a range far smaller than either, so a second window would be
       a second, sharper hint bought with a dropped connection. */
    const r2 = await bodyOf(await narrow({ request: req("https://x/api/ballpark/narrow",
      { token, playId: play, idx: 1 }), env: e }));
    t("asking to narrow again returns the SAME window",
      r2.lo === r1.lo && r2.hi === r1.hi, `${r1.lo}..${r1.hi} vs ${r2.lo}..${r2.hi}`);
    const st2 = await bodyOf(await open({ request: req("https://x/api/ballpark/open",
      { token, playId: play, idx: 1 }), env: e }));
    t("and is not charged twice", e.DB._narrows.length === 1 &&
      r2.cost.sub === 0 && st2.subsUsed === 1,
      `${e.DB._narrows.length} rows, subsUsed ${st2.subsUsed}, cost ${JSON.stringify(r2.cost)}`);
  }

  /* ---- 7. narrowing once the substitutions are gone --------------------- */
  {
    const e = { DB: makeDb() };
    const play = "p-subs";
    /* Spend the three lives on wide misses, then narrow. */
    for (let i = 1; i <= RULES.SUBS; i++) {
      const q = board.questions[i - 1];
      await open({ request: req("https://x/api/ballpark/open", { token, playId: play, idx: i }), env: e });
      await answer({ request: req("https://x/api/ballpark/answer",
        { token, playId: play, idx: i, guess: Number(q.answer) + Number(q.tolerance) * 50 }), env: e });
    }
    const st = await bodyOf(await open({ request: req("https://x/api/ballpark/open",
      { token, playId: play, idx: RULES.SUBS + 1 }), env: e }));
    t("three wide misses spend the three substitutions", st.subsUsed === RULES.SUBS,
      String(st.subsUsed));

    const n = await bodyOf(await narrow({ request: req("https://x/api/ballpark/narrow",
      { token, playId: play, idx: RULES.SUBS + 1 }), env: e }));
    t("with none left, narrowing costs seconds instead of a substitution",
      n.cost.sub === 0 && n.cost.seconds === RULES.NARROW_SECS, JSON.stringify(n.cost));

    /* AND THE SECONDS ARE REALLY CHARGED. Four seconds added to elapsed — not
       taken off the clock's length, which is different arithmetic and would
       charge for them twice. */
    const idx = RULES.SUBS + 1, q = board.questions[idx - 1];
    const withPenalty = await bodyOf(await answer({ request: req("https://x/api/ballpark/answer",
      { token, playId: play, idx, guess: q.answer }), env: e }));
    const e2 = { DB: makeDb() };
    await open({ request: req("https://x/api/ballpark/open", { token, playId: "p-clean", idx: 1 }), env: e2 });
    const clean = await bodyOf(await answer({ request: req("https://x/api/ballpark/answer",
      { token, playId: "p-clean", idx: 1, guess: board.questions[0].answer }), env: e2 }));
    t("the four seconds land on the elapsed clock",
      withPenalty.elapsedMs >= RULES.NARROW_SECS * 1000 && clean.elapsedMs < 1000,
      `${withPenalty.elapsedMs}ms vs ${clean.elapsedMs}ms`);
  }

  /* ---- 8. full time ---------------------------------------------------- */
  {
    const e = { DB: makeDb() };
    const play = "p-ft";
    for (let i = 1; i <= RULES.QUESTIONS; i++) {
      const q = board.questions[i - 1];
      await open({ request: req("https://x/api/ballpark/open", { token, playId: play, idx: i }), env: e });
      var last = await bodyOf(await answer({ request: req("https://x/api/ballpark/answer",
        { token, playId: play, idx: i, guess: q.answer }), env: e }));
    }
    t("eleven locked is full time", last.over === true, String(last.over));
    t("a clean sheet is a win", last.result === "W", String(last.result));
    /* Eleven bang-ons is 110 and four bonus points, capped — which is what
       makes 114 reachable without making it ordinary. */
    t("eleven bang-ons score the maximum", last.score === RULES.MAX_SCORE,
      `${last.score} of ${RULES.MAX_SCORE}`);
    t("the bonus is capped at four", last.bangOns === RULES.QUESTIONS &&
      last.score === RULES.QUESTIONS * RULES.PTS + RULES.BONUS_CAP, String(last.score));
    t("the answers arrive only at full time", Array.isArray(last.answers) &&
      last.answers.length === RULES.QUESTIONS, "");

    /* AND THE BOARD IS SHUT. A twelfth submission is served as a verdict, not
       as an error, and changes nothing. */
    /* A question that EXISTS — idx 12 is not one, and would be refused for
       being out of range before full time was ever consulted, which would have
       proved nothing about full time. */
    const after = await bodyOf(await answer({ request: req("https://x/api/ballpark/answer",
      { token, playId: play, idx: 3, guess: 1 }), env: e }));
    t("nothing can be played after full time",
      after.over === true && e.DB._answers.length === RULES.QUESTIONS,
      `${e.DB._answers.length} rows`);
  }

  /* ---- 9. overspending the substitutions is a draw ---------------------- */
  {
    const e = { DB: makeDb() };
    const play = "p-draw";
    for (let i = 1; i <= RULES.QUESTIONS; i++) {
      const q = board.questions[i - 1];
      await open({ request: req("https://x/api/ballpark/open", { token, playId: play, idx: i }), env: e });
      var last2 = await bodyOf(await answer({ request: req("https://x/api/ballpark/answer",
        { token, playId: play, idx: i, guess: Number(q.answer) + Number(q.tolerance) * 50 }), env: e }));
    }
    t("eleven wild guesses overspend the substitutions", last2.subsUsed > RULES.SUBS,
      `${last2.subsUsed} of ${RULES.SUBS}`);
    t("finishing overspent is a draw, not a win", last2.result === "D", String(last2.result));
    t("and it scores nothing", last2.score === 0, String(last2.score));
  }

  /* ---- 10. the doors are shut to a request without the header ----------- */
  {
    for (const [name, fn] of [["open", open], ["answer", answer], ["narrow", narrow]]) {
      const r = await fn({ request: new Request("https://x/api/ballpark/" + name, {
        method: "POST", body: JSON.stringify({ token, playId: "p", idx: 1, guess: 1 }) }), env });
      t(`${name} refuses a request with no CSRF header`, r.status === 403, `status ${r.status}`);
    }
  }

  /* ---- 11. the game still plays with no database ------------------------ */
  {
    const bare = {};
    const r = await answer({ request: req("https://x/api/ballpark/answer",
      { token, playId: "p", idx: 1, guess: board.questions[0].answer }), env: bare });
    const b = await bodyOf(r);
    t("with no database the verdict is served and says it is unscored",
      r.status === 200 && b.scored === false && b.grade === "Bang on",
      `${b.grade} scored=${b.scored}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
