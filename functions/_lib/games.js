/* The family, as the server understands it.
 *
 * WHY THIS FILE EXISTS. "One value living in two places and drifting apart" is
 * the fault this project keeps paying for: the entrant key computed in four
 * places, the help cost stated four ways, a palette declared twice, the build
 * tag known to three regexes that disagreed about letters. A second game is
 * exactly the moment a third copy of "what games are there" would appear — one
 * in migrate, one in results, one in whatever reads them next.
 *
 * So: the list of games, and the rule for what makes a row unique, live here
 * and nowhere else. Game three adds a line to GAMES and composes a key; it
 * does not touch the schema and it does not touch an endpoint.
 */

/* Released games only. An id here is a value that can reach the database, so
   an unreleased game must not appear — the same rule the hub and live_check
   already keep about naming unbuilt games. */
import { dailyKey, dailyDayKey, dailyNoForDay } from "./daily.js";

/* crossword_fr is the Friends crossword, the first game of the second theme.
   Its ID is not its directory: it LIVES at friends/crossword, and
   permalink.js owns that half.

   whoami_fr is the second, at friends/whoami. Its id could not be `whoami`
   because football holds that one and an id maps to exactly one theme; the
   SLUG is `whoami`, so the address still reads /friends/whoami/. Both are
   UNLISTED: live, banked, streaked, and advertised nowhere. */
export const GAMES = ["crossword", "wordsearch", "scrambled", "hilo", "vowels", "grid", "quickfire", "codeword", "whoami", "ballpark", "crossword_fr", "whoami_fr"];

export const DEFAULT_GAME = "crossword";

/* ---- WHEN EACH GAME LAUNCHED, and it is one fact in one place -----------
 *
 * WHY IT HAD TO BE WRITTEN DOWN. Three separate pages were reasoning about
 * "before this game existed" and none of them could ask anything:
 *
 *   - the word search's "previous puzzles" list offered 238 boards from
 *     before the game was built, because ws_schedule was pre-filled with two
 *     years of inventory from 1 January 2026 and the query read every day
 *     before today as a day the game had run;
 *   - its ANSWERS pages published 233 boards on the same reasoning, and 233
 *     of those are scheduled to run in the FUTURE — full placements and the
 *     secret bonus word, for boards nobody has played yet;
 *   - every game's archive index and the sitemap listed boards from 1 to
 *     today, which for Vowels (launched on the 4th) is ten boards from days
 *     the game did not exist.
 *
 * A SCHEDULE CANNOT ANSWER IT. For HiLo the schedule does begin on the launch
 * day, so it looks like it could — but the word search's begins eight months
 * early and the three ring games have no schedule at all. It is a fact about
 * the GAME, not about its storage, so it lives here beside the family list.
 *
 * The day a game first served its daily, UTC, as YYYY-MM-DD. Null means not
 * launched: a game can have boards and no page, and the day it launches is the
 * day its date is written here — the same edit that puts it in GAMES, and the
 * importer reads it rather than being told twice.
 * IT USED TO NAME THE TWO GAMES IN THAT STATE, "QuickFire and Grid XI". Grid
 * launched on 7 September 2026 and the line went stale the same day. A comment
 * listing WHICH games are in a state is a second copy of what the table below
 * already says, and it drifts every time one ships — the same fault the content
 * banks are being audited for this week. The rule is stated instead; the list
 * is the data. */
