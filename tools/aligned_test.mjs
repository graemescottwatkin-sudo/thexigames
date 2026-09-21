/* aligned_test.mjs — the contract every game in the family signs.
 *
 *   node tools/aligned_test.mjs        (from the repo root)
 *
 * WHY THIS EXISTS, WRITTEN THE NIGHT BEFORE GAME THREE. With one game, there
 * is nothing to align. With two, every shared fact quietly grew a second copy
 * and one of them drifted: the palette declared twice, the chrome grown twice,
 * the CSRF header named per-game, the tag law real in one gate and a costume
 * in the other ("v000" — a check that compared every build against nothing),
 * a merge rule that agreed by coincidence until two devices disagreed forever.
 * Game three triples every one of those opportunities on the day it lands.
 *
 * THE SHAPE. One GAMES table. Every check below runs identically for every
 * row. Adding a game is adding a row — and the moment it is added, the whole
 * contract applies to it. A check that must be copied per game would itself
 * be the fault this suite exists to end.
 */
import fs from "node:fs";
import { createHash } from "node:crypto";

let pass = 0, fail = 0;
function t(name, ok, note) {
  if (ok) { pass++; console.log(`  ok  ${name}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${note ? "  — " + note : ""}`); }
}
const read = (p) => fs.readFileSync(p, "utf8");
const has = (p) => fs.existsSync(p);

/* Every stylesheet a game ships, wherever it keeps them. */
function listCss(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = d + "/" + e.name;
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith(".css")) out.push(f);
    }
  };
  try { walk(dir); } catch (e) { /* a game with no stylesheets of its own */ }
  return out;
}

/* The selectors of a stylesheet, by splitting on braces. Enough for the
   question asked of it — what does this rule land on — and it cannot lose a
   backslash the way a pattern can. @media heads are skipped rather than
   parsed: their contents come round again as ordinary rules. */
function selectorsOf(css) {
  /* Comments first. This project comments heavily inside its stylesheets, and
     prose read as selectors turns a real finding into a coincidence: the first
     run of the collision check reported a clash on "so white", which is not a
     selector at all. It happened to fire on the right file for the wrong
     reason, which is worse than not firing. */
  let out2 = "";
  for (let k = 0; k < css.length; k++) {
    if (css[k] === "/" && css[k + 1] === "*") {
      const end = css.indexOf("*/", k + 2);
      if (end < 0) break;
      k = end + 1;
      continue;
    }
    out2 += css[k];
  }
  css = out2;
  const out = [];
  for (const chunk of css.split("}")) {
    const head = chunk.split("{")[0];
    if (!head || head.includes("@")) continue;
    for (const sel of head.split(",")) if (sel.trim()) out.push(sel);
  }
  return out;
}

/* THE FAMILY. dir is the path under the root and the URL; prefix is the
   game's localStorage namespace — distinct per game, or two games sharing a
   browser overwrite each other's saves. */
/* `dir` is where the game LIVES, and since 5 Sep 2026 that is under its theme:
   other kinds of quiz are coming and XI never meant football. Written out
   rather than composed, because this table is the family's own statement of
   what a game is — but it agrees with gameDir() in permalink.js, and the check
   below holds the two together so a game cannot live in one place and be
   addressed in another. */
/* `id` IS NOT `dir`, AND THE MOVE IS WHAT SEPARATED THEM. They were the same
   word until 5 Sep 2026 and every check could use either. Now a game is
   identified as "crossword" — in the server's game list, in its results rows,
   in its storage prefix — and LIVES at football/crossword. Conflating them
   made this file ask games.js whether it listed "football/crossword", which it
   does not and must not: an id is not a path, and the day the theme changes
   the id must not change with it. */
const GAMES = [
  { id: "crossword",  dir: "football/crossword",  name: "Crossword XI",  prefix: "fcw"  },
  { id: "wordsearch", dir: "football/wordsearch", name: "Wordsearch XI", prefix: "xiws" },
  { id: "scrambled",  dir: "football/scrambled",  name: "Scrambled XI",  prefix: "xisc" },
  { id: "hilo",       dir: "football/hilo",       name: "HiLo XI",       prefix: "xihl" },
  { id: "vowels",     dir: "football/vowels",     name: "Vowels XI",     prefix: "xivw" },
  { id: "grid",       dir: "football/grid",       name: "Grid XI",       prefix: "xigd" },
  { id: "codeword",   dir: "football/codeword",   name: "Codeword XI",   prefix: "xicw" },
  { id: "quickfire",  dir: "football/quickfire", name: "QuickFire XI",  prefix: "qfx"  },
  { id: "whoami",     dir: "football/whoami",    name: "Who Am I XI",   prefix: "xiwa" },
  { id: "ballpark",   dir: "football/ballpark",  name: "Ballpark XI",   prefix: "xibp" },
  /* The second theme, launched 21 September 2026. The id is not the directory
     and the name carries its theme — both deliberate, and the reason this
     table has an id column at all. */
  { id: "crossword_fr", dir: "friends/crossword", name: "Crossword XI: Friends", prefix: "xifc" },
];

const workflow = read(".github/workflows/checks.yml");
const headers = read("_headers");

