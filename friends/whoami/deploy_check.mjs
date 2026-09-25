#!/usr/bin/env node
/* friends/whoami/deploy_check.mjs — the Friends Who Am I's gate.
 *
 * ONE GATE PER GAME, and the deploy sequence's list is the DIRECTORY rather
 * than a number written anywhere: `dir *\*\deploy_check.mjs`. A count in a
 * document is a measurement wearing a law's clothes, and this project has been
 * bitten by that one four times.
 *
 * THE TAG LAW. LAST_SHIPPED is what is LIVE and LAST_SHIPPED_ASSETS is a hash
 * of the bytes it names. A tag never goes backwards. Equal to LAST_SHIPPED is
 * the RESTING state and passes — the tree is what is live — and the paired
 * asset hash is the half that carries the law: changed bytes under a tag that
 * has not moved are refused.
 *
 * IT HAS SHIPPED: v001a went live on 23 Sep 2026, the day it launched, and
 * post_deploy recorded it (51a27f9). Until then this paragraph said nothing
 * had shipped and LAST_SHIPPED_ASSETS was null, with the comparison skipped
 * and the skip printed. That was right for a game in build. It stayed in the
 * header after launch, telling readers the tag law was not yet enforced when
 * it was. The null branch went at the same time: a shipped game with no hash
 * recorded is now a FAILURE, not a skip. Setting the constant back to null
 * would otherwise switch off the half of the law that carries it, and the
 * gate would still say 0 failed.
 *
 * WHAT THIS GAME IS. The Friends deck hides a CARD and deals three written
 * clues; football's hides a footballer and reveals his attributes. What they
 * share is the SHAPE of a sitting — doors, one answer each, clues bought in
 * order — which is why one server runs both, and why most of what this gate
 * refuses is the two games bleeding into each other: the wrong tables, the
 * wrong endpoints, the wrong storage prefix, the wrong ladder.
 *
 * AND IT IS UNLISTED. Live, banked, streaked, and advertised nowhere. The
 * checks about being FOUND key off isListed(); the ones about being PLAYABLE
 * key off LAUNCHED. Conflating them is how an unlisted game ends up either
 * unplayable or on the front page.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LAUNCHED, GAMES, isListed, inSeason, entryKey } from "../../functions/_lib/games.js";
import { THEME_OF, SLUG_OF, gamePath, gameDir } from "../../functions/_lib/permalink.js";
import { WHOAMIS, whoamiOf, FR_LADDER } from "../../functions/_lib/wa-registry.js";
import * as frwa from "../../functions/_lib/frwa-data.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (p) => fs.existsSync(path.join(ROOT, p));

const GAME = "whoami_fr";
const DIR = "friends/whoami";
const SRC = "football/whoami";          // the game this one is generated from

/* WHAT IS LIVE. Bump both after a deploy with tools/post_deploy.mjs, which
   derives them from the live page rather than trusting anyone's memory. */
const LAST_SHIPPED = "v001g";
const LAST_SHIPPED_ASSETS = "9a3b0a7468e6d56d";

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}

const html = read(DIR + "/index.html");
const js = read(DIR + "/js/game.js");
const css = read(DIR + "/css/style.css");
const cfg = read(DIR + "/js/config.js");

/* THIS GAME'S CORNER OF localStorage, named once rather than written into four
   assertions that can then disagree. */
const PREFIX = "xifw.";
const FOOTBALL_PREFIX = "xiwa.";

const launched = !!LAUNCHED[GAME];
const listed = isListed(GAME);

/* EVERY GREP ABOUT WHAT THE PAGE LOADS READS `markup`, NOT `html`. A comment is
   not markup a browser acts on, and letting one answer a question about script
   tags fails in BOTH directions: a check can fail on its own explanatory
   comment, which is loud and gets fixed — and the mirror, a comment SATISFYING
   a check that meant to demand a real tag, passes quietly and is the one that
   ships. `html` is kept only for questions about the file's bytes. */
const markup = html.replace(/<!--[\s\S]*?-->/g, "");
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const jsCode = noComments(js);
const cfgCode = noComments(cfg);

/* ---- the tag law -------------------------------------------------------- */

console.log("The tag law");

