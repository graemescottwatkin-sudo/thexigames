/* tools/push_page_test.mjs — the reminders on the page: shared/xi-push.js,
 * and the two lines in xi-chrome.js and xi-fulltime.js that reach it.
 *
 * Run for real in jsdom, with the app's XiPush plugin faked the way the app
 * exposes it (window.Capacitor.Plugins.XiPush: status, enable, disable) and
 * fetch faked the way the server answers. Every branch the file has:
 *
 *   the web         no Capacitor: nothing is loaded, nothing is offered
 *   not configured  the app without Firebase: no rows, no offer
 *   yes             the offer after a finished game, Android's prompt, the
 *                   registration (a zone name, never a date), the rows
 *   the rows        the morning time cycles and is posted; the streak and
 *                   challenge rows ask a signed-out player to sign in
 *   not now         remembered, never asked again
 *   off             the server forgets the token and the plugin deletes it
 *   a restart       re-registers; a rotated token forgets the old one
 *   denied          permission withdrawn in Android settings turns it off
 *   clearing        "clear my records" keeps the reminder switch
 *
 * What it cannot prove: that the real WebView puts XiPush on window.Capacitor
 * the way the fake does. That is the app's side, proved on the emulator.
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
const pushJs = fs.readFileSync("shared/xi-push.js", "utf8");
const fulltimeJs = fs.readFileSync("shared/xi-fulltime.js", "utf8");
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

const TOKEN = "tok_page_" + "y".repeat(24);
const PREFS = { morningMinute: 540, wantMorning: true, wantStreak: true, wantChallenge: true, account: false };

/* A page with the chrome on it, in the app or not. */
function page({ app = true, configured = true, permission = "prompt", stored = null, token = TOKEN } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><header class="xic-bar"></header></body></html>',
    { runScripts: "outside-only", url: "https://www.thexigames.com/football/hilo/" });
  const w = dom.window;
  const calls = { fetch: [], enable: 0, disable: 0 };
  w.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.fetch.push({ url: u, method: init.method || "GET", headers: init.headers || {},
                       body: init.body ? JSON.parse(init.body) : null });
    let body = {};
    if (u === "/api/push/device" && init.method === "POST") {
      const b = JSON.parse(init.body);
      body = { ok: true, prefs: { ...PREFS,
        ...(b.morningMinute != null ? { morningMinute: b.morningMinute } : {}),
        ...(b.wantMorning != null ? { wantMorning: b.wantMorning } : {}) } };
    } else if (u === "/api/push/device") body = { ok: true };
    return new w.Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  if (!w.Response) w.Response = Response;
  if (stored) w.localStorage.setItem("xi.push.v1", JSON.stringify(stored));
  if (app) {
    w.Capacitor = { Plugins: { XiPush: {
      status: async () => ({ configured, permission }),
      enable: async () => { calls.enable++; return { token, platform: "android" }; },
      disable: async () => { calls.disable++; },
    } } };
  }
  w.eval(themeJs);
  w.eval(chromeJs);
  w.XIChrome.init();
  return { w, doc: w.document, calls };
}

/* The chrome only inserts the tag; jsdom does not fetch it, so the file is
   run here, exactly once, only when the chrome asked for it. */
function loadPush(p) {
  const tag = p.doc.querySelector("script[data-xi-push]");
  if (tag) p.w.eval(pushJs);
  return tag;
}

function rows(p) {
  p.w.XIChrome.settings.open();
  const out = {};
  for (const b of p.doc.querySelectorAll(".xic-pop .xic-row[data-row]")) {
    const st = b.querySelector(".xic-pc");
    const label = b.textContent.replace(st ? st.textContent : "", "").trim();
    out[label] = { state: st ? st.textContent : "", el: b };
  }
  p.w.XIChrome.settings.close();
  return out;
}
function press(p, label) {
  p.w.XIChrome.settings.open();
  const b = [...p.doc.querySelectorAll(".xic-pop .xic-row[data-row]")].find((x) => x.textContent.startsWith(label));
  if (b) b.click();
  p.w.XIChrome.settings.close();
  return !!b;
}
const fulltime = (p) => p.doc.dispatchEvent(new p.w.CustomEvent("xi:fulltime", { detail: { game: "hilo" } }));
const stored = (p) => JSON.parse(p.w.localStorage.getItem("xi.push.v1") || "null");
const posts = (p, method = "POST") => p.calls.fetch.filter((c) => c.url === "/api/push/device" && c.method === method);

