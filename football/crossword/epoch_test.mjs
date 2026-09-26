/* epoch_test.mjs — the client and the server must agree on what day it is.
 *
 * The date Daily #1 falls on is written in two files, in two formats:
 * js/engine.js uses local-time components, functions/_lib/daily.js uses UTC.
 * If they drift apart the browser asks for puzzle N while the server thinks it
 * is N±1 — so every reveal and every check is refused with a 403, for
 * everybody, and the game looks broken rather than misconfigured.
 */
import fs from "node:fs";
import { dailyNumber as serverDaily } from "../../functions/_lib/daily.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
const DIR = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* Load the client engine the way a browser would. */
const engineSrc = fs.readFileSync(path.join(DIR, "js/engine.js"), "utf8");
const sandbox = { module: { exports: {} }, window: {} };
new Function("module", "window", engineSrc)(sandbox.module, sandbox.window);
const FCW = sandbox.module.exports;

const epochLine = engineSrc.match(/var DAILY_EPOCH = \{ y: (\d+), m: (\d+), d: (\d+) \}/);
t("the client declares an epoch", !!epochLine, epochLine && epochLine[0]);
const serverLine = fs.readFileSync(path.join(DIR, "../../functions/_lib/daily.js"), "utf8")
  .match(/const EPOCH = Date\.UTC\((\d+), (\d+), (\d+)\)/);
t("the server declares one too", !!serverLine, serverLine && serverLine[0]);

/* The conventions differ by one day on purpose: the client stores the day
   *before* #1, the server stores #1 itself. */
const [, cy, cm, cd] = epochLine.map(Number);
const [, sy, sm, sd] = serverLine.map(Number);
t("they describe the same first day",
  cy === sy && cm === sm && cd + 1 === sd,
  `client ${cy}-${cm + 1}-${cd + 1} (day before) vs server ${sy}-${sm + 1}-${sd}`);

/* And, more usefully, they agree on actual dates. */
const dates = ["2026-08-11", "2026-08-15", "2026-09-01", "2026-12-05", "2027-01-01"];
const disagree = dates.filter((iso) => {
  const d = new Date(iso + "T12:00:00Z");
  return FCW.dailyNumber(d) !== serverDaily(d.getTime());
});
t("client and server agree on every date checked", disagree.length === 0,
  disagree.length ? disagree.join(", ") : dates.map((iso) => {
    const d = new Date(iso + "T12:00:00Z");
    return iso + "=#" + serverDaily(d.getTime());
  }).join("  "));

t("before the first day everything clamps to #1, so testing never runs it down",
  serverDaily(Date.UTC(2026, 0, 1)) === 1, "#" + serverDaily(Date.UTC(2026, 0, 1)));


