/* loadfail_test.mjs — what QuickFire XI tells a player when there is no board.
 *
 * WHY THIS PATH IS WORTH A SUITE OF ITS OWN. It is the branch nobody sees while
 * the game works, and it was wrong for weeks in production without a single
 * report. /api/quickfire/daily answered 500 — the qf_ tables did not exist in
 * D1 at all — and the page said "Today's questions didn't load. Try again in a
 * moment." A permanent fault, described as a passing one. A visitor told to
 * wait a moment waits, and then leaves, and never tells you. The tables were
 * created on 13 September 2026 and the endpoint now answers 404; the wording
 * had to stop inviting a retry that cannot work.
 *
 * So the claim under test is not "an error is shown" but "the RIGHT error is
 * shown for each cause", which is exactly what the old code could not do: it
 * threw away the status into a string and caught everything identically.
 *
 * It also asserts the message lands in classes this game actually defines. The
 * old branch wrote .kicker and .blurb — neither exists in its stylesheet, and
 * it destroyed the .pmCard wrapper on the way — so the message it did show
 * arrived unstyled. A check that only asserted the TEXT would have passed on
 * that, which is why the classes are asserted too.
 *
 *   npm install -D jsdom --no-save
 *   node football/quickfire/loadfail_test.mjs      (from the repo root)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const script = fs.readFileSync(path.join(DIR, "js", "game.js"), "utf8");
const css = fs.readFileSync(path.join(DIR, "css", "style.css"), "utf8");

/* Run the REAL bootstrap against a fetch that fails the way we choose. Only the
   IIFE is executed: start() needs the whole game's other files and is not what
   this is about. Cutting at the closing of the bootstrap keeps the code under
   test byte-identical to what ships. */
const BOOT_END = script.indexOf("})();");
if (BOOT_END < 0) throw new Error("bootstrap IIFE not found — has game.js been restructured?");
const bootstrap = script.slice(0, BOOT_END + 5);

async function render({ status, hash = "", network = false }) {
  const dom = new JSDOM(html, { url: "https://www.thexigames.com/football/quickfire/" + hash,
                                runScripts: "outside-only" });
  const w = dom.window;
  w.fetch = () => network
    ? Promise.reject(new TypeError("Failed to fetch"))
    : Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve({}),
      });
  w.eval(bootstrap);
  await new Promise((r) => setTimeout(r, 0));      // let the rejected promise settle
  const card = w.document.querySelector("#screenLoading .pmCard");
  return {
    card,
    eyebrow: card?.querySelector(".eyebrow")?.textContent?.trim() || "",
    lede: card?.querySelector(".pmLede")?.textContent?.trim() || "",
    html: w.document.getElementById("screenLoading")?.innerHTML || "",
  };
}

console.log("A permanent failure must not invite a retry");
{
  const r = await render({ status: 404 });
  t("404 says there is no board", /no QuickFire board for today/i.test(r.lede), r.lede);
  /* THE ASSERTION THIS FILE EXISTS FOR. Stated as a prohibition rather than a
     match on the new wording, so rephrasing the sentence cannot weaken it. */
  t("404 does NOT tell the player to try again",
    !/try again|in a moment|moment/i.test(r.lede), r.lede);
  t("404 does not blame the connection",
    !/connection problem\b(?!.*not)/i.test(r.eyebrow), r.eyebrow);
}

console.log("\nA transient failure still may pass, and still says so");
{
  const r = await render({ network: true });
  t("a dropped connection keeps the retry", /try again in a moment/i.test(r.lede), r.lede);
  const five = await render({ status: 500 });
  t("an unexpected 5xx keeps the retry too", /try again in a moment/i.test(five.lede), five.lede);
}

console.log("\nEach cause is told apart");
{
  const a = await render({ status: 404 });
  const b = await render({ status: 503 });
  const c = await render({ network: true });
  const d = await render({ status: 404, hash: "#x=abc123" });
  t("503 names it as ours, not the player's",
    /our side|not yours/i.test(b.lede), b.lede);
  t("a bad CHALLENGE link is not reported as 'no board today'",
    /challenge link/i.test(d.lede) && !/no QuickFire board/i.test(d.lede), d.lede);
  const said = [a.lede, b.lede, c.lede, d.lede];
  t("all four causes produce four different messages",
    new Set(said).size === 4, `${new Set(said).size} distinct`);
}

console.log("\nThe message is styled by classes this game defines");
{
  const r = await render({ status: 404 });
  t("the card wrapper survives", !!r.card);
  for (const cls of ["eyebrow", "pmDate", "pmLede"]) {
    t(`.${cls} is used and is defined in the stylesheet`,
      r.html.includes(`class="${cls}"`) && new RegExp("\\." + cls + "\\b").test(css));
  }
  /* The two the old branch invented. Asserted as absent from BOTH the markup it
     writes and the stylesheet, so reintroducing either is caught. */
  for (const cls of ["kicker", "blurb"]) {
    t(`.${cls} is not used, and does not exist to be used`,
      !r.html.includes(`class="${cls}"`) && !new RegExp("\\." + cls + "\\b").test(css));
  }
}

console.log("\nNothing about a board reaches the page on this path");
{
  const r = await render({ status: 404 });
  t("the failure card carries no question, answer or bench",
    !/answer|clue|bench/i.test(r.html), "the error path must not be a leak either");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
