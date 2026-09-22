/* functions/_lib/wa-endpoints.js — the eight Who Am I endpoints, for any deck.
 *
 * This is functions/api/whoami/*.js with football taken out of it. Every
 * comment below was written about that game and every one of them is still the
 * reason the code is shaped this way; what has changed is that the game is an
 * argument.
 *
 * TWO ADDRESSES, ONE IMPLEMENTATION, exactly as the crossword API took on
 * 22 September and the hub took before it:
 *
 *   /api/whoami/daily                 -> dailyHandler(ctx, "whoami")
 *   /api/whoami/<game>/daily          -> dailyHandler(ctx, game)
 *
 * The first is what every live football client is calling right now and it does
 * not change. A deploy that moved it would break the game for anybody who had
 * not reloaded, so it delegates, and it always will.
 *
 * AN UNKNOWN GAME IS REFUSED BY EVERY HANDLER, never defaulted to football's.
 * A typo in the path resolving to the football deck would serve one game's
 * doors under another game's address — the quietest failure these endpoints
 * could have, because every response would be well-formed.
 */
import { hasDB, noStore, today } from "./wadata.js";
import { CURVE, MAX_SCORE, FULL_TIME } from "./xi-score.js";
import {
  MATCH_MINUTES, RATE_SECONDS, DOORS,
  getRound, openRound, buyClue, giveUp, judgeGuess, finishRound,
} from "./wa-play.js";
import {
  boardNoOf, boardByFamilyNo, playableDay, archive, lastPlayableDay,
} from "./wa-board.js";
import { whoamiOf } from "./wa-registry.js";

const NO = (msg = "no") => noStore({ error: msg }, 400);
const NO_GAME = () => noStore({ error: "unknown game", source: "none" }, 404);

/* THE THREE THINGS EVERY POST DOES BEFORE IT CAN DO ANYTHING: know the game,
   have a database, and find the round. Written once because a check written
   once per endpoint is a check that will eventually be written in seven places
   and omitted from the eighth. */
async function open(request, env, game) {
  const w = whoamiOf(game);
  if (!w) return { stop: NO_GAME() };
  if (!hasDB(env)) return { stop: NO() };
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  return { w, body };
}

async function withRound(request, env, game) {
  const o = await open(request, env, game);
  if (o.stop) return o;
  const round = await getRound(env, o.body.playId, game);
  if (!round) return { stop: NO("no round") };
  return { ...o, round };
}

/* ---- GET /archive — the boards that have been ---------------------------
 *
 * DAYS AND NUMBERS AND NOTHING ELSE. Not a club, not a door, not a count of
 * anything that could be read back to an answer. An archive index is the
 * easiest place in a game to publish tomorrow by accident — the word search did
 * exactly that on 6 September 2026, listing 233 boards out of a schedule that
 * held two years of inventory — and it is easy because the index feels like
 * metadata right up until you notice the metadata IS the board.
 */
export async function archiveHandler({ env }, game) {
  if (!whoamiOf(game)) return NO_GAME();
  if (!hasDB(env)) return noStore({ error: "no database binding", source: "none" }, 503);
  let boards = [], last = null;
  try {
    boards = await archive(env, 400, game);
    last = await lastPlayableDay(env, game);
  } catch (err) {
    return noStore({ error: "query failed", detail: String(err), source: "d1" }, 500);
  }
  return noStore({ source: "d1", today: today(), lastDay: last,
                   count: boards.length, boards });
}

/* ---- GET /daily — today's doors, or a board that has been ---------------
 *
 * WHAT A DOOR IS: football's is a club and the year a player last left it; the
 * Friends deck's is a section. That is the whole of what a browser gets, and
 * the absence of everything else is the design rather than an omission —
 * publicDoor() in each data module drops the card in ONE place so a new caller
 * cannot forget to.
 *
 * ONLY ONE DOOR IS PLAYED PER PERSON PER DAY and the others stay live for
 * everybody else, so a leak here spoils every other player's day rather than
 * this one player's answer.
 */
