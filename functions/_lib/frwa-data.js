/* functions/_lib/frwa-data.js — the Friends Who Am I deck, read from D1.
 *
 * THE SAME INTERFACE AS wadata.js, A DIFFERENT GAME BEHIND IT. Football's Who
 * Am I hides a footballer and reveals his attributes; this hides a Friends card
 * and deals three written clues. What the two share is the SHAPE of a board —
 * eleven doors, one answer each, clues bought in order — and that is what the
 * endpoints, the rounds table and the guess flow are written against. So this
 * file answers the same four questions wadata.js does, and the endpoints do not
 * learn which game they are serving.
 *
 *   getBoard(env, date)          the day's eleven doors, safe to send
 *   doorAnswer(env, date, slot)  what is behind one, NEVER sent whole
 *   clueAt(env, door, step)      one clue, bought
 *   allNames(env)                the guessable names, for the suggest box
 *
 * WHAT A DOOR SAYS BEFORE IT IS OPENED. Football's shows a club and a leave
 * year: enough to choose between eleven doors, not enough to name the player.
 * This shows the card's SECTION -- "Loves & Exes", "Family & Relatives",
 * "Locations" -- which narrows the same way. It is not the deck name: the three
 * decks collapse six sections, and it is the section that makes one door worth
 * choosing over another.
 *
 * NOT ONE CLUE MORE THAN WAS PAID FOR. The card is never selected whole. A
 * round asks for step 1, 2 or 3 and gets exactly that row; the answer and the
 * remaining clues stay in the database. This family has closed the same leak in
 * four games by serving a projection rather than trimming a payload, and this
 * is the projection.
 */
import { fold, today } from "./wadata.js";

/* THE DOORS A DAY DEALS, AND IT IS THREE, NOT THE FAMILY'S ELEVEN.
 *
 * Football deals eleven and the player opens ONE -- the eleven are a choice.
 * Copying that number here does not survive the deck: 366 rounds at eleven a
 * day is 33 days of content, and the deck's own three-week rest rule needs
 * 11 x 21 = 231 distinct cards in flight against 103 that exist.
 * At three the rule holds exactly and the character decks run 97 days.
 *
 * getBoard REFUSES A DAY THAT IS NOT EXACTLY THIS, which is why the number
 * being wrong was not a cosmetic mistake: it sat at eleven while the calendar
 * dealt three, so every board in the game resolved to null and the game would
 * have had no days at all. */
export const DOORS = 3;

/* WHAT THE PLAYER MAY SEE OF A DOOR. A slot and a section. There is no third
   field, and adding one is how a door starts naming its card. */
export function publicDoor(row) {
  return {
    slot: Number(row.slot),
    section: row.section,
    deck: row.deck,
  };
}

/* THE DAY'S BOARD, or null. Null means "no board", never a partial one: a day
   with ten resolvable doors is a broken board, and serving it would quietly
   retire a door for everybody who picked it. Football's getBoard refuses on
   exactly the same rule and for the same reason. */
export async function getBoard(env, date) {
  const play = date || today();
  const { results } = await env.DB.prepare(`
    SELECT d.slot, d.round_letter, c.section, c.deck, c.id AS card_id
    FROM fr_wa_board b
    JOIN fr_wa_door d ON d.play_date = b.play_date
    JOIN fr_wa_card c ON c.id = d.card_id
    WHERE b.play_date = ?1
      AND b.status = 'published'
      AND c.status = 'published'
    ORDER BY d.slot
  `).bind(play).all();

  const rows = results || [];
  if (rows.length !== DOORS) return null;

  return {
    day: play,
    doors: rows.map(publicDoor),
  };
}

/* WHAT IS BEHIND ONE DOOR. Server-side only: this returns the card id and the
   round letter, which together decide which three clues that outing deals. The
   NAME is here too, because giving up and solving both have to say it -- and
   because the alternative is a second query at the one moment the player is
   waiting. It is the caller's job not to send it early, which is why every
   caller is an endpoint and not the client. */
