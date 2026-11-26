/* tools/streaks_test.mjs — the Friends streaks, counted from what the games bank.
 *
 *   npm install -D jsdom --no-save
 *   node tools/streaks_test.mjs      (from the repo root)
 *
 * The owner, 28 Sep 2026: "W and L is for football, Friends should be about
 * streaks only / lets still have any game + specific game streaks / any game
 * can be just 1 play unlike football needing 2 games". The Friends games keep
 * no season (NO_SEASON in functions/_lib/games.js), so shared/xi-played.js
 * counts their streaks from each game's own results on the device, and
 * shared/xi-menu.js paints them.
 *
 * THE SQUAD IS THE PRODUCER'S: shared/xi-chrome.js is loaded for real, at a
 * Friends address, so the games a theme has are the ones the site says it has.
 *
 * AND THE BUG THIS FOUND: xi-played.js read a game's id off the last segment
 * of its address, so /friends/crossword/ resolved to FOOTBALL's crossword and a
 * Friends page asked football's results what had been played.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const TODAY = "2026-09-28";
const day = (n) => new Date(Date.parse(TODAY + "T00:00:00Z") - n * 86400000).toISOString().slice(0, 10);
const noon = (d) => Date.parse(d + "T12:00:00Z");

function page(url, store) {
  const dom = new JSDOM("<!doctype html><html><body><header class=\"xic-bar\"></header><footer class=\"xic-foot\"></footer></body></html>",
    { url, runScripts: "outside-only" });
  const w = dom.window;
  for (const [k, v] of Object.entries(store || {})) w.localStorage.setItem(k, JSON.stringify(v));
  w.fetch = () => Promise.reject(new Error("offline"));
  w.eval(read("shared/xi-chrome.js"));
  w.eval(read("shared/xi-played.js"));
  return w;
}

console.log("=== A game's id, by its address and theme ===");
{
  const w = page("https://www.thexigames.com/friends/whoami/");
  const P = w.XIPlayed;
  t("the Friends crossword is crossword_fr, not football's crossword",
    P.idOf("/friends/crossword/") === "crossword_fr", P.idOf("/friends/crossword/"));
  t("and Friends Who Am I is whoami_fr", P.idOf("/friends/whoami/") === "whoami_fr", P.idOf("/friends/whoami/"));
  t("and Lightning Round is lightning_fr", P.idOf("/friends/lightning/") === "lightning_fr", P.idOf("/friends/lightning/"));
  t("and QuickFire, Friends, is quickfire_fr, not football's quickfire",
    P.idOf("/friends/quickfire/") === "quickfire_fr" && P.idOf("/football/quickfire/") === "quickfire", P.idOf("/friends/quickfire/"));
  t("and Scrambled and Vowels, Friends, are theirs", P.idOf("/friends/scrambled/") === "scrambled_fr" &&
    P.idOf("/friends/vowels/") === "vowels_fr", P.idOf("/friends/scrambled/") + " " + P.idOf("/friends/vowels/"));
  t("and Wordsearch, Friends, is wordsearch_fr while football's keeps wordsearch",
    P.idOf("/friends/wordsearch/") === "wordsearch_fr" && P.idOf("/football/wordsearch/") === "wordsearch",
    P.idOf("/friends/wordsearch/") + " " + P.idOf("/football/wordsearch/"));
  t("while football's Scrambled and Vowels keep theirs", P.idOf("/football/scrambled/") === "scrambled" &&
    P.idOf("/football/vowels/") === "vowels");
  t("football's keep their own ids", P.idOf("/football/crossword/") === "crossword" && P.idOf("/football/whoami/") === "whoami");
  /* THE PROBES ARE THE GAMES THAT HAVE RESULTS; THE SQUAD IS THE GAMES THE SITE
     OFFERS. They were one list until 26 Nov 2026, when every Friends game was
     unlisted, and this asserted both in one line. The probes are still seven,
     each under its own key; what list() returns is whatever the squad names,
     joined to those probes -- asked of the squad as it stands, and of football's
     too so the join is exercised on a day Friends names nothing. */
  const fr = P.PROBE.filter((p) => p.theme === "friends");
  t("the Friends probes are the seven Friends games, each under its own key",
    fr.map((p) => p.id).join(",") === "crossword_fr,whoami_fr,lightning_fr,scrambled_fr,vowels_fr,wordsearch_fr,quickfire_fr" &&
      fr.map((p) => p.key).join(",") ===
        "xifc.results,xifw.results.v1,xifl.results.v1,xifs.results,xifv.results,xifws.results,xifq.results.v1",
    fr.map((p) => p.id).join(","));
  const offered = (theme) => (w.XIChrome.squads[theme] || []).filter((g) => g.name && g.href);
  for (const theme of ["friends", "football"]) {
    const want = offered(theme).map((g) => P.idOf(g.href)).join(","), got = P.list(theme).map((g) => g.id).join(",");
    t(`list("${theme}") is the games its squad offers, joined to their probes`,
      got === want && P.list(theme).every((g) => g.key && g.href && g.name), got || "none offered");
  }
  t("and the join was exercised: football's squad offers games", offered("football").length >= 1 && P.list("football").length >= 1);
}

