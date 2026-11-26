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
import { localResources } from "./local_resources.js";
import { namedSlots } from "./squad.mjs";

/* THE LINE-UP IS THE SQUAD'S, NOT A NUMBER WRITTEN HERE. This suite said "ten
   cards", "the shirts run 1 to 10" and "2 of 10 completed" until 26 Nov 2026,
   when the owner scaled the site back to three games and every one of those
   was a literal defending a fact that had stopped being true. */
const SQUAD = namedSlots("football");
const N = SQUAD.length;

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
  t("PRECONDITION: the football squad offers at least two games", N >= 2, `${N} named slots`);
  t("a card and a shirt for every game the squad offers, in the file, not built by script",
    cards.length === N && shirts.length === N, `${cards.length} cards, ${shirts.length} shirts, ${N} in the squad`);
  const shirtIds = shirts.map((s) => (s.getAttribute("href").match(/^\/football\/([a-z]+)\/$/) || [])[1]);
  const nums = shirts.map((s) => Number(s.querySelector(".dot").textContent));
  t("the shirts are the squad's own numbers, in shirt order",
    nums.join() === SQUAD.map((g) => g.n).join(), nums.join(","));
  t("and each shirt links the game the squad puts on that number",
    shirts.map((sh) => sh.getAttribute("href")).join() === SQUAD.map((g) => g.href).join());
  t("the cards are in shirt order: the same games, the same order, as the shirts",
    cards.map((c) => c.getAttribute("data-game")).join() === shirtIds.join(), shirtIds.join(" "));
  const oneLink = cards.filter((c) => {
    const links = [...c.querySelectorAll("a")];
    return links.length === 1 && links[0].getAttribute("href") === "/football/" + c.getAttribute("data-game") + "/";
  });
  t("every card is ONE link, to its own game's home", N > 0 && oneLink.length === N, `${oneLink.length} of ${N}`);
  t("no card starts a board: nothing links ?play=1", !HTML.includes("?play=1"));
  t("every card shows its shirt number and its name",
    cards.length === N && cards.every((c, i) => c.querySelector(".gcard-num").textContent.trim() === String(SQUAD[i].n) &&
      c.querySelector(".gcard-title").textContent.trim() === SQUAD[i].name));
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
    runScripts: "dangerously", resources: localResources(), pretendToBeVisual: true,
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
  t("the count says 0 of every game offered: each was read, and nothing is done", h.text("xiCount") === `0 of ${N} completed`, h.text("xiCount"));
  t("no card is marked completed", !h.d.querySelector(".gcard.done"));
  h.dom.window.close();
}

