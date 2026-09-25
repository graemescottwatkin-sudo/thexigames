/* tools/lineup_test.mjs — the football hub, as the redesign of 24 Sep 2026
 * made it.
 *
 *   node tools/lineup_test.mjs
 *
 * WHAT THE HUB PROMISES, and each promise is a check here:
 *   - every live game, in shirt order, as ONE link to its home, in the markup:
 *     the page works with JavaScript off (the brief's rule), and no card starts
 *     a clock (the owner's call)
 *   - Today's XI as one collapsed disclosure, no unlaunched shirt anywhere
 *   - the date once and the next reset, both from the SERVER's day, the reset
 *     shown in the reader's zone ("New puzzles at 01:00 BST")
 *   - completion from each game's own record: "✓ Completed" in words over muted
 *     art, the count "N of 10 completed", and never a "0 completed" it could not
 *     read
 *   - the newcomer's introduction, hidden for a device that has played before
 *   - one "Browse previous dailies" link
 *
 * It replaces the suite for the old hub's daily feature rotation, which the
 * redesign removed with the hero and the featured pair. The old file's rules
 * about DAYS still hold and are kept: the day is handed to the page as a
 * fixture and never read from this machine's clock, and the zone is set as a
 * fixture (process.env.TZ) where the zone is what is being proved.
 */
process.env.TZ = "Europe/London";

import { themeHubFile } from "../functions/_lib/permalink.js";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HUB_FILE = themeHubFile("football");
const HTML = fs.readFileSync(path.join(ROOT, HUB_FILE), "utf8");

let pass = 0, fail = 0;
const t = (name, ok, note) => {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* WAIT FOR THE THING, NOT FOR A NUMBER OF MILLISECONDS. The hub was read a
   fixed 800ms after load, and on a loaded machine the probes behind it can
   still be in flight then. The page says when it has heard back: the date
   line leaves its markup wording when /api/daily answers, and the count is
   written only once EVERY game has answered or failed -- so after it, a card
   left unmarked is a card judged, not one still waiting. The deadline is the
   guard against a wait that cannot end: a condition that never comes true
   returns false, and the assertion after it fails as it always would have. */
const until = async (ok, ms = 10000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await wait(20);
  return ok();
};

/* ======================================================================
   1. THE MARKUP, before any script runs
   ====================================================================== */
console.log("The markup, with JavaScript off");
{
  const d = new JSDOM(HTML).window.document;
  const shirts = [...d.querySelectorAll(".xi-strip a.shirt")];
  const cards = [...d.querySelectorAll("#lineup .gcard")];
  t("ten cards and ten shirts, in the file, not built by script",
    cards.length === 10 && shirts.length === 10, `${cards.length} cards, ${shirts.length} shirts`);
  const shirtIds = shirts.map((s) => (s.getAttribute("href").match(/^\/football\/([a-z]+)\/$/) || [])[1]);
  const nums = shirts.map((s) => Number(s.querySelector(".dot").textContent));
  t("the shirts run 1 to 10", nums.every((n, i) => n === i + 1), nums.join(","));
  t("the cards are in shirt order: the same games, the same order, as the shirts",
    cards.map((c) => c.getAttribute("data-game")).join() === shirtIds.join(), shirtIds.join(" "));
  const oneLink = cards.filter((c) => {
    const links = [...c.querySelectorAll("a")];
    return links.length === 1 && links[0].getAttribute("href") === "/football/" + c.getAttribute("data-game") + "/";
  });
  t("every card is ONE link, to its own game's home", oneLink.length === 10, `${oneLink.length} of 10`);
  t("no card starts a board: nothing links ?play=1", !HTML.includes("?play=1"));
  t("every card shows its shirt number and its name",
    cards.every((c, i) => c.querySelector(".gcard-num").textContent.trim() === String(i + 1) &&
      /XI$/.test(c.querySelector(".gcard-title").textContent.trim())));
  t("every card's completed badge is in the markup and hidden until it is true",
    cards.every((c) => { const b = c.querySelector(".gcard-done"); return b && b.hidden && /Completed/.test(b.textContent); }));
  const today = d.getElementById("todayXI");
  t("Today's XI is one native disclosure, collapsed on arrival",
    !!today && today.tagName === "DETAILS" && !today.open && /Today.s XI/.test(today.querySelector("summary").textContent));
  t("and it claims no count before anything has been read",
    d.getElementById("xiCount").textContent.trim() === "View games");
  t("no unlaunched shirt anywhere: no dashed eleven, no 'still to sign'",
    !d.querySelector(".shirt.soon") && !/still to sign/i.test(d.body.textContent));
  t("no hero and no rotating feature",
    !d.querySelector(".hero, #heroGo, .cover, .gcard.lead") && !/FEATURE_CYCLE/.test(HTML));
  const word = (d.getElementById("liveCount") || {}).textContent || "";
  const WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
  t("the introduction's count is the number of shirts", word.toLowerCase() === WORDS[shirts.length], word);
  t("one link to every game's previous dailies",
    d.querySelectorAll('a[href="/football/archive/"]').length >= 1);
  t("the reset line says the rule in UTC until the server has spoken",
    /00:00 UTC/.test(d.getElementById("resetLine").textContent));
  /* A PUZZLE DAY ENDS AT THE RESET, NOT AT MIDNIGHT. The season panel said
     "it counts at midnight" two screens below "New puzzles at 01:00 BST"
     (Play build, 24 Sep 2026): in Britain in summer, and in most of the
     world, midnight is not when the day ends. Asked of both places that
     carried the sentence: the hub and the game menus' shared script. */
  const menu = fs.readFileSync(path.join(ROOT, "shared", "xi-menu.js"), "utf8");
  t("nothing tells a player the day counts at midnight",
    !/counts at midnight/.test(HTML) && !/counts at midnight/.test(menu) &&
    /counts when the next puzzles arrive/.test(HTML) && /counts when the next puzzles arrive/.test(menu));
}

/* ======================================================================
   2. THE BEHAVIOUR, with the shared scripts and a stubbed server
   ====================================================================== */
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
let DAY = "2026-09-23", NO = 6, apiDown = false;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const json = (o, s = 200) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/auth/session") return json({ user: null, googleClientId: null });
    if (url.pathname === "/api/season") return json({ account: false, today: DAY });
    /* Every game's daily answers with a payload every probe can read its
       "today" from: the ring games read a number, the scheduled ones a day. */
    if (apiDown) return json({ error: "down" }, 500);
    return json({ day: DAY, dailyNo: NO, today: NO, no: NO });
  }
  const rel = url.pathname === "/football/" ? "/" + HUB_FILE : url.pathname;
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;

