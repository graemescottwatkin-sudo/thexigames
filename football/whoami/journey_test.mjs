/* whoami/journey_test.mjs — a whole Who Am I door, played.
 *
 * WHY THIS EXISTS BEFORE THE GAME SHIPS RATHER THAN AFTER. QuickFire's client
 * was rewritten on 15 September 2026 and nothing executed a line of it until a
 * suite like this one was written; it immediately found two faults. Codeword
 * shipped a live bug through the same gap the day before — its daily reported
 * one number and its play endpoint expected another, every handler began
 * `if (!round) return;`, and the game recognised nothing while erroring
 * nowhere. A page that fails silently is this family's failure mode.
 *
 * WHAT IS REAL AND WHAT IS NOT. The markup and game.js are the shipped bytes.
 * The endpoints are stubbed, but stubbed to ANSWER rather than to agree: the
 * stub holds the identity, refuses a stage that has not been paid for, and
 * knows which players played for the club. A stub that rubber-stamped would
 * prove the page can talk to itself.
 *
 * THE ANSWER LIVES IN THE STUB AND NEVER IN A PAYLOAD, which is also the point.
 * If the page could only work by being told who was behind the door, this file
 * could not be written without handing it over.
 *
 *   npm install -D jsdom --no-save
 *   node football/whoami/journey_test.mjs      (from the repo root)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const DIR = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const game = fs.readFileSync(path.join(DIR, "js", "game.js"), "utf8");
const config = fs.readFileSync(path.join(DIR, "js", "config.js"), "utf8");

/* The scoring rule exactly as the server sends it, read from the game's own
   config and the family's curve rather than invented here. */
const RULE = {
  curve: [[0, 114], [10, 97], [20, 86], [30, 78], [45, 68], [60, 58], [75, 47], [90, 36]],
  max: 114, fullTime: 90, matchMinutes: 90, rateSeconds: 20,
  ladder: [
    { stage: 1, sub: 0, points: 0, label: "The spell" },
    { stage: 2, sub: 1, points: 20, label: "Full career" },
    { stage: 3, sub: 2, points: 10, label: "Nationality and age" },
  ],
  giveUp: { label: "Give up" },
};

const ANSWER = "PETR CECH";
const CLUB = "Chelsea";
const CAREER = "2004-2015 Chelsea (333) - 2015-2019 Arsenal (110)";

function board() {
  const doors = [];
  const clubs = ["Arsenal", "Chelsea", "Everton", "Newcastle United", "Liverpool",
    "Aston Villa", "Leeds United", "Southampton", "Fulham", "West Ham United", "Sunderland"];
  clubs.forEach((c, i) => doors.push({ slot: i + 1, club: c, leave: 2010 + i }));
  return {
    id: "XIWA-20260915", date: "2026-09-15", no: 21, day: "2026-09-15",
    doors,
    /* ONE PER PLAYER, sorted, as the server sends them: eleven doors from six
       players. The stub carried eleven — one per door — which is what the
       server used to send and what leaked the grouping. */
    careers: [2, 3, 4, 5, 7, 9],
  };
}

