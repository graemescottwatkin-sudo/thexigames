/* tools/bank_cache_test.mjs — a bank is parsed once per Worker, and nothing changes it.
 *
 * functions/_lib/bank-cache.js keeps each game's parsed bank for five minutes
 * so a request stops paying for 7.75 MB of JSON it uses one board of (the Play
 * bot's 503s, 29 Sep 2026: Cloudflare's `exceededResources`). Two things must
 * hold and this proves both, through the REAL loaders and the REAL routes:
 *
 *   1. THE KEEPING. One read of the board table for many requests; a fresh
 *      read once the time is up; a separate bank for a separate database; and
 *      a bank that did NOT come from D1 (the sample, after a failed read) is
 *      never kept, so a passing error is not pinned for five minutes.
 *   2. NOTHING CHANGES A KEPT BANK. It is shared by every request the Worker
 *      serves, so a route that sorted it in place or deleted a field from a
 *      board would do it for every player after. Each game's hot routes are
 *      run against one kept bank, which must come back byte for byte as it
 *      went in -- and the routes must be SHOWN to have used it (one read, and
 *      the play routes answering), or an unchanged bank proves nothing.
 *
 * A stubbed database cannot prove a query (CLAUDE.md), and this does not try:
 * the SQL is unchanged, and what is under test is what happens around it.
 *
 *   node tools/bank_cache_test.mjs      (from the repo root)
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = (f) => import(pathToFileURL(path.join(ROOT, "functions", "_lib", f)).href);
const api = (f) => import(pathToFileURL(path.join(ROOT, "functions", "api", f)).href);
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const { BANK_TTL_MS } = await lib("bank-cache.js");
const sc = await lib("sc-board.js"), hl = await lib("hl-board.js"), bp = await lib("bp-board.js"), gd = await lib("gd-board.js");
const { SC_BOARDS } = await lib("sc-boards.js");
const { HL_SAMPLE_BOARDS, HL_SAMPLE_SCHEDULE } = await lib("hl-sample.js");
const { BP_SAMPLE_BOARDS, BP_SAMPLE_SCHEDULE } = await lib("bp-sample.js");
const { GD_SAMPLE_BOARDS, GD_SAMPLE_SCHEDULE } = await lib("gd-sample.js");
const { utcDay, dailyNumber, dailyDayKey } = await lib("daily.js");

/* THE TABLES, from each game's own sample, in the shape its loader reads. The
   schedules are put on TODAY (and the day before), as each sample bank does,
   so the daily routes find a board and hand out a token to play with. */
const today = utcDay(), yesterday = utcDay(Date.now() - 86400000);
const TABLES = {
  sc: { sc_board: SC_BOARDS.map((b) => ({ payload: JSON.stringify(b) })) },
  hl: {
    hl_board: HL_SAMPLE_BOARDS.map((b) => ({ payload: JSON.stringify(b) })),
    hl_schedule: Object.values(HL_SAMPLE_SCHEDULE).slice(0, 2).map((id, i) => ({ day: i ? yesterday : today, board_id: id })),
  },
  bp: {
    bp_board: BP_SAMPLE_BOARDS.map((b, i) => ({ id: b.id, ordinal: b.ordinal ?? i + 1, payload: JSON.stringify({ questions: b.questions }) })),
    bp_schedule: Object.entries(BP_SAMPLE_SCHEDULE).map(([off, id]) => ({ day: utcDay(Date.now() + Number(off) * 86400000), board_id: id })),
  },
  gd: {
    gd_board: GD_SAMPLE_BOARDS.map((b) => ({ id: b.id, set_id: b.set_id || null, kind: b.kind, title: b.title, rows: b.rows, cols: b.cols,
      payload: JSON.stringify({ entries: b.entries, crossings: b.crossings }) })),
    gd_schedule: Object.entries(GD_SAMPLE_SCHEDULE).map(([off, id]) => ({ day: dailyDayKey(dailyNumber() + Number(off)), board_id: id })),
  },
};
const BOARD_TABLE = { sc: "sc_board", hl: "hl_board", bp: "bp_board", gd: "gd_board" };
const LOAD = { sc: sc.loadBoards, hl: hl.loadBank, bp: bp.loadBank, gd: gd.loadBank };

/* A database that answers the bank tables and counts every read of them, and
   answers everything else -- the rounds, the plays -- with nothing, which is a
   round that was never recorded: the routes serve it anyway, as they must. */
function countingDB(tables, { broken = false } = {}) {
  const reads = {};
  const from = (sql) => (/\bFROM\s+(\w+)/i.exec(sql) || [])[1] || "";
  return {
    reads,
    prepare(sql) {
      const table = from(sql);
      const rows = () => {
        if (broken) throw new Error("D1 unavailable");
        reads[table] = (reads[table] || 0) + 1;
        return { results: tables[table] || [] };
      };
      return {
        all: async () => rows(),
        bind: () => ({
          all: async () => (tables[table] ? rows() : { results: [] }),
          first: async () => null,
          run: async () => ({ meta: { changes: 0 } }),
        }),
      };
    },
  };
}