/* `ready` is what the page does when it has heard back, read from its
   document. With none, the wait stays fixed: that is the case where nothing
   can be read and the checks are that nothing is claimed, and a condition
   cannot wait for a change that must never come. */
const dated = (d) => d.getElementById("sheetDate").textContent !== "Today’s puzzles" &&
  !/00:00 UTC/.test(d.getElementById("resetLine").textContent);
const counted = (d) => d.getElementById("xiCount").textContent.trim() !== "View games";
async function hub(storage = {}, ready = null) {
  const dom = await JSDOM.fromURL(origin + "/football/", {
    runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new URL(u, w.location.href), o);
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));
      for (const k in storage) w.localStorage.setItem(k, JSON.stringify(storage[k]));
    },
  });
  await new Promise((r) => dom.window.addEventListener("load", r));
  const d = dom.window.document;
  if (ready) await until(() => ready(d));
  else await wait(800);
  const card = (g) => d.querySelector(`.gcard[data-game="${g}"]`);
  return { dom, d, card, text: (id) => (d.getElementById(id) || {}).textContent || "" };
}

console.log("\nThe day and the reset, from the server's day, in the reader's zone");
{
  DAY = "2026-09-23"; NO = 6;
  let h = await hub({}, dated);
  t("the date is the server's day, once", h.text("sheetDate") === "Wed 23 Sep", h.text("sheetDate"));
  t("the reset is the next board day, in British Summer Time", h.text("resetLine") === "New puzzles at 01:00 BST", h.text("resetLine"));
  h.dom.window.close();
  DAY = "2026-12-01"; NO = 75;
  h = await hub({}, dated);
  t("and in winter, at midnight GMT", h.text("resetLine") === "New puzzles at 00:00 GMT", h.text("resetLine"));
  t("the date follows the server's day, not this machine's", h.text("sheetDate") === "Tue 1 Dec", h.text("sheetDate"));
  h.dom.window.close();
}