function server() {
  const calls = [];
  const round = { playId: null, slot: 0, pointsSpent: 0, minute: 0, score: 0,
    finished: false, solved: false, guesses: [] };

  async function handle(pathname, body) {
    calls.push({ pathname, body });

    if (pathname.startsWith("/api/whoami/daily")) {
      const b = board();
      /* SHAPED AS daily.js SHAPES IT, scoring rule included. The first version
         of this stub sent the board alone, so the page had no ladder to draw
         and no curve to tick — and the suite failed on "no rungs offered",
         which was the stub's fault and not the page's. A stub that
         approximates the contract tests the approximation. */
      return [200, { source: "d1", no: b.no, day: b.date, lastDay: b.date,
                     isToday: true, board: b, scoring: RULE }];
    }
    if (pathname === "/api/whoami/names") {
      return [200, { count: 4, names: [
        ["PETR CECH", "PETRCECH"], ["DIDIER DROGBA", "DIDIERDROGBA"],
        ["ALAN SHEARER", "ALANSHEARER"], ["MARTIN ØDEGAARD", "MARTINODEGAARD"]] }];
    }
    if (pathname === "/api/whoami/archive") {
      return [200, { source: "d1", count: 1, boards: [{ day: "2026-09-15", no: 21 }] }];
    }
    if (pathname === "/api/whoami/play") {
      round.playId = "r1";
      round.slot = Number(body.slot);
      round.startedMs = Date.now();
      return [200, { playId: "r1", slot: round.slot, stage: 1, pointsSpent: 0,
                     worthNow: RULE.max, minute: 0, day: body.date }];
    }
    /* A ROUND THE STUB DID NOT ISSUE IS STILL A ROUND. The real server reads
       wa_round by play_id and finds the row whatever restarted; this stub only
       knew a playId it had handed out itself, so a RESUMED round was refused
       with "no round" — and the resume block failed on the stub rather than on
       the page. A stub that only recognises state it created cannot test
       anything that outlives a session. */
    if (!round.playId && body && body.playId) {
      round.playId = body.playId;
      if (body.slot) round.slot = Number(body.slot);
      if (!round.slot) round.slot = 2;
    }

    /* THE MINUTE IS THE STUB'S, as it is the server's — the page never decides
       it. Held at nought so the score assertions measure the ceiling rather
       than whatever the clock happened to reach mid-test. */
    const minute = round.minute || 0;
    const worth = (spent) => Math.max(0, RULE.max - spent);

    if (pathname === "/api/whoami/clue") {
      if (body.playId !== round.playId) return [400, { error: "no round" }];
      const stage = Number(body.stage);
      const rung = RULE.ladder.find((r) => r.stage === stage);
      if (!rung) return [400, { error: "no such stage" }];
      /* CUMULATIVE, as costToReach is: the price of every rung up to this one. */
      const need = RULE.ladder.filter((r) => r.stage > 1 && r.stage <= stage)
        .reduce((x, r) => x + r.points, 0);
      const replayed = need <= round.pointsSpent;
      if (!replayed) round.pointsSpent = need;
      const body2 = { stage, label: rung.label, pointsSpent: round.pointsSpent,
                      minute, worthNow: worth(round.pointsSpent), replayed };
      if (stage === 1) body2.spell = { club: CLUB, from: 2004, to: 2015, apps: 333, goals: 0 };
      if (stage === 2) {
        body2.career = CAREER;
        body2.clubCount = 5;
        /* AS SPELLS, with the door's own marked BY THE SERVER. The page folds
           names for its type-ahead and must not be the thing that decides which
           row is the door's — so `mine` arrives decided. */
        body2.spells = [
          { club: "Rennes", from: 2002, to: 2004, apps: 70, goals: 0, loan: false, mine: false },
          { club: "Chelsea", from: 2004, to: 2015, apps: 333, goals: 0, loan: false, mine: true },
          { club: "Sevilla", from: 2013, to: 2014, apps: 1, goals: 0, loan: true, mine: false },
          { club: "Arsenal", from: 2015, to: 2019, apps: 110, goals: 0, loan: false, mine: false },
        ];
      }
      if (stage === 3) { body2.age = 44; body2.nationality = "Czech Republic";
                         body2.position = "Goalkeeper"; }
      return [200, body2];
    }
    if (pathname === "/api/whoami/giveup") {
      if (round.finished) return [400, { error: "that door is closed" }];
      round.finished = true; round.solved = false; round.score = 0;
      return [200, { label: "Give up", minute, score: 0, worthNow: 0,
                     pointsSpent: round.pointsSpent, finished: true, solved: false,
                     answer: ANSWER, career: CAREER }];
    }
    if (pathname === "/api/whoami/guess") {
      if (body.playId !== round.playId) return [400, { error: "no round" }];
      if (round.finished) return [400, { error: "that door is closed" }];
      const fold = (x) => String(x).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const typed = fold(body.guess);
      round.guesses.push(typed);
      if (typed === fold(ANSWER)) {
        round.finished = true; round.solved = true;
        round.score = worth(round.pointsSpent);
        return [200, { verdict: "right", answer: ANSWER, career: CAREER,
                       pointsSpent: round.pointsSpent, minute, score: round.score,
                       finished: true, solved: true }];
      }
      /* Drogba played for Chelsea; Shearer did not. The stub knows, and the
         page is never told — which is the property under test. */
      const verdict = typed === "DIDIERDROGBA" ? "right-club" : "wrong";
      return [200, { verdict, pointsSpent: round.pointsSpent, minute,
                     worthNow: worth(round.pointsSpent),
                     finished: false, solved: false }];
    }
    if (pathname === "/api/whoami/finish") {
      const subs = RULE.ladder.filter((r) => r.points > 0 &&
        RULE.ladder.filter((x) => x.stage > 1 && x.stage <= r.stage)
          .reduce((x, y) => x + y.points, 0) <= round.pointsSpent).length;
      return [200, { day: "2026-09-15", slot: round.slot, solved: round.solved,
                     finished: round.finished, pointsSpent: round.pointsSpent,
                     subsUsed: subs, guesses: round.guesses.length,
                     minute, score: round.finished ? round.score : undefined,
                     nearMisses: round.guesses.filter((g) => g === "DIDIERDROGBA").length,
                     ...(round.finished ? { answer: ANSWER, career: CAREER, club: CLUB } : {}) }];
    }
    return [404, { error: "not found" }];
  }
  return { handle, calls, round };
}