console.log("Keeping");
for (const g of Object.keys(LOAD)) {
  const db = countingDB(TABLES[g]);
  const env = { DB: db };
  const [a, b] = await Promise.all([LOAD[g](env), LOAD[g](env)]);
  const c = await LOAD[g](env);
  t(`${g}: requests arriving together share one load, and later ones reuse it -- one read of ${BOARD_TABLE[g]}`,
    a.source === "d1" && a === b && b === c && db.reads[BOARD_TABLE[g]] === 1,
    `source ${a.source}, same bank ${a === b && b === c}, ${db.reads[BOARD_TABLE[g]]} read(s)`);

  const other = countingDB(TABLES[g]);
  const d = await LOAD[g]({ DB: other });
  t(`${g}: another database gets its own bank, not this one's`, d !== a && other.reads[BOARD_TABLE[g]] === 1,
    `${other.reads[BOARD_TABLE[g]]} read(s) of its own`);

  const real = Date.now;
  try {
    Date.now = () => real() + BANK_TTL_MS - 1000;
    const e = await LOAD[g](env);
    Date.now = () => real() + BANK_TTL_MS + 1000;
    const f = await LOAD[g](env);
    t(`${g}: kept until the time is up, and read afresh after it`, e === a && f !== a && db.reads[BOARD_TABLE[g]] === 2,
      `${db.reads[BOARD_TABLE[g]]} read(s)`);
  } finally { Date.now = real; }

  const broken = countingDB(TABLES[g], { broken: true });
  const benv = { DB: broken };
  const s1 = await LOAD[g](benv);
  broken.prepare = countingDB(TABLES[g]).prepare;
  const s2 = await LOAD[g](benv);
  t(`${g}: a failed read serves the sample and is not kept -- the next request reads D1 again`,
    s1.source !== "d1" && s1.boards.length > 0 && s2.source === "d1", `${s1.source}, then ${s2.source}`);
}
{
  const n = await sc.loadBoards({});
  t("no database at all: the sample, as before, and nothing to key a bank on", n.source === "module" && n.boards.length > 0, n.source);
}

