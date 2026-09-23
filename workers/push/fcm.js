/* fcm.js — sending one message through Firebase Cloud Messaging (HTTP v1).
 *
 * THE KEY. A Google service-account key, as the JSON file Google hands out,
 * stored as the Worker secret FCM_SERVICE_ACCOUNT:
 *
 *   npx wrangler secret put FCM_SERVICE_ACCOUNT --config workers/push/wrangler.toml
 *
 * It is never in the repo. This folder is in the Pages tree, and everything
 * in that tree that is not a Function is served to the public, so this file
 * and its neighbours must never hold anything secret.
 *
 * How it authenticates: sign a short JWT with the key (RS256, WebCrypto),
 * trade it at Google's token endpoint for an hour-long access token, and send
 * with that. The access token is cached for the life of the isolate, less a
 * minute's margin.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const b64urlText = (s) => b64url(new TextEncoder().encode(s));

function pemToDer(pem) {
  const body = String(pem || "")
    .replace(/-----BEGIN [A-Z ]+-----/, "")
    .replace(/-----END [A-Z ]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* An RS256 JWT over `claims`, signed with a PKCS#8 PEM key. */
export async function signJwt(claims, privateKeyPem) {
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64urlText(JSON.stringify(claims));
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + b64url(new Uint8Array(sig));
}

/* The service account, read and checked once. Throws with a sentence that
   says which part is missing, never with the key's contents. */
export function readServiceAccount(raw) {
  let sa;
  try { sa = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { sa = null; }
  if (!sa || typeof sa !== "object") throw new Error("FCM_SERVICE_ACCOUNT is not JSON");
  for (const k of ["client_email", "private_key", "project_id"]) {
    if (!sa[k]) throw new Error("FCM_SERVICE_ACCOUNT has no " + k);
  }
  return sa;
}

/* What FCM said, as the three outcomes the sender acts on. GONE means the
   token will never work again (the app was uninstalled, or the token was
   rotated), and the row is deleted. Anything else is a failure to retry on
   the next run. */
export const SENT = "sent", GONE = "gone", FAILED = "failed";

export function outcomeOf(status, body) {
  if (status >= 200 && status < 300) return SENT;
  const err = (body && body.error) || {};
  const codes = (err.details || []).map((d) => d && d.errorCode).filter(Boolean);
  if (codes.includes("UNREGISTERED")) return GONE;
  if (status === 404) return GONE;
  /* A token FCM cannot parse will never parse. It is refused with 400 and
     INVALID_ARGUMENT, and so is a malformed message. The token is only
     blamed when the message says the token is the problem. */
  if (status === 400 && codes.includes("INVALID_ARGUMENT") &&
      /registration token/i.test(String(err.message || ""))) return GONE;
  return FAILED;
}

/* A sender: send(token, message) -> SENT | GONE | FAILED.
   `message` is { channel, title, body, address }. */
export function fcmSender(serviceAccount, fetchFn = fetch, clock = Date.now) {
  const sa = readServiceAccount(serviceAccount);
  let cached = null;

  async function accessToken() {
    const now = clock();
    if (cached && cached.until > now) return cached.token;
    const iat = Math.floor(now / 1000);
    const assertion = await signJwt(
      { iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 },
      sa.private_key);
    const res = await fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") +
            "&assertion=" + encodeURIComponent(assertion),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) throw new Error("Google refused the service account (" + res.status + ")");
    cached = { token: j.access_token, until: now + (Number(j.expires_in) || 3600) * 1000 - 60000 };
    return cached.token;
  }

  return async function send(token, message) {
    const bearer = await accessToken();
    const res = await fetchFn(
      "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(sa.project_id) + "/messages:send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + bearer },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            /* The channel ids are the app's, in its strings.xml. A player
               switches each channel off in Android's settings, which is why
               there are two rather than one. */
            android: { notification: { channel_id: message.channel } },
            data: { url: message.address },
          },
        }),
      });
    const body = await res.json().catch(() => null);
    return outcomeOf(res.status, body);
  };
}
