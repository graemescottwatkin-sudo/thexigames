/* POST /api/auth/apple  { identityToken, rawNonce, givenName?, familyName?, email? }
 *
 * Sign in with Apple, from the iOS app only: its XiAppleSignIn plugin gets an
 * identity token from Apple and posts it here with the raw nonce it hashed
 * into the request. Verified against Apple's public keys before anything is
 * trusted, as /api/auth/google does with Google's.
 *
 * THE NAME COMES FROM THE BODY, AND ONLY ONCE. Apple never puts a name in the
 * token and sends one to the app only on the very first authorisation, so it
 * is used when the account is created and never touched after: a later
 * sign-in with no name must not blank the one the player has.
 *
 * NO LINKING BY EMAIL. Apple may give a private relay address, and an email
 * match is not proof two sign-ins are one person. The device code already
 * links devices and accounts.
 */
import { json, bad } from "../../_lib/puzzle.js";
import { hasDB } from "../../_lib/db.js";
import {
  verifyAppleIdToken, APPLE_AUDIENCE, findOrCreateUser, createSession,
  sessionCookie, publicUser, csrfOk,
} from "../../_lib/auth.js";
import { limited } from "../../_lib/limit.js";

/* After verification: the account for this Apple ID, found or made. Its own
   function so the suite can run the name rule without Apple's live keys. */
export async function appleUser(env, claims, body) {
  const clip = (v) => (typeof v === "string" ? v.trim().slice(0, 40) : "");
  const name = [clip(body.givenName), clip(body.familyName)].filter(Boolean).join(" ");
  /* With no name, findOrCreateUser falls back to the email's local part --
     which for Apple's private relay is a random string, not a name. */
  const relay = /@privaterelay\.appleid\.com$/i.test(String(claims.email || ""));
  return findOrCreateUser(env, "apple", claims.sub, {
    email: claims.email || null, name: name || (relay ? "Player" : null),
  });
}

export async function onRequestPost({ request, env }) {
  if (await limited(env, request, "signin", 20, 3600))
    return json({ error: "Too many requests. Give it a minute." }, 429);
  if (!csrfOk(request)) return bad("Missing request header.", 403);
  if (!hasDB(env)) return bad("Accounts need the D1 binding — see README step F.", 503);

  let body;
  try { body = await request.json(); } catch (e) { return bad("Expected a JSON body."); }
  if (!body || !body.identityToken || !body.rawNonce) return bad("No credential supplied.");

  let claims;
  try {
    claims = await verifyAppleIdToken(body.identityToken, env.APPLE_AUDIENCE || APPLE_AUDIENCE,
      String(body.rawNonce));
  } catch (e) {
    // Never echo the reason back: it tells an attacker which check they failed.
    return bad("Could not verify that sign-in.", 401);
  }

  const { user, created } = await appleUser(env, claims, body);
  const session = await createSession(env, user.id);

  return json({ user: publicUser(user), created }, 200,
    { "Set-Cookie": sessionCookie(session.id, session.expires, request) });
}