for (const g of GAMES) {
  console.log(`\n=== ${g.name} (${g.dir}/) ===`);
  const html = has(`${g.dir}/index.html`) ? read(`${g.dir}/index.html`) : "";
  const css = has(`${g.dir}/css/style.css`) ? read(`${g.dir}/css/style.css`) : "";
  const js = has(`${g.dir}/js/game.js`) ? read(`${g.dir}/js/game.js`) : "";

  console.log("Furniture every game must have");
  t("a page, a stylesheet and a script", !!html && !!css && !!js);
  t("its own deploy gate", has(`${g.dir}/deploy_check.mjs`));
  t("its own live check", has(`${g.dir}/live_check.mjs`),
    "post-deploy verification is per game, not per whoever remembered");
  t("a cache block in _headers for its path",
    headers.indexOf(`/${g.dir}/css/*`) > -1 && headers.indexOf(`/${g.dir}/js/*`) > -1);
  t("at least one of its suites named in the workflow",
    new RegExp(`node ${g.dir}/[a-z_]+_test\\.mjs`).test(workflow));

  console.log("The tag law is real, not a costume");
  const gate = has(`${g.dir}/deploy_check.mjs`)
    ? read(`${g.dir}/deploy_check.mjs`) : "";
  const shipped = (gate.match(/const LAST_SHIPPED = "([^"]+)"/) || [])[1];
  /* "v000" compared every build against nothing for as long as the word
     search existed. A sentinel constant is a check that cannot fail. */
  t("LAST_SHIPPED exists and is not a sentinel",
    !!shipped && shipped !== "v000", `shipped ${shipped}`);
  /* v001v: LAST_PRESENTED retired. It tracked packages handed over, and the
     zips have stopped — it had frozen at the last one while releases carried
     on. A constant nothing moves is a comparison against nothing, which is the
     sentinel fault under another name. The burn rule now rides on
     LAST_SHIPPED alone. */
  t("and LAST_PRESENTED is gone rather than frozen",
    !/const LAST_PRESENTED/.test(gate));
  const ownTag = (html.match(/js\/game\.js\?v=(v[0-9a-z]+)"/) || [])[1];
  t("the page's script tag and the script's BUILD agree",
    !!ownTag && js.indexOf(`var BUILD = "${ownTag}"`) > -1, ownTag);

  console.log("One chrome, one palette");
  t("the shared tokens are loaded before the shared chrome", (() => {
    const iTok = html.indexOf("shared/xi-tokens.css");
    const iChr = html.indexOf("shared/xi-chrome.css");
    return iTok > -1 && iChr > -1 && iTok < iChr;
  })());
  t("the shared chrome script is loaded and a bar is placed",
    /shared\/xi-chrome\.js/.test(html) && /class="xic-bar"/.test(html));
  /* THE THEME IS DECIDED ONCE. shared/xi-theme.js stamps the root before
     first paint — light unless chosen — and it must be in the head, because
     a resolver that runs after the stylesheet paints is a flash of the wrong
     palette on every dark-system phone. A game resolving the theme itself
     is a second answer to one question. */
  t("the shared theme script is loaded in the head, and the game keeps no resolver of its own",
    html.indexOf("shared/xi-theme.js") > -1 && html.indexOf("shared/xi-theme.js") < html.indexOf("</head>") &&
    !/prefers-color-scheme/.test(js) && !/setAttribute\("data-theme"/.test(js));
  /* HOW FAR PEOPLE GET, in every game: the shared helper is loaded and the
     game calls it at a start and at an end. A game that loaded it and never
     called it would count nothing and look counted. */
  t("the shared play helper is loaded, and the game starts and ends a play through it",
    /shared\/xi-plays\.js/.test(html) &&
    (/XIPlays\.start\(/.test(js) || /\.XIPlays\.start\(/.test(js)) &&
    (/XIPlays\.end\(/.test(js) || /\.XIPlays\.end\(/.test(js) || /playEnd\(/.test(js)));
  t("the game's own stylesheet defines no .xic- rules",
    !/^\s*\.xic-[a-z-]+[^{]*\{/m.test(css),
    "a game styling the chrome is a second chrome starting");

  console.log("Identity");
  const grab = (re) => ((html.match(re) || [])[1] || "")
    .split(/&mdash;|&ndash;|—|–|\|/)[0].trim();
  const names = [
    grab(/<title>([^<]+)<\/title>/),
    grab(/property="og:title" content="([^"]+)"/),
    grab(/"name":\s*"([^"]+)"/),
    grab(/<h1[^>]*>([^<]+)<\/h1>/),
  ].filter(Boolean);
  t("the name is identical in title, og:title, JSON-LD and h1",
    names.length === 4 && new Set(names).size === 1, [...new Set(names)].join(" / "));
  t("and it is the name on the team sheet", names[0] === g.name,
    `${names[0]} vs ${g.name}`);
  t("the canonical names its own address",
    html.indexOf(`href="https://www.thexigames.com/${g.dir}/"`) > -1);
  /* The disclaimer is a FAMILY sentence, declared once in the shared chrome's
     footer and mounted by every game — wording parity across the family is a
     legal-review requirement, and eleven hand-copied sentences would drift.
     So the check is: the sentence lives in the chrome, and this page mounts
     the footer that carries it. The first draft grepped each page's static
     HTML, which fails for exactly the right reason: the sentence is not IN
     the page, and must not be. */
  t("the page mounts the shared footer that carries the disclaimer",
    /class="xic-foot"/.test(html) &&
    /Not affiliated with/.test(read("shared/xi-chrome.js")));
  /* AND IT MUST NOT BE SEALED INSIDE A VIEW.
     The check above greps for the class, which is true of a footer nested in a
     container that hides. The crossword's sat inside #homeOverlay, so it left
     the page the moment a board opened: the family footer was present in the
     markup and absent from the screen for the whole of every game, and this
     contract called that mounted. Depth is counted, not matched — a regex
     cannot tell nesting. */
  t("and the shared footer is at top level, not inside a view that hides", (() => {
    const body = html.slice(html.indexOf("<body"));
    const at = body.indexOf('<footer class="xic-foot"');
    if (at < 0) return false;
    const before = body.slice(0, at).replace(/<!--[\s\S]*?-->/g, "");
    const opens = (before.match(/<div\b/g) || []).length;
    const closes = (before.match(/<\/div>/g) || []).length;
    return opens - closes === 0;
  })());

  console.log("Its own keys, and only its own");
  t(`every localStorage key it writes is under "${g.prefix}." or the family's "xi."`, (() => {
    /* THREE WAYS A KEY REACHES setItem, and the check has to see all three or
       it is measuring whichever ones it happens to understand.

         setItem("xi.theme", …)   a literal
         setItem(RESULTS_KEY, …)  a constant, resolved to its literal
         setItem(storeKey(), …)   a builder, resolved to what it returns

       Only the first two were read. Scrambled XI builds its key — one save
       per board, so the key carries the board number — and the check saw no
       writes at all, then failed the game for having none. A game doing the
       right thing failed a check that could not look at it. */
    /* THREE WAYS A KEY REACHES setItem, and the check has to see all three or
       it is measuring whichever ones it happens to understand.

         setItem("xi.theme", ...)  a literal
         setItem(RESULTS_KEY, ...) a constant, resolved to its literal
         setItem(storeKey(), ...)  a builder, resolved to what it returns

       Only the first two were read. Scrambled XI builds its key — one save
       per board, so the key carries the board number — so the check saw no
       writes at all and then failed the game for having none. A game doing
       the right thing failed a check that could not look at it.

       Scanned by splitting rather than by pattern: several checks written
       into this repo lost a backslash on the way to the file and became
       patterns that matched nothing while still reporting ok. */
    const QUOTE = String.fromCharCode(34);
    /* The first argument of every setItem call, with bracket depth honoured:
       boardSlot({ kind: "daily", no: n }) is ONE argument, and cutting at the
       first comma turned it into a fragment that resolved to nothing. */
    const firstArgs = (src, call) => {
      const out = [];
      let at = 0;
      for (;;) {
        const i = src.indexOf(call, at);
        if (i < 0) break;
        at = i + call.length;
        let depth = 0, arg = "";
        for (let k = at; k < src.length && k < at + 400; k++) {
          const c = src[k];
          if (c === "(" || c === "{" || c === "[") depth++;
          else if (c === ")" || c === "}" || c === "]") { if (depth === 0) break; depth--; }
          else if (c === "," && depth === 0) break;
          arg += c;
        }
        out.push(arg.trim());
      }
      return out;
    };
    /* A CONSTANT MAY BE BUILT FROM ANOTHER ONE, and three games build theirs
       that way: `var RESULTS_KEY = PREFIX + "results"`. This read only
       `var NAME = "literal"`, so such a key resolved to NOTHING — and a game
       whose ONLY write is that shape then failed for "writing no keys at
       all", which is what Grid XI did on the day it launched. Scrambled and
       the crossword passed the same check only because they ALSO write keys
       this could see; the one they build was never being read either. */
    const literalOf = (name, seen) => {
      seen = seen || new Set();
      if (seen.has(name)) return null;
      seen.add(name);
      const decl = "var " + name + " = ";
      const at = js.indexOf(decl);
      if (at < 0) return null;
      const expr = js.slice(at + decl.length, js.indexOf(";", at));
      let out = "";
      for (const part of expr.split("+")) {
        const tok = part.trim();
        if (tok.indexOf(QUOTE) === 0) out += tok.slice(1, tok.indexOf(QUOTE, 1));
        else {
          const v = literalOf(tok, seen);
          if (v === null) return null;      // a piece nothing can resolve
          out += v;
        }
      }
      return out;
    };
    /* A builder is judged by EVERY key it can return, not by the first one.
       slotKey() returns one key for practice and another for a board; a check
       that read only the first would pass a function whose other branch wrote
       anywhere it liked. */
    const returnsOf = (fnName) => {
      const at = js.indexOf("function " + fnName);
      if (at < 0) return null;
      let end = js.indexOf(String.fromCharCode(10) + "  function ", at + 1);
      if (end < 0) end = at + 1500;
      const body = js.slice(at, end);
      const outs = [];
      let k = 0;
      for (;;) {
        const r = body.indexOf("return ", k);
        if (r < 0) break;
        k = r + 7;
        outs.push(body.slice(k, body.indexOf(";", k)).split("+")[0].trim());
      }
      return outs;
    };
    /* RESOLVED RECURSIVELY, because a builder may hand off to another one:
       slotKey() returns a literal on one branch and boardSlot(board) on the
       other, and stopping at the call left that branch reading as an empty
       key — a real key the check could not see, reported as a violation.
       `seen` stops a pair of mutually-recursive builders spinning. */
    const keysOf = (tok, seen) => {
      seen = seen || new Set();
      if (tok.indexOf(QUOTE) === 0) return [tok.slice(1, tok.indexOf(QUOTE, 1))];
      const paren = tok.indexOf("(");
      if (paren < 0) { const v = literalOf(tok); return v === null ? [] : [v]; }
      const name = tok.slice(0, paren);
      if (seen.has(name)) return [];
      seen.add(name);
      const outs = returnsOf(name);
      if (!outs) return [];
      return outs.flatMap((o) => keysOf(o, seen));
    };
    const writes = firstArgs(js, "localStorage.setItem(");
    /* Wrapped, not passed bare: flatMap hands the index as the second
       argument, which arrived where `seen` was expected. */
    const keys = writes.flatMap((tok) => keysOf(tok));
    return writes.length > 0 && keys.length > 0 && keys.every((k) =>
      k.indexOf(g.prefix + ".") === 0 || k.indexOf("xi.") === 0);
  })());
  const others = GAMES.filter((o) => o !== g);
  t("and it never WRITES another game's keys", others.every((o) => {
    const writes = [...js.matchAll(/localStorage\.setItem\(\s*"([^"]+)"/g)].map((m) => m[1]);
    return writes.every((k) => k.indexOf(o.prefix + ".") !== 0);
  }), "reading a legacy key during migration is allowed; writing one is not");
}

console.log("\n=== The family as a whole ===");
/* The squad list lives in the chrome and nowhere else. */
/* LISTED, not launched. A game can be live and unadvertised — see UNLISTED
   in functions/_lib/games.js — and the two assertions under this are about
   being FOUND, not about being playable. Asked of the server module rather
   than restated here: a second copy of "which games are advertised" is a
   second answer the first time one changes. */
const { isListed } = await import("../functions/_lib/games.js");
const LISTED = (g) => isListed(g.id);
const chrome = read("shared/xi-chrome.js");
/* A LISTED GAME HAS BOTH A NAME AND A WAY IN; AN UNLISTED ONE HAS NEITHER.
   This was one assertion demanding both of every game until 21 September 2026,
   when a game launched UNLISTED. It was split in two that morning and the
   address half was still required of everything — on the reasoning that a way
   in with no name is how this project has always run a game before announcing
   it. The owner's ruling later the same day was that the address counts too:
   THIS FILE IS DOWNLOADED BY EVERY PAGE, so an href here is the site telling
   every visitor where the game is, whatever the slot is called.
   BOTH DIRECTIONS, both halves. "Present when it should be" alone passes a
   chrome that has quietly started advertising an unlisted game, and that is
   the direction that leaks. */
t("every LISTED game has a way into it on the chrome's squad list, and no unlisted one does",
  GAMES.every((g) => (chrome.indexOf(`href: "/${g.dir}/"`) > -1) === LISTED(g)),
  GAMES.filter((g) => !LISTED(g)).map((g) => g.dir).join(", ") || "all listed");
t("every LISTED game is named there, and no unlisted one is",
  GAMES.every((g) => chrome.indexOf(`"${g.name}"`) > -1 === LISTED(g)),
  GAMES.filter((g) => !LISTED(g)).map((g) => g.id).join(", ") || "all listed");

/* "CLEAR EVERYTHING" MUST REACH EVERY GAME, AND TWICE IT HAS NOT.
 *
 * The sweep lives in the chrome because it is the one operation that has to
 * cross every game's prefix, and it is a hand-written array — so it goes stale
 * at a launch, silently, and the player who finds out is the one who asked for
 * a clean slate and kept half their history.
 *
 * It happened once with four games and was widened. It had happened again by
 * 17 Sep 2026: five launches later the array still named five prefixes of ten,
 * so Vowels, Grid, Codeword, Who Am I and Ballpark survived a reset and the
 * hub went on lighting their shirts.
 *
 * The array cannot be derived — a browser file imports nothing — so the CHECK
 * is what moves: this table is the one a new game must join for its
 * integration to pass at all, and now the sweep is held against it. A game
 * added here and not there fails before it ships. */
{
  const decl = /var RECORD_PREFIXES = \[([^\]]*)\]/.exec(chrome);
  const swept = decl ? (decl[1].match(/"([^"]+)"/g) || []).map((s) => s.slice(1, -1)) : [];
  /* THE FLOOR FIRST. Both assertions below are "every x is in y", and every()
     over an empty list is true — so a rename of the constant would turn this
     whole block green rather than red, which is the fault it exists to catch
     wearing a different hat. */
  t("the chrome's record sweep can be found and read",
    !!decl && swept.length >= GAMES.length,
    decl ? `${swept.length} prefix(es) for ${GAMES.length} games` : "RECORD_PREFIXES not found in xi-chrome.js");
  const missing = GAMES.filter((g) => swept.indexOf(g.prefix + ".") === -1);
  t("and it sweeps every game's prefix, so a reset clears all of them",
    missing.length === 0,
    missing.length
      ? missing.map((g) => `${g.id} (${g.prefix}.)`).join(", ") + " would survive Clear everything"
      : swept.join(" "));

  /* AND EVERY FAMILY-LEVEL KEY IS CLASSIFIED, which is the half the check
     above could not see. It asks "is every GAME's prefix swept" and the answer
     was yes on 17 September 2026 while the season survived a reset, because
     xi.season.v1 is not a game: no row in GAMES, no prefix in that table, and
     therefore invisible to a check that iterates GAMES. The third recurrence
     of "Clear everything doesn't", arriving through the one door the guard
     written after the second recurrence was not watching.

     So this iterates the KEYS rather than the games. Every "xi.*" literal in
     shared/ must be either SWEPT or explicitly KEPT, and a key that is neither
     fails here — which forces the question "is this a record or a preference"
     to be answered when the key is added rather than when a player notices.
     The answer is written as a line in RECORD_KEEP, so each keep reads as a
     decision rather than a gap.

     It iterates the population rather than filtering it, so `unclassified` can
     hold a name and the check can represent what it forbids.

     WHICH OF THE TWO ACTUALLY HOLDS THE LINE, because their names do not say
     so. While "xi." is in RECORD_PREFIXES a NEW family key is swept by that
     prefix, so `unclassified` cannot be non-empty and this check is a backstop
     rather than a live guard — proven, by adding an unclassified xi. key and
     watching it stay green. The assertion that bites is the one below it, that
     "xi." is swept at all; this one only speaks once somebody narrows the
     sweep, which is precisely how the season was lost. Both are needed and
     neither is the whole rule.

     ITS REACH IS THE "xi." SPELLING. A family-level key under some other
     prefix — xifam., say — is in no population here at any size, and no
     sabotage in either direction reaches it. Annotated rather than attempted:
     a patch for it would be a guess wearing an assertion's clothes. */
  const keepDecl = /var RECORD_KEEP = \[([\s\S]*?)\];/.exec(chrome);
  const kept = keepDecl ? (keepDecl[1].match(/"([^"]+)"/g) || []).map((x) => x.slice(1, -1)) : [];
  t("the chrome's keep list can be found and read", !!keepDecl && kept.length > 0,
    keepDecl ? kept.length + " kept by name" : "RECORD_KEEP not found in xi-chrome.js");
  /* THE LIST IS THE DIRECTORY, not a list here — the rule the deploy sequence
     follows, so a family-level key added in a NEW shared file is covered by
     existing rather than by somebody remembering to extend an array. */
  const sharedJs = fs.readdirSync("shared")
    .filter((f) => f.endsWith(".js")).sort();
  const familyKeys = [...new Set(
    sharedJs.flatMap((f) => (read(`shared/${f}`).match(/"xi\.[A-Za-z0-9._-]+"/g) || []))
  )].map((x) => x.slice(1, -1)).sort();
  /* A FLOOR, because everything below is "every k is classified" and every()
     over an empty list is true. If the walk finds no keys — shared/ moved, the
     quoting style changed — this block would go green having read nothing. */
  t("the family-level keys can be found and read",
    sharedJs.length >= 4 && familyKeys.length >= 4,
    `${familyKeys.length} key(s) across ${sharedJs.length} shared file(s): ${familyKeys.join(" ")}`);
  const unclassified = familyKeys.filter((k) =>
    kept.indexOf(k) === -1 && !swept.some((p) => k.indexOf(p) === 0));
  t("and every one is either swept by a reset or deliberately kept",
    unclassified.length === 0,
    unclassified.length
      ? unclassified.join(", ") + " is neither cleared nor kept — classify it"
      : familyKeys.length + " keys classified");
  /* A GAME'S PREFIX, OR THE FAMILY'S. "xi." is swept deliberately, so that a
     family-level RECORD — the season was one — cannot survive a reset by not
     being a game. It is the one prefix here that sweeps keys this table knows
     nothing about, which is exactly why the classification check above it
     exists: everything under xi. is cleared unless RECORD_KEEP names it, and
     an unnamed new key fails there. The two checks are halves of one rule and
     neither is safe alone — this one alone would have refused the fix, and
     that one alone would let a stray game prefix through. */
  const FAMILY = "xi.";
  const stray = swept.filter((p) =>
    p !== FAMILY && !GAMES.some((g) => g.prefix + "." === p));
  t("and sweeps nothing but the games' prefixes and the family's",
    stray.length === 0,
    stray.length ? stray.join(", ") + " — a prefix no game in this table writes"
      : swept.length + " prefixes, all accounted for");
  t("and the family prefix is swept, so a family-level record cannot outlive a reset",
    swept.indexOf(FAMILY) !== -1,
    "xi.season.v1 survived Clear everything until 17 Sep 2026 for want of this");
}
/* THE SITEMAP IS GENERATED NOW, so this reads the generator rather than a
   file. The file it replaced held thirteen URLs and not one board, months
   after the permalinks shipped — a hand-kept list of pages that appear daily
   was never going to hold them. */
t("the sitemap lists every LISTED game, and no unlisted one",
  GAMES.every((g) =>
    read("functions/sitemap.xml.js").indexOf(`"/${g.dir}/"`) > -1 === LISTED(g)),
  "a game can be live and unadvertised; the sitemap is the advertising");
t("and there is no static sitemap left to be served instead",
  !has("sitemap.xml"),
  "two answers to one URL is the fault this file exists to catch");
t("the CSRF rule is the family's, defined once",
  /export const CSRF_HEADER = "X-XI-Games"/.test(read("functions/_lib/auth.js")) &&
  GAMES.every((g) => {
    const js = read(`${g.dir}/js/game.js`);
    /* Either header satisfies the server; what is forbidden is a game
       inventing a third. */
    return /"X-XI-Games"|"X-Crossword-XI"/.test(js);
  }));
t("the server's game list and this table agree", (() => {
  const lib = read("functions/_lib/games.js");
  const listed = (lib.match(/GAMES = \[([^\]]+)\]/) || [, ""])[1];
  return GAMES.every((g) => listed.indexOf(`"${g.id}"`) > -1);
})(), "functions/_lib/games.js");
/* EVERY GAME IN GAMES RESOLVES AN ENTRY KEY, AND THIS HAS NOW BEEN THE FAULT
   FOUR TIMES.
 *
 * Scrambled, then QuickFire, then Codeword, then Grid. Each was live — in
 * GAMES, in BUILT, with a launch date, a card on the hub and a route — and each
 * had no branch in entryKey(), which falls through to a closing `return null`.
 * A null key writes no row, so the result was computed, returned to the page,
 * and dropped. The page believes it banked. Nothing errors.
 *
 * WHY NOTHING CAUGHT IT: every check around it asked the ENDPOINT what it
 * returned, and what it returned was a correct score. The only place the fault
 * is visible is the join between "which games exist" and "which games have a
 * key", and nothing was standing there. Grid ran eight days like this and was
 * found only because Codeword's fix ran the function over every game rather
 * than the one that had been reported.
 *
 * EXECUTED, NOT GREPPED. A branch can exist and still return null — the point
 * is the VALUE — so this calls the real function with a row carrying every
 * field shape the family uses, and demands a string from each game. */
{
  const { entryKey, GAMES: SERVER_GAMES } = await import("../functions/_lib/games.js");
  /* Every identity field any game reads, so a game is never failed for the
     fixture's shape rather than its own. */
  const row = { dailyNo: 20, no: 20, day: "2026-09-14", date: "2026-09-14",
                play_date: "2026-09-14" };
  const keyless = SERVER_GAMES.filter((g) => typeof entryKey(g, row) !== "string");
  t("every game in GAMES banks under a key, rather than returning null",
    keyless.length === 0,
    keyless.length ? keyless.join(", ") + " return null — results are dropped"
      : SERVER_GAMES.map((g) => entryKey(g, row)).join(" "));

  /* AND THE OTHER HALF, WHICH IS THE ONE THAT CATCHES IT.
   *
   * The check above walks GAMES — so a game ABSENT from GAMES is absent from
   * the loop as well, and reports green. That is exactly how Scrambled and
   * QuickFire survived: a game can be SERVING and UNREGISTERED at the same
   * time, and a roster somebody typed would be missing the broken one too.
   *
   * So the list is DERIVED from what serves. A daily route existing is the
   * fact; GAMES is the claim; this is where they are made to agree.
   *
   * THE TWO EXCEPTIONS ARE NAMED AND ASSERTED rather than skipped, because a
   * silent skip list is the same fault one level up. The crossword serves
   * /api/daily rather than /api/crossword/daily — it was the first and the
   * path predates the convention. Vowels serves through Scrambled's route with
   * ?cy=1, because it is the same ring read half a turn round. Both are checked
   * to still be true below, so an exception cannot outlive its reason. */
  const served = fs.readdirSync("functions/api", { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(`functions/api/${d.name}/daily.js`))
    .map((d) => d.name);

  /* SERVING A BOARD IS NOT THE CONDITION. The first version of this asked
     "does it serve a daily", and flagged Ballpark — which serves one, is
     absent from GAMES, and is NOT an instance of this fault: its page has no
     recordResult and no migrate call, so nothing is being dropped because
     nothing is being sent. It is an unfinished game, not a broken one.
     THE CONDITION IS THAT THE PAGE TRIES TO BANK. Scrambled, QuickFire,
     Codeword and Grid all had a client writing a result into a list and a
     server with no key to file it under; that gap is the fault, and a check
     that fires on anything wider will be silenced by whoever meets it on a
     game that is merely half-built. Derived by reading the pages, so a new
     game joins the check by doing the thing rather than by being added to a
     list. */
  const banks = served.filter((g) => {
    const dir = `football/${g}/js`;
    if (!has(dir)) return false;
    return fs.readdirSync(dir).some((f) => {
      if (!f.endsWith(".js")) return false;
      const src = read(`${dir}/${f}`);
      return /recordResult|account\/migrate/.test(src);
    });
  });

  t("the crossword's daily route is still the unprefixed one",
    has("functions/api/daily.js"),
    "the exception below rests on this, so it is asserted rather than assumed");
  t("and Vowels is still served through Scrambled's route",
    /cy/.test(read("functions/api/scrambled/daily.js")),
    "the same ring read half a turn round");

  const unregistered = banks.filter((g) => !SERVER_GAMES.includes(g));
  t("every game whose page banks a result is registered in GAMES", (() => {
    /* A WALK THAT FINDS NOTHING MUST NOT PASS. The whole point is that the
       list is derived, and a derivation that silently returns empty reports
       the same green as one that found no problems. */
    if (banks.length < 5) return false;
    return unregistered.length === 0;
  })(), unregistered.length
    ? unregistered.join(", ") + " bank a result the server has no key for"
    : banks.join(", "));

  /* THE REVERSE, which is less harmful and nearly free while both lists are
     here: a game registered and serving nothing. It does not drop results —
     there are none — but it is the same two facts disagreeing, and a game that
     stops serving without leaving GAMES is a row in a results table nothing
     can ever add to. */
  const EXEMPT = new Set(["crossword", "vowels"]);   // asserted above
  const silent = SERVER_GAMES.filter((g) => !served.includes(g) && !EXEMPT.has(g));
  t("and every registered game serves a daily", silent.length === 0,
    silent.length ? silent.join(", ") + " are in GAMES but serve no daily" : "");

  /* AND A PAGE THAT KEEPS A RESULT MUST ALSO PUSH IT. Codeword had
     recordResult writing to localStorage and no /api/account/migrate call
     anywhere — so a signed-in player's result reached their own browser and
     stopped there, which is the banking fault one layer further out: the key
     exists, the row is written locally, and the account never hears. Found by
     tabulating both halves rather than either. */
  /* AND THE THING THAT DECIDES WHETHER TO PUSH MUST BE SETTABLE.
   *
   * Three games shipped with an account push that could never fire, because
   * both ways of learning who is signed in were wrong:
   *   window.XIChrome.account()  — it is an OBJECT, and calling it threw
   *   ev.detail.account          — the chrome emits { type, user, via }
   * Both dead means `account` stayed null, pushResults() returned early, and
   * not one result reached an account. The key existed, the row was written,
   * the push was wired, and the switch could not be flipped.
   *
   * SO THE CHECK IS ABOUT THE SHAPE OF THE ANSWER, not the presence of a call.
   * A game may read the session from the server or the user from the chrome —
   * both are real patterns here — but calling `account` as a function, or
   * reading `.account` off the event detail, are the two spellings that are
   * simply wrong, and neither fails loudly. */
  const wired = banks.filter((g) => {
    const dir = `football/${g}/js`;
    /* STRIPPED, and this check failed on its own first run without it: the fix
       carries a comment naming both wrong spellings so the next person meets
       them, and the grep matched the explanation. That is this project's oldest
       rule arriving inside the check written to enforce a different one. */
    const all = fs.readdirSync(dir).filter((f) => f.endsWith(".js"))
      /* JOINED WITH NEWLINES, NOT SPACES. The line-comment stripper below is
         anchored with /m, so with no line endings in the blob its `$` matches
         only the very end — and one `//` comment eats the entire rest of the
         file. The check then passed on a sabotage inserted below the first
         comment, which is how this was found: two mutations, one caught. */
      .map((f) => read(`${dir}/${f}`)).join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
    return /XIChrome\.account\s*\(/.test(all) ||
           /detail\s*(?:\|\||&&)?[^;]*\.account\b/.test(all);
  });
  t("and the thing that decides whether to push can actually be set",
    wired.length === 0,
    wired.length ? wired.join(", ") + " read the account a way that always fails"
      : "session or chrome.user(), never account() or detail.account");

  /* AND THE ROW EACH GAME ACTUALLY RECORDS MUST RESOLVE BOTH FACTS.
   *
   * The checks above call entryKey with a fixture carrying every identity field
   * the family uses — dailyNo, no, day, date — which is generous enough to hide
   * the fault it is looking for. Grid's page records { no, title, score,
   * solved, misses, hints, at }: no day, no date. entryKey coped, because Grid
   * keys on the number. playedOn did not, and results.js ORDERS BY played_on,
   * so every Grid result would have banked with a null date and the game's
   * whole history would sort as null.
   *
   * That is the word search's fault of 6 September 2026, written up in games.js
   * itself — "migrate.js read only `date`, so every word search row landed with
   * played_on NULL". The comment did not stop Grid reproducing it, because
   * nothing executed a real row.
   *
   * SO THESE ARE THE REAL SHAPES, copied from each page's own recordResult
   * call. A fixture that carries every field tests the fixture. */
  const REAL_ROWS = {
    crossword: { date: "2026-09-14", at: 1, dailyNo: 20, seed: 1 },
    hilo: { game: "hilo", day: "2026-09-14", boardId: "b", score: 9, right: 9, wrong: 2 },
    wordsearch: { day: "2026-09-14", found: 11 },
    scrambled: { no: 20, score: 9 },
    vowels: { no: 20, score: 9 },
    grid: { no: 20, title: "x", score: 9, solved: 9, misses: 1, hints: 0, at: 1 },
    codeword: { no: 20, day: "2026-09-14", score: 90, solved: 11, minute: 12, result: "W" },
    quickfire: { game: "quickfire", day: "2026-09-14", no: 20, score: 600, right: 6 },
    whoami: { game: "whoami", day: "2026-09-14", no: 20, slot: 2, solved: true, score: 94 },
    ballpark: { no: 20, day: "2026-09-14", score: 90, result: "W", inBallpark: 9, bangOns: 2, subs: 1 },
    /* The Friends crossword carries NO DATE of its own — `no` is the family
       daily number and dates the row through playedOn, exactly as Grid and
       Scrambled do. That is the shape that put every word search row in with
       played_on NULL, so it is the one worth having a real row for. */
    crossword_fr: { no: 20, score: 100, correct: 11, kept: true, at: 1 },
  };
  {
    const { playedOn } = await import("../functions/_lib/games.js");
    const broken = [];
    for (const g of SERVER_GAMES) {
      const row = REAL_ROWS[g];
      if (!row) { broken.push(g + " has no real row in this check"); continue; }
      if (typeof entryKey(g, row) !== "string") broken.push(g + " banks no key");
      if (!playedOn(g, row)) broken.push(g + " banks a null played_on");
    }
    t("every game's own recorded row resolves a key AND a played_on",
      broken.length === 0,
      broken.length ? broken.join(" | ")
        : SERVER_GAMES.map((g) => g + "=" + playedOn(g, REAL_ROWS[g])).join(" "));
  }

  /* THE RECORDER MUST CALL THE PUSHER, and until 16 September 2026 this only
   * asked whether the STRING /api/account/migrate appeared anywhere in the
   * game's scripts.
   *
   * A Fable review proved the gap by sabotage: delete the `pushResults();` CALL
   * from inside recordResult and this check stays green, because the string
   * still occurs — in the definition of a function nobody calls any more. That
   * is precisely how Codeword lost six rounds. It recorded locally, never
   * pushed, and every check agreed it was fine.
   *
   * AN "IS IT CALLED ANYWHERE" CHECK IS NOT ENOUGH EITHER. Most of these games
   * also call the pusher from their sign-in handler, so dropping it from the
   * recorder leaves it called and the orphan test green. The question is
   * whether THE RECORDER calls it, because that is the link that banks a
   * finished game.
   *
   * Brace matching rather than a parser: this runs in CI with acorn available,
   * but the same rule is duplicated in each game's deploy_check.mjs, and a gate
   * runs with NO node_modules by design. One technique that works in both
   * places beats two that disagree. Comments and strings are stripped first —
   * a comment naming the endpoint satisfying the check that demands it is this
   * repo's oldest recurring fault. */
  const bodyOf = (src, name) => {
    const at = src.search(new RegExp("function\\s+" + name + "\\s*\\("));
    if (at < 0) return null;
    const open = src.indexOf("{", at);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
    }
    return null;
  };
  const stripped = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

  /* EVERY GAME WITH A RECORDER, NOT `banks`. banks is derived from
     functions/api/<game>/daily.js, and two games legitimately have no such
     directory: the crossword's daily is the unprefixed /api/daily.js and Vowels
     is served through Scrambled's route — both asserted a few lines above. So
     `banks` is eight, and the two it drops include THE CROSSWORD: the flagship,
     the game whose fifteen finished signed-in days and zero banked results sent
     me looking at this check in the first place.
     A check that covers every case except the subject is the shape this estate
     found twice tonight — three mechanisms all asking whether some OTHER page
     names an unreleased game, and none able to see the page itself. This asks
     the family table instead, so a game qualifies by having a recorder rather
     than by how its route happens to be filed. */
  const withRecorder = GAMES.map((g) => g.id).filter((g) => {
    const dir = `football/${g}/js`;
    if (!has(dir)) return false;
    return fs.readdirSync(dir).some((f) => f.endsWith(".js") &&
      /function\s+record(Result|Daily)\s*\(/.test(read(`${dir}/${f}`)));
  });

  const unwired = [];
  for (const g of withRecorder) {
    const dir = `football/${g}/js`;
    const all = stripped(fs.readdirSync(dir).filter((f) => f.endsWith(".js"))
      .map((f) => read(`${dir}/${f}`)).join("\n"));
    if (!/account\/migrate/.test(all)) { unwired.push(g + " never pushes at all"); continue; }
    /* The pusher is whichever function holds the endpoint; the recorder is the
       crossword's recordDaily or everybody else's recordResult. Derived rather
       than listed, so a game that renames one is asked about the other. */
    const pusher = ["pushResults", "pushState", "push"]
      .find((n) => { const b = bodyOf(all, n); return b && /account\/migrate/.test(b); });
    if (!pusher) { unwired.push(g + ": no named function holds the endpoint"); continue; }
    const recName = /function\s+recordDaily\s*\(/.test(all) ? "recordDaily" : "recordResult";
    const rec = bodyOf(all, recName);
    if (!rec) { unwired.push(g + ": no " + recName + " to check"); continue; }
    if (!new RegExp("\\b" + pusher + "\\s*\\(").test(rec)) {
      unwired.push(g + ": " + recName + " does not call " + pusher);
    }
  }
  t("and the function that records a result CALLS the one that pushes it",
    unwired.length === 0,
    unwired.length ? unwired.join(" | ")
      : `${withRecorder.length} games wired recorder -> pusher: ${withRecorder.join(", ")}`);
  /* AND NO TWO GAMES SHARE A PREFIX, because a key that collides files one
     game's result under another's and the merge rule then decides between rows
     that are not comparable. */
  const prefixes = SERVER_GAMES.map((g) => String(entryKey(g, row)).split(":")[0]);
  t("and no two games key under the same prefix",
    new Set(prefixes).size === prefixes.length, prefixes.join(" "));
}

/* EVERY GAME'S BOARD LOOKUP IS EXECUTED, not read.
 *
 * ON 15 SEPTEMBER 2026 QUICKFIRE WENT DOWN IN PRODUCTION for hours and this is
 * the check that was missing. `export { utcDay as today } from "./daily.js"`
 * forwards a name to importers WITHOUT binding it in the module's own scope, so
 * every today() call inside qfdata.js threw "today is not defined" and
 * /api/quickfire/daily answered 500. The same line was in wadata.js.
 *
 * NOTHING CAUGHT IT because nothing ran the function. The round suites read
 * these files as TEXT to assert what the SELECT does not select; the journey
 * suites stub the endpoints out entirely. So the one function that calls
 * today() was never executed, and a module that fails on linkage passes every
 * check that never imports it.
 *
 * THE STUB RETURNS NO ROWS ON PURPOSE. This is not testing what a board looks
 * like — the per-game suites do that. It is testing that the lookup RUNS: that
 * every name it reaches for is bound, and that an empty database gives null
 * rather than an exception. A ReferenceError and a missing board are the same
 * 500 to a player and opposite problems to fix. */
{
  const EMPTY = { DB: { prepare: () => ({ bind: () => ({
    async first() { return null; },
    async all() { return { results: [] }; },
    async run() { return { success: true }; },
  }) }) } };

  const LOOKUPS = [
    ["quickfire", "functions/_lib/qfdata.js", "getDaily"],
    ["whoami", "functions/_lib/wadata.js", "getBoard"],
    ["codeword", "functions/_lib/cw-board.js", "boardForDay"],
  ];
  const broke = [];
  for (const [game, file, fn] of LOOKUPS) {
    if (!has(file)) continue;
    try {
      const mod = await import("../" + file);
      if (typeof mod[fn] !== "function") { broke.push(`${game}: no ${fn}`); continue; }
      /* CALLED WITH NO DATE, WHICH IS THE WHOLE POINT. These lookups read
         `const play = date || today()`, so passing a date short-circuits the
         today() call and the ReferenceError never fires. The first version of
         this check passed "2026-09-15" and MISSED the exact bug it was written
         for — proved by putting the live fault back and watching it stay green.
         A check that exercises the argument path instead of the default one is
         testing the branch nobody took. */
      const out = await mod[fn](EMPTY);
      if (out !== null && out !== undefined) broke.push(`${game}: ${fn} invented a board from nothing`);
    } catch (e) {
      broke.push(`${game}: ${fn} threw — ${e.message}`);
    }
  }
  t("every game's board lookup runs, and answers nothing on an empty database",
    broke.length === 0,
    broke.length ? broke.join(" | ") : LOOKUPS.map((l) => l[0]).join(", "));
}

/* A LAUNCHED GAME MUST BE ADDRESSABLE, and this is the third time today that
 * a check walked the very list the broken game was missing from.
 *
 * Who Am I launched with its archive and permalink routes returning 404. The
 * route files existed — its gate checked that — but functions/_lib/permalink.js
 * had no entry for the game, and permalinkRoute() looks the name up there. The
 * hub linked to /football/whoami/archive/ and the link was dead.
 *
 * tools/archive_test.mjs would have caught it and did not, because it iterates
 * Object.keys(PERMA_GAMES): a game absent from that map is absent from the test
 * as well. That is the identical shape as entryKey's guard walking GAMES, fixed
 * this morning, met again this evening in a different map. The lesson is not
 * "check PERMA_GAMES" — it is that a roster-driven check cannot see an omission
 * FROM the roster, so something outside it has to.
 *
 * LAUNCHED is that something. A game with a launch date is out, and a game that
 * is out has addresses. The two facts live in different files and neither is
 * derived from the other, which is exactly what makes the comparison worth
 * making. */
{
  const { LAUNCHED } = await import("../functions/_lib/games.js");
  const { PERMA_GAMES, THEME_OF } = await import("../functions/_lib/permalink.js");
  const launched = Object.keys(LAUNCHED).filter((g) => LAUNCHED[g]);
  const unaddressable = launched.filter((g) => !PERMA_GAMES[g]);
  const themeless = launched.filter((g) => !THEME_OF[g]);
  t("every launched game is addressable — permalink knows it",
    launched.length > 0 && unaddressable.length === 0,
    unaddressable.length
      ? unaddressable.join(", ") + " have a launch date and no permalink entry, so their routes 404"
      : launched.join(", "));
  t("and every launched game has a theme, so its path can be built",
    themeless.length === 0,
    themeless.length ? themeless.join(", ") : "");
}

t("no game carries a private copy of a shared file",
  GAMES.every((g) => !has(`${g.dir}/xi-tokens.css`) && !has(`${g.dir}/xi-chrome.css`) &&
                     !has(`${g.dir}/xi-chrome.js`)));

/* A GAME THAT POSTS PLAYS MUST ALSO LOAD THE SEASON, or its plays are counted
 * in one of the two places a season is counted and not the other.
 *
 * xi-plays.js posts start and end to /api/play, and the server writes
 * season_play from that — so an ACCOUNT's season has always counted every game.
 * The same two moments are meant to write the DEVICE's season, and that half
 * runs inside xi-plays' noteSeason(), which begins:
 *
 *     if (window.XISeason && typeof window.XISeason[which] === "function")
 *
 * A page that does not load shared/xi-season.js has no window.XISeason, so
 * that test is false, nothing is written, and nothing anywhere reports a
 * problem. Grid, Codeword and Ballpark had been in that state since they
 * launched — measured 16 Sep 2026 — so the hub, which computes a season for a
 * player with no account by reading the device's store, was blind to three of
 * the ten games while the server's copy had all ten. Two answers about what a
 * Tuesday was, which is exactly what one-fact-one-place forbids, arrived at by
 * a missing script tag rather than by a second implementation.
 *
 * Ballpark's own page comment already said "the completions the season already
 * records", which is the tell: the page assumed the thing it had not loaded. */
{
  const posts = GAMES.filter((g) => /xi-plays\.js/.test(read(`${g.dir}/index.html`)));
  const seasonless = posts.filter((g) => !/xi-season\.js/.test(read(`${g.dir}/index.html`)));
  t("every game that posts plays loads the season beside it",
    posts.length >= 8 && seasonless.length === 0,
    seasonless.length
      ? seasonless.map((g) => g.dir).join(", ") + " post plays with no window.XISeason, "
        + "so the device's season silently misses them"
      : `${posts.length} game(s) checked`);
  /* THE FLOOR, because the two lines above are both filters and a filter over
     an empty list finds nothing wrong. If read() ever stops resolving these
     paths, `posts` goes to zero and `seasonless` goes to zero with it. */
  t("and the walk found the games rather than finding nothing",
    posts.length === GAMES.length,
    `${posts.length} of ${GAMES.length} games load xi-plays.js`);
  /* ORDER, because xi-plays reads window.XISeason at runtime and would survive
     the other order today — but the family loads the rule before the thing
     that uses it everywhere else, and a page that differs is a page somebody
     has to reason about. */
  const wrongOrder = posts.filter((g) => {
    const html = read(`${g.dir}/index.html`);
    return html.indexOf("xi-season.js") > html.indexOf("xi-plays.js");
  });
  t("and it loads the season BEFORE the plays, as every other page does",
    wrongOrder.length === 0,
    wrongOrder.length ? wrongOrder.map((g) => g.dir).join(", ") : "");
}

/* THE SHARED LAYER HAS THE SAME PROBLEM EVERY GAME HAD, AND HAD NO GATE FOR IT.
   Each game's gate refuses assets that change without their tag moving. The
   shared files are outside every one of those gates: _headers marks /shared/*
   immutable for a year, and the pages reference it as ?v=v1. So editing
   xi-chrome.js — the squad list, which decides what the drawer shows in EVERY
   game — changes what every page renders while every browser holding the old
   file keeps it for a year.

   Found by the QuickFire integration: adding a game to the squad list changes
   all three drawers and nothing anywhere required the ?v= to move. The same
   fault as v001t, one layer up, and the game-level gates cannot see it.

   Move both constants together, in the post-deploy commit, exactly as a game's
   LAST_SHIPPED and LAST_SHIPPED_ASSETS move together. */
/* ---- THE SHARE ROW, ON EVERY GAME ---------------------------------------
 *
 * The crossword's row — the buttons, the platforms and the copy fallback — is
 * shared/xi-share.js, and five games mounted it while five did not. Four of
 * those offered a bare "Copy result" with nothing to send it with, and Grid
 * offered nothing at all: no row, no button, no line of text.
 *
 * ASKED OF EVERY LAUNCHED GAME, so an eleventh cannot ship without one. The
 * row may be placed in the page OR written into a card the game builds — Grid
 * rebuilds its full time from a string, so a row in its markup would be
 * destroyed by the innerHTML that writes the card, exactly as the community
 * box is. Both are the same promise; a game with neither fails. */
/* WHAT THIS CAN AND CANNOT SEE, said rather than left to be found. It reads
   SOURCE: that the row is placed, the script is loaded and mount is called
   somewhere. Wrapping the call in `if (false && ...)` leaves every one of those
   strings in place and this stays green — proved by sabotage, not assumed. It
   is a WIRING check and is named as one. That the row actually appears at full
   time is proved by execution in football/grid/journey_test.mjs, which plays a
   board to the whistle and reads the card. */
t("every game is wired for the family's share row", (() => {
  const missing = GAMES.filter((g) => {
    const html = has(`${g.dir}/index.html`) ? read(`${g.dir}/index.html`) : "";
    const js = has(`${g.dir}/js/game.js`) ? read(`${g.dir}/js/game.js`) : "";
    const placed = /id="shareRow"/.test(html) || /id=.shareRow./.test(js);
    const mounted = /XIShare\.mount/.test(js);
    const loaded = /xi-share\.js/.test(html);
    return !(placed && mounted && loaded);
  }).map((g) => g.name);
  return GAMES.length > 0 && missing.length === 0;
})(), `${GAMES.length} games checked`);

/* ---- THE COMMUNITY LINE, ON EVERY GAME'S RESULTS CARD -------------------
 *
 * The end of a round is the one moment a player is pleased with the game and
 * still on it, so the subreddit is offered there as well as in the footer.
 * Built by the chrome from one href; each game only says WHERE, with an empty
 * .xic-community box, exactly as it places .xic-foot.
 *
 * ASKED OF EVERY LAUNCHED GAME, so an eleventh cannot ship without one by
 * nobody remembering. The box may live in the page OR in the game's own js:
 * Grid builds its full-time card from a string on every round, so a box in its
 * markup would be destroyed by the innerHTML that writes the card, and it
 * emits the box itself instead. Both are the same promise — that a finished
 * board offers the line — so both count, and a game with neither fails. */
t("every game's results card carries the community box", (() => {
  const missing = GAMES.filter((g) => {
    const html = has(`${g.dir}/index.html`) ? read(`${g.dir}/index.html`) : "";
    const js = has(`${g.dir}/js/game.js`) ? read(`${g.dir}/js/game.js`) : "";
    return !/xic-community/.test(html) && !/xic-community/.test(js);
  }).map((g) => g.name);
  return GAMES.length > 0 && missing.length === 0;
})(), `${GAMES.length} games checked`);
/* AND THE CHROME IS THE ONLY THING THAT FILLS IT. A game writing its own href
   would be the subreddit in eleven places again — the fault the footer was
   built shared to avoid — and the day it moves, ten of them would be wrong.
   THE PATTERN IS A SUBREDDIT ADDRESS, NOT THE WORD "REDDIT". Written as
   /reddit\.com/ first and it failed on the crossword, which has neither a link
   nor a mention of this community: it offers Reddit in its "where did you hear
   about us" dropdown, and a comment names reddit.com among the spellings that
   attribution slug folds together. Both are that game's own business. What may
   not be duplicated is an address pointing INTO a subreddit. */
t("and no game writes the link itself", (() => {
  const guilty = GAMES.filter((g) => {
    const html = has(`${g.dir}/index.html`) ? read(`${g.dir}/index.html`) : "";
    const js = has(`${g.dir}/js/game.js`) ? read(`${g.dir}/js/game.js`) : "";
    const sub = /reddit\.com\/r\//i;
    return sub.test(html) || sub.test(js);
  }).map((g) => g.name);
  return guilty.length === 0;
})(), "the href lives once, in shared/xi-chrome.js");

const SHARED_TAG = "v53";
/* The bytes that ship AS v50. The tag does not move again for this change:
   v50 has not shipped, so it is still the version being prepared, and a tag
   bumped once per edit before release would burn a letter a minute. What
   must not happen is shared bytes changing under a tag that IS live — which
   is the pairing this constant exists for. */
const SHARED_HASH = "51fa815dfc2e874f";
/* EVERY PAGE THAT LINKS THE SHARED LAYER, not the games alone. The hub, the
   two static pages and the unlaunched game all carry the chrome now, and the
   server-rendered shell writes the tag from a constant of its own — so a tag
   bump that missed one of them would serve two builds of one chrome. */
/* ---- THE SHARE CARD EVERY PAGE PROMISES -------------------------------
 *
 * A card that 404s is worse than the wrong card: WhatsApp and Reddit both fall
 * back to NOTHING on a broken image, so the link goes out with no picture at
 * all. site-page.js has a whole paragraph about avoiding exactly that by
 * falling through to the crossword's — and one level up, where nothing was
 * looking, the word search's and Scrambled's own pages named their own cards
 * while the files sat uncommitted. Every share of those two games was
 * pictureless from the day they launched until 7 September 2026.
 *
 * So: every og:image any page names must be a file in this repository, and
 * every entry in site-page.js's map must be one too. Derived from the pages
 * themselves rather than a list here, because a list is the thing that was
 * missing in the first place. */
t("every share card a page names is a file that exists", (() => {
  const missing = [];
  for (const g of GAMES) {
    const html = read(`${g.dir}/index.html`);
    for (const m of html.matchAll(/(?:og:image|twitter:image)"\s+content="([^"]+)"/g)) {
      const rel = m[1].replace("https://www.thexigames.com/", "");
      if (!fs.existsSync(rel)) missing.push(`${g.dir} -> ${m[1]}`);
    }
  }
  const map = read("functions/_lib/site-page.js");
  const block = map.slice(map.indexOf("const OG_IMAGE"), map.indexOf("};", map.indexOf("const OG_IMAGE")));
  for (const m of block.matchAll(/"(\/[^"]+\.png)"/g)) {
    if (!fs.existsSync(m[1].slice(1))) missing.push(`OG_IMAGE -> ${m[1]}`);
  }
  if (missing.length) console.log("        " + missing.join("\n        "));
  return missing.length === 0;
})(), "a card that 404s shows no picture at all, which is worse than the wrong one");

const SHARED_PAGES = [
  ...GAMES.map((g) => `${g.dir}/index.html`),
  "index.html", "football/crossword/privacy.html", "football/crossword/how-to-play.html", "football/quickfire/index.html",
];
const sharedRefsOf = (page) => page.split("shared/xi-").slice(1)
  .map((chunk) => chunk.split(String.fromCharCode(34))[0])
  .filter((ref) => ref.indexOf("?v=") > -1);
t("the shared chrome cannot change without its ?v= moving", (() => {
  const h = createHash("sha256");
  /* EVERY served asset in shared/, not the two that existed when this was
     written. The hash covered xi-chrome.js and xi-chrome.css only, so a token
     added to xi-tokens.css moved no hash and asked for no tag — which is how
     the tokens sat on v2 while the chrome went to v5. Documentation is not
     hashed: a wording change in DESIGN.md is not a release. */
  const sharedFiles = fs.readdirSync("shared")
    .filter((f) => f.endsWith(".css") || f.endsWith(".js"))
    .sort().map((f) => "shared/" + f);
  for (const f of sharedFiles) {
    h.update(f); h.update("\0");
    /* NORMALISED TO LF, LIKE EVERY OTHER HASH IN THIS REPOSITORY. The five
       that describe a game's shipped assets already do it; this was the
       sixth and did not, so it described the working tree rather than what
       ships. A plain `git checkout` of an untouched shared file on Windows
       rewrites it CRLF and moved this hash — red for a change nobody had
       made, on a tree git itself reports as clean, and green in CI where the
       checkout is LF. Found on 7 September 2026 doing exactly that. */
    h.update(read(f).replace(/\r\n/g, "\n"));
  }
  const now = h.digest("hex").slice(0, 16);
  /* EVERY shared asset every page links, not just the script. xi-tokens.css
     sat on v2 while the chrome went to v5, so a token added to it would have
     reached nobody who had visited before — the browser was right to reuse
     what it had. Checking one file of four is checking the one that happened
     to be remembered. Split, not matched: written as a pattern the backslashes
     were eaten on the way into this file and it became a regex that could not
     compile. */
  const tagged = SHARED_PAGES.every((p) => {
    const refs = sharedRefsOf(read(p));
    return refs.length > 0 && refs.every((ref) => ref.split("?v=")[1] === SHARED_TAG);
  }) &&
    /* The server-rendered shell writes its tag from a constant; it is one more
       page, and it must agree. */
    (read("functions/_lib/site-page.js").match(/export const SHARED_TAG = "([a-z0-9]+)"/) || [])[1] === SHARED_TAG;
  if (now === SHARED_HASH) return tagged;
  console.log(`        shared/ CHANGED — bump SHARED_TAG past ${SHARED_TAG} in every ` +
    `page, then set SHARED_HASH to ${now}`);
  return false;
})(), `shared tag ${SHARED_TAG}`);
t("every page references the shared layer at the same version", (() => {
  const tags = SHARED_PAGES.map((p) =>
    (read(p).match(/shared\/xi-chrome\.js\?v=([a-z0-9]+)/) || [])[1]);
  tags.push((read("functions/_lib/site-page.js").match(/export const SHARED_TAG = "([a-z0-9]+)"/) || [])[1]);
  return tags.length > 0 && tags.every(Boolean) && new Set(tags).size === 1;
})(), "one page on an older shared build is two chromes again");
/* THE WHOLE SITE WEARS THE CHROME. The hub and the static pages carried
   their own headers and footers; a page that loads the chrome script and
   places a bar and a footer is one that cannot drift back. */
t("every served page loads the shared chrome and places its bar and footer", (() => {
  const missing = SHARED_PAGES.filter((p) => {
    const html = read(p);
    return !(/shared\/xi-chrome\.js/.test(html) && /class="xic-bar"/.test(html) &&
             /class="xic-foot"/.test(html) && /shared\/xi-theme\.js/.test(html));
  });
  return missing.length === 0;
})(), SHARED_PAGES.join(", "));


/* ---- no game may style a class the chrome puts on the page ---- */
/* THE BUG THIS EXISTS FOR. The wordmark was emitted as a span classed "xi",
   and Crossword XI already had a .xi of its own — a dark green badge for its
   branding. The badge met the the chrome's own colour rule and the XI went dark
   on dark: invisible on one game, correct on the other, from one shared class
   name. The games are already forbidden from writing .xic- rules; this is the
   other half of that fence, and the half that was missing.

   The test is a COLLISION, not a naming convention: the chrome uses a few
   unnamespaced state classes that no game touches, and renaming those buys
   nothing. What must never happen is a game owning a selector that lands on
   the the chrome's own markup.

   Scanned by splitting, not by regex: four checks written this session lost a
   backslash on the way into the file and became patterns matching nothing
   while still reporting ok. */
console.log("\nNo game styles a class the chrome writes");
{
  const Q = String.fromCharCode(34);
  const js = read("shared/xi-chrome.js");

  /* Classes the chrome puts on the page: every class="..." it writes, and the
     second argument of its own el(tag, classes, ...) helper. */
  const written = new Set();
  for (const chunk of js.split("class=" + Q).slice(1)) {
    /* Stop at the first sign of code. A class attribute built by
       concatenation is literal only up to the quote, and reading past it
       collected "k" out of xic-rc xic-" + k + " as though it were a class —
       which then collided with a game's .cal-key .k and reported a clash that
       did not exist. A check that cries wolf gets switched off. */
    let lit = chunk.split(Q)[0];
    for (const stop of ["+", "'", "$", "{"]) {
      const at = lit.indexOf(stop);
      if (at > -1) lit = lit.slice(0, at);
    }
    for (const c of lit.split(" ")) {
      const name = c.trim();
      if (name && name !== "xic-") written.add(name);
    }
  }
  for (const chunk of js.split("el(").slice(1)) {
    const q = chunk.split(Q);
    /* q[1] is the tag, q[3] the class list — but only when nothing but a comma
       separates them, or this is reading some later string entirely. */
    if (q.length > 3 && q[2].trim() === "," ) {
      for (const c of q[3].split(" ")) if (c.trim()) written.add(c.trim());
    }
  }
  t("the chrome writes classes this test can see", written.size > 3,
    written.size + " classes");

  /* A game collides when a rule of its own ENDS in exactly that class: .xi{}
     lands on the the chrome's span, while .cal-key .k.open needs two classes on
     one element and cannot. */
  const clashes = [];
  for (const g of GAMES) {
    let css = "";
    for (const f of listCss(g.dir)) css += read(f) + "\n";
    for (const sel of selectorsOf(css)) {
      const last = sel.trim().split(" ").pop().split(">").pop().trim();
      if (!last.startsWith(".")) continue;
      const name = last.slice(1);
      if (name.includes(".") || name.includes(":")) continue;   // compound: scoped
      if (written.has(name)) clashes.push(g.dir + ": " + sel.trim());
    }
  }
  t("no game owns a selector that lands on the chrome", clashes.length === 0,
    clashes.length ? clashes.join(" | ") : "checked " + GAMES.length + " games");
}



/* ---- the landing shell belongs to one file ---- */
/* The landing was Crossword XI's alone and the word search opened on the
   generation before it — same family, two different sites. The rules moved to
   shared/xi-landing.css unchanged, and all three games load them.

   WHY THIS CHECK AND NOT A PREFIX. The chrome uses xic- to mean "no game may
   restyle this". A landing is a layout games FILL, and renaming eighty rules
   in live markup would have bought a prefix and risked a front page. Single
   ownership is enforced here instead of spelled in the names: a game that
   redefines a selector the shell owns is exactly the drift the prefix would
   have prevented, and this refuses it by name. */
console.log("\nEvery game opens at the same width");
{
  /* THE FAMILY HAS TO LOOK LIKE ONE FAMILY. The owner clicked through from the
     front door on 5 Sep and found the games at different widths, with HiLo's
     header sitting in a visible gutter. Two separate faults, both invisible to
     every check here because both are about what RENDERS rather than what is
     declared — and both catchable statically once you can name the cause. */

  /* ONE: the browser's 8px body margin, unreset. HiLo alone never reset it —
     its stylesheet says it is "the game view only", and a body reset reads
     like the shell's job, except the shell does not do it and the other four
     each do it themselves. So the page sat in a gutter and the chrome bar
     started eight pixels in. */
  const noReset = GAMES.filter((g) => {
    const css = listCss(g.dir).map(read).join("\n").replace(/\s+/g, "");
    return !/body\{[^}]*margin:0/.test(css) && !/\*\{[^}]*margin:0/.test(css);
  });
  t("every game resets the body margin, so none sits in a gutter",
    noReset.length === 0,
    noReset.map((g) => g.name).join(", ") || "no default 8px anywhere");

  /* TWO: a game capping the shared landing. Scrambled and Vowels put
     max-width:720px on the container holding EVERYTHING — right for the
     formation, wrong for the landing, which is the family's shell built to
     1080 and used at 1080 by the other three. It rendered at 692.
     Read from the markup: which classes WRAP the shell in each game, and then
     from that game's own CSS, whether it narrows any of them. A cap on
     something that contains the shell is a cap on the shell. */
  const capped = [];
  for (const g of GAMES) {
    const html = read(`${g.dir}/index.html`);
    const at = html.indexOf('class="site-wrap"');
    if (at === -1) continue;                       // this game does not use the shell
    const open = [];
    const tag = /<(\/?)([a-z]+)([^>]*)>/gi;
    let m;
    while ((m = tag.exec(html)) && m.index < at) {
      if (m[1]) { open.pop(); continue; }
      if (/\/>$/.test(m[0]) || /^(br|img|input|link|meta|hr|source)$/i.test(m[2])) continue;
      const cls = (m[3].match(/class="([^"]*)"/) || [])[1] || "";
      open.push(cls.split(/\s+/).filter(Boolean));
    }
    const ancestors = new Set(open.flat());
    const css = listCss(g.dir).map(read).join("\n");
    for (const cls of ancestors) {
      const rule = new RegExp("(^|[},])\\s*\\." + cls + "\\s*\\{([^}]*)\\}", "m").exec(css);
      const mw = rule && /max-width:\s*(\d+)px/.exec(rule[2]);
      if (mw && Number(mw[1]) < 1080) {
        capped.push(`${g.name}: .${cls} caps the landing at ${mw[1]}px`);
      }
    }
  }
  t("and no game narrows the shared landing with a cap of its own",
    capped.length === 0, capped.join(" | ") || "the shell renders at its own width everywhere");
}

console.log("\nThe landing shell is defined once");
{
  const shellSelectors = new Set();
  for (const sel of selectorsOf(read("shared/xi-landing.css"))) {
    shellSelectors.add(sel.trim());
  }
  t("the shared landing defines the shell", shellSelectors.size > 40,
    shellSelectors.size + " selectors");

  const redefined = [];
  for (const g of GAMES) {
    for (const f of listCss(g.dir)) {
      for (const sel of selectorsOf(read(f))) {
        if (shellSelectors.has(sel.trim())) redefined.push(g.dir + ": " + sel.trim());
      }
    }
  }
  t("and no game redefines any part of it", redefined.length === 0,
    redefined.length ? redefined.slice(0, 4).join(" | ") : "checked " + GAMES.length + " games");

  t("every game loads it", GAMES.every((g) =>
    read(`${g.dir}/index.html`).indexOf("shared/xi-landing.css") > -1));
}

/* ---- and every game asks for the family's face ---- */
/* SETTING --body IS NOT THE SAME AS USING IT. xi-tokens.css defines --body and
   every game loads it, and four games still rendered in Times New Roman on the
   live site on 17 September 2026 — hilo, grid, whoami and ballpark — because
   their stylesheets said `body{margin:0}` and nothing more. Headings named
   var(--disp) and came out in Barlow Condensed; everything else inherited the
   USER AGENT's serif. Half condensed sans, half Times, on four of ten pages.

   NOTHING COULD HAVE CAUGHT IT. There was no failure to find: the fonts load,
   and every fallback chain in the tokens ends in sans-serif, so a check that
   the token is defined, or that the font link is present, passes on all ten.
   The only question that separates the four is whether the game's own
   stylesheet ASKS, and nothing was asking it.

   Deliberately loose about HOW. `body{...font-family:var(--body)}`,
   `html, body {...}` and the shorthand `font:15px/1.45 var(--body)` are all in
   use across the ten and all correct; demanding one spelling would fail three
   games for being themselves. What it demands is that a rule whose selector
   includes body sets a font from --body.

   SCOPE, because the name is broader than the behaviour: the population is
   GAMES, this suite's table, NOT the football/ directory. A directory with a
   stylesheet and no GAMES row is invisible here — proven, by creating one and
   watching this stay green — and that is correct rather than a hole, because a
   game with no row fails the integration checks above long before it reaches
   this one. The row is the thing a new game cannot skip.

   It ITERATES the population rather than filtering it, which is why the
   violating-member case is reachable by taking the font off a game that has
   one: `serif` can hold a name, so the check can represent what it forbids.
   A version that collected only the compliant games would have counted its own
   successes and no sabotage in either direction would have moved it. */
{
  console.log("\nEvery game asks for the family's face, not the browser's");
  const serif = [];
  for (const g of GAMES) {
    const css = read(`${g.dir}/css/style.css`).replace(/\/\*[\s\S]*?\*\//g, "");
    /* Every rule whose selector names body, then whether any sets a font from
       the token. A game may spell it html,body or body alone. */
    const asks = [...css.matchAll(/(^|\})([^{}]*\bbody\b[^{}]*)\{([^}]*)\}/g)]
      .some((m) => /font(-family)?\s*:[^;]*var\(--body\)/.test(m[3]));
    if (!asks) serif.push(g.name);
  }
  t("every game's stylesheet sets a body font from --body", serif.length === 0,
    serif.length ? serif.join(", ") + " inherit the browser's serif"
      : GAMES.length + " games");
}

/* ---- games consume tokens; they never define them ---- */
/* THE AUDIT'S HEADLINE. crossword/css/style.css carried its own :root with
   twelve of the shared tokens restated at identical values, and an inverted
   dark palette on top. Change --pitch in shared/ and two games moved; the
   crossword did not. The rule in shared/DESIGN.md is that a game may set a
   custom property only for a fact that exists in that game alone — so any
   name that ALSO exists in the shared token file is a restatement, whatever
   its value, and is refused here by name. Scanned by splitting, not by
   pattern, like every other check in this file that has to survive a shell. */
console.log("\nNo game restates a shared token");
{
  /* COMMENTS ARE NOT DECLARATIONS. This read the whole file, so a comment
     that named a token and then punctuated — "--on-pitch rather than
     --hero-rule: the rule token is tuned for..." — was read as a game
     redefining --hero-rule, and the game had done nothing of the kind. A
     check that can be tripped by prose is one that gets worked around
     rather than trusted. */
  const names = (css) => {
    const out = new Set();
    for (const chunk of css.replace(/\/\*[\s\S]*?\*\//g, "").split("--").slice(1)) {
      const name = chunk.split(/[^a-z0-9-]/)[0];
      const rest = chunk.slice(name.length).trimStart();
      if (name && rest.startsWith(":")) out.add("--" + name);
    }
    return out;
  };
  const shared = names(read("shared/xi-tokens.css"));
  t("the shared token file defines the palette", shared.size > 60, shared.size + " tokens");
  for (const g of GAMES) {
    const restated = [];
    for (const f of listCss(g.dir)) {
      for (const n of names(read(f))) if (shared.has(n)) restated.push(n);
    }
    t(`${g.name} defines no token the shared file already owns`, restated.length === 0,
      restated.length ? restated.slice(0, 6).join(", ") + (restated.length > 6 ? " …" : "") : "own facts only");
  }
}
/* ---- THE HUB JUDGES EVERY LIVE GAME ----
 *
 * The front door dims a shirt and counts a game in the roll-call once that
 * game has been played today. It does it with one fetch-and-read block per
 * game, written out longhand — and Vowels XI launched with four of those for
 * five live games, so its shirt never went done and the line never counted it.
 * The comment above the block said "three live shirts" while there were four.
 *
 * A block repeated once per game is a block somebody adds four of and forgets
 * the fifth, so this derives the list from the squad rather than restating it:
 * every game in the team sheet above must have its storage prefix read and its
 * shirt marked, or the hub is not judging it. */
console.log("\n=== The hub judges every live game ===");
{
    /* READ THE TABLE WHERE IT LIVES, NOT THE CODE THAT USES IT.
     This looked for five hand-written blocks — a getItem per prefix and a
     markDone per shirt. That was the right property checked against the wrong
     thing: the hub HAD five copies of one idea, which is exactly why the
     fifth was forgotten the day Vowels launched. A check demanding those
     blocks would be demanding the fault back.

     THE TABLE MOVED AGAIN ON 21 SEPTEMBER 2026, out of index.html and into
     shared/xi-played.js, because the full-time panel needs the same fact and
     a second copy is the fault this whole file exists to catch. So it is now
     in TWO files by design and this must read both: the PROBE (id, storage
     key, endpoint) in xi-played.js, and the SHIRT NUMBER in xi-chrome.js's
     football squad, which is already the one statement of what a game is
     called and where it lives.

     That makes this check stronger rather than weaker: what is verified is
     the JOIN. A probe with no squad slot, or a slot with no probe, is a game
     that is half-registered — the state nobody notices — and either one fails
     here now.
     Matched on the PREFIX rather than a guessed key: the crossword's is
     `fcw.results.v1`, and a check demanding a key shape the games never
     agreed on fails a game for being itself. */
  const played = read("shared/xi-played.js");
  const probeAt = played.indexOf("var PROBE = [");
  const probeSrc = probeAt > -1 ? played.slice(probeAt, played.indexOf("\n  ];", probeAt)) : "";
  const probes = [...probeSrc.matchAll(/id:\s*"([a-z_]+)",\s*key:\s*"([^"]+)"/g)]
    .map((m) => ({ id: m[1], key: m[2] }));

  /* EVERY THEME'S SQUAD, not football's. This read football's block alone, which
     was right while there was one squad and wrong the moment the Friends
     crossword took number 1 of its own: the join resolved null for it and the
     shirt check reported a game with no shirt. A shirt number is unique WITHIN a
     squad — two themes each having a number 1 is the design, not a clash — so
     the slots are gathered across themes and the uniqueness is checked per
     squad below. */
  const chromeSrc = read("shared/xi-chrome.js");
  const squadsAt = chromeSrc.indexOf("var SQUADS = {");
  /* Bounded by what FOLLOWS the map rather than by a newline escape: a "
"
     written into this file through a shell lost its backslash twice today
     and arrived as a real line break, splitting the string literal. */
  const squadsEnd = chromeSrc.indexOf("var SQUAD = SQUADS[", squadsAt);
  const squadSrc = squadsAt > -1 && squadsEnd > squadsAt
    ? chromeSrc.slice(squadsAt, squadsEnd) : "";
  const slots = [...squadSrc.matchAll(/n:\s*(\d+),[^}]*href:\s*"([^"]+)"/g)]
    .map((m) => ({ n: Number(m[1]), href: m[2] }));
  const idOf = (href) => {
    const parts = String(href).split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  };
  /* JOINED ON THE ADDRESS, NOT ON A SLUG. This matched the last path segment of
     the squad href against the probe id, which held only while the two were the
     same word. They are not: the Friends crossword is `crossword_fr` and lives
     at /friends/crossword/, so the segment is "crossword" and the join resolved
     null — reporting a launched game as having no shirt. The GAMES table above
     carries each game's dir, which IS the address, so that is what is compared. */
  const rows = probes.map((p) => {
    const g = GAMES.find((x) => x.id === p.id);
    const want = g ? "/" + g.dir + "/" : null;
    const slot = want ? slots.find((s) => s.href === want) : null;
    return { id: p.id, key: p.key, n: slot ? slot.n : null };
  });

  t("the probe table exists and is one table, not a block per game",
    probes.length > 0, probes.length + " rows");

  /* THE INVERSE, so the duplicate cannot quietly come back. The hub held this
     table until today; if a row shape ever reappears in index.html it means
     somebody rebuilt it there rather than reading the shared one, which is
     the exact drift this move was made to stop. */
  t("and the hub no longer keeps one of its own",
    !/api:\s*"\/api\//.test(read("index.html")),
    "index.html reads XIPlayed.list() instead");

  const unjudged = GAMES.filter((g) =>
    !rows.some((r) => r.id === g.id && r.key.indexOf(g.prefix + ".") === 0));
  t("every live game has a row in it, under its own prefix",
    unjudged.length === 0,
    unjudged.length ? unjudged.map((g) => g.name).join(", ") + " not judged"
      : rows.map((r) => r.id).join(", "));

  /* PER SQUAD, because a shirt number is a team's. Football's eleven and
     Friends' eleven each start at 1, so a single set across the family would
     report a clash that is actually the design. What must hold is that every
     game HAS a shirt, and that no two games in the SAME theme share one. */
  /* A SHIRT IS JOINED BY ADDRESS, SO AN UNLISTED GAME HAS NO JOINABLE SHIRT —
     and that is the design, not a gap. The join is slot.href === "/" + dir +
     "/", and an unlisted game's slot carries no href precisely so that the
     shipped chrome does not say where the game is. Nothing on the client can
     then tell which game that slot belongs to, which is the whole point.
     NOTHING IS LOST. A shirt number is used for the hub strip, the card and
     the kit colour, all of which are things an unlisted game is absent from.
     So the rule is scoped to LISTED games and the inverse is asserted rather
     than skipped: an unlisted game that acquired a joinable shirt would mean
     its address had come back into shared/xi-chrome.js, which is exactly the
     leak the href was removed to close. */
  t("each LISTED game has its own shirt, no shirt twice in a squad, and no unlisted game is joinable", (() => {
    if (rows.length !== GAMES.length) return false;

    const listed = rows.filter((r) => LISTED(GAMES.find((x) => x.id === r.id)));
    const hidden = rows.filter((r) => !LISTED(GAMES.find((x) => x.id === r.id)));

    if (!listed.length) return false;                 // a vacuous pass is not a pass
    if (!listed.every((r) => r.n !== null)) return false;
    if (!hidden.every((r) => r.n === null)) return false;

    const byTheme = {};
    for (const r of listed) {
      const g = GAMES.find((x) => x.id === r.id);
      const theme = g ? g.dir.split("/")[0] : "?";
      (byTheme[theme] = byTheme[theme] || []).push(r.n);
    }
    return Object.keys(byTheme).every((t2) =>
      new Set(byTheme[t2]).size === byTheme[t2].length);
  })(), rows.map((r) => (r.n === null ? "unlisted" : r.n) + " " + r.id).join(" | "));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
