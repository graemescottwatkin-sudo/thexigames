/* fulltime_panel_test.mjs — the family's Full Time panel (shared/xi-fulltime.js,
 * XIFullTime.panel), the owner's approved mockup of 26 Sep 2026: the same four
 * blocks on every game -- the result, keep it, share, challenge -- then the
 * next game. Every game hands it data; this proves what it draws from that
 * data, once, so no game has to.
 *
 *   node tools/fulltime_panel_test.mjs        (from the repo root)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "shared", "xi-fulltime.js"), "utf8");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

function page(user) {
  const dom = new JSDOM("<!doctype html><body><div id=p></div></body>", { runScripts: "outside-only", url: "https://www.thexigames.com/football/quickfire/" });
  const w = dom.window;
  const opened = [], shared = [];
  let who = user || null;
  w.XIChrome = { account: { user: () => who, available: () => true, open: () => opened.push(1) } };
  Object.defineProperty(w.navigator, "share", { value: (o) => { shared.push(o); return Promise.resolve(); }, configurable: true });
  w.eval(src);
  return { w, doc: w.document, opened, shared, signIn: (u) => { who = u; w.document.dispatchEvent(new w.CustomEvent("xi:account", { detail: { type: "signin", user: u } })); } };
}

const DATA = {
  game: "quickfire", name: "QuickFire XI", no: 9, date: "Sat 26 Sep", score: 62, max: 114,
  boxes: [{ s: "g", m: 11 }, { s: "g", m: 19 }, { s: "r" }, { s: "g", m: 27 }, { s: "g", m: 35 }, { s: "r" },
          { s: "g", m: 48 }, { s: "g", m: 56 }, { s: "g", m: 63 }, { s: "x" }, { s: "g", m: 80 }],
  stats: "8 right · 2 wrong",
  answers: [{ s: "g", m: 11, text: "Right1", points: 10 }, { s: "r", m: 20, text: "Wrong", was: "Right3", points: 0 }],
  share: () => "QuickFire XI · No. 9 · 62/114",
  url: () => "https://www.thexigames.com/football/quickfire/#b=9",
};

console.log("=== The four blocks ===");
{
  const { w, doc } = page();
  const r = w.XIFullTime.panel(doc.getElementById("p"), DATA);
  const kids = [...doc.getElementById("p").children].map((e) => e.className.split(" ")[0]);
  t("the result, keep it, the actions, then next up, in that order", kids.join(",") === "xft-card,xft-keep,xft-act,xft-next", kids.join(","));
  t("share and challenge are two buttons, not a toggle",
    !!r.share && !!r.challenge && r.share !== r.challenge && r.share.tagName === "BUTTON" && r.challenge.tagName === "BUTTON");
  const card = doc.querySelector(".xft-card");
  t("the name and board", card.querySelector(".xft-name").textContent === "QuickFire XI · No. 9");
  t("the score out of its maximum", /^62\s*\/ 114$/.test(card.querySelector(".xft-score").textContent.trim()), card.querySelector(".xft-score").textContent);
  t("the bar is filled to score over maximum", card.querySelector(".xft-bar i").style.width === "54%", card.querySelector(".xft-bar i").style.width);
  const boxes = [...card.querySelectorAll(".xft-b")];
  t("eleven boxes", boxes.length === 11);
  t("green boxes carry the minute", boxes[0].classList.contains("g") && boxes[0].textContent === "11'");
  t("red boxes carry a cross, so right and wrong differ by more than colour", boxes[2].classList.contains("r") && boxes[2].textContent === "×");
  t("grey is not answered", boxes[9].classList.contains("x") && boxes[9].textContent === "–");
  const p2 = page();
  p2.w.XIFullTime.panel(p2.doc.getElementById("p"), { ...DATA, boxes: [{ s: "a" }, { s: "a", m: 30 }, { s: "g" }] });
  const b2 = [...p2.doc.querySelectorAll(".xft-b")].map((b) => b.textContent);
  t("amber with no minute is a tilde, never a tick; green with none is a tick", b2.join(" ") === "~ 30' ✓", b2.join(" "));
  t("each box says what it was to a screen reader", boxes[0].getAttribute("aria-label") === "1: right at 11 minutes" &&
    boxes[2].getAttribute("aria-label") === "3: wrong", boxes[0].getAttribute("aria-label"));
  t("the stats line", card.querySelector(".xft-stats").textContent === "8 right · 2 wrong");
  const was = [...card.querySelectorAll(".xft-answers li")];
  t("your answers, folded, with the answer shown only for a miss",
    card.querySelector(".xft-answers").tagName === "DETAILS" && was.length === 2 &&
    !was[0].querySelector(".xft-a-was") && was[1].querySelector(".xft-a-was").textContent.includes("Right3"));
}

console.log("\n=== Keep it ===");
{
  const p1 = page();
  p1.w.XIFullTime.panel(p1.doc.getElementById("p"), DATA);
  const keep = p1.doc.querySelector(".xft-keep");
  t("signed out: one row asking to sign in", keep.classList.contains("xft-signin") && /Sign in to keep/.test(keep.textContent));
  keep.querySelector("button").click();
  t("and its button opens the account sheet", p1.opened.length === 1);
  p1.signIn({ id: "u" });
  t("signing in turns it into the saved line, in place", p1.doc.querySelector(".xft-keep").classList.contains("xft-saved") &&
    /Saved to your account/.test(p1.doc.querySelector(".xft-keep").textContent));
  const p2 = page({ id: "u" });
  p2.w.XIFullTime.panel(p2.doc.getElementById("p"), DATA);
  t("signed in from the start: the saved line and no sign-in button", /Saved to your account/.test(p2.doc.querySelector(".xft-keep").textContent) &&
    !p2.doc.querySelector(".xft-keep button"));
}

console.log("\n=== Share and challenge ===");
{
  const { w, doc, shared } = page();
  const r = w.XIFullTime.panel(doc.getElementById("p"), DATA);
  r.share.click();
  t("share sends the game's text and the board's address", shared.length === 1 &&
    shared[0].text === "QuickFire XI · No. 9 · 62/114\nhttps://www.thexigames.com/football/quickfire/#b=9", JSON.stringify(shared[0]));
  r.challenge.click();
  t("a game with no challenge of its own sends the board and the score to beat", shared.length === 2 &&
    /Can you beat 62\/114\?/.test(shared[1].text) && shared[1].text.endsWith("#b=9"), JSON.stringify(shared[1]));
  let mine = 0;
  const p2 = page();
  const r2 = p2.w.XIFullTime.panel(p2.doc.getElementById("p"), { ...DATA, challenge: () => mine++ });
  r2.challenge.click();
  t("a game's own challenge is called instead", mine === 1 && p2.shared.length === 0);
  /* A game with a real challenge is handed the fallback: called with the
     challenge's own link it sends that; called bare, the board. */
  const p3 = page();
  const r3 = p3.w.XIFullTime.panel(p3.doc.getElementById("p"), { ...DATA, challenge: (sendBoard) => sendBoard("https://x/?c=abc") });
  r3.challenge.click();
  const p4 = page();
  const r4 = p4.w.XIFullTime.panel(p4.doc.getElementById("p"), { ...DATA, challenge: (sendBoard) => sendBoard() });
  r4.challenge.click();
  t("a game's challenge sends its own link, or falls back to the board",
    p3.shared.length === 1 && p3.shared[0].text.endsWith("\nhttps://x/?c=abc") && /Can you beat 62\/114\?/.test(p3.shared[0].text) &&
    p4.shared.length === 1 && p4.shared[0].text.endsWith("#b=9"), JSON.stringify([p3.shared[0], p4.shared[0]]));
}