export async function dailyHandler({ request, env }, game) {
  const w = whoamiOf(game);
  if (!w) return NO_GAME();
  if (!hasDB(env)) return noStore({ error: "no database binding", source: "none" }, 503);

  const url = new URL(request.url);
  const askedNo = url.searchParams.get("no");
  const askedDay = url.searchParams.get("date");

  let board = null, day = today();
  try {
    if (askedNo !== null) {
      /* Anything that is not a positive integer is a 404 rather than a coerced
         one: Number("") is 0 and Number("3x") is NaN, and both would otherwise
         walk into the lookup as something. */
      const no = /^\d+$/.test(askedNo) ? Number(askedNo) : -1;
      board = await boardByFamilyNo(env, no, today(), game);
      if (board) day = board.day || board.date;
    } else if (askedDay !== null) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(askedDay) && await playableDay(env, askedDay, game)) {
        board = await w.data.getBoard(env, askedDay);
        if (board) day = askedDay;
      }
    } else {
      board = await w.data.getBoard(env);
    }
  } catch (err) {
    return noStore({ error: "query failed", detail: String(err), source: "d1" }, 500);
  }

  /* ONE 404 FOR "not yet" AND "never was". A board that has not run must not be
     distinguishable from one that does not exist, or the shape of the queue is
     readable by asking for numbers until the answer changes. */
  if (!board) {
    return noStore({ error: "no board published for that day", date: today(), source: "d1" }, 404);
  }

  const no = boardNoOf(day);
  return noStore({
    source: "d1",
    generatedAt: new Date().toISOString(),
    scoring: scoringOf(w),
    no, day,
    lastDay: await lastPlayableDay(env, game),
    isToday: day === today(),
    board: { ...board, no, day },
  });
}

/* THE SCORING RULE TRAVELS WITH THE BOARD, and it is not a secret — it is the
 * thing a player is entitled to know before they spend anything. The page needs
 * it to tick a live "worth now" readout, and the only alternative to sending it
 * is a second copy in the client that agrees today and disagrees the first time
 * anybody tunes one. Codeword has that second copy; this does not.
 *
 * THE CURVE IS SENT ONLY BY A GAME THAT HAS ONE. Football's door decays with
 * the match minute; the Friends deck has no clock at all, and sending it a
 * curve would be the page drawing a countdown against a score that never moves.
 * `doorMax` is what tells them apart, and it is the same field wa-play.js reads
 * to decide what an untouched door is worth — one fact, one place.
 */
function scoringOf(w) {
  const ladder = w.ladder.map((r) => ({ stage: r.stage, sub: r.sub,
                                        points: r.points, label: r.label }));
  if (w.doorMax == null) {
    return { curve: CURVE, max: MAX_SCORE, fullTime: FULL_TIME,
             matchMinutes: MATCH_MINUTES, rateSeconds: RATE_SECONDS,
             ladder, giveUp: { label: w.giveUp.label } };
  }
  return { max: w.doorMax, doors: w.data.DOORS || DOORS,
           ladder, giveUp: { label: w.giveUp.label } };
}

/* ---- GET /names — every name a player may type --------------------------
 *
 * THIS IS THE ANSWER SPACE, NOT AN ANSWER, and the distinction is the reason it
 * can be shipped whole. The same names back every board, so holding the list
 * tells you nothing about today: it is the dictionary, not the puzzle. A game
 * that filtered it server-side per keystroke would be slower, no more secret,
 * and wrong on a type-ahead budget.
 *
 * CACHEABLE, WHICH NOTHING ELSE IN THIS GAME IS. It does not change between
 * days, so it is the one endpoint here that may sit in a cache — and it must,
 * because it is fetched on every visit and is the largest thing the page loads.
 */
