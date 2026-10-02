/* tools/sql_values.js — reading back a row an importer wrote.
 *
 * Importers that guard against the LAST load read their own previous SQL, and
 * they read it here, once. It began inside tools/import_quickfire.js (30 Sep
 * 2026), where nothing else could reach it: importing that file runs the
 * import. The Friends Who Am I citation guard (2 Oct 2026) needed the same
 * reading, and a second copy is a second answer about what a row says.
 *
 * READ AS VALUES, NOT AS THE NTH QUOTED STRING: a NULL is written unquoted, and
 * counting quoted strings slides every later column one place left -- the
 * parsing fault that misreported 69 Who Am I players on 30 Sep 2026. */

/* The values of one VALUES list, without its brackets: strings unescaped, NULL
   as null, anything else (a number, datetime('now')) as its text. */
export function sqlValues(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    while (text[i] === " " || text[i] === ",") i++;
    if (i >= text.length) break;
    if (text[i] === "'") {
      let v = "";
      i++;
      for (;;) {
        if (i >= text.length) throw new Error("an unterminated string in a row");
        if (text[i] === "'" && text[i + 1] === "'") { v += "'"; i += 2; }
        else if (text[i] === "'") { i++; break; }
        else v += text[i++];
      }
      out.push(v);
    } else {
      /* NULL, a number, or a call such as datetime('now'): up to the next comma
         outside any brackets, a quoted argument copied whole. */
      let v = "", depth = 0;
      while (i < text.length && !(depth === 0 && text[i] === ",")) {
        const c = text[i];
        if (c === "'") {
          v += c; i++;
          while (i < text.length && text[i] !== "'") v += text[i++];
          v += text[i++];
          continue;
        }
        if (c === "(") depth++;
        if (c === ")") depth--;
        v += c; i++;
      }
      v = v.trim();
      out.push(v === "NULL" ? null : v);
    }
  }
  return out;
}

/* One whole `INSERT INTO t (cols) VALUES (...)` line, as { table, row }, or null
   for any other line. It stops at the bracket that closes the VALUES list, so
   whatever follows -- ON CONFLICT ... DO UPDATE, as the Who Am I importer
   writes -- is not read as more values. */
export function sqlInsert(line) {
  const m = /^INSERT(?: OR \w+)? INTO (\w+) \(([^)]*)\) VALUES \(/.exec(line);
  if (!m) return null;
  const start = m[0].length;
  let i = start, depth = 1, quoted = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === "'" && line[i + 1] === "'") i++;
      else if (c === "'") quoted = false;
    } else if (c === "'") quoted = true;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) break;
  }
  if (depth !== 0) throw new Error(`an unclosed VALUES list in a row of ${m[1]}`);
  const cols = m[2].split(",").map((c) => c.trim());
  const vals = sqlValues(line.slice(start, i));
  if (vals.length !== cols.length) throw new Error(`a row of ${m[1]} with ${vals.length} values for ${cols.length} columns`);
  const row = {};
  cols.forEach((c, k) => { row[c] = vals[k]; });
  return { table: m[1], row };
}
