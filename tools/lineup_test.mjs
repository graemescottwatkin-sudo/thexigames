/* tools/lineup_test.mjs — the hub's daily feature rotation.
 *
 *   node tools/lineup_test.mjs
 *
 * WHY THIS EXISTS. The front door features two of the ten games and which two
 * is a property of the PUZZLE DATE. That sentence has two ways to be quietly
 * wrong and neither shows on the page:
 *
 *   - a game could be featured AND still listed among the compact eight, so it
 *     appears twice and another appears not at all. Nothing on screen says so;
 *     you would have to count ten cards by eye, every day.
 *   - the pair could be derived from the DEVICE clock rather than the board
 *     day, and every check run in Britain would pass while a player in
 *     Auckland saw tomorrow's pair. This site has already shipped that exact
 *     fault once — the hub named "Tuesday 8 September" while the crossword
 *     said Monday, because the date came from the device.
 *
 * So this runs the REAL page, in jsdom, with /api/daily stubbed to a day of
 * this suite's choosing, and reads the DOM that results. It does not
 * re-implement the rotation: a test that re-implements the rule it is checking
 * agrees with itself and proves nothing. CLAUDE.md: "Regexes cannot count and
 * cannot catch rule-bugs. Anything about ordering must EXECUTE the real code."
 *
 * THE DAY IS HANDED TO BOTH SIDES rather than computed twice. Every case here
 * names an ISO day as a fixture and the page is told that day; nothing in this
 * file asks what day it is today, so the suite cannot disagree with itself
 * across a midnight — the rule the clock-sensitive suites in this repo already
 * follow.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* THE CYCLE AND ITS EPOCH ARE READ FROM THE PAGE, not restated here. They were
   restated, and when the family reset to day 1 on 18 September 2026 and the
   owner asked for QuickFire to lead instead of Wordsearch, five assertions went
   red for a change they were never about — each one naming a pair that was
   simply no longer the pair. A suite that has to be edited every time an
   editorial decision changes is a suite that eventually gets edited into
   agreeing with a broken rotation.
   What is PINNED below is the one thing that is a decision rather than a
   derivation: day 0 is QuickFire and HiLo, because that is what the owner asked
   for on launch day. Everything else is computed, so it follows the page. */
const HUB = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const SPEC_EPOCH = (HUB.match(/FEATURE_EPOCH = "([0-9-]+)"/) || [])[1];
const SPEC_CYCLE = [...(HUB.match(/FEATURE_CYCLE = \[([\s\S]*?)\];/) || [, ""])[1]
  .matchAll(/\["([a-z]+)",\s*"([a-z]+)"\]/g)].map((m) => [m[1], m[2]]);
const DAY_MS = 86400000;
function pairFor(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const [ey, em, ed] = SPEC_EPOCH.split("-").map(Number);
  const n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ey, em - 1, ed)) / DAY_MS);
  return SPEC_CYCLE[((n % SPEC_CYCLE.length) + SPEC_CYCLE.length) % SPEC_CYCLE.length];
}
const dayAfter = (iso, k) => new Date(Date.parse(iso + "T00:00:00Z") + k * DAY_MS)
  .toISOString().slice(0, 10);

let pass = 0, fail = 0;
const t = (name, ok, note) => {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`  !!  ${name}${note ? "  — " + note : ""}`); }
};

/* The page as a player gets it, with the server answering one chosen day.
   Every other call it makes answers 204, so a game's "played today" probe
   cannot throw and cannot be mistaken for the daily. */
async function pageOn(day) {
  const dom = new JSDOM(HTML, {
    runScripts: "dangerously",
    url: "https://www.thexigames.com/",
    pretendToBeVisual: true,
    beforeParse(win) {
      win.fetch = (u) => {
        const url = String(u);
        if (url.indexOf("/api/daily") === 0 || url.indexOf("/api/daily") > -1) {
          return Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve({ day, dailyNo: 23 }),
          });
        }
        return Promise.resolve({ ok: false, status: 204, json: () => Promise.resolve(null) });
      };
      /* localStorage is where the played-today state is read from; an empty one
         is a player who has played nothing, which is the state under test. */
      win.matchMedia = win.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));
    },
  });
  /* Let the stubbed promise chain settle. Two turns: the fetch resolves on one
     and the .then that writes the DOM runs on the next. */
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const d = dom.window.document;
  const cards = [...d.querySelectorAll("#lineup .gcard")];
  return {
    dom,
    ids: cards.map((c) => c.getAttribute("data-game")),
    /* IN PICK ORDER, NOT DOM ORDER. The markup stays in shirt order on purpose,
       so collecting the featured cards by document position puts HiLo (shirt 4)
       before QuickFire (shirt 8) whatever the rotation chose — which made the
       hero, that opens the FIRST PICKED game, look like it disagreed with its
       own pair. `order` is what the page sets to express the choice, so it is
       what this reads. */
    lead: cards.filter((c) => c.classList.contains("lead"))
      .sort((a, b) => Number(a.style.order || 0) - Number(b.style.order || 0))
      .map((c) => c.getAttribute("data-game")),
    /* Visual order, which is what a player actually reads: `order` decides it,
       and the DOM stays in shirt order on purpose. */
    shown: cards
      .map((c) => ({ id: c.getAttribute("data-game"), o: Number(c.style.order || 0) }))
      .sort((a, b) => a.o - b.o)
      .map((x) => x.id),
    heroHref: (d.getElementById("heroGo") || {}).getAttribute?.("href") || null,
    heroLabel: (d.getElementById("heroGoLabel") || {}).textContent || null,
    lineDate: (d.getElementById("lineDate") || {}).textContent || null,
    coverDay: (d.getElementById("coverDay") || {}).textContent || null,
  };
}

