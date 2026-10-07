/* account-delete.js — deleting a player's account, for good.
 *
 * THE OWNER'S GO, 6 Oct 2026, to a spec both app stores require: a "Delete
 * account" button in the account sheet, a double confirmation (what goes, then
 * typing DELETE), deletion at once with no grace period, and on Sign in with
 * Apple the account revoked through Apple's REST API as well.
 *
 * WHAT GOES IS DERIVED FROM THE MIGRATIONS, not from the request that asked
 * for it: every table that can hold a row for one player was read out of
 * data/migrations (000-base to 055-review-flags) and classified on 7 Oct 2026.
 * Sixteen tables carry a user directly; one more (fr_lr_answer) through a run
 * the player owns. `plays` and the per-game round tables carry NO user -- they
 * were anonymous by design and the privacy page says so -- so nothing there
 * is reachable from an account, and the owner chose to leave the few rows a
 * challenge entry points at ("Leave them"): once the entry is anonymised they
 * point at nobody.
 *
 * The owner's rulings on the rest, 7 Oct 2026:
 *   - challenges stay, so the other entrants keep their scores; the deleted
 *     player becomes "Deleted player", and a group name they typed is cleared;
 *   - clue reports and theme requests are kept, unlinked from the account;
 *   - the owner's admin account and the playbot cannot delete themselves.
 *
 * ONE BATCH. D1 runs a batch as one transaction, so a deletion is all of it
 * or none of it -- results gone and a season still standing is a state no
 * player should be able to reach (the same reason the admin route's reset is
 * batched). Children before parents, the user row last.
 */
export const DELETED_NAME = "Deleted player";

/* The statements, for one user. Exported so a suite can run them against the
   real migrations and prove every table is reached. */
export function deletionStatements(db, userId, lrRunIds) {
  const q = (sql, ...binds) => db.prepare(sql).bind(...binds);
  return [
    ...lrRunIds.map((id) => q("DELETE FROM fr_lr_answer WHERE run_id = ?", id)),
    q("DELETE FROM fr_lr_run WHERE user_id = ?", userId),
    q("DELETE FROM fr_lr_seen WHERE user_id = ?", userId),
    /* Anonymised, not deleted: the other entrants keep their table. The key
       stays unique per challenge -- it is part of a UNIQUE index -- and a key
       with a colon can never be one a client sends. */
    q("UPDATE challenge_entries SET name = ?, entrant_key = 'deleted:' || id WHERE entrant_key = 'u:' || ?", DELETED_NAME, userId),
    q("UPDATE challenge_starts SET name = ?, entrant_key = 'deleted:' || id WHERE entrant_key = 'u:' || ?", DELETED_NAME, userId),
    q("UPDATE challenges SET created_by = NULL, creator_name = ?, group_name = NULL WHERE created_by = ?", DELETED_NAME, userId),
    q("DELETE FROM board_state WHERE user_id = ?", userId),
    q("DELETE FROM season_play WHERE user_id = ?", userId),
    q("DELETE FROM source_press WHERE user_id = ?", userId),
    q("DELETE FROM push_outbox WHERE user_id = ?", userId),
    q("DELETE FROM push_device WHERE user_id = ?", userId),
    q("UPDATE clue_reports SET reported_by = NULL WHERE reported_by = ?", userId),
    q("UPDATE theme_requests SET requested_by = NULL WHERE requested_by = ?", userId),
    q("UPDATE review_flags SET created_by = NULL WHERE created_by = ?", userId),
    q("DELETE FROM results WHERE user_id = ?", userId),
    q("DELETE FROM sessions WHERE user_id = ?", userId),
    q("DELETE FROM users WHERE id = ?", userId),
  ];
}

export async function deleteAccount(env, userId) {
  const runs = ((await env.DB.prepare("SELECT run_id FROM fr_lr_run WHERE user_id = ?")
    .bind(userId).all()).results || []).map((r) => r.run_id);
  await env.DB.batch(deletionStatements(env.DB, userId, runs));
}

/* WHO MAY NOT. The owner's account holds /admin/, and the playbot's single
   account id is what its plays are counted under (042-bot-plays). */
export function mayDelete(user) {
  return !!user && !user.is_admin && !user.is_bot;
}

/* ---- Apple ----------------------------------------------------------------
 *
 * SIGN IN WITH APPLE MUST BE REVOKED, by Apple's rule for apps that offer it.
 * Revoking takes a refresh or access token, and those come only from
 * exchanging an authorization code. The owner chose to ask Apple again at the
 * moment of deletion rather than keep a token from every sign-in ("Re-confirm
 * with Apple"), so nothing of Apple's is ever stored here: the app's plugin
 * (0.1.15 on) hands over a fresh code, it is exchanged at once -- Apple's codes
 * are single-use and live about five minutes -- and the token it yields is
 * revoked straight away.
 *
 * THE SECRETS ARE THE OWNER'S, set in Cloudflare and never seen here:
 * APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY (the .p8 file's text). The
 * client id is the app the code was issued to, read from the verified
 * identity token's audience, so either app's players can delete.
 */
export function appleConfigured(env) {
  return !!(env && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
}

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = (s) => b64url(new TextEncoder().encode(s));

/* The client secret Apple asks for: a JWT signed ES256 with the team's key. */
export async function appleClientSecret(env, clientId, now = Date.now()) {
  const pem = String(env.APPLE_PRIVATE_KEY).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const iat = Math.floor(now / 1000);
  const head = b64urlText(JSON.stringify({ alg: "ES256", kid: env.APPLE_KEY_ID }));
  const body = b64urlText(JSON.stringify({
    iss: env.APPLE_TEAM_ID, iat, exp: iat + 300, aud: "https://appleid.apple.com", sub: clientId,
  }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key,
    new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + b64url(sig);
}

/* Exchange the code and revoke what it yields. Resolves true only when Apple
   said yes to both; anything else is false and nothing may be deleted. */
export async function revokeApple(env, { code, clientId }, fetchFn = fetch) {
  if (!code || !clientId) return false;
  const secret = await appleClientSecret(env, clientId);
  const form = (o) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(o).toString() });
  const tok = await fetchFn("https://appleid.apple.com/auth/token",
    form({ client_id: clientId, client_secret: secret, code, grant_type: "authorization_code" }));
  if (!tok.ok) return false;
  const t = await tok.json().catch(() => ({}));
  const token = t.refresh_token || t.access_token;
  if (!token) return false;
  const rev = await fetchFn("https://appleid.apple.com/auth/revoke",
    form({ client_id: clientId, client_secret: secret, token,
      token_type_hint: t.refresh_token ? "refresh_token" : "access_token" }));
  return rev.status === 200;
}