/* The client's trusted-mode day must be THE SERVER'S day — same instant in,
   same board number out, at every boundary hour. Run both implementations
   side by side across the dangerous instants: just before and after UTC
   midnight, which is the hour the two used to disagree in UK summer. */
{
  const srv = await import("../../functions/_lib/daily.js");
  /* THE INSTANTS ARE DERIVED FROM THE EPOCH, NOT WRITTEN DOWN. They were six
     literals in August 2026, and on 18 September the epoch moved to make that
     day #1 — which put EVERY ONE of them before day one, where both sides
     clamp to #1 and agree trivially. The block went on passing and stopped
     testing anything: a green anybody would reasonably read as proof that the
     riskiest constant in the project had been moved safely.
     Now day one is read from the server's own declared epoch, so the boundary
     being probed is always the real one and this cannot rot at the next
     reset. */
  const day1 = Date.UTC(sy, sm, sd);
  const DAY = 86400000;
  const instants = [
    day1 + DAY + 82740000,   // day 2, 22:59 UTC
    day1 + DAY + 84600000,   // day 2, 23:30
    day1 + 2 * DAY,          // day 3, 00:00 — the rollover itself
    day1 + 2 * DAY + 1800000,
    day1 + 2 * DAY + 3600000,
    day1 + 7 * DAY + 86340000,
  ];
  let diverged = null;
  for (const ms of instants) {
    FCW.setTrustedTime(ms);
    /* setTrustedTime records an offset against the REAL clock; freeze the
       comparison by asking both sides about the same instant. */
    const client = FCW.dailyNumber();
    const server = srv.dailyNumber(FCW.timeState().now);
    if (client !== server) { diverged = `${new Date(ms).toISOString()}: client #${client}, server #${server}`; break; }
  }
  FCW.clearTrustedTime();
  t("a trusted client counts the same day as the server at every boundary hour",
    !diverged, diverged || instants.length + " instants, including both sides of UTC midnight");
  /* First draft of this ended "|| true" — an assertion that cannot fail,
     written the same night a review caught five of them. The real property:
     an explicit `at` answers from LOCAL calendar components regardless of
     trust, because the archive calendar maps its cells through local dates
     and must not shift when a sync lands. Local epoch day is the 25th, so
     local 28 August is board #3, trusted or not. */
  /* A LOCAL DATE A KNOWN NUMBER OF DAYS AFTER DAY ONE, derived the same way.
     This asserted local 28 August was board #3 — true only while day one was
     26 August. The property under test is that an explicit `at` reads LOCAL
     calendar components and does not move when a sync lands, so what matters
     is the OFFSET, not the date. Two days after day one is board #3, whatever
     day one is. */
  const localDay3 = new Date(cy, cm, cd + 3, 0, 30);   // client epoch is the day BEFORE #1
  FCW.setTrustedTime(day1 - 5 * DAY);                  // trust pointing somewhere else entirely
  t("an explicit date still answers from the local calendar, trust or no trust",
    FCW.dailyNumber(localDay3) === 3,
    "the calendar's cells must not move when a sync lands");
  FCW.clearTrustedTime();
}

