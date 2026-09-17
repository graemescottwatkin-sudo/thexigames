/* tools/import_codeword_test.mjs — the Codeword importer's gate.
 *
 * NOT ONE DATE LITERAL IN THIS FILE, and that is the point rather than a style
 * choice. Codeword's own loader test held dates as literals — "Tue, 15 Sep
 * 2026" — so when its epoch moved one day on 14 September 2026, seven checks
 * went red for a calendar change the loader handled perfectly. A test that must
 * be edited every time the epoch moves is a test that will eventually be edited
 * into agreeing with a broken importer. Every date below is computed as
 * epoch + N days from an epoch the fixture declares, so a reset of the whole
 * family moves nothing here.
 *
 * The rules are imported rather than the script spawned: unlike QuickFire's,
 * this importer runs main() only when it IS main, so its gate can be called
 * directly. What is proved here is the gate; the CLI is one call around it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  epochOf, dayForNo, ordinalToday, readsOff, gateBoard, gatePackage,
  readPackage, digestFor, payloadOf, payloadDigest, stableJson, sqlFor,
  liveFromSql, calendarClashes,
} from "./import_codeword.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* The fixture's epoch. Any day would do; it is declared once and everything
   else is derived from it, which is the property under test. */
const EPOCH_ISO = "2026-09-13";
const EPOCH = Date.UTC(2026, 8, 13);
const DAY = 86400000;
const dayOf = (no) => new Date(EPOCH + no * DAY).toISOString().slice(0, 10);

/* A board that passes every rule, so each fixture below breaks exactly one.
   The grid is small and real: CAT reads across the top and down the left. */
function goodBoard(no) {
  const code = {};
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((L, i) => { code[L] = i + 1; });
  return {
    no,
    date: dayOf(no),
    size: 3,
    rows: ["CAT", "ARE", "TEN"],
    words: [["CAT", 0, 0, "a"], ["ARE", 1, 0, "a"], ["TEN", 2, 0, "a"], ["CAT", 0, 0, "d"]],
    code,
    given: ["C", "A", "T"],
    hints: [1, 2, 3, 4].map((i) => ({ sense: "s" + i, cat: "c" + i, enum: "3", text: "s" + i + " c" + i })),
    breaks: [[], [], [], []],
    meta: { seed: Math.random(), attempt: 1 },
  };
}

/* A package in the shape readPackage expects, with digests computed the way the
   producing side computes them. */
function makePackage(boards, { epoch = EPOCH_ISO, manifestEpoch = undefined, claim = null } = {}) {
  const wrapped = boards.map((board) => {
    const name = String(board.no).padStart(4, "0") + ".json";
    const raw = Buffer.from(JSON.stringify(board));
    return { name, digest: crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16), board };
  });
  const sha = {};
  for (const w of wrapped) sha["daily/" + w.name] = w.digest;
  const index = {
    counts: { boards: claim === null ? wrapped.length : claim },
    dates: { epoch, first: dayOf(1), last: dayOf(wrapped.length) },
    sha256_16: sha,
    staged: "fixture",
  };
  const manifest = { epoch: manifestEpoch === undefined ? epoch : manifestEpoch, count: wrapped.length };
  return { index, manifest, boards: wrapped };
}
const faultsFor = (boards, opts, gateOpts) => gatePackage(makePackage(boards, opts), gateOpts || {});
const has = (list, needle) => list.some((m) => m.includes(needle));

console.log("=== The calendar is read from the package, never held here ===");
{
  t("the epoch comes out of INDEX.json",
    epochOf({ dates: { epoch: EPOCH_ISO } }, null) === EPOCH);
  /* THE COPY THAT MOVED. On 14 September 2026 this package was restaged with a
     different epoch while an importer was being written against the old one. A
     constant copied out of the contract would have refused all 365 boards
     while being the only wrong thing in the system. */
  t("and manifest.json must agree with it, or the package is refused",
    (() => {
      try { epochOf({ dates: { epoch: EPOCH_ISO } }, { epoch: "2026-09-14" }); return false; }
      catch (e) { return /INDEX.json says epoch/.test(e.message); }
    })());
  t("a package declaring no epoch is refused, not defaulted",
    (() => { try { epochOf({}, null); return false; } catch (e) { return /no dates.epoch/.test(e.message); } })());
  t("a whole package with a disagreeing manifest reports it once, not 365 times",
    (() => {
      const f = faultsFor([goodBoard(1), goodBoard(2)], { manifestEpoch: "2026-09-14" });
      return f.length === 1 && /manifest.json says/.test(f[0]);
    })());
}

