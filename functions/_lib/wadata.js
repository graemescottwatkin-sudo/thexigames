/* functions/_lib/wadata.js — Who Am I XI's board, and what may leave the server.
 *
 * THE RULE THIS FILE EXISTS FOR. A board is eleven doors, each a club and the
 * year a player last left it. Behind each is one player, and only ONE door is
 * played per person per day — the other ten stay live for everybody else. So a
 * leak here does not spoil one answer, it spoils ten answers for every other
 * player that day. QuickFire leaked eleven answers to one person; this would
 * leak ten to all of them.
 *
 * AND THE CAREER IS THE ANSWER, not a hint that happens to be strong.
 * "Cobreloa, Udinese, Barcelona, Arsenal, Man United, Inter" is Sanchez to
 * anyone who can read. So the club history, the birthplace and the age are all
 * held back until a substitution has been charged for them, and the charging
 * happens on this side.
 *
 * WHAT MAY BE SENT FREELY, and it is worth being explicit because two of the
 * three look like leaks and are not:
 *
 *   - the eleven doors as club + leave year. That IS the board; it has to be
 *     visible to choose from.
 *   - the full name list, all 3,146 of them. It is the answer SPACE rather
 *     than an answer: the same list backs all 365 days, so holding it tells
 *     you nothing about today. Filtering it server-side per keystroke would
 *     be wrong on a type-ahead budget anyway.
 *   - the day's club COUNTS, unattributed. How many clubs each of today's
 *     players had, as a bare sorted list with nothing saying which door.
 *     Pooling the club NAMES instead was measured and rejected: it solves 23%
 *     of doors outright for anyone holding the name list.
 */

/* ---- the fold ---------------------------------------------------------- */

const FOLD_LETTERS = {
  "Ø": "O", "ø": "o",     // O-slash
  "Æ": "AE", "æ": "ae",   // ash
  "Œ": "OE", "œ": "oe",
  "Ð": "D", "ð": "d",     // eth
  "Þ": "TH", "þ": "th",   // thorn
  "ß": "ss",
  "Ł": "L", "ł": "l",     // L-stroke
  "Đ": "D", "đ": "d",
};

/* Written as escapes rather than as the characters themselves: the combining
   class in particular is invisible when typed literally, and a regex whose
   contents cannot be seen is one the next person breaks without noticing. */
const NON_DECOMPOSING = /[ØøÆæŒœÐðÞþßŁłĐđ]/g;
const COMBINING = /[̀-ͯ]/g;

/* WHAT A TYPED NAME REDUCES TO, AND IT IS STATED ONCE.
 *
 * The importer stores a key and the server matches a guess against it, so the
 * two halves must agree exactly — a name that imports under one spelling and is
 * guessed under another is a player nobody can ever name. That is why
 * tools/import_whoami.mjs IMPORTS this function rather than carrying its own
 * copy; it was written twice first, and the copies disagreed within the hour.
 *
 * STRIPPING ACCENTS IS NOT THE SAME AS FOLDING LETTERS, which is the bug that
 * made this worth a comment. NFD splits an accented letter into a base plus a
 * combining mark, so E-acute becomes E. But O-slash, ash, thorn, eth and
 * L-stroke are letters in their own right — NFD leaves them whole and the
 * [^A-Z0-9] sweep then DELETES them. MARTIN ODEGAARD folded to MARTINDEGAARD
 * with the O missing, and somebody typing his name correctly would have been
 * told they were wrong. Nine names in this bank carry one.
 */