/* EVERY BOARD'S DATE, ACROSS THE CLOCK CHANGES, IN THREE ZONES.

   dailyDate was local midnight of the epoch plus N x 24 hours. That is right
   only while no clock change lies between, and every check above runs in one
   zone near day one: from 26 October 2026 in the UK every board landed on the
   day before its own, #38 and #39 both on the 25th, and recordDaily filed each
   result — and so the account's played_on — a day early.

   The zone is FIXTURE, set here (process.env.TZ is re-read by Node on
   assignment), not whatever the machine running this happens to be. London
   for the UK's two changes, New York west of UTC, Auckland east of it — whose
   changes fall on other days, and whose spring one is in the southern
   September, so a range that happened to fit London's would not cover it. */
{
  const srv = await import("../../functions/_lib/daily.js");
  const DAY = 86400000;
  const BOARDS = 800;   // over two years from day one: every zone's changes, twice
  const keyUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
  const firstDay = Date.UTC(sy, sm, sd), lastDay = firstDay + (BOARDS - 1) * DAY;
  const savedTZ = process.env.TZ;

  for (const zone of ["Europe/London", "America/New_York", "Pacific/Auckland"]) {
    process.env.TZ = zone;
    /* THE FIXTURE MUST HAVE LANDED. A runtime without zone data answers every
       zone as UTC, where 24-hour steps are exact and the old code passes — so
       the zone is proved to observe DST before anything is asked of it. */
    const jan = new Date(2027, 0, 1).getTimezoneOffset(), jul = new Date(2027, 6, 1).getTimezoneOffset();
    t(`${zone}: the zone fixture took effect and has clock changes`, jan !== jul,
      `offset January ${jan}, July ${jul}`);

    /* AND THE RANGE HOLDS THEM. The days whose local length is not 24 hours,
       found by walking the range rather than written down, so this cannot go
       on passing after the range stops covering them. */
    const changes = [], short = [], long = [];
    for (let ms = firstDay; ms <= lastDay; ms += DAY) {
      const d = new Date(ms), a = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const b = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
      if (b - a === DAY) continue;
      changes.push(keyUTC(ms));
      (b - a < DAY ? short : long).push(keyUTC(ms));
    }
    t(`${zone}: boards 1..${BOARDS} span at least two autumn and two spring changes`,
      short.length >= 2 && long.length >= 2,
      `spring (23h) ${short.join(", ") || "none"}; autumn (25h) ${long.join(", ") || "none"}`);

    const wrong = [], seen = new Map(), dup = [], trip = [];
    for (let n = 1; n <= BOARDS; n++) {
      const d = FCW.dailyDate(n), key = FCW.localDateKey(d), want = srv.dailyDayKey(n);
      if (key !== want && wrong.length < 3) wrong.push(`#${n} ${key}, server ${want}`);
      if (seen.has(key) && dup.length < 3) dup.push(`#${seen.get(key)} and #${n} on ${key}`);
      seen.set(key, n);
      /* The calendar's round trip: a cell's date goes to a number through
         dailyNumber(at) and back through dailyDate, and "real" is the two
         agreeing. Local midnight exactly, since the cell is built that way. */
      if ((d.getHours() || d.getMinutes()) && trip.length < 3) trip.push(`#${n} at ${d.toString()}`);
      else if (FCW.dailyNumber(d) !== n && trip.length < 3) trip.push(`#${n} -> #${FCW.dailyNumber(d)}`);
    }
    t(`${zone}: every board's local date is the server's dailyDayKey, 1..${BOARDS}`, !wrong.length,
      wrong.join("; ") || `through ${srv.dailyDayKey(BOARDS)}`);
    t(`${zone}: no two boards share a day`, !dup.length, dup.join("; "));
    t(`${zone}: each board is local midnight and maps back to itself`, !trip.length, trip.join("; "));

    /* THE GRACE RULE is arithmetic on dailyDate too: a board counts if
       finished before the end of the day after its own. On the autumn change
       "own + 24h" is still own's date, so it refused a next-day legacy row and
       closed the grace an hour early. Asked of every board that has a change
       on its own day or the next — the days that rule's arithmetic crosses. */
    const graceWrong = [];
    let asked = 0;
    for (let n = 1; n <= BOARDS; n++) {
      const own = srv.dailyDayKey(n), next = srv.dailyDayKey(n + 1), after = srv.dailyDayKey(n + 2);
      if (!changes.includes(own) && !changes.includes(next)) continue;
      asked++;
      const [ay, am, ad] = after.split("-").map(Number);
      const endOfGrace = new Date(ay, am - 1, ad).getTime();
      const cases = [
        [{ dailyNo: n, date: next }, true, "dated the next day"],
        [{ dailyNo: n, at: endOfGrace - 60000 }, true, "a minute before the grace ends"],
        [{ dailyNo: n, at: endOfGrace }, false, "the moment the grace ends"],
        [{ dailyNo: n, date: after }, false, "dated the day after the grace"],
      ];
      for (const [r, want, what] of cases) {
        if (FCW.onTimeResult(r) !== want && graceWrong.length < 4) graceWrong.push(`#${n} ${what}: ${!want}`);
      }
    }
    t(`${zone}: the grace ends at local midnight after the next day, across every change`,
      asked >= changes.length && !graceWrong.length, graceWrong.join("; ") || `${asked} boards asked`);
  }
  if (savedTZ === undefined) delete process.env.TZ; else process.env.TZ = savedTZ;
}

/* A BOARD'S DATE IS NEVER READ IN UTC. dailyDate is LOCAL midnight; its
   toISOString is the evening before anywhere east of UTC, and the top bar
   named yesterday's date on every British summer board that way. Read from
   the code with comments stripped, and paired with the positive: the bar's
   day is the local key, so removing the call cannot pass as "no UTC read". */
{
  const game = fs.readFileSync(path.join(DIR, "js/game.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const utc = game.match(/dailyDate\([^()]*\)\s*\.\s*(?:toISOString|toJSON|getUTC\w+)/g) || [];
  t("no daily's date is read as a UTC instant", !utc.length, utc.join("; ") || "none");
  t("the top bar's day is the board's local date key",
    /XIBar\.set\([\s\S]{0,200}day:\s*isDaily \? FCW\.localDateKey\(FCW\.dailyDate\(board\.no\)\)/.test(game));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
