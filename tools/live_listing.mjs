/* tools/live_listing.mjs — LISTED or UNLISTED, asked of PRODUCTION.
 *
 * The live half of tools/listing.mjs: the same two columns, read from what the
 * site actually serves instead of from the tree. Each game's live_check.mjs
 * calls it.
 *
 * WHY IT EXISTS. On 26 Nov 2026 the owner scaled the public site back to three
 * games and the other fourteen went unlisted. The gates had been made to hold
 * in both states before the push; the live checks had not, because nothing runs
 * them offline, and the first post_deploy after the push refused fourteen games
 * at once. Every failure was a live check correctly observing that production
 * now hides its game -- "the sitemap lists it: FAIL", "the hub links to it:
 * FAIL" -- while asserting the opposite. A check that fails because the deploy
 * WORKED teaches people to read red as green.
 *
 *                      LISTED                      UNLISTED
 *   the shipped squad  its name and its address    no name, no address
 *   the served sitemap offers its front page       offers nothing under its address
 *   its served page    200, no noindex anywhere    200, and a noindex header
 *   its theme's hub    200, and links it           neither links nor names it, or
 *                                                  302 to "/" (no listed game)
 *
 * WHAT "LISTED" MEANS HERE is the tree's isListed(), so a live check run from a
 * tree that is ahead of the deploy says so: the deploy has not caught up.
 *
 * THE CHROME IS FETCHED AT THE ADDRESS THE PAGE ASKS FOR, ?v= and all. The CDN
 * holds each version for a year, so an unversioned fetch reads bytes no page
 * downloads.
 */
import { GAMES, LABELS, isListed } from "../functions/_lib/games.js";
import { gamePath, themeOf, themeHubPath } from "../functions/_lib/permalink.js";
import { slotsIn } from "./squad.mjs";

const SITE = "https://www.thexigames.com";
const said = (html) => html.replace(/<!--[\s\S]*?-->/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

export async function liveListing(t, game, base = SITE) {
  const addr = gamePath(game), label = LABELS[game], theme = themeOf(game);
  const listed = isListed(game);
  const themeListed = GAMES.some((g) => themeOf(g) === theme && isListed(g));
  /* A query nobody else sends, so the answer is the origin's and not a cached
     copy from before the deploy. */
  const fresh = "?listing=" + Date.now();
  const text = async (r) => { try { return await r.text(); } catch (e) { return ""; } };

  const page = await fetch(base + addr + fresh, { redirect: "manual" });
  const html = await text(page);
  const header = page.headers.get("x-robots-tag") || "";
  const meta = /<meta[^>]+name="robots"[^>]+noindex/i.test(html);
  const mapRes = await fetch(base + "/sitemap.xml" + fresh);
  const xml = await text(mapRes);
  const chromeRef = (html.match(/src="(\/shared\/xi-chrome\.js\?v=[^"]+)"/) || [])[1] || "";
  const chrome = chromeRef ? await text(await fetch(base + chromeRef)) : "";
  let slots = [];
  try { slots = slotsIn(chrome, theme); } catch (e) { slots = []; }
  const slot = slots.find((s) => s.href === addr || s.name === label) || null;
  const hub = await fetch(base + themeHubPath(theme) + fresh, { redirect: "manual" });
  const hubHtml = hub.status === 200 ? said(await text(hub)) : "";
  const hubTo = hub.headers.get("location") || "";

  t("LIVE PRECONDITION: the page, the sitemap and the chrome it loads were all read",
    page.status === 200 && mapRes.status === 200 && xml.includes("<urlset") && xml.includes(SITE + "/<") && slots.length >= 1,
    `page ${page.status}, sitemap ${mapRes.status}, ${chromeRef || "no chrome reference"}, ${slots.length} ${theme} slots`);
  if (listed) {
    t("LIVE, LISTED: the shipped team sheet names it, with its address",
      !!slot && slot.name === label && slot.href === addr, slot ? `shirt ${slot.n}` : "no slot names it");
    t("LIVE, LISTED: the served sitemap offers its front page", xml.includes(SITE + addr + "<"));
    t("LIVE, LISTED: its page is sent no noindex, by header or in the page", !/noindex/.test(header) && !meta,
      `header "${header}", meta ${meta}`);
    t("LIVE, LISTED: its theme's hub is served, and links it",
      hub.status === 200 && hubHtml.includes(`href="${addr}"`), String(hub.status));
  } else {
    t("LIVE, UNLISTED: the shipped team sheet neither names it nor says where it is",
      !slot && !slots.some((s) => s.href && s.href.startsWith(addr)), slot ? `shirt ${slot.n} carries it` : "a status and nothing else");
    t("LIVE, UNLISTED: the served sitemap offers nothing under its address", !xml.includes(SITE + addr));
    t("LIVE, UNLISTED: its page is still served, and is sent noindex", page.status === 200 && /noindex/.test(header),
      `HTTP ${page.status}, header "${header}"`);
    if (themeListed) {
      t("LIVE, UNLISTED: its theme's hub neither links it nor names it",
        hub.status === 200 && !hubHtml.includes(`href="${addr}"`) && !hubHtml.includes(label), String(hub.status));
    } else {
      t("LIVE, UNLISTED: its theme has no listed game, so the hub goes to the front door",
        hub.status === 302 && /^(https:\/\/www\.thexigames\.com)?\/$/.test(hubTo), `${hub.status} ${hubTo}`);
    }
  }
  return { listed, themeListed, header, meta };
}