console.log("The markup is complete before any of this runs");
{
  const d = new JSDOM(HTML).window.document;
  const cards = [...d.querySelectorAll("#lineup .gcard")];
  t("ten cards are in the file, not built by script", cards.length === 10, cards.length + " cards");
  /* THE NO-SCRIPT PAGE IS NOT A BROKEN PAGE. Without JavaScript nothing is
     featured, and that must still be ten games in shirt order with live links
     rather than an empty grid. */
  t("none is featured until the day is known",
    cards.every((c) => !c.classList.contains("lead")));
  t("they are in shirt order in the markup",
    cards.map((c) => c.querySelector(".gcard-num").textContent.trim()).join(",") ===
    "1,2,3,4,5,6,7,8,9,10");
  const bad = cards.filter((c) => {
    const id = c.getAttribute("data-game");
    return ![...c.querySelectorAll("a[href]")].every((a) =>
      a.getAttribute("href").indexOf("/football/" + id + "/") === 0);
  });
  t("every link on a card goes to that card's own game", bad.length === 0,
    bad.length ? bad.map((c) => c.getAttribute("data-game")).join(", ") : "10 cards");
  /* The brief asks for keyboard-reachable cards. The art is deliberately NOT
     reachable — it duplicates the title's destination — so the count is the
     title, the play link and the archive link. */
  const reach = cards.map((c) =>
    [...c.querySelectorAll("a[href]")].filter((a) => a.getAttribute("tabindex") !== "-1").length);
  t("each card offers three keyboard destinations", reach.every((n) => n === 3),
    reach.join(","));
}

console.log("\nTHE CASE IT EXISTS FOR: every game appears exactly once, every day");
{
  /* Fifteen consecutive days — three full turns of the five-day cycle — so a
     pair that repeats early, a game that is never featured, and an index that
     drifts by one per cycle all show up here rather than in a month's time. */
  const seen = Object.create(null);
  let dupes = [], missing = [], wrongCount = [], leadsFirst = [];
  for (let i = 0; i < 15; i++) {
    const day = new Date(Date.UTC(2026, 8, 17 + i)).toISOString().slice(0, 10);
    const r = await pageOn(day);
    const set = new Set(r.shown);
    if (set.size !== r.shown.length) dupes.push(day);
    if (r.shown.length !== 10) missing.push(day + " has " + r.shown.length);
    if (r.lead.length !== 2) wrongCount.push(day + " featured " + r.lead.length);
    if (r.shown.slice(0, 2).sort().join(",") !== r.lead.slice().sort().join(","))
      leadsFirst.push(day + ": reads " + r.shown.slice(0, 2).join("+") +
                      " but features " + r.lead.join("+"));
    r.lead.forEach((id) => { seen[id] = (seen[id] || 0) + 1; });
  }
  t("no game is ever shown twice on one day", dupes.length === 0, dupes.join(", ") || "15 days");
  t("all ten are shown every day", missing.length === 0, missing.join(", ") || "15 days");
  t("exactly two are featured every day", wrongCount.length === 0,
    wrongCount.join(", ") || "15 days");
  /* AND THE FEATURED PAIR IS WHAT A PLAYER READS FIRST. Featuring is a CSS
     `order`, so a card can carry .lead — bigger art, bigger title — and still
     sit in the middle of the grid. Counting the cards does not see that: this
     check passed with the `order` assignment deleted, because the right two
     were still marked and all ten were still present. */
  t("the featured pair leads the page a player actually reads", leadsFirst.length === 0,
    leadsFirst.join(", ") || "15 days");
  const names = Object.keys(seen).sort();
  t("across three cycles every game is featured, and equally often",
    names.length === 10 && names.every((k) => seen[k] === 3),
    names.map((k) => k + ":" + seen[k]).join(" "));
}