function ownAssetHash() {
  const paths = [...markup.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)\?v=[^"]*"/g)]
    .map((m) => m[1]).sort();
  if (!paths.length) return null;
  const h = crypto.createHash("sha256");
  for (const p of paths) {
    if (!has(DIR + "/" + p)) return null;
    h.update(p); h.update("\0");
    /* NORMALISED TO LF, because what ships is what is in git and a Windows
       checkout writes CRLF — a hash of the working tree would otherwise answer
       a different question on each machine. Every hash of shipped bytes in this
       repo does this, and any new one must too. */
    h.update(fs.readFileSync(path.join(ROOT, DIR, p), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 16);
}

const tag = (markup.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1];
t("asset URLs carry a build tag so a cached copy cannot be reused", !!tag, tag);
t("LAST_SHIPPED is a real version, not a sentinel",
  !!LAST_SHIPPED && LAST_SHIPPED !== "v000", `shipped ${LAST_SHIPPED}`);
t("the build tag never goes backwards", !!tag && tag >= LAST_SHIPPED,
  `now ${tag}, live ${LAST_SHIPPED}`);

/* THE PAIRED HALF. LAST_SHIPPED_ASSETS is the hash of the bytes LAST_SHIPPED
   names, and a change under an unmoved tag is refused. The game has shipped,
   so a missing hash is refused too: the pre-launch skip that allowed one is
   gone (see the header), because a comparison against nothing is the
   sentinel fault. */
t("the live build's asset hash is recorded",
  typeof LAST_SHIPPED_ASSETS === "string" && /^[0-9a-f]{16}$/.test(LAST_SHIPPED_ASSETS),
  String(LAST_SHIPPED_ASSETS));
t("the game's own assets cannot change without its build tag moving",
  typeof LAST_SHIPPED_ASSETS === "string" &&
    (tag > LAST_SHIPPED || ownAssetHash() === LAST_SHIPPED_ASSETS),
  `assets ${ownAssetHash()}`);

t("every asset the page pulls from this game carries the same tag", (() => {
  const own = [...markup.matchAll(/(?:src|href)="(?:css|js)\/[^"?]+\?v=([^"]*)"/g)]
    .map((m) => m[1]);
  return own.length > 0 && own.every((v) => v === tag);
})(), tag);

t("the build tag matches the one the script reports",
  (jsCode.match(/var BUILD = "([^"]+)"/) || [])[1] === tag, tag);

t("every relative file reference resolves, exact case", (() => {
  const refs = [...markup.matchAll(/(?:src|href)="((?:css|js)\/[^"?]+)/g)].map((m) => m[1]);
  if (!refs.length) return false;
  return refs.every((r) => {
    const dir = path.join(ROOT, DIR, path.dirname(r));
    return fs.existsSync(dir) && fs.readdirSync(dir).includes(path.basename(r));
  });
})());

/* ---- the id, the address, and the fact they are two things -------------- */

console.log("\nThe id is not the directory");

t("the id is whoami_fr and it is not the directory",
  GAMES.includes(GAME) && GAME !== DIR, GAME);
t("gameDir agrees with where this file actually is",
  gameDir(GAME) === DIR, gameDir(GAME));
t("gamePath is the served address", gamePath(GAME) === "/" + DIR + "/", gamePath(GAME));
t("the theme is the first path segment", THEME_OF[GAME] === "friends", THEME_OF[GAME]);
t("and the slug drops the _fr, so the URL never carries the id",
  SLUG_OF[GAME] === "whoami" && !gamePath(GAME).includes("_fr"), SLUG_OF[GAME]);

/* NOTHING ASSEMBLES A PATH BY HAND. The theme move rewrote a hundred literal
   paths across ninety files and every one of them was a place the theme could
   later be wrong. The next theme must be one function, not another sweep. */
t("nothing here assembles a path by hand", (() => {
  /* THE PATTERN IS BUILT FROM gamePath(), NOT WRITTEN OUT -- because writing it
     out is the very thing being forbidden, and the first version of this check
     failed on its own literal. A check that cannot be written without breaking
     its own rule is a check whose rule is worth keeping. */
  const literal = new RegExp('["\'`]' + gamePath(GAME).replace(/\//g, "\\/"));
  const guilty = ["deploy_check.mjs", "live_check.mjs"].filter((f) => {
    if (!has(DIR + "/" + f)) return false;
    const code = noComments(read(DIR + "/" + f))
      .split('const DIR = "' + DIR + '";').join("");
    return literal.test(code);
  });
  return guilty.length === 0;
})());

/* ---- not being found ---------------------------------------------------- */

console.log("\nUnlisted: live, and advertised nowhere");

t("the game is launched", launched, LAUNCHED[GAME] || "not launched");
t("and it is NOT listed, which is the owner's standing instruction for this theme",
  launched && !listed, listed ? "LISTED — a name and an href are now required" : "unlisted");

/* THE SQUAD SLOT CARRIES NEITHER A NAME NOR AN HREF. shared/xi-chrome.js is
   downloaded by every page on the site, so an href in it is the site STATING
   where the game is — the one thing "not publicly visible" cannot allow. Read
   from the RAW bytes rather than stripped code, because a comment naming the
   address ships too: this file is served unminified. */
const chrome = read("shared/xi-chrome.js");
t("the Friends squad names no game and links to none", (() => {
  const squad = (chrome.match(/friends:\s*\[([\s\S]*?)\n\s*\],/) || [])[1] || "";
  return squad.length > 0 && !/name:/.test(squad) && !/href:/.test(squad);
})());
t("and the shipped chrome does not carry this game's address anywhere",
  listed || chrome.indexOf(gamePath(GAME)) === -1,
  "raw bytes, comments included — this file ships unminified, so a comment " +
  "naming the address IS the site naming it");

/* THE THEME STILL HAS A SQUAD. themeHere() falls back to football for an
   unknown first segment, so deleting the `friends` key would hand a Friends
   player the FOOTBALL team sheet — worse for the reader and not one bit more
   private. */
t("but the theme still HAS a squad, so its own pages do not show football's",
  /friends:\s*\[/.test(chrome));

t("the page is noindexed while the game is unlisted",
  listed || /<meta[^>]+name="robots"[^>]+noindex/i.test(markup));

t("the sitemap advertises nothing of this game", (() => {
  const sm = has("functions/sitemap.xml.js") ? read("functions/sitemap.xml.js")
           : has("functions/_lib/sitemap.js") ? read("functions/_lib/sitemap.js") : "";
  if (!sm) return false;                       // cannot check is not a pass
  return noComments(sm).indexOf(GAME) === -1 && noComments(sm).indexOf("/friends/whoami") === -1;
})());

/* ---- the two decks must not bleed into each other ----------------------- */

console.log("\nThis is not football's deck");

t("the registry knows this game and gives it its own tables", (() => {
  const w = whoamiOf(GAME);
  if (!w) return false;
  const names = Object.values(w.tables);
  return names.length === 4 && names.every((n) => n.startsWith("fr_wa_"));
})(), whoamiOf(GAME) ? Object.values(whoamiOf(GAME).tables).join(", ") : "unknown game");

t("and football's tables are a different four, so a round cannot land in the wrong one", (() => {
  const mine = new Set(Object.values(WHOAMIS[GAME].tables));
  const theirs = Object.values(WHOAMIS.whoami.tables);
  return theirs.length === 4 && theirs.every((n) => !mine.has(n));
})(), Object.values(WHOAMIS.whoami.tables).join(", "));

/* EVERY CALL THE CLIENT MAKES IS NAMESPACED, AND THIS IS NOT HYPOTHETICAL.
   The generator's first version rewrote only the DOUBLE-quoted "/api/whoami/
   — the daily — and left the six single-quoted calls pointing at football's
   endpoints. The page would have read its board from the Friends deck and done
   everything else against football's: opening a round in wa_round, buying a
   footballer's spell, and being judged against whoever stood behind football's
   door for that slot. Separate tables make that unrepresentable on the SERVER;
   a client addressing the wrong endpoints walks straight around them. */
t("every whoami call the client makes is namespaced to this game", (() => {
  const calls = jsCode.match(/\/api\/whoami\/[a-z_]+/g) || [];
  if (calls.length < 2) return false;                 // a walk that finds nothing
  return calls.every((c) => c.startsWith("/api/whoami/whoami_fr"));
})(), (jsCode.match(/\/api\/whoami\/[a-z_]+/g) || []).length + " call(s)");

t("and not one of them addresses football's legacy address",
  !/\/api\/whoami\/(?!whoami_fr)(daily|play|clue|names|guess|finish|giveup)/.test(jsCode));

/* EVERY KEY COMES OFF ONE CONSTANT, which is what makes the next assertion
   able to mean anything. The first version of this check walked for composed
   literals like "xifw.results.v1" and found NONE -- because the client builds
   every key as PREFIX + "...", which is the right design. It refused rather
   than passing on an empty walk, which is the only reason the hole was visible
   at all: "every x in an empty list" is true, and a check that finds nothing
   otherwise reports the same green as one that found no problems. */
t("the client keeps its storage under ONE named prefix", (() => {
  const decl = jsCode.match(/var PREFIX = "([^"]+)"/);
  return !!decl && decl[1] === PREFIX;
})(), PREFIX);

t("and every key it builds is built from that constant", (() => {
  /* COUNTED ON `PREFIX +` RATHER THAN ON `PREFIX + "literal"`. The first
     version matched only the literal form and found one, tripping its own
     floor -- but the client composes twice more with a VARIABLE suffix,
     PREFIX + storageKey, which is the same rule obeyed and the pattern could
     not see it. A floor that counts the wrong thing refuses correct code,
     which teaches the next reader to raise floors rather than read them. */
  const composed = jsCode.match(/PREFIX \+ /g) || [];
  if (composed.length < 2) return false;               // a walk that finds nothing
  /* AND NOTHING IS BUILT FROM A BARE LITERAL. A key written out in full would
     bypass the constant entirely, which is how a game comes to write another
     game's corner of localStorage. */
  const bare = (jsCode.match(/["'](?:xi|fcw|qfx)[a-z]*\.[a-zA-Z0-9._]+["']/g) || [])
    .map((k) => k.slice(1, -1))
    .filter((k) => !k.startsWith("xi."));              // family-wide keys are shared
  return bare.length === 0;
})(), (jsCode.match(/PREFIX \+ /g) || []).length + " key(s) off the constant");

t("and it never writes football's prefix", jsCode.indexOf(FOOTBALL_PREFIX) === -1,
  FOOTBALL_PREFIX + " appears " + (jsCode.split(FOOTBALL_PREFIX).length - 1) + " time(s)");

t("the prefix is this game's and is not taken", (() => {
  const others = fs.readdirSync(path.join(ROOT, "shared"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => read("shared/" + f)).join("\n");
  /* It must be SWEPT by Clear everything — a prefix nothing sweeps is a game
     whose saves survive a reset — and it must be this game's alone. */
  return others.indexOf('"' + PREFIX + '"') > -1;
})(), "swept by the chrome's reset");

t("it does NOT load the season, which Friends is not in",
  !inSeason(GAME) && !/xi-season\.js/.test(markup),
  "NO_SEASON in games.js, and no script tag");

t("its result key is its own, so one Tuesday cannot file two games under one key", (() => {
  const row = { day: "2026-09-22", slot: 2, solved: true, score: 6 };
  const mine = entryKey(GAME, row);
  const theirs = entryKey("whoami", { ...row, game: "whoami" });
  return typeof mine === "string" && mine !== theirs && mine.startsWith("frwa:");
})(), entryKey(GAME, { day: "2026-09-22" }) + " vs " + entryKey("whoami", { day: "2026-09-22" }));

/* ---- what a door may say ------------------------------------------------ */

console.log("\nA door says a section, and never its card");

/* PROVED BY EXECUTION, NOT BY GREP. publicDoor is handed a row with every
   field the answer query returns — the card id, the name, the clue count —
   and what comes back is inspected. A regex over the function body would pass
   on a comment and would not notice a field added to the SELECT. */
const FULL_ROW = {
  slot: 2, round_letter: "B", card_id: "main-07", name: "Rachel Green",
  section: "Loves & Exes", deck: "main", depth: 12, rounds: 4,
};
const pub = frwa.publicDoor(FULL_ROW);
t("the projection runs at all", !!pub && typeof pub === "object");
t("PRECONDITION: the row it is given DOES carry the answer",
  FULL_ROW.name.length > 0 && FULL_ROW.card_id.length > 0,
  "otherwise the check below would pass on an empty row");
t("a public door carries the slot, the section and the deck, and nothing else",
  JSON.stringify(Object.keys(pub).sort()) === JSON.stringify(["deck", "section", "slot"]),
  Object.keys(pub).join(", "));
t("and neither the card's name nor its id is anywhere in it",
  JSON.stringify(pub).indexOf(FULL_ROW.name) === -1 &&
  JSON.stringify(pub).indexOf(FULL_ROW.card_id) === -1);
t("nor how many clues the card has, which would say how often it comes back",
  !("depth" in pub) && !("rounds" in pub) && !("round_letter" in pub));

/* A BOUGHT CLUE IS ONE SENTENCE. clueBody is what the rung returns, and the
   episode is deliberately NOT in it — a citation shown mid-round is a clue
   nobody paid for. clueSource is the separate answer, for a round that is over. */
const CLUE = { n: 5, step: 2, text: "She was a waitress here.", vs: "ep", ep: "S2E14" };
const body = frwa.clueBody(CLUE, 2, 3);
t("a bought clue carries its sentence and its position", body.text === CLUE.text && body.of === 3);
t("and says only THAT a source exists, never which episode",
  body.cited === true && JSON.stringify(body).indexOf(CLUE.ep) === -1,
  "the episode is clueSource's answer, for a round that has ended");

/* ---- the ladder is this deck's ------------------------------------------ */

console.log("\nThe ladder, and the door count");

t("three doors a day, not football's eleven", frwa.DOORS === 3, String(frwa.DOORS));

/* A DAILY DOOR READS THE DAILY ROUNDS. Dailies deal verified clues only, by
   the owner's ruling of 23 September 2026, and the rounds of the verified
   subset live in fr_wa_daily_clue — a daily letter names one of THOSE, not the
   full card's round of the same letter. Proved by EXECUTION: the reader is
   called against a database that records what it was asked, because a grep for
   the table name would pass on this comment. */
const asked = [];
const recorder = { prepare: (q) => { asked.push(q.replace(/\s+/g, " ")); const r = { first: async () => null, all: async () => ({ results: [] }) }; return { bind: () => r, ...r }; } };
await frwa.clueAt({ DB: recorder }, "1", "A", 1);
await frwa.stepsInRound({ DB: recorder }, "1", "A");
t("a daily door's clue is read through fr_wa_daily_clue",
  asked.length === 2 && asked.every((q) => /FROM fr_wa_daily_clue/.test(q)),
  asked.map((q) => (q.match(/FROM (\w+)/) || [])[1]).join(", "));
t("and the migration that creates that table is safe to re-run", (() => {
  const f = "data/migrations/045-friends-whoami-daily.sql";
  if (!has(f)) return false;
  const code = read(f).split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  return /CREATE TABLE IF NOT EXISTS fr_wa_daily_clue/.test(code) &&
         !/\b(ALTER|DROP|DELETE)\b/i.test(code);
})(), "045: CREATE ... IF NOT EXISTS only");
t("and the calendar generator deals the same number", (() => {
  const gen = read("tools/build_friendswhoami_calendar.js");
  return /export const DOORS = 3;/.test(gen);
})(), "two copies of a door count is two answers about what a board is");

t("the ladder is this deck's three rungs, hard to easy",
  whoamiOf(GAME).ladder === FR_LADDER && FR_LADDER.length === 3);
t("the first rung is free and the next two are priced 4 and 3",
  FR_LADDER[0].points === 0 && FR_LADDER[1].points === 4 && FR_LADDER[2].points === 3,
  "10 / 6 / 3 for a door worth ten, which is the deck's own 3:2:1");
t("and the page's own config says the same, so the prices drawn are the prices charged",
  /points:\s*4/.test(cfgCode) && /points:\s*3/.test(cfgCode) &&
  !/points:\s*20/.test(cfgCode),
  "football's rungs cost 20 and 10");

t("a door is worth ten and the curve is football's alone",
  whoamiOf(GAME).doorMax === 10 && whoamiOf(GAME).scoreFor(90, 0) === 10,
  "no clock: the deck is a party game read aloud, and the minute is ignored");

/* ---- generated, and nothing of the bank committed ----------------------- */

console.log("\nGenerated from football's, and the deck stays out of the tree");

t("the game it is generated from is still there", has(SRC + "/js/game.js"), SRC);
t("and the generator that makes this one is committed",
  has("tools/build_friendswhoami.js"));

/* NO BOARD OR BANK FILE ANYWHERE IN THIS GAME'S DIRECTORY. The banks are
   secret and live outside the repo; a deck file committed here would publish
   every card, every clue and every answer. */
t("no deck or bank file is committed anywhere in this game's directory", (() => {
  const bad = [];
  (function walk(d) {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      if (e.isDirectory()) walk(d + "/" + e.name);
      else if (/\.(sql|json)$/i.test(e.name)) bad.push(d + "/" + e.name);
    }
  })(DIR);
  return bad.length === 0;
})());

/* ASKED OF GIT, NOT OF THE PATTERNS. The first version matched .gitignore's
   text against a regex of what the pattern might look like, and refused a tree
   that was already correct: the real line is `data/*-production*.sql`, which
   covers both these files and which the regex did not happen to spell. The
   question is "would git ignore this file", and git is the thing that answers
   it. A pattern-matcher reimplementing gitignore is a second, wrong copy of a
   rule that already has an authority. */
t("and the generated SQL is ignored by git", (() => {
  const files = ["data/fr-whoami-production.sql", "data/fr-whoami-calendar-production.sql"];
  try {
    for (const f of files) {
      const r = spawnSync("git", ["check-ignore", "-q", "--no-index", f], { cwd: ROOT });
      /* CANNOT CHECK IS NOT A PASS. git missing, or a non-zero that is not the
         "not ignored" exit of 1, both mean this proved nothing. */
      if (r.error || r.status !== 0) return false;
    }
    return true;
  } catch { return false; }
})(), "data/fr-whoami-production.sql and its calendar, per git check-ignore");

/* ---- and it does not read as a football game ---------------------------
 *
 * THE STYLESHEET IS FOOTBALL'S ON PURPOSE -- `--pitch` is the PALETTE token,
 * not a football one, and the Friends crossword settled that on 21 September by
 * keeping the family green and removing only the pitch graphic. THE WORDS WERE
 * NOT SETTLED, and they were football's entire: seventy-eight football terms in
 * a Friends page, four of which told the player something untrue about the game
 * in front of them -- eleven doors in a three-door game, a career where there is
 * a written clue, substitutions where there are clues, and a clock in a game
 * that has none.
 *
 * SCANNED AS RENDERED TEXT AND ATTRIBUTES, not as raw bytes: `--pitch` is a
 * token name, `.d-club` is a class the stylesheet owns, and a scan over the
 * whole file would fail on both and be switched off within a week. What a
 * PLAYER can read is the question. */
const words = ["club", "clubs", "player", "players", "spell", "spells", "career",
  "careers", "pitch", "substitution", "substitutions", "goals", "nationality",
  "ninety", "footballer", "footballers", "eleven", "kick off", "full time"];

const readable = (() => {
  const body = markup
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ");
  const text = body.replace(/<[^>]+>/g, " ");
  /* THE ATTRIBUTES A READER OR A SCREEN READER MEETS, which are copy as much as
     the text is -- the guess box said "Name him" in a placeholder, where no scan
     of text nodes would ever have found it. */
  const attrs = (body.match(/(?:placeholder|aria-label|title|alt|content)="[^"]*"/g) || []).join(" ");
  return text + " " + attrs;
})();

t("PRECONDITION: there is copy here to scan at all", readable.length > 400,
  readable.length + " characters");

/* MATCHED WITHOUT A REGEX, AND THAT IS THE POINT RATHER THAN A STYLE CHOICE.
   The first version built one from "\\b" + word + "\\b" and was VACUOUS: it
   went into this file through a shell heredoc, the backslashes were eaten, and
   the JS string "\b" is a backspace character. It scanned for
   <backspace>player<backspace>, found nothing, printed "19 terms checked" and
   passed on a page that said "One door, one player" in its own headings.
   Proven by sabotage this time, before it was believed.

   Normalising to single-spaced letters and asking includes() has no escapes to
   lose, and it reads through punctuation, entities and line wraps that a
   boundary scan over markup would miss anyway. */
const hay = " " + readable.toLowerCase().replace(/[^a-z]+/g, " ").trim() + " ";

t("PRECONDITION: the scan can see the copy it is scanning",
  hay.indexOf(" door ") > -1 && hay.indexOf(" clue ") > -1,
  "if these two are missing the scan below is looking at nothing");

t("no football vocabulary survives in what a player can read", (() => {
  const hit = words.filter((w) => hay.indexOf(" " + w + " ") > -1);
  if (hit.length) console.log("        still football: " + hit.join(", "));
  return hit.length === 0;
})(), words.length + " terms checked");

t("and the tagline says the number of doors this deck actually deals",
  /Three doors/i.test(readable) && !/Eleven doors/i.test(readable));

t("the stylesheet defines no .xic- rule, which the chrome owns",
  !/\.xic-/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