console.log("\n=== Today's ordinal is UTC, and a local-time one is a real bug ===");
{
  /* THE CONDITION CODEWORD MADE NON-OPTIONAL, and it asked for a test rather
     than a comment because this exact class of bug shipped once in Crossword.
     Proved by RUNNING in a zone where local and UTC disagree: at 11pm UTC in
     Kiritimati (+14) the local date is already tomorrow, so a local-time
     ordinal is one ahead and every freeze comparison moves with it. */
  const at = Date.UTC(2026, 8, 20, 23, 0, 0);
  t("the ordinal is the same in every zone, because it is computed in UTC",
    (() => {
      /* A file:// URL, not a path. `import "C:/x/y.js"` is not a module
         specifier on Windows and fails silently into an empty stdout — which
         would have made all four zones agree on "" and passed this check for
         the wrong reason. The assertion below demands the VALUE 7, not merely
         agreement, for exactly that reason. */
      const spec = pathToFileURL(path.join(HERE, "import_codeword.js")).href;
      const script =
        "import {ordinalToday} from " + JSON.stringify(spec) + ";" +
        "console.log(ordinalToday(" + EPOCH + "," + at + "));";
      const zones = ["UTC", "Pacific/Kiritimati", "Pacific/Midway", "Europe/London"];
      const seen = zones.map((tz) => {
        const r = spawnSync(process.execPath, ["--input-type=module", "-e", script],
          { encoding: "utf8", env: { ...process.env, TZ: tz } });
        return String(r.stdout || "").trim();
      });
      return new Set(seen).size === 1 && seen[0] === "7";
    })(), "7 in UTC, Kiritimati (+14), Midway (-11) and London");
}

console.log("\n=== An answer must read off the grid, and that is executed ===");
{
  const rows = ["CAT", "ARE", "TEN"];
  t("across is read across", readsOff(rows, "CAT", 0, 0, "a") === "CAT");
  t("down is read down", readsOff(rows, "CAT", 0, 0, "d") === "CAT");
  t("a word that runs off the edge is null, not a short string",
    readsOff(rows, "CATS", 0, 0, "a") === null);
  const b = goodBoard(1);
  b.words = [["DOG", 0, 0, "a"], ["ARE", 1, 0, "a"], ["TEN", 2, 0, "a"], ["CAT", 0, 0, "d"]];
  t("a board claiming a word the grid does not hold is refused",
    has(gateBoard(b, { epochUtc: EPOCH }), "DOG does not read off the grid"));
}

