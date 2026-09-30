/* friends/whoami/journey_test.mjs — the Friends Who Am I page, played through,
 * against the REAL server code.
 *
 *   npm install -D jsdom --no-save
 *   node friends/whoami/journey_test.mjs      (from the repo root)
 *
 * WHY THIS EXISTS. The page is generated from football's. A review on
 * 22 September 2026 found the round screen could not show a Friends clue at
 * all: the clue text the server sends was read in ZERO places, the page drew
 * football's spell ("I played for / left in undefined"), ran a 90-minute clock,
 * listened for a verdict this server never sends, lost bought clues on a
 * reload, and searched the SECOND LETTER of every name in the type-ahead. The
 * gate passed, the server suite passed — because nothing ran this CLIENT
 * against this SERVER. This does.
 *
 * THE PAYLOADS ARE THE PRODUCER'S, NOT HAND-WRITTEN. Football's journey test
 * stubs each response by hand, and a hand-written fixture only confirms the
 * assumption that wrote it. Here the page's fetch is routed into the actual
 * handlers in functions/_lib/wa-endpoints.js, with only the DATABASE stubbed —
 * so a field the server renames, drops or reshapes reaches the page exactly as
 * it would in production. The stub matches the real SQL by shape and re-applies
 * each rule in JS rather than rubber-stamping.
 *
 * ONE READING OF THE DAY, handed to both sides: the fixture board is dealt on
 * whatever the server's own today() says, so the page and the server agree by
 * construction rather than by the suite guessing the date.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import * as E from "../../functions/_lib/wa-endpoints.js";
import { today, fold } from "../../functions/_lib/wadata.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const game = fs.readFileSync(path.join(DIR, "js", "game.js"), "utf8");
const config = fs.readFileSync(path.join(DIR, "js", "config.js"), "utf8");
/* THE FAMILY'S FULL TIME, the real file (shared/xi-fulltime.js). */
const fulltime = fs.readFileSync(path.join(DIR, "..", "..", "shared", "xi-fulltime.js"), "utf8");

