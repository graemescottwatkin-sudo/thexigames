/* functions/_lib/bank-cache.js — a game's bank, parsed once per Worker and kept.
 *
 * THE PLAY BOT FOUND IT, 29 Sep 2026: seven of eight nightly runs failed on
 * 503s from HiLo's /call and Scrambled and Vowels' /reveal and /daily, and
 * Cloudflare's own analytics named them `exceededResources` -- over the CPU
 * limit. Every one of those requests read its game's WHOLE bank from D1 and
 * JSON.parse'd every row, to use one board: 1,187 Scrambled boards, 7.75 MB, on
 * every daily, round, reveal, guess and finish; 341 HiLo boards, 3.0 MB, on
 * every single call. Even the requests that got through had a median CPU of
 * 11.7 ms against the free plan's 10. Players spread out get through on the
 * burst allowance; a round played at speed does not, and every board imported
 * makes it worse.
 *
 * WHY NOT FETCH ONLY THE BOARD NEEDED. Which board is day N is a position in
 * the ring of boards NOT marked `daily: false`, and that flag lives inside the
 * payload: asking SQL for it would write the rotation rule a second time, in
 * another language, where the two could disagree. So the bank is still loaded
 * whole, by the same loader, and every rule stays where it is -- it is just
 * loaded once per Worker instance rather than once per request.
 *
 * WHAT IS KEPT, AND FOR HOW LONG.
 *  - Only a bank that came from D1. The sample a loader falls back to when the
 *    database is absent or unreadable is not kept, so a passing D1 error costs
 *    one request its bank, not the next five minutes.
 *  - For BANK_TTL_MS. For up to that long after an import, a Worker may still
 *    answer from the bank before it. That is the staleness this adds, and it
 *    is a widening rather than a new risk: an import already moves ring
 *    positions under a round in progress, and this stretches the moment it
 *    happens to five minutes.
 *  - Per database binding (a WeakMap on env.DB), so two environments -- two
 *    suites' stubs -- never see each other's bank.
 *  - As the promise, so requests arriving together in one Worker share one
 *    load rather than each starting their own.
 *
 * THE BANK IS SHARED BETWEEN REQUESTS, SO NOTHING MAY CHANGE IT. A route that
 * sorted a bank's array in place or deleted a field from a board would change
 * it for every player after it. None does (29 Sep 2026); tools/bank_cache_test
 * runs the hot routes against a kept bank and refuses one that comes back
 * different. It is not frozen here, because freezing 7.75 MB of objects costs
 * half as much again as parsing them, on the one request that already pays. */
export const BANK_TTL_MS = 5 * 60 * 1000;

const KEPT = new WeakMap();

export function keptBank(env, name, load) {
  const db = env && env.DB;
  if (!db || (typeof db !== "object" && typeof db !== "function")) return load();
  let slots = KEPT.get(db);
  if (!slots) KEPT.set(db, (slots = new Map()));
  const now = Date.now();
  const hit = slots.get(name);
  if (hit && now - hit.at < BANK_TTL_MS) return hit.value;
  const slot = { at: now, value: null };
  const forget = () => { if (slots.get(name) === slot) slots.delete(name); };
  slot.value = Promise.resolve().then(load).then(
    (bank) => { if (!bank || bank.source !== "d1") forget(); return bank; },
    (e) => { forget(); throw e; });
  slots.set(name, slot);
  return slot.value;
}
