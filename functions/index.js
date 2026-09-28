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
import { THEMES, themeHubPath, themeOf, gamePath, ROOT_THEME } from "./_lib/permalink.js";
import { GAMES, isListed, LABELS, LAUNCHED } from "./_lib/games.js";
import { sitePage, htmlResponse, esc } from "./_lib/site-page.js";

/* A theme is shown when it has at least one game that is launched AND listed.
   A theme whose only game is unlisted is not a theme the site has, as far as
   anybody who has not been told about it is concerned. */
export function listedThemes() {
  return THEMES.filter((t) => GAMES.some((g) => themeOf(g) === t && isListed(g)));
}

/* WHAT EACH THEME'S CARD SAYS. The name, one line, the button. Everything
   else -- how many games, which ones -- is counted from the games list, so a
   launch changes the card with no edit here. A theme with no entry still gets
   a card, in plain words, rather than no card. */
const THEME = {
  football: { name: "Football", line: "Clubs, players, grounds and the numbers behind the game.", go: "Play football" },
  friends:  { name: "Friends",  line: "The sitcom, one clue at a time.", go: "Play Friends" },
};

/* WHERE A THEME'S CARD POINTS, and it is not always the theme hub.
 *
 * A HUB IS A PAGE THAT HAS TO EXIST. A theme with ONE game does not want a hub
 * -- a page listing a single game is a click for nothing -- so its card goes
 * straight to the game. A theme with several needs the hub, and the crossword
 * gate refuses a listed multi-game theme whose hub file does not exist -- so a
 * theme cannot be announced into a broken card. */
export function themeCardPath(theme) {
  const mine = GAMES.filter((g) => themeOf(g) === theme && isListed(g));
  if (mine.length === 1) return gamePath(mine[0]);
  return themeHubPath(theme);
}

/* A theme's listed games, in the order they launched. The theme's own name is
   taken off a game's label on its own card: "Crossword XI: Friends" reads as
   "Crossword XI" under a card that already says Friends. */
function gamesOf(theme) {
  const name = (THEME[theme] || {}).name || "";
  return GAMES.filter((g) => themeOf(g) === theme && isListed(g))
    .sort((x, y) => String(LAUNCHED[x] || "").localeCompare(String(LAUNCHED[y] || "")))
    .map((g) => String(LABELS[g] || g).replace(": " + name, ""));
}

export function picker(themes) {
  const cards = themes.map((t) => {
    const th = THEME[t] || { name: t.charAt(0).toUpperCase() + t.slice(1), line: "", go: "Play" };
    const games = gamesOf(t);
    return `<a class="pk-card pk-${esc(t)}" href="${esc(themeCardPath(t))}">
  <span class="pk-art" aria-hidden="true"><i></i><i></i><i></i></span>
  <span class="pk-kick">${games.length} daily game${games.length === 1 ? "" : "s"}</span>
  <span class="pk-name">${esc(th.name)}</span>
  ${th.line ? `<span class="pk-line">${esc(th.line)}</span>` : ""}
  <span class="pk-games">${games.map((n) => `<span>${esc(n)}</span>`).join("")}</span>
  <span class="pk-go">${esc(th.go)} <span aria-hidden="true">&rarr;</span></span>
</a>`;
  }).join("\n");
  const names = themes.map((t) => (THEME[t] || { name: t }).name);
  const list = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names.join("");

  return sitePage({
    title: "The XI Games — daily " + list + " puzzles",
    description: "Daily puzzle games: " + list + ". Eleven clues, a new board every day. Free to play.",
    canonical: "https://www.thexigames.com/",
    game: null,
    body: `<section class="pk-hero">
  <p class="pk-eyebrow">Daily puzzle games</p>
  <h1 class="pk-title">The <span class="pk-xi">XI</span> Games</h1>
  <p class="pk-sub">Eleven clues. A new board every day. Pick your side.</p>
</section>
<div class="pk-themes">
${cards}
</div>
<p class="pk-note">Free to play. Unofficial fan puzzles, not affiliated with or endorsed by any club, league, broadcaster or studio.</p>`,
    extraCss: PICKER_CSS,
  });
}

/* THE LOOK: a hero, then one big card per theme in the theme's own colour,
   with a motif drawn in CSS -- a pitch's halfway line and centre circle for
   football, overlapping rings for Friends. No image and no show imagery: the
   owner's rule for Friends is that nothing on the site uses the show's logo,
   stills or cast. Colours are the palette's tokens (shared/xi-tokens.css). */
