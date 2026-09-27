/* table_test.mjs — the live league table, shared by the football games.
 *
 * Your score IS your club's points in a real historical season. Finish on 82
 * and you won the league in 1995/96; finish on 34 and you went down. The
 * crossword has had this from the beginning and it is the best thing in it;
 * four more games are getting it, so the logic moved to shared/xi-table.js and
 * the crossword's engine now delegates rather than keeping a second copy.
 *
 * THE CHECK THAT MATTERS MOST is that the crossword's answer did not change on
 * the way out. A table that ranks somebody differently after a refactor is a
 * silent regression in the one number a player watches all the way through.
 *
 * IT IS NOT THE SEASON. There is one of those and it belongs to the hub — a
 * result a day across the family, counted from finishes (shared/xi-season.js).
 * A per-board ladder and a family season are different things, and confusing
 * them is exactly what the invented 38-game strip did.
 *
 *   node tools/table_test.mjs        (from the repo root)
 */
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XITable = require("../shared/xi-table.js");

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

/* The real thirty seasons, loaded the way a page loads them. */
const sandbox = { window: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("shared/xi-seasons.js", "utf8"), sandbox);
const SEASONS = sandbox.XI_SEASONS;
globalThis.XI_SEASONS = SEASONS;

console.log("The seasons are real, and complete");
{
  t("thirty of them are loaded", SEASONS.length >= 30, SEASONS.length + " seasons");
  const bad = SEASONS.filter((s) => !s.table || s.table.length !== 20).map((s) => s.season);
  t("every one is a twenty-club table", bad.length === 0, bad.join(", ") || "all 20");
  t("and both names point at the same array, not a copy",
    sandbox.window.XI_SEASONS === sandbox.window.FCW_SEASONS,
    "a second list is a list that can drift");
}

const s96 = SEASONS.find((s) => s.season === "1995/96");

console.log("\nYour score is your club's points");
{
  const table = XITable.buildTable("Everton", 82, s96);
  t("the ladder is twenty long", table.length === 20, table.length + " rows");
  const you = table.find((r) => r.isPlayer);
  t("you are in it, once, with your score",
    !!you && you.club === "Everton" && you.points === 82 &&
    table.filter((r) => r.isPlayer).length === 1, JSON.stringify(you));
  t("and 82 in 1995/96 wins the league",
    XITable.playerPosition(table) === 1,
    "Manchester United took it on 82 that year, and a tie goes to the player");
  t("nought puts you bottom",
    XITable.playerPosition(XITable.buildTable("Everton", 0, s96)) === 20);
  /* THE REAL CLUB'S ROW IS REPLACED, NOT ADDED BESIDE. Everton played that
     season; two Evertons in one table is the bug this guards. */
  t("your club appears once, not twice",
    table.filter((r) => r.club === "Everton").length === 1);
  t("and the other nineteen keep their real points",
    table.filter((r) => !r.isPlayer).every((r) =>
      s96.table.some((h) => h.club === r.club && h.points === r.points)),
    "the ladder is history with your score dropped into it");
}

console.log("\nA club that did not play that season");
{
  /* Luton were not in the Premier League in 1995/96. The player still gets a
     place: the bottom club is displaced, so the ladder is always twenty. */
  const table = XITable.buildTable("Luton Town", 40, s96);
  t("you take the bottom club's place, and the ladder stays twenty",
    table.length === 20 && table.filter((r) => r.isPlayer).length === 1);
  const bottom = s96.table[s96.table.length - 1].club;
  t("and it is the bottom club that makes way",
    !table.some((r) => r.club === bottom), "displaced: " + bottom);
}

console.log("\nA tie goes to the player");
{
  /* Somebody finishing level with a real club is ahead of them, not behind.
     A player who drew with fourth and was shown fifth would be reading a
     worse result than they got. */
  const rival = s96.table[5];
  const table = XITable.buildTable("Luton Town", rival.points, s96);
  const you = XITable.playerPosition(table);
  const them = table.find((r) => r.club === rival.club).pos;
  t("level on points puts you above them", you < them, `you ${you}, ${rival.club} ${them}`);
}