console.log("\nA newcomer, and nothing played");
{
  DAY = "2026-09-23"; NO = 6; apiDown = false;
  const h = await hub({}, counted);
  t("the introduction is shown", !h.d.getElementById("hubIntro").hidden);
  t("the count says 0 of 10: every game was read, and nothing is done", h.text("xiCount") === "0 of 10 completed", h.text("xiCount"));
  t("no card is marked completed", !h.d.querySelector(".gcard.done"));
  h.dom.window.close();
}

console.log("\nA returning player who has finished two games today");
{
  DAY = "2026-09-23"; NO = 6; apiDown = false;
  const h = await hub({
    "fcw.results.v1": [{ dailyNo: 6, complete: true, score: 86 }],
    "xihl.results": [{ day: "2026-09-23", score: 70 }],
  }, counted);
  t("the introduction is hidden: this device has played before", h.d.getElementById("hubIntro").hidden);
  const done = [...h.d.querySelectorAll(".gcard.done")].map((c) => c.getAttribute("data-game"));
  t("exactly those two cards are completed", done.join() === "crossword,hilo", done.join());
  const c = h.card("crossword");
  t("in words, not colour alone: the badge shows and the action says so",
    !c.querySelector(".gcard-done").hidden && c.querySelector(".gcard-act").textContent === "View today’s result");
  t("and the card still opens its game's home, where the result is",
    c.querySelector("a").getAttribute("href") === "/football/crossword/");
  t("the shirts in Today's XI agree", h.d.getElementById("shirt1").classList.contains("done") &&
    h.d.getElementById("shirt4").classList.contains("done") && !h.d.getElementById("shirt2").classList.contains("done"));
  t("the count reads 2 of 10 completed", h.text("xiCount") === "2 of 10 completed", h.text("xiCount"));
  t("and the disclosure is still collapsed", !h.d.getElementById("todayXI").open);
  h.dom.window.close();
}

console.log("\nNothing can be read");
{
  apiDown = true;
  const h = await hub({ "fcw.results.v1": [{ dailyNo: 6, complete: true }] });
  t("the count is not claimed: it stays 'View games', never '0 completed'",
    h.text("xiCount") === "View games", h.text("xiCount"));
  t("and no card is marked on a guess", !h.d.querySelector(".gcard.done"));
  h.dom.window.close();
  apiDown = false;
}

server.close();

/* ======================================================================
   3. WHERE "BROWSE PREVIOUS DAILIES" GOES
   ====================================================================== */
console.log("\n/football/archive/, run");
{
  const { themeArchiveRoute } = await import("../functions/_lib/archive-page.js");
  const { PERMA_GAMES, gamePath, themeOf } = await import("../functions/_lib/permalink.js");
  const { isListed } = await import("../functions/_lib/games.js");
  const r = await themeArchiveRoute({ env: {} }, "football");
  const page = await r.text();
  const listed = Object.keys(PERMA_GAMES).filter((g) => isListed(g) && themeOf(g) === "football");
  const hidden = Object.keys(PERMA_GAMES).filter((g) => !isListed(g));
  t("it answers 200, and it is a page a crawler may index", r.status === 200 && !/noindex/.test(page));
  t("it links every listed football game's own archive",
    listed.length >= 10 && listed.every((g) => page.includes(`href="${gamePath(g)}archive/"`)), `${listed.length} games`);
  t("and never an unlisted game, by address or by name",
    hidden.length > 0 && hidden.every((g) => !page.includes(gamePath(g)) && !page.includes(PERMA_GAMES[g].name)),
    hidden.join(", "));
  /* THE CHECK ABOVE PASSES FOR A REASON THAT IS NOT THE GUARD: today's
     unlisted games are all Friends ones, and the theme filter drops those
     first. So a FOOTBALL game is made unlisted, through the real UNLISTED
     table that isListed reads, and the page is run again. */
  const games = await import("../functions/_lib/games.js");
  games.UNLISTED.ballpark = true;
  let again = "";
  try { again = await (await themeArchiveRoute({ env: {} }, "football")).text(); }
  finally { delete games.UNLISTED.ballpark; }
  t("an unlisted FOOTBALL game is left off too: the page asks isListed itself",
    !again.includes("/football/ballpark/") && !again.includes("Ballpark XI") && again.includes("/football/hilo/archive/"));
  const { onRequestGet: sitemap } = await import("../functions/sitemap.xml.js");
  const xml = await (await sitemap({ env: {}, request: new Request("https://www.thexigames.com/sitemap.xml") })).text();
  t("the sitemap offers it", xml.includes("https://www.thexigames.com/football/archive/"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