console.log("\n=== Which days count ===");
{
  const w = page("https://www.thexigames.com/friends/whoami/", {
    "xifw.results.v1": [
      { day: day(0), score: 60, at: noon(day(0)) },
      { day: day(1), score: 40, at: noon(day(1)) },
      /* a board of four days ago, finished three days ago: catch-up play */
      { day: day(4), score: 30, at: noon(day(3)) },
      /* a row with no finish time cannot say, and counts */
      { day: day(6), score: 20 },
    ],
    "xifc.results": [{ date: day(2), dailyNo: 5, at: noon(day(2)) }],
    /* FOOTBALL'S RESULTS, on the same days: never a Friends streak's */
    "fcw.results.v1": [{ date: day(3), dailyNo: 9, at: noon(day(3)) }],
    "xiwa.results.v1": [{ day: day(3), score: 70, at: noon(day(3)) }],
  });
  const P = w.XIPlayed;
  const got = P.playedDays("whoami_fr");
  t("a board finished on its own day counts", got.includes(day(0)) && got.includes(day(1)), got.join(" "));
  t("a board finished on a later day does not: catch-up play does not mend a run",
    !got.includes(day(4)), got.join(" "));
  t("a row with no finish time counts", got.includes(day(6)));
  t("the crossword's own date field is read", P.playedDays("crossword_fr").join() === day(2));

  const st = P.themeStreaks("friends", "whoami_fr", TODAY);
  t("this game's streak: today and yesterday, 2", st.game === 2, String(st.game));
  /* WHATEVER THE SQUAD NAMES. The run is read from the probes, so it is the
     same 3 while every Friends game is unlisted as it was while all were
     named -- and that it does not come from the squad is the point. */
  t("any Friends game: the crossword two days ago joins the run, 3", st.daily === 3, String(st.daily));
  t("and that holds with no Friends game named on the squad: a run is what was played, not what is advertised",
    P.list("friends").length === 0 ? st.daily === 3 : true, P.list("friends").length + " named");
  t("and football's results on day 3 do not reach it", st.daily === 3, String(st.daily));
}

console.log("\n=== The run ===");
{
  const P = page("https://www.thexigames.com/friends/crossword/").XIPlayed;
  t("played today and the two days before: 3", P.runOf([day(0), day(1), day(2)], TODAY) === 3);
  t("today still open: yesterday's run stands", P.runOf([day(1), day(2)], TODAY) === 2);
  t("a missed day ends it", P.runOf([day(0), day(2), day(3)], TODAY) === 1);
  t("two days ago and nothing since: no run", P.runOf([day(2)], TODAY) === 0);
  t("nothing played: 0", P.runOf([], TODAY) === 0);
  t("no server day: 0, never the device's clock", P.runOf([day(0)], null) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