/* ---- the web ---- */
{
  const p = page({ app: false });
  await settle();
  t("on the web the chrome loads nothing", !p.doc.querySelector("script[data-xi-push]") && !p.w.XIPush);
  t("and adds no reminder rows", !("Reminders" in rows(p)));
}

/* ---- the full-time panel says a game ended ---- */
{
  const p = page({ app: false });
  p.w.eval(fulltimeJs);
  let heard = null;
  p.doc.addEventListener("xi:fulltime", (e) => { heard = e.detail; });
  p.w.XIFullTime.nextUp(p.doc.createElement("div"), { game: "hilo" });
  t("XIFullTime.nextUp announces xi:fulltime with the game", heard && heard.game === "hilo", JSON.stringify(heard));
}

/* ---- but filling the slot at load does not ----
   Every game's #nextUpRow is filled when the page loads, so that it has a
   height to be seen by, and that fill announced Full Time: in the app the
   reminders offer came up before a ball was kicked, where a quick "Not now"
   is remembered for good (found 25 Sep 2026). A page loading with its results
   panel hidden says nothing; the panel being shown is what announces. */
{
  const p = page({ app: false });
  let heard = 0;
  p.doc.addEventListener("xi:fulltime", () => { heard++; });
  const row = p.doc.createElement("div");
  row.id = "nextUpRow"; row.setAttribute("data-game", "hilo");
  const panel = p.doc.createElement("section"); panel.hidden = true; panel.appendChild(row);
  p.doc.body.appendChild(panel);
  p.w.eval(fulltimeJs);
  await settle();
  t("a page loading with its Full Time panel hidden does not announce xi:fulltime", heard === 0, `${heard} announcement(s)`);
  p.w.XIFullTime.watch(p.doc.createElement("div"), { game: "hilo" });
  await settle();
  t("and nor does watch() filling a slot", heard === 0, `${heard} announcement(s)`);
}

/* ---- in the app, not configured ---- */
{
  const p = page({ configured: false });
  const tag = loadPush(p);
  await settle();
  t("in the app, the chrome asks for xi-push.js", !!tag && /^\/shared\/xi-push\.js/.test(tag.getAttribute("src")),
    tag && tag.getAttribute("src"));
  fulltime(p);
  t("an app built without Firebase offers nothing", !p.doc.querySelector(".xip-ask"));
  t("and shows no reminder rows", !("Reminders" in rows(p)));
}

/* ---- turned on from Settings, with the menu still open ----
   The row said Off until Settings was closed and opened again: turning on
   waits for Android's prompt and the server, and the menu had been drawn
   before either answered (found in the app, 25 Sep 2026). */
{
  const p = page();
  loadPush(p);
  await settle();
  p.w.XIChrome.settings.open();
  const row = () => [...p.doc.querySelectorAll(".xic-pop .xic-row[data-row]")].find((x) => x.textContent.startsWith("Reminders"));
  row().click();
  await settle();
  const pop = p.doc.querySelector(".xic-pop");
  const st = row() && row().querySelector(".xic-pc");
  t("turning reminders on from an open Settings menu shows On there once it has settled",
    pop && !pop.hidden && st && st.textContent === "On", st ? st.textContent : "no row");
  row().click();
  await settle();
  t("and Off again when turned off", row().querySelector(".xic-pc").textContent === "Off", row().querySelector(".xic-pc").textContent);
  p.w.XIChrome.settings.close();
}

