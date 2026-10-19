// Builds the results tables for REPORT.md from before/ and after/ results.json.
//   node scripts/mobile-audit/report.mjs > scripts/mobile-audit/report-tables.md

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const load = (phase) => {
  const p = join(here, phase, "results.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
};
const before = load("before");
const after = load("after");

const MOBILE = [320, 375, 390, 430];
const key = (r) => `${r.account}|${r.route}`;

// Layout totals. "expected-block" rows passed on layout (the guard set that
// status only because the page made a request on EXPECTED_BLOCKS), so they
// count as passes and are also counted on their own. "blocked-write" rows had
// an unexpected blocked request, which fails the run, so they count as fails.
// Only rows that were never measured (not reached, error, no session) are
// "other".
const isLayoutPass = (r) => r.status === "pass" || r.status === "expected-block";
const summarise = (rows, widths) => {
  const s = { pass: 0, expected: 0, fail: 0, other: 0 };
  for (const r of rows.filter((r) => widths.includes(r.width))) {
    if (isLayoutPass(r)) s.pass++;
    if (r.status === "expected-block") s.expected++;
    else if (r.status === "fail" || r.status === "blocked-write") s.fail++;
    else if (r.status !== "pass") s.other++;
  }
  return s;
};

const cell = (rows, k) => {
  const byW = MOBILE.map((w) => rows.find((r) => key(r) === k && r.width === w));
  if (byW.every((r) => !r)) return "–";
  if (byW.every((r) => r && isLayoutPass(r)))
    return byW.some((r) => r.status === "expected-block") ? "pass (expected block)" : "pass";
  return byW
    .map((r, i) => (!r ? `${MOBILE[i]}:–` : isLayoutPass(r) ? null : `${MOBILE[i]}:${r.status}`))
    .filter(Boolean)
    .join(" ");
};

const offenders = (rows, k) => {
  const all = rows.filter((r) => key(r) === k && r.offenders?.length).flatMap((r) => r.offenders.map((o) => o.el));
  return [...new Set(all)].slice(0, 3).map((s) => s.replace(/\|/g, "/").slice(0, 110)).join("<br>");
};

const b = summarise(before, MOBILE);
const a = summarise(after, MOBILE);
console.log(`| | pass | of which expected blocks | fail | not reached / error / no session |`);
console.log(`|---|---|---|---|---|`);
console.log(`| Before (mobile widths) | ${b.pass} | ${b.expected} | ${b.fail} | ${b.other} |`);
console.log(`| After (mobile widths) | ${a.pass} | ${a.expected} | ${a.fail} | ${a.other} |`);
const d = summarise(after, [768, 1280]);
console.log(`| After (768 / 1280) | ${d.pass} | ${d.expected} | ${d.fail} | ${d.other} |`);
console.log();

const keys = [...new Set([...before, ...after].map(key))];
console.log(`| Account | Route | Before (320/375/390/430) | Before offenders | After | After offenders |`);
console.log(`|---|---|---|---|---|---|`);
for (const k of keys) {
  const [account, route] = k.split("|");
  console.log(
    `| ${account} | \`${route}\` | ${cell(before, k)} | ${offenders(before, k) || ""} | ${cell(after, k)} | ${offenders(after, k) || ""} |`,
  );
}
