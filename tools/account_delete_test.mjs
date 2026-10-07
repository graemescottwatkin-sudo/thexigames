/* tools/account_delete_test.mjs — deleting an account, against the real schema.
 *
 *   node tools/account_delete_test.mjs        (from the repo root; no dependencies)
 *
 * EVERY MIGRATION IS APPLIED to an in-memory SQLite and the deletion runs on
 * it, so what is proved is the SQL itself, not a stub's reading of it.
 *
 * THE LIST OF TABLES IS ASKED OF THE SCHEMA, not written here. Every column
 * that can name a player -- user_id, created_by, reported_by, requested_by,
 * entrant_key -- is found by walking the tables the migrations made, and each
 * table so found must be reached by the deletion. A migration that adds a
 * table holding players turns this red until deletion covers it, which is the
 * point: a registry written by hand would report a pass for the table it never
 * listed.
 *
 * Then, for two players with a row in every one of those tables, deleting one
 * leaves nothing that names them -- deleted, or anonymised where the owner
 * ruled the row stays (challenges) -- and the other player's rows untouched.
 * And the route: who may, who may not, and that an Apple account whose
 * revocation fails keeps everything.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { deletionStatements, deleteAccount, mayDelete, revokeApple, appleClientSecret, DELETED_NAME }
  from "../functions/_lib/account-delete.js";
import { onRequestPost as del } from "../functions/api/account/delete.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const t = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "FAIL  "}${n}${d ? "  — " + d : ""}`); };

function freshDb() {
  const db = new DatabaseSync(":memory:");
  const mig = path.join(ROOT, "data", "migrations");
  const files = fs.readdirSync(mig).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort();
  for (const f of files) {
    const text = fs.readFileSync(path.join(mig, f), "utf8").split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
    for (const st of text.split(/;\s*(?:\n|$)/).map((x) => x.trim()).filter(Boolean)) {
      try { db.exec(st); } catch (e) { if (!/duplicate column/i.test(e.message)) throw new Error(`${f}: ${e.message}`); }
    }
  }
  return { db, files: files.length };
}
/* D1, over node:sqlite. A batch is one transaction, as D1's is. */
function d1(db, log = []) {
  const stmt = (sql, a = []) => ({ sql, a,
    bind: (...b) => stmt(sql, b),
    all: async () => ({ results: db.prepare(sql).all(...a) }),
    first: async () => db.prepare(sql).get(...a) || null,
    run: async () => { log.push("run"); return db.prepare(sql).run(...a); } });
  return { prepare: (sql) => stmt(sql), log,
    batch: async (list) => {
      log.push("batch");
      db.exec("BEGIN");
      try { for (const s of list) db.prepare(s.sql).run(...s.a); db.exec("COMMIT"); }
      catch (e) { db.exec("ROLLBACK"); throw e; }
      return [];
    } };
}

const LINK = /^(user_id|created_by|reported_by|requested_by|entrant_key)$/;
const { db, files } = freshDb();
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
const cols = (tb) => db.prepare(`PRAGMA table_info(${tb})`).all();
const linked = tables.map((tb) => ({ tb, link: cols(tb).find((c) => LINK.test(c.name)) })).filter((x) => x.link);

console.log("=== Every table that can name a player is reached ===");
t("the migrations were applied (a walk that finds nothing passes everything)", files >= 50 && tables.length >= 80,
  `${files} migrations, ${tables.length} tables`);
const sqlText = deletionStatements(d1(db), "uA", ["runA"]).map((s) => s.sql).join("\n");
t("the schema names players in at least the fifteen tables known on 7 Oct 2026, besides users", linked.length >= 15,
  linked.map((x) => x.tb + "." + x.link.name).join(", "));
const missed = linked.filter((x) => !new RegExp(`\\b${x.tb}\\b`).test(sqlText));
t("and the deletion reaches every one of them", missed.length === 0, missed.map((x) => x.tb).join(", ") || "all reached");
t("fr_lr_answer, which names a player only through their run, is reached too", /DELETE FROM fr_lr_answer WHERE run_id/.test(sqlText));
t("the user row goes last", /DELETE FROM users WHERE id = \?$/.test(sqlText.trim()));