/* ---- the routes, against one kept bank ------------------------------------ */
const CSRF = { "X-XI-Games": "1", "Content-Type": "application/json" };
async function hit(mod, method, url, body, env) {
  const m = await api(mod);
  const fn = m["onRequest" + method[0] + method.slice(1).toLowerCase()] || m.onRequest;
  const request = new Request("https://www.thexigames.com" + url,
    { method, headers: CSRF, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await fn({ request, env, params: {}, waitUntil() {}, next() {} });
  let json = null;
  try { json = await res.clone().json(); } catch (e) {}
  return { status: res.status, json };
}
const tokenIn = (o) => {
  if (!o || typeof o !== "object") return null;
  if (typeof o.token === "string") return o.token;
  for (const v of Object.values(o)) { const x = tokenIn(v); if (x) return x; }
  return null;
};

const ROUTES = {
  sc: async (env, said) => {
    for (const cy of ["", "?cy=1"]) {
      const d = await hit("scrambled/daily.js", "GET", "/api/scrambled/daily" + cy, undefined, env);
      said.push(`daily${cy} ${d.status}`);
      const token = d.json && d.json.token;
      if (!token) continue;
      const playId = "bank-test-" + (cy ? "c" : "a");
      said.push("round " + (await hit("scrambled/round.js", "POST", "/api/scrambled/round", { playId, token }, env)).status);
      for (const s of (d.json.slots || []).slice(0, 3)) {
        const r = await hit("scrambled/reveal.js", "POST", "/api/scrambled/reveal", { playId, token, kind: "name", slotId: s.id }, env);
        said.push("reveal " + r.status);
      }
      said.push("hint " + (await hit("scrambled/reveal.js", "POST", "/api/scrambled/reveal", { playId, token, kind: "hint" }, env)).status);
      said.push("guess " + (await hit("scrambled/guess.js", "POST", "/api/scrambled/guess", { playId, token, guess: "SMITH" }, env)).status);
      said.push("finish " + (await hit("scrambled/finish.js", "POST", "/api/scrambled/finish", { playId, token }, env)).status);
    }
    said.push("iconic " + (await hit("scrambled/iconic.js", "GET", "/api/scrambled/iconic", undefined, env)).status);
  },
  hl: async (env, said) => {
    const d = await hit("hilo/daily.js", "GET", "/api/hilo/daily", undefined, env);
    said.push("daily " + d.status);
    const token = tokenIn(d.json);
    const rows = d.json && d.json.board && Array.isArray(d.json.board.chain) ? d.json.board.chain.length - 1 : 11;
    for (let i = 1; token && i <= rows; i++) {
      said.push("call " + (await hit("hilo/call.js", "POST", "/api/hilo/call", { playId: "bank-test-h", token, index: i, call: i % 2 ? "higher" : "lower" }, env)).status);
    }
    said.push("finish " + (await hit("hilo/finish.js", "POST", "/api/hilo/finish", { playId: "bank-test-h" }, env)).status);
    const id = HL_SAMPLE_BOARDS[0].id;
    said.push("board " + (await hit("hilo/board.js", "GET", "/api/hilo/board?id=" + id, undefined, env)).status);
    said.push("archive " + (await hit("hilo/archive.js", "GET", "/api/hilo/archive", undefined, env)).status);
    said.push("catalog " + (await hit("hilo/catalog.js", "GET", "/api/hilo/catalog", undefined, env)).status);
  },
  bp: async (env, said) => {
    const d = await hit("ballpark/daily.js", "GET", "/api/ballpark/daily", undefined, env);
    said.push("daily " + d.status);
    const token = tokenIn(d.json);
    const n = d.json && d.json.board && Array.isArray(d.json.board.questions) ? d.json.board.questions.length : 3;
    for (let idx = 0; token && idx < n; idx++) {
      const playId = "bank-test-b";
      said.push("open " + (await hit("ballpark/open.js", "POST", "/api/ballpark/open", { playId, token, idx, touch: true }, env)).status);
      /* WITHOUT A PLAY ID, the fixture path: no round, so the window is dealt
         and the guess judged from the board's question -- the reading of the
         bank these two exist for, which the round's own refusals stop short of. */
      said.push("narrow " + (await hit("ballpark/narrow.js", "POST", "/api/ballpark/narrow", { token, idx }, env)).status);
      said.push("answer " + (await hit("ballpark/answer.js", "POST", "/api/ballpark/answer", { token, idx, guess: 50 }, env)).status);
    }
    said.push("archive " + (await hit("ballpark/archive.js", "GET", "/api/ballpark/archive", undefined, env)).status);
  },
  gd: async (env, said) => {
    const d = await hit("grid/daily.js", "GET", "/api/grid/daily", undefined, env);
    said.push("daily " + d.status);
    const token = tokenIn(d.json);
    /* A guess of the entry's own length, which is all the judge asks of it
       before marking -- read from the kept bank, which costs no read. */
    const board = token ? gd.boardById(await LOAD.gd(env), String(token).replace(/^gd:/, "")) : null;
    for (let n = 1; board && n <= 4; n++) {
      const e = gd.entryOf(board, n);
      if (!e) continue;
      said.push("guess " + (await hit("grid/guess.js", "POST", "/api/grid/guess", { playId: "bank-test-g", token, n, guess: "Q".repeat(e.len || e.answer.length) }, env)).status);
    }
    said.push("catalog " + (await hit("grid/catalog.js", "GET", "/api/grid/catalog", undefined, env)).status);
  },
};
/* THE PLAY ROUTE THAT MUST HAVE ANSWERED, per game: an unchanged bank after
   routes that all refused at the door would prove nothing about the routes. */
const PLAYED = { sc: /^reveal 200$/, hl: /^call 200$/, bp: /^answer 200$/, gd: /^guess 200$/ };

console.log("\nNothing changes a kept bank");
for (const g of Object.keys(ROUTES)) {
  const db = countingDB(TABLES[g]);
  const env = { DB: db };
  const bank = await LOAD[g](env);
  const before = JSON.stringify(bank);
  const said = [];
  let threw = null;
  try { await ROUTES[g](env, said); } catch (e) { threw = e; }
  t(`${g}: the routes ran`, !threw, threw ? String(threw && threw.stack || threw).split("\n").slice(0, 3).join(" | ") : said.length + " requests");
  t(`${g}: and played -- ${PLAYED[g]} answered at least once`, said.some((s) => PLAYED[g].test(s)), said.join(", "));
  t(`${g}: every one of them used the kept bank -- one read of ${BOARD_TABLE[g]} in all`,
    db.reads[BOARD_TABLE[g]] === 1 && (await LOAD[g](env)) === bank, `${db.reads[BOARD_TABLE[g]]} read(s)`);
  const after = JSON.stringify(bank);
  let at = 0;
  while (at < before.length && before[at] === after[at]) at++;
  t(`${g}: and the bank comes back byte for byte as it went in`, before === after && before.length > 1000,
    before === after ? `${before.length} bytes` : `differs at ${at}: ${before.slice(Math.max(0, at - 40), at + 40)} → ${after.slice(Math.max(0, at - 40), at + 40)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
