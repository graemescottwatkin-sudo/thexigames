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
    /* Sorted, as the server sends them. */
    careers: [2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 9],
  };
}

function server() {
  const calls = [];
  const round = { playId: null, slot: 0, subsUsed: 0, finished: false, solved: false, guesses: [] };

  async function handle(pathname, body) {
    calls.push({ pathname, body });

    if (pathname.startsWith("/api/whoami/daily")) {
      const b = board();
      return [200, { source: "d1", no: b.no, day: b.date, lastDay: b.date,
                     isToday: true, board: b }];
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
      return [200, { playId: "r1", slot: round.slot, subsLeft: 3, stage: 1, day: body.date }];
    }
    if (pathname === "/api/whoami/clue") {
      if (body.playId !== round.playId) return [400, { error: "no round" }];
      const stage = Number(body.stage);
      if (stage === 1) {
        return [200, { stage: 1, label: "The spell", subsUsed: round.subsUsed,
                       spell: { club: CLUB, from: 2004, to: 2015, apps: 333, goals: 0 } }];
      }
      if (stage === 2) {
        round.subsUsed = 1;
        return [200, { stage: 2, label: "Full career", subsUsed: 1, career: CAREER, clubCount: 5 }];
      }
      if (stage === 3) {
        round.subsUsed = 2;
        return [200, { stage: 3, label: "Age and country", subsUsed: 2,
                       age: 44, nationality: "Czech Republic", position: "Goalkeeper" }];
      }
      if (stage === 4) {
        round.subsUsed = 3; round.finished = true;
        return [200, { stage: 4, label: "Give up", subsUsed: 3, finished: true,
                       solved: false, answer: ANSWER, career: CAREER }];
      }
      return [400, { error: "no such stage" }];
    }
    if (pathname === "/api/whoami/guess") {
      if (body.playId !== round.playId) return [400, { error: "no round" }];
      if (round.finished) return [400, { error: "that door is closed" }];
      const fold = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const typed = fold(body.guess);
      round.guesses.push(typed);
      if (typed === fold(ANSWER)) {
        round.finished = true; round.solved = true;
        return [200, { verdict: "right", answer: ANSWER, career: CAREER,
                       subsUsed: round.subsUsed, finished: true, solved: true }];
      }
      /* Drogba played for Chelsea; Shearer did not. The stub knows, and the
         page is never told — which is the property under test. */
      const verdict = typed === "DIDIERDROGBA" ? "right-club" : "wrong";
      return [200, { verdict, subsUsed: round.subsUsed, subsLeft: 3 - round.subsUsed,
                     finished: false, solved: false }];
    }
    if (pathname === "/api/whoami/finish") {
      return [200, { day: "2026-09-15", slot: round.slot, solved: round.solved,
                     finished: round.finished, subsUsed: round.subsUsed,
                     guesses: round.guesses.length,
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
  try { w.localStorage.clear(); } catch (e) {}

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
  t("the build tag is the one the page loads", /v001/.test(w.BUILD || ""), w.BUILD);
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
  const careers = doc.getElementById("careers").textContent;
  t("the career lengths are shown as one sorted list, not per door",
    /2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 9/.test(careers), careers.slice(0, 60));
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
  t("the rungs still to buy are offered", rungs.length === 3, String(rungs.length));
  t("and each says what it costs", /one sub/i.test(rungs[0].textContent));
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
  t("but does say which door and how many clues", /Chelsea/.test(share) && /Clues:/.test(share));
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

  click(rung("Age and country"));
  await settle(w);
  const clues = doc.getElementById("clues").textContent;
  t("age and country arrive together", /44 years old/.test(clues) && /Czech/.test(clues));
  t("and the birth year never appears", !/1982/.test(clues),
    "the year is a sharper clue than the age, and the ladder says age");

  click(rung("Give up"));
  await settle(w);
  await settle(w);
  t("giving up closes the door and names him", visible(doc, "screenDone") &&
    doc.getElementById("doneBody").textContent.includes(ANSWER));
  t("and it is not recorded as solved", (() => {
    const rows = JSON.parse(w.localStorage.getItem("xiwa.results.v1") || "[]");
    return rows.length === 1 && rows[0].solved === false;
  })());
}

console.log("=== The type-ahead searches the answer SPACE ===");
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