const settle = (w, ms = 0) => new Promise((r) => setTimeout(r, ms));

async function open(opts = {}) {
  const srv = server();
  const dom = new JSDOM(html, {
    url: "https://www.thexigames.com/football/whoami/" + (opts.hash || ""),
    runScripts: "outside-only", pretendToBeVisual: true,
  });
  const w = dom.window;
  /* Each run starts empty: jsdom shares localStorage between windows on one
     origin, and a suite whose result depends on the order of its own blocks is
     one that will be "fixed" by reordering them. */
  /* EACH RUN STARTS EMPTY — except when a block is deliberately testing what
     happens on a SECOND visit, which is the one thing a clean slate can never
     show. `keep` seeds the save the way a returning player's device would
     have it. */
  try {
    w.localStorage.clear();
    if (opts.keep) w.localStorage.setItem('xiwa.daily.v1:2026-09-15', opts.keep);
  } catch (e) {}

  w.fetch = (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : {};
    return srv.handle(String(url), body).then(([status, json]) => ({
      ok: status >= 200 && status < 300, status,
      json: () => Promise.resolve(json),
    }));
  };
  const played = [];
  w.XIPlays = { start: (m) => played.push(["start", m]), end: (d) => played.push(["end", d]), active: () => true };
  const seasons = [];
  w.XISeason = { record: (d) => seasons.push(d) };

  w.eval(config);
  w.eval(game);
  await settle(w);
  await settle(w);            // the name list is a second round trip
  return { w, doc: w.document, srv, played, seasons,
           click: (el) => el.dispatchEvent(new w.Event("click", { bubbles: true })) };
}

const visible = (doc, id) => { const e = doc.getElementById(id); return !!e && !e.hidden; };

