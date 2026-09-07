/* The shell every server-rendered page on this site is poured into.
 *
 * The answers pages each carried their own copy of this markup and CSS. A
 * second copy is a second place for the site to look like two sites, and the
 * club pages would have made it a fourth. One shell, and a page supplies only
 * what is its own.
 *
 * THE FAMILY SHELL, NOT A BARE ONE. These pages used to carry inline CSS and
 * nothing else — no chrome bar, no masthead, no footer — on the argument that
 * a search visitor on a cold cache should not wait for a stylesheet, and that
 * the chrome named every game. So a club page read as a different site from
 * the game it belonged to, and it is the page a search visitor sees first.
 * The chrome names released games only, the live checks enforce that on
 * every page, and two small cached stylesheets are a fair price for looking
 * like one site. So: the shared tokens, the landing masthead, the chrome bar
 * and footer, and the theme script in the head so a phone set to dark does
 * not flash dark on a light site. The page's own rules use the tokens.
 */

/* THE SHARED LAYER'S TAG, as every page carries it in its ?v=. One more
   place the tag is written; tools/aligned_test.mjs asserts it agrees with the
   pages, so it cannot fall behind them quietly. */
export const SHARED_TAG = "v31";

/* What each game's masthead says and where its tabs go. The current tab is
   marked by path; a page with no game (a hub-level page) gets no masthead. */
const MAST = {
  crossword: {
    name: "Crossword", home: "/football/crossword/",
    nav: [["Today", "/football/crossword/"], ["Clubs", "/football/crossword/clubs/"],
          ["Archive", "/football/crossword/archive/"],
          ["Answers", "/football/crossword/answers/"], ["How to play", "/football/crossword/how-to-play"]],
  },
  wordsearch: {
    name: "Wordsearch", home: "/football/wordsearch/",
    nav: [["Today", "/football/wordsearch/"], ["Themes", "/football/wordsearch/themes/"],
          ["Archive", "/football/wordsearch/archive/"],
          ["Answers", "/football/wordsearch/answers/"], ["How to play", "/football/crossword/how-to-play"]],
  },
  hilo: {
    name: "HiLo", home: "/football/hilo/",
    nav: [["Today", "/football/hilo/"], ["Clubs", "/football/hilo/clubs/"],
          ["Archive", "/football/hilo/archive/"],
          ["Answers", "/football/hilo/answers/"], ["How to play", "/football/hilo/#how"]],
  },
  /* Scrambled and Vowels had no server-rendered page at all until their
     answers archives were built, so they had no masthead either — and a page
     with no masthead is a page a player cannot get back from. */
  scrambled: {
    name: "Scrambled", home: "/football/scrambled/",
    nav: [["Today", "/football/scrambled/"], ["Archive", "/football/scrambled/archive/"],
          ["Answers", "/football/scrambled/answers/"],
          ["How to play", "/football/crossword/how-to-play"]],
  },
  grid: {
    name: "Grid", home: "/football/grid/",
    nav: [["Today", "/football/grid/"], ["Archive", "/football/grid/archive/"],
          ["Answers", "/football/grid/answers/"],
          ["How to play", "/football/crossword/how-to-play"]],
  },
  vowels: {
    name: "Vowels", home: "/football/vowels/",
    nav: [["Today", "/football/vowels/"], ["Archive", "/football/vowels/archive/"],
          ["Answers", "/football/vowels/answers/"],
          ["How to play", "/football/crossword/how-to-play"]],
  },
};

