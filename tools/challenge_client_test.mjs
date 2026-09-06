/* challenge_client_test.mjs — the challenge flow every game now shares.
 *
 * WHY IT EXISTS. The whole flow lived inside crossword/js/game.js: the
 * invitation, the name taken before the board opens, the entry at Full Time,
 * the standings. No other game had any of it, and the owner asked for
 * challenges in every game. shared/xi-challenge.js is the once — so this is
 * the file that has to be sure of it, because a fault here is a fault in five
 * games rather than one.
 *
 * WHAT IS WEIGHTED. The rule that shapes the whole feature is "nothing
 * competitive before you have played": no score, no standings, no fastest time
 * until the board has been played. A target turns solving into arithmetic. So
 * the checks that matter most are about what is NOT drawn and NOT asked for.
 *
 *   node tools/challenge_client_test.mjs        (from the repo root)
 */
import fs from "node:fs";
import { JSDOM } from "jsdom";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };
const SRC = fs.readFileSync("shared/xi-challenge.js", "utf8");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* One window per case: the module keeps the challenge it is playing, and a
   second case inheriting the first one's would prove nothing about either. */
function makeWindow({ url, routes }) {
  const dom = new JSDOM("<!doctype html><body></body>", { url, runScripts: "outside-only" });
  const w = dom.window;
  const calls = [];
  w.fetch = (path, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    calls.push({ path: String(path), method: (opts && opts.method) || "GET", body,
                 csrf: !!(opts && opts.headers && opts.headers["X-XI-Games"]) });
    const key = String(path).split("?")[0];
    const answer = routes[key];
    const value = typeof answer === "function" ? answer(body) : answer;
    if (value === undefined) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(value) });
  };
  w.navigator.clipboard = { writeText() {} };
  /* NO LOCATION STUB, AND THAT IS THE POINT. jsdom will not let location be
     replaced, and this project's own law says a check that exercises a
     stand-in proves nothing about what ships. So the module does not navigate:
     a challenge for another game offers its link and says which game it is,
     which is both testable here and honest on the page. */
  w.eval(SRC);
  return { w, calls, dom };
}

const INFO = {
  id: "k3f9p2", game: "scrambled", token: "sc:iconic:41",
  creatorName: "Graeme", groupName: null, started: 2, finished: 1,
};
const TABLE = {
  played: true, id: "k3f9p2", groupName: "The five-a-side lot", started: 3,
  entries: [
    { position: 1, mine: false, name: "Ana", score: 104, elapsedSeconds: 251, checks: 0, reveals: 1 },
    { position: 2, mine: true, name: "You", score: 96, elapsedSeconds: 300, checks: 0, reveals: 2 },
  ],
};
const CFG = (w, over) => Object.assign({
  game: "scrambled",
  openByToken: (token) => { w.__opened = token; },
  boardLabel: () => "One of the finals",
  column: { label: "Bench", of: (e) => (e.reveals || 0) + (e.checks || 0) },
}, over || {});

console.log("Nothing to do when there is no challenge in the address");
{
  const { w, calls } = makeWindow({ url: "https://www.thexigames.com/football/scrambled/", routes: {} });
  w.XIChallenge.configure(CFG(w));
  const taken = await w.XIChallenge.arrive();
  t("arrive() says it has not taken over", taken === false);
  /* THE CHECK THAT MATTERS MOST HERE: a page with no challenge must not ask
     the server anything at all. A request per page load, for a feature almost
     nobody is using on that visit, is a request nobody asked for. */
  t("and nothing is asked of the server", calls.length === 0, calls.length + " requests");
}

