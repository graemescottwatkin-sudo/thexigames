/* tools/grid_calendar.js — what Grid XI is going to serve, and when.
 *
 * WHY IT EXISTS. Grid XI launched with 236 boards and every one of them a
 * daily: one per day from 7 September 2026 to 30 April 2027. The owner's plan
 * is to move the older and more obscure elevens out of the calendar and into
 * the catalogue — a board that is a fair daily for everybody is not the same
 * board as one somebody goes looking for — and that decision needs the list
 * in front of you, not a database query typed out each time.
 *
 * WHAT IT PRINTS: the day, the board number a player would address it by, the
 * board id, its kind, the set it came from and its TITLE — which in this game
 * is the whole clue.
 *
 *   node tools/grid_calendar.js                 everything still to come
 *   node tools/grid_calendar.js --all           played and to come
 *   node tools/grid_calendar.js --past          only what has already run
 *   node tools/grid_calendar.js --csv           the same, for a spreadsheet
 *   node tools/grid_calendar.js --catalogue     the boards already out of the
 *                                               calendar, which is the list
 *                                               this exercise is building
 *
 * THIS IS A LOCAL TOOL AND MUST STAY ONE. It prints the titles of boards that
 * have not run, and in Grid XI the title IS the clue — "the eleven who started
 * the 1983 Cup Winners' Cup final" is the whole of what a player is given. A
 * page that printed this would be a page that gives away eight months of
 * boards. Nothing here is served, and nothing here should become a route.
 *
 * IT READS PRODUCTION, because production is what is actually scheduled: the
 * source archive says what was emitted, the database says what is being
 * served, and those are two different questions once a re-import has happened.
 */
import { execSync } from "node:child_process";
import { dailyNoForDay, utcDay } from "../functions/_lib/daily.js";

const args = process.argv.slice(2);
const has = (f) => args.indexOf(f) > -1;
const CSV = has("--csv");

function query(sql) {
  /* --json, so the answer is parsed rather than scraped off a table meant for
     a human. wrangler prints other things around it on some versions, so the
     results array is found rather than assumed to be the whole document. */
  /* ONE QUOTED ARGUMENT. Passed as a list through a shell, the SQL was split
     on its spaces and wrangler reported every column as an unknown argument.
     The statements here carry no double quotes, and the guard says so rather
     than trusting it. */
  if (sql.indexOf(String.fromCharCode(34)) > -1) throw new Error("quote the quotes first");
  const cmd = 'npx wrangler d1 execute crosswordxi --remote --json --command "' + sql + '"';
  const out = execSync(cmd, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const at = out.indexOf('"results"');
  if (at < 0) throw new Error("no results in wrangler's answer:\n" + out.slice(0, 400));
  /* From the first [ after "results" to its matching ]. */
  let i = out.indexOf("[", at), depth = 0, end = i;
  for (; end < out.length; end++) {
    if (out[end] === "[") depth++;
    else if (out[end] === "]") { depth--; if (!depth) break; }
  }
  return JSON.parse(out.slice(i, end + 1));
}

const today = utcDay();

const scheduled = query(
  "SELECT s.day AS day, b.id AS id, b.kind AS kind, b.set_id AS set_id, b.title AS title " +
  "FROM gd_schedule s JOIN gd_board b ON b.id = s.board_id ORDER BY s.day");

/* A board that is in the bank and on no day at all: the catalogue, once there
   is one. Listed separately because it has no date to sort by, and because it
   is the answer to "what have I moved so far". */
const loose = query(
  "SELECT b.id AS id, b.kind AS kind, b.set_id AS set_id, b.title AS title FROM gd_board b " +
  "WHERE NOT EXISTS (SELECT 1 FROM gd_schedule s WHERE s.board_id = b.id) ORDER BY b.title");

const rows = has("--catalogue") ? loose
  : scheduled.filter((r) => (has("--all") ? true : has("--past") ? r.day < today : r.day >= today));

if (CSV) {
  console.log("day,no,id,kind,set,title");
  for (const r of rows) {
    const no = r.day ? dailyNoForDay(r.day) : "";
    /* Quoted and doubled: a title may hold a comma, and several hold an
       apostrophe — "1983 European Cup Winners' Cup". */
    console.log([r.day || "", no || "", r.id, r.kind,
                 r.set_id || "", '"' + String(r.title).replace(/"/g, '""') + '"'].join(","));
  }
} else {
  const label = has("--catalogue") ? "out of the calendar"
    : has("--past") ? "already run" : has("--all") ? "every scheduled board" : "still to come";
  console.log(`\nGrid XI — ${rows.length} board${rows.length === 1 ? "" : "s"} ${label}` +
    (has("--catalogue") ? "" : `, as at ${today}`) + "\n");
  for (const r of rows) {
    const no = r.day ? String(dailyNoForDay(r.day)).padStart(4) : "   —";
    const when = r.day === today ? "TODAY " : (r.day || "      ");
    console.log(`${when}  #${no}  ${r.id}  ${String(r.kind).padEnd(5)}  ${r.title}`);
  }
  if (!has("--catalogue")) {
    console.log(`\n${loose.length} board${loose.length === 1 ? "" : "s"} are out of the ` +
      "calendar already — node tools/grid_calendar.js --catalogue");
  }
  console.log("\nTo move one: set kind to \"free\" on that board in the source, re-run");
  console.log("tools/import_grid.js, and apply data/gd-production.sql. The calendar closes");
  console.log("up behind it, so no day is left without a board.\n");
}