const CSS = `
/* The page's ground and type, on the tokens. The chrome styles what it
   draws and nothing else, so the body is the shell's to set — dropped once
   in the move to the shared layer, and every server-rendered page fell
   back to the browser's serif. */
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--body);
  font-size:16px;line-height:1.55;-webkit-text-size-adjust:100%}
.site-page{max-width:680px;margin:0 auto;padding:28px 20px 48px}
.site-page h1{font-family:var(--disp);font-weight:700;font-size:var(--fs-h1,32px);
  letter-spacing:.03em;text-transform:uppercase;margin:0 0 4px;color:var(--ink)}
.site-page h2{font-family:var(--disp);font-weight:700;font-size:21px;
  letter-spacing:.04em;text-transform:uppercase;margin:30px 0 10px;color:var(--ink)}
.site-page .sub{color:var(--ink-soft);margin:0 0 24px}
.site-page ol,.site-page ul{margin:0;padding:0;list-style:none}
.site-page li{background:var(--card);border:1px solid var(--line);border-radius:var(--r-md,8px);
  padding:12px 16px;margin:0 0 8px}
.site-page li .meta{display:block;color:var(--ink-soft);font-size:14px;margin-top:2px}
/* A set is the name in its own column and the chips in theirs. The name used
   to share the first line with the chips, so a row of thirty-three seasons
   wrapped with its first line starting a name's width to the right of every
   line under it. The chips are one width, so wrapped lines make columns. On a
   narrow phone the name goes above the chips instead of beside them. */
.site-page li.set{display:grid;grid-template-columns:minmax(120px,180px) 1fr;gap:8px 16px;align-items:start}
.site-page .set .name{font-family:var(--disp);font-weight:700;
  font-size:18px;line-height:1.15;letter-spacing:.04em;text-transform:uppercase;padding-top:10px}
.site-page .set .chips{display:flex;flex-wrap:wrap;gap:8px}
@media (max-width:520px){.site-page li.set{grid-template-columns:1fr}.site-page .set .name{padding-top:0}}
/* The numbers are the thing you press, so they are shaped like it: a bordered
   pill with a tap target, not a number that happens to be a link. One width,
   so a wrapped row lines up with the row above it. */
.site-page .set .no{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;
  min-width:64px;min-height:var(--tap,40px);padding:0 10px;border:2px solid var(--pitch);border-radius:var(--r-md,8px);
  background:var(--card);color:var(--pitch-ink,var(--pitch));text-decoration:none;font-weight:700;font-size:15px;
  font-variant-numeric:tabular-nums}
.site-page .set .no:hover,.site-page .set .no:focus{background:var(--pitch);color:var(--on-pitch,#fff)}
.site-page a{color:var(--pitch-ink,var(--pitch))}
.site-page .soon li{background:var(--tint);border-style:dashed}
.site-page .crumb{font-size:14px;color:var(--ink-soft);margin:0 0 18px}
.site-page .cta{display:inline-block;background:var(--pitch);color:var(--on-pitch,#fff);text-decoration:none;
  font-family:var(--disp);font-weight:700;font-size:17px;
  letter-spacing:.1em;text-transform:uppercase;padding:11px 22px;border-radius:var(--r-pill,999px);margin-top:26px}
.site-page .cta.ghost{background:transparent;color:var(--pitch-ink,var(--pitch));border:2px solid var(--pitch);margin-left:8px}
.site-page nav.foot{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:30px;padding-top:18px;border-top:1px solid var(--line)}
`;

/* Anything interpolated into markup goes through here. Club and theme names
   are authored data, not literals, and a name with an ampersand in it would
   otherwise arrive as broken markup rather than as a name. */
export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* The game's masthead: name, and its tabs with the current one marked by the
   page's own path. Rendered from MAST so a tab added for one page is on
   every page of that game. */
function masthead(game, current) {
  const m = MAST[game];
  if (!m) return "";
  const tabs = m.nav.map(([label, href]) => {
    const on = current && (href === current || (href !== m.home && current.indexOf(href) === 0));
    return `<a class="site-navlink${on ? " on" : ""}" href="${esc(href)}">${esc(label)}</a>`;
  }).join("");
  return `<header class="site-head"><div class="site-bar">
<a class="site-mast" href="${esc(m.home)}">${esc(m.name)} <span class="site-xi">XI</span></a>
<nav class="site-nav">${tabs}</nav>
</div></header>`;
}

