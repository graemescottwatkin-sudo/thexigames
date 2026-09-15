/* post_deploy.mjs — record what is live, by deriving it rather than being told.
 *
 *   node tools/post_deploy.mjs            show what it would write
 *   node tools/post_deploy.mjs --write    write it
 *
 * WHY THIS EXISTS. The post-deploy bump was four hand-edits across two files:
 * LAST_SHIPPED and LAST_SHIPPED_ASSETS, per game. It was skipped often enough
 * that LAST_SHIPPED once sat two releases behind what was live, which widened
 * the range the gate could not refuse — and that stale gate is what let a
 * client fix nearly ship under an unchanged cache key.
 *
 * IT DERIVES, IT DOES NOT ACCEPT. Every value written is computed here:
 *   - the tag comes from the LIVE page, not from the tree and not from an
 *     argument, so a tag can only be recorded once production is serving it;
 *   - the hash is computed from the tree's own asset bytes;
 *   - and it refuses unless the live tag equals the tree's tag AND that game's
 *     live_check passes. A bump recorded for a deploy that never landed is
 *     worse than no bump: it is a gate reporting a version nobody is serving.
 *
 * The game list is the contract's, read from tools/aligned_test.mjs. A new
 * game is a row THERE and nowhere else.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");
const SITE = "https://www.thexigames.com";

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/* The game list, from the contract that already owns it. */
/* Matched on `dir:` wherever it sits and whatever it contains. This required
   dir to be the FIRST key in the object and to hold no slash — both true until
   the games moved under a theme and the table grew an `id` beside a `dir` of
   "football/crossword". It then matched nothing, and the guard below turned
   that into a refusal rather than a silent run over zero games, which is the
   only reason this was a one-line fix and not a wrong LAST_SHIPPED. */
const GAMES = [...read("tools/aligned_test.mjs")
  .matchAll(/\bdir:\s*"([a-z\/]+)"/g)].map((m) => m[1]);
if (!GAMES.length) { console.log("FAIL  no games found in tools/aligned_test.mjs"); process.exit(1); }

/* The same rule both gates use: the game's own tagged assets, discovered from
   the page, hashed in a stable order. Restating it here would be the second
   copy this whole exercise exists to avoid — but the gates cannot import from
   a tools/ file and stay standalone, so the shape is asserted below instead. */
function assetHash(dir) {
  const html = read(`${dir}/index.html`);
  const paths = [...html.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)\?v=[^"]*"/g)]
    .map((m) => m[1]).sort();
  if (!paths.length) return null;
  const h = crypto.createHash("sha256");
  for (const p of paths) {
    h.update(p); h.update("\0");
    /* NORMALISED TO LF FIRST. The hash is meant to describe the bytes that
       SHIP, and what ships is what is in git — LF. On a Windows checkout the
       same file is CRLF in the working tree, so the hash depended on which
       tool last wrote the file: a plain `git checkout` of an untouched file
       turned every one of these gates red for a change nobody had made.
       All five places that compute this hash normalise, or they cannot
       agree. */
    h.update(fs.readFileSync(path.join(ROOT, dir, p), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 16);
}
const tagFrom = (html) => (html.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1] || null;

let refused = 0;
const plan = [];

for (const dir of GAMES) {
  const treeTag = tagFrom(read(`${dir}/index.html`));
  let liveTag = null;
  try {
    const res = await fetch(`${SITE}/${dir}/`, { headers: { "cache-control": "no-cache" } });
    liveTag = res.ok ? tagFrom(await res.text()) : null;
  } catch (e) { liveTag = null; }

  if (!treeTag || !liveTag) {
    console.log(`FAIL  ${dir}: could not read a tag — tree ${treeTag || "?"}, live ${liveTag || "?"}`);
    refused++; continue;
  }
  if (treeTag !== liveTag) {
    console.log(`FAIL  ${dir}: the deploy has not landed — tree ${treeTag}, live ${liveTag}`);
    console.log(`      nothing is recorded for a version production is not serving.`);
    refused++; continue;
  }
  /* The live_check is the evidence that the deploy is HEALTHY, not merely
     present. Its own bytes probe proves the served file is this checkout. */
  try {
    execFileSync(process.execPath, [path.join(ROOT, dir, "live_check.mjs"), "--expect", liveTag],
      { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], timeout: 300000 });
  } catch (e) {
    console.log(`FAIL  ${dir}: live_check --expect ${liveTag} did not pass; nothing recorded`);
    refused++; continue;
  }

  const gateFile = `${dir}/deploy_check.mjs`;
  const gate = read(gateFile);
  const curTag = (gate.match(/const LAST_SHIPPED = "([^"]+)"/) || [])[1];
  const curHash = (gate.match(/const LAST_SHIPPED_ASSETS = "([^"]+)"/) || [])[1];
  const newHash = assetHash(dir);
  if (!newHash) { console.log(`FAIL  ${dir}: no tagged assets found`); refused++; continue; }

  plan.push({ dir, gateFile, curTag, newTag: liveTag, curHash, newHash });
  console.log(`  ok  ${dir}: live ${liveTag}, live_check passed`);
}

if (refused) {
  console.log(`\n${refused} game(s) refused. Nothing written.`);
  process.exit(1);
}

