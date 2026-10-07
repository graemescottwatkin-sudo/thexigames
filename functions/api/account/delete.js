/* POST /api/account/delete — delete the signed-in player's account, at once.
 *
 * The confirmation is the word DELETE, typed, after the page has said what
 * goes (functions/_lib/account-delete.js has the owner's spec and rulings).
 * A Sign in with Apple account brings a fresh Apple code as well, and is
 * revoked with Apple BEFORE anything here is deleted: a revocation that fails
 * deletes nothing, rather than leaving an account Apple still thinks is linked.
 * Signed out afterwards, by the cookie this answer clears.
 */
import { json, bad } from "../../_lib/puzzle.js";
import { hasDB } from "../../_lib/db.js";
import { currentUser, csrfOk, clearedCookie, verifyAppleIdToken, APPLE_AUDIENCES } from "../../_lib/auth.js";
import { limited } from "../../_lib/limit.js";
import { deleteAccount, mayDelete, appleConfigured, revokeApple } from "../../_lib/account-delete.js";

export async function onRequestPost({ request, env }) {
  if (!csrfOk(request)) return bad("Missing request header.", 403);
  if (!hasDB(env)) return bad("Accounts are not available here.", 503);
  if (await limited(env, request, "account-delete", 10, 3600))
    return json({ error: "Too many requests. Give it a minute." }, 429);
  let body;
  try { body = await request.json(); } catch (e) { return bad("Expected a JSON body."); }
  if (!body || body.confirm !== "DELETE") return bad("Type DELETE to confirm.");

  const user = await currentUser(request, env);
  if (!user) return bad("You are not signed in.", 401);
  if (!mayDelete(user)) return bad("This account cannot be deleted from here.", 403);

  if (user.provider === "apple") {
    if (!appleConfigured(env)) return bad("Deleting an Apple account is not switched on yet. Try again later.", 503);
    if (!body.identityToken || !body.rawNonce || !body.authorizationCode)
      return bad("Could not confirm with Apple. Update the app, then try again.", 400);
    let claims;
    try {
      claims = await verifyAppleIdToken(body.identityToken,
        env.APPLE_AUDIENCE ? String(env.APPLE_AUDIENCE).split(",").map((s) => s.trim()).filter(Boolean) : APPLE_AUDIENCES,
        String(body.rawNonce));
    } catch (e) {
      return bad("Could not confirm with Apple.", 401);
    }
    /* The Apple account confirmed must be THIS account. */
    if (String(claims.sub) !== String(user.provider_id)) return bad("That is a different Apple account.", 403);
    let revoked = false;
    try { revoked = await revokeApple(env, { code: String(body.authorizationCode), clientId: claims.aud }); }
    catch (e) { revoked = false; }
    if (!revoked) return bad("Apple could not confirm the deletion. Nothing has been deleted; try again.", 502);
  }

  await deleteAccount(env, user.id);
  return json({ deleted: true }, 200, { "Set-Cookie": clearedCookie(request) });
}
