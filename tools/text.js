/* tools/text.js — reading text the way it ships, whatever the checkout did.
 *
 * WHY. A Windows checkout writes CRLF, a CI runner writes LF, and git stores
 * whichever a file was committed with. The generators that rewrite source by
 * anchor or compare stored text read files raw, so the same tree answered
 * differently on each machine. On a CRLF checkout, build_vowels,
 * build_scrambled, build_friendscrossword and build_friendswhoami all refused
 * a tree CI was green on ("anchor not found", "is not what ... produces"),
 * measured 23 Sep 2026. The workaround was an LF archive
 * (git -c core.autocrlf=false archive), which CLAUDE.md spells out at length
 * because it was needed every time. Worse, a recipe that prints reds on a
 * good tree teaches you which reds to ignore.
 *
 * So text is read here, once, with CRLF folded to LF. An anchor written with
 * \n matches on either checkout, a --check compares content rather than line
 * endings, and anything generated is written LF, which is what git stores.
 * The asset hashes in the gates already fold CRLF the same way.
 *
 * Binary files and JSON are not this module's business: JSON.parse does not
 * care, and a PNG must never be folded.
 */
import fs from "node:fs";

/* CRLF folded to LF. A lone CR is left alone: nothing here writes one, and
   folding it would hide a file that really is broken. */
export const lf = (s) => String(s).split("\r\n").join("\n");

export function readText(file) {
  return lf(fs.readFileSync(file, "utf8"));
}

/* The stored side of a --check: null when there is no file, so "missing" and
   "different" stay two answers. */
export function readTextIfExists(file) {
  return fs.existsSync(file) ? readText(file) : null;
}