console.log("\nA returning player who has finished two games today");
{
  DAY = "2026-09-23"; NO = 6; apiDown = false;
  /* TWO GAMES THE SQUAD OFFERS, and a third it offers that was not played.
     HiLo was the second until it left the line-up; QuickFire's record is keyed
     on the day the same way. Stated as a precondition, so the day either game
     leaves the squad this says which, rather than failing somewhere below. */
  const offered = SQUAD.map((g) => g.dir);
  const idle = SQUAD.find((g) => g.dir !== "crossword" && g.dir !== "quickfire");
  t("PRECONDITION: the squad offers Crossword, QuickFire and a third game",
    offered.includes("crossword") && offered.includes("quickfire") && !!idle, offered.join(","));
  const shirtOf = (dir) => h.d.getElementById("shirt" + SQUAD.find((g) => g.dir === dir).n);
  const h = await hub({
    "fcw.results.v1": [{ dailyNo: 6, complete: true, score: 86 }],
    "qfx.results.v1": [{ day: "2026-09-23", score: 70 }],
  }, counted);
  t("the introduction is hidden: this device has played before", h.d.getElementById("hubIntro").hidden);
  const done = [...h.d.querySelectorAll(".gcard.done")].map((c) => c.getAttribute("data-game"));
  t("exactly those two cards are completed", done.join() === "crossword,quickfire", done.join());
  const c = h.card("crossword");
  t("in words, not colour alone: the badge shows and the action says so",
    !c.querySelector(".gcard-done").hidden && c.querySelector(".gcard-act").textContent === "View today’s result");
  t("and the card still opens its game's home, where the result is",
    c.querySelector("a").getAttribute("href") === "/football/crossword/");
  t("the shirts in Today's XI agree", shirtOf("crossword").classList.contains("done") &&
    shirtOf("quickfire").classList.contains("done") && !shirtOf(idle.dir).classList.contains("done"));
  t("the count reads 2 of every game offered", h.text("xiCount") === `2 of ${N} completed`, h.text("xiCount"));
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
    listed.length >= 2 && listed.every((g) => page.includes(`href="${gamePath(g)}archive/"`)), `${listed.length} games`);
  const benched = hidden.filter((g) => themeOf(g) === "football");
  t("and no unlisted football game's, by address or by name",
    benched.every((g) => !page.includes(gamePath(g)) && !page.includes(PERMA_GAMES[g].name)), benched.join(", ") || "none unlisted");
  /* NEVER ANOTHER THEME'S GAME. This asked for "never an unlisted game" while
     today's unlisted games were the Friends ones; they went public on 27 Sep
     2026 (the owner: "only /Friends shows frineds games"), so the Friends
     games are LISTED and must still never appear on a football page. The
     unlisted rule itself is proved just below, on a football game made
     unlisted through the real table. */
  const others = Object.keys(PERMA_GAMES).filter((g) => themeOf(g) !== "football");
  t("and never another theme's game, by address or by name",
    others.length > 0 && others.every((g) => !page.includes(gamePath(g)) && !page.includes(PERMA_GAMES[g].name)),
    others.join(", ") + (hidden.length ? "; unlisted: " + hidden.join(", ") : ""));
  /* THE CHECK ABOVE IS THE THEME FILTER, NOT THE UNLISTED GUARD, and since
     27 Sep 2026 no game is unlisted at all. So a FOOTBALL game is made
     unlisted, through the real UNLISTED table that isListed reads, and the
     page is run again. */
  /* WHICH GAME IS HIDDEN IS TAKEN FROM THE LISTED SET, not named: this hid
     Ballpark and looked for HiLo, and HiLo left the line-up on 26 Nov 2026. */
  const games = await import("../functions/_lib/games.js");
  const victim = listed[listed.length - 1], keeper = listed[0];
  games.UNLISTED[victim] = true;
  let again = "";
  try { again = await (await themeArchiveRoute({ env: {} }, "football")).text(); }
  finally { delete games.UNLISTED[victim]; }
  t("an unlisted FOOTBALL game is left off too: the page asks isListed itself",
    victim !== keeper && isListed(victim) && !again.includes(gamePath(victim)) && !again.includes(PERMA_GAMES[victim].name) &&
    again.includes(gamePath(keeper) + "archive/"), `hid ${victim}, kept ${keeper}`);
  const { onRequestGet: sitemap } = await import("../functions/sitemap.xml.js");
  const xml = await (await sitemap({ env: {}, request: new Request("https://www.thexigames.com/sitemap.xml") })).text();
  t("the sitemap offers it", xml.includes("https://www.thexigames.com/football/archive/"));
}

/* THE FRIENDS HUB'S "Browse previous dailies", public since 27 Sep 2026. The
   same route for the other theme, and the mirror of the check above: its own
   games, and none of football's. */
