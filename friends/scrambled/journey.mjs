/* friends/scrambled/journey.mjs — one Friends board, played from kick off to
 * Full Time in jsdom, with the page's fetch routed into the REAL handlers.
 * Shared by friends/scrambled/journey_test.mjs (the anagram) and
 * friends/vowels/journey_test.mjs (the vowels), because the two pages are one
 * generator's two outputs and prove the same things about it.
 *
 * WHAT IT PROVES, per the owner's rulings of 29 Sep 2026 -- five answers a
 * board, no clock, Friends words -- and the build's own promises: the board is
 * a list of five under its theme; a name is judged by the server against the
 * Friends set; help is priced by the Friends engine (2 a letter, 20 an answer
 * given up); nothing counts time; Full Time scores out of 100, with no minute
 * on any box; the play and the result are filed under the Friends game and
 * prefix, never football's.
 *
 * THE BOARD IS PINNED TO THE RING'S FIRST DAY, which is always reachable and
 * always the same board: the suite does not decide what day it is.
 */
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { dailyFor } from "../../functions/api/scrambled/daily.js";
import { onRequestPost as guessPost } from "../../functions/api/scrambled/guess.js";
import { onRequestPost as revealPost } from "../../functions/api/scrambled/reveal.js";
import { onRequestPost as roundPost } from "../../functions/api/scrambled/round.js";
import { FR_SC_BOARDS } from "../../functions/_lib/fr-sc-boards.js";
import { boardForNumber } from "../../functions/_lib/sc-board.js";
import { launchNumber } from "../../functions/_lib/games.js";