console.log("=== The landing, and then the board ===");
{
  const { doc, w, click } = await open();
  t("it opens on the landing, not in a game", visible(doc, "waHome") && !visible(doc, "waGame"));
  /* DERIVED FROM THE PAGE, NOT PINNED. This read /v001e/ and went red the
     moment the tag moved — a test asserting a hardcoded version enforces the
     drift instead of catching it. What the assertion MEANS is that the script's
     BUILD and the page's ?v= agree, so it reads the page for the expected
     value. */
  const pageTag = (html.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1];
  t("the build tag is the one the page loads", !!pageTag && w.BUILD === pageTag,
    );
  click(doc.getElementById("waToday"));
  await settle(w);
  t("choosing today shows the doors", visible(doc, "waGame") && visible(doc, "screenDoors"));
  t("it names the board by its family number",
    /No\. 21/.test(doc.getElementById("boardNo").textContent),
    doc.getElementById("boardNo").textContent);
  const doors = [...doc.querySelectorAll("#doors .door")];
  t("eleven doors are drawn", doors.length === 11, String(doors.length));
  t("each is a club and a year",
    /Arsenal/.test(doors[0].textContent) && /left 2010/.test(doors[0].textContent));
}

console.log("=== The landing wears the family's shape ===");
{
  /* WHY THIS IS MEASURED AGAINST THE CROSSWORD AND NOT AGAINST A LIST.
   *
   * This game launched with a landing that was one green card and a row
   * underneath, and the owner's words were "it looks nothing like other games,
   * it doesn't open up to the same sort of screen like Crossword". Every class
   * it used was a real shared class, so nothing was red: the page was not
   * WRONG, it was a third of the shape, and no check in this repo could tell
   * the difference between a third and all of it.
   *
   * A list of selectors written here would be my opinion of the family shape,
   * frozen on the day I wrote it — the pinned-literal fault. So the list is
   * asserted TWICE: this page must carry each selector, and so must the
   * crossword, which is the page the owner recognises as the house style. A
   * selector that stops being the family's shape goes red on the SECOND half
   * and has to be removed from the list rather than quietly enforced here
   * forever.
   */
  /* ONE ADDRESS, WRITTEN ONCE. Both halves below ask for the same route, and
     two copies of a path is two answers about where past boards live. */
  const ARCHIVE = "/football/whoami/archive/";
  const { doc } = await open();
  const houseHtml = fs.readFileSync(
    path.join(DIR, "..", "crossword", "index.html"), "utf8");
  const house = new JSDOM(houseHtml).window.document;

  const SHAPE = [
    [".site-ident .ident-mark svg", "a mark that is a shape, not a coloured square"],
    [".site-ident .site-crumb", "the theme it lives under, said out loud"],
    [".site-ident .site-mast", "the game's name at masthead size"],
    [".site-ident .ident-sub", "one line saying what it is"],
    ["header.site-head .site-bar nav.site-nav", "the section bar"],
    [".site-wrap .site-grid .site-main", "the fixture column"],
    [".site-wrap .site-grid .site-side", "and what sits beside it"],
    ["button.home-choice.hero .hc-kicker", "which board this is"],
    ["button.home-choice.hero .hc-title", "what it is called"],
    ["button.home-choice.hero .hc-note", "what you are about to do"],
    ["button.home-choice.hero .hc-cta", "and a way in that says so"],
    [".home-choice.col", "a card for the boards that have gone"],
  ];

  let missingHere = [], notFamily = [];
  for (const [sel, say] of SHAPE) {
    if (!doc.querySelector(sel)) missingHere.push(say);
    if (!house.querySelector(sel)) notFamily.push(sel);
  }
  t("it opens on the same shape the rest of the family opens on",
    missingHere.length === 0, missingHere.join("; ") || String(SHAPE.length) + " parts");
  t("and every part of that shape is the family's, not this game's invention",
    notFamily.length === 0,
    notFamily.join("; ") || "each one is on the crossword's landing too");

  /* The two things the owner asked for by name: today, and the ones that have
     gone, reachable without playing anything first. */
  /* A STRING COMPARE RATHER THAN A REGEX, and not by taste. The first version
     of this line carried a pattern full of escaped slashes, the backslashes
     were lost on the way into the file, and what was left — a slash, the path,
     a slash — was a LINE COMMENT. The assertion silently became "#waPast
     exists", swallowed its own third argument, and passed while the href
     pointed at the wrong page. It was found by sabotaging the href and
     watching it stay green. The seventh vacuous check in this repo's history. */
  const past = doc.querySelector("#waPast");
  t("past boards are selectable from the landing",
    !!past && past.getAttribute("href") === ARCHIVE,
    past ? past.getAttribute("href") : "no card");
  t("and the tab bar offers them too, before a board has loaded",
    !!doc.querySelector('.site-nav a[href="' + ARCHIVE + '"]'));

  /* The kicker said TODAY, which is true of every day there has ever been. */
  t("the hero says WHICH board it is",
    /#21/.test(doc.getElementById("waTodayKicker").textContent),
    doc.getElementById("waTodayKicker").textContent);
}

