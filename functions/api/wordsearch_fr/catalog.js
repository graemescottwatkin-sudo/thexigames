/* GET /api/wordsearch_fr/catalog — every released board: id, theme,
   category. Identity only; today's board and unreleased ones are absent. */
import { catalog } from "../../_lib/frws-data.js";
import { json } from "../../_lib/frws-http.js";
import { clockFor } from "../../_lib/preview.js";

export async function onRequestGet(context) {
  const { env } = context;
  /* The request's day: real, or an admin's preview day. */
  return json({ boards: await catalog(env, (await clockFor(context)).now) });
}
