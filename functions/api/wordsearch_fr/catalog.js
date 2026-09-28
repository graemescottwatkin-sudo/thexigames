/* GET /api/wordsearch_fr/catalog — every released board: id, theme,
   category. Identity only; today's board and unreleased ones are absent. */
import { catalog } from "../../_lib/frws-data.js";
import { json } from "../../_lib/frws-http.js";

export async function onRequestGet({ env }) {
  return json({ boards: await catalog(env) });
}
