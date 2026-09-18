/* tools/autoplay_test.mjs — ?play=1 must start the game, and start it ONCE.
 *
 *   node tools/autoplay_test.mjs
 *
 * WHY THIS EXISTS. The hub's ten cards link to /football/<game>/?play=1, and
 * autoPlay() in shared/xi-chrome.js is what turns that into a started board.
 * It has two opposite ways to fail and only one of them is visible:
 *
 *   IT CLICKED TOO EARLY AND CALLED THAT SUCCESS. A control is rendered before
 *   its game binds a handler to it, so the click landed on nothing. Measured
 *   live on 18 September 2026: FOUR of the ten games — wordsearch, hilo,
 *   codeword, whoami — never started from the hub, while a click by hand on the
 *   same button started them every time. Nothing caught it because a check that
 *   asks "did we click" gets yes. The action was attempted, not effective.
 *
 *   AND THE OBVIOUS REPAIR IS WORSE. Retrying until the control disappears
 *   posts the start three or four times on any game that starts through a
 *   network round trip, because the button is still on screen while the
 *   request is in flight. "Spent two of today's allowance" cannot be undone by
 *   the player; "did not start" is fixed by pressing the button.
 *
 * So the loop is extracted from the real file and run against three worlds:
 * a handler that binds late, a start that takes a round trip, and a game with
 * no control at all. It is the TIMING that is under test, so time is a counter
 * here rather than a clock — a suite that waits for real milliseconds is a
 * suite that is flaky on a loaded machine.
 *
 * IT READS THE SHIPPED LOOP rather than a copy. If somebody rewrites autoPlay
 * and the anchor stops matching, this fails loudly instead of testing a
 * fossil of the code it was written against.
 */
import fs from "node:fs";
const src = fs.readFileSync("shared/xi-chrome.js", "utf8");
const m = src.match(/var tries = 0, clicks = 0, sinceClick = 0, seen = false;[\s\S]*?\}\)\(\);/);
if (!m) { console.log("FAIL  could not find the loop"); process.exit(1); }

function run(world) {
  let now = 0; const timers = [];
  const setTimeout_ = (fn, ms) => timers.push({ at: now + ms, fn });
  const el = world.el;
  const document = { querySelector: () => (world.present() ? el : null) };
  const body = m[0]
    .replace(/setTimeout\(look, 100\)/g, "setTimeout_(look, 100)");
  new Function("document", "setTimeout_", body)(document, setTimeout_);
  for (let step = 0; step < 200 && timers.length; step++) {
    timers.sort((a, b) => a.at - b.at);
    const t = timers.shift(); now = t.at; t.fn();
  }
  return { clicks: world.clicks(), started: world.started() };
}

let pass = 0, fail = 0;
const t = (n, ok, note) => { ok ? pass++ : fail++; console.log((ok ? "  ok  " : "FAIL  ") + n + (note ? "  — " + note : "")); };

// 1. Handler binds late: the first click does nothing, a later one works.
{
  let clicks = 0, started = false, bound = false, tick = 0;
  const el = { hidden: false, offsetParent: {}, disabled: false,
    click() { clicks++; if (bound) { started = true; el.offsetParent = null; } } };
  const w = { el, present: () => { if (++tick > 12) bound = true; return true; },
              clicks: () => clicks, started: () => started };
  const r = run(w);
  t("a control that binds its handler late is still started", r.started, r.clicks + " click(s)");
  t("and it is not hammered to do it", r.clicks <= 3, r.clicks + " click(s)");
}
// 2. Start goes through a round trip: control lingers ~600ms after one good click.
{
  let clicks = 0, resolveAt = null, tick = 0;
  const el = { hidden: false, offsetParent: {}, disabled: false,
    click() { clicks++; if (resolveAt === null) resolveAt = tick + 6; } };
  const w = { el, present: () => { tick++; if (resolveAt !== null && tick >= resolveAt) el.offsetParent = null; return true; },
              clicks: () => clicks, started: () => el.offsetParent === null };
  const r = run(w);
  t("THE CASE THAT MATTERS: a slow start is clicked ONCE, not repeatedly",
    r.clicks === 1 && r.started, r.clicks + " click(s)");
}
// 2b. THE ONE MY FIRST FIX BROKE. QuickFire, Scrambled and Vowels ship their
//      start screen with `hidden` and reveal it only when the board fetch
//      resolves. A loop that reads "not visible" as "started" returns on its
//      first look and never clicks. None of the worlds above had a control that
//      begins HIDDEN and becomes visible, which is why they all passed while
//      Play today was dead on three games.
{
  let clicks = 0, tick = 0;
  const el = { hidden: true, offsetParent: null, disabled: false,
    click() { clicks++; el.hidden = true; el.offsetParent = null; } };
  const w = { el,
    present: () => { if (++tick === 8) { el.hidden = false; el.offsetParent = {}; } return true; },
    clicks: () => clicks, started: () => clicks > 0 };
  const r = run(w);
  t("a start screen that is hidden until its board lands is still started",
    r.started, r.clicks + " click(s) after the cover was drawn");
}
// 3. No control at all (Grid): returns without clicking anything.
{
  const w = { el: null, present: () => false, clicks: () => 0, started: () => false };
  const r = run(w);
  t("a game with no start control is left alone", r.clicks === 0);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
