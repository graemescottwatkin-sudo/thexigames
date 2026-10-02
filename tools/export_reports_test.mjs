/* tools/export_reports_test.mjs — the weekly report export, run for real.
 *
 *   node tools/export_reports_test.mjs      (from the repo root)
 *
 * The export's query is EXECUTED here, against SQLite built from the real
 * migrations, and the run writes into a temporary inbox: a regex over the SQL
 * would prove only that it reads well. What matters is what reaches the file --
 * no player, one line per question and reason -- and that a second week sends
 * only the second week.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { exportQuery, reportLines, runExport, EXPORTS } from "./export_reports.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* ---- the database, as production has it -------------------------------- */
const db = new DatabaseSync(":memory:");
const mig = path.join(ROOT, "data", "migrations");
for (const f of fs.readdirSync(mig).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort()) {
  const text = fs.readFileSync(path.join(mig, f), "utf8").split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
  for (const st of text.split(/;\s*(?:\n|$)/).map((x) => x.trim()).filter(Boolean)) {
    try { db.exec(st); } catch (e) { if (!/duplicate column/i.test(e.message)) throw new Error(`${f}: ${e.message}`); }
  }
}
const Q = EXPORTS.quickfire_fr.questions;
db.prepare("INSERT INTO users (id, provider, provider_id, display_name, email) VALUES ('u1', 'email', 'p1', 'Rachel Green', 'rachel@example.com')").run();
db.prepare("INSERT INTO users (id, provider, provider_id, display_name) VALUES ('u2', 'email', 'p2', 'Ross Geller')").run();
const insQ = db.prepare(`INSERT INTO ${Q} (id, answer, answer_norm, answer_type, clue, status, option_1, option_2, option_3, option_4) VALUES (?, 'A', 'a', 'person', ?, 'verified', 'A', 'B', 'C', 'D')`);
insQ.run("EVT0001", "Who's the question (one)?");
insQ.run("EVT0002", "Question two");
const report = db.prepare("INSERT INTO clue_reports (id, game, clue_id, reported_by, reason, puzzle, created_at) VALUES (?, ?, ?, ?, ?, '2026-10-02', ?)");
report.run("r1", "quickfire_fr", "EVT0001", "u1", "I was right", "2026-10-02 09:00:00");
report.run("r2", "quickfire_fr", "EVT0001", "u2", "I was right", "2026-10-02 11:30:00");
report.run("r3", "quickfire_fr", "EVT0001", "u2", "The question is wrong", "2026-10-02 10:00:00");
report.run("r4", "quickfire_fr", "EVT0002", "u1", "The question is wrong", "2026-10-03 08:00:00");
report.run("r5", "quickfire_fr", "GONE01", "u1", "The question is wrong", "2026-10-03 09:00:00");
report.run("r6", "quickfire", "EVT0001", "u1", "I was right", "2026-10-02 12:00:00");     // football's, not this export's
report.run("r7", "lightning_fr", "EVT0002", "u2", "I was right", "2026-10-02 12:00:00");
const query = (sql) => db.prepare(sql).all();

console.log("=== The query, executed ===");
const rows = query(exportQuery("quickfire_fr", "1970-01-01 00:00:00"));
t("it reads this game's reports and no other's", rows.length === 5, rows.length + " row(s)");
t("and selects nothing that names a player", rows.every((r) => Object.keys(r).sort().join(",") === "clue_id,created_at,reason,text"),
  Object.keys(rows[0] || {}).join(","));
t("the question's words come from the bank", rows.find((r) => r.clue_id === "EVT0002").text === "Question two");
t("and a report on a question the bank no longer holds still arrives, with no words",
  rows.some((r) => r.clue_id === "GONE01" && r.text === null));
t("a cursor that is not a timestamp is refused before any SQL is built", (() => {
  try { exportQuery("quickfire_fr", "2026-10-02' OR '1'='1"); return false; } catch (e) { return /not a timestamp/.test(e.message); }
})());

console.log("\n=== The lines ===");
const lines = reportLines(rows).map((l) => JSON.parse(l));
const line = (id, reason) => lines.find((l) => l.clue_id === id && l.reason === reason);
t("a line per question and reason", lines.length === 4, lines.length + " line(s)");
t("two players with one reason are one line counting two, at the later time",
  line("EVT0001", "I was right")?.count === 2 && line("EVT0001", "I was right")?.reported_at === "2026-10-02 11:30:00",
  JSON.stringify(line("EVT0001", "I was right")));
t("the same question for another reason is its own line", line("EVT0001", "The question is wrong")?.count === 1);
t("every line carries exactly the five agreed fields",
  lines.every((l) => Object.keys(l).join(",") === "clue_id,reported_at,reason,text,count"));
t("and a row carrying a player's id or name still cannot put it in a line",
  !/u1|Rachel|rachel@/.test(reportLines([{ clue_id: "X", reason: "r", created_at: "2026-10-02 00:00:00", text: "t",
    reported_by: "u1", display_name: "Rachel Green", email: "rachel@example.com" }]).join("")));
t("the words survive a quote and brackets", line("EVT0001", "I was right")?.text === "Who's the question (one)?");

console.log("\n=== A run, and the week after ===");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reports-"));
try {
  const inbox = path.join(tmp, "reports", "inbox");
  fs.mkdirSync(inbox, { recursive: true });
  const cursor = path.join(tmp, "reports", "quickfire-export.cursor");
  const dry = runExport({ game: "quickfire_fr", query, today: "2026-10-05", inbox, write: false });
  t("without --write it says what it would do and writes nothing",
    dry.lines === 4 && fs.readdirSync(inbox).length === 0 && !fs.existsSync(cursor), dry.message);
  const first = runExport({ game: "quickfire_fr", query, today: "2026-10-05", inbox, write: true });
  const file = path.join(inbox, "quickfire-2026-10-05.jsonl");
  t("a run writes the batch under the agreed name", first.written === file && fs.existsSync(file), first.message);
  const body = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  t("  four lines, and no player anywhere in the file",
    body.trim().split("\n").length === 4 && !/u1|u2|Rachel|Ross|example\.com/.test(body));
  t("  and the cursor moves to the newest report sent", fs.readFileSync(cursor, "utf8").trim() === "2026-10-03 09:00:00");

  /* Triage empties the inbox. The cursor is not in it, so nothing goes twice. */
  fs.rmSync(file);
  const quiet = runExport({ game: "quickfire_fr", query, today: "2026-10-12", inbox, write: true });
  t("the next week with nothing new writes nothing, even after the inbox was emptied",
    quiet.written === null && fs.readdirSync(inbox).length === 0, quiet.message);
  report.run("r8", "quickfire_fr", "EVT0002", "u2", "The question is wrong", "2026-10-08 18:00:00");
  const second = runExport({ game: "quickfire_fr", query, today: "2026-10-12", inbox, write: true });
  const body2 = second.written ? fs.readFileSync(second.written, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
  t("and a week with one new report sends that one alone",
    body2.length === 1 && body2[0].clue_id === "EVT0002" && body2[0].count === 1 && body2[0].reported_at === "2026-10-08 18:00:00",
    JSON.stringify(body2));
  report.run("r9", "quickfire_fr", "EVT0001", "u1", "I was right", "2026-10-09 07:00:00");
  const third = runExport({ game: "quickfire_fr", query, today: "2026-10-12", inbox, write: true });
  t("a second run on one day adds its own file rather than rewriting the first",
    third.written === path.join(inbox, "quickfire-2026-10-12-2.jsonl") && fs.readdirSync(inbox).length === 2, third.message);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
