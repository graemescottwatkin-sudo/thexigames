/* bp-tol.js — WHAT A BALLPARK IS, per kind. GENERATED; do not edit by hand.
 *
 * Emitted by BallparkXI's tools/emit_tol_table.mjs from its tools/kinds.mjs,
 * which is where these numbers are decided. Edit them there and re-emit.
 *
 * WHY THE BROWSER GETS THE RULE AND NOT THE WIDTH. For 29 of these 48 kinds a
 * ballpark is max(floor, round(pct * |answer|)) — so the WIDTH of the band is a
 * function of the answer, and sending it sends the answer: divide by pct. The
 * live payload did send it, and on 21 November 2026 135 of 2,321 board rows
 * were readable to under 2% of their slider, four capacity questions among them
 * to within six people on a track 63,000 wide. The comment it sat under said
 * "tolerance IS SAFE TO SEND ... without the answer it locates nothing", which
 * is true of a fixed band and false of a derived one.
 *
 * So the page is handed pct and floor — both properties of the KIND, neither a
 * property of the answer — and works out from its own knob where each rung
 * reaches. See rules.js zonesAround().
 *
 * A FIXED KIND ARRIVES AS pct: 0, which is not a special case but the general
 * one with the ratio term switched off: a symmetric band of the floor, exactly
 * what a fixed kind has always been.
 *
 * The widest percentage here is 0.15, so four ballparks reach 0.60 of the
 * answer and the upper edge of the outermost zone stays finite. rules.js guards
 * the case anyway, because a kind added later could cross it.
 */
export const BP_TOL = {
  "age-years": { pct: 0, floor: 1 },
  "attendance": { pct: 0.08, floor: 1000 },
  "capacity": { pct: 0.08, floor: 1000 },
  "club-domestic": { pct: 0.06, floor: 2 },
  "club-europe": { pct: 0.06, floor: 2 },
  "club-run": { pct: 0.08, floor: 2 },
  "club-season-record": { pct: 0, floor: 2 },
  "club-season-total": { pct: 0.06, floor: 3 },
  "competition-count": { pct: 0.06, floor: 2 },
  "cup-finals": { pct: 0.15, floor: 1 },
  "england-caps": { pct: 0.06, floor: 3 },
  "event-year": { pct: 0, floor: 1 },
  "fee": { pct: 0.1, floor: 250000 },
  "fee-millions": { pct: 0.1, floor: 1 },
  "fee-thousands": { pct: 0.1, floor: 25 },
  "first-trophy-year": { pct: 0, floor: 2 },
  "founding-year": { pct: 0, floor: 2 },
  "games-to-milestone": { pct: 0.04, floor: 4 },
  "ground-opened": { pct: 0, floor: 2 },
  "ground-total": { pct: 0.06, floor: 5 },
  "honours-count": { pct: 0.06, floor: 1 },
  "law-count": { pct: 0, floor: 1 },
  "law-measure": { pct: 0.02, floor: 1 },
  "league-position": { pct: 0, floor: 2 },
  "manager-career": { pct: 0.06, floor: 5 },
  "manager-season-wins": { pct: 0, floor: 2 },
  "manager-wins": { pct: 0.06, floor: 2 },
  "match-minute": { pct: 0, floor: 3 },
  "money-millions": { pct: 0.05, floor: 5 },
  "pl-apps": { pct: 0.04, floor: 5 },
  "pl-assists": { pct: 0.06, floor: 3 },
  "pl-clean-sheets": { pct: 0.06, floor: 3 },
  "pl-goals": { pct: 0.06, floor: 3 },
  "pl-reds": { pct: 0, floor: 1 },
  "pl-yellows": { pct: 0.06, floor: 3 },
  "points-deduction": { pct: 0, floor: 1 },
  "record-count": { pct: 0, floor: 1 },
  "record-points": { pct: 0.06, floor: 3 },
  "record-streak": { pct: 0, floor: 1 },
  "season-assists": { pct: 0, floor: 1 },
  "season-clean-sheets": { pct: 0, floor: 1 },
  "season-goals": { pct: 0, floor: 1 },
  "season-points": { pct: 0, floor: 2 },
  "tenure-years": { pct: 0, floor: 1 },
  "trophy-drought": { pct: 0.08, floor: 2 },
  "ucl-club-apps": { pct: 0.06, floor: 2 },
  "under-manager": { pct: 0.08, floor: 2 },
  "world-ranking": { pct: 0.1, floor: 2 },
};

/* The rule for a row, by its kind. A row whose kind is not in this table gets
   null rather than a guess: the page then draws no ballpark band, which is a
   worse page and not a leaked answer. tools/import_ballpark.js refuses such a
   row at import so it does not reach here. */
export function tolRuleFor(kind) {
  const r = BP_TOL[String(kind)];
  return r ? { pct: r.pct, floor: r.floor } : null;
}

export const BP_TOL_SOURCE_KINDS = 48;
