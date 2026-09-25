/* record_shipped_test.mjs — the rewrite post_deploy.mjs makes to a gate.
 *
 *   node tools/record_shipped_test.mjs        (from the repo root)
 *
 * post_deploy cannot be run here: it reads the live site and runs every live
 * check before it may write. What it WRITES is tools/record_shipped.mjs, and
 * that is proved here against every real gate in the tree -- the fixtures are
 * the files it rewrites, not a shape somebody remembered them having -- in
 * both line endings, because the fault this exists for was one of them.
 *
 * Found 25 Sep 2026: each run left every CRLF gate with one bare-LF line (the
 * hash line's \r went with its trailing comment), and git warned about all
 * twelve gates on every commit afterwards.
 */
import fs from "node:fs";
import path from "node:path";
import { recordShipped } from "./record_shipped.mjs";

let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

const TAG = "v999z", HASH = "0123456789abcdef";
const bareLF = (s) => (s.match(/(?<!\r)\n/g) || []).length;
const lines = (s) => s.split(/\r?\n/);

/* EVERY GATE THE TREE HOLDS, walked rather than listed: a new theme's gate is
   covered by existing. A floor refuses a walk that finds implausibly few. */
const gates = [];
for (const theme of fs.readdirSync(".")) {
  if (theme.startsWith(".") || !fs.statSync(theme).isDirectory()) continue;
  for (const g of fs.readdirSync(theme)) {
    const f = path.join(theme, g, "deploy_check.mjs");
    if (fs.existsSync(f)) gates.push(f);
  }
}
t("the walk found the gates (a walk that finds nothing passes everything)", gates.length >= 12, gates.length + " gates");

for (const f of gates) {
  const lf = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  const crlf = lf.replace(/\n/g, "\r\n");

  const a = recordShipped(crlf, TAG, HASH);
  const changedLines = lines(crlf).filter((l, i) => l !== lines(a.text)[i]);
  t(`${f}, CRLF: both constants recorded, no bare LF left, and only their lines differ`,
    a.missing.length === 0 && bareLF(a.text) === 0 && lines(a.text).length === lines(crlf).length &&
      changedLines.length >= 1 && changedLines.length <= 2 && changedLines.every((l) => /const LAST_SHIPPED(_ASSETS)? = /.test(l)),
    `missing [${a.missing}], bare LF ${bareLF(a.text)}, ${changedLines.length} line(s) changed`);

  const b = recordShipped(lf, TAG, HASH);
  t(`${f}, LF: recorded, and no \\r introduced`, b.missing.length === 0 && !b.text.includes("\r"), `missing [${b.missing}]`);

  const again = recordShipped(a.text, TAG, HASH);
  t(`${f}: recording what is already recorded changes nothing`, again.changed === false && again.text === a.text, "changed " + again.changed);
}

/* THE SENTINEL, with the comment that has to go with it, in CRLF. */
{
  const src = 'const LAST_SHIPPED = "v001a";\r\nconst LAST_SHIPPED_ASSETS = null; // nothing has shipped yet\r\nconst NEXT = 1;\r\n';
  const r = recordShipped(src, TAG, HASH);
  t("a null hash with its comment is written over, the comment goes, and the line keeps its \\r\\n",
    r.text === `const LAST_SHIPPED = "${TAG}";\r\nconst LAST_SHIPPED_ASSETS = "${HASH}";\r\nconst NEXT = 1;\r\n`, JSON.stringify(r.text));
}

/* AND A GATE IT CANNOT REWRITE IS REFUSED, NOT REPORTED AS WRITTEN. */
{
  const r = recordShipped('const LAST_SHIPPED = "v001a";\nconst OTHER = 1;\n', TAG, HASH);
  t("a gate with no LAST_SHIPPED_ASSETS line is named as missing it", r.missing.length === 1 && r.missing[0] === "LAST_SHIPPED_ASSETS", `[${r.missing}]`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