export const LAUNCHED = {
  crossword: "2026-09-18",    // day one of the family, the epoch reset
  wordsearch: "2026-09-18",   // the day after; board #2
  scrambled: "2026-09-18",    // "takes the number 3 shirt: released"; board #7
  hilo: "2026-09-18",         // and hl_schedule's own first day agrees
  vowels: "2026-09-18",       // the fifth shirt; board #10
  /* QUICKFIRE WENT LIVE ON 14 SEPTEMBER 2026 AND BANKED NOTHING FOR HOURS.
     It was serving boards while absent from GAMES, so entryKey() returned null
     for it and every result a player produced was computed, returned and
     silently dropped — the client believing it had banked. That is the
     Scrambled fault this file already carries a comment about, arriving in a
     second game: "no key, no row", and nobody finds out.
     The date is the day it started serving, not the day this line was written,
     because LAUNCHED is what every list counts from and a later date would
     hide the boards it has already run. */
  quickfire: "2026-09-18",
  /* Who Am I XI. Its first BOARD is 15 September, which is also the day it
     launched — unlike Codeword and QuickFire, whose boards began a day before
     they were released. The two questions are different and happen to agree. */
  whoami: "2026-09-18",
  /* THE DAY IT STARTED SERVING, AND IT IS THREE WEEKS BEFORE THE DAY THIS LINE
     WAS WRITTEN. Ballpark XI was reachable at its own address, with a working
     API and a calendar running from 26 August, from before 8 September — ten
     rounds were played on it. It simply held no shirt and nothing linked to it.
     The rule this file already states is that LAUNCHED is when a game began
     serving and not when the line was added, "because a later date hides boards
     already run". Dating this 16 September would have hidden twenty-one days
     that genuinely served, and made board one a board that is the family's
     twenty-second. The owner chose the honest date on 16 Sep 2026.
     The consequence is deliberate and worth naming: the archive publishes those
     twenty-one days from the moment this ships. They were reviewed against the
     current gate before it did — 242 question rows over bp-0001..bp-0022, 231
     still in the bank and all 231 passing, the other 11 carrying a known and
     documented ambiguity about manager appointments rather than an error. */
  ballpark: "2026-09-18",
  /* The second theme opens. Its PUBLIC board numbers start at
     launchNumber("crossword_fr") rather than at 1 — boardKeys advertises
     launchNumber..today for every game, which is why Vowels launched on board
     ten. functions/_lib/fr-board.js converts between that and the bank row. */
  crossword_fr: "2026-09-21",
  /* Who Am I XI: Friends, 22 September 2026. Its calendar was dealt FROM this
     day rather than from the day the deck was imported -- the generator refuses
     to guess a start date, which is what stops this becoming Grid XI's
     placeholder calendar, still open in CLAUDE.md because its schedule starts
     on an import date and has to be re-dealt at launch. */
  whoami_fr: "2026-09-22",
  /* Codeword XI took the seventh shirt on 14 September 2026 — the next free
     number, which is what launching does. Its queue starts the same day, so
     the launch day and board one are the same day and nothing counts from
     before the game existed. */
  codeword: "2026-09-18",
  grid: "2026-09-18",       // the sixth shirt; board #13
};

/* ---- WHICH LAUNCHED GAMES ARE NOT ADVERTISED ------------------------------
 *
 * A game listed here is LIVE — it has a launch date, it serves boards, its
 * results bank, its streak counts — and the site does not tell anybody it
 * exists. No sitemap entry, none of its board URLs advertised, no name on the
 * team sheet, and the noindex stays on its page. Anybody holding the address
 * can play it; nobody arrives by accident.
 *
 * WHY THIS IS A NAMED FACT AND NOT FOUR WITHHELD EDITS. Launching is five
 * things that move together, and every gate in this repository treats them
 * that way deliberately: half-launched is the state nobody notices. Shipping
 * an unlisted game by simply not making four of the five edits produces
 * precisely that half-launched tree — and it is then indistinguishable from
 * somebody having forgotten, which is how a noindex outlives a launch and a
 * live game never appears in a search result. This project has the mirror of
 * that fault written down in three places already.
 *
 * So the gates key their visibility expectations off THIS rather than off
 * LAUNCHED, and they still refuse drift in every direction: an unlisted game
 * that turns up in the sitemap fails, and a listed one that keeps its noindex
 * fails. Nothing is loosened; one more state is described.
 *
 * REMOVING A LINE HERE IS THE PUBLICATION, and that is the whole act. Delete
 * the entry and the sitemap, the team sheet and the page's robots meta all
 * follow from one edit, because each of them asks here rather than holding its
 * own copy of the answer.
 *
 * Owner's call, 21 September 2026: Crossword XI: Friends launches today and is
 * not to be publicly visible yet. */
/* ---- WHICH GAMES ARE NOT IN THE SEASON -------------------------------------
 *
 * The season counts DAYS across the family, and a game in it writes a record
 * every day it is played. The Friends crossword is not in it: the owner's
 * ruling is a genuine streak, +1 a day, and no season at all.
 *
 * NAMED HERE BECAUSE TWO CONTRACTS DISAGREED WITHOUT IT. tools/aligned_test.mjs
 * requires every game that posts plays to load shared/xi-season.js beside it --
 * a good rule, and the reason it exists is that a game posting plays with no
 * season silently drops them from the device's record. friends/crossword's own
 * gate requires the opposite, because loading that file would give the game a
 * record it must not write. Both were right and neither could pass, which is
 * what an unstated exception looks like from the inside.
 * So the exception is stated, once, and both gates ask it. */