/* ---- two players, a row each everywhere ---------------------------------- */
let seq = 0;
function fill(tb, overrides, on = db) {
  const cs = on.prepare(`PRAGMA table_info(${tb})`).all();
  const row = {};
  for (const c of cs) {
    if (c.name in overrides) { row[c.name] = overrides[c.name]; continue; }
    if (!c.notnull && !c.pk) continue;
    if (c.dflt_value !== null && !c.pk) continue;
    row[c.name] = /INT|REAL|NUM/i.test(c.type) ? ++seq : "v" + (++seq);
  }
  const names = Object.keys(row);
  on.prepare(`INSERT INTO ${tb} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`).run(...names.map((n) => row[n]));
}
const val = (link, who) => (link.name === "entrant_key" ? "u:" + who : who);
for (const who of ["uA", "uB"]) {
  fill("users", { id: who, provider: "google", provider_id: "g-" + who, display_name: who === "uA" ? "Rachel Green" : "Ross Geller" });
  for (const { tb, link } of linked) {
    if (tb === "users") continue;
    const o = { [link.name]: val(link, who) };
    if (tb === "fr_lr_run") o.run_id = "run" + who.slice(1);
    if (/^challenge/.test(tb)) o.name = o.creator_name = who === "uA" ? "Rachel Green" : "Ross Geller";
    if (tb === "challenges") o.group_name = "Central Perk";
    fill(tb, o);
  }
  fill("fr_lr_answer", { run_id: "run" + who.slice(1) });
}
const count = (tb, where, ...b) => db.prepare(`SELECT COUNT(*) AS n FROM ${tb} WHERE ${where}`).get(...b).n;
const namesA = () => linked.filter(({ tb, link }) => count(tb, `${link.name} = ?`, val(link, "uA")) > 0).map((x) => x.tb);
const rowsOfB = () => linked.map(({ tb, link }) => count(tb, `${link.name} = ?`, val(link, "uB"))).join(",") +
  "|" + count("fr_lr_answer", "run_id = 'runB'");

console.log("\n=== Deleting one player ===");
t("PRECONDITION: before, the player is named in every one of those tables", namesA().length === linked.length,
  `${namesA().length} of ${linked.length}`);
const bBefore = rowsOfB();
const env = { DB: d1(db) };
await deleteAccount(env, "uA");
t("after, nothing anywhere names them", namesA().length === 0, namesA().join(", ") || "none");
t("their Lightning picks went with their run", count("fr_lr_answer", "run_id = 'runA'") === 0);
t("the other player's rows are all still there", rowsOfB() === bBefore, rowsOfB());
t("in one batch -- one transaction, all of it or none -- and nothing written outside it",
  env.DB.log.filter((x) => x === "batch").length === 1 && !env.DB.log.includes("run"), env.DB.log.join(","));
t("the challenge they made stays, as \"Deleted player\", its group name cleared",
  count("challenges", "creator_name = ? AND created_by IS NULL AND group_name IS NULL", DELETED_NAME) === 1);
t("their challenge entry stays, so the others keep the table, as \"Deleted player\"",
  count("challenge_entries", "name = ? AND entrant_key LIKE 'deleted:%'", DELETED_NAME) === 1 &&
  count("challenge_starts", "name = ? AND entrant_key LIKE 'deleted:%'", DELETED_NAME) === 1);
t("their clue report and theme request stay, unlinked", count("clue_reports", "reported_by IS NULL") === 1 &&
  count("theme_requests", "requested_by IS NULL") === 1);
t("and the player's name is nowhere in a table that could hold it",
  tables.every((tb) => { const cs = cols(tb).filter((c) => /TEXT/i.test(c.type)).map((c) => c.name);
    return !cs.length || count(tb, cs.map((c) => `${c} = 'Rachel Green'`).join(" OR ")) === 0; }));

console.log("\n=== Who may ===");
t("a player may", mayDelete({ id: "x" }) === true);
t("the owner's admin account may not, nor the playbot", mayDelete({ id: "x", is_admin: 1 }) === false &&
  mayDelete({ id: "x", is_bot: 1 }) === false && mayDelete(null) === false);

