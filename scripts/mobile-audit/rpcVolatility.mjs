// Reads supabase/migrations (in filename order) and works out the latest
// declared volatility of every public function, per overload. Used by the
// audit's network guard: an RPC may be called only if EVERY live overload of
// that name is declared STABLE or IMMUTABLE (Postgres rejects writes inside
// those). Functions not defined in the migrations (dashboard-created) are
// unknown and stay blocked.
//
//   node scripts/mobile-audit/rpcVolatility.mjs some_rpc other_rpc   # print verdicts

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, "..", "..", "supabase", "migrations");

// Line comments only; enough to stop "-- drop function public.x(...)" notes
// in migration headers from being read as statements.
const stripComments = (sql) => sql.replace(/--[^\n]*/g, "");

// Splits an argument list on top-level commas.
const splitArgs = (s) => {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
};

// Overload key: argument types only, so CREATE (named params, defaults) and
// DROP (types only) of the same overload produce the same key. Uncertain
// parses only ever leave an extra stale entry, which errs towards blocking.
const signatureKey = (args) =>
  splitArgs(args)
    .map((a) => {
      let t = a.replace(/\s+(DEFAULT|=)\s+[\s\S]*$/i, "").trim();
      t = t.replace(/^(IN|OUT|INOUT|VARIADIC)\s+/i, "");
      const parts = t.split(/\s+/);
      if (parts.length > 1 && !/^(double|character|timestamp|time|bit)$/i.test(parts[0])) parts.shift();
      return parts.join(" ").toLowerCase().replace(/"/g, "");
    })
    .join(",");

// Reads from just after the opening "(" to its matching ")".
const readParens = (sql, start) => {
  let depth = 1;
  let i = start;
  while (i < sql.length && depth > 0) {
    if (sql[i] === "(") depth++;
    if (sql[i] === ")") depth--;
    i++;
  }
  return { inner: sql.slice(start, i - 1), end: i };
};

const VOL = /\b(IMMUTABLE|STABLE|VOLATILE)\b/i;

export const loadFunctionVolatility = () => {
  const fns = new Map(); // name -> Map(signature -> { volatility, file })
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = stripComments(readFileSync(join(MIGRATIONS, file), "utf8"));
    const stmt = /\b(CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|ALTER\s+FUNCTION|DROP\s+FUNCTION(?:\s+IF\s+EXISTS)?)\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
    let m;
    while ((m = stmt.exec(sql))) {
      const kind = m[1].split(/\s+/)[0].toUpperCase();
      const name = m[2].toLowerCase();
      const { inner, end } = readParens(sql, stmt.lastIndex);
      const sig = signatureKey(inner);
      const sigs = fns.get(name) ?? new Map();
      if (kind === "DROP") {
        sigs.delete(sig);
        fns.set(name, sigs);
        continue;
      }
      if (kind === "ALTER") {
        const tail = sql.slice(end, sql.indexOf(";", end));
        const v = tail.match(VOL);
        if (v && sigs.has(sig)) sigs.set(sig, { volatility: v[1].toUpperCase(), file });
        fns.set(name, sigs);
        continue;
      }
      // CREATE: volatility may sit before the body (AS $tag$ ... $tag$) or after it.
      const asMatch = /\bAS\s+(\$[a-z_0-9]*\$)/gi;
      asMatch.lastIndex = end;
      const as = asMatch.exec(sql);
      let header = "";
      let trailer = "";
      if (as) {
        header = sql.slice(end, as.index);
        const bodyStart = asMatch.lastIndex;
        const close = sql.indexOf(as[1], bodyStart);
        const after = close === -1 ? bodyStart : close + as[1].length;
        trailer = sql.slice(after, sql.indexOf(";", after));
        stmt.lastIndex = after;
      } else {
        // AS '...' single-quoted body or BEGIN ATOMIC: read to the next ;
        header = sql.slice(end, sql.indexOf(";", end));
      }
      const v = header.match(VOL) ?? trailer.match(VOL);
      sigs.set(sig, { volatility: v ? v[1].toUpperCase() : "VOLATILE", file });
      fns.set(name, sigs);
    }
  }
  return fns;
};

// "allowed" only when every live overload is STABLE or IMMUTABLE.
export const rpcVerdict = (fns, name) => {
  const sigs = fns.get(name.toLowerCase());
  if (!sigs || sigs.size === 0) return { allowed: false, reason: "not defined in migrations" };
  const list = [...sigs.values()];
  const volatile = list.filter((d) => d.volatility === "VOLATILE");
  if (volatile.length) return { allowed: false, reason: `VOLATILE (${volatile.map((d) => d.file).join(", ")})` };
  return { allowed: true, reason: list.map((d) => `${d.volatility} (${d.file})`).join(", ") };
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fns = loadFunctionVolatility();
  for (const n of process.argv.slice(2)) {
    const v = rpcVerdict(fns, n);
    console.log(`${v.allowed ? "ALLOW" : "BLOCK"}  ${n}  ${v.reason}`);
  }
}