export async function journey({ dir, id, prefix, cypher }) {
  let pass = 0, fail = 0;
  const t = (name, ok, note) => {
    ok ? pass++ : fail++;
    console.log(`${ok ? "  ok  " : "FAIL  "}${name}${note ? "  — " + note : ""}`);
  };
  const settle = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

  const FIRST = launchNumber("scrambled_fr");
  const cy = cypher === "consonants";
  const board = boardForNumber(FIRST, FR_SC_BOARDS, cypher || null, "frsc");
  t("PRECONDITION: the ring's first day has a board, and it is a list of five",
    !!board && board.layout === "list" && board.slots.length === 5, board && board.title);

  const ORIGIN = "http://localhost";
  const plays = [];
  const calls = [];
  const ROUTES = {
    "/api/scrambled_fr/daily": (req) => dailyFor({ request: req, env: {} }, "frsc", "scrambled_fr"),
    "/api/scrambled/guess": (req) => guessPost({ request: req, env: {} }),
    "/api/scrambled/reveal": (req) => revealPost({ request: req, env: {} }),
    "/api/scrambled/round": (req) => roundPost({ request: req, env: {} }),
    "/api/play": async (req) => {
      let body = null;
      try { body = await req.json(); } catch (e) { body = { bad: true }; }
      plays.push(body);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    },
  };
  async function routedFetch(input, init) {
    const url = new URL(String(input), ORIGIN);
    calls.push(url.pathname + url.search);
    const h = ROUTES[url.pathname];
    if (!h) throw new Error("no route for " + url.pathname);
    return h(new Request(url.href, init));
  }

  const dom = new JSDOM(fs.readFileSync(`${dir}/index.html`, "utf8"), {
    url: `${ORIGIN}/${dir}/?no=${FIRST}`, runScripts: "outside-only", pretendToBeVisual: true,
  });
  const { window } = dom;
  const doc = window.document;
  window.fetch = routedFetch;
  window.Request = Request;
  window.Response = Response;
  const shared = [];
  Object.defineProperty(window.navigator, "share", { configurable: true,
    value: (o) => { shared.push(o && o.text); return Promise.resolve(); } });
  for (const f of ["shared/xi-plays.js", "shared/xi-keys.js", "shared/xi-fulltime.js",
    "friends/scrambled/js/config.js", "friends/scrambled/js/scoring.js", `${dir}/js/game.js`]) {
    window.eval(fs.readFileSync(f, "utf8"));
  }
  const $ = (x) => doc.getElementById(x);
  await settle(20);

  console.log("\n=== The start card ===");
  t("the engine asked the Friends daily route for the pinned board",
    calls.some((c) => c.startsWith("/api/scrambled_fr/daily") && c.includes("no=" + FIRST) && (!cy || c.includes("cy=1"))),
    calls.filter((c) => c.includes("daily")).join(" "));
  t("the start card names the board's theme", $("startTitle").textContent === board.title, $("startTitle").textContent);
  t("and says five answers and no clock", $("startClock").textContent === "5 answers · no clock", $("startClock").textContent);

  $("homeDaily").dispatchEvent(new window.Event("click"));
  await settle(12);
  console.log("\n=== The list ===");
  t("kick off posts a play naming the Friends game and the Friends board",
    plays.length === 1 && plays[0].event === "start" && plays[0].game === id &&
      plays[0].boardKey === "frsc:" + (cy ? "c:" : "") + FIRST && plays[0].total === 5,
    JSON.stringify(plays[0] || null));
  const rows = () => [...doc.querySelectorAll("#pitch .slot")];
  t("the board is a list, headed by its theme", !!doc.querySelector("#pitch .listHead") &&
    doc.querySelector("#pitch .listHead").textContent === board.title && $("pitch").classList.contains("xlist"));
  t("five rows, numbered in order", rows().length === 5 &&
    rows().every((r, i) => r.querySelector(".pos").textContent === String(i + 1)));
  const shown = $("pitch").textContent.toUpperCase();
  t(cy ? "every row shows its blanked answer and no name" : "every row shows its scramble and no name",
    board.slots.every((s) => (cy ? shown.includes(s.cy) : shown.includes(s.scramble)) &&
      (s.presolved || !shown.includes(s.name))));
  t("and the board is worth the full 100", $("worthNow").textContent === "100", $("worthNow").textContent);

  async function type(text) {
    $("answer").value = text;
    $("submit").dispatchEvent(new window.Event("click"));
    await settle(12);
  }
  console.log("\n=== Answers ===");
  const [a, b, c, d, e] = board.slots;
  await type(a.name.toLowerCase());
  t("a right answer in the wrong case is judged right by the server",
    doc.querySelectorAll("#pitch .slot.solved").length === 1 + board.slots.filter((s) => s.presolved).length);
  t("and its row reads the whole answer as the board shows it",
    rows()[0].querySelector(".letters").textContent === String(a.display || a.name).toUpperCase(),
    rows()[0].querySelector(".letters").textContent);
  await type("ZZZQX NOT AN ANSWER");
  t("a wrong one is refused, and said so", /not on this board/i.test($("feedback").textContent), $("feedback").textContent);

  console.log("\n=== Help, at the Friends prices ===");
  rows()[1].dispatchEvent(new window.Event("click"));
  await settle(4);
  $("buyLetter").dispatchEvent(new window.Event("click"));
  await settle(12);
  t(cy ? "a vowel costs two" : "a letter costs two", $("worthNow").textContent === "98", $("worthNow").textContent);
  rows()[1].dispatchEvent(new window.Event("click"));
  await settle(4);
  $("buyName").dispatchEvent(new window.Event("click"));
  await settle(12);
  t("and giving an answer up costs the twenty it was worth", $("worthNow").textContent === "78", $("worthNow").textContent);

  console.log("\n=== No clock ===");
  /* TWO HOURS PASS, as far as the page can tell: its clock reads Date.now,
     and a board on football's engine would have lost most of its worth by
     now. The page's own tick runs every second, so one is waited for. */
  const before = $("worthNow").textContent;
  const realNow = window.Date.now;
  window.Date.now = () => realNow() + 2 * 3600 * 1000;
  await new Promise((r) => setTimeout(r, 1300));
  await settle(4);
  t("two hours passing costs nothing", $("worthNow").textContent === before, before + " -> " + $("worthNow").textContent);
  window.Date.now = realNow;

  for (const s of [c, d, e]) { if (!s.presolved) await type(s.name); }
  await settle(20);
  console.log("\n=== Full Time ===");
  const ftp = $("ftPanel");
  t("Full Time is shown once all five are in", !!ftp && !$("screenResults").hidden);
  t("the score is out of 100: 100, less 2 for the letter and 20 for the answer given up",
    /78\s*\/\s*100$/.test(((ftp && ftp.querySelector(".xft-score")) || {}).textContent || ""),
    ((ftp && ftp.querySelector(".xft-score")) || {}).textContent);
  const boxes = ftp ? [...ftp.querySelectorAll(".xft-boxes .xft-b")] : [];
  t("a box for each of the five, and no minute on any of them",
    boxes.length === 5 && boxes.every((x) => !/'/.test(x.textContent)), boxes.map((x) => x.className.split(" ").pop() + x.textContent).join(" "));
  t("the stats line counts the answers worked out, and no time",
    /^4 of 5 unravelled/.test((ftp.querySelector(".xft-stats") || {}).textContent || "") &&
      !/\d+m \d+s/.test((ftp.querySelector(".xft-stats") || {}).textContent || ""),
    (ftp.querySelector(".xft-stats") || {}).textContent);
  const end = plays.find((p) => p.event === "end");
  t("the play's end is filed under the Friends game", !!end && end.game === id && end.completed === true && end.solved === 5,
    JSON.stringify(end || null));
  let saved = [];
  try { saved = JSON.parse(window.localStorage.getItem(prefix + "results") || "[]"); } catch (err) { saved = []; }
  t("the result is kept under the Friends prefix, with its score", saved.length === 1 && saved[0].no === FIRST && saved[0].score === 78,
    JSON.stringify(saved[0] || null));
  const football = Object.keys(window.localStorage).filter((k) => /^(xisc|xivw)\./.test(k));
  t("and nothing is written under football's", football.length === 0, football.join(", "));
  ftp.querySelector(".xft-act .xft-primary").click();
  await settle(4);
  const share = shared[0] || "";
  t("the share text names no answer", !!share && board.slots.every((s) => share.indexOf(s.name) === -1), JSON.stringify(share));

  console.log("\n=== Nothing on screen is football's ===");
  const text = " " + doc.body.textContent.replace(/\s+/g, " ") + " ";
  const hits = ["football", "Premier League", "pitch", "ninety", "half time", "footballer", "off the bench"]
    .filter((w) => text.toLowerCase().includes(w.toLowerCase()));
  t("no football vocabulary anywhere a player can read", hits.length === 0, hits.join(", ") || "none");

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail;
}