console.log("\n/friends/archive/, run");
{
  const { onRequestGet } = await import("../functions/friends/archive/index.js");
  const { onRequest: hubRoute } = await import("../functions/friends/index.js");
  const { PERMA_GAMES, gamePath, themeOf, THEMES, themeHubPath } = await import("../functions/_lib/permalink.js");
  const games = await import("../functions/_lib/games.js");
  const { onRequestGet: sitemap } = await import("../functions/sitemap.xml.js");
  const mine = Object.keys(PERMA_GAMES).filter((g) => themeOf(g) === "friends");
  const theirs = Object.keys(PERMA_GAMES).filter((g) => themeOf(g) === "football");
  const ask = () => onRequestGet({ env: {}, request: new Request("https://www.thexigames.com/friends/archive/") });
  const askHub = () => hubRoute({ env: { ASSETS: { fetch: () => new Response("the friends hub") } },
    request: new Request("https://www.thexigames.com/friends/") });
  const askMap = async () => (await (await sitemap({ env: {}, request: new Request("https://www.thexigames.com/sitemap.xml") })).text());
  const SITE = "https://www.thexigames.com";

  /* BOTH STATES, WHATEVER THE TREE HOLDS. Friends was two public games when
     this was written, seven by October, and none from 26 Nov 2026 (the owner:
     "0 friends for now"). A check of only the state the tree happens to be in
     proves half the route, so each state is MADE through the real UNLISTED
     table, the routes are run, and the table is put back. */
  const was = { ...games.UNLISTED };
  const restore = () => { for (const k of Object.keys(games.UNLISTED)) delete games.UNLISTED[k]; Object.assign(games.UNLISTED, was); };
  t("PRECONDITION: Friends has games to list and to hide", mine.length >= 2 && theirs.length >= 2, mine.join(", "));
  try {
    /* 1. Friends with listed games: all of them. */
    for (const g of mine) delete games.UNLISTED[g];
    let r = await ask(); let page = await r.text();
    t("with Friends listed, its archive answers 200 and links every Friends game's archive",
      r.status === 200 && mine.every((g) => page.includes(`href="${gamePath(g)}archive/"`)), `${r.status}, ${mine.join(", ")}`);
    t("and no football game, by address", theirs.every((g) => !page.includes(gamePath(g))));
    r = await askHub();
    t("and its hub is served as the static page", r.status === 200 && (await r.text()) === "the friends hub", String(r.status));
    let xml = await askMap();
    t("and the sitemap offers the picker, both theme hubs and every Friends game",
      ["/", "/football/", "/friends/", ...mine.map(gamePath)].every((u) => xml.includes(SITE + u + "<")));

    /* 2. Friends with none: every one hidden. */
    for (const g of mine) games.UNLISTED[g] = true;
    r = await ask(); page = await r.text();
    t("with no Friends game listed, its archive goes to the front door, temporarily, saying nothing",
      r.status === 302 && r.headers.get("Location") === "/" && page === "" && /noindex/.test(r.headers.get("X-Robots-Tag") || ""),
      `${r.status} ${r.headers.get("Location")}`);
    r = await askHub();
    t("and so does its hub: the static page that names every Friends game is not served",
      r.status === 302 && r.headers.get("Location") === "/" && (await r.text()) === "", `${r.status} ${r.headers.get("Location")}`);
    xml = await askMap();
    t("and the sitemap offers no Friends address at all",
      !xml.includes(SITE + "/friends/") && xml.includes(SITE + "/football/<") && xml.includes(SITE + "/<"));
  } finally { restore(); }

  /* AND THE TREE AS IT STANDS: every theme with a listed game has its hub in
     the sitemap, and no other theme has. */
  const xml = await askMap();
  const live = THEMES.filter((th) => games.GAMES.some((g) => themeOf(g) === th && games.isListed(g)));
  t("as the tree stands, the sitemap offers the hub of each theme with a listed game, and of no other",
    live.length >= 1 && THEMES.every((th) => xml.includes(SITE + themeHubPath(th) + "<") === live.includes(th)), live.join(", "));
}

/* THE ROOT IS THE THEME PICKER (the owner, 29 Sep 2026: "make the theme
   selector now / Only Friends and Football so far / make it look good").
   Run, not read: the real route, and what it answers. */
