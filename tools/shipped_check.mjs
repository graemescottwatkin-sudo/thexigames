/* tools/shipped_check.mjs — is every game's LAST_SHIPPED still what is live?
 *
 *   node tools/shipped_check.mjs
 *
 * WHY THIS EXISTS. On 17 September 2026 Ballpark's assets changed twice under
 * one tag. v001g shipped at 00:52; the clock fix went out at 11:04 under the
 * same v001g, so every browser and every edge node holding that URL kept the
 * broken script — marked immutable for a year — while the live_check passed,
 * because BUILD reads v001g in both versions.
 *
 * THE GATE WAS RIGHT AND ITS INPUT WAS STALE. deploy_check refuses changed
 * bytes under a tag that has not moved, comparing against LAST_SHIPPED — and
 * LAST_SHIPPED still said v001f, because post_deploy had not been run after the
 * 00:52 push. So the gate read a second, different build under an
 * already-shipped tag as a legitimate bump. CLAUDE.md predicts exactly this:
 * "Skipping this widens the range the gate cannot refuse." Three pushes went
 * out with step 6 skipped and two games drifted before anybody noticed.
 *
 * Nothing made the SKIP visible. post_deploy is a write somebody has to
 * remember; this is the same derivation run as a question, on every push, so
 * forgetting is red within one run rather than invisible until it costs a
 * cached year.
 *
 * IT RUNS ON THE CLOCK, NOT ON PUSH, and the first draft had that wrong. On a
 * push, CI and the Pages deploy race: sometimes live is still the old tag,
 * sometimes it is already the new one. Tolerating both — "live is either the
 * recorded tag or the tree's" — makes it non-flapping and useless, because the
 * skipped-bookkeeping state IS "live equals the tree and the record is behind".
 * The first run proved it: wordsearch recorded v002r against a live v002s and
 * the tolerant rule called it ok, which is the very drift being hunted.
 *
 * The nightly has no race. Hours after any deploy the resting state is exact —
 * CLAUDE.md: "A tag equal to LAST_SHIPPED is the RESTING state" — so this can
 * demand recorded == live and mean it. A skipped post_deploy is red by the
 * next morning instead of invisible until it costs a cached year.
 *
 * AND IT DOES NOT PASS ON SILENCE. A site that cannot be reached is UNKNOWN,
 * not well. Every unreachable game is reported and the run fails, because a
 * check that goes quiet when its input is missing is the fault this repository
 * has spent a fortnight finding.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.XI_ORIGIN || "https://www.thexigames.com";

/* The list is the directory, not a sentence here — the same rule the deploy
   sequence follows, so a new game is covered by existing. */
const games = fs.readdirSync(path.join(ROOT, "football"))
  .filter((g) => fs.existsSync(path.join(ROOT, "football", g, "deploy_check.mjs")))
  .sort();

if (games.length < 8) {
  console.error(`REFUSED: found only ${games.length} game(s) under football/ — the walk is broken,`);
  console.error("  not the estate. A check that passes when it finds nothing is not a check.");
  process.exit(2);
}

const recordedOf = (g) => {
  const src = fs.readFileSync(path.join(ROOT, "football", g, "deploy_check.mjs"), "utf8");
  const m = /const LAST_SHIPPED = "([^"]+)"/.exec(src);
  return m ? m[1] : null;
};
const treeOf = (g) => {
  const js = path.join(ROOT, "football", g, "js", "game.js");
  if (!fs.existsSync(js)) return null;
  const m = /var BUILD = "([^"]+)"/.exec(fs.readFileSync(js, "utf8"));
  return m ? m[1] : null;
};

async function liveOf(g) {
  /* The tag the PAGE asks for, which is the one a browser caches under — not
     the BUILD inside the script, which is what made this invisible: both
     builds said v001g. */
  const r = await fetch(`${ORIGIN}/football/${g}/`, { headers: { "cache-control": "no-cache" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  const m = /js\/game\.js\?v=([A-Za-z0-9]+)/.exec(html);
  if (!m) throw new Error("no js/game.js?v= on the page");
  return m[1];
}

let bad = 0, unknown = 0;
console.log(`What is live at ${ORIGIN}, against what each gate records\n`);
console.log("game         recorded   tree       live       verdict");

for (const g of games) {
  const rec = recordedOf(g), tree = treeOf(g);
  let live = null, err = null;
  try { live = await liveOf(g); } catch (e) { err = e.message; }

  let verdict;
  if (err) { verdict = "UNREACHABLE — " + err; unknown++; }
  else if (!rec || !tree) { verdict = "cannot read its own tags"; bad++; }
  else if (live === rec) verdict = live === tree ? "ok" : "ok (tree ahead, not deployed yet)";
  else { verdict = `DRIFTED — run tools/post_deploy.mjs`; bad++; }

  console.log(`${g.padEnd(12)} ${String(rec).padEnd(10)} ${String(tree).padEnd(10)} ` +
              `${String(live).padEnd(10)} ${verdict}`);
}

console.log("");
if (unknown) {
  console.error(`${unknown} game(s) could not be reached. That is not a pass: a check with no`);
  console.error("  answer must not report a good one.");
}
if (bad) {
  console.error(`${bad} game(s) drifted. LAST_SHIPPED is what the gate compares changed bytes`);
  console.error("  against, so while it is stale the gate cannot refuse a second build under a");
  console.error("  tag that has already shipped — which is how a broken script reached players");
  console.error("  under a cached, immutable URL on 17 Sep 2026.");
}
if (bad || unknown) process.exit(1);
console.log(`${games.length} game(s) checked, every one live on the tag its gate records.`);