console.log("\n=== The eight refusals of contract section 5 ===");
{
  const bad = (mutate) => { const b = goodBoard(3); mutate(b); return gateBoard(b, { epochUtc: EPOCH }); };
  t("2 — a date that disagrees with its id",
    has(bad((b) => { b.date = dayOf(b.no + 1); }), "but id 3 is"));
  t("3 — fewer hints than words",
    has(bad((b) => { b.hints = b.hints.slice(0, 2); }), "2 hints for 4 words"));
  t("3 — fewer breaks than words",
    has(bad((b) => { b.breaks = b.breaks.slice(0, 1); }), "1 breaks for 4 words"));
  t("4 — the wrong number of givens",
    has(bad((b) => { b.given = ["C", "A"]; }), "2 given letters, expected 3"));
  t("4 — a given that is not in the grid",
    has(bad((b) => { b.given = ["C", "A", "Z"]; }), "given Z does not appear"));
  t("5 — a cipher that repeats a number",
    has(bad((b) => { b.code.B = b.code.A; }), "repeats a number"));
  t("5 — a cipher missing a letter",
    has(bad((b) => { delete b.code.Q; }), "must map all 26 letters"));
  t("6 — a grid that is not size x size",
    has(bad((b) => { b.rows = ["CAT", "ARE"]; }), "2 rows, expected 3"));
  t("6 — a grid holding something that is not a letter or a block",
    has(bad((b) => { b.rows = ["CA1", "ARE", "TEN"]; }), "other than A-Z and a block"));
  t("8 — a file that changed after it was staged",
    has(gateBoard(goodBoard(3), { epochUtc: EPOCH, digest: "aaaa", expectDigest: "bbbb" }),
      "INDEX.json staged"));
}
{
  /* 1 — contiguity is a property of the package, not of one board. */
  t("1 — a gap in the ids is refused",
    has(faultsFor([goodBoard(1), goodBoard(3)]), "1 id(s) missing from the queue, first 2"));
  t("1 — a queue that does not start at 1 is refused",
    has(faultsFor([goodBoard(2), goodBoard(3)]), "starts at id 2, not 1"));
}

console.log("\n=== What must NOT be refused ===");
{
  /* meta is build noise and deliberately unstable. An importer that failed on
     it could never be rolled forward. */
  const a = goodBoard(1), b = goodBoard(1);
  b.meta = { seed: "totally different", attempt: 99, timings: [1, 2, 3] };
  t("a board whose meta changed is not refused", gateBoard(b, { epochUtc: EPOCH }).length === 0);
  t("and meta does not reach the payload", payloadOf(b).meta === undefined);
  t("nor the digest, so a re-seed is not a change",
    payloadDigest(a) === payloadDigest(b), payloadDigest(a) + " vs " + payloadDigest(b));
  const c = goodBoard(1);
  c.someFutureField = { added: "later" };
  t("an unknown extra field is not refused, so the format can roll forward",
    gateBoard(c, { epochUtc: EPOCH }).length === 0);
  t("key order does not decide the digest",
    stableJson({ a: 1, b: 2 }) === stableJson({ b: 2, a: 1 }));
}

console.log("\n=== A published board is frozen (contract 9.3) ===");
{
  /* Ordinal form, not date form: the identity of a row is the id. Today is
     pinned so the suite does not decide for itself what day it is. */
  const now = EPOCH + 5 * DAY + 3600000;           // ordinal 5, mid-morning UTC
  const boards = [1, 2, 3, 4, 5, 6, 7].map(goodBoard);
  t("the pinned clock puts today at ordinal 5", ordinalToday(EPOCH, now) === 5);

  const live = new Map(boards.map((b) => [b.no, payloadDigest(b)]));
  t("an unchanged package is accepted",
    faultsFor(boards, {}, { now, live }).length === 0);

  const changedPast = boards.map((b) => (b.no === 3 ? { ...b, rows: ["TAC", "ARE", "TEN"] } : b));
  t("changing a board at or below today's ordinal is refused",
    has(faultsFor(changedPast, {}, { now, live: new Map(boards.map((b) => [b.no, payloadDigest(b)])) }),
      "board 3 is at or below today's ordinal 5"));

  const changedFuture = boards.map((b) => (b.no === 7 ? { ...b, given: ["C", "A", "E"] } : b));
  t("changing a board above today's ordinal is allowed",
    !has(faultsFor(changedFuture, {}, { now, live }), "ordinal"));

  t("today's own board is frozen, not exempt",
    has(faultsFor(boards.map((b) => (b.no === 5 ? { ...b, size: 3, rows: ["TAC", "ARE", "TEN"] } : b)),
      {}, { now, live }), "board 5 is at or below"));

  /* A board D1 has never held is an insert, not a rewrite. */
  const partial = new Map([[1, payloadDigest(goodBoard(1))]]);
  t("a past board D1 has never held is an insert, and allowed",
    !has(faultsFor(boards, {}, { now, live: partial }), "ordinal"));

  /* AND WITH NOTHING TO COMPARE AGAINST, THE CHECK MUST SAY SO rather than
     pass. A freeze check with no live state cannot refuse anything. */
  /* Asserted on the ORDINAL fault specifically, not on a clean run. changedPast
     rewrites board 3's grid without moving its words, so it also trips
     refusal 7 — asserting "no faults at all" would have been asserting the
     wrong thing and passing for the wrong reason. */
  t("with no captured live state the freeze check refuses nothing, by design",
    !has(faultsFor(changedPast, {}, { now, live: null }), "ordinal"),
    "null live is the caller having captured nothing");
  /* AND THE CALLER NOW CAPTURES ONE. Until 17 Sep 2026 main() called
     gatePackage with no `live` at all, so the branch above was not a
     documented edge case — it was EVERY run, while the tool printed "boards at
     or below it are frozen". The freeze is only worth having if something
     hands it the digests, so that is asserted here rather than left to the
     CLI. */
  const frozen = faultsFor(changedPast, {}, { now, live: liveFromSql(sqlFor(makePackage(boards).boards, "s", epochOf(makePackage(boards).index, makePackage(boards).manifest), "st")).payloads });
  t("and WITH live state the same change is refused",
    has(frozen, "ordinal"),
    frozen.find((f) => /ordinal/.test(f)) || "no ordinal fault");
}