export const NO_SEASON = {
  crossword_fr: true,
  /* The same exception for the same reason, and it is checked rather than
     assumed: tools/build_friendswhoami.js drops the season script on the way
     through, so friends/whoami/index.html loads no xi-season.js at all. A game
     that posts plays with no season silently drops them from the device's
     record -- which is the fault aligned_test's rule exists to catch, and why
     an exception to it has to be STATED here rather than merely true. */
  whoami_fr: true,
};

export const inSeason = (game) => !NO_SEASON[game];

export const UNLISTED = {
  crossword_fr: true,
  /* THE SECOND ONE, AND THE OWNER'S STANDING INSTRUCTION FOR THIS THEME: live,
     but no public way in. Deleting a line here is the publication, and it turns
     the tree red in three places at once so nothing is left half-done. */
  whoami_fr: true,
};

/* Launched AND advertised, which is the question every list on the site is
   actually asking. One function, because two lookups joined at each call site
   is how the answers drift apart. */
export const isListed = (game) => !!LAUNCHED[game] && !UNLISTED[game];

/* ---- WHICH GAMES SHARE AN ENGINE -----------------------------------------
 *
 * Vowels XI is Scrambled XI's board read half a turn round: the same bank, the
 * same eleven names, the same server routes under /api/scrambled/. Its plays
 * are its own — `game` is "vowels" in every row — and that is the trap this
 * constant exists for. /api/scrambled/finish wrote
 *
 *     UPDATE plays SET srv_score = ... WHERE play_id = ? AND game = 'scrambled'
 *
 * which matched nothing for a Vowels play, so NO Vowels finish was ever
 * verified — 20 plays, 0 scored, on production on 6 September 2026 — while
 * the endpoint answered `verified: true` and the page believed it. A game
 * with no verified score cannot have a season row it can prove, cannot show a
 * verified badge, and cannot join a challenge table, which is what turned it
 * up: the owner asked for challenges in every game.
 *
 * Named here rather than in the endpoint so the next route that scopes by game
 * has one place to ask, and so the day a third game reads the same bank there
 * is one line to change. */
export const ENGINE_GAMES = {
  scrambled: ["scrambled", "vowels"],
  crossword: ["crossword"],
  wordsearch: ["wordsearch"],
  hilo: ["hilo"],
  grid: ["grid"],
  quickfire: ["quickfire"],
  whoami: ["whoami"],
  ballpark: ["ballpark"],
};

/* The launch as a board NUMBER, which is what every list is counted in.
   Null for a game that has not launched, so a caller cannot quietly treat
   "not launched" as "launched on day one" — which is exactly the reading
   that put ten boards Vowels never had on its archive page. */
export function launchNumber(game) {
  const day = LAUNCHED[game];
  return day ? dailyNoForDay(day) : null;
}

/* Anything not on the list is refused rather than coerced. A typo that becomes
   a silently-accepted game id is a row nobody will ever read again. */
export function validGame(v) {
  const g = String(v || DEFAULT_GAME).toLowerCase();
  return GAMES.indexOf(g) === -1 ? null : g;
}

/* BUILT, which is a different question from RELEASED.
   GAMES above is "whose rows the account system may write" — results, board
   state, entry keys — and an unreleased game must not be on it, because a row
   written for a game nobody can play is a row nobody will ever read.

   Reporting bad content is not that. A game can be PLAYABLE in the repo before
   it is launched — /football/scrambled/ and /football/quickfire/ both are — and the whole point
   of reporting is to hear about wrong content BEFORE anyone else sees it. A
   built game that cannot be reported is the one stage where reports are most
   useful and least available.

   Derived from GAMES rather than restated, so the released set is written
   once. A game leaves this list only by being deleted.

   Deduped, and that is not decoration. Scrambled was named here while it was
   unreleased, then joined GAMES, and the hand-written half stayed — so BUILT
   held it twice. indexOf did not care, which is why it survived; anything
   that iterates does, and the tracking gate reported the same game twice the
   first time it ran. A game promoted into GAMES should stop being named here
   by hand, and the Set means forgetting costs nothing.

   Grid XI joined on 6 September 2026, at the same stage QuickFire is at: a
   board is playable and judged, and there is no page yet. It is here and NOT
   in GAMES for exactly the reason above — no result row may be written for it
   until it launches — and it needs to be here for the one thing that matters
   before a launch: a play_id, so a round has an owner the server can hang
   turns and misses off. See data/migrations/033-grid.sql. */