console.log("\nWhat would change:\n");
let changes = 0;
for (const p of plan) {
  const tagLine = p.curTag === p.newTag ? `    LAST_SHIPPED        ${p.curTag} (unchanged)`
    : `    LAST_SHIPPED        ${p.curTag} -> ${p.newTag}`;
  const hashLine = p.curHash === p.newHash ? `    LAST_SHIPPED_ASSETS ${p.curHash} (unchanged)`
    : `    LAST_SHIPPED_ASSETS ${p.curHash} -> ${p.newHash}`;
  if (p.curTag !== p.newTag || p.curHash !== p.newHash) changes++;
  console.log(`  ${p.gateFile}`);
  console.log(tagLine);
  console.log(hashLine);
}
reportRunway();
if (!changes) { console.log("\nAlready up to date. Nothing to write."); process.exit(0); }

if (!WRITE) {
  console.log("\nRe-run with --write to apply.");
  process.exit(0);
}

let unwritten = 0;
for (const p of plan) {
  const before = read(p.gateFile);
  let gate = before;
  gate = gate.replace(/const LAST_SHIPPED = "[^"]+";/, `const LAST_SHIPPED = "${p.newTag}";`);
  /* NULL IS A SHAPE THIS HAS TO WRITE OVER. A game that has never shipped
     carries `= null;` — the sentinel its gate reads as "nothing to compare
     against yet" — and this pattern used to demand quotes, so Grid XI's first
     hash was reported as written and was not. The trailing comment goes with
     it: "nothing has shipped yet" beside a recorded hash is a lie. */
  gate = gate.replace(/const LAST_SHIPPED_ASSETS = (?:"[^"]*"|null);[^\n]*/,
    `const LAST_SHIPPED_ASSETS = "${p.newHash}";`);
  /* EACH CONSTANT ANSWERS FOR ITSELF, and it did not used to.
   *
   * The guard was `gate === before` — one comparison for two rewrites — so it
   * could only see a file where NEITHER landed. Who Am I's gate had no
   * LAST_SHIPPED_ASSETS line at all: the tag replacement landed, the file
   * differed from before, the guard was satisfied, and the report said
   * "LAST_SHIPPED_ASSETS undefined -> dea4aa99f808361d" over a hash that was
   * never written. That is the same fault the guard was added for — a no-op
   * reported as a write — surviving inside the guard itself because it asked
   * one question about two things.
   *
   * So the check is now made on the RESULT rather than on whether anything
   * moved: after the rewrite, the file must literally contain each value this
   * script says it recorded. A constant that is missing, renamed or written in
   * a shape the pattern cannot match fails here instead of passing quietly. */
  const missing = [];
  if (!gate.includes(`const LAST_SHIPPED = "${p.newTag}";`)) missing.push("LAST_SHIPPED");
  if (!gate.includes(`const LAST_SHIPPED_ASSETS = "${p.newHash}";`)) missing.push("LAST_SHIPPED_ASSETS");
  if (missing.length) {
    console.log(`FAIL  ${p.gateFile}: ${missing.join(" and ")} ` +
      `${missing.length > 1 ? "are" : "is"} absent or not in a shape this can ` +
      `rewrite — nothing recorded for this game`);
    unwritten++;
    continue;
  }
  fs.writeFileSync(path.join(ROOT, p.gateFile), gate);
  console.log(`  written  ${p.gateFile}`);
}
if (unwritten) {
  console.log(`\n${unwritten} file(s) could not be rewritten. Fix them by hand and re-run.`);
  process.exitCode = 1;
}
console.log("\nCommit as: LAST_SHIPPED " + plan.map((p) => p.newTag).join(" / ") + " + asset hashes");

function reportRunway() {
  /* ---- HOW MANY DAYS OF BOARDS ARE LEFT ------------------------------------
   *
   * Reported here because this is the script somebody actually runs after a
   * deploy, and a runway is the one fault in this family that NOTHING ELSE CAN
   * SEE. A game whose schedule has ended answers exactly what a game whose
   * schedule has not started answers — the same 404, the same body, the same
   * source "d1" — so every gate, suite and live_check stays green while the game
   * quietly stops. QuickFire XI ran to 25 October with nothing anywhere saying so.
   *
   * IT REPORTS, IT DOES NOT BLOCK, and that is deliberate. A short runway is not a
   * reason to refuse recording a deploy that has already landed: the tag is live
   * whether or not the calendar is short, and a gate that goes red for an
   * unrelated reason is a gate people learn to push past. The exit code stays the
   * business of the LAST_SHIPPED write above. Run tools/runway_check.mjs on its
   * own when you want the refusal.
   *
   * NEEDS THE NETWORK, so a failure to reach D1 is reported and swallowed —
   * post_deploy's job is recording the bump, and it must not fail because a
   * secondary read timed out. A silent skip would be wrong; a loud one is fine. */
  try {
    const runway = execFileSync(process.execPath,
      [path.join(ROOT, "tools", "runway_check.mjs"), "--report"],
      { encoding: "utf8", maxBuffer: 1 << 22 });
    console.log(runway.replace(/^/gm, "  ").trimEnd());
    if (/^\s*(SHORT|EXPIRED|UNREADABLE)/m.test(runway)) {
      console.log("\n  A SHORT RUNWAY IS NOT FIXED BY RE-RUNNING A GENERATOR. For a\n" +
        "  scheduled game the limit is usually the CONTENT — QuickFire's is distinct\n" +
        "  answers, not questions, and asking its builder for more days returns the\n" +
        "  same number. Check what the game is actually short of before regenerating.");
    }
  } catch (err) {
    console.log("\n  runway check did not run: " + String(err.message).split("\n")[0]);
    console.log("  (this does not affect the LAST_SHIPPED result above — run" +
      " tools/runway_check.mjs by hand)");
  }
}