console.log("=== Nothing on the board is an answer ===");
{
  const { doc, click, w } = await open();
  click(doc.getElementById("waToday"));
  await settle(w);
  const markup = doc.getElementById("waGame").innerHTML;
  t("no player is named anywhere on the board",
    !markup.toUpperCase().includes("CECH") && !markup.toUpperCase().includes("DROGBA"),
    "ten of these doors stay live for other players after you finish yours");
  /* THE COUNTS ARE THE SUBTLE ONE. Shown against their doors they would say how
     many clubs each door's player had, which narrows eleven doors to a handful
     of candidates for anyone holding the name list. */
  /* ONE CHIP PER PLAYER, NOT PER DOOR. Eleven numbers for eleven doors leaked
     the GROUPING even when sorted — three doors sharing a three-club player is
     visible at a glance and lets anyone with the name list pair doors off each
     other. The server dedupes to players, so the count of chips is the count of
     players and the multiplicities are gone. */
  const chips = [...doc.querySelectorAll("#careers .cr-one")];
  t("the careers panel shows one chip per player, not per door",
    chips.length === board().careers.length && chips.length < 11,
    chips.length + " chips for 11 doors");
  t("and each says whose it is and how many clubs, rather than a bare number",
    chips.every((c) => /Player \d+/.test(c.textContent) && /club/.test(c.textContent)),
    chips[0] && chips[0].textContent);
  t("and no door carries a count of its own",
    ![...doc.querySelectorAll("#doors .door")].some((d) => /\b\d\s*clubs?\b/i.test(d.textContent)));
}

console.log("=== Opening a door gives one spell and nothing else ===");
{
  const { doc, click, w, srv } = await open();
  click(doc.getElementById("waToday"));
  await settle(w);
  click([...doc.querySelectorAll("#doors .door")][1]);   // Chelsea
  await settle(w);

  t("the play screen is shown", visible(doc, "screenPlay"));
  t("a round was opened against that door",
    srv.calls.some((c) => c.pathname === "/api/whoami/play" && c.body.slot === 2));
  t("and the first rung was taken automatically, because it is free",
    srv.calls.some((c) => c.pathname === "/api/whoami/clue" && c.body.stage === 1));

  const clues = doc.getElementById("clues").textContent;
  t("the spell is the door's own club", /Chelsea/.test(clues) && /333 apps/.test(clues));
  t("and the rest of the career is not on the page",
    !/Arsenal/.test(clues), "five spells is the career delivered one at a time");
  t("nobody is named", !clues.toUpperCase().includes("CECH"));

  const rungs = [...doc.querySelectorAll("#ladder .rung")];
  /* TWO SUBSTITUTIONS, NOT THREE. Giving up was the third and is not one — it
     is not priced and it is not on the ladder. */
  t("both substitutions are offered", rungs.length === 2, String(rungs.length));
  t("and each says what it costs, in points, before it is spent",
    /Sub 1/.test(rungs[0].textContent) && /20/.test(rungs[0].textContent),
    rungs.map((r) => r.textContent).join(" | "));
  t("giving up sits apart from the things you buy",
    !!doc.getElementById("giveUp") && !doc.getElementById("giveUp").hidden);
}

