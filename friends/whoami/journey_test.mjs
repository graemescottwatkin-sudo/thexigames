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

let pass = 0, fail = 0;
const t = (n, ok, d) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`);
};

const DAY = today();

/* ---- the deck, as migration 044's tables hold it ------------------------- */

const CARDS = [
  { id: "main-07", name: "Rachel Green", deck: "main", section: "Loves & Exes", depth: 12, rounds: 4 },
  { id: "main-01", name: "Monica Geller", deck: "main", section: "Family & Relatives", depth: 12, rounds: 4 },
  { id: "exp-03", name: "Gunther", deck: "expert", section: "Jobs & Ambitions", depth: 6, rounds: 2 },
];
/* THE DOORS ARE DAILIES, so their letters are DAILY letters — rounds of the
   card's verified subset, from fr_wa_daily_clue — not full-card letters. */
const DOORS = [
  { play_date: DAY, slot: 1, card_id: "main-07", round_letter: "A" },
  { play_date: DAY, slot: 2, card_id: "main-01", round_letter: "A" },
  { play_date: DAY, slot: 3, card_id: "exp-03", round_letter: "A" },
];
/* THE FULL CARD, as fr_wa_clue holds it: twelve clues, full-card letters by
   stride 4. Only n = 2, 6 and 10 are verified, and they form daily round A.
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
const CLUES = FULL;
const DAILY = [
  { card_id: "main-07", round_letter: "A", step: 1, n: 2 },
  { card_id: "main-07", round_letter: "A", step: 2, n: 6 },
  { card_id: "main-07", round_letter: "A", step: 3, n: 10 },
];
const ANSWERS = [
  { card_id: "main-07", answer: fold("Rachel Green"), kind: "accept" },
  { card_id: "main-07", answer: fold("Rachel"), kind: "accept" },
  { card_id: "main-01", answer: fold("Monica Geller"), kind: "accept" },
  { card_id: "exp-03", answer: fold("Gunther"), kind: "accept" },
  /* ONE WORD, TWO CARDS: the ambiguous verdict. */
  { card_id: "main-07", answer: fold("Apartment"), kind: "suggest" },
  { card_id: "main-01", answer: fold("Apartment"), kind: "suggest" },
];

/* ---- a D1 that answers the real SQL by shape ---------------------------- */

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

  w.eval(config);
  w.eval(game);
  const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
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

async function openTheDoor(p, slot) {
  await p.click(p.$("waToday"));
  const door = [...p.w.document.querySelectorAll("#doors .door")][slot - 1];
  await p.click(door);
  await p.click(p.$("playChoice"));
  await p.settle();
}

const guess = async (p, name) => {
  p.$("guessInput").value = name;
  p.$("guessInput").dispatchEvent(new p.w.Event("input", { bubbles: true }));
  p.$("guessGo").disabled = false;
  await p.click(p.$("guessGo"));
};

const clueTexts = (p) => [...p.w.document.querySelectorAll("#clueStack .fclue .fc-text")]
  .map((e) => e.textContent.trim());

/* ------------------------------------------------------------------------- */

console.log("=== The doors are this deck's ===");
{
  const p = await open();
  await p.click(p.$("waToday"));
  const doors = [...p.w.document.querySelectorAll("#doors .door")];
  t("three doors, not eleven", doors.length === 3, String(doors.length));
  t("each door names its section", /Loves & Exes/.test(p.text(doors[0])), p.text(doors[0]));
  t("and never the internal deck name", !/\bmain\b|\bexpert\b/.test(doors.map(p.text).join(" ")),
    doors.map(p.text).join(" | "));
  await p.click(doors[0]);
  t("choosing a door names it, rather than 'undefined · undefined'",
    p.text(p.$("commitPick")) === "Door 1 · Loves & Exes", p.text(p.$("commitPick")));
  t("the button opens a door, not a clue", /Open this door/.test(p.text(p.$("playChoice"))));
}

console.log("\n=== A round shows its clues ===");
const p = await open();
await openTheDoor(p, 1);
{
  const shown = clueTexts(p);
  t("THE FIRST CLUE'S TEXT IS ON THE PAGE", shown.length === 1 && shown[0].includes(CLUE_TEXT[0].slice(0, 30)),
    shown.join(" | ") || "no clue drawn");
  t("labelled as clue 1 of 3, the hardest",
    /Clue 1 of 3 · the hardest/.test(p.text(p.w.document.querySelector("#clueStack .fclue .fc-n"))));
  t("and marked on record, because its vs is ep",
    !!p.w.document.querySelector("#clueStack .fclue .fc-src"));
  t("it is the VERIFIED clue, not the unverified one at the same full-card letter",
    !p.readable().includes(UNVERIFIED));
  t("the door is named on the card", p.text(p.w.document.querySelector(".pf-kicker")) === "Door 1 · Loves & Exes",
    p.text(p.w.document.querySelector(".pf-kicker")));
  t("worth now is ten, the door's ceiling", p.text(p.$("worthNow")) === "10", p.text(p.$("worthNow")));
  t("and there is no match clock", !/90'|Match clock/i.test(p.readable()));
  t("one clue is offered next, costing four",
    /Ask a friend.*Clue 2 of 3.*4/.test(p.text(p.$("ladder"))), p.text(p.$("ladder")));
  t("and the exit says Tell me", p.text(p.$("giveUp")) === "Tell me", p.text(p.$("giveUp")));
}

await p.click(p.w.document.querySelector("#ladder .rung-next"));
{
  const shown = clueTexts(p);
  t("buying adds the SECOND clue's text, beneath the first",
    shown.length === 2 && shown[1].includes(CLUE_TEXT[1].slice(0, 30)), shown.join(" | "));
  t("which is NOT marked on record: a trait is not evidence",
    p.w.document.querySelectorAll("#clueStack .fc-src").length === 1);
  t("and the door is now worth six", p.text(p.$("worthNow")) === "6", p.text(p.$("worthNow")));
}

console.log("\n=== The type-ahead finds names ===");
{
  p.$("guessInput").value = "rach";
  p.$("guessInput").dispatchEvent(new p.w.Event("input", { bubbles: true }));
  await p.settle();
  const offered = p.text(p.$("suggest"));
  /* The server sent bare strings and the page searched their second letter. */
  t("typing 'rach' offers Rachel Green", /Rachel Green/.test(offered), offered || "nothing offered");
  p.$("guessInput").value = "";
}

console.log("\n=== The verdicts this server sends ===");
{
  await guess(p, "Apartment");
  t("an ambiguous word offers the cards it could mean",
    /Rachel Green/.test(p.text(p.$("suggest"))) && /Monica Geller/.test(p.text(p.$("suggest"))),
    p.text(p.$("suggest")));
  await guess(p, "Monica Geller");
  t("another card's name is a near miss, not 'Not him.'",
    /someone else in the deck/i.test(p.text(p.$("feedback"))), p.text(p.$("feedback")));
  t("and the near miss names nobody", !/Rachel/.test(p.text(p.$("feedback"))));
  await guess(p, "Joey Tribbiani");
  t("a name that is nobody's is a plain miss", /Not them/.test(p.text(p.$("feedback"))), p.text(p.$("feedback")));
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
  t("and the door is still worth six", back.text(back.$("worthNow")) === "6", back.text(back.$("worthNow")));
}

console.log("\n=== Solving it ===");
{
  await guess(p, "Rachel Green");
  await p.settle();
  const done = p.text(p.$("doneBody"));
  t("the end card is shown", !p.$("screenDone").hidden);
  t("it names the card", /Rachel Green/.test(done), done);
  t("and the door it was behind", /Behind the Loves & Exes door/.test(done));
  t("scored out of ten", /Score\s*6 of 10/.test(done), done);
  t("two of three clues used", /Clues used\s*2 of 3/.test(done));
  t("the near miss is counted under this deck's word", /Named someone else\s*1/.test(done), done);
  const share = p.$("shareText").value;
  t("the share text names nobody", !/Rachel|Green|Loves/.test(share), share.replace(/\n/g, " / "));
  t("and says which game it is", /^WHO AM I XI: FRIENDS/.test(share));
}

console.log("\n=== Nothing on screen says undefined, or football ===");
{
  const all = p.readable();
  t("no 'undefined' anywhere a player can read", !/\bundefined\b/.test(all));
  const FOOTBALL = ["club", "player", "spell", "career", "substitution", "goals", "nationality",
    "minute", "full time", "kick off", "footballquizzes"];
  const hay = " " + all.toLowerCase().replace(/[^a-z]+/g, " ") + " ";
  const hit = FOOTBALL.filter((w) => hay.includes(" " + w + " ") || hay.includes(" " + w + "s "));
  t("and no football vocabulary", hit.length === 0, hit.join(", ") || "none");
}

console.log("\n=== Only the Friends tables were touched ===");
{
  /* Every call the page made went to the namespaced address; the stub throws
     on any football table, so reaching here is half the proof and this is the
     other half. */
  const off = p.calls.filter((c) => c.startsWith("/api/whoami/") && !c.startsWith("/api/whoami/whoami_fr/"));
  t("every whoami call used this game's address", off.length === 0, off.join(", ") || "all namespaced");
  t("and there were calls to check", p.calls.filter((c) => c.startsWith("/api/whoami/whoami_fr/")).length >= 6,
    String(p.calls.length) + " call(s)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