export const BUILT = [...new Set([...GAMES, "quickfire", "grid", "whoami"])];

export function validReportGame(v) {
  const g = String(v || DEFAULT_GAME).toLowerCase();
  return BUILT.indexOf(g) === -1 ? null : g;
}

/* COUNTING IS THE SAME CASE AS REPORTING, for the same reason.
 *
 * plays is an anonymous counter — a random id per attempt, no account, no row
 * anyone owns — so the objection that keeps an unreleased game out of GAMES
 * does not apply to it. There is no result to orphan and no history to
 * confuse. What there is, is the one window where the number matters most:
 * a game being played by a handful of people before launch is exactly when
 * "how many opened it and how many finished" decides whether it ships.
 *
 * QuickFire was built, playable and completely uncounted, because the only
 * allowlist available said "released". Derived from BUILT rather than
 * restated, so a fourth game joins by being built, not by being remembered
 * here a second time. */
export function validPlayGame(v) {
  const g = String(v || DEFAULT_GAME).toLowerCase();
  return BUILT.indexOf(g) === -1 ? null : g;
}

/* THE MODES A PLAY CAN BE IN, across the whole family.
 *
 * Kept beside the games for the reason the file exists: play.js decided this
 * inline with a chain of ternaries, and the chain ended in "everything else
 * is daily". A word search free board was daily. A QuickFire challenge would
 * have been daily. The mislabel is invisible in the data — the row looks
 * perfectly ordinary — which is exactly what makes it expensive.
 *
 *   daily      the board of the day, one attempt, the run at stake
 *   practice   the crossword's unnumbered boards
 *   theme      a themed crossword, the kind passed between friends
 *   free       a board chosen rather than served: a word search from the
 *              archive or the week, a Scrambled final out of the catalogue.
 *              No run at stake, which is the whole of what it means.
 *   weekly     QuickFire's Last 7 Days board, which is not a daily
 *   challenge  a QuickFire run from a shared link, of either board
 */
export const MODES = ["daily", "practice", "theme", "free", "weekly", "challenge"];

export function validMode(v) {
  const m = String(v || "daily").toLowerCase();
  return MODES.indexOf(m) === -1 ? null : m;
}

/* THE CAMPAIGN THE RENDER GATE TAGS ITSELF WITH.
 *
 * render_test.mjs opens the live daily at sixteen viewports a run and finishes
 * none of them, so its rows read as a broken daily unless something tells them
 * apart. It already appends ?r=gate for that reason — the comment there
 * records a run landing as "49 daily plays with zero completions on a day the
 * daily had one genuine player".
 *
 * The tag was added and nothing read it. On 21 Sep 2026 one run was 13 of the
 * day's 21 apparent plays, still counted as visitors, which is precisely the
 * state the tag was introduced to prevent — a marker written by one side and
 * never consulted by the other is not a marker.
 *
 * It lives here so the writer and the readers share one string. Neither
 * by_owner nor by_bot can stand in for it: the gate is not signed in, so the
 * session says nothing, and it is not the play bot either. */
export const GATE_CAMPAIGN = "gate";

/* WHAT THE OWNER'S FUNNEL CALLS EACH GAME.
 *
 * xi-chrome.js already holds a squad list with these names in it, and a second
 * list of names is exactly the fault this file exists to prevent — so it is
 * worth saying why this is not that. The squad is the PUBLIC list: it is
 * ordered by shirt number, it carries unreleased games as a status with no
 * name, and it must never name a game that has not launched. The funnel is the
 * opposite on the one point that matters: an unreleased game is precisely the
 * one whose numbers are being watched, so it has to be named here to be picked
 * from a menu. The two lists disagree on purpose and cannot be merged.
 *
 * The drift this replaces was real and one-directional: the selector in the
 * admin panel was typed into crossword/index.html by hand, so it listed three
 * games while the server counted five. Nothing was broken and nothing showed
 * an error — QuickFire and HiLo simply could not be looked at.
 */