console.log("=== The near miss, which the page could not decide for itself ===");
{
  const { doc, click, w } = await open();
  click(doc.getElementById("waToday"));
  await settle(w);
  click([...doc.querySelectorAll("#doors .door")][1]);
  await settle(w);

  const input = doc.getElementById("guessInput");
  input.value = "Didier Drogba";
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  click(doc.getElementById("guessGo"));
  await settle(w);

  const said = doc.getElementById("feedback").textContent;
  t("naming a Chelsea player who is not him says so", /played there/i.test(said), said);
  t("and does not say who it actually was",
    !said.toUpperCase().includes("CECH") &&
    !doc.getElementById("waGame").innerHTML.toUpperCase().includes("CECH"),
    "or the game ends for the price of a wrong guess");
  t("the door stays open", visible(doc, "screenPlay") && !visible(doc, "screenDone"));
  t("and the try is counted", /1 name tried/.test(doc.getElementById("tries").textContent),
    doc.getElementById("tries").textContent);
}

console.log("=== Naming him ===");
{
  const { doc, click, w, seasons, played } = await open();
  click(doc.getElementById("waToday"));
  await settle(w);
  click([...doc.querySelectorAll("#doors .door")][1]);
  await settle(w);

  const input = doc.getElementById("guessInput");
  input.value = "petr cech";
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  click(doc.getElementById("guessGo"));
  await settle(w);
  await settle(w);

  t("the right name ends the door", visible(doc, "screenDone"));
  const body = doc.getElementById("doneBody").textContent;
  t("and only now is he named", body.includes(ANSWER));
  t("the career is shown once it is over", body.includes("Arsenal"));
  t("the result was banked under the family's key", (() => {
    const raw = w.localStorage.getItem("xiwa.results.v1");
    if (!raw) return false;
    const rows = JSON.parse(raw);
    return rows.length === 1 && rows[0].day === "2026-09-15" &&
      rows[0].game === "whoami" && rows[0].solved === true;
  })());
  t("the season was told which day was played", seasons.includes("2026-09-15"));
  t("and the run was counted as ONE door, not eleven",
    played.some(([k, m]) => k === "start" && m.total === 1),
    "the owner's exception: this game's eleven are the clubs");

  /* THE SHARE TEXT IS THE LAST PLACE A LEAK HIDES. Ten doors are still live for
     everybody else today, so a result pasted into a group chat must not spoil
     them — and must not spoil this one either for somebody yet to play it. */
  const share = doc.getElementById("shareText").value;
  t("the share text names no player", !share.toUpperCase().includes("CECH"),
    share.split("\n").slice(0, 4).join(" / "));
  t("but does say which door, the score and the substitutions",
    /Chelsea/.test(share) && /114/.test(share) && /Subs:/.test(share),
    share.replace(/\n/g, " / "));
}

