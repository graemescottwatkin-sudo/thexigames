#!/usr/bin/env node
/* tools/export_reports.mjs — players' question reports, out to the bank that
 * can fix them.
 *
 *   node tools/export_reports.mjs            (says what it would write)
 *   node tools/export_reports.mjs --write    (writes it)
 *
 * THE OWNER, 2 Oct 2026: "yes do the weekly export". QuickFire XI: Friends'
 * Full Time has a report button (same day), its reports land in clue_reports,
 * and the bank's own session triages them from
 * ..\Other\QuickFireXI_Friends\research\reports\inbox\ -- one JSONL file per
 * batch, a line per question and reason:
 *
 *   {"clue_id","reported_at","reason","text","count"}
 *
 * NOTHING THAT NAMES A PLAYER LEAVES. reported_by is never selected, and the
 * lines are built from five named fields rather than by copying a row, so a
 * column added to the query later still cannot reach the file.
 *
 * ONLY WHAT IS NEW. A cursor beside the inbox holds the newest report already
 * sent; a run sends what came after it and moves it. It lives OUTSIDE the inbox
 * because triage empties the inbox, and a cursor read off the files there would
 * send everything again the week after somebody tidied up. A run with nothing
 * new writes nothing at all.
 *
 * READ-ONLY on the database: one SELECT, through --command (see runway_check's
 * note on why never --file).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { qfSet, qfTable } from "../functions/_lib/qf-sets.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/* WHICH GAMES EXPORT, AND WHERE TO. The question table is QuickFire's own
   registry's answer, not a name written here. */
export const EXPORTS = {
  quickfire_fr: {
    prefix: "quickfire",
    questions: qfTable(qfSet("quickfire_fr"), "question"),
    inbox: path.join(ROOT, "..", "Other", "QuickFireXI_Friends", "research", "reports", "inbox"),
  },
};

const STAMP = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/;
export const EPOCH = "1970-01-01 00:00:00";

/* The one SELECT. The cursor is the only value spliced in, and it is refused
   unless it is a plain timestamp: the shell and the SQL both see it. */
export function exportQuery(game, after) {
  const ex = EXPORTS[game];
  if (!ex) throw new Error(`no export for game "${game}"`);
  if (!STAMP.test(after)) throw new Error(`a cursor that is not a timestamp: ${JSON.stringify(after)}`);
  return `SELECT r.clue_id AS clue_id, r.reason AS reason, r.created_at AS created_at, q.clue AS text ` +
    `FROM clue_reports r LEFT JOIN ${ex.questions} q ON q.id = r.clue_id ` +
    `WHERE r.game = '${game}' AND r.created_at > '${after}' ORDER BY r.created_at`;
}

/* A line per question and reason: how many said it, the latest time anyone
   did, and the question's words as the bank holds them now (null if the bank
   no longer has it). */
export function reportLines(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = JSON.stringify([String(r.clue_id), r.reason ?? null]);
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (r.created_at > g.reported_at) g.reported_at = r.created_at;
    } else {
      groups.set(key, { clue_id: String(r.clue_id), reported_at: r.created_at,
        reason: r.reason ?? null, text: r.text ?? null, count: 1 });
    }
  }
  return [...groups.values()]
    .sort((a, b) => (a.reported_at < b.reported_at ? -1 : a.reported_at > b.reported_at ? 1 : 0))
    .map((g) => JSON.stringify({ clue_id: g.clue_id, reported_at: g.reported_at, reason: g.reason, text: g.text, count: g.count }));
}

/* One run. `query` takes SQL and returns rows; the suite hands it SQLite. */
export function runExport({ game, query, today, inbox, write }) {
  const ex = EXPORTS[game];
  const dir = inbox || ex.inbox;
  const cursorFile = path.join(dir, "..", `${ex.prefix}-export.cursor`);
  const after = fs.existsSync(cursorFile) ? fs.readFileSync(cursorFile, "utf8").trim() : EPOCH;
  const rows = query(exportQuery(game, after));
  if (!rows.length) return { written: null, lines: 0, after, message: `no new ${game} reports since ${after}` };
  const lines = reportLines(rows);
  const newest = rows.reduce((m, r) => (r.created_at > m ? r.created_at : m), after);
  const file = path.join(dir, `${ex.prefix}-${today}.jsonl`);
  if (!write) return { written: null, lines: lines.length, after, file, message: `would write ${lines.length} line(s) from ${rows.length} report(s) to ${file}` };
  if (!fs.existsSync(dir)) throw new Error(`no inbox at ${dir}`);
  /* A SECOND RUN ON ONE DAY ADDS ITS OWN FILE, never rewrites the first: the
     first may already have been read. */
  let out = file;
  for (let k = 2; fs.existsSync(out); k++) out = path.join(dir, `${ex.prefix}-${today}-${k}.jsonl`);
  fs.writeFileSync(out, lines.join("\n") + "\n");
  fs.writeFileSync(cursorFile, newest + "\n");
  return { written: out, lines: lines.length, after: newest, message: `wrote ${lines.length} line(s) from ${rows.length} report(s) to ${out}` };
}

/* ------------------------------------------------------------ the wire --- */
function d1(sql) {
  const out = execFileSync(
    `npx --yes wrangler d1 execute crosswordxi --remote --json --command "${sql}"`,
    { encoding: "utf8", maxBuffer: 1 << 24, shell: true, cwd: ROOT });
  const start = out.indexOf("[");
  if (start < 0) throw new Error("no JSON in wrangler output:\n" + out.slice(0, 400));
  const parsed = JSON.parse(out.slice(start))[0];
  if (!parsed || !Array.isArray(parsed.results)) throw new Error("wrangler returned no results array");
  return parsed.results;
}

const isMain = process.argv[1] && process.argv[1].endsWith("export_reports.mjs");
if (isMain) {
  const write = process.argv.includes("--write");
  const today = new Date().toISOString().slice(0, 10);
  let failed = false;
  for (const game of Object.keys(EXPORTS)) {
    try {
      console.log(runExport({ game, query: d1, today, write }).message);
    } catch (e) {
      console.log(`REFUSED ${game}: ${e.message}`);
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}
