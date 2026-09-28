/* functions/_lib/lr-round.js — Lightning Round's rules: the deal, the clock
 * and the marking. Pure functions; lr-play.js is where they meet the database.
 *
 * THE NUMBERS ARE IN friends/lightning/js/config.js and are imported, not
 * restated — QuickFire's qf-round.js does the same with its own config.
 */
import CONFIG from "../../friends/lightning/js/config.js";

export const RUN_MS = CONFIG.RUN_MS;
export const WRONG_PENALTY_MS = CONFIG.WRONG_PENALTY_MS;
export const LATE_GRACE_MS = CONFIG.LATE_GRACE_MS;
export const POINTS = CONFIG.POINTS_PER_CORRECT;
export const RUN_LENGTH = CONFIG.RUN_LENGTH;
export const RECENT_KEEP = CONFIG.RECENT_KEEP;
export const DIFFS = ["Easy", "Medium", "Hard"];

/* A SEEDED RANDOM, so a daily dealt from its date is the same deal for
   everyone and the same deal again if it is ever re-dealt. FNV-1a to turn the
   seed into 32 bits, mulberry32 to run from it. Not cryptographic and does not
   need to be: nothing here is secret that the seed would reveal. */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rngFrom(seed) {
  let a = hash32(String(seed));
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedDiff(rng, mix) {
  const total = DIFFS.reduce((a, d) => a + (mix[d] || 0), 0);
  let r = rng() * total;
  for (const d of DIFFS) {
    r -= mix[d] || 0;
    if (r < 0) return d;
  }
  return DIFFS[DIFFS.length - 1];
}

/* THE DEAL. A run is a fixed list dealt at the start, not a question chosen on
 * each answer: the daily has to be the same list for everyone, and a list
 * dealt once is one thing to test rather than a rule applied eighty times.
 *
 *   pool    [{ id, diff, pgk }]
 *   pairs   [[a, b]] — never both in one run
 *   opts.recent  ids to avoid, most recent first (practice only)
 *   opts.avoid   more ids to avoid, with no order (today's daily, in practice)
 *
 * Slot one is FIRST_DIFF. Every later slot draws a difficulty from MIX and
 * then a question of it that is unused, not paired with anything already
 * dealt, and not on a subject from the last SUBJECT_GAP. Avoided questions are
 * a PREFERENCE, not a wall: when a difficulty has nothing unseen left, the one
 * seen longest ago is dealt, so a heavy player still gets a full run. Pairs
 * and repeats within a run are walls. When a difficulty is exhausted outright
 * the slot falls back to another, and when everything is, the run is shorter.
 */
export function deal(pool, pairs, seed, opts = {}) {
  const length = opts.length || RUN_LENGTH;
  const mix = opts.mix || CONFIG.MIX;
  const gap = opts.subjectGap == null ? CONFIG.SUBJECT_GAP : opts.subjectGap;
  const rng = rngFrom(seed);

  const recentRank = new Map();
  (opts.recent || []).forEach((id, i) => { if (!recentRank.has(id)) recentRank.set(id, i); });
  const avoid = new Set(opts.avoid || []);

  const partners = new Map();
  for (const [a, b] of pairs) {
    if (!partners.has(a)) partners.set(a, new Set());
    if (!partners.has(b)) partners.set(b, new Set());
    partners.get(a).add(b);
    partners.get(b).add(a);
  }

  /* Sorted by id so the deal depends on the pool's contents, not on the order
     a database happened to return them in. */
  const buckets = {};
  for (const d of DIFFS) buckets[d] = [];
  for (const q of [...pool].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))) {
    if (buckets[q.diff]) buckets[q.diff].push(q);
  }

  const out = [];
  const used = new Set();
  const blocked = new Set();
  const lastSubjects = [];

  const pickFrom = (diff, strictSubject) => {
    const open = buckets[diff].filter((q) => !used.has(q.id) && !blocked.has(q.id) &&
      (!strictSubject || !q.pgk || !lastSubjects.includes(q.pgk)));
    if (!open.length) return null;
    const fresh = open.filter((q) => !recentRank.has(q.id) && !avoid.has(q.id));
    if (fresh.length) return fresh[Math.floor(rng() * fresh.length)];
    /* Everything left has been seen: today's daily last, then the one seen
       longest ago. */
    const notDaily = open.filter((q) => !avoid.has(q.id));
    const from = notDaily.length ? notDaily : open;
    let best = null, bestRank = -1;
    for (const q of from) {
      const rank = recentRank.has(q.id) ? recentRank.get(q.id) : Infinity;
      if (rank > bestRank) { best = q; bestRank = rank; }
    }
    return best;
  };

  while (out.length < length) {
    const want = out.length === 0 ? (opts.first || CONFIG.FIRST_DIFF) : weightedDiff(rng, mix);
    const order = [want, ...DIFFS.filter((d) => d !== want)];
    let q = null;
    for (const strict of [true, false]) {
      for (const d of order) {
        q = pickFrom(d, strict);
        if (q) break;
      }
      if (q) break;
    }
    if (!q) break;
    out.push(q.id);
    used.add(q.id);
    for (const p of partners.get(q.id) || []) blocked.add(p);
    if (q.pgk) {
      lastSubjects.push(q.pgk);
      while (lastSubjects.length > gap) lastSubjects.shift();
    }
  }
  return out;
}

/* THE ORDER THE FOUR ARE SHOWN IN. The option file stores them with no
   meaning to their order, and the correct position is derived here, never
   stored: from the run's seed and the question, so a daily shows everybody
   the same four in the same order and a reload shows the same order again. */
export function orderOptions(row, seed) {
  const opts = [row.option_1, row.option_2, row.option_3, row.option_4];
  const rng = rngFrom(seed + ":" + row.id);
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

/* What the page is sent: the clue and the four. Never the answer. */
export function shape(row, seed, idx) {
  return { idx, id: row.id, clue: row.clue, options: orderOptions(row, seed) };
}
export const SECRET_FIELDS = ["answer"];

/* THE CLOCK, from this server's own reading. */
export function msLeft(run, now) {
  return RUN_MS - (Number(now) - Number(run.started_ms)) - (Number(run.penalty_ms) || 0);
}

export function norm(v) {
  return String(v == null ? "" : v).trim().toLowerCase().replace(/\s+/g, " ");
}

/* A pick that is not one of the four is refused, not marked wrong: it did not
   come from the page, and marking it would record a guess nobody made. */
export function judge(row, pick) {
  const options = [row.option_1, row.option_2, row.option_3, row.option_4];
  const offered = options.some((o) => norm(o) === norm(pick));
  if (!offered) return { offered: false, correct: false };
  return { offered: true, correct: norm(pick) === norm(row.answer) };
}