/* ---- yes ---- */
{
  const p = page();
  loadPush(p);
  await settle();
  t("before any game ends, nothing is offered", !p.doc.querySelector(".xip-ask"));
  let r = rows(p);
  t("the Reminders row is there and off", r.Reminders && r.Reminders.state === "Off");
  t("the detail rows wait until reminders are on", !("Morning reminder" in r));

  fulltime(p);
  const box = p.doc.querySelector(".xip-ask");
  t("a finished game brings the offer", !!box && /nudge/.test(box.textContent));
  box.querySelector('[data-a="yes"]').click();
  await settle();
  t("yes asks Android once", p.calls.enable === 1);
  const post = posts(p)[0];
  t("and registers the phone with its token, platform and zone",
    post && post.body.token === TOKEN && post.body.platform === "android" && typeof post.body.tz === "string" && post.body.tz.length > 0,
    post && JSON.stringify(post.body));
  t("sending no date: the server decides the day",
    post && !Object.keys(post.body).some((k) => /day|date|time$/i.test(k)) &&
    !Object.values(post.body).some((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v))));
  t("with the CSRF header", post && post.headers["X-XI-Games"] === "1");
  const s = stored(p);
  t("remembered on the device: on, asked, the token", s && s.on === true && s.asked === true && s.token === TOKEN);
  t("the offer is gone", !p.doc.querySelector(".xip-ask"));

  r = rows(p);
  t("Settings now shows it on, the morning at 09:00",
    r.Reminders.state === "On" && r["Morning reminder"] && r["Morning reminder"].state === "09:00");
  t("a signed-out player is asked to sign in for streaks and challenges",
    r["Streak nudge"] && r["Streak nudge"].state === "Sign in" && r["Challenge results"].state === "Sign in");

  press(p, "Morning reminder");
  await settle();
  const m = posts(p).at(-1);
  t("pressing the morning row moves it on and tells the server",
    rows(p)["Morning reminder"].state === "10:00" && m.body.morningMinute === 600 && m.body.wantMorning === true,
    m && JSON.stringify(m.body));

  fulltime(p);
  t("the offer is not made again while reminders are on", !p.doc.querySelector(".xip-ask"));

  press(p, "Reminders");
  await settle();
  const del = posts(p, "DELETE")[0];
  t("turning them off makes the server forget this token", del && del.body.token === TOKEN);
  t("and has the app delete it", p.calls.disable === 1);
  t("and is remembered", stored(p).on === false && rows(p).Reminders.state === "Off");
}

/* ---- not now ---- */
{
  const p = page();
  loadPush(p);
  await settle();
  fulltime(p);
  p.doc.querySelector('.xip-ask [data-a="no"]').click();
  await settle();
  fulltime(p);
  t("not now: Android is not asked, nothing is registered", p.calls.enable === 0 && posts(p).length === 0);
  t("and the offer does not come back", !p.doc.querySelector(".xip-ask") && stored(p).asked === true);
}

/* ---- a restart with a rotated token ---- */
{
  const OLD = "tok_old_" + "z".repeat(24);
  const p = page({ permission: "granted", stored: { on: true, asked: true, token: OLD, platform: "android" } });
  loadPush(p);
  await settle();
  const del = posts(p, "DELETE")[0], post = posts(p)[0];
  t("on start the phone re-registers under its current token", post && post.body.token === TOKEN);
  t("and the rotated-out token is forgotten", del && del.body.token === OLD);
  t("without asking for anything the player already chose",
    post && !("morningMinute" in post.body) && !("wantStreak" in post.body));
}

/* ---- permission withdrawn in Android settings ---- */
{
  const p = page({ permission: "denied", stored: { on: true, asked: true, token: TOKEN, platform: "android" } });
  loadPush(p);
  await settle();
  t("reminders turn off and the server forgets the phone",
    stored(p).on === false && posts(p, "DELETE").length === 1 && posts(p).length === 0);
}

/* ---- clearing records ---- */
{
  const p = page();
  p.w.localStorage.setItem("xi.push.v1", JSON.stringify({ on: true, token: TOKEN }));
  p.w.localStorage.setItem("xi.season.v1", "{}");
  p.w.XIChrome.records.clear();
  t("clearing records keeps the reminder switch, and still clears records",
    !!p.w.localStorage.getItem("xi.push.v1") && p.w.localStorage.getItem("xi.season.v1") === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
