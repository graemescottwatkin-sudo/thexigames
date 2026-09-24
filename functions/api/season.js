/* GET /api/season — the account's season, or nothing.
 *
 * ONE SEASON, AT THE TOP LEVEL. Not a game's: a game shows a live table for
 * the board being played, and the season belongs to the family. It counts
 * FINISHES rather than points, which is why it survives a theme that scores
 * out of something other than 114 — see _lib/season.js, which holds the rule
 * and knows nothing about a database.
 *
 * TWO BRANCHES, DECIDED BY WHETHER THERE IS AN ACCOUNT.
 *
 *   an account   this endpoint answers, from season_play, and the season
 *                follows the player to any device they sign in on
 *   no account   this endpoint says so, and the HUB computes the same rule
 *                over what the browser already holds
 *
 * A device code IS an account — /api/account/code turns one into a user with
 * provider = 'code' — so a player who linked two devices with the code is in
 * the first branch, and there is no third case to build.
 *
 * The server decides what day it is, in UTC, and says so in the answer: the
 * hub must not decide from a device clock which day is still in flight.
 */
import { utcDay } from "../_lib/daily.js";
import { season, NO_SEASON_YET } from "../_lib/season.js";
import { daysFor, seasonUser, hasDB, gamesFinishedOn, finishedDaysFor } from "../_lib/season-store.js";
import { csrfOk } from "../_lib/auth.js";
import { GAMES, LAUNCHED, inSeason } from "../_lib/games.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      /* Never stored: a season changes the moment a puzzle is finished, and a
         cached one would show a player yesterday's standing after they had
         just moved it. */
      "Cache-Control": "no-store",
    },
  });

export async function onRequestGet({ request, env }) {
  const today = utcDay();

  /* No database is not an error and not an empty season — it is a site that
     cannot answer, and the hub falls back to the device exactly as it does for
     a player with no account. Saying "no season" here would tell a signed-in
     player their record was gone. */
  if (!hasDB(env)) return json({ account: false, today, reason: "no-store" });

  const user = await seasonUser(request, env);
  if (!user) return json({ account: false, today, message: NO_SEASON_YET });

  const days = await daysFor(env, user);
  const s = season(days, today);
  /* WHICH GAMES THIS ACCOUNT FINISHED TODAY, by name. The hub lit its shirts
     from localStorage and so did every game's "you have played today" check —
     device-local by construction, so a player signed in on two devices saw a
     shirt on one and not the other, and could play today's board twice. The
     account knew; nothing asked it. Asked here because this endpoint already
     authenticates and already reads season_play, so it costs one more query
     and no new door. */
  const todayGames = await gamesFinishedOn(env, user, today);
  /* And the days behind it, so a game's landing can show a run that follows
     the player between devices. The RULE is not applied here — it is
     shared/xi-season.js streaks(), the same function the anonymous branch
     uses — because a streak computed one way on the server and another way in
     the browser is two answers to one question. */
  const dayGames = await finishedDaysFor(env, user);
  return json({
    account: true,
    today,
    /* The invitation travels with the answer rather than being rebuilt in the
       page, so the sentence and the condition that shows it cannot drift. */
    message: s.started ? null : NO_SEASON_YET,
    season: {
      played: s.played, won: s.won, drawn: s.drawn, lost: s.lost,
      points: s.points, marks: s.marks, started: s.started,
    },
    /* Every day with a completion in it, newest first, so the landing can
       count a run without asking for one. */
    dayGames,
    /* Today, as it stands. Shown as provisional and not counted: a loss can
       still become a draw before midnight. */
    inFlight: s.inFlight,
    /* Names, not a count: the caller is asking "which", and a number would
       send it back to localStorage to find out. */
    todayGames,
  });
}

/* POST /api/season  { days: [{ day, s: [games started], f: [games finished] }] }
 *
 * A GUEST'S SEASON JOINS THE ACCOUNT. Found on the Play build, 24 Sep 2026:
 * signed in, the crossword home read "Crossword streak: Not started" beside
 * "Your form: 1 day run", with yesterday's board played. The form comes from
 * results, which /api/account/migrate carries into the account at sign-in.
 * The streak comes from season_play, which only /api/play writes, and only
 * for a player who was ALREADY signed in. So everything played as a guest
 * stayed on the device, and the account's season started from nothing the
 * moment the player signed in: streak lost, W/D/L lost.
 *
 * What is sent is the device's own season record (shared/xi-season.js,
 * xi.season.v1), which is exactly what the guest's streak was counted from.
 * Its days were the server's: xi-plays.js writes them from /api/play's own
 * answer. It is sent back up by a browser, so it is checked here the way a
 * migrated result is: a real game that counts towards the season, launched
 * by that day, no day in the future and none beyond the device's own window.
 * Rows only ever gain: a start never removes a finish, and a day the account
 * already holds is topped up, not replaced.
 *
 * Deliberately NOT derived from migrated results: a result carries its BOARD's
 * day, so a past board played from the archive would be counted on the day it
 * was set rather than the day it was played, inventing days nobody played.
 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 200;                    // xi-season.js keeps 200 days on a device

export async function onRequestPost({ request, env }) {
  if (!csrfOk(request)) return json({ error: "Missing request header." }, 403);
  if (!hasDB(env)) return json({ error: "Accounts are not configured." }, 503);
  const user = await seasonUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Expected a JSON body." }, 400); }
  const list = Array.isArray(body && body.days) ? body.days.slice(0, MAX_DAYS) : [];
  const today = utcDay();
  let added = 0, skipped = 0;
  for (const d of list) {
    const day = d && typeof d === "object" ? String(d.day || "") : "";
    if (!DAY_RE.test(day) || day > today) { skipped++; continue; }
    const started = Array.isArray(d.s) ? d.s.map(String) : [];
    const finished = new Set(Array.isArray(d.f) ? d.f.map(String) : []);
    /* A finish implies a start, as on the device. */
    const games = [...new Set([...started, ...finished])].slice(0, GAMES.length);
    for (const game of games) {
      if (!GAMES.includes(game) || !inSeason(game) || !LAUNCHED[game] || LAUNCHED[game] > day) {
        skipped++; continue;
      }
      const done = finished.has(game) ? 1 : 0;
      await env.DB.prepare(
        `INSERT INTO season_play (user_id, day, game, started_at, finished_at)
              VALUES (?1, ?2, ?3, datetime('now'), CASE WHEN ?4 = 1 THEN datetime('now') ELSE NULL END)
         ON CONFLICT(user_id, day, game)
         DO UPDATE SET finished_at = COALESCE(season_play.finished_at, excluded.finished_at)`)
        .bind(String(user.id), day, game, done).run();
      added++;
    }
  }
  return json({ ok: true, added, skipped });
}
