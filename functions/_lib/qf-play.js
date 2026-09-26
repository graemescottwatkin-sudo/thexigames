/* functions/_lib/qf-play.js — a QuickFire sitting, in the database.
 *
 * The rules are in qf-round.js; this is where a round is kept, so the three
 * routes stay thin and cannot each invent their own idea of what a round is.
 *
 * WHY ANY OF THIS EXISTS. QuickFire went live on 14 September 2026 serving the
 * ANSWER with every question — eleven a day, plain text, one curl — because the
 * page was a typing game that revealed letters out of the string. Moving to
 * four options removed the need for it, and marking has to land somewhere: the
 * page cannot mark itself without the answer, and handing it the answer is what
 * we are stopping. So it happens here.
 */
import { PER_DAILY, SUBS, MATCH_MINUTES, WRONG_PICK_MINUTES, minuteOf, pointsFor, judge, totalFor, allCorrect, isLegacy, maxFor, BONUS } from "./qf-round.js";

const now = () => Date.now();
const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

export async function getRound(env, playId) {
  if (!env || !env.DB || !playId) return null;
  return await env.DB.prepare("SELECT * FROM qf_round WHERE play_id = ?").bind(playId).first();
}

/* KICK OFF. The clock starts HERE and is never sent up.
 *
 * `started_ms` is the SITTING's clock and is not what anything scores off —
 * it is here for reporting and for a round that has not served a question yet.
 * The clock that decides points is stamped per question by serveQuestion(). */
export async function startRound(env, playDate) {
  const playId = id();
  const started = now();
  await env.DB.prepare(
    "INSERT INTO qf_round (play_id, play_date, started_ms, subs_used, question_idx, question_ms, penalty_minutes) " +
    "VALUES (?, ?, ?, 0, 0, 0, 0)"
  ).bind(playId, playDate, started).run();
  return { playId, startedMs: started, subsLeft: SUBS, questions: PER_DAILY };
}

/* SERVING A QUESTION, which is the act that starts its clock.
 *
 * Each question has its own 0' to 90'. Until this existed, every question was
 * measured from the sitting — so question two landed at 99' and was worth
 * nothing, and so was everything after it.
 *
 * IT DOES NOT RESTAMP. Asking twice for the same question returns the stamp it
 * already has, because a second stamp would rewind the match and hand back the
 * decay: a player sitting on a hard question could reload and be back at 0'.
 * That is the shape of the fault Codeword found in its own demo, where the
 * clock rate was switchable mid-round and flipping it returned seventeen
 * minutes for one click. The only thing that may move this clock forward is
 * time, and the only thing that may move it at all is this function, once.
 *
 * AND IT REFUSES TO GO BACKWARDS. Question 3 cannot be served after question 5:
 * that is either a page out of step or somebody shopping for a fresh clock on a
 * question they have already seen. Re-serving the CURRENT one is the reload
 * case and is answered with the existing stamp, which is why it is separate. */
export async function serveQuestion(env, round, idx) {
  const at = Number(round.question_idx) || 0;
  if (idx === at) {
    return { idx, startedMs: Number(round.question_ms), minute: minuteOf(round, now()), restamped: false };
  }
  /* AND SAYS WHERE THE ROUND IS, so a page that has fallen behind can catch
     up instead of asking for the same question for ever. Found from the phone
     app on 23 Sep 2026: a player who left mid-question came back to "THAT DID
     NOT REACH US — TRY AGAIN" on every tap, for the rest of the day, because
     the page's saved question was one behind the one this function had already
     stamped. The refusal was right; it was simply a dead end. `at` is the
     question this round is on, which is not a secret — the player has seen it. */
  if (idx < at) return { error: "that question has already been played", at };

  const answered = await env.DB
    .prepare("SELECT idx FROM qf_answer WHERE play_id = ? AND idx = ?")
    .bind(round.play_id, idx).first();
  if (answered) return { error: "that question has already been answered" };

  const stamp = now();
  await env.DB.prepare(
    "UPDATE qf_round SET question_idx = ?, question_ms = ?, penalty_minutes = 0 WHERE play_id = ?"
  ).bind(idx, stamp, round.play_id).run();
  return { idx, startedMs: stamp, minute: 0, restamped: true };
}

/* One locked pick.
 *
 * ANSWERED ONCE PER SITTING, enforced by the primary key rather than by asking
 * first. Not because anybody would plan to replay a question, but because a
 * retry on a flaky connection does it by accident and would keep whichever
 * outcome was better. The SELECT below is the cheap path; the key is the one
 * that holds when two requests arrive together.
 *
 * A PICK THAT WAS NOT ONE OF THE FOUR IS REFUSED, not marked wrong. It did not
 * come from the page, and recording it would put a guess in the record that
 * nobody made.
 */