console.log("\nThe pair is the board day's, and only the board day's");
{
  const a = await pageOn(SPEC_EPOCH);
  const b = await pageOn(SPEC_EPOCH);
  t("the same day gives the same pair", a.lead.join(",") === b.lead.join(","), a.lead.join(" + "));
  t("day 0 of the cycle is the documented pair",
    a.lead.join(",") === "quickfire,hilo", a.lead.join(" + "));
  const next = await pageOn(dayAfter(SPEC_EPOCH, 1));
  t("the next board day gives a different pair",
    next.lead.join(",") !== a.lead.join(","), next.lead.join(" + "));
  const roundTrip = await pageOn(dayAfter(SPEC_EPOCH, SPEC_CYCLE.length));
  t("five days on, the cycle comes back round",
    roundTrip.lead.join(",") === a.lead.join(","), roundTrip.lead.join(" + "));
  /* MIDNIGHT IS THE POINT. 23:59:59 on the 17th and 00:00:01 on the 18th are
     the same two ISO days the server would send, so the pair must flip exactly
     there and nowhere else — and it must flip for everyone at the same instant
     because the day came from the server, not from a clock in a timezone. */
  t("the change happens at the board rollover, not at a local midnight",
    (await pageOn(SPEC_EPOCH)).lead.join(",") === pairFor(SPEC_EPOCH).join(",") &&
    (await pageOn(dayAfter(SPEC_EPOCH, 1))).lead.join(",") === pairFor(dayAfter(SPEC_EPOCH, 1)).join(","));
  /* A DAY BEFORE THE EPOCH. JavaScript's % returns a negative for a negative
     operand, so an unguarded index reaches FEATURE_CYCLE[-2], throws, and the
     throw is swallowed by the catch around this call — leaving the page showing
     the pair it computed from the DEVICE's day.
     COUNTING TWO FEATURED CARDS DOES NOT CATCH THAT, and this check did exactly
     that on its first draft: it passed with the guard deleted, because two
     cards were still featured — the wrong two. So it names the pair. */
  t("a board day before the epoch features THAT day's pair, not the device's",
    (await pageOn(dayAfter(SPEC_EPOCH, -3))).lead.join(",") === pairFor(dayAfter(SPEC_EPOCH, -3)).join(","));
  t("and so does one years before it",
    (await pageOn("2020-01-01")).lead.join(",") === pairFor("2020-01-01").join(","));
}

console.log("\nThe hero opens the game it names");
{
  for (const day of [0, 1, 2, 3, 4].map((k) => dayAfter(SPEC_EPOCH, k))) {
    const r = await pageOn(day);
    const first = r.lead[0];
    /* BOTH HALVES, AND THE LABEL IS TAKEN FROM THE CARD RATHER THAN FROM A
       TABLE HERE. A name written down in this file would be a second place a
       game is named, and it would keep passing after the card was renamed —
       which is the drift these suites exist to catch, not to enshrine.
       This assertion was `A && B || A` on its first draft, which collapses to
       A: the href was checked and the label was not, under a name that claimed
       both. A check's name must not be broader than its behaviour. */
    const card = r.dom.window.document.querySelector(`.gcard[data-game="${first}"]`);
    const expect = "Start with " + card.querySelector(".gcard-title").textContent.replace(/\s*XI$/, "");
    t(`${day}: names and opens the same game`,
      r.heroHref === `/football/${first}/?play=1` && r.heroLabel === expect,
      `${r.heroLabel} -> ${r.heroHref}`);
  }
}

console.log("\nThe date on the page is the board's date");
{
  const r = await pageOn("2026-12-25");
  t("the line-up's date follows the server's day", /25/.test(r.lineDate) && /DEC/.test(r.lineDate),
    r.lineDate);
  t("the cover's stamp follows it too", r.coverDay === "25", r.coverDay);
}

console.log("\n=== The strip earns its colour ===");
{
  /* EVERY SHIRT WORE ITS KIT FROM THE MOMENT THE PAGE LOADED, so ten colours
     said nothing about what the player had done — the two games finished today
     looked much like the eight that had not. Colour is what a FINISHED board
     pays out now, and the strip fills in as the day goes on.
     THE KIT TRAVELS AS --kit, NOT AS A BACKGROUND. Inline `background:` beats
     every class rule underneath it and could only have been overridden with
     !important, so an inline background on a dot is the fault returning
     whatever the stylesheet says. */
  const d = new JSDOM(HTML).window.document;
  const dots = [...d.querySelectorAll(".shirt .dot")];
  t("every shirt's dot carries its kit as a custom property",
    dots.length === 10 && dots.every((el) =>
      /--kit:\s*var\(--kit-\d\d\)/.test(el.getAttribute("style") || "")),
    `${dots.length} dots`);
  t("and none of them paints itself unconditionally",
    dots.every((el) => !/background\s*:/.test(el.getAttribute("style") || "")),
    "an inline background cannot be undone by a class");
  /* AND THE STYLESHEET GIVES THE COLOUR ONLY TO A FINISHED SHIRT. Asserted on
     the rule rather than on a rendered colour, because jsdom does not resolve
     custom properties through a cascade — what can be proved here is which
     selector the payout hangs off, and that is the thing that would regress. */
  const paints = HUB.match(/\.shirt\.done\s+\.dot\s*\{[^}]*\}/);
  t("the kit is paid out to a played shirt and to no other",
    !!paints && /background\s*:\s*var\(--kit\)/.test(paints[0]),
    paints ? paints[0].replace(/\s+/g, " ") : "no .shirt.done .dot rule at all");
  t("and an unplayed dot has a neutral fill of its own",
    /\.shirt \.dot\{[^}]*background:var\(--ed-rule\)/.test(HUB.split(String.fromCharCode(10)).join("")),
    "otherwise an unplayed shirt is a hole in the strip");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
