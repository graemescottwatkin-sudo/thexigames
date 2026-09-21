/* functions/index.js — the front door.
 *
 * WHAT THIS IS FOR. Until 21 September 2026 the site root WAS the football hub:
 * index.html sat at the repository root, and `/football/` 302'd to it because
 * football was the only theme and had nothing of its own to say. The second
 * theme landed, the hub moved to its real address at /football/, and this file
 * is what the root became.
 *
 * IT IS THE THEME PICKER, and today it shows one theme, so it shows that
 * theme's hub instead of a page with a single card on it. That is not a
 * placeholder to be replaced later: it is the picker answering correctly for
 * the number of themes there are. The day a second theme is ANNOUNCED the same
 * code renders a choice, with no edit here — which is the whole point of
 * deriving it rather than writing today's answer down.
 *
 * ANNOUNCED, NOT MERELY LAUNCHED. isListed() is the question, not LAUNCHED.
 * The Friends crossword is live and unlisted: playable at its own address,
 * banking results, and advertised nowhere. A picker built on LAUNCHED would
 * have put a Friends card on the most-linked page of the site the moment the
 * game went live, which is the precise opposite of what unlisted means.
 *
 * WHY NEITHER ADDRESS MAY REDIRECT TO THE OTHER, which is the part that is
 * easy to get wrong and expensive to find out about. Browsers have been served
 * `/football/ -> / (302)` for weeks and a 302 IS cached by the client for the
 * session. If the root now redirected to /football/, a client holding the old
 * redirect would go / -> /football/ -> / -> ... a loop, on the most-linked URL
 * on the site, for exactly the visitors who have been here before. So the root
 * SERVES the hub rather than pointing at it, and /football/ serves it as a
 * static file. Nothing redirects, so nothing can loop, and a stale cached
 * `/football/ -> /` simply lands on a root that answers properly.
 *
 * env.ASSETS.fetch is how permalink.js has served a game's shell since the
 * permalinks shipped; this is the same mechanism one level up, so there is one
 * copy of the hub and two addresses for it rather than two files that drift.
 */
import { THEMES, themeHubPath, themeOf, gamePath } from "./_lib/permalink.js";
import { GAMES, isListed } from "./_lib/games.js";
import { sitePage, htmlResponse, esc } from "./_lib/site-page.js";

/* A theme is shown when it has at least one game that is launched AND listed.
   A theme whose only game is unlisted is not a theme the site has, as far as
   anybody who has not been told about it is concerned. */
export function listedThemes() {
  return THEMES.filter((t) => GAMES.some((g) => themeOf(g) === t && isListed(g)));
}

const TITLE = {
  football: "Football",
};

/* WHERE A THEME'S CARD POINTS, and it is not always the theme hub.
 *
 * A HUB IS A PAGE THAT HAS TO EXIST. Football has one; the second theme did
 * not, and the first version of this linked every card at themeHubPath(t) --
 * so the Friends card pointed at /friends/, which is a 404. That would have
 * shipped the day the theme was announced and not one moment earlier, which is
 * the worst possible time to find it: the announcement and the broken link are
 * the same edit. Found by ACTUALLY RENDERING the picker against a tree with two
 * listed themes rather than reading the code, because the branch is unreachable
 * until then.
 *
 * A theme with ONE game does not want a hub anyway -- a page listing a single
 * game is a click for nothing -- so its card goes straight to the game. A theme
 * with several needs the hub, and the gate refuses a listed multi-game theme
 * whose hub file does not exist -- so a theme cannot be announced into a
 * broken card. */
export function themeCardPath(theme) {
  const mine = GAMES.filter((g) => themeOf(g) === theme && isListed(g));
  if (mine.length === 1) return gamePath(mine[0]);
  return themeHubPath(theme);
}

function picker(themes) {
  const cards = themes.map((t) => {
    const name = TITLE[t] || t.charAt(0).toUpperCase() + t.slice(1);
    const n = GAMES.filter((g) => themeOf(g) === t && isListed(g)).length;
    return `<a class="xi-theme" href="${esc(themeCardPath(t))}">` +
      `<span class="xi-theme-name">${esc(name)} XI</span>` +
      `<span class="xi-theme-n">${n} daily game${n === 1 ? "" : "s"}</span></a>`;
  }).join("\n");

  return sitePage({
    title: "The XI Games — eleven clues, eleven games",
    description: "Daily puzzle games. Pick a theme to play today's board.",
    canonical: "https://www.thexigames.com/",
    game: null,
    body: `<h1>The XI Games</h1>\n<div class="xi-themes">\n${cards}\n</div>`,
    extraCss: `.xi-themes{display:grid;gap:12px;margin:24px 0}
.xi-theme{display:flex;justify-content:space-between;align-items:center;gap:12px;
  padding:16px 18px;border:1px solid var(--line);border-radius:12px;
  background:var(--card);color:inherit;text-decoration:none}
.xi-theme-name{font-weight:700}
.xi-theme-n{opacity:.7;font-size:.9em}`,
  });
}

export async function onRequest(ctx) {
  const themes = listedThemes();

  /* NO LISTED THEME AT ALL is not a state this site can be in -- every game
     would have to be unlisted at once -- but it is a state this FUNCTION can be
     handed, and returning an empty picker would be a blank front door. Football
     is the fallback, the same fallback themeOf() and themeHere() already use. */
  if (themes.length <= 1) {
    const only = themes[0] || "football";
    return ctx.env.ASSETS.fetch(new URL(themeHubPath(only), ctx.request.url));
  }

  return htmlResponse(picker(themes), { maxAge: 300 });
}

/* The middleware derives HEAD from GET for every Function route, so there is
   nothing to export for it here. */