/* ---- WHAT A SHARE PREVIEW SHOWS -----------------------------------------
 *
 * EVERY SERVER-RENDERED PAGE IN THE FAMILY GOES THROUGH sitePage, and until
 * 6 September 2026 not one of them carried an og: or twitter: tag. Club pages,
 * theme pages, answers pages, the HiLo and word search trees — all pasted into
 * WhatsApp or Reddit as a bare link with no card, while the games' own
 * hand-written index.html files each had a full set. The gap was invisible
 * because nothing on the site links to these pages expecting a preview; it was
 * found by somebody building a bot that does.
 *
 * SO IT IS BUILT HERE, ONCE. A page supplies its title, its description and its
 * canonical — which it already must — and the card follows. Nothing is invented
 * per page, and one of these pages cannot end up with a card that disagrees
 * with its own <title>, which is what the games' hand-written heads are one
 * edit away from at all times.
 *
 * THE IMAGE IS THE GAME'S, and where a game has not got one yet the crossword's
 * is used. A card that 404s is worse than a family card: WhatsApp and Reddit
 * both fall back to nothing, and a link with no picture is a link people scroll
 * past. Said here rather than silently — the fix is artwork, not code.
 */
/* EVERY GAME HAS ITS OWN CARD NOW, committed 7 September 2026. Until then this
   held one entry and everything fell through to the crossword's, because
   naming a path that 404s is worse than a family card: WhatsApp and Reddit
   both fall back to NOTHING on a broken image, so a link that would have had
   the wrong picture gets no picture at all.

   TWO OF THEM WERE ALREADY 404ING. The word search's and Scrambled's own pages
   named their own cards while the files sat uncommitted, so every share of
   those two games showed no image at all — the exact failure the fall-through
   was written to avoid, one level up where nothing was watching. There is a
   check for that now: tools/aligned_test.mjs asserts that every card a page
   names is a file that exists. */
const OG_IMAGE = {
  crossword: "/football/crossword/og-image.png",
  wordsearch: "/football/wordsearch/og-image.png",
  scrambled: "/football/scrambled/og-image.png",
  hilo: "/football/hilo/og-image.png",
  vowels: "/football/vowels/og-image.png",
  grid: "/football/grid/og-image.png",
};
const SITE_ORIGIN = "https://www.thexigames.com";

function socialTags({ title, description, canonical, game }) {
  const img = SITE_ORIGIN + (OG_IMAGE[game] || OG_IMAGE.crossword);
  /* Absolute, always: a relative og:image is ignored by every scraper that
     matters, and canonical is already absolute on every caller. */
  const url = /^https?:/.test(String(canonical || "")) ? canonical : SITE_ORIGIN + canonical;
  return [
    '<meta property="og:type" content="article">',
    '<meta property="og:site_name" content="The XI Games">',
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
  ].join("\n");
}

export function sitePage({ title, description, canonical, body, noindex, game = "crossword", current = null, extraCss = "" }) {
  const v = SHARED_TAG;
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex,follow">\n' : ""}<link rel="canonical" href="${esc(canonical)}">
${socialTags({ title, description, canonical, game })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/shared/xi-tokens.css?v=${v}">
<link rel="stylesheet" href="/shared/xi-landing.css?v=${v}">
<link rel="stylesheet" href="/shared/xi-chrome.css?v=${v}">
<script src="/shared/xi-theme.js?v=${v}"></script>
<style>${CSS}${extraCss || ""}</style>
</head>
<body>
<header class="xic-bar"></header>
${masthead(game, current)}
<main class="site-page">${body}</main>
<footer class="xic-foot"></footer>
<script src="/shared/xi-chrome.js?v=${v}"></script>
</body></html>`;
}

export function htmlResponse(page, { maxAge = 3600, noindex = false } = {}) {
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": `public, max-age=${maxAge}`,
  };
  /* Said in the header as well as the meta tag. A crawler that only fetches
     headers, and any non-HTML response, would never see the meta. */
  if (noindex) headers["X-Robots-Tag"] = "noindex";
  return new Response(page, { headers });
}