console.log("\nAn invitation, before the board opens");
const invite = makeWindow({
  url: "https://www.thexigames.com/football/scrambled/?c=k3f9p2",
  routes: { "/api/challenge": INFO, "/api/challenge/table": { played: false },
            "/api/challenge/start": { ok: true } },
});
{
  const { w, calls } = invite;
  w.XIChallenge.configure(CFG(w));
  const taken = await w.XIChallenge.arrive();
  await wait(10);
  t("arrive() takes over the page", taken === true);
  const card = w.document.querySelector(".xic-panel-card");
  t("the invitation is drawn", !!card && /challenged you/.test(card.textContent), card && card.textContent.slice(0, 40));
  t("and it names who sent it and how many have taken it",
    /Graeme/.test(card.textContent) && /2 people have taken this/.test(card.textContent));
  /* THE RULE, CHECKED RATHER THAN TRUSTED. Not one number that could be worked
     backwards into a target may appear before the board is played. */
  t("no score, no standings and no time are shown before playing",
    !/\b\d+ ?\/ ?\d+\b/.test(card.textContent) && card.querySelector(".xic-ch-table") === null &&
    card.querySelector(".xic-ch-standings").hidden === true,
    "a target turns solving into arithmetic");
  /* The name box is EMPTY for a guest: it used to be filled from the last name
     typed on the device, which offered the sender's own name back to the
     person answering when both were on one phone. */
  t("the name box is empty rather than guessing", card.querySelector("#xicChName").value === "");

  const play = card.querySelector(".xic-ch-play");
  play.dispatchEvent(new w.Event("click"));
  await wait(10);
  t("a name of one character is refused", /at least two characters/.test(card.textContent) && !w.__opened);

  card.querySelector("#xicChName").value = "Tester";
  play.dispatchEvent(new w.Event("click"));
  await wait(10);
  const start = calls.find((c) => c.path === "/api/challenge/start");
  t("the name is taken before the board opens",
    !!start && start.body.name === "Tester" && start.csrf === true,
    start ? JSON.stringify(start.body.name) : "no start posted");
  t("and then the board named by the challenge is opened",
    w.__opened === "sc:iconic:41", String(w.__opened));
}

console.log("\nA challenge for another game says so");
{
  const { w } = makeWindow({
    url: "https://www.thexigames.com/football/scrambled/?c=k3f9p2",
    routes: { "/api/challenge": Object.assign({}, INFO, { game: "hilo", token: "hlb:296" }) },
  });
  w.XIChallenge.configure(CFG(w));
  const taken = await w.XIChallenge.arrive();
  const card = w.document.querySelector(".xic-panel-card");
  const link = card && card.querySelector(".xic-ch-elsewhere");
  t("a HiLo challenge opened in Scrambled offers the HiLo link",
    !!link && link.getAttribute("href") === "/football/hilo/?c=k3f9p2",
    link ? link.getAttribute("href") : "no link");
  t("and it names the game rather than its id",
    /HiLo XI/.test(card.textContent) && !/(^|[^a-zA-Z])hilo([^a-zA-Z]|$)/.test(card.textContent));
  /* NOT TAKEN OVER: the page carries on opening its own board behind the
     panel, so there is something to play whichever way the player goes. */
  t("this page still opens its own board", taken === false);
  t("and it does not open the other game's board here", !w.__opened);
}

console.log("\nFull Time, having followed a challenge");
{
  const { w, calls } = makeWindow({
    url: "https://www.thexigames.com/football/scrambled/?c=k3f9p2",
    routes: { "/api/challenge": INFO, "/api/challenge/start": { ok: true },
              "/api/challenge/table": (body) => (body && body.entrantKey ? TABLE : { played: false }),
              "/api/challenge/entry": { ok: true } },
  });
  w.XIChallenge.configure(CFG(w));
  await w.XIChallenge.arrive();
  await wait(10);
  w.document.querySelector("#xicChName").value = "Tester";
  w.document.querySelector(".xic-ch-play").dispatchEvent(new w.Event("click"));
  await wait(10);

  await w.XIChallenge.finished("play-1234", null);
  await wait(10);
  const entry = calls.find((c) => c.path === "/api/challenge/entry");
  t("the result is posted to the challenge", !!entry && entry.body.playId === "play-1234");
  t("with the entrant key, so one entry each is enforceable",
    !!entry && /^[A-Za-z0-9_-]{8,64}$/.test(entry.body.entrantKey || ""));
  const card = w.document.querySelector(".xic-panel-card");
  t("and the standings are shown after playing, not before",
    !!card.querySelector(".xic-ch-table") && /Ana/.test(card.textContent));
  t("the third column is the game's own word, not the crossword's",
    /Bench/.test(card.textContent) && !/Checks/.test(card.textContent), "Scrambled has a bench");
  t("and your own row is marked from the server's flag",
    !!card.querySelector("tr.me") && /You/.test(card.querySelector("tr.me").textContent));
}