export function fold(name) {
  return String(name == null ? "" : name)
    .replace(NON_DECOMPOSING, (c) => FOLD_LETTERS[c] || c)
    .normalize("NFD").replace(COMBINING, "")
    .toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* ---- the basics -------------------------------------------------------- */

export function hasDB(env) {
  return !!(env && env.DB);
}

/* TODAY IS THE FAMILY'S UTC DAY, imported rather than restated. QuickFire kept
   its own Europe/London clock and disagreed with every address on the site for
   an hour a night all summer: the API served board 21 and the URL for board 21
   answered 404. One clock. */
/* IMPORTED AS WELL AS RE-EXPORTED, and the difference took a live game down.
 * A bare `export { x } from "./y.js"` forwards the name to importers WITHOUT
 * binding it in this module's own scope — so every call to today() inside this
 * file threw "today is not defined", and the daily endpoint answered 500.
 *
 * QuickFire ran like that in production from the moment the clock fix shipped.
 * The fix was right and the spelling was not, and I wrote the identical line in
 * two files an hour apart, then wrote a COMMENT in a third file explaining the
 * trap after Codeword's suites caught it there — and still did not come back
 * and check these two. Knowing a fault by name does not stop you shipping it.
 *
 * WHY NOTHING CAUGHT IT: no suite executes getDaily/getBoard. The round suites
 * read this file as TEXT, and the journey suites stub the endpoint out
 * entirely, so the one function that calls today() was never run. A module that
 * fails on import-time linkage passes every check that never imports it. */
import { utcDay } from "./daily.js";
export const today = utcDay;

/* THE COLUMNS THAT ARE THE ANSWER. Named once so a check can assert against the
   list rather than restating it, the way qfdata's SECRET_FIELDS does.
   `clubs` and `club_history` are the career — the answer written out.
   `birth_place`, `birth_year` and `nationality` are the third clue.
   `name` and `id` are the answer itself. */
export const SECRET_FIELDS = [
  "name", "id", "full_name", "clubs", "club_history",
  "birth_year", "birth_place", "nationality", "position", "caps", "article",
];

export function noStore(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

/* ---- the board --------------------------------------------------------- */

/* ONE DOOR, AS A BROWSER MAY SEE IT. Slot, club, year. That is all there is,
   and the absence of anything else is the point rather than an omission —
   `player_id` is selected by the query that feeds this and dropped here, in one
   place, so a new caller cannot forget. */
export function publicDoor(row) {
  return {
    slot: Number(row.slot),
    club: row.club,
    leave: Number(row.leave_year),
  };
}

/* THE DAY'S BOARD. Doors, plus the unattributed club counts.
 *
 * THE COUNTS ARE SORTED, WHICH IS WHAT MAKES THEM SAFE. Returned in slot order
 * they would be attributed — count[3] would be door 3's player's career length,
 * which narrows eleven doors to the handful of players with that many clubs.
 * Sorted, they are a shape of the day and nothing more.
 */
/* HOW MANY CLUBS EACH OF TODAY'S PLAYERS HAD — ONE NUMBER PER PLAYER, NOT PER
 * DOOR, AND THIS IS THE SECOND VERSION.
 *
 * The first returned eleven numbers, one per door, sorted. Sorting them stopped
 * a number being attributed to a door, which was the leak I was aiming at — but
 * it left the GROUPING in plain sight, and the grouping is the more useful half.
 * "3, 3, 3, 6, 6, 6, 8, 10, 10, 10, 13" says three doors share a three-club
 * player, three share a six-club player, and so on: anybody holding the name
 * list can pair doors off each other before guessing anything.
 *
 * A player can hold several of today's doors — Distin left Manchester City in
 * 2007 and Everton in 2015 — so the doors are deduped to PLAYERS here. Eleven
 * doors typically come from five to seven players, and the list is that many
 * numbers. The multiplicities go with it, which is the point.
 *
 * WHAT IS STILL GIVEN AWAY, deliberately: how many distinct players are behind
 * today's board, and the shape of their careers. That is the panel's whole
 * purpose — "there is a one-club man and a journeyman in here today" — and it
 * attributes to nobody.
 *
 * The player ids never leave; they are read here and dropped. */
function careersOf(rows) {
  const byPlayer = new Map();
  for (const r of rows) {
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, Number(r.club_count) || 0);
  }
  return [...byPlayer.values()].sort((a, b) => a - b);
}

export async function getBoard(env, date) {
  const play = date || today();
  const { results } = await env.DB.prepare(`
    SELECT d.slot, d.club, d.leave_year, p.club_count, d.player_id
    FROM wa_board b
    JOIN wa_door d  ON d.play_date = b.play_date
    JOIN wa_player p ON p.id = d.player_id
    WHERE b.play_date = ?1
      AND b.status = 'published'
      AND p.status = 'verified'
    ORDER BY d.slot
  `).bind(play).all();

  const rows = results || [];
  /* FAIL CLOSED ON A SHORT BOARD. Ten doors is not a board with one missing,
     it is a board whose eleventh answer failed to resolve — and serving it
     would quietly retire a door for everybody who picked that club. */
  if (rows.length !== 11) return null;

  return {
    id: "XIWA-" + play.replace(/-/g, ""),
    date: play,
    doors: rows.map(publicDoor),
    careers: careersOf(rows),
  };
}

/* THE ANSWER BEHIND ONE DOOR, for this side only. Never called by anything that
   renders. */
export async function doorAnswer(env, date, slot) {
  const row = await env.DB.prepare(`
    SELECT d.slot, d.club, d.leave_year, p.*
    FROM wa_door d
    JOIN wa_player p ON p.id = d.player_id
    WHERE d.play_date = ? AND d.slot = ? AND p.status = 'verified'
  `).bind(String(date), Number(slot)).first();
  return row || null;
}

/* ---- the name list ------------------------------------------------------ */

/* THE ANSWER SPACE. Every verified player, name and folded key, which is what
   the page types against. It is the same list every day — that is precisely why
   it is safe to ship, and why it is cacheable when nothing else here is. */
export async function allNames(env) {
  const { results } = await env.DB
    .prepare("SELECT name, search_key FROM wa_player WHERE status = 'verified' ORDER BY name")
    .all();
  return (results || []).map((r) => [r.name, r.search_key]);
}

/* ---- the play adapter ----------------------------------------------------
 *
 * WHAT A GAME MUST ANSWER FOR wa-play.js TO RUN A SITTING, and these five are
 * the whole of it. wa-play.js held football's answers inline because there was
 * one Who Am I; a second deck hides a CARD and deals written clues, so the
 * answers differ while the sitting -- open a door, buy a rung, guess, finish --
 * does not.
 *
 * NOTHING BELOW IS NEW BEHAVIOUR. clueBody is wa-play.js's, moved here
 * unchanged, and the rest are the branches that surrounded its calls. This file
 * already owns every other projection of a football row -- publicDoor,
 * doorAnswer, playedFor -- so it is where they belong.
 */

/* WHAT A STAGE IS ALLOWED TO SAY, and nothing else leaves on its account.
 *
 * Built from the `reveals` names in the ladder rather than from a switch, so
 * adding a rung is a config change. The player row is the whole row -- it has
 * to be, to build any of this -- and this function is the only place that
 * decides which parts of it are allowed out.
 */
export function clueBody(row, reveals, door) {
  const out = {};
  for (const what of reveals) {
    if (what === "spell") {
      /* THE DOOR'S OWN SPELL, and only that one. A player with six clubs has
         six spells and five of them are the career by instalments. */
      let clubs = [];
      try { clubs = JSON.parse(row.clubs || "[]"); } catch (e) { clubs = []; }
      const want = fold(door.club);
      const spell = clubs.find((c) => fold(c.club) === want);
      out.spell = spell
        ? { club: door.club, from: spell.from, to: spell.to, apps: spell.apps, goals: spell.goals }
        : { club: door.club };
    } else if (what === "career") {
      /* THE CAREER AS SPELLS, NOT AS A SENTENCE. It went out as club_history --
         one pre-rendered string -- and the page printed it as a wall:
         "2017 Paris Saint-Germain B (8) - 2017-2019 Lille II (8) - ...". The
         SHAPE of a career is the puzzle, and a run-on line hides it: finding
         the one big club in there takes real effort and none at all in a list.
         Sending the spells costs nothing in secrecy -- it is the same
         information, which is why it is the same rung -- and it lets the page
         mark the door's own club IN PLACE, which is the thing a player is
         actually looking for. `mine` is computed here rather than on the page
         because the page folds names for a type-ahead and must not be the thing
         that decides which spell is the door's. */
      let spells = [];
      try { spells = JSON.parse(row.clubs || "[]") || []; } catch (e) { spells = []; }
      const want = fold(door.club);
      out.spells = spells.map((c) => ({
        club: c.club, from: c.from, to: c.to, apps: c.apps, goals: c.goals,
        loan: !!c.loan, mine: fold(c.club) === want,
      }));
      out.career = row.club_history || null;
      out.clubCount = Number(row.club_count) || 0;
    } else if (what === "bio") {
      /* THE BIRTH YEAR, AND NO AGE. THIS REVERSES AN EARLIER DECISION, so what
         that decision said is recorded rather than deleted: it sent the AGE and
         withheld the year, on the grounds that the year is the sharper clue,
         and it computed the age on the server precisely so the page could not
         be handed the year and asked not to look at it. That reasoning was
         sound, and the clue is now deliberately sharper at the same ten points.
         Owner's ruling, 21 September 2026. A reversed decision with its
         original reasoning left standing beside it is how the next person
         reverses it back.

         WHAT FORCED IT. The bank has no death field, so an age was this year
         minus the birth year whether or not the man was alive. It read "age 92"
         for Dave Mackay, who died in 2015, and "age 30" for Diogo Jota, who
         died in 2025 -- 109 deceased players in the bank, 75 of the 365 boards
         carrying at least one. Removing the age does not CORRECT that: it
         removes the arithmetic that produced it, so no later edit can bring it
         back by forgetting that deceased players are a case.

         A YEAR, NOT A DATE. wa_player holds birth_year and there is no birth
         date in the bank, which is why the ladder says "year of birth" and must
         not say D.O.B. -- a label promising a date is one somebody eventually
         satisfies by inventing a 1 January. */
      out.birthYear = Number(row.birth_year) || null;
      out.nationality = row.nationality || null;
      out.position = row.position || null;
    } else if (what === "answer") {
      out.answer = row.name;
      out.career = row.club_history || null;
      out.article = row.article || null;
    }
  }
  return out;
}

/* WHAT A BOUGHT RUNG SAYS. The ladder row is passed whole rather than its
   `reveals` alone, because the other deck reads a different field off it -- its
   rungs are clue ONE, TWO and THREE of a round and it needs the number. */
export async function reveal(env, door, stage) {
  return clueBody(door, stage.reveals || [], door);
}

/* WHETHER A NAME IS THE ANSWER, and if not, whether it is the near miss.
   `key` arrives folded, by the caller, with the same fold the bank stored --
   one folding, not two agreeing. */
export async function judge(env, door, key) {
  if (key === fold(door.name)) return { solved: true, verdict: "right" };
  const alsoPlayedThere = await playedFor(env, key, door.club);
  return { solved: false, verdict: alsoPlayedThere ? "right-club" : "wrong" };
}

/* WHAT A SOLVED OR ABANDONED DOOR SAYS. Exactly what clueBody(["answer"])
   produced when this was inline, which is what makes the move a move. */
export function solveBody(door) {
  return { answer: door.name, career: door.club_history || null,
           article: door.article || null };
}

/* AND WHAT A CLOSED DOOR SAYS AT FINISH -- the same, plus the club, which is
   the one field the finish response has always carried that a guess does not. */
export function doorBody(door) {
  return { ...solveBody(door), club: door.club };
}

/* DID THIS PLAYER EVER PLAY FOR THAT CLUB. The "right club, wrong player"
   answer, and it MUST be decided here: the alternative is sending the page the
   club's full roster, which is a candidate list for the door. */
export async function playedFor(env, playerKey, club) {
  const row = await env.DB
    .prepare("SELECT clubs FROM wa_player WHERE id = ? AND status = 'verified'")
    .bind(String(playerKey)).first();
  if (!row || !row.clubs) return false;
  let clubs = [];
  try { clubs = JSON.parse(row.clubs) || []; } catch (e) { return false; }
  const want = fold(club);
  return clubs.some((c) => fold(c.club) === want);
}
