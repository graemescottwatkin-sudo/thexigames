/* GET /api/crossword_fr/daily         today's Friends crossword
   GET /api/crossword_fr/daily?no=12   that board, if it is not in the future

   THE ID IS crossword_fr AND THE ADDRESS IS /friends/crossword/. They are two
   facts and this file is on the id side of the line, which is why the folder
   reads the way it does. functions/_lib/permalink.js owns the other half.

   THE SERVER DECIDES WHAT DAY IT IS, in UTC. A number sent up is checked
   against today here rather than trusted: the past is open so a missed day can
   be caught up, the future is shut because opening it gives the board away.

   THE BOARD LEAVES THROUGH publicPuzzle(), WHICH IS THE POINT OF THIS FILE.
   The stored payload holds the filled grid — every cell's letter — because the
   server needs it to mark an answer. publicPuzzle rebuilds a board from named
   fields and cannot carry `ch`, so what goes out is the shape, the numbering
   and the clues. See functions/_lib/puzzle.js.

   AND THE FRIENDS BANK MAKES THAT ALLOWLIST LOAD-BEARING IN A WAY FOOTBALL'S
   DOES NOT. Every Friends clue row carries a `sourceQuote`, the sentence its
   answer was verified against, and the bank refuses any row whose answer is not
   literally in that sentence — so the quote contains the answer in 3,035 of
   3,053 rows. A projection that deleted known-bad fields would leak the day
   somebody added a field. This one copies known-good fields, so it cannot. */

import { json, bad, publicPuzzle, cellKey } from "../../_lib/puzzle.js";
import { dailyNumber, dailyDayKey, ANSWERS_AFTER_DAYS } from "../../_lib/daily.js";
import { launchNumber } from "../../_lib/games.js";
import { storedNo, lastPublicNo } from "../../_lib/fr-board.js";
import {
  mayOpenArchive, archiveRefusal, daysBack, FREE_ARCHIVE_DAYS,
} from "../../_lib/archive.js";

const GAME = "crossword_fr";

/* WHICH BOARD IS TODAY'S: THE FAMILY'S DAILY NUMBER, exactly as every other
   game in this family counts. boardKeys() advertises launchNumber(game)..today
   and Vowels launched on board TEN because of it — a game's first board is not
   board 1 here.

   THIS FILE HAD IT THE OTHER WAY and it was wrong in a way nothing could catch
   until the game entered PERMA_GAMES. It returned dailyNumber - launched + 1,
   so it called the opening board 1 while the sitemap called the same board 4.
   A player following /friends/crossword/daily/4 would have been served the
   bank's FOURTH puzzle instead of the first — silently, because board 4 exists.
   The suites stub D1 and never ask what the site advertises, so they agreed
   with it. fr-board.js now owns the one conversion between this number and the
   row the bank stored. */
function todayNo(now) {
  return launchNumber(GAME) ? dailyNumber(now) : null;
}

/* The calendar day a public board number falls on. It IS the family's day key
   now that the number is the family's, so there is no arithmetic left to get
   wrong — which is the point of having moved. */