console.log("\n/, run");
{
  const { onRequest, listedThemes, picker, themeCardPath } = await import("../functions/index.js");
  const games = await import("../functions/_lib/games.js");
  const { GAMES, isListed, LABELS } = games;
  const { themeOf, gamePath } = await import("../functions/_lib/permalink.js");
  let asked = null;
  const r = await onRequest({ env: { ASSETS: { fetch: (u) => { asked = String(u); return new Response("the football hub"); } } },
    request: new Request("https://www.thexigames.com/") });
  const page = await r.text();
  t("the root answers the picker itself, not a theme's hub", r.status === 200 && asked === null && /class="pk-themes[ "]/.test(page),
    asked ? "served " + asked : String(r.status));
  const themes = listedThemes();
  t("PRECONDITION: at least one theme is listed, and football is first", themes.length >= 1 && themes[0] === "football", themes.join());
  /* A CARD IS A SECTION WHOSE BUTTON IS ITS LINK, since 26 Nov 2026: the games
     on it are links of their own, and a link cannot sit inside a link. */
  const cardsOf = (html) => [...html.matchAll(/<section class="pk-card pk-([a-z]+)"[\s\S]*?<a class="pk-go" href="([^"]+)"/g)].map((m) => m[1] + " " + m[2]);
  const hrefs = cardsOf(page);
  t("a card for each listed theme, its button pointing where the theme's card should",
    hrefs.join(" | ") === themes.map((th) => th + " " + themeCardPath(th)).join(" | "), hrefs.join(" | "));
  /* THE FRONT DOOR SHOWS EVERY GAME (the owner, 26 Nov 2026: "id like an home
     page that shows all + /football shows only football or click football on
     the root page"). Each listed game is a link to its own address, and a game
     the site does not advertise is neither linked nor named. */
  const listed = GAMES.filter(isListed), benched = GAMES.filter((g) => !isListed(g));
  t("every listed game is one click from the front door, at its own address",
    listed.length >= 2 && listed.every((g) => page.includes(`<a href="${gamePath(g)}">`)), listed.join(", "));
  /* A card drops its theme from a game's name, so "Crossword XI: Friends" would
     read "Crossword XI" -- the same words as football's. A hidden game's name
     is looked for only where no listed game legitimately shows those words. */
  const bare = (g) => String(LABELS[g]).replace(/: [A-Z][a-z]+$/, "");
  const shown = new Set(listed.map(bare));
  t("and no unlisted game is linked or named there",
    benched.every((g) => !page.includes(gamePath(g)) && (shown.has(bare(g)) || !page.includes(">" + bare(g) + "<"))),
    benched.join(", ") || "none unlisted");
  const counts = themes.map((th) => GAMES.filter((g) => themeOf(g) === th && isListed(g)).length);
  t("each card counts its theme's listed games, from the games list",
    themes.every((th, i) => page.includes(counts[i] + " daily game")), counts.join(", "));
  /* TWO THEMES, MADE RATHER THAN ASSUMED: with a Friends game listed through
     the real table, there are two cards and the Friends one names its game
     without repeating the theme. And with one theme, the lone card is centred. */
  const was = { ...games.UNLISTED };
  let two = "";
  try { delete games.UNLISTED.lightning_fr; two = picker(listedThemes()); }
  finally { for (const k of Object.keys(games.UNLISTED)) delete games.UNLISTED[k]; Object.assign(games.UNLISTED, was); }
  t("with a Friends game listed there are two cards, football first",
    cardsOf(two).map((c) => c.split(" ")[0]).join() === "football,friends", cardsOf(two).join(" | "));
  t("and a game is named without repeating its theme", two.includes('<a href="/friends/lightning/">Lightning Round XI</a>') &&
    !two.includes("Lightning Round XI: Friends</a>"));
  const one = picker(["football"]);
  t("a lone theme's card is marked to sit centred, and two are not",
    one.includes('class="pk-themes pk-one"') && two.includes('class="pk-themes"'));
  t("it is canonical at the root, and indexable", page.includes('<link rel="canonical" href="https://www.thexigames.com/">') &&
    !page.includes("noindex"));
  t("and it shows no show imagery: no image at all", !/<img|url[(]/.test(page));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