export async function answerRound(env, round, question, idx, pick) {
  const already = await env.DB
    .prepare("SELECT idx, correct, points, minute FROM qf_answer WHERE play_id = ? AND idx = ?")
    .bind(round.play_id, idx).first();
  if (already) {
    return {
      idx, correct: !!already.correct, points: already.points,
      minute: already.minute, replayed: true,
      /* THE SAME ANSWER ON A REPLAY. A player who reloads on a question they
         got wrong must see what this returned the first time, or the page
         tells them the answer once and then takes it away. */
      ...(already.correct ? {} : { answer: question.answer }),
    };
  }

  /* THE CLOCK MUST BE ON THIS QUESTION. Without this, a page could skip the
     serve and answer question eleven measured from question one's stamp — which
     is to say, answer the whole board at 0' for a hundred apiece. The serve is
     what starts a question, so answering one that was never served is not a
     late answer, it is not an answer at all. */
  if ((Number(round.question_idx) || 0) !== idx) {
    return { error: "that question has not been served" };
  }

  const at = now();
  const minute = minuteOf(round, at);

  /* FULL TIME, which is the one way a question ends without a pick.
   *
   * The page sends a null pick when its clock reaches 90'. That has to be
   * CHECKED rather than believed, and the reason is the substitution: passing a
   * question costs twenty points, so if "I ran out of time" were free and
   * instant, no player would ever spend a sub again — they would time out of
   * every hard question at 0' and lose nothing but the points that question was
   * worth, which is what they would have lost anyway. A free escape priced
   * against a paid one empties the paid one.
   *
   * So the server asks its own clock. Full time means full time here, not on
   * the page. 037's schema had already anticipated this — `pick TEXT` carries
   * the comment "NULL on a timeout" — and nothing had ever written one. */
  const ranOut = pick === null || pick === undefined;
  if (ranOut) {
    if (minute < MATCH_MINUTES) return { error: "there is still time on the clock" };
    await env.DB.prepare(
      "INSERT INTO qf_answer (play_id, idx, question_id, pick, correct, points, minute, at_ms) " +
      "VALUES (?, ?, ?, NULL, 0, 0, ?, ?)"
    ).bind(round.play_id, idx, question.id, minute, at).run();
    /* A CLOCK THAT RAN OUT IS STILL A QUESTION THEY DID NOT GET, so it is told
       what the answer was on the same terms as a wrong pick. */
    return { idx, correct: false, points: 0, minute, timedOut: true, replayed: false,
             answer: question.answer };
  }

  const verdict = judge(question, pick);
  if (!verdict.offered) return { error: "that was not one of the options" };
  /* A WRONG PICK COSTS TIME, NOT POINTS. How much is WRONG_PICK_MINUTES, which
     qf-round.js reads from the game's own config — not restated here, because
     this comment said "five match minutes" for the hours between the draft and
     the owner settling on ten, and a number written in prose beside the code
     that uses it is a second copy that cannot be kept in step.
     It is charged AFTER this question is
     scored, so the cost lands on what comes next rather than on the question
     that was just answered: paying for a mistake with the points you had
     already earned would take the same minute twice. */
  const points = verdict.correct ? pointsFor(minute) : 0;

  await env.DB.prepare(
    "INSERT INTO qf_answer (play_id, idx, question_id, pick, correct, points, minute, at_ms) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(round.play_id, idx, question.id, String(pick), verdict.correct ? 1 : 0,
    points, minute, at).run();

  if (!verdict.correct) {
    await env.DB.prepare(
      "UPDATE qf_round SET penalty_minutes = penalty_minutes + ? WHERE play_id = ?"
    ).bind(WRONG_PICK_MINUTES, round.play_id).run();
  }

  return {
    idx, correct: verdict.correct, points, minute,
    penaltyMinutes: verdict.correct ? 0 : WRONG_PICK_MINUTES,
    replayed: false,
    /* WHAT IT WAS, WHEN THEY DID NOT GET IT. Being marked wrong and not told
       the answer leaves the player with nothing to learn and no way to check
       the question was fair — the one thing a quiz owes them at the moment it
       says no.
       ONLY ON A WRONG PICK, and only for a question THIS round has just
       answered. A right pick already knows, and the answer is never sent for a
       question that has not been settled — which is the rule that keeps this
       from becoming the leak the whole endpoint exists to prevent. */
    ...(verdict.correct ? {} : { answer: question.answer }),
  };
}

/* A substitution. Counted here because the page cannot be trusted with a
   number that buys something.
 *
 * AND IT IS THE ONE THING THAT MAY RESTART A QUESTION'S CLOCK. Passing brings a
 * fresh question off the bench into the same slot, back at 0' — that is the
 * game's design and it has to be, because the new question is one the player
 * has not seen. serveQuestion() refuses to restamp precisely so that a reload
 * cannot buy a fresh clock, so the sub has to do its own restamp rather than go
 * through it.
 *
 * THAT IS NOT A WAY ROUND THE RULE, and the reason is the price rather than the
 * plumbing: a sub costs twenty points and there are three. A player who spends
 * one to escape a decayed clock has paid more than the decay was taking in
 * every band but the last. The penalty minutes go with it — they were bought
 * against a question that is no longer on the board, and charging them to a
 * question the player has not read yet would be charging for somebody else's
 * mistake. */
export async function spendSub(env, round) {
  if (Number(round.subs_used) >= SUBS) return { error: "no substitutions left" };
  await env.DB.prepare(
    "UPDATE qf_round SET subs_used = subs_used + 1, question_ms = ?, penalty_minutes = 0 " +
    "WHERE play_id = ?"
  ).bind(now(), round.play_id).run();
  return { subsLeft: SUBS - Number(round.subs_used) - 1, startedMs: now(), minute: 0 };
}

/* THE WHISTLE. The server computes the total, because the page posting its own
   is the forgery hole that moving the marking here was meant to close — the
   front door locked and the back door open. */
export async function finishRound(env, round) {
  const { results } = await env.DB
    .prepare("SELECT idx, correct, points FROM qf_answer WHERE play_id = ? ORDER BY idx")
    .bind(round.play_id).all();
  const answers = results || [];
  const score = totalFor(answers, round.subs_used);
  const right = answers.filter((a) => a.correct).length;
  return {
    score, answered: answers.length, correct: right,
    /* What it was out of, and the bonus if it was earned, so the page says the
       same total the server banked -- including a round from before the bands
       changed, which is out of its own 1100. */
    max: maxFor(answers),
    bonus: !isLegacy(answers) && allCorrect(answers) ? BONUS : 0,
    questions: PER_DAILY, subsUsed: Number(round.subs_used) || 0,
    minute: minuteOf(round, now()),
  };
}