export async function doorAnswer(env, date, slot) {
  const row = await env.DB.prepare(`
    SELECT d.slot, d.round_letter, c.id AS card_id, c.name, c.section, c.deck, c.depth, c.rounds
    FROM fr_wa_door d
    JOIN fr_wa_card c ON c.id = d.card_id
    WHERE d.play_date = ?1 AND d.slot = ?2
  `).bind(date || today(), Number(slot)).first();
  return row || null;
}

/* ONE CLUE, AND ONLY THE ONE ASKED FOR.
 *
 * A round deals a card at a LETTER, and the three clues of that outing are the
 * rows with that letter, in step order. Selected by (card, letter, step) rather
 * than by computing a clue number here: the number depends on the card's depth,
 * the importer has already done that arithmetic once, and doing it again in a
 * second place is how the two come to disagree about which clue is clue two.
 */
export async function clueAt(env, cardId, letter, step) {
  const row = await env.DB.prepare(`
    SELECT n, step, text, vs, ep
    FROM fr_wa_clue
    WHERE card_id = ?1 AND round_letter = ?2 AND step = ?3
  `).bind(String(cardId), String(letter), Number(step)).first();
  return row || null;
}

/* HOW MANY CLUES THIS OUTING HAS. Three on a full card; a three-clue location
   played at its only letter has one. Asked rather than assumed, because a
   ladder that offers a third clue on a card that has two would sell something
   that does not exist. */
