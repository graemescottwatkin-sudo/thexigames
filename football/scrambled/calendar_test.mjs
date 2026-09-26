/* calendar_test.mjs — every board sits on its own day, whatever the device's
 * clock says.
 *
 *   npm install -D jsdom --no-save
 *   node football/scrambled/calendar_test.mjs        (from the repo root)
 *
 * The server numbers the boards; the page draws them on a calendar and names
 * the day in the top bar. It used to do that by counting back from the
 * DEVICE's UTC date — board #N on (device today - (server today - N)) — so the
 * two clocks had to agree on what day it was. They disagree whenever a tab
 * stays open across UTC midnight (one in the morning in a British summer) and
 * whenever a phone's clock is wrong, and then every board slid a day: the
 * calendar put each score on the wrong date, and the bar named the wrong day.
 *
 * So the SERVER's clock and the DEVICE's clock are set separately here — the
 * handlers run in Node's realm and read its Date, the page runs in jsdom's
 * and reads the window's — and the answer is always the server's own
 * dailyDayKey. Vowels XI is generated from this page, so its copy is asked
 * the same question through its own index.html.
 */
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { onRequestGet as dailyGet } from "../../functions/api/scrambled/daily.js";
import { dailyDayKey } from "../../functions/_lib/daily.js";

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}
const settle = async (n = 20) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

const HOUR = 3600000, DAY = 24 * HOUR;
/* THE SERVER'S DAY IS DERIVED FROM DAY ONE, not written down: noon on board
   #9's day, so boards 1..9 all fall in one month and the calendar shows them
   all on the first page. */
const DAY_ONE = Date.parse(dailyDayKey(1) + "T00:00:00Z");
const TODAY_NO = 9;
const NOON = DAY_ONE + (TODAY_NO - 1) * DAY + 12 * HOUR;

const realNow = Date.now;
let serverNow = NOON;
Date.now = () => serverNow;   // what the handlers' dailyNumber() reads

/* The game's own three scripts, from the page's own <script> tags: Vowels
   loads Scrambled's config and scoring and its own game.js, and a list
   written here would test whichever files it named. */
function ownScripts(game) {
  const html = fs.readFileSync(`football/${game}/index.html`, "utf8");
  return ["config.js", "scoring.js", "game.js"].map((name) => {
    const src = [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)/g)].map((m) => m[1])
      .filter((s) => s.endsWith("/" + name));
    if (src.length !== 1) throw new Error(`${game}: ${src.length} scripts named ${name}`);
    return src[0].startsWith("/") ? src[0].slice(1) : `football/${game}/${src[0]}`;
  });
}

/* Open the page at board `no` with the device clock at `device`, then — if
   asked — let both clocks run on by `later` before the archive is opened, the
   way a tab left open does. Returns what the page drew. */
async function visit(game, { device, server = NOON, later = 0, no = 1 }) {
  serverNow = server;
  const dom = new JSDOM(fs.readFileSync(`football/${game}/index.html`, "utf8"), {
    url: `http://localhost/football/${game}/?no=${no}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  let deviceNow = device;
  const Real = window.Date;
  class DeviceDate extends Real {
    constructor(...a) { if (a.length) super(...a); else super(deviceNow); }
    static now() { return deviceNow; }
  }
  window.Date = DeviceDate;
  window.fetch = async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/scrambled/daily") return dailyGet({ request: new Request(url.href, init) });
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  };
  window.Request = Request;
  window.Response = Response;
  const bar = [];
  window.XIBar = { mount() {}, set(p) { if (p && "day" in p) bar.push(p.day); } };
  for (const f of ["shared/xi-plays.js", "shared/xi-keys.js", ...ownScripts(game)]) {
    window.eval(fs.readFileSync(f, "utf8"));
  }
  await settle();
  deviceNow += later;
  serverNow += later;
  window.document.getElementById("homePrevious").click();
  await settle(4);
  const doc = window.document;
  const [mName, y] = doc.getElementById("calMonth").textContent.split(" ");
  const m = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"].indexOf(mName);
  const cells = {};
  for (const b of doc.querySelectorAll("#calGrid button")) {
    const d = Number(b.querySelector("span").textContent);
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (b.dataset.no) cells[key] = Number(b.dataset.no);
  }
  window.close();
  return { cells, bar };
}

/* The fixture must be real: board #N must be served for this suite to mean
   anything, and a page that drew no calendar would agree with everything. */
function judge(label, { cells, bar }, barNo) {
  const want = {};
  for (let n = 1; n <= TODAY_NO; n++) want[dailyDayKey(n)] = n;
  const wrong = [];
  for (const [k, n] of Object.entries(want)) if (cells[k] !== n) wrong.push(`${k} should be #${n}, is ${cells[k] ? "#" + cells[k] : "empty"}`);
  for (const [k, n] of Object.entries(cells)) if (want[k] !== n) wrong.push(`#${n} drawn on ${k}`);
  t(`${label}: the calendar puts boards 1..${TODAY_NO} each on its own day, and nothing else`,
    Object.keys(cells).length > 0 && !wrong.length,
    wrong.slice(0, 3).join("; ") || `${Object.keys(cells).length} boards, ${dailyDayKey(1)} to ${dailyDayKey(TODAY_NO)}`);
  const last = bar[bar.length - 1];
  t(`${label}: the top bar names board #${barNo}'s own day`, last === dailyDayKey(barNo),
    `bar ${last}, server ${dailyDayKey(barNo)}`);
}

for (const game of ["scrambled", "vowels"]) {
  console.log(`\n=== ${game} ===`);
  /* The control: both clocks agree. This passed before the fix too, and a
     suite whose failing cases were the only ones it had would not show that
     the page CAN be right. */
  judge(`${game}, clocks agree`, await visit(game, { device: NOON }), 1);
  judge(`${game}, clocks agree, today's board`, await visit(game, { device: NOON, no: TODAY_NO }), TODAY_NO);
  /* A phone half a day fast and half a day slow: across UTC midnight either
     way, on the same server day. */
  judge(`${game}, device 13h fast`, await visit(game, { device: NOON + 13 * HOUR }), 1);
  judge(`${game}, device 13h slow`, await visit(game, { device: NOON - 13 * HOUR, no: 4 }), 4);
  /* THE ONE THAT NEEDS NO WRONG CLOCK. Loaded at 23:50 UTC with both clocks
     right; the archive opened twenty minutes later, after UTC midnight,
     without a reload. The page's today is still the board it was given, and
     every date must still be that board's. */
  const late = DAY_ONE + TODAY_NO * DAY - 10 * 60000;
  judge(`${game}, tab left open across UTC midnight`,
    await visit(game, { device: late, server: late, later: 20 * 60000 }), 1);
}

Date.now = realNow;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
