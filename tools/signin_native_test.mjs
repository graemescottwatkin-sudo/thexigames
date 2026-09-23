/* tools/signin_native_test.mjs — Google sign-in inside the app, and not
 * outside it.
 *
 * THE FAULT. In the Android app, Google's web button opened Chrome; the
 * account was chosen there and it was Chrome that got signed in, because a
 * WebView and Chrome share no cookies. The app stayed signed out (owner, 24 Sep
 * 2026). xi-chrome.js now asks Capacitor whether the app's XiGoogleSignIn
 * plugin is present and, if so, never loads Google's library: its own button
 * asks the plugin for an ID token and posts it to /api/auth/google exactly as
 * the web button's credential is posted.
 *
 * Run for real in jsdom with the plugin faked the way the app exposes it
 * (Capacitor.isNativePlatform, isPluginAvailable, Plugins.XiGoogleSignIn with
 * signIn and signOut) and fetch faked the way the server answers:
 *
 *   the web             no Capacitor: Google's library loads as it always has
 *   not the app         Capacitor without the plugin, or not native: the same
 *   the app             no library, ever; the plugin asked with the WEB client
 *                       id; the token posted with the CSRF header; signed in
 *   cancelled           nothing posted, nothing said
 *   no account          the device code is offered
 *   plugin failure      a sentence, never the plugin's own message
 *   server refusal      the server's words, as on the web
 *   sign-out            the plugin forgets the account too
 *
 * What it cannot prove: that Credential Manager returns a token the server
 * accepts. That is the Play build on the emulator, end to end.
 */
import fs from "node:fs";
import { JSDOM } from "jsdom";