console.log("\nThe crossword's answer did not change");
{
  /* THE REGRESSION CHECK. The engine's buildTable and playerPosition are now
     one-line delegations to this module, so the two must agree on every
     season, every club and a spread of scores — not on one sample. */
  const FCW = require("../football/crossword/js/engine.js");
  let compared = 0;
  const differ = [];
  for (const season of SEASONS) {
    for (const club of [season.table[0].club, season.table[10].club,
                        season.table[19].club, "Luton Town"]) {
      for (const score of [0, 1, 33, 61, 82, 113, 114]) {
        const mine = XITable.buildTable(club, score, season);
        const theirs = FCW.buildTable(club, score, season);
        compared++;
        if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
          differ.push(`${season.season} ${club} ${score}`);
        }
        if (XITable.playerPosition(mine) !== FCW.playerPosition(theirs)) {
          differ.push(`${season.season} ${club} ${score} (position)`);
        }
      }
    }
  }
  t("the engine and the shared module agree, everywhere",
    differ.length === 0,
    differ.length ? "DIFFER: " + differ.slice(0, 4).join(" | ") : compared + " tables compared");
  t("and the engine holds no second copy of either",
    (() => {
      const src = fs.readFileSync("football/crossword/js/engine.js", "utf8");
      const build = src.slice(src.indexOf("function buildTable"), src.indexOf("function playerPosition"));
      return /sharedTable\(\)/.test(build) && !/rows\.sort/.test(build);
    })(),
    "it delegates rather than duplicating");
}

console.log("\nEverybody on a board sees the same ladder");
{
  /* THE SEED IS THE SERVER'S DAY OR THE BOARD'S NUMBER, never a random and
     never a device clock: two players on one board comparing positions is the
     whole point of the thing. */
  const a = XITable.pickSeason("Everton", "2026-09-06");
  const b = XITable.pickSeason("Everton", "2026-09-06");
  t("the same board picks the same season, twice", a && b && a.season === b.season, a && a.season);
  const other = XITable.pickSeason("Everton", "2026-09-07");
  t("and a different day is free to pick another",
    !!other, `${a && a.season} then ${other && other.season}`);
  /* ASKED OF A CLUB THAT PLAYED ONE SEASON, not an ever-present. This was
     asked of Everton, who have played all thirty — so a pick from the whole
     list would have satisfied it by luck, and a sabotage that ignored the
     club entirely stayed green. Barnsley played 1997/98 and nothing else, so
     there is exactly one right answer. */
  const rare = XITable.seasonsForClub("Barnsley");
  t("the club is a one-season club, so the question has one answer",
    rare.length === 1, rare.map((s) => s.season).join(", "));
  t("the season picked is one the club actually played in",
    XITable.pickSeason("Barnsley", "2026-09-06").season === rare[0].season &&
    XITable.pickSeason("Barnsley", "2026-11-30").season === rare[0].season,
    "a ladder your club was never in is a ladder about somebody else");
  /* A club that never made the top flight still gets a season rather than
     nothing — the alternative is a game with no table for some choices. */
  t("a club that never played gets a season anyway",
    !!XITable.pickSeason("Not A Real Club", "2026-09-06"));
}

console.log("\nWhat it does when there is nothing to draw");
{
  t("no season is an empty table, not a crash",
    XITable.buildTable("Everton", 50, null).length === 0);
  t("and a position can still be asked for", XITable.playerPosition([]) === 0);
}