console.log("\n=== The memory: what the last emitted file said was live ===");
{
  /* The round trip that matters: sqlFor writes it, liveFromSql reads it back.
     Two functions in one file that must agree about a format — the shape this
     project has been bitten by whenever only one side was tested. */
  const pkg = makePackage([goodBoard(1), goodBoard(2), goodBoard(3)]);
  const epochUtc = epochOf(pkg.index, pkg.manifest);
  const sql = sqlFor(pkg.boards, "2026-09-17T00:00:00Z", epochUtc, "staged");
  const live = liveFromSql(sql);
  t("what sqlFor writes, liveFromSql reads back",
    live.known && live.payloads.size === 3 && live.days.size === 3,
    `${live.payloads.size} board(s), ${live.days.size} day(s)`);
  t("and the digests match the ones the gate computes",
    live.payloads.get(1) === payloadDigest(pkg.boards[0].board),
    "otherwise the freeze compares two different hashes and refuses everything");
  t("and each day maps to the board the calendar gave it",
    live.days.get(dayForNo(epochUtc, 2)) === 2);

  /* ABSENT IS NOT CLEAN. `known` is the flag the CLI prints on, so that a run
     with nothing to compare says so instead of reading as a silent pass. */
  const none = liveFromSql(null);
  t("with no previous file at all, known is false rather than empty-and-quiet",
    none.known === false && none.payloads === null,
    "a comparison against nothing must not report agreement");
}

console.log("\n=== The calendar, which the payload freeze cannot see ===");
{
  /* THE EPOCH HOLE. Contract 9.3 freezes a board's PAYLOAD keyed on its
     ordinal. The DAY an ordinal lands on is derived from the epoch, read fresh
     from each package — so two packages differing ONLY in declared epoch have
     identical digests and a schedule shifted by N days. 9.3 refuses nothing;
     DELETE FROM cw_schedule then rewrites the calendar under boards people
     have played. epochOf() demands INDEX.json and manifest.json agree, but
     both come from one build and a restage moves them together. */
  const boards = [goodBoard(1), goodBoard(2), goodBoard(3), goodBoard(4)];
  const at = (epoch) => {
    const p = makePackage(boards);
    p.index.dates.epoch = epoch; p.manifest.epoch = epoch;
    return p;
  };
  const base = at("2026-09-13");
  const wasSql = sqlFor(base.boards, "s", epochOf(base.index, base.manifest), "st");
  const days = liveFromSql(wasSql).days;
  const now = Date.parse(dayForNo(epochOf(base.index, base.manifest), 3) + "T12:00:00Z");

  t("the same epoch clashes with nothing", calendarClashes(days, at("2026-09-13"), now).length === 0);
  const moved = calendarClashes(days, at("2026-09-14"), now);
  t("an epoch moved by one day is refused, naming the days",
    moved.length > 0, moved[0] || "no clash reported");
  t("and only for days at or before today — the future is still free to move",
    moved.every((f) => f.slice(0, 10) <= dayForNo(epochOf(base.index, base.manifest), 3)),
    moved.join(" | "));
  t("with no memory it refuses nothing, which is the caller's to announce",
    calendarClashes(null, at("2026-09-14"), now).length === 0);
}