/* ---- WHICH GAMES HAVE AN ANSWERS PAGE, and it is one fact in one place ----
 *
 * THE ABSENCES ARE DECISIONS, NOT GAPS. A codeword's solution IS its grid;
 * QuickFire's answers are the three options you did not pick; and Who Am I's
 * would publish ten doors nobody else has opened yet — that last one actively
 * spoils a board still being played.
 *
 * shared/xi-chrome.js already knew this for the FOOTER, where an absent Answers
 * entry is deliberate and commented as such. The archive page did not, and
 * rendered an Answers button for every game unconditionally — so all three of
 * those games linked to a 404 from their own archive. Two places reasoning
 * about one fact and only one of them told.
 *
 * This is the server's copy; the client's is in xi-chrome.js GAME_PAGES. If a
 * game gains or loses an answers page, both change. */
export const HAS_ANSWERS = new Set([
  "crossword", "wordsearch", "scrambled", "hilo", "vowels", "grid"
]);

export const LABELS = {
  crossword: "Crossword XI",
  /* The theme is IN the name here, unlike the football games, because this
     one shares a game with football and the two appear together in a footer
     and in search results. "Crossword XI" twice would be two links a reader
     cannot tell apart. */
  crossword_fr: "Crossword XI: Friends",
  /* The theme is IN the name for the same reason crossword_fr's is: this game
     shares its title with football's and the two would otherwise be two links a
     reader cannot tell apart. */
  whoami_fr: "Who Am I XI: Friends",
  wordsearch: "Wordsearch XI",
  scrambled: "Scrambled XI",
  vowels: "Vowels XI",
  quickfire: "QuickFire XI",
  whoami: "Who Am I XI",
  ballpark: "Ballpark XI",
  codeword: "Codeword XI",
  hilo: "HiLo XI",
  /* Grid XI is in BUILT and not GAMES, like QuickFire — and it needs a label
     for a reason beyond the report menu. chrome_test derives the names that
     must appear in no served markup from BUILT minus GAMES, and a game with no
     label falls back to its ID: "grid", which matches every CSS grid rule on
     every page. A bare word is not a name, and a guard that cannot tell them
     apart refuses correct markup. */
  grid: "Grid XI",
};

/* The games the funnel can report on, named, for the panel to build itself
   from. BUILT rather than GAMES, for the reason validPlayGame gives. A game
   with no label is still listed, under its id: an unnamed game in the menu is
   a smaller fault than a game missing from it. */
export function reportableGames() {
  return BUILT.map((id) => ({ id, label: LABELS[id] || id }));
}

/* THE ONE KEY. What makes a result unique for a player, per game.
 *
 *   crossword    daily:2            the daily number, as it always was
 *   wordsearch   ws:2026-08-27      the server's UTC day
 *
 * Returns null when the row carries nothing to be unique by — the caller skips
 * it rather than inserting a row that will be inserted again tomorrow. That is
 * why practice boards were never migrated: no key, no row.
 */