/* ---- the route ----------------------------------------------------------- */
console.log("\n=== The route ===");
const R = freshDb().db;
const RENV = (extra = {}) => ({ DB: d1(R), ...extra });
const person = (id, provider, extra = {}) => {
  R.prepare("INSERT INTO users (id, provider, provider_id, display_name, is_admin, is_bot) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, provider, "p-" + id, id, extra.is_admin || 0, extra.is_bot || 0);
  R.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run("s-" + id, id, "2999-01-01T00:00:00Z");
  fill("results", { user_id: id }, R);
};
const ask = (id, body, { csrf = true, env = RENV() } = {}) => del({ env, request: new Request("https://www.thexigames.com/api/account/delete", {
  method: "POST", body: JSON.stringify(body),
  headers: { "Content-Type": "application/json", ...(csrf ? { "X-XI-Games": "1" } : {}), ...(id ? { Cookie: "cxi_session=s-" + id } : {}) } }) });
const still = (id) => R.prepare("SELECT COUNT(*) AS n FROM users WHERE id = ?").get(id).n === 1 &&
  R.prepare("SELECT COUNT(*) AS n FROM results WHERE user_id = ?").get(id).n === 1;
person("plain", "google"); person("boss", "google", { is_admin: 1 }); person("bot", "code", { is_bot: 1 }); person("apple1", "apple");
t("no family header: refused", (await ask("plain", { confirm: "DELETE" }, { csrf: false })).status === 403 && still("plain"));
t("not typed DELETE: refused", (await ask("plain", { confirm: "delete" })).status === 400 && still("plain"));
t("signed out: refused", (await ask(null, { confirm: "DELETE" })).status === 401);
t("the admin and the playbot: refused, and kept", (await ask("boss", { confirm: "DELETE" })).status === 403 &&
  (await ask("bot", { confirm: "DELETE" })).status === 403 && still("boss") && still("bot"));
const ap = await ask("apple1", { confirm: "DELETE" });
t("an Apple account with Apple's keys not set: refused, nothing deleted", ap.status === 503 && still("apple1"), String(ap.status));
const APPLE_ENV = { APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "x" };
const nocode = await ask("apple1", { confirm: "DELETE", identityToken: "a.b.c", rawNonce: "n" }, { env: RENV(APPLE_ENV) });
t("an Apple account with no code from Apple (an older app): refused, nothing deleted", nocode.status === 400 && still("apple1"));
const forged = await ask("apple1", { confirm: "DELETE", identityToken: "a.b.c", rawNonce: "n", authorizationCode: "c" }, { env: RENV(APPLE_ENV) });
t("an Apple token that does not verify: refused, nothing deleted", forged.status === 401 && still("apple1"), String(forged.status));
const ok = await ask("plain", { confirm: "DELETE" });
t("a player who typed DELETE: deleted, and signed out by the cookie", ok.status === 200 && !still("plain") &&
  /cxi_session=;.*Max-Age=0/.test(ok.headers.get("Set-Cookie") || ""), ok.headers.get("Set-Cookie"));
t("and their session is gone with them", R.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'plain'").get().n === 0);

/* ---- revoking with Apple --------------------------------------------------- */
console.log("\n=== Revoking with Apple ===");
{
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", kp.privateKey)).toString("base64");
  const AENV = { APPLE_TEAM_ID: "TEAM123", APPLE_KEY_ID: "KEY456",
    APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\n" + der.match(/.{1,64}/g).join("\n") + "\n-----END PRIVATE KEY-----\n" };
  const jwt = await appleClientSecret(AENV, "com.thexigames.app", Date.UTC(2026, 9, 7));
  const [h, p, s] = jwt.split(".");
  const dec = (x) => JSON.parse(Buffer.from(x.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  const good = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, kp.publicKey,
    Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"), new TextEncoder().encode(h + "." + p));
  t("the client secret is an ES256 JWT, signed by the team's key, for the app the code came from",
    dec(h).alg === "ES256" && dec(h).kid === "KEY456" && dec(p).iss === "TEAM123" && dec(p).sub === "com.thexigames.app" &&
      dec(p).aud === "https://appleid.apple.com" && dec(p).exp - dec(p).iat === 300 && good, JSON.stringify([dec(h), dec(p)]));
  const calls = [];
  const stub = (answers) => async (url, init) => { calls.push([url, new URLSearchParams(init.body)]); const a = answers.shift();
    return { ok: a.status === 200, status: a.status, json: async () => a.body || {} }; };
  calls.length = 0;
  const yes = await revokeApple(AENV, { code: "c1", clientId: "com.thexigames.quizzes" },
    stub([{ status: 200, body: { refresh_token: "rt" } }, { status: 200 }]));
  t("a code is exchanged, then the refresh token it yields is revoked, for that app",
    yes === true && calls.length === 2 && /auth\/token$/.test(calls[0][0]) && calls[0][1].get("code") === "c1" &&
      calls[0][1].get("grant_type") === "authorization_code" && /auth\/revoke$/.test(calls[1][0]) &&
      calls[1][1].get("token") === "rt" && calls[1][1].get("token_type_hint") === "refresh_token" &&
      calls[1][1].get("client_id") === "com.thexigames.quizzes");
  calls.length = 0;
  t("a code Apple refuses revokes nothing and says no",
    (await revokeApple(AENV, { code: "c2", clientId: "com.thexigames.app" }, stub([{ status: 400 }]))) === false && calls.length === 1);
  t("a revocation Apple refuses says no",
    (await revokeApple(AENV, { code: "c3", clientId: "com.thexigames.app" },
      stub([{ status: 200, body: { refresh_token: "rt" } }, { status: 400 }]))) === false);
  t("no code says no without asking Apple", (await revokeApple(AENV, { code: "", clientId: "x" }, stub([]))) === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