console.log("\n=== The digest table, and the lookup that must not silently miss ===");
{
  const pkg = makePackage([goodBoard(1)]);
  t("a digest is found under its staged key", digestFor(pkg.index, "0001.json") !== null);
  t("a name with no entry returns null rather than undefined-as-absent",
    digestFor(pkg.index, "9999.json") === null);
  /* A package with no digest table at all must be refused, not skipped — that
     is the case refusal 8 exists for, and "nothing to check" passes always. */
  const naked = makePackage([goodBoard(1), goodBoard(2)]);
  delete naked.index.sha256_16;
  t("a package carrying no digests is refused, not waved through",
    has(gatePackage(naked, {}), "carries a digest for 0 of 2"));
}

console.log("\n=== The count comes from the package ===");
{
  t("INDEX.json claiming a different count than the files is refused",
    has(faultsFor([goodBoard(1), goodBoard(2)], { claim: 365 }), "claims 365 boards, 2 files"));
}

console.log("\n=== The SQL it writes ===");
{
  const pkg = makePackage([goodBoard(1), goodBoard(2)]);
  const sql = sqlFor(pkg.boards, "STAMP", EPOCH, "fixture");
  t("the schedule is cleared before it is rewritten, so re-running does not double it",
    /DELETE FROM cw_schedule;/.test(sql));
  t("boards are written by id, so a re-run replaces rather than appends",
    (sql.match(/INSERT OR REPLACE INTO cw_board/g) || []).length === 2);
  t("one schedule row per board", (sql.match(/INSERT INTO cw_schedule/g) || []).length === 2);
  t("the days written are epoch + id, not anything restated",
    sql.includes("'" + dayOf(1) + "'") && sql.includes("'" + dayOf(2) + "'"));
  t("meta never reaches the file", !/"seed"/.test(sql) && !/"attempt"/.test(sql));
  t("and the file says which staging it read",
    /-- Staged: fixture/.test(sql));
  /* The answers are IN the payload, which is exactly why the folder they came
     from must never be served and this table is where they go instead. */
  t("the payload carries the solution, which is why it lives in D1 and not a folder",
    /CAT/.test(sql));
}

console.log("\n=== Reading a package off disk ===");
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cwpkg-"));
  fs.mkdirSync(path.join(dir, "daily"));
  const boards = [goodBoard(1), goodBoard(2)];
  const sha = {};
  for (const b of boards) {
    const name = String(b.no).padStart(4, "0") + ".json";
    const raw = JSON.stringify(b);
    fs.writeFileSync(path.join(dir, "daily", name), raw);
    sha["daily/" + name] = crypto.createHash("sha256").update(Buffer.from(raw)).digest("hex").slice(0, 16);
  }
  fs.writeFileSync(path.join(dir, "daily", "manifest.json"), JSON.stringify({ epoch: EPOCH_ISO, count: 2 }));
  fs.writeFileSync(path.join(dir, "INDEX.json"), JSON.stringify({
    counts: { boards: 2 }, dates: { epoch: EPOCH_ISO }, sha256_16: sha, staged: "on-disk",
  }));
  const pkg = readPackage(dir);
  t("manifest.json is read, so its epoch can corroborate INDEX.json's",
    pkg.manifest && pkg.manifest.epoch === EPOCH_ISO);
  t("manifest.json is not counted as a board", pkg.boards.length === 2);
  t("a package read off disk gates clean", gatePackage(pkg, {}).length === 0);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