console.log("\nFull Time, having played on your own");
{
  const { w, calls } = makeWindow({
    url: "https://www.thexigames.com/football/scrambled/",
    routes: { "/api/challenge": { id: "n3wch1", already: false } },
  });
  w.XIChallenge.configure(CFG(w));
  const mount = w.document.createElement("div");
  w.document.body.appendChild(mount);
  await w.XIChallenge.finished("play-9999", mount);
  await wait(10);
  t("a challenge is offered rather than made", !!mount.querySelector(".xic-ch-make") &&
    !calls.some((c) => c.path === "/api/challenge" && c.method === "POST"),
    "pressing the button is the decision, not finishing the board");

  mount.querySelector(".xic-ch-make").dispatchEvent(new w.Event("click"));
  await wait(10);
  const made = calls.find((c) => c.path === "/api/challenge" && c.method === "POST");
  t("and pressing it makes one from the play", !!made && made.body.playId === "play-9999");
  t("the link that comes back names this game",
    /\/football\/scrambled\/\?c=n3wch1/.test(mount.textContent), mount.textContent.slice(0, 60));
  /* SHOWN AS WELL AS COPIED. A clipboard write that a browser refuses would
     otherwise leave nothing to send. */
  t("and the link is on the page, not only in the clipboard",
    !!mount.querySelector(".xic-ch-link"));
}

console.log("\nA game with nothing to put in a third column");
{
  /* HiLo has no help to count — a call is right or it is not, and that is the
     score. A column of blanks under a heading reads as data that failed to
     load, so a game that names no column gets a two-column table. */
  const { w } = makeWindow({
    url: "https://www.thexigames.com/football/hilo/?c=k3f9p2",
    routes: { "/api/challenge": Object.assign({}, INFO, { game: "hilo", token: "hlb:296" }),
              "/api/challenge/start": { ok: true },
              "/api/challenge/table": TABLE, "/api/challenge/entry": { ok: true } },
  });
  w.XIChallenge.configure({ game: "hilo", openByToken: () => {}, boardLabel: () => "A club board" });
  await w.XIChallenge.showTable("k3f9p2");
  await wait(10);
  const head = w.document.querySelectorAll(".xic-ch-table th");
  const cells = w.document.querySelectorAll(".xic-ch-table tr:nth-child(2) td");
  t("the table is score and time, with no empty column after them",
    head.length === 4 && cells.length === 4,
    head.length + " headings, " + cells.length + " cells");
  t("and it still shows the scores", /104/.test(w.document.querySelector(".xic-ch-table").textContent));
}

console.log("\nThe entrant key is a person, not a game");
{
  const { w } = makeWindow({ url: "https://www.thexigames.com/football/scrambled/", routes: {} });
  w.localStorage.setItem("fcw.entrant", "crosswordkey12345");
  const k = w.XIChallenge._entrantKey();
  /* ADOPTED, NOT REPLACED. A new key would quietly give somebody a second
     entry in a table they are already in — the crossword wrote this under its
     own prefix when it was the only game with challenges. */
  t("a key already kept by the crossword is adopted", k === "crosswordkey12345", k);
  t("and it is written under the family prefix from then on",
    w.localStorage.getItem("xi.entrant") === "crosswordkey12345");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