console.log("=== Buying the ladder, and giving up ===");
{
  const { doc, click, w, srv } = await open();
  click(doc.getElementById("waToday"));
  await settle(w);
  click([...doc.querySelectorAll("#doors .door")][1]);
  await settle(w);

  const rung = (label) => [...doc.querySelectorAll("#ladder .rung")]
    .find((b) => new RegExp(label, "i").test(b.textContent));

  click(rung("Full career"));
  await settle(w);
  t("buying the career shows it", /Arsenal/.test(doc.getElementById("clues").textContent));
  t("and the rung is no longer offered", !rung("Full career"));

  /* THE CAREER IS A LADDER, NOT A SENTENCE. It printed as one run-on line and
     the shape of a career is the puzzle — finding the big club in a wall of
     text takes effort and none at all in a column. */
  const spells = [...doc.querySelectorAll("#clues .spell")];
  t("the career draws one row per club", spells.length === 4, String(spells.length));
  t("each row carries its years and its appearances",
    /2004/.test(spells[1].textContent) && /333 apps/.test(spells[1].textContent),
    spells[1] && spells[1].textContent.replace(/\s+/g, " ").trim());
  /* THE ONE THE PLAYER IS LOOKING FOR. Without it they hunt the list for the
     club they picked before they can read outward from it. */
  const mine = spells.filter((x) => /\bmine\b/.test(x.className));
  t("and the door's own club is marked, exactly once",
    mine.length === 1 && /Chelsea/.test(mine[0].textContent),
    mine[0] && mine[0].textContent.replace(/\s+/g, " ").trim());
  t("the marking is the server's decision, not the page's",
    !/\.mine\s*=/.test(game) && !/fold\([^)]*\)\s*===\s*fold\(\s*(?:door|BOARD)/.test(game),
    "the page folds names for a type-ahead and must not judge with it");
  /* A LOAN IS NEVER THE ANSWER and lengthens the hardest element to read. */
  t("a loan spell is marked as one", spells.some((x) => /loan/.test(x.className)));
  /* READ OFF THE CELL, not off the concatenated text. The first version tested
     the whole clues panel for /\b1 app\b/ and failed on its own regex: the rows
     run together as "Sevilla1 app", so there is no word boundary before the 1.
     The assertion was wrong and the code was right, which is worth an extra
     line to get straight. */
  const loanApps = spells.find((x) => /loan/.test(x.className))
    .querySelector(".sp-apps").textContent.trim();
  t("a one-appearance spell reads 'app' rather than 'apps'",
    loanApps === "1 app", loanApps);

  click(rung("Nationality and age"));
  await settle(w);
  const clues = doc.getElementById("clues").textContent;
  t("nationality and age arrive together", /44 years old/.test(clues) && /Czech/.test(clues));
  t("and the birth year never appears", !/1982/.test(clues),
    "the year is a sharper clue than the age, and the ladder says age");

  click(doc.getElementById("giveUp"));
  await settle(w);
  await settle(w);
  t("giving up closes the door and names him", visible(doc, "screenDone") &&
    doc.getElementById("doneBody").textContent.includes(ANSWER));
  t("and it is not recorded as solved", (() => {
    const rows = JSON.parse(w.localStorage.getItem("xiwa.results.v1") || "[]");
    return rows.length === 1 && rows[0].solved === false;
  })());
}

console.log("\n=== Coming back to a door already open ===");
{
  /* THE WORST BUG THIS GAME HAD, and it had no test at all. Returning with a
     saved round, the page showed the play screen and rendered NOTHING into it:
     no club, no spell, no clock. A player who had never chosen anything landed
     in a half-finished round against a door they had not picked, looking at a
     blank panel and a name box — which reads exactly as "it won't let me
     choose, it just picks a player for me", because that is what it did.
     Every other block here starts from a clean slate, which is precisely why
     none of them saw it. */
  const first = await open();
  first.click(first.doc.getElementById("waToday"));
  await settle(first.w);
  first.click([...first.doc.querySelectorAll("#doors .door")][1]);   // Chelsea
  await settle(first.w);
  const saved = first.w.localStorage.getItem("xiwa.daily.v1:2026-09-15");
  t("a round in progress is saved", !!saved && JSON.parse(saved).slot === 2,
    saved && JSON.parse(saved).slot);

  /* A SECOND VISIT with that save already on the device. */
  const back = await open({ keep: saved });
  back.click(back.doc.getElementById("waToday"));
  await settle(back.w);
  await settle(back.w);

  t("it comes back to the door that was open, not a blank screen",
    back.doc.getElementById("playClub").textContent === "Chelsea",
    back.doc.getElementById("playClub").textContent || "(empty)");
  t("and the spell is there to read again",
    /333 apps/.test(back.doc.getElementById("clues").textContent),
    "the free rung is served again, charged nothing");
  t("and it did NOT open a second round",
    back.srv.calls.filter((c) => c.pathname === "/api/whoami/play").length === 0,
    "a day that banks one result must not open two");

  /* A SAVE POINTING AT A DOOR THAT IS NOT ON TODAY'S BOARD — the board was
     re-imported under it, or the day rolled while the tab was shut. */
  const stale = await open({ keep: JSON.stringify({ ...JSON.parse(saved), slot: 99 }) });
  stale.click(stale.doc.getElementById("waToday"));
  await settle(stale.w);
  t("a stale save falls back to the board rather than a door that is not there",
    visible(stale.doc, "screenDoors"),
    "the slot was re-imported out from under the save");
}

