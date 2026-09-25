/* record_shipped.mjs — the rewrite post_deploy.mjs makes to a gate, and only
 * that: LAST_SHIPPED and LAST_SHIPPED_ASSETS set to what is live, every other
 * byte of the file left as it was.
 *
 * A PURE FUNCTION, so it can be proved without production. post_deploy reads
 * the live site and runs live checks before it may write anything, which is
 * right for the script and makes the rewrite itself untestable in place.
 *
 * LINE ENDINGS ARE THE FILE'S, NOT THIS FUNCTION'S. The hash line was matched
 * with `[^\n]*` to take a trailing comment with it, and on a Windows checkout
 * that also took the line's \r: every run left each CRLF gate with exactly one
 * bare-LF line, and git warned about all twelve on every commit (found 25 Sep
 * 2026). The trailing match now stops at either character. */
export function recordShipped(text, tag, hash) {
  let out = text.replace(/const LAST_SHIPPED = "[^"]+";/, `const LAST_SHIPPED = "${tag}";`);
  /* NULL IS A SHAPE THIS HAS TO WRITE OVER. A game that has never shipped
     carries `= null;` — the sentinel its gate reads as "nothing to compare
     against yet" — and the trailing comment goes with it: "nothing has
     shipped yet" beside a recorded hash is a lie. */
  out = out.replace(/const LAST_SHIPPED_ASSETS = (?:"[^"]*"|null);[^\r\n]*/,
    `const LAST_SHIPPED_ASSETS = "${hash}";`);
  /* EACH CONSTANT ANSWERS FOR ITSELF: the result must literally contain each
     value it says it recorded, so a constant that is missing, renamed or in a
     shape the pattern cannot match is reported rather than passed quietly. */
  const missing = [];
  if (!out.includes(`const LAST_SHIPPED = "${tag}";`)) missing.push("LAST_SHIPPED");
  if (!out.includes(`const LAST_SHIPPED_ASSETS = "${hash}";`)) missing.push("LAST_SHIPPED_ASSETS");
  return { text: out, missing, changed: out !== text };
}
