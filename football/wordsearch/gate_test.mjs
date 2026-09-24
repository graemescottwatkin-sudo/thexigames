/* gate_test.mjs — proves the word search's deploy_check.mjs actually fails.
 *
 *   node football/wordsearch/gate_test.mjs
 *
 * Breaks one rule at a time, restores the file, and asserts the gate named THAT
 * rule — not merely that something went red. QuickFire's gate_test is the
 * model; this one started on 24 Sep 2026 with the single check that had been
 * found vacuous, and a check added to the gate belongs here beside it.
 *
 * IT REWRITES REAL FILES. Run it alone — never beside another gate prover, and
 * never under a timeout that could kill it between the break and the restore.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");

function gate() {
  try {
    return execFileSync(process.execPath, [path.join(DIR, "deploy_check.mjs")],
      { encoding: "utf8", cwd: DIR });
  } catch (e) {
    return String(e.stdout || "");
  }
}

let missed = 0;

console.log("\nEvery check, watched failing");

/* A syntax error DEEP in a Function that has imports — the exact shape the old
   per-file `node --check` passed, because Node saw `import`, decided "module"
   and never parsed the body (24 Sep 2026: green, 38 passed / 0 failed, with
   this very line in wsdata.js). The gate must name the check AND the file.
   wsdata.js and not QuickFire's qfdata.js, so the two provers never rewrite the
   same file. Restored from the original bytes in a finally, so a throw cannot
   leave it broken; and the break is read back before the gate runs, because a
   sabotage that never landed looks exactly like a gate that caught nothing. */
{
  const rel = "functions/_lib/wsdata.js";
  const target = path.join(ROOT, rel);
  const bytes = fs.readFileSync(target);
  const probe = "\nexport function probe() { return 1 +; }\n";
  let out = "", landed = false;
  try {
    fs.writeFileSync(target, Buffer.concat([bytes, Buffer.from(probe)]));
    landed = fs.readFileSync(target, "utf8").endsWith(probe);
    out = gate();
  } finally {
    fs.writeFileSync(target, bytes);
  }
  const caught = landed && out.split("\n").some((l) =>
    l.startsWith("FAIL") && l.includes("parses as an ES module") && l.includes("wsdata.js"));
  console.log((caught ? "  ok  " : "MISS  ") + "a syntax error in the body of a Function that imports");
  if (!caught) {
    missed++;
    console.log("        " + (landed ? "the gate did not name the check and wsdata.js" : "the sabotage did not land"));
  }
}

/* THE UNTOUCHED TREE PASSES EVERY CHECK PROVED ABOVE — not "the gate says 0
   failed". This prover runs in the Test suites job, after jsdom is installed,
   and this gate refuses a tree with node_modules in it; so the whole gate is
   red there on every run, by design, and a prover asking for "0 failed" was
   red with it. That was caught in a CI-shaped run before it shipped, having
   passed on a local tree that had no node_modules. The whole gate being green
   is the gate's own run, which the deploy sequence makes with the tree clean. */
const cleanOut = gate().split("\n");
const clean = cleanOut.some((l) => l.startsWith("  ok  ") && l.includes("parses as an ES module"));
console.log((clean ? "  ok  " : "MISS  ") + "and the untouched folder passes the checks proved here");
if (!clean) missed++;

console.log("\n" + (missed ? `${missed} check(s) did not fire` : "Gate proven") + "\n");
process.exit(missed ? 1 : 0);