console.log("\n=== One door a day, which is the whole basis of the game ===");
{
  /* IT WAS NOT ENFORCED ANYWHERE. Every door carried an unconditional click
     handler, so after finishing a board you could open the next one — fresh
     clock, fresh 114, full ladder — and work the whole eleven. Found by a
     person playing the live site, not by any check here.
     Worse, the "back to the board" button carried a comment saying "it does not
     offer another go", which is a sentence asserting a guard that did not
     exist. A comment that reads as the rule being handled is the most expensive
     kind of wrong. */
  const { doc, click, w, srv } = await open();
  click(doc.getElementById("waToday"));
  await settle(w);
  click([...doc.querySelectorAll("#doors .door")][1]);   // Chelsea
  await settle(w);

  const input = doc.getElementById("guessInput");
  input.value = "petr cech";
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  click(doc.getElementById("guessGo"));
  await settle(w);
  await settle(w);

  click(doc.getElementById("backToDoors"));
  await settle(w);

  const doors = [...doc.querySelectorAll("#doors .door")];
  t("back on the board, every door is closed", doors.every((d) => d.disabled),
    doors.filter((d) => !d.disabled).length + " still open");
  t("and the one that was played is marked as yours",
    doors.filter((d) => /mine/.test(d.className)).length === 1 &&
    /Yours today/.test(doors[1].textContent),
    "the owner asked to see which player was yours at full time");
  /* THE LINE ABOVE THEM STOPS BEING UNTRUE. It read "you get one go at him" to
     somebody who had already had their go. */
  t("and the instruction no longer says you get a go",
    !/you get one go/.test(doc.getElementById("lede").textContent),
    doc.getElementById("lede").textContent);
  /* AND CLICKING ONE OPENS NOTHING — the assertion that actually matters, since
     `disabled` is a claim and this is the behaviour. */
  const plays = () => srv.calls.filter((c) => c.pathname === "/api/whoami/play").length;
  const before = plays();
  click(doors[4]);
  await settle(w);
  t("and clicking another opens no round", plays() === before,
    "disabled is a claim; not opening a round is the behaviour");
  t("every door names itself on the control",
    doors.every((d) => (d.getAttribute("aria-label") || "").length > 3),
    "the label lived inside a child, so the tree showed it detached");
}

console.log("\n=== The type-ahead searches the answer SPACE ===");
{
  const { doc, click, w } = await open();
  click(doc.getElementById("waToday"));
  await settle(w);
  click([...doc.querySelectorAll("#doors .door")][1]);
  await settle(w);

  const input = doc.getElementById("guessInput");
  input.value = "ce";
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  await settle(w);
  const sg = [...doc.querySelectorAll("#suggest .sg")].map((b) => b.textContent);
  t("typing matches names from the list", sg.length > 0, sg.join(", "));
  /* THE LIST IS THE SAME EVERY DAY, which is what makes it safe: it narrows
     typing rather than narrowing the puzzle. */
  t("and it is the whole list, not today's eleven",
    sg.some((n) => n === "PETR CECH"), "the dictionary, not the puzzle");

  input.value = "Ødegaard";
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  await settle(w);
  const folded = [...doc.querySelectorAll("#suggest .sg")].map((b) => b.textContent);
  t("O-slash is folded rather than dropped, so the name can be found",
    folded.some((n) => /DEGAARD/.test(n)), folded.join(", ") || "nothing matched");

  input.value = "a";
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  await settle(w);
  t("one character offers nothing rather than three thousand names",
    [...doc.querySelectorAll("#suggest .sg")].length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