console.log("\n=== The other shapes ===");
{
  const { w, doc } = page();
  w.XIFullTime.panel(doc.getElementById("p"), { ...DATA, boxes: null, door: { label: "Queens Park Rangers", rungs: 6, paid: 3 } });
  t("a door in place of boxes (Who Am I)", !doc.querySelector(".xft-boxes") && doc.querySelectorAll(".xft-rungs i").length === 6 &&
    doc.querySelectorAll(".xft-rungs i.paid").length === 3);
  w.XIFullTime.panel(doc.getElementById("p"), { ...DATA, gaveUp: "Gave up at 34'" });
  t("giving up replaces the stats line", !doc.querySelector(".xft-stats") && doc.querySelector(".xft-gaveup").textContent === "Gave up at 34'");
  let opened = 0;
  w.XIFullTime.panel(doc.getElementById("p"), { ...DATA, league: { text: "5th · Aston Villa", open: () => opened++ } });
  doc.querySelector(".xft-league button").click();
  t("a league line with its table behind a link", doc.querySelector(".xft-league").textContent.includes("5th · Aston Villa") && opened === 1);
  w.XIFullTime.panel(doc.getElementById("p"), { ...DATA, name: "<b>X</b>" });
  t("what a game hands over is text, never markup", !doc.querySelector(".xft-name b") && doc.querySelector(".xft-name").textContent.startsWith("<b>X</b>"));
  t("drawn twice into one box, it is one panel", doc.getElementById("p").querySelectorAll(".xft-card").length === 1);
}

console.log("\n=== The helpers ===");
{
  const { w } = page();
  t("squares: green, amber, red, grey", w.XIFullTime.squares([{ s: "g" }, { s: "a" }, { s: "r" }, { s: "x" }, { s: "?" }]) === "🟩🟨🟥⬜⬜");
  t("a board's day, as the panel prints it", w.XIFullTime.dayLabel("2026-09-26") === "Sat 26 Sep", w.XIFullTime.dayLabel("2026-09-26"));
  t("and nothing for a day it cannot read", w.XIFullTime.dayLabel("soon") === "");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