export function entryKey(game, row) {
  if (game === "crossword") {
    const n = Number(row && row.dailyNo);
    return Number.isFinite(n) && n > 0 ? dailyKey(Math.floor(n)) : null;
  }
  /* THE FRIENDS CROSSWORD. A prefix of its own, never a column — the rule this
     file states for every new game. Its board number is the FAMILY's daily
     number, the same quantity the football crossword's `daily:N` carries, so the
     derivation is identical and only the prefix differs. Two games under one
     prefix would file two different boards under one key, and the second would
     read as a board already played — the fault Vowels and Scrambled were given
     separate prefixes to avoid. */
  if (game === "crossword_fr") {
    const n = Number(row && (row.no != null ? row.no : row.dailyNo));
    return Number.isFinite(n) && n > 0 ? "fr:" + Math.floor(n) : null;
  }
  if (game === "wordsearch") {
    /* The day the board was the daily, not the day it was played: a board
       finished after midnight under the grace rule still belongs to its own
       day, and must not become a second row. */
    const d = String((row && (row.day || row.date)) || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? "ws:" + d : null;
  }
  if (game === "scrambled" || game === "vowels") {
    /* THE THIRD GAME HAD NO KEY, so every Scrambled result pushed to an
       account was skipped by migrate.js and the client believed it had
       pushed. A board is addressed by its number in the daily ring.
       VOWELS IS THE SAME RING AND A DIFFERENT ELEVEN. Its cypher reads the
       ring half a turn round, so board 7 of one game is not board 7 of the
       other — one prefix over both would file two boards under one key and
       the second would look like a board already played. One derivation,
       because the derivation IS the same; two prefixes, because the boards
       are not. */
    const n = Number(row && row.no);
    if (!Number.isFinite(n) || n <= 0) return null;
    return (game === "vowels" ? "vw:" : "sc:") + Math.floor(n);
  }
  if (game === "quickfire") {
    /* A QuickFire daily is addressed by its play date — qf_daily is keyed on
       play_date and a board is served on that date and not before — so the key
       is the day, like the word search's and HiLo's.
       THE KEY IS ABOUT IDENTITY, NOT CONTENT, which is why this branch could be
       written before the game's result SHAPE is settled. QuickFire is moving
       from a typing game to four options and what a result CONTAINS will change
       with it; what makes a result UNIQUE for a player will not. That
       separation is the whole reason the banking could land without waiting for
       the rewrite, and every hour it waited was results lost rather than
       results wrongly shaped. */
    const d = String((row && (row.day || row.date || row.play_date)) || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? "qf:" + d : null;
  }
  if (game === "grid") {
    /* A Grid daily is addressed by its NUMBER, not its day, and that is the one
       thing about it that differs from the three date-keyed games around it:
       gd_schedule names one board per day, the payload carries that board's
       number, and both the page's own record and the hub's table judge it by
       `no`. Keying on the day here would produce a key nothing else in the game
       agrees with.
       THIS BRANCH WAS MISSING TOO, and Grid has been live since 7 September —
       eight days of results computed, returned and dropped. Found while adding
       Codeword's, by executing entryKey for every game in GAMES rather than for
       the one that was reported: the fourth occurrence of this fault was
       sitting beside the third, and nothing would have reported it. */
    const n = Number(row && row.no);
    return Number.isFinite(n) && n > 0 ? "gd:" + Math.floor(n) : null;
  }
  if (game === "codeword") {
    /* A Codeword daily is addressed by its day, like the word search's, HiLo's
       and QuickFire's: cw_schedule hands one board to one day.
       THERE WAS NO BRANCH HERE AT ALL and the game was live for a day without
       one. It sits in GAMES, in BUILT, and LAUNCHED reads 2026-09-14 — every
       sign of an integrated game except the one that writes a row — so
       entryKey() fell through to the closing `return null` and every result was
       computed, returned to the page, and dropped. Six rounds were played and
       nothing was banked. THE THIRD TIME: the comments above record Scrambled
       and QuickFire, and the shape is identical each time — no key, no row, and
       nobody finds out, because the page has no way to know its result was
       discarded and the endpoint's own response was correct.
       THE DAY AND NOT THE NUMBER, deliberately. Codeword has two numberings —
       its own 1..365 counted from its epoch, and the family board number every
       address uses — and they differ by nineteen. A key built on "the number"
       would be built on whichever one happened to arrive. A day means one
       thing. */
    const d = String((row && (row.day || row.date)) || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? "cw:" + d : null;
  }
  if (game === "whoami") {
    /* A Who Am I daily is addressed by its day: wa_board is keyed on play_date
       and a board is served on that date and not before.
       ONE RESULT A DAY, NOT ELEVEN, AND THE DOOR IS NOT IN THE KEY. A board is
       eleven doors and a person plays exactly one of them — the other ten stay
       live for everybody else — so the DAY is what makes a result unique for a
       player. Keying on the door as well would let one person bank eleven rows
       for a day that has one, and the first-banked-wins merge rule would then
       be deciding between rows that are all theirs.
       The owner's exception of 11 Sep 2026 is the sentence behind that: this
       game's eleven are the CLUBS rather than the answers. It is written here
       rather than left as a precedent, so the next game citing it cites a rule. */
    const d = String((row && (row.day || row.date || row.play_date)) || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? "wa:" + d : null;
  }
  if (game === "whoami_fr") {
    /* ITS OWN PREFIX, NEVER A COLUMN -- the rule this file states for every new
       game. Keyed on the DAY for exactly football's reason: a board is several
       doors and a person plays one of them, the others staying live for
       everybody else, so the day is what makes a result unique for a player.
       A PREFIX OF ITS OWN IS NOT COSMETIC HERE. Both decks key on a day, and
       both run on the same days -- so sharing "wa:" would file a Friends result
       and a football result for one Tuesday under one key, and the
       first-banked-wins merge rule would silently throw the second away. That
       is the collision Vowels and Scrambled were given separate prefixes to
       avoid, and this pair would hit it on day one rather than eventually. */
    const d = String((row && (row.day || row.date || row.play_date)) || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? "frwa:" + d : null;
  }
  if (game === "ballpark") {
    /* A Ballpark daily is addressed by its DAY. bp_schedule hands one board to
       one day, exactly as cw_schedule and wa_board do, and the board carries a
       family number that is a second name for the same thing — so the day is
       the one that means one thing, for the reason written against Codeword
       above.
       THIS IS THE FIFTH GAME TO NEED THIS BRANCH AND THE FIRST TO GET IT BEFORE
       IT COST ANYTHING. Scrambled, QuickFire, Grid and Codeword each launched
       without one: results were computed, returned to the page and dropped,
       silently, because a null key and a successful round are indistinguishable
       from outside. Grid lost eight days and Codeword six rounds.
       Ballpark reached this point differently — it was never in GAMES, so
       validGame() refused it upstream and nothing could have banked whatever
       this returned. Its ten pre-launch rounds are not recoverable and were
       never meant to be: the game was documented as not banking while in
       testing, and it was. What makes today different is that it is in GAMES
       now, so this branch is load-bearing from the moment it ships. */
    const d = String((row && (row.day || row.date)) || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? "bp:" + d : null;
  }
  if (game === "hilo") {
    /* A HiLo daily is addressed by its day, like the word search's: the
       calendar hands a board to a day, and a club board or a past daily
       played as free play carries no day and banks no row. */
    const d = String((row && (row.day || row.date)) || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? "hl:" + d : null;
  }
  return null;
}

/* THE DAY THE ROW BELONGS TO, for the shared `played_on` column.
 *
 * The crossword's browser record calls it `date`; the word search's calls it
 * `day`. migrate.js read only `date`, so every word search row landed with
 * played_on NULL — and results.js orders by that column, so an entire game's
 * history sorted as null. Read here, once, for the same reason the key is:
 * a field name that differs per game must be reconciled in one place or it is
 * reconciled in several and one of them is forgotten. It was.
 */
export function playedOn(game, row) {
  const d = String((row && (row.date || row.day)) || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  /* A numbered board carries no date of its own; its day is its number's,
     from the one epoch. Scrambled's ring counts by the same daily number.
     GRID BELONGS HERE AND WAS NOT IN IT. Its page records { no, title, score,
     solved, misses, hints, at } — no day and no date — so this returned null
     for every Grid result, and results.js ORDERS BY played_on. An entire
     game's history sorting as null is the word search's fault of 6 September,
     which is written up eight lines above this one; Grid reproduced it and the
     comment did not stop it.
     SAFE BECAUSE GRID'S `no` IS THE FAMILY NUMBER, verified against the live
     endpoint rather than assumed: /api/grid/daily answers { no: 21, day:
     "2026-09-15" }, and 21 is the family number for that day. If it ever became
     Grid's own ordinal this would silently date every row wrong — which is why
     the check in aligned_test runs each game's REAL recorded row rather than a
     fixture carrying every field. */
  /* crossword_fr BELONGS HERE for the same reason Grid does: its board number is
     the family's daily number, so the number dates the row. Its client records
     no date of its own, and results.js ORDERS BY played_on — a game whose whole
     history sorts as null is the word search's fault of 6 September, and Grid's
     repeat of it. */
  if (game === "scrambled" || game === "vowels" || game === "grid" ||
      game === "crossword_fr") {
    return dailyDayKey(row && row.no);
  }
  return null;
}

/* The fields a game keeps that the others have no column for. The shared
   columns — score, elapsed_seconds, played_on, solved — stay shared; this is
   everything else, and it goes to `detail` as JSON.

   Adding a column per game per fact is the duplication fault written into the
   schema, where it is far more expensive to undo than in a file. */
export function detailOf(game, row) {
  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? Math.min(Math.floor(x), 1e6) : 0;
  };
  if (game === "hilo") {
    /* What a HiLo result keeps: the board, the calls right and wrong, the
       run bonus and the result letter. Score and elapsed are shared columns. */
    return JSON.stringify({
      boardId: row.boardId == null ? null : String(row.boardId).slice(0, 40),
      right: n(row.right), wrong: n(row.wrong), bonus: n(row.bonus),
      result: ["W", "D", "L"].includes(row.result) ? row.result : null,
    });
  }
  if (game === "scrambled" || game === "vowels") {
    /* What a Scrambled result keeps beyond the shared columns: the help
       bought, the names revealed outright, and the board's title so a row
       reads as a board rather than a number. Vowels XI is the same engine
       with the other cypher, so it keeps the same three. */
    return JSON.stringify({
      help: n(row.help),
      revealed: n(row.revealed),
      title: row.title == null ? null : String(row.title).slice(0, 80),
    });
  }
  if (game === "ballpark") {
    /* WHAT A BALLPARK RESULT KEEPS, and the reason it must keep anything:
       until 16 Sep 2026 this function returned null for it, so a signed-in
       round banked a score of 48 and nothing else. A score is not recoverable
       into a round — nobody can work out from 48 how many guesses landed in
       the ballpark or how many were exact — so a fact not written on the day
       is gone for everyone, for ever. That asymmetry is why this went in
       ahead of the season, which IS recomputable from rows that exist.
       The page already sends all of it. Nothing here asked the browser for a
       single new field; these were arriving and being dropped on the floor at
       the last step. */
    /* THE ELEVEN AS ASKED, and the reason the payload is small: Ballpark's
       boards name their questions by id, so the question, the answer, the
       slider and the tolerance are all reachable from the id and none of them
       is repeated here. Id, guess, grade.
       THE GRADE IS STORED AS AWARDED rather than recomputed from the guess and
       the tolerance, which is the point of keeping it at all: it is what the
       player WAS TOLD. A recomputation a year from now is a statement about
       that day's tolerances, not about the round. This repo spent a week
       proving that a value re-derived from current data is where things go
       wrong — the freeze protects the board, and nothing protects a number
       nobody wrote down.
       Bounded on every axis, because this is the first field a page sends that
       is a LIST: at most the eleven, ids clipped, guesses coerced, grades
       clipped. An unbounded array from a browser is a column somebody can make
       any size they like. */
    const asked = Array.isArray(row.asked) ? row.asked.slice(0, 11) : null;
    return JSON.stringify({
      boardNo: row.no == null ? null : n(row.no),
      result: ["W", "D", "L"].includes(row.result) ? row.result : null,
      inBallpark: n(row.inBallpark),
      bangOns: n(row.bangOns),
      asked: asked && asked.map((a) => ({
        id: a && a.id != null ? String(a.id).slice(0, 40) : null,
        guess: a && Number.isFinite(Number(a.guess)) ? Number(a.guess) : null,
        grade: a && a.grade != null ? String(a.grade).slice(0, 24) : null,
      })),
    });
  }
  if (game === "quickfire") {
    /* The same, and it arrived the same way: the page has always sent right,
       wrong and the board id, and all three were discarded here.
       `subs` is NOT in this object. It has a column — substitutions — and a
       fact with a column does not also go in detail; see migrate.js, where
       the column was reading a spelling no page writes. */
    return JSON.stringify({
      boardId: row.boardId == null ? null : String(row.boardId).slice(0, 40),
      boardNo: row.no == null ? null : n(row.no),
      right: n(row.right),
      wrong: n(row.wrong),
    });
  }
  if (game !== "wordsearch") return null;
  const pick = (a, b) => {
    const v = a === undefined || a === null ? b : a;
    return v === undefined || v === null ? null : String(v).slice(0, 40);
  };
  return JSON.stringify({
    foundCount: n(row.foundCount != null ? row.foundCount : row.found_count),
    bonusFound: !!(row.bonusFound != null ? row.bonusFound : row.bonus_found),
    minute: n(row.minute),
    /* Both spellings, like the fields above it. The browser writes snake_case
       and an earlier build of this file read only camelCase, which is how
       puzzleId arrived null on every row. */
    puzzleId: pick(row.puzzleId, row.puzzle_id),
    assisted: !!row.assisted,
  });
}