let pass = 0, fail = 0;
const t = (n, ok, d) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`);
};
const themeJs = fs.readFileSync("shared/xi-theme.js", "utf8");
const chromeJs = fs.readFileSync("shared/xi-chrome.js", "utf8");
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };

const CLIENT = "954444528040-web.apps.googleusercontent.com";
const GIS = 'script[src^="https://accounts.google.com/gsi/client"]';

/* `cap`: undefined for a browser, or the Capacitor shape to fake. `signIn` is
   what the plugin does when asked. `server` is how /api/auth/google answers. */
function page({ cap, signIn, server = { status: 200, body: { user: { id: "u1", displayName: "Sam", provider: "google" } } } } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><header class="xic-bar"></header></body></html>',
    { runScripts: "outside-only", url: "https://www.thexigames.com/football/hilo/" });
  const w = dom.window;
  const calls = { fetch: [], signIn: [], signOut: 0 };
  w.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.fetch.push({ url: u, method: init.method || "GET", headers: init.headers || {},
                       body: init.body ? JSON.parse(init.body) : null });
    let status = 200, body = {};
    if (u === "/api/auth/session") body = { user: null, googleClientId: CLIENT };
    else if (u === "/api/auth/google") ({ status, body } = server);
    else if (u === "/api/auth/signout") body = { ok: true };
    return new w.Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  if (!w.Response) w.Response = Response;
  if (cap) {
    w.Capacitor = {
      isNativePlatform: () => cap.native !== false,
      isPluginAvailable: (name) => cap.plugin !== false && name === "XiGoogleSignIn",
      Plugins: cap.plugin === false ? {} : { XiGoogleSignIn: {
        signIn: async (opts) => { calls.signIn.push(opts); return signIn ? signIn(opts) : { idToken: "tok.native.id" }; },
        signOut: async () => { calls.signOut++; },
      } },
    };
  }
  w.eval(themeJs);
  w.eval(chromeJs);
  w.XIChrome.init();
  return { w, doc: w.document, calls };
}
async function openSheet(p) {
  await settle();                       // the session answer lands
  p.w.XIChrome.account.open();
  await settle();
}
const posted = (p) => p.calls.fetch.filter((c) => c.url === "/api/auth/google");
const msg = (p) => (p.doc.querySelector(".xic-msg") || {}).textContent || "";
const gbtn = (p) => p.doc.querySelector(".xic-gsi .xic-gbtn");

/* ---- the web ---- */
{
  const p = page();
  await openSheet(p);
  t("on the web, opening the sheet loads Google's library as it always has", !!p.doc.querySelector(GIS));
  t("and draws no app button", !gbtn(p));
}
for (const [label, cap] of [["Capacitor that is not native", { native: false }], ["the app without the plugin", { plugin: false }]]) {
  const p = page({ cap });
  await openSheet(p);
  t(`${label}: the web path, unchanged`, !!p.doc.querySelector(GIS) && !gbtn(p));
}

/* ---- the app ---- */
{
  let events = [];
  const p = page({ cap: {} });
  p.doc.addEventListener("xi:account", (e) => events.push(e.detail && e.detail.type));
  await openSheet(p);
  t("in the app, Google's library is never loaded", !p.doc.querySelector(GIS));
  t("the app's own button is there instead", !!gbtn(p) && /Google/.test(gbtn(p).textContent));
  gbtn(p).click();
  await settle();
  t("pressing it asks the plugin once, for the WEB client id",
    p.calls.signIn.length === 1 && p.calls.signIn[0].serverClientId === CLIENT, JSON.stringify(p.calls.signIn));
  const g = posted(p)[0];
  t("the token is posted to /api/auth/google as the web credential is",
    g && g.method === "POST" && g.body && g.body.credential === "tok.native.id" && Object.keys(g.body).length === 1,
    g && JSON.stringify(g.body));
  t("with the CSRF header", g && (g.headers["X-XI-Games"] === "1" || g.headers["X-Crossword-XI"] === "1"));
  t("and the player is signed in", events.includes("signin") && /Signed in/.test(msg(p)), msg(p));
  t("still no library after signing in", !p.doc.querySelector(GIS));

  p.w.XIChrome.account.open();
  await settle();
  /* Signing out through the chrome's own control, found by what it says. */
  const btn = [...p.doc.querySelectorAll(".xic-sheet button")].find((b) => /sign out/i.test(b.textContent));
  t("the signed-in sheet has its sign-out control", !!btn);
  if (btn) btn.click();
  await settle();
  t("signing out makes the plugin forget the account too", p.calls.signOut === 1, `${p.calls.signOut} call(s)`);
  t("and the app button is drawn again for the next sign-in", !!gbtn(p) && !p.doc.querySelector(GIS));
}

{
  const p = page({ cap: {}, signIn: () => { throw { code: "cancelled", message: "user closed" }; } });
  await openSheet(p);
  gbtn(p).click(); await settle();
  t("cancelled: nothing posted and nothing said", posted(p).length === 0 && msg(p) === "", msg(p));
}
{
  const p = page({ cap: {}, signIn: () => { throw { code: "no-account" }; } });
  await openSheet(p);
  gbtn(p).click(); await settle();
  t("no Google account on the phone: the device code is offered", posted(p).length === 0 && /device code/i.test(msg(p)), msg(p));
}
{
  const p = page({ cap: {}, signIn: () => { throw { code: "failed", message: "androidx.credentials.GetCredentialException: internal 17" }; } });
  await openSheet(p);
  gbtn(p).click(); await settle();
  t("a plugin failure says so plainly, and never shows its own message",
    posted(p).length === 0 && msg(p).length > 0 && !/androidx|internal|Exception/.test(msg(p)), msg(p));
}
{
  const p = page({ cap: {}, server: { status: 403, body: { error: "Token was not issued for this site" } } });
  await openSheet(p);
  gbtn(p).click(); await settle();
  t("a server refusal is shown in the server's words, as on the web", /not issued for this site/.test(msg(p)), msg(p));
  gbtn(p).click(); await settle();
  t("and the button can be pressed again afterwards", p.calls.signIn.length === 2, `${p.calls.signIn.length} asks`);
}
{
  /* A second press while the first is still at the picker is the same sign-in. */
  let release;
  const p = page({ cap: {}, signIn: () => new Promise((r) => { release = () => r({ idToken: "tok.slow" }); }) });
  await openSheet(p);
  gbtn(p).click(); gbtn(p).click(); await settle();
  t("a double tap asks the plugin once", p.calls.signIn.length === 1, `${p.calls.signIn.length} asks`);
  release(); await settle();
  t("and posts once", posted(p).length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
