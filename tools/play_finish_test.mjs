/* tools/play_finish_test.mjs — who finished, as a device, against the real schema.
 *
 *   node tools/play_finish_test.mjs        (from the repo root; no dependencies)
 *
 * The owner, 11 Oct 2026: "can tell if 1 person finished 13 games or 13 people
 * did". 056-play-finish.sql keeps, for each finished play, the SHA-256 of a
 * random key the device made for itself. This applies every migration to
 * node:sqlite and drives the real /api/play and the real admin report:
 *   - a finish files the hash and NEVER the key;
 *   - an abandon, a key of the wrong shape and an admin preview's scratch id
 *     file nothing, and a finish for a play the server never started neither;
 *   - the same device finishing three boards is one finisher, not three, and
 *     the admin report says so: finishes, finishers, the most by one device.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { onRequestPost as play, visitorHash } from "../functions/api/play.js";
import { onRequest as admin } from "../functions/api/admin/[[route]].js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const db = new DatabaseSync(":memory:");
const mig = path.join(ROOT, "data", "migrations");
for (const f of fs.readdirSync(mig).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort()) {
  const text = fs.readFileSync(path.join(mig, f), "utf8").split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
  for (const st of text.split(/;\s*(?:\n|$)/).map((x) => x.trim()).filter(Boolean)) {
    try { db.exec(st); } catch (e) { if (!/duplicate column/i.test(e.message)) throw new Error(`${f}: ${e.message}`); }
  }
}
const stmt = (sql, a = []) => ({ bind: (...b) => stmt(sql, b),
  all: async () => ({ results: db.prepare(sql).all(...a) }),
  first: async () => db.prepare(sql).get(...a) || null,
  run: async () => db.prepare(sql).run(...a) });
const env = { DB: { prepare: (sql) => stmt(sql), batch: async (l) => { for (const s of l) await s.run(); return []; } } };

let ip = 0;
const post = (body) => play({ env, request: new Request("https://www.thexigames.com/api/play", {
  method: "POST", body: JSON.stringify(body),
  headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.0.0." + (++ip % 250) } }) });
const KEY_A = "0123456789abcdef0123456789abcdef", KEY_B = "fedcba9876543210fedcba9876543210";
const round = async (playId, game, visitor, completed = true) => {
  await post({ event: "start", playId, game, mode: "daily", total: 11 });
  return post({ event: "end", playId, game, mode: "daily", solved: 11, completed, elapsed: 60, visitor });
};
const rowsOf = (playId) => db.prepare("SELECT * FROM play_finish WHERE play_id = ?").all(playId);

console.log("=== A finish files a hash, never the key ===");
t("the table is there (056 applied)", db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'play_finish'").get().n === 1);
await round("playA0000001", "crossword", KEY_A);
const r1 = rowsOf("playA0000001");
t("a finished play files one row", r1.length === 1, JSON.stringify(r1));
t("its who is the SHA-256 of the key, not the key", r1[0] && r1[0].who === await visitorHash(KEY_A) &&
  r1[0].who !== KEY_A && /^[0-9a-f]{64}$/.test(r1[0].who), r1[0] && r1[0].who);
t("and the key is in no column of any table", db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
  .every(({ name }) => { const cs = db.prepare(`PRAGMA table_info(${name})`).all().filter((c) => /TEXT/i.test(c.type)).map((c) => c.name);
    return !cs.length || db.prepare(`SELECT COUNT(*) AS n FROM ${name} WHERE ${cs.map((c) => `${c} LIKE '%${KEY_A}%'`).join(" OR ")}`).get().n === 0; }));
t("filed under the play's own game and the server's day", r1[0] && r1[0].game === "crossword" && /^\d{4}-\d{2}-\d{2}$/.test(r1[0].day));

console.log("\n=== And nothing else does ===");
await round("playA0000002", "crossword", KEY_A, false);
t("an abandon files nothing", rowsOf("playA0000002").length === 0);
await round("playA0000003", "crossword", "not-a-key");
t("a key of the wrong shape files nothing, and the finish still stands", rowsOf("playA0000003").length === 0 &&
  db.prepare("SELECT completed FROM plays WHERE play_id = 'playA0000003'").get().completed === 1);
await post({ event: "end", playId: "never-started", game: "crossword", mode: "daily", completed: true, visitor: KEY_A });
t("a finish for a play the server never started files nothing", rowsOf("never-started").length === 0);
await round("pv-preview001", "crossword", KEY_A);
t("an admin preview's scratch id files nothing", rowsOf("pv-preview001").length === 0);
/* A real preview never posts its plays at all -- the page holds them
   (shared/xi-preview.js) -- so the row this direct call made is not one the
   site could have, and is taken out before the report is read. */
db.prepare("DELETE FROM plays WHERE play_id = 'pv-preview001'").run();
const again = await post({ event: "end", playId: "playA0000001", game: "crossword", mode: "daily", completed: true, visitor: KEY_B });
t("a play is one finish: a second end does not refile it under another device", again.status === 200 &&
  rowsOf("playA0000001").length === 1 && rowsOf("playA0000001")[0].who === r1[0].who);

console.log("\n=== One device or many, in the admin report ===");
await round("playA0000004", "wordsearch", KEY_A);
await round("playA0000005", "grid", KEY_A);
await round("playB0000001", "crossword", KEY_B);
db.prepare("INSERT INTO users (id, provider, provider_id, display_name, is_admin) VALUES ('boss', 'google', 'g-boss', 'Owner', 1)").run();
db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('s-boss', 'boss', '2999-01-01T00:00:00Z')").run();
const rep = await admin({ env, params: { route: ["plays"] }, request: new Request("https://www.thexigames.com/api/admin/plays",
  { headers: { Cookie: "cxi_session=s-boss" } }) });
const j = await rep.json();
t("the report counts finishes with a device behind them, and the devices", rep.status === 200 &&
  j.finishes === 4 && j.finishers === 2, JSON.stringify({ finishes: j.finishes, finishers: j.finishers }));
t("and the most by any one device: three, by the same one", j.mostByOne === 3, String(j.mostByOne));
t("the finish whose key was the wrong shape is counted apart, not guessed at", j.unknownWho === 1, String(j.unknownWho));
const cw = (j.days || []).find((x) => x.game === "crossword");
t("each board says how many devices finished it", !!cw && cw.finished === 3 && cw.finishers === 2, JSON.stringify(cw));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
