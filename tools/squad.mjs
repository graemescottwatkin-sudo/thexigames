/* tools/squad.mjs — the squad as shared/xi-chrome.js states it, for suites.
 *
 * WHY THIS EXISTS. Until 26 Nov 2026 the suites that check the hub, the footer
 * and the front door each pinned the line-up as a number: "ten cards", "the
 * shirts run 1 to 10", "2 of 10 completed". That day the owner scaled the site
 * back to three games ("bring them back one at a time when ready"), and every
 * one of those literals was defending a fact that had just stopped being true.
 * A pinned count holds until the next launch and then gets "fixed" by bumping
 * the number; the squad list is where the line-up is decided, so it is read.
 *
 * The squad is read as TEXT, comments stripped, because xi-chrome.js is a
 * browser script and its SQUADS is not exported. A slot with a name and an
 * href is a game the site offers; a slot with a status is not. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/* Block comments only: the squad's notes are all block comments, and a line-
   comment stripper would eat the "//" inside nothing here but is not needed. */
const stripped = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ");

/* Every slot of one theme's squad, in shirt order: { n, name, href, status }. */
export function squadSlots(theme) {
  const src = stripped(fs.readFileSync(path.join(ROOT, "shared", "xi-chrome.js"), "utf8"));
  const from = src.indexOf("var SQUADS");
  const start = src.indexOf(theme + ": [", from);
  if (from === -1 || start === -1) throw new Error(`no ${theme} squad in shared/xi-chrome.js`);
  const block = src.slice(start, src.indexOf("]", start));
  const slots = [...block.matchAll(/\{\s*n:\s*(\d+)\s*,([^}]*)\}/g)].map(([, n, body]) => ({
    n: Number(n),
    name: (body.match(/name:\s*"([^"]+)"/) || [])[1] || null,
    href: (body.match(/href:\s*"([^"]+)"/) || [])[1] || null,
    status: (body.match(/status:\s*"([^"]+)"/) || [])[1] || null,
  }));
  if (!slots.length) throw new Error(`the ${theme} squad read as empty`);
  return slots;
}

/* The games a theme's squad OFFERS: named and linked, in shirt order. `dir` is
   the last path segment, which is the hub's data-game for a football game. */
export function namedSlots(theme) {
  return squadSlots(theme).filter((s) => s.name && s.href)
    .map((s) => ({ ...s, dir: s.href.replace(/\/$/, "").split("/").pop() }));
}