console.log("\nThe rows it renders");
{
  const table = XITable.buildTable("Everton", 61, s96);
  const cells = [];
  const tbody = {
    set innerHTML(v) { cells.push(v); },
    get innerHTML() { return cells[cells.length - 1] || ""; },
  };
  XITable.renderRows(tbody, table, 1);
  const html = tbody.innerHTML;
  t("every one of the twenty is rendered",
    (html.match(/<tr/g) || []).length === 20,
    "hidden by CSS, not dropped — the table is complete to a screen reader");
  t("the player's row is marked", (html.match(/class="you/g) || []).length === 1);
  const far = (html.match(/faroff/g) || []).length;
  t("and the ones nowhere near the player are marked to hide",
    far === 17, far + " of 20 marked far off");
  /* A CLUB NAME IS DATA. These come from a stored table rather than a player,
     but a renderer that writes raw HTML is a renderer that will be handed
     something else one day. */
  const nasty = [{ pos: 1, club: '<img src=x onerror="alert(1)">', points: 1, isPlayer: false }];
  XITable.renderRows(tbody, nasty, 1);
  t("and a club name is escaped rather than written as markup",
    tbody.innerHTML.indexOf("<img") === -1 && tbody.innerHTML.indexOf("&lt;img") > -1);
}

console.log("\nThe club is the family's, not one game's");
{
  t("it is stored under the family prefix",
    XITable.CLUB_KEY.indexOf("xi.") === 0 &&
    !/fcw\.|xiws\.|xisc\.|xihl\.|xivw\./.test(XITable.CLUB_KEY), XITable.CLUB_KEY);
  t("so picking a club in one game picks it in all of them",
    XITable.CLUB_KEY === "xi.club",
    "asking a settled question four more times is asking it four times too many");
}

console.log("\nOne bank, two games, two ladders");
{
  /* SCRAMBLED AND VOWELS READ ONE BANK TWO WAYS, and boardForNumber puts them
     half a ring apart — on any given day they are different elevens that share
     a board NUMBER. Seeding the table on that number gave both games the same
     historical season on the same day: one ladder for two boards, so a player
     doing both played the same season twice and the two games felt like one.
     Spotted by the owner before it shipped.

     The token is the board's identity rather than the day's — sc:12 against
     sc:c:12 — so this checks the two rarely land on the same season, across a
     fortnight rather than on one lucky day. Some collisions are expected: two
     independent picks from thirty seasons will agree now and then, and a check
     demanding they never do would be demanding the arithmetic be rigged. */
  const same = [];
  for (let n = 1; n <= 14; n++) {
    const a = XITable.pickSeason("Everton", "sc:" + n);
    const b = XITable.pickSeason("Everton", "sc:c:" + n);
    if (a && b && a.season === b.season) same.push(`day ${n}: both ${a.season}`);
  }
  t("the two cypher games get different seasons on the same day",
    same.length <= 2, same.length ? same.join(" | ") : "14 days, all different");
  /* BOTH PAGES SEEDED THEIR LIVE LADDER ON THE TOKEN, and that was checked
     here until the ladder came off the play screen (27 Sep 2026). The
     arithmetic above stays: it is the module's, and a table built later from
     it must still give the two cypher games different seasons. */
}

console.log("\nNo game has a league table while it is being played");
{
  /* THE OWNER, 27 Sep 2026: "Please can the table underneath the clues be
     removed from the games / we track points out of 114, we display it on the
     closing (hidden by default) and its not needed in the game".
     Until then this block held five games to having all three parts of a live
     table (the panel, the module, the mount) and QuickFire to having none. The
     rule is now the QuickFire row for everybody: no panel on the play screen,
     and in the games whose panel was the shared one (xi-table.js), no module
     or mount left behind either -- a script loaded to draw into a box that is
     not there is dead weight that looks like a working feature. The crossword
     still builds a table, for Full Time, through its own engine; that is not
     the play screen and is not counted here. */
  const GAMES = [
    { dir: "football/crossword", fullTimeOnly: true },
    { dir: "football/wordsearch" },
    { dir: "football/scrambled" },
    { dir: "football/vowels" },
    { dir: "football/hilo" },
    { dir: "football/quickfire" },
    { dir: "friends/crossword", fullTimeOnly: true },
  ];
  const panel = [], wiring = [];
  for (const g of GAMES) {
    const code = fs.readFileSync(`${g.dir}/index.html`, "utf8")
      .replace(/<!--[\s\S]*?-->/g, " ");
    const js = fs.readFileSync(`${g.dir}/js/game.js`, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
    if (/id="tablePanel"|id="leagueBody"/.test(code)) panel.push(g.dir);
    if (!g.fullTimeOnly && (/xi-table\.js/.test(code) || /XITable\.mount\(/.test(js) || /xi-seasons\.js/.test(code))) {
      wiring.push(g.dir);
    }
  }
  /* A floor, so a walk that reads nothing cannot pass: every page was read. */
  t("every game's page was read", GAMES.length === 7);
  t("no game has a league table panel on its play screen",
    panel.length === 0, panel.join(", ") || GAMES.map((g) => g.dir.split("/").pop()).join(", "));
  t("and none keeps the shared table's script or mount for a panel that is gone",
    wiring.length === 0, wiring.join(", ") || "nothing left behind");
}


console.log("\n=== THE SEASON LADDER, before the season is over ===");
{
  /* A league table is a thing you have after 38 games, and the hub wants one
     from day one. The honest way is not to divide: the PLAYER has whatever
     they have — after a day that is 0, 1 or 3, because a day is a match — and
     the historical sides are put on what they would have had after the same
     number of days. */
  const T = XITable;

  console.log("\nWhat a score can be");
  t("after one game a season holds 0, 1 or 3 points, and nothing else",
    T.reachablePoints(1).join(",") === "0,1,3", T.reachablePoints(1).join(","));
  t("after two, five is still impossible",
    T.reachablePoints(2).join(",") === "0,1,2,3,4,6", T.reachablePoints(2).join(","));
  /* MY EXPECTATION HERE WAS WRONG AND THE CODE WAS RIGHT, which is worth
     leaving in the file rather than quietly correcting: 0 to 114 is 115
     numbers and only 114 of them can be had. 113 is the one that cannot —
     thirty-seven wins and two draws is 113 points and THIRTY-NINE matches,
     and there are only 38. A perfect season is 114 and the next thing below it
     is 112. */
  t("a full season can hold 114 totals, and 113 is not one of them",
    T.reachablePoints(38).length === 114 &&
    T.reachablePoints(38).indexOf(113) === -1 &&
    T.reachablePoints(38).indexOf(114) !== -1 &&
    T.reachablePoints(38).indexOf(112) !== -1,
    "37 wins and 2 draws is 39 matches");
  t("nothing is reachable in no games but nothing",
    T.reachablePoints(0).join(",") === "0");

  console.log("\nThe owner's example, exactly");
  /* "a team on 76 points over 38 is on 2 after one but 2 isn't possible so
     it's 3" — the case this whole function exists for. */
  t("a side on 76 over 38 shows 3 after one day, not 2",
    T.snapToReachable(76 / 38, 1) === 3, String(T.snapToReachable(76 / 38, 1)));
  t("and 2 is genuinely what dividing gives, so the snap is doing the work",
    76 / 38 === 2);
  t("TIES GO UP: 2 sits between 1 and 3, and the answer is 3",
    T.snapToReachable(2, 1) === 3);
  t("but a clear nearest still wins, in both directions",
    T.snapToReachable(0.4, 1) === 0 && T.snapToReachable(2.7, 1) === 3 &&
    T.snapToReachable(1.1, 1) === 1);

  console.log("\nAnd the ladder it builds");
  const season = { season: "1995/96", table: [
    { club: "Manchester United", points: 82 },
    { club: "Newcastle United", points: 78 },
    { club: "Liverpool", points: 71 },
    { club: "Arsenal", points: 63 },
    { club: "Everton", points: 61 },
  ] };
  const day1 = T.seasonTable("Arsenal", 3, 1, season);
  /* THE PLAYER IS NOT SCALED, and this cannot be proved by sabotage — which
     is worth saying rather than leaving as an untested-looking line. Snapping
     the player's own total is a no-op for every input that can occur, because
     a total they actually earned is by construction reachable in the games
     they played. The two behaviours only differ on a number no player can
     hold. So what is asserted is the value, and the reason it is safe is that
     there is nothing to get wrong. */
  t("the player keeps their REAL points, unscaled",
    day1.find((r) => r.isPlayer).points === 3);
  t("and every other club is on a total that day could have produced",
    day1.filter((r) => !r.isPlayer)
      .every((r) => T.reachablePoints(1).indexOf(r.points) !== -1),
    day1.map((r) => r.club.slice(0, 3) + " " + r.points).join(", "));
  t("the player takes their own club's slot rather than appearing twice",
    day1.filter((r) => r.club === "Arsenal").length === 1);
  t("a win on day one puts the player level with the champions",
    T.playerPosition(day1) === 1, "everyone reachable is on 3, and the player wins ties");
  /* AND THE SHAPE IS buildTable's, so renderRows draws it unchanged and the
     hub gets the "three teams visible" view for free through `around`. */
  t("the rows are the shape renderRows already takes",
    day1.every((r) => "club" in r && "points" in r && "pos" in r && "isPlayer" in r));

  console.log("\nHow many rows are worth showing");
  {
    /* The owner: "in the short term no team can show 0 points so maybe best to
       only show their team for 1-3 games then 2 surrounding teams after". With
       one game played every club in the division snaps to 0, 1 or 3 — so the
       clubs either side of you are on the same points as half the league, and
       the rows say nothing at all. */
    t("the player's row alone for the first three days",
      [1, 2, 3].every((d) => T.neighboursFor(d) === 0));
    t("and the clubs either side from the fourth",
      [4, 5, 10, 38].every((d) => T.neighboursFor(d) === 1));
    /* AND renderRows HAS TO BE ABLE TO DRAW THAT. It floored the window at
       one, so "the player alone" could not be asked for at all: the call went
       through and quietly drew three rows. */
    const rows = T.seasonTable("Arsenal", 3, 1, season);
    const cell = { innerHTML: "" };
    const near = (html) => (html.match(/<tr class="(?![^"]*faroff)[^"]*"/g) || []).length;
    T.renderRows(cell, rows, 0);
    t("asking for the player alone draws exactly one row", near(cell.innerHTML) === 1,
      near(cell.innerHTML) + " rows not marked far off");
    /* AT THE TOP OF THE TABLE THERE IS NO ROW ABOVE, so "one either side" is
       two rows and not three. Expected three here at first and the code was
       right: on day one the player is on 3 and wins ties, which puts them
       first. Worth asserting rather than quietly avoiding — the hub draws this
       exact case every time somebody wins their opening day. */
    T.renderRows(cell, rows, 1);
    t("one either side is two rows when the player is top", near(cell.innerHTML) === 2,
      near(cell.innerHTML) + " rows — there is nothing above first");
    /* And three when there is a club on each side of them. */
    const mid = T.seasonTable("Arsenal", 63, 38, season);
    T.renderRows(cell, mid, 1);
    t("and three when they are somewhere in the middle", near(cell.innerHTML) === 3,
      "position " + T.playerPosition(mid) + " of " + mid.length);
    T.renderRows(cell, mid);
    t("a caller that passes nothing still gets the old behaviour",
      near(cell.innerHTML) === 3, "every game already passes nothing or one");
  }
  console.log("\nAt full time the table is the real one");
  const full = T.seasonTable("Arsenal", 63, 38, season);
  t("after 38 days every club is back on its historical points",
    full.find((r) => r.club === "Manchester United").points === 82 &&
    full.find((r) => r.club === "Liverpool").points === 71);
  t("and a player who matched Arsenal's real season sits where Arsenal sat",
    full.find((r) => r.isPlayer).points === 63);

  console.log("\nWhich year it is, withheld until it is over");
  /* The owner's ruling. Knowing you are playing 1995/96 from day one turns a
     ladder into a quiz about a table anybody can look up. */
  t("the year is not given away on day one", T.seasonYear(season, 1) === null);
  t("nor on day thirty-seven", T.seasonYear(season, 37) === null);
  t("and is revealed when the 38 are done", T.seasonYear(season, 38) === "1995/96");
  t("null rather than an empty string, so it cannot be printed by accident",
    T.seasonYear(season, 1) === null && T.seasonYear(null, 38) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