function dayForNo(no) {
  return launchNumber(GAME) ? dailyDayKey(no) : null;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const now = Date.now();
  const today = todayNo(now);

  const asked = url.searchParams.get("no");

  /* BEFORE LAUNCH THERE IS NO TODAY. The game is playable in the repo — this
     family builds games in the open, as /football/scrambled/ and
     /football/quickfire/ both were — but "today's board" is a question with no
     answer until there is a launch date, so it is refused rather than guessed.
     An explicit ?no= still works, which is what the build needs. */
  if (asked === null && today === null) {
    return json({
      no: null, day: null, today: null, board: null, launched: false,
      freeArchiveDays: FREE_ARCHIVE_DAYS,
    });
  }

  const no = asked === null ? today : Number(asked);
  if (!Number.isInteger(no) || no < 1) return bad("Not a board number.");
  if (today !== null && no > today) return bad("That board is not out yet.", 403);

  /* The archive rule LIVES in _lib/archive.js and is not restated here — today
     and the week behind it are free, older needs an account. Asked before the
     board is read, because a board nobody may open is a board there is no
     reason to load. Skipped entirely before launch, when there is no day to
     count back from. */
  const day = dayForNo(no);
  if (day) {
    const back = daysBack(day, dailyDayKey(dailyNumber(now)));
    if (!(await mayOpenArchive(request, env, back))) {
      return json(archiveRefusal(back), 401);
    }
  }

  /* THE STORED ROW, WHICH IS NOT THE NUMBER IN THE URL. fr_puzzles.daily_no
     runs 1..120 as the bank numbered its manifest; the number here is the
     family's. Null means this day has no board of ours — before the launch, or
     past the end of the bank — and both are answered the same way below,
     because a board that is not there is not an error. */
  const board = storedNo(no);
  const row = board === null ? null : await env.DB.prepare(
    "SELECT payload FROM fr_puzzles WHERE mode = 'daily' AND daily_no = ?1"
  ).bind(board).first();

  /* NO ROW IS NOT AN ERROR. The bank holds a finite run of boards and the
     calendar will reach the end of it; saying so plainly lets the page degrade
     rather than break, which is the shape grid and HiLo both answer with. */
  if (!row) {
    return json({ no, day, today, board: null, launched: today !== null,
                  lastBoardNo: lastPublicNo(),
                  answersAfterDays: ANSWERS_AFTER_DAYS,
                  freeArchiveDays: FREE_ARCHIVE_DAYS });
  }

  let stored;
  try {
    stored = JSON.parse(row.payload);
  } catch {
    console.error("crossword_fr: board " + no + " has an unreadable payload");
    return bad("That board is unavailable.", 500);
  }
  const puzzle = stored && stored.puzzle;
  if (!puzzle || !puzzle.cells || !Array.isArray(puzzle.entries)) {
    console.error("crossword_fr: board " + no + " is not a puzzle");
    return bad("That board is unavailable.", 500);
  }

  const pub = publicPuzzle(puzzle);

  /* THE LAST CHECK BEFORE IT GOES OUT, and it is not decoration. The importer
     asks this same question of every board before writing the SQL; this asks it
     of the thing actually being serialised, because between the importer and
     here the board has been through a database and a JSON round trip. A leak
     that only appears in production is the one shape of leak nothing offline
     can see — and the crossword's own live_check shipped a HEAD block that
     crashed on first contact with production for exactly that reason.

     IT READS THE LETTERS OUT OF THE STORED GRID rather than trusting a list of
     answers, because the filled grid IS the answers: the letters live in the
     cells the server kept. If any of it appears in what is about to be sent,
     nothing is sent.

     AND IT LOOKS PAST THE CLUES, FOR THE SAME REASON THE IMPORTER DOES. Three
     rows of the bank's 3,053 contain their own answer inside a longer word —
     BTS0173 (MONKEY in "two monkeys"), QUO0071 (MONICA in "Harmonica"),
     EVT0509 (HANDLER in "Chandler") — and all three are legitimate clues that
     the engine's own self-answering filter allows, because that filter compares
     whole words. Scanning the clue text here would turn each of them into a 500
     the first time a board drew one. None of the current 120 boards does, which
     is exactly why this would have sat unnoticed until it fired in production
     on a board nobody could reproduce. */

  const norm = (s) => String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");

  /* VALUES ONLY, ONE ENTRY AT A TIME - NEVER THE SERIALISED BOARD. This first
     normalised JSON.stringify of the whole projection and searched that, which
     is wrong twice over and would have taken a fifth of the bank off the air:
     measured, 24 of the 120 boards now in D1 would have answered 500, board 1
     among them.

       ROSS  is inside "acROSS", the direction word of the structure itself.
       ACTOR is inside ANOTHER entry's category, "Guest Role -> Actor".
       CATS  is inside the KEY NAME and its value together, "cat":"Series...".

     Normalising a serialised object turns its field names and every other
     entry's metadata into searchable text, so the scan was mostly finding the
     JSON it was made of. Reading the VALUES of one entry removes both: a key
     name is never read, and another entry's category is not this entry's
     business. The fields are WALKED rather than listed, so a field added to
     publicPuzzle is scanned without anyone having to remember this file. */
  const answerOf = (e) => norm((e.cells || [])
    .map((c) => (puzzle.cells[cellKey(c)] || {}).ch || "").join(""));

  const leaked = [];
  for (const e of pub.entries) {
    const src = puzzle.entries.find((x) => x.row && x.row.id === e.row.id);
    /* Unresolvable means the scan cannot be RUN, which is not the same as
       finding it clean. Refuse rather than skip. */
    if (!src) { leaked.push(e); continue; }

    const answer = answerOf(src);
    if (answer.length < 3) continue;

    const carries = Object.keys(e.row)
      .filter((k) => k !== "clue")      // public by definition; see the importer
      .some((k) => norm(JSON.stringify(e.row[k])).includes(answer));
    if (carries) leaked.push(e);
  }

  /* AND NOT ONE CELL MAY CARRY A LETTER, asked of the projection rather than
     assumed of publicPuzzle. This is the leak that matters most and the one a
     value scan can never see, because a solution letter is a single character
     and matches everything or nothing. */
  if (Object.keys(pub.cells).some((k) => pub.cells[k] && "ch" in pub.cells[k])) {
    console.error("crossword_fr: public board " + no + " carries solution letters");
    return bad("That board is unavailable.", 500);
  }

  if (leaked.length) {
    /* FAIL CLOSED, LOUDLY IN THE LOG AND QUIETLY TO THE PLAYER. Serving it
       anyway would be serving the answers; naming the answer that leaked would
       be leaking it a second time. */
    console.error("crossword_fr: public board " + no + " leaked " +
      leaked.length + " answer(s)");
    return bad("That board is unavailable.", 500);
  }

  return json({
    no, day, today, board: pub, launched: today !== null,
    answersAfterDays: ANSWERS_AFTER_DAYS,
    freeArchiveDays: FREE_ARCHIVE_DAYS,
  });
}

export async function onRequestHead(ctx) {
  const r = await onRequestGet(ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