let pass = 0, fail = 0;
const t = (n, ok, d) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`);
};

const DAY = today();

/* ---- the deck, as migration 044's tables hold it ------------------------- */

/* FIVE CARDS, as a day deals them since 28 Sep 2026 (the owner's ruling: five
   cards a day, played in order, all counting). */
const CARDS = [
  { id: "main-07", name: "Rachel Green", deck: "main", section: "Loves & Exes", depth: 12, rounds: 4 },
  { id: "main-01", name: "Monica Geller", deck: "main", section: "Family & Relatives", depth: 12, rounds: 4 },
  { id: "exp-03", name: "Gunther", deck: "expert", section: "Jobs & Ambitions", depth: 6, rounds: 2 },
  { id: "exp-09", name: "Janice", deck: "expert", section: "Guest Stars", depth: 6, rounds: 2 },
  { id: "main-05", name: "Phoebe Buffay", deck: "main", section: "The Main Six", depth: 6, rounds: 2 },
];
/* THE DOORS ARE DAILIES, so their letters are DAILY letters — rounds of the
   card's verified subset, from fr_wa_daily_clue — not full-card letters. */
const DOORS = CARDS.map((c, i) => ({ play_date: DAY, slot: i + 1, card_id: c.id, round_letter: "A" }));
/* CARD 1's FULL CARD, as fr_wa_clue holds it: twelve clues, full-card letters
   by stride 4. Only n = 2, 6 and 10 are verified, and they form daily round A.
   n = 1 is ALSO letter A step 1 — on the FULL card — and it is NOT verified.
   That collision is deliberate: a server that read fr_wa_clue by the daily
   letter would serve n = 1, and the assertions below would catch it. */
const CLUE_TEXT = [
  "I once got a job I was wildly underqualified for, and I kept it.",
  "My father is a doctor with strong opinions about who I marry.",
  "I left a man at the altar and walked into a coffee house in a wedding dress.",
];
const UNVERIFIED = "Everybody says I was the prettiest girl at school.";
const FULL = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  const text = n === 2 ? CLUE_TEXT[0] : n === 6 ? CLUE_TEXT[1] : n === 10 ? CLUE_TEXT[2]
             : n === 1 ? UNVERIFIED : "Filler clue " + n + ".";
  return { card_id: "main-07", n, round_letter: "ABCD"[i % 4], step: Math.floor(i / 4) + 1, text,
           vs: n === 2 ? "ep" : n === 6 ? "trait" : n === 10 ? "cast" : "none",
           ep: n === 2 ? "S1E01" : null };
});
/* THE OTHER FOUR: three verified clues each, n 1 to 3, round A. */
const OTHERS = CARDS.slice(1).flatMap((c) => [1, 2, 3].map((n) => ({
  card_id: c.id, n, round_letter: "A", step: n, text: "Clue " + n + " about card " + c.id + ".",
  vs: "ep", ep: "S2E0" + n })));
const CLUES = FULL.concat(OTHERS);
const DAILY = [
  { card_id: "main-07", round_letter: "A", step: 1, n: 2 },
  { card_id: "main-07", round_letter: "A", step: 2, n: 6 },
  { card_id: "main-07", round_letter: "A", step: 3, n: 10 },
].concat(OTHERS.map((c) => ({ card_id: c.card_id, round_letter: "A", step: c.n, n: c.n })));
/* WHERE THE CLUES CAME FROM, as migration 049's fr_wa_source holds it (the
   owner, 29 Sep 2026: "Yes show the source after the round"). Card one's three
   daily clues cite a script line, a published page and a named article; card
   two's second and third clues have sources too, and card two is solved on its
   first clue -- so they must never reach the page. */
const SOURCES = [
  { card_id: "main-07", n: 2, seq: 1, kind: "script", ep: "0101", line: 12, url: null, name: null,
    quote: "Rachel: Oh, I just had to get out of there." },
  { card_id: "main-07", n: 6, seq: 1, kind: "web", ep: null, line: null,
    url: "https://en.wikipedia.org/wiki/Rachel_Green", name: null, quote: "Her father is a wealthy doctor." },
  { card_id: "main-07", n: 10, seq: 1, kind: "article", ep: null, line: null,
    url: "https://www.digitalspy.com/tv/x/", name: "Digital Spy: the ranking", quote: null },
  { card_id: "main-01", n: 1, seq: 1, kind: "script", ep: "0302", line: 1, url: null, name: null,
    quote: "Monica: The line card two's first clue rests on." },
  { card_id: "main-01", n: 2, seq: 1, kind: "script", ep: "0302", line: 3, url: null, name: null,
    quote: "UNSEEN SOURCE FOR CARD TWO" },
];

const ANSWERS = [
  { card_id: "main-07", answer: fold("Rachel Green"), kind: "accept" },
  { card_id: "main-07", answer: fold("Rachel"), kind: "accept" },
  { card_id: "main-01", answer: fold("Monica Geller"), kind: "accept" },
  { card_id: "exp-03", answer: fold("Gunther"), kind: "accept" },
  { card_id: "exp-09", answer: fold("Janice"), kind: "accept" },
  { card_id: "main-05", answer: fold("Phoebe Buffay"), kind: "accept" },
  /* ONE WORD, TWO CARDS: the ambiguous verdict. */
  { card_id: "main-07", answer: fold("Apartment"), kind: "suggest" },
  { card_id: "main-01", answer: fold("Apartment"), kind: "suggest" },
];

/* ---- a D1 that answers the real SQL by shape ---------------------------- */

const sourceReads = [];

function makeDB() {
  const rounds = new Map();
  const guesses = new Map();       // play_id -> [{ n, guess, verdict, at }]
  const card = (id) => CARDS.find((c) => c.id === id);
  const q = (sql) => sql.replace(/\s+/g, " ").trim();

  const run = (sql, a) => {
    if (/^SELECT d\.slot, d\.round_letter, c\.section, c\.deck, c\.id AS card_id FROM fr_wa_board/.test(sql)) {
      return DOORS.filter((d) => d.play_date === a[0])
        .map((d) => ({ slot: d.slot, round_letter: d.round_letter,
                       section: card(d.card_id).section, deck: card(d.card_id).deck,
                       card_id: d.card_id }))
        .sort((x, y) => x.slot - y.slot);
    }
    if (/^SELECT d\.slot, d\.round_letter, c\.id AS card_id, c\.name/.test(sql)) {
      const d = DOORS.find((x) => x.play_date === a[0] && x.slot === Number(a[1]));
      if (!d) return [];
      const c = card(d.card_id);
      return [{ slot: d.slot, round_letter: d.round_letter, card_id: c.id, name: c.name,
                section: c.section, deck: c.deck, depth: c.depth, rounds: c.rounds }];
    }
    if (/^SELECT c\.n, d\.step, c\.text, c\.vs, c\.ep FROM fr_wa_daily_clue d JOIN fr_wa_clue c ON c\.card_id = d\.card_id AND c\.n = d\.n/.test(sql)) {
      /* THE JOIN, re-applied in JS: the daily row picks n, the full card
         supplies the sentence. */
      const d = DAILY.find((x) => x.card_id === a[0] && x.round_letter === a[1] && x.step === Number(a[2]));
      if (!d) return [];
      const c = CLUES.find((x) => x.card_id === d.card_id && x.n === d.n);
      return c ? [{ n: c.n, step: d.step, text: c.text, vs: c.vs, ep: c.ep }] : [];
    }
    /* THE SOURCES OF THE CLUES A CLOSED CARD DEALT: the daily round's rows up
       to the stage bound, joined to the sentence, LEFT-joined to citations --
       re-applied in JS, so a clue with none still comes back, once. */
    if (/^SELECT d\.step, c\.text, s\.seq, s\.kind, s\.ep, s\.line, s\.url, s\.name, s\.quote FROM fr_wa_daily_clue d JOIN fr_wa_clue c ON c\.card_id = d\.card_id AND c\.n = d\.n LEFT JOIN fr_wa_source s ON s\.card_id = d\.card_id AND s\.n = d\.n WHERE d\.card_id = \?1 AND d\.round_letter = \?2 AND d\.step <= \?3/.test(sql)) {
      sourceReads.push(a.slice());
      return DAILY.filter((x) => x.card_id === a[0] && x.round_letter === a[1] && x.step <= Number(a[2]))
        .sort((x, y) => x.step - y.step)
        .flatMap((d) => {
          const c = CLUES.find((x) => x.card_id === d.card_id && x.n === d.n);
          const cites = SOURCES.filter((x) => x.card_id === d.card_id && x.n === d.n).sort((x, y) => x.seq - y.seq);
          const blank = { seq: null, kind: null, ep: null, line: null, url: null, name: null, quote: null };
          return (cites.length ? cites : [blank]).map((s) => ({ step: d.step, text: c.text, ...blank, ...s }));
        });
    }
    if (/^SELECT COUNT\(\*\) AS n FROM fr_wa_daily_clue WHERE card_id/.test(sql)) {
      return [{ n: DAILY.filter((x) => x.card_id === a[0] && x.round_letter === a[1]).length }];
    }
    /* THE FULL CARD'S LETTERS ARE ENDLESS PLAY'S. A daily door that reads them
       has read the wrong table, and it must fail loudly rather than serve an
       unverified clue under a verified round's name. */
    if (/FROM fr_wa_clue WHERE card_id = \?1 AND round_letter/.test(sql)) {
      throw new Error("a daily door read the FULL card's letters: " + sql.slice(0, 80));
    }
    if (/^SELECT a\.card_id, a\.kind, c\.name FROM fr_wa_answer/.test(sql)) {
      return ANSWERS.filter((x) => x.answer === a[0]).map((x) => ({ ...x, name: card(x.card_id).name }));
    }
    if (/^SELECT name FROM fr_wa_card WHERE status = 'published' ORDER BY name/.test(sql)) {
      return CARDS.map((c) => ({ name: c.name })).sort((x, y) => x.name.localeCompare(y.name));
    }
    if (/^SELECT play_date FROM fr_wa_board WHERE play_date = \?/.test(sql)) {
      return DOORS.some((d) => d.play_date === a[0]) ? [{ play_date: a[0] }] : [];
    }
    if (/^SELECT MAX\(play_date\) AS d FROM fr_wa_board/.test(sql)) return [{ d: DAY }];
    if (/^SELECT play_date FROM fr_wa_board WHERE status/.test(sql)) return [{ play_date: DAY }];
    if (/^SELECT \* FROM fr_wa_round WHERE play_id/.test(sql)) {
      const r = rounds.get(a[0]); return r ? [{ ...r }] : [];
    }
    if (/^SELECT COUNT\(\*\) AS n FROM fr_wa_guess WHERE play_id/.test(sql)) {
      return [{ n: (guesses.get(a[0]) || []).length }];
    }
    /* THE RING'S READING: the verdicts in order (wa-play.js tallyOf). */
    if (/^SELECT n, verdict FROM fr_wa_guess WHERE play_id/.test(sql)) {
      return (guesses.get(a[0]) || []).slice().sort((x, y) => x.n - y.n).map((g) => ({ n: g.n, verdict: g.verdict }));
    }
    if (/^SELECT n, guess, verdict FROM fr_wa_guess WHERE play_id/.test(sql)) {
      return (guesses.get(a[0]) || []).slice().sort((x, y) => x.n - y.n);
    }
    /* A TABLE THIS GAME MUST NEVER TOUCH. A query that names football's
       tables is the routing fault separate tables exist to prevent, so it
       throws rather than returning an empty answer that would read as "no
       rows". */
    if (/\bwa_(board|door|round|guess|player)\b/.test(sql)) {
      throw new Error("the Friends page reached a FOOTBALL table: " + sql.slice(0, 80));
    }
    throw new Error("the stub has no answer for: " + sql.slice(0, 100));
  };

  const write = (sql, a) => {
    if (/^INSERT INTO fr_wa_round/.test(sql)) {
      rounds.set(a[0], { play_id: a[0], play_date: a[1], slot: a[2], started_ms: a[3],
                         subs_used: 0, finished: 0, solved: 0, score: null, minute: null });
    } else if (/^UPDATE fr_wa_round SET subs_used/.test(sql)) {
      rounds.get(a[1]).subs_used = a[0];
    } else if (/^UPDATE fr_wa_round SET finished = 1, solved = 1/.test(sql)) {
      Object.assign(rounds.get(a[2]), { finished: 1, solved: 1, score: a[0], minute: a[1] });
    } else if (/^UPDATE fr_wa_round SET finished = 1, solved = 0/.test(sql)) {
      Object.assign(rounds.get(a[1]), { finished: 1, solved: 0, score: 0, minute: a[0] });
    } else if (/^INSERT OR REPLACE INTO fr_wa_guess/.test(sql)) {
      const list = guesses.get(a[0]) || [];
      list.push({ n: a[1], guess: a[2], verdict: a[3], at: a[4] });
      guesses.set(a[0], list);
    } else if (/\bwa_(board|door|round|guess|player)\b/.test(sql)) {
      throw new Error("the Friends page WROTE a football table: " + sql.slice(0, 80));
    } else {
      throw new Error("the stub has no write for: " + sql.slice(0, 100));
    }
    return {};
  };

  return {
    rounds,
    prepare(text) {
      const sql = q(text);
      const stmt = (args) => ({
        all: async () => ({ results: run(sql, args) }),
        first: async () => run(sql, args)[0] || null,
        run: async () => write(sql, args),
      });
      return { bind: (...args) => stmt(args), ...stmt([]) };
    },
  };
}

/* ---- the page, with its fetch routed into the real handlers -------------- */

const HANDLERS = {
  daily: E.dailyHandler, names: E.namesHandler, archive: E.archiveHandler,
  play: E.playHandler, clue: E.clueHandler, guess: E.guessHandler,
  giveup: E.giveupHandler, finish: E.finishHandler,
};

async function open(opts = {}) {
  const DB = opts.db || makeDB();
  const env = { DB };
  const calls = [];
  const dom = new JSDOM(html, {
    url: "https://www.thexigames.com/friends/whoami/",
    runScripts: "outside-only", pretendToBeVisual: true,
  });
  const w = dom.window;
  /* THE PAGE'S OWN PAUSES between cards -- a second and a half to read a
     verdict before the next card comes up -- run at once here. Only the
     page's long waits: anything under a second keeps its time. */
  const realSet = w.setTimeout.bind(w);
  w.setTimeout = (fn, ms, ...rest) => realSet(fn, ms >= 1000 ? 0 : ms, ...rest);
  try { if (!opts.keep) w.localStorage.clear(); } catch (e) {}
  if (opts.keep) for (const [k, v] of Object.entries(opts.keep)) w.localStorage.setItem(k, v);

  w.fetch = async (url, init) => {
    const u = new URL(String(url), "https://www.thexigames.com");
    calls.push(u.pathname);
    const m = /^\/api\/whoami\/whoami_fr\/([a-z]+)$/.exec(u.pathname);
    let res;
    if (m && HANDLERS[m[1]]) {
      const request = new Request(u.toString(), {
        method: init && init.method ? init.method : "GET",
        headers: { "Content-Type": "application/json" },
        body: init && init.body ? init.body : undefined,
      });
      res = await HANDLERS[m[1]]({ request, env, params: { game: "whoami_fr" } }, "whoami_fr");
    } else {
      /* The account and the session: absent, as for a signed-out player. */
      res = new Response(JSON.stringify({ error: "signed out" }), { status: 401 });
    }
    const body = await res.text();
    return { ok: res.ok, status: res.status, json: async () => JSON.parse(body) };
  };
  w.XIPlays = { start() {}, end() {}, active: () => true };
  /* A share sheet that records what it was handed. */
  w.__shared = [];
  Object.defineProperty(w.navigator, "share", { configurable: true,
    value: (o) => { w.__shared.push(o && o.text); return Promise.resolve(); } });

  w.eval(fulltime);
  w.eval(config);
  w.eval(game);
  const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0)); };
  await settle();
  const click = async (el) => { el.dispatchEvent(new w.Event("click", { bubbles: true })); await settle(); };
  const $ = (id) => w.document.getElementById(id);
  const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  /* WHAT A PLAYER COULD READ, anywhere on the page, for the "undefined" and
     football-word sweeps. Hidden screens are excluded: a word on a screen
     nobody can see is not a word anybody read. */
  const readable = () => {
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 1 && (n.hidden || n.tagName === "SCRIPT" || n.tagName === "STYLE")) return;
      if (n.nodeType === 3) out.push(n.nodeValue);
      n.childNodes.forEach(walk);
    };
    walk(w.document.body);
    return out.join(" ").replace(/\s+/g, " ");
  };
  return { w, $, text, click, settle, calls, DB, readable };
}

/* ONE CARD'S GUESS, as a player types it. */
const guess = async (p, name) => {
  p.$("guessInput").value = name;
  p.$("guessInput").dispatchEvent(new p.w.Event("input", { bubbles: true }));
  p.$("guessGo").disabled = false;
  await p.click(p.$("guessGo"));
  await p.settle();
};
/* The clues BOUGHT: the cards still to come are on the stack too, blurred. */
const clueTexts = (p) => [...p.w.document.querySelectorAll("#clueStack .fclue:not(.locked) .fc-text")]
  .map((e) => e.textContent.trim());
const lockedSteps = (p) => [...p.w.document.querySelectorAll("#clueStack .fclue.locked")]
  .map((e) => e.getAttribute("data-locked")).join(",");
const kicker = (p) => p.text(p.w.document.querySelector(".pf-kicker"));
const nextClue = async (p) => { await p.click(p.w.document.querySelector("#ladder .rung-next")); await p.settle(); };
const start = async (p) => { await p.click(p.$("waToday")); await p.click(p.$("playChoice")); await p.settle(); };
/* The day's cards across the top of the round: class and text per chip. */
const strip = (p) => [...p.w.document.querySelectorAll("#frStrip .frs")]
  .map((e) => e.className.replace("frs", "").trim() + ":" + p.text(e.querySelector(".frs-a")));
const flat = (s) => String(s || "").split(" ").join("");

/* ------------------------------------------------------------------------- */

console.log("=== The day is five cards, played in order ===");
{
  const p = await open();
  await p.click(p.$("waToday"));
  const cards = [...p.w.document.querySelectorAll("#doors .door")];
  t("five cards, not eleven and not three", cards.length === 5, String(cards.length));
  t("each card names its section", p.text(cards[0]).includes("Loves & Exes"), p.text(cards[0]));
  t("and never the internal deck name",
    !cards.map(p.text).join(" ").split(" ").some((w) => w === "main" || w === "expert"),
    cards.map(p.text).join(" | "));
  t("nothing is chosen: they are a list, with the first up next",
    p.$("doors").getAttribute("role") === "list" && p.text(cards[0]).includes("Up next") &&
      !p.w.document.querySelector('#doors [role="radio"]'), p.text(cards[0]));
  t("the button says which card it starts", p.text(p.$("commitPick")) === "Card 1 of 5", p.text(p.$("commitPick")));
  t("and it is Start", p.text(p.$("playChoice")).startsWith("Start"), p.text(p.$("playChoice")));
}

console.log("\n=== A card shows its clues ===");
const p = await open();
await start(p);
{
  const shown = clueTexts(p);
  t("THE FIRST CLUE'S TEXT IS ON THE PAGE", shown.length === 1 && shown[0].includes(CLUE_TEXT[0].slice(0, 30)),
    shown.join(" | ") || "no clue drawn");
  t("labelled as clue 1 of 3, the hardest",
    p.text(p.w.document.querySelector("#clueStack .fclue .fc-n")).includes("Clue 1 of 3 · the hardest"));
  t("and marked on record, because its vs is ep", !!p.w.document.querySelector("#clueStack .fclue .fc-src"));
  /* CLUES 2 AND 3 ARE ON THE CARD, BLURRED (the owner, 30 Sep 2026), and
     what is blurred is a stand-in: the page has not been sent them. */
  t("clues 2 and 3 are on the card already, after clue 1, blurred",
    lockedSteps(p) === "2,3" &&
      [...p.w.document.querySelectorAll("#clueStack .fclue.locked .fc-text")].every((e) => e.classList.contains("fc-hid")) &&
      p.w.document.querySelector("#clueStack").lastElementChild.getAttribute("data-locked") === "3", lockedSteps(p) || "none");
  t("and what is blurred is not the clue: neither later clue's text is anywhere in the page",
    !p.w.document.documentElement.outerHTML.includes(CLUE_TEXT[1].slice(0, 30)) &&
      !p.w.document.documentElement.outerHTML.includes(CLUE_TEXT[2].slice(0, 30)));
  t("it is the VERIFIED clue, not the unverified one at the same full-card letter",
    !p.readable().includes(UNVERIFIED));
  t("the card is named as the first of five", kicker(p) === "Card 1 of 5 · Loves & Exes", kicker(p));
  /* THE DAY'S CARDS ACROSS THE TOP (the owner, 30 Sep 2026). */
  t("five cards across the top, the first ringed as the one in play and the rest to come",
    strip(p).join(" | ") === "now:Playing | :? | :? | :? | :?", strip(p).join(" | "));
  t("worth now is eighteen, a card's ceiling", p.text(p.$("worthNow")) === "18", p.text(p.$("worthNow")));
  t("and there is no match clock", !p.readable().includes("Match clock") && !p.readable().includes("90'"));
  const ladder = p.text(p.$("ladder"));
  t("one clue is offered next, costing five",
    ladder.includes("Ask a friend") && ladder.includes("Clue 2 of 3") && ladder.includes("5"), ladder);
  t("and the exit says Tell me", p.text(p.$("giveUp")) === "Tell me", p.text(p.$("giveUp")));
  t("the ring is empty and says what it is for",
    p.text(p.$("tries")).includes("Three wrong names bring out the next clue") &&
      p.$("tries").querySelectorAll(".fr-ring path").length === 3, p.text(p.$("tries")));
}

await nextClue(p);
{
  const shown = clueTexts(p);
  t("buying adds the SECOND clue's text, beneath the first",
    shown.length === 2 && shown[1].includes(CLUE_TEXT[1].slice(0, 30)), shown.join(" | "));
  t("and clue 2's blurred card has become the clue: only clue 3 is still blurred",
    lockedSteps(p) === "3", lockedSteps(p) || "none");
  t("which is NOT marked on record: a trait is not evidence",
    p.w.document.querySelectorAll("#clueStack .fc-src").length === 1);
  t("and the card is now worth thirteen", p.text(p.$("worthNow")) === "13", p.text(p.$("worthNow")));
}

console.log("\n=== The type-ahead finds names ===");
{
  p.$("guessInput").value = "rach";
  p.$("guessInput").dispatchEvent(new p.w.Event("input", { bubbles: true }));
  await p.settle();
  const offered = p.text(p.$("suggest"));
  t("typing 'rach' offers Rachel Green", offered.includes("Rachel Green"), offered || "nothing offered");
  p.$("guessInput").value = "";
}

console.log("\n=== The verdicts, and the ring ===");
{
  await guess(p, "Apartment");
  t("an ambiguous word offers the cards it could mean",
    p.text(p.$("suggest")).includes("Rachel Green") && p.text(p.$("suggest")).includes("Monica Geller"),
    p.text(p.$("suggest")));
  t("and costs nothing: it is a choice offered, not a wrong name",
    p.text(p.$("worthNow")) === "13" && p.text(p.$("tries")).includes("Three wrong names"), p.text(p.$("tries")));
  await guess(p, "Monica Geller");
  t("another card's name is a near miss", p.text(p.$("feedback")).toLowerCase().includes("someone else in the deck"),
    p.text(p.$("feedback")));
  t("and the near miss names nobody", !p.text(p.$("feedback")).includes("Rachel"));
  t("a wrong name costs a point and fills a piece of the ring",
    p.text(p.$("worthNow")) === "12" && p.text(p.$("tries")).startsWith("1 wrong · 2 more") &&
      p.$("tries").querySelectorAll('.fr-ring path[style*="danger"]').length === 1,
    p.text(p.$("worthNow")) + " | " + p.text(p.$("tries")));
  await guess(p, "Joey Tribbiani");
  t("a name that is nobody's is a plain miss, and a second piece",
    p.text(p.$("feedback")).includes("Not them") && p.text(p.$("worthNow")) === "11" &&
      p.text(p.$("tries")).startsWith("2 wrong · 1 more"), p.text(p.$("feedback")) + " | " + p.text(p.$("tries")));
}

console.log("\n=== A reload keeps what was bought ===");
{
  /* THE SAME DATABASE, a fresh page, the device's save carried over — the
     way a returning player's phone would have it. */
  const keep = {};
  for (let i = 0; i < p.w.localStorage.length; i++) {
    const k = p.w.localStorage.key(i);
    keep[k] = p.w.localStorage.getItem(k);
  }
  const back = await open({ db: p.DB, keep });
  await back.click(back.$("waToday"));
  await back.settle();
  const shown = clueTexts(back);
  t("both clues are back, in order",
    shown.length === 2 && shown[0].includes(CLUE_TEXT[0].slice(0, 20)) && shown[1].includes(CLUE_TEXT[1].slice(0, 20)),
    shown.length + " clue(s)");
  t("and the card is still worth eleven, the ring still two full",
    back.text(back.$("worthNow")) === "11" && back.text(back.$("tries")).startsWith("2 wrong"),
    back.text(back.$("worthNow")) + " | " + back.text(back.$("tries")));
}

console.log("\n=== The third wrong name brings the next clue ===");
{
  await guess(p, "Ross Geller");
  const shown = clueTexts(p);
  t("the third clue comes out by itself", shown.length === 3 && shown[2].includes(CLUE_TEXT[2].slice(0, 30)),
    shown.length + " clue(s)");
  t("at its price: 18 - 5 - 5 - 3 wrong = 5", p.text(p.$("worthNow")) === "5", p.text(p.$("worthNow")));
  t("and the ring is empty again, now warning that the card is at stake",
    p.text(p.$("tries")).includes("card is lost"), p.text(p.$("tries")));
  t("the feedback says so", p.text(p.$("feedback")).includes("next clue"), p.text(p.$("feedback")));
}

console.log("\n=== Solving card one moves to card two ===");
{
  await guess(p, "Rachel Green");
  await p.settle();
  t("the next card comes up by itself", kicker(p) === "Card 2 of 5 · Family & Relatives", kicker(p));
  t("card one stays named in the strip, got, and card two is the one ringed",
    strip(p).slice(0, 3).join(" | ") === "got:Rachel Green | now:Playing | :?", strip(p).join(" | "));
  t("with its own first clue, and worth eighteen again",
    clueTexts(p).length === 1 && p.text(p.$("worthNow")) === "18", clueTexts(p).length + " | " + p.text(p.$("worthNow")));
}

console.log("\n=== Cards two to five ===");
{
  await guess(p, "Monica Geller");                      // 18
  await guess(p, "Gunther");                            // 18
  t("card four is up", kicker(p) === "Card 4 of 5 · Guest Stars", kicker(p));
  await nextClue(p);
  await nextClue(p);                                    // 18 - 10 = 8, on the last clue
  await guess(p, "Nobody One");
  await guess(p, "Nobody Two");
  await guess(p, "Nobody Three");                       // the ring on the last clue: lost
  t("a full ring on the last clue loses the card, and says who it was",
    kicker(p) === "Card 5 of 5 · The Main Six" || p.text(p.$("feedback")).includes("It was Janice"),
    kicker(p) + " | " + p.text(p.$("feedback")));
  t("then the fifth card comes up", kicker(p) === "Card 5 of 5 · The Main Six", kicker(p));
  t("and the lost card is in the strip too, named, in the danger colour's class",
    strip(p)[3] === "lost:Janice" && strip(p)[4] === "now:Playing", strip(p).join(" | "));
  await guess(p, "Phoebe Buffay");                      // 18
  await p.settle();
}

console.log("\n=== The day's Full Time ===");
{
  const panel = p.$("ftPanel");
  const done = p.text(panel);
  t("the end card is shown", !p.$("screenDone").hidden);
  /* 5 + 18 + 18 + 0 + 18 = 59, and no bonus: card four was lost. */
  t("the day scores 59 of 100: five cards, no bonus for four of five",
    flat((panel.querySelector(".xft-score") || {}).textContent) === "59/100",
    (panel.querySelector(".xft-score") || {}).textContent);
  const boxes = [...panel.querySelectorAll(".xft-b")].map((b) => b.className.split(" ").pop()).join("");
  t("a box per card, green for got and red for lost", boxes === "gggrg", boxes);
  const help = [...panel.querySelectorAll(".xft-help li")].map((li) => li.textContent).join(" | ");
  t("the help used beside the ring: four extra clues and six wrong names",
    help === "4 extra clues | 6 wrong names", help);
  t("no right-and-wrong count: the boxes are that", !panel.querySelector(".xft-tally"));
  t("four of five got, said", done.includes("4 of 5 got"), done);
  const answers = p.text(panel.querySelector(".xft-answers"));
  t("and who each card was, under the answers", ["Rachel Green", "Monica Geller", "Gunther", "Janice", "Phoebe Buffay"]
    .every((n) => answers.includes(n)), answers);
  t("in this deck's words, not football's", done.includes("That’s a wrap") && !done.toLowerCase().includes("full time"),
    done.slice(0, 60));

  /* WHERE THE CLUES CAME FROM, under the panel and closed until asked for. */
  const src = p.$("frSources");
  t("the sources are there, folded away under Full Time",
    !!src && !src.hidden && src.tagName === "DETAILS" && !src.open &&
      p.text(src.querySelector("summary")) === "Where the clues came from", src ? p.text(src.querySelector("summary")) : "no block");
  const blocks = [...src.querySelectorAll(".frs-card")];
  /* CARDS THREE TO FIVE CITE NOTHING in this fixture, so they draw no block:
     a card with nothing to show is left out rather than shown empty. */
  t("a block per card with a citation, named once it is over, and none for a card without",
    blocks.length === 2 && p.text(blocks[0].querySelector(".frs-who")) === "Rachel Green" &&
      p.text(blocks[1].querySelector(".frs-who")) === "Monica Geller",
    blocks.map((b) => p.text(b.querySelector(".frs-who"))).join(", "));
  const r1 = [...blocks[0].querySelectorAll(".frs-clues > li")];
  t("card one lists the three clues it dealt, in order",
    r1.length === 3 && CLUE_TEXT.every((c, i) => p.text(r1[i].querySelector(".frs-clue")) === c), String(r1.length));
  const s1 = r1[0].querySelector(".frs-src");
  t("a script line reads as its episode and line, with the words",
    p.text(s1).startsWith("Season 1, episode 1, line 12") && p.text(s1).includes("I just had to get out of there"), p.text(s1));
  t("and with no link: the transcripts' host is not on the family's list", !s1.querySelector("a"));
  const a2 = r1[1].querySelector(".frs-src a");
  t("a Wikipedia page is a link that opens apart from the game",
    !!a2 && a2.getAttribute("href") === "https://en.wikipedia.org/wiki/Rachel_Green" &&
      a2.getAttribute("target") === "_blank" && /noopener/.test(a2.getAttribute("rel") || ""), a2 ? a2.outerHTML : "no link");
  t("a named article nobody has approved keeps its name and loses the link",
    p.text(r1[2].querySelector(".frs-src")) === "Digital Spy: the ranking" && !r1[2].querySelector(".frs-src a"));
  const r2 = blocks[1] ? [...blocks[1].querySelectorAll(".frs-clues > li")] : [];
  t("card two was solved on its first clue, so it lists only that one",
    r2.length === 1 && p.text(r2[0].querySelector(".frs-clue")) === "Clue 1 about card main-01.", String(r2.length));
  t("and nothing it never dealt reaches the page",
    !p.readable().includes("UNSEEN SOURCE") && !p.readable().includes("Clue 2 about card main-01"));
  t("the server was asked for each card's sources once, at its close, bounded by its stage",
    sourceReads.length >= 5 && sourceReads.some((r) => r[0] === "main-07" && r[2] === 3) &&
      sourceReads.some((r) => r[0] === "main-01" && r[2] === 1), JSON.stringify(sourceReads.slice(0, 5)));
  const btn = panel.querySelector(".xft-act .xft-primary");
  if (btn) await p.click(btn);
  const share = p.w.__shared[0] || "";
  t("the share text names nobody",
    !!share && !["Rachel", "Green", "Loves", "Janice", "Phoebe"].some((n) => share.includes(n)), share.split(String.fromCharCode(10)).join(" / "));
  t("and says which game and how it went", share.startsWith("Who Am I XI: Friends") && share.includes("59/100"),
    share.split(String.fromCharCode(10))[0]);
}

console.log("\n=== Coming back to a finished day ===");
{
  const keep = {};
  for (let i = 0; i < p.w.localStorage.length; i++) {
    const k = p.w.localStorage.key(i);
    keep[k] = p.w.localStorage.getItem(k);
  }
  const back = await open({ db: p.DB, keep });
  t("the today card says it was played, and the score", back.text(back.$("waTodayState")) === "Played · 59 of 100",
    back.text(back.$("waTodayState")));
  await back.click(back.$("waToday"));
  t("and opening it shows the day's Full Time again", !back.$("screenDone").hidden &&
    flat((back.$("ftPanel").querySelector(".xft-score") || {}).textContent) === "59/100");
  t("with the sources still under it, kept on the device rather than asked for again",
    !back.$("frSources").hidden && back.$("frSources").querySelectorAll(".frs-card").length === 2);
  const saved = JSON.parse(back.w.localStorage.getItem("xifw.results.v1") || "[]");
  const row = saved.find((r) => r && r.day === DAY) || {};
  t("the day is banked once, with its five cards",
    saved.filter((r) => r && r.day === DAY).length === 1 && row.score === 59 && row.cardsSolved === 4 &&
      Array.isArray(row.cards) && row.cards.length === 5 && row.bonus === 0, JSON.stringify(row).slice(0, 120));
}

console.log("\n=== All five got: the bonus ===");
{
  const q = await open();
  await start(q);
  for (const name of ["Rachel Green", "Monica Geller", "Gunther", "Janice", "Phoebe Buffay"]) await guess(q, name);
  await q.settle();
  t("five on the first clue and the bonus: a perfect 100",
    flat((q.$("ftPanel").querySelector(".xft-score") || {}).textContent) === "100/100",
    (q.$("ftPanel").querySelector(".xft-score") || {}).textContent);
  t("and it says the bonus was earned", q.text(q.$("ftPanel")).includes("All 5 got: +10 bonus"));
  t("with no help used", [...q.$("ftPanel").querySelectorAll(".xft-help li")].map((li) => li.textContent).join("") === "None");
}

console.log("\n=== Nothing on screen says undefined, or football ===");
{
  const all = p.readable();
  t("no 'undefined' anywhere a player can read", !all.includes("undefined"));
  const FOOTBALL = ["club", "player", "spell", "career", "substitution", "goals", "nationality",
    "minute", "full time", "kick off", "footballquizzes"];
  const hay = " " + all.toLowerCase().split("").map((c) => (c >= "a" && c <= "z") ? c : " ").join("") + " ";
  const hit = FOOTBALL.filter((w) => hay.includes(" " + w + " ") || hay.includes(" " + w + "s "));
  t("and no football vocabulary", hit.length === 0, hit.join(", ") || "none");
}

console.log("\n=== Only the Friends tables were touched ===");
{
  const off = p.calls.filter((c) => c.startsWith("/api/whoami/") && !c.startsWith("/api/whoami/whoami_fr/"));
  t("every whoami call used this game's address", off.length === 0, off.join(", ") || "all namespaced");
  t("and there were calls to check", p.calls.filter((c) => c.startsWith("/api/whoami/whoami_fr/")).length >= 20,
    String(p.calls.length) + " call(s)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