const PICKER_CSS = `
.site-page{max-width:1040px}
.pk-hero{text-align:center;padding:26px 8px 6px}
.pk-eyebrow{margin:0;font-family:var(--disp);font-weight:700;font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-soft)}
.pk-title{margin:6px 0 8px;font-family:var(--disp);font-weight:700;font-size:clamp(44px,9vw,78px);line-height:.92;letter-spacing:.01em;color:var(--ink)}
.pk-xi{display:inline-block;padding:0 .12em;border-radius:.12em;background:var(--gold);color:var(--gold-ink)}
.pk-sub{margin:0 auto;max-width:36ch;font-size:17px;line-height:1.5;color:var(--ink-soft)}
.pk-themes{display:grid;grid-template-columns:1fr;gap:16px;margin:26px 0 12px}
@media (min-width:720px){.pk-themes{grid-template-columns:1fr 1fr;gap:20px}}
.pk-card{position:relative;overflow:hidden;isolation:isolate;display:flex;flex-direction:column;gap:8px;
  min-height:330px;padding:24px 24px 22px;border-radius:20px;text-decoration:none;color:#fff;
  box-shadow:0 1px 2px rgba(0,0,0,.06),0 12px 32px rgba(0,0,0,.10);
  transition:transform var(--t-base,.18s) ease,box-shadow var(--t-base,.18s) ease}
.pk-card:hover{transform:translateY(-4px);box-shadow:0 2px 4px rgba(0,0,0,.08),0 20px 44px rgba(0,0,0,.16)}
.pk-card:focus-visible{outline:3px solid var(--gold);outline-offset:4px}
.pk-kick{font-family:var(--disp);font-weight:700;font-size:12.5px;letter-spacing:.18em;text-transform:uppercase;opacity:.85}
.pk-name{font-family:var(--disp);font-weight:700;font-size:clamp(46px,7vw,60px);line-height:.9}
.pk-line{max-width:28ch;font-size:15.5px;line-height:1.45;opacity:.92}
.pk-games{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 4px;max-width:34ch}
.pk-games span{padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.14);font-size:13px;font-weight:600;white-space:nowrap}
.pk-go{margin-top:auto;align-self:flex-start;display:inline-flex;align-items:center;gap:8px;
  padding:11px 18px;border-radius:999px;background:#fff;font-family:var(--disp);font-weight:700;
  font-size:16px;letter-spacing:.06em;text-transform:uppercase}
.pk-card > span:not(.pk-art){position:relative;z-index:1}
.pk-art{position:absolute;inset:0;z-index:0;pointer-events:none}
.pk-art i{position:absolute;display:block}
/* FOOTBALL: the pitch, mown in stripes, with its halfway line and centre
   circle bleeding off the right-hand edge. */
.pk-football{background:var(--pitch) repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 40px,transparent 40px 80px)}
.pk-football .pk-go{color:var(--pitch-deep)}
.pk-football .pk-art i:nth-child(1){top:0;bottom:0;right:22%;width:2px;background:rgba(255,255,255,.22)}
.pk-football .pk-art i:nth-child(2){top:50%;right:22%;width:210px;height:210px;border:2px solid rgba(255,255,255,.22);border-radius:50%;transform:translate(50%,-50%)}
.pk-football .pk-art i:nth-child(3){top:50%;right:22%;width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.3);transform:translate(50%,-50%)}
/* FRIENDS: its own colour, and three overlapping rings in gold -- a shape,
   not a picture of anything. */
.pk-friends{background:var(--friends)}
.pk-friends .pk-go{color:var(--friends-deep)}
.pk-friends .pk-art i{border-radius:50%;border:14px solid rgba(242,201,76,.20)}
.pk-friends .pk-art i:nth-child(1){top:-40px;right:-30px;width:190px;height:190px}
.pk-friends .pk-art i:nth-child(2){top:70px;right:60px;width:130px;height:130px;border-color:rgba(255,255,255,.13)}
.pk-friends .pk-art i:nth-child(3){bottom:-60px;right:-10px;width:170px;height:170px;border-color:rgba(242,201,76,.14)}
.pk-note{margin:10px auto 30px;max-width:60ch;text-align:center;font-size:13px;line-height:1.5;color:var(--ink-faint)}
@media (max-width:420px){.pk-card{min-height:290px;padding:20px 18px 18px}.pk-football .pk-art i:nth-child(2){width:160px;height:160px}}
@media (prefers-reduced-motion:reduce){.pk-card{transition:none}.pk-card:hover{transform:none}}
/* THE SITE PAGE'S OWN RULES WIN OTHERWISE: .site-page a colours every link
   green, and .site-page h1 sets its own size and capitals -- found on the
   first render, where the cards' white text came out green on green. */
.site-page a.pk-card{color:#fff}
.site-page a.pk-football .pk-go{color:var(--pitch-deep)}
.site-page a.pk-friends .pk-go{color:var(--friends-deep)}
.site-page h1.pk-title{font-size:clamp(44px,9vw,78px);text-transform:none;letter-spacing:.01em;margin:6px 0 8px}
`;

/* THE ROOT IS THE THEME PICKER. The owner, 29 Sep 2026: "make the theme selector now / Only Friends and
   Football so far / make it look good" -- after the ruling of 28 Sep that the
   all-in-one app "links to Thexigames.com which will be the theme selector".
   It replaces the ruling of 27 Sep ("TheXIGames.com still shows Football
   only").
   ROOT_THEME in permalink.js says which: a theme there puts that theme's hub
   at the root, null puts the picker. It is null. */
export async function onRequest(ctx) {
  if (ROOT_THEME) return ctx.env.ASSETS.fetch(new URL(themeHubPath(ROOT_THEME), ctx.request.url));
  /* Five minutes, not an hour: the picker is counted from the games list, and
     a launch should reach the front door the same afternoon. */
  return htmlResponse(picker(listedThemes()), { maxAge: 300 });
}

/* The middleware derives HEAD from GET for every Function route, so there is
   nothing to export for it here. */
