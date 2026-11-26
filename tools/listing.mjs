/* tools/listing.mjs — is a launched game ADVERTISED or not, and does the tree agree?
 *
 * One set of checks for both answers, asked by each game's own gate.
 *
 * WHY THIS IS SHARED. Launching is five things that move together, and until
 * 26 Nov 2026 each gate asserted its own game's five as a fact: "it wears the
 * ninth shirt", "the hub names it, now that it is out", "listed, by the owner's
 * ruling of 27 Sep". That day the owner scaled the site back to three games
 * ("bring them back one at a time when ready") and fourteen gates' worth of
 * those facts stopped being true at once. Nine gates went red, not because the
 * tree was wrong but because each could only describe one of the two states a
 * launched game can be in.
 *
 * A LAUNCHED GAME IS LISTED OR UNLISTED (functions/_lib/games.js), and the two
 * are mirror images:
 *
 *                      LISTED                      UNLISTED
 *   the squad slot     its name and its address    a status; no name, no address
 *   the sitemap, run   offers its front page       offers nothing under its address
 *   a search engine    is told nothing             is told noindex, on every response
 *   its theme's hub    links it                    neither links nor names it, or is
 *                                                  not served at all (no listed game)
 *
 * Deleting a game's line from UNLISTED therefore turns its gate red on the
 * LISTED column, which is the list of what bringing it back still needs.
 *
 * RUN WHERE IT CAN BE: the sitemap and the hub route are executed, because a
 * grep of the sitemap's source calls every game advertised (its page list
 * names them all; advertisedPath() is what filters them).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, LABELS, LAUNCHED, isListed } from "../functions/_lib/games.js";
import { gamePath, gameDir, themeOf, themeHubFile, themeHubPath, themeHubRoute, advertisedPath } from "../functions/_lib/permalink.js";
import { onRequestGet as sitemap } from "../functions/sitemap.xml.js";
import { squadSlots } from "./squad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://www.thexigames.com";
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/* What a page SAYS: HTML comments are exempt from the naming rule, and a block
   comment in its style or script is not markup anybody is shown. */
export const said = (html) => html.replace(/<!--[\s\S]*?-->/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

/* A theme's launched games that are not listed. A squad slot carrying a STATUS
   is one of these or a game still in build, and the squad does not say which:
   an unlisted game's slot states neither its name nor its address. So a rule
   about "no unreleased game on a shirt" can only be asked as a count. */
export const benched = (theme) => GAMES.filter((g) => themeOf(g) === theme && LAUNCHED[g] && !isListed(g));

export async function listingOf(game) {
  const addr = gamePath(game), label = LABELS[game], theme = themeOf(game);
  const slot = squadSlots(theme).find((s) => s.href === addr || s.name === label) || null;
  const xml = await (await sitemap({ env: {}, request: new Request(SITE + "/sitemap.xml") })).text();
  const pageFile = gameDir(game) + "/index.html";
  const page = fs.existsSync(path.join(ROOT, pageFile)) ? read(pageFile) : "";
  const hub = said(read(themeHubFile(theme)));
  let served = false;
  const hubAnswer = await themeHubRoute({ env: { ASSETS: { fetch: () => { served = true; return new Response("hub"); } } },
    request: new Request(SITE + themeHubPath(theme)) });
  return {
    game, addr, label, theme, listed: isListed(game), slot,
    sitemapRan: xml.includes("<urlset") && xml.includes(SITE + "/<"),
    sitemapFront: xml.includes(SITE + addr + "<"),
    sitemapAny: xml.includes(SITE + addr),
    pageFound: page.length > 0,
    metaNoindex: /<meta[^>]+name="robots"[^>]+noindex/i.test(page),
    advertised: advertisedPath(addr) && advertisedPath(addr + "archive/") && advertisedPath(addr + "daily/1"),
    hidden: !advertisedPath(addr) && !advertisedPath(addr + "archive/") && !advertisedPath(addr + "daily/1"),
    themeListed: GAMES.some((g) => themeOf(g) === theme && isListed(g)),
    hubServed: served && hubAnswer.status === 200,
    hubStatus: hubAnswer.status + (hubAnswer.headers.get("Location") ? " " + hubAnswer.headers.get("Location") : ""),
    hubLinks: hub.includes(`href="${addr}"`),
    hubNames: hub.includes(label),
  };
}

/* The four rows of the table above, for whichever state the game is in. `t` is
   the calling gate's own (name, ok, note). Returns the facts, so a gate can add
   what is its alone -- which shirt, which card -- under `if (L.listed)`. */
export async function listingChecks(t, game) {
  const L = await listingOf(game);
  t("PRECONDITION: the listing was readable: a page, a squad and a sitemap that ran", L.pageFound && L.sitemapRan,
    `${L.game} at ${L.addr}`);
  if (L.listed) {
    t("LISTED: its squad slot carries its name and its address, and no status",
      !!L.slot && L.slot.name === L.label && L.slot.href === L.addr && !L.slot.status,
      L.slot ? `shirt ${L.slot.n}` : "no slot names it");
    t("LISTED: the sitemap, run, offers its front page", L.sitemapFront);
    t("LISTED: nothing tells a search engine to leave it out", !L.metaNoindex && L.advertised,
      L.metaNoindex ? "its page still says noindex" : "");
    t("LISTED: its theme's hub is served, and links it", L.hubServed && L.hubLinks, L.hubStatus);
  } else {
    t("UNLISTED: no squad slot names it or says where it is", !L.slot,
      L.slot ? `shirt ${L.slot.n} still carries ${L.slot.name || L.slot.href}` : "a status and nothing else");
    t("UNLISTED: the sitemap, run, offers nothing under its address", !L.sitemapAny);
    t("UNLISTED: every response under its address is sent noindex", L.hidden,
      "advertisedPath() is what functions/_middleware.js asks");
    if (L.themeListed) {
      t("UNLISTED: its theme's hub neither links it nor names it", L.hubServed && !L.hubLinks && !L.hubNames,
        L.hubLinks ? "linked" : L.hubNames ? "named" : L.hubStatus);
    } else {
      t("UNLISTED: its theme has no listed game, so the hub that names them all is not served",
        !L.hubServed && L.hubStatus === "302 /", L.hubStatus);
    }
  }
  return L;
}