export async function namesHandler({ env }, game) {
  const w = whoamiOf(game);
  const fail = (body, status) => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
  if (!w) return fail({ error: "unknown game" }, 404);
  if (!hasDB(env)) return fail({ error: "no database binding" }, 503);

  let names = [];
  try { names = await w.data.allNames(env); }
  catch (err) { return fail({ error: "query failed" }, 500); }

  return new Response(JSON.stringify({ count: names.length, names }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      /* An hour, because a name entering the bank should reach players the same
         day without anybody clearing anything. */
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}

/* ---- POST /play — open a door -------------------------------------------
 *
 * Choosing a door IS the sitting: everything after it is measured against that
 * door, so the choice is recorded here rather than carried by the page.
 *
 * A PAST BOARD IS A REAL SITTING, not a practice mode — scored the same, banked
 * the same. The owner's standard is that boards which have gone can be selected
 * and played properly, and a second lesser code path for old boards would be a
 * second set of rules to keep in step.
 */
export async function playHandler({ request, env }, game) {
  const o = await open(request, env, game);
  if (o.stop) return o.stop;

  /* WHICH DAY, checked against the table rather than believed. Without this a
     round could be opened against next July's board and its doors answered one
     at a time — the board-early leak from a different direction, since "was I
     right" is most of a door. */
  let day = today();
  if (o.body.date !== undefined && o.body.date !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(o.body.date))) return NO("no such board");
    if (!(await playableDay(env, String(o.body.date), game))) return NO("no such board");
    day = String(o.body.date);
  }

  const out = await openRound(env, day, o.body.slot, game);
  if (out.error) return NO(out.error);
  return noStore({ ...out, day });
}

/* ---- POST /clue — buy the next rung -------------------------------------
 *
 * THE LADDER IS CONFIG, not a switch in here: football's is
 * football/whoami/js/config.js — "every tunable lives here and nowhere else" —
 * and the Friends deck's is FR_LADDER beside its row. wa-play.js reads whichever
 * the game names. The owner is play-testing what a substitution should buy, and
 * a ladder baked into this route would make every answer to that a code change.
 *
 * A STAGE ALREADY PAID FOR IS SERVED AGAIN FOR NOTHING. A reload must not be a
 * second purchase — the shape of fault Codeword found in its own demo, where a
 * clock could be rewound for free.
 */
export async function clueHandler({ request, env }, game) {
  const o = await withRound(request, env, game);
  if (o.stop) return o.stop;
  const out = await buyClue(env, o.round, Number(o.body.stage), game);
  if (out.error) return NO(out.error);
  return noStore(out);
}

/* ---- POST /guess — name it ----------------------------------------------
 *
 * THREE OUTCOMES, and the middle one is why this cannot be a string comparison
 * on the page: in football, naming somebody who really did play for that club
 * is a NEAR MISS rather than a mistake, and deciding that on the client needs
 * the club's full roster — a roster is a candidate list for the door. The
 * Friends deck's middle case is the same shape: a name that IS an answer, but
 * to another card.
 *
 * NO ANSWER IN A WRONG RESPONSE, on any branch. A near miss says it was a near
 * miss and stops there — saying what it actually was would end the game for the
 * price of a wrong guess, and the door stays live for everybody else that day.
 */
export async function guessHandler({ request, env }, game) {
  const o = await withRound(request, env, game);
  if (o.stop) return o.stop;
  const out = await judgeGuess(env, o.round, o.body.guess, game);
  if (out.error) return NO(out.error);
  return noStore(out);
}

/* ---- POST /giveup — leave the pitch -------------------------------------
 *
 * NOT A SUBSTITUTION, which is why it is not a rung of the ladder and not part
 * of /clue. There were three substitutions once and the third was this, taken
 * from the family's bench-of-three without asking what a third would buy; the
 * answer was nothing, because the spell, the career and the bio are everything
 * football's deck knows about a player that is not his name.
 *
 * IT ENDS THE BOARD AT NOTHING. That is an accounting rather than a penalty —
 * a board you were told the answer to scored nothing — and it is why giving up
 * carries no price: pricing it would make the reveal a cheap route to a number.
 */
export async function giveupHandler({ request, env }, game) {
  const o = await withRound(request, env, game);
  if (o.stop) return o.stop;
  const out = await giveUp(env, o.round, game);
  if (out.error) return NO(out.error);
  return noStore(out);
}

/* ---- POST /finish — what the sitting came to ----------------------------
 *
 * Read from the rows this side wrote, never from anything the page reports.
 * Marking on the server and then accepting the result from the browser would be
 * the front door locked and the back door open.
 *
 * THE ANSWER IS INCLUDED ONLY ONCE THE DOOR IS CLOSED — solved, or given up.
 * Asking to "finish" a door still in play must not be a way to read it.
 */
export async function finishHandler({ request, env }, game) {
  const o = await withRound(request, env, game);
  if (o.stop) return o.stop;
  const out = await finishRound(env, o.round, game);
  if (out.error) return NO(out.error);
  return noStore(out);
}