export async function stepsInRound(env, cardId, letter) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM fr_wa_clue WHERE card_id = ?1 AND round_letter = ?2
  `).bind(String(cardId), String(letter)).first();
  return Number(row && row.n) || 0;
}

/* ---- guessing ------------------------------------------------------------
 *
 * TWO LISTS, AND THE DIFFERENCE IS THE WHOLE BEHAVIOUR. An 'accept' string IS
 * the answer and is only ever stored when it points at one card -- the importer
 * refuses a deck where it does not. A 'suggest' string merely surfaces a card:
 * "apartment" names five, so it offers a choice rather than picking one.
 *
 * MATCHED ON THE FOLDED STRING, which is how it was stored. The folding is
 * wadata.js's, shared with football, so "Ross's" and "ross" reach the same row
 * in both games rather than in two ways.
 */
export async function judge(env, door, key) {
  if (!key) return { solved: false, verdict: "empty" };

  const { results } = await env.DB.prepare(`
    SELECT a.card_id, a.kind, c.name
    FROM fr_wa_answer a
    JOIN fr_wa_card c ON c.id = a.card_id
    WHERE a.answer = ?1
  `).bind(key).all();

  const rows = results || [];
  if (!rows.length) return { solved: false, verdict: "wrong" };

  const accepted = rows.filter((r) => r.kind === "accept");
  if (accepted.some((r) => String(r.card_id) === String(door.card_id))) {
    /* "right" IS THE FAMILY'S WORD FOR IT, not this deck's "yes". The verdict
       is STORED, and football's rows already say right / right-club / wrong;
       two vocabularies for one column is two answers to "how many did they get
       wrong" the first time anybody counts across the family. */
    return { solved: true, verdict: "right" };
  }

  /* IT NAMES A CARD, BUT NOT THIS ONE. Told apart from "no such answer"
     because they are different things to a player: one is a wrong guess, the
     other is a guess at the wrong door. It is this deck's near miss, which is
     why the registry row names it as such rather than this file assuming the
     counting. */
  if (accepted.length) return { solved: false, verdict: "other" };

  /* SUGGESTIONS ONLY. The string surfaces cards without being any of their
     answers -- "apartment". The caller offers the choice; this does not pick,
     because picking is exactly the behaviour the two lists exist to prevent. */
  return { solved: false, verdict: "ambiguous", options: rows.map((r) => r.name) };
}

/* EVERY GUESSABLE NAME, for the suggestion box. Names only: the accept list
   holds nicknames and aliases that would give cards away if listed in a picker
   the player can read before guessing. */
export async function allNames(env) {
  const { results } = await env.DB.prepare(
    `SELECT name FROM fr_wa_card WHERE status = 'published' ORDER BY name`
  ).all();
  return (results || []).map((r) => r.name);
}

/* ---- what a bought clue says ---------------------------------------------
 *
 * THE SAME ROLE AS football's clueBody, A DIFFERENT KIND OF ANSWER. Football's
 * builds an object out of a player's attributes -- a spell, a career, a bio --
 * because the clue IS the attribute. Here the clue is a written sentence, so
 * this returns the sentence and the two facts about it worth carrying: how far
 * through the round it is, and whether it has a citation behind it.
 *
 * THE SOURCING TRAVELS WITH THE CLUE, and that is deliberate. 309 of the deck's
 * clues have an episode located and a wrong clue in front of Friends fans is
 * the failure this game is most exposed to. Sending `ep` lets the page show the
 * episode AFTER the round is over, which is the only time it can be shown --
 * before, it is a clue nobody paid for.
 *
 * THE CARD IS NOT NAMED. Not its id, not its name, not how many clues remain
 * beyond the step asked for. A bought clue is one sentence.
 */
export function clueBody(clue, step, steps) {
  if (!clue) return null;
  return {
    step: Number(step),
    of: Number(steps),
    text: clue.text,
    /* The tier, not the evidence. "ep" means an episode is on record for this
       sentence; the episode itself is only sent once the round has ended. */
    cited: clue.vs === "ep",
  };
}

/* THE EPISODE, FOR A ROUND THAT IS OVER. Separate from clueBody because the
   two are answers to different questions asked at different moments, and
   putting `ep` in the clue body is how it ends up on screen mid-round. */
export function clueSource(clue) {
  return clue && clue.ep ? { episode: clue.ep } : null;
}

/* ---- the play adapter ----------------------------------------------------
 *
 * THE SAME QUESTIONS wadata.js ANSWERS FOR FOOTBALL, so wa-play.js can run a
 * Friends sitting without knowing it is one. What differs is every answer:
 * football's rung reveals an attribute of a player row it already holds, and
 * this one goes and fetches the round's next sentence.
 */

/* WHAT A BOUGHT RUNG SAYS. A rung of this ladder IS a clue number -- one, two
   or three of the round's band -- so the stage's own number picks the row.
   THE GIVE-UP RUNG IS THE EXCEPTION AND IS TOLD APART BY ITS `reveals`, not by
   a missing number: a rung that reveals the answer is an exit, and reading
   `stage.stage` off it would fetch clue `undefined`. */
export async function reveal(env, door, stage) {
  if ((stage.reveals || []).includes("answer")) return solveBody(door);

  const steps = await stepsInRound(env, door.card_id, door.round_letter);
  const clue = await clueAt(env, door.card_id, door.round_letter, Number(stage.stage));
  /* NO CLUE IS A REFUSAL, NOT AN EMPTY ONE. A round that cannot produce the
     sentence somebody just paid for is a broken card, and serving a blank for
     it charges them for nothing. */
  if (!clue) return null;
  return clueBody(clue, stage.stage, steps);
}

/* WHAT A SOLVED OR ABANDONED DOOR SAYS. The card's name, and the two facts the
   door already showed -- so the reveal reads as an answer to the door that was
   chosen rather than as a bare noun. NOT the remaining clues: a card has up to
   twelve and nine of them belong to outings still to come. */
export function solveBody(door) {
  return { answer: door.name, section: door.section, deck: door.deck };
}

/* AND AT FINISH, THE SAME. Football's adds the club because its finish response
   always carried one; this deck's door has no field the reveal has not already
   said, and inventing one here would be a field nobody asked for. */
export function doorBody(door) {
  return solveBody(door);
}
