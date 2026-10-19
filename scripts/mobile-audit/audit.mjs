// Mobile layout audit. For each route x account x width: full-page
// screenshot, document overflow check, and a list of the elements that stick
// out past the viewport.
//
//   node scripts/mobile-audit/audit.mjs before
//   node scripts/mobile-audit/audit.mjs after --desktop      # also 768 / 1280
//   node scripts/mobile-audit/audit.mjs after --only=business,personal
//
// Accounts without a saved session (.auth/<account>.json, see login.mjs) are
// recorded as "no session" and skipped.
//
// READ-ONLY GUARD: this runs against the live Supabase project and live Stripe.
// Supabase: GET/HEAD pass. Of everything else, only these pass:
//   - POST /rest/v1/rpc/<name> where every live overload of <name> is declared
//     STABLE or IMMUTABLE in supabase/migrations (rpcVolatility.mjs), except
//     log_search_appearance, which is always blocked
//   - POST /storage/v1/object/sign/... (signed URLs)
//   - POST /auth/v1/token?grant_type=refresh_token (keeps the session alive)
// Edge functions (/functions/v1/) never pass anything but GET/HEAD.
// Stripe: GET passes; non-GET to the telemetry hosts r.stripe.com and
// m.stripe.com is aborted silently; any other non-GET is blocked.
// A blocked request marks the row "blocked-write", is listed in
// <phase>/blocked.json and makes the run exit non-zero, unless it is on
// EXPECTED_BLOCKS: then it is still blocked but recorded as "expected-block"
// and does not fail the run. Clicks are limited to
// the allowlist in routes.mjs (safeClick).

import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCOUNT_ROUTES,
  BASE_URL,
  DESKTOP_WIDTHS,
  DIALOG_OPENERS,
  PUBLIC_ROUTES,
  WIDTHS,
} from "./routes.mjs";
import { loadFunctionVolatility, rpcVerdict } from "./rpcVolatility.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const phase = process.argv[2] ?? "before";
const withDesktop = process.argv.includes("--desktop");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length).split(",") : null;
const skipDialogs = process.argv.includes("--no-dialogs");
const dialogsOnly = process.argv.includes("--dialogs-only");
const dialogArg = process.argv.find((x) => x.startsWith("--dialog="))?.slice("--dialog=".length);
const outDir = join(here, phase);
mkdirSync(outDir, { recursive: true });

const slug = (route) =>
  route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";

// Runs in the page. Returns document overflow plus the "root" offenders: an
// element that extends past the viewport while its parent does not. Elements
// inside an explicit horizontal scroller (overflow-x-auto / inline overflowX)
// or a carousel are exempt: rule 5 allows a table to scroll inside its own box.
const measure = (scope) => {
  const vw = document.documentElement.clientWidth;
  const root = scope ? document.querySelector(scope) : document.body;
  const out = {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: vw,
    offenders: [],
    smallInputs: 0,
  };
  if (!root) return out;

  const isExplicitScroller = (el) => {
    const cls = typeof el.className === "string" ? el.className : "";
    return (
      /\boverflow-x-(auto|scroll)\b/.test(cls) ||
      el.style.overflowX === "auto" ||
      el.style.overflowX === "scroll" ||
      el.hasAttribute("data-radix-scroll-area-viewport") ||
      el.getAttribute("aria-roledescription") === "carousel" ||
      el.getAttribute("data-audit-scroll") === "x"
    );
  };
  const exempt = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (isExplicitScroller(p)) return true;
    }
    return false;
  };
  const describe = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 6).join(".") : "";
    const text = (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 60);
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls ? "." + cls : ""}${text ? ` "${text}"` : ""}`;
  };

  for (const el of root.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (cs.position === "fixed" && r.right <= 0) continue; // off-canvas drawer
    if (r.left >= vw || r.right <= 0) {
      // fully off-screen (off-canvas sidebar, slide-out) - only count if it widens the page
      if (cs.position === "fixed") continue;
    }
    if (r.right > vw + 1) {
      const parent = el.parentElement;
      const pr = parent ? parent.getBoundingClientRect() : null;
      if (pr && pr.right > vw + 1) continue; // not the root cause
      if (exempt(el)) continue;
      out.offenders.push({ el: describe(el), right: Math.round(r.right), width: Math.round(r.width) });
    }
    if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") && parseFloat(cs.fontSize) < 16) {
      const type = el.getAttribute("type");
      if (!["checkbox", "radio", "hidden", "file", "range"].includes(type)) out.smallInputs += 1;
    }
  }
  out.offenders = out.offenders.slice(0, 10);
  return out;
};

const isSupabase = (u) => u.hostname.endsWith(".supabase.co") || u.pathname.startsWith("/functions/v1/");
const isStripe = (u) => /(^|\.)stripe\.(com|network)$/.test(u.hostname);
const STRIPE_TELEMETRY = new Set(["r.stripe.com", "m.stripe.com"]);
// Writes even though a page calls them on load; blocked whatever their volatility.
const ALWAYS_BLOCKED_RPCS = new Set(["log_search_appearance"]);
const functionVolatility = loadFunctionVolatility();
// Known requests that pages make on load and that the guard blocks. They are
// still aborted, but recorded as "expected-block" and do not fail the run.
// The two RPCs come off this list once they are marked STABLE in a migration
// (see REPORT.md "Read RPCs declared VOLATILE"); log_search_appearance and
// create-payment-intent are genuine writes and stay blocked.
const EXPECTED_BLOCKS = new Set([
  "POST /rest/v1/rpc/log_search_appearance",
  "POST /functions/v1/create-payment-intent",
  "POST /rest/v1/rpc/get_contractor_availability",
  "POST /rest/v1/rpc/check_contractor_compliance",
]);
const blocked = [];
const allowedPosts = {}; // "rpc foo" / "storage sign" / "auth refresh" -> count
let telemetryAborted = 0;

// Decides a non-GET/HEAD Supabase request: returns a label when it may pass.
const allowedSupabaseWrite = (u, method) => {
  if (method !== "POST") return null;
  const rpc = u.pathname.match(/^\/rest\/v1\/rpc\/([A-Za-z0-9_]+)$/);
  if (rpc) {
    const name = rpc[1];
    if (ALWAYS_BLOCKED_RPCS.has(name.toLowerCase())) return null;
    return rpcVerdict(functionVolatility, name).allowed ? `rpc ${name}` : null;
  }
  if (u.pathname.startsWith("/storage/v1/object/sign/")) return "storage sign";
  if (u.pathname === "/auth/v1/token" && u.searchParams.get("grant_type") === "refresh_token") return "auth refresh";
  return null;
};

// Installs the guard on a browser context. `current()` names the row being
// audited so a blocked request can be attributed to it.
const guardContext = async (context, account, width, current) => {
  await context.route(
    (url) => isSupabase(url) || isStripe(url),
    (route) => {
      const req = route.request();
      const u = new URL(req.url());
      const method = req.method();
      if (isSupabase(u)) {
        if (method === "GET" || method === "HEAD") return route.continue();
        const label = allowedSupabaseWrite(u, method);
        if (label) {
          allowedPosts[label] = (allowedPosts[label] ?? 0) + 1;
          return route.continue();
        }
      } else {
        if (method === "GET") return route.continue();
        if (STRIPE_TELEMETRY.has(u.hostname)) {
          telemetryAborted++;
          return route.abort("blockedbyclient");
        }
      }
      const rpcName = u.pathname.match(/^\/rest\/v1\/rpc\/([A-Za-z0-9_]+)$/)?.[1];
      const entry = {
        account,
        width,
        row: current(),
        method,
        url: `${u.origin}${u.pathname}`,
        status: EXPECTED_BLOCKS.has(`${method} ${u.pathname}`) ? "expected-block" : "blocked-write",
        ...(rpcName ? { rpc: rpcName, reason: ALWAYS_BLOCKED_RPCS.has(rpcName) ? "always blocked (writes)" : rpcVerdict(functionVolatility, rpcName).reason } : {}),
      };
      blocked.push(entry);
      console.warn(`${entry.status === "expected-block" ? "BLOCKED (expected)" : "BLOCKED"} ${method} ${entry.url}  [${account} @${width} ${entry.row}]`);
      return route.abort("blockedbyclient");
    },
  );
};

// A row's status: an unexpected block wins, then a layout failure; a row whose
// only blocks are expected ones is "expected-block".
const rowStatus = (writes, pass) =>
  writes.some((w) => w.status === "blocked-write") ? "blocked-write" : !pass ? "fail" : writes.length ? "expected-block" : "pass";

const settle = async (page) => {
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
};

// Sessions are saved against :8080. Rewrite the localStorage origin so the same
// session works against another base URL (e.g. the pre-fix baseline on :8081).
const loadState = (path) => {
  const state = JSON.parse(readFileSync(path, "utf8"));
  const origin = new URL(BASE_URL).origin;
  return { ...state, origins: (state.origins ?? []).map((o) => ({ ...o, origin })) };
};

const results = [];

const runAccount = async (browser, account, routes, widths) => {
  const statePath = join(here, ".auth", `${account}.json`);
  if (account !== "public" && !existsSync(statePath)) {
    for (const route of routes)
      for (const width of widths) results.push({ account, route, width, status: "no-session" });
    console.log(`[${account}] no session, skipped ${routes.length} routes`);
    return;
  }
  await Promise.all(
    widths.map(async (width) => {
      const mobile = width < 768;
      const context = await browser.newContext({
        viewport: { width, height: mobile ? 800 : 900 },
        isMobile: mobile,
        hasTouch: mobile,
        deviceScaleFactor: 1,
        storageState: account === "public" ? undefined : loadState(statePath),
      });
      // The contractor onboarding tour (localStorage only) sits over every
      // page until dismissed. Suppress it, except on the one route that
      // audits the tour itself (#audit-tour).
      await context.addInitScript(() => {
        if (location.hash !== "#audit-tour") localStorage.setItem("tradestone_contractor_tour_completed", "true");
        else localStorage.removeItem("tradestone_contractor_tour_completed");
      });
      let currentRow = "(start)";
      await guardContext(context, account, width, () => currentRow);
      const blockedSince = (n) => blocked.slice(n).filter((b) => b.account === account && b.width === width);
      const page = await context.newPage();
      for (const route of dialogsOnly ? [] : routes) {
        currentRow = route;
        const mark = blocked.length;
        const shot = join(outDir, account, `${slug(route)}@${width}.png`);
        mkdirSync(dirname(shot), { recursive: true });
        try {
          await page.goto(BASE_URL + route, { waitUntil: "domcontentloaded", timeout: 30000 });
          await settle(page);
          const m = await page.evaluate(measure, null);
          await page.screenshot({ path: shot, fullPage: true });
          const finalUrl = page.url().replace(BASE_URL, "");
          const pass = m.scrollWidth <= m.clientWidth && m.offenders.length === 0;
          const writes = blockedSince(mark);
          results.push({ account, route, width, finalUrl, status: rowStatus(writes, pass), ...m, shot, ...(writes.length ? { blocked: writes } : {}) });
        } catch (e) {
          results.push({ account, route, width, status: "error", error: String(e).slice(0, 200) });
        }
      }
      if (!skipDialogs) {
        for (const d of DIALOG_OPENERS.filter((o) => o.account === account && (!dialogArg || o.name === dialogArg))) {
          const shot = join(outDir, account, `dialog_${d.name}@${width}.png`);
          currentRow = `dialog:${d.name}`;
          const mark = blocked.length;
          try {
            await page.goto(BASE_URL + d.route, { waitUntil: "domcontentloaded", timeout: 30000 });
            await settle(page);
            await d.open(page);
            await page.waitForTimeout(900);
            const scope = (await page.locator('[role="dialog"]').count()) ? '[role="dialog"]' : null;
            const m = await page.evaluate(measure, scope);
            await page.screenshot({ path: shot, fullPage: false });
            const pass = m.scrollWidth <= m.clientWidth && m.offenders.length === 0;
            const writes = blockedSince(mark);
            results.push({ account, route: `dialog:${d.name}`, width, status: rowStatus(writes, pass), ...m, shot, ...(writes.length ? { blocked: writes } : {}) });
          } catch (e) {
            results.push({ account, route: `dialog:${d.name}`, width, status: "not-reached", error: String(e).split("\n")[0].slice(0, 160) });
          }
        }
      }
      await context.close();
    }),
  );
  console.log(`[${account}] done`);
};

const browser = await chromium.launch();
const desktopOnly = process.argv.includes("--desktop-only");
// --widths=390,430 overrides the width set; --dialog=<name> runs one opener only.
const widthsArg = process.argv.find((x) => x.startsWith("--widths="));
const widths = widthsArg
  ? widthsArg.slice("--widths=".length).split(",").map(Number)
  : desktopOnly ? DESKTOP_WIDTHS : withDesktop ? [...WIDTHS, ...DESKTOP_WIDTHS] : WIDTHS;
const plan = [["public", PUBLIC_ROUTES], ...Object.entries(ACCOUNT_ROUTES)].filter(
  ([a]) => !only || only.includes(a),
);
for (const [account, routes] of plan) await runAccount(browser, account, routes, widths);
await browser.close();

// Merge with an earlier run of the same phase: replace only the rows run now.
const resultsPath = join(outDir, "results.json");
const rk = (r) => `${r.account}|${r.route}|${r.width}`;
const ran = new Set(results.map(rk));
const earlier = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, "utf8")) : [];
const merged = [...earlier.filter((r) => !ran.has(rk(r))), ...results];
writeFileSync(resultsPath, JSON.stringify(merged, null, 2));

const count = (s) => results.filter((r) => r.status === s).length;
console.log(
  `pass ${count("pass")}  fail ${count("fail")}  error ${count("error")}  not-reached ${count("not-reached")}  no-session ${count("no-session")}  expected-block ${count("expected-block")}  blocked-write ${count("blocked-write")}`,
);

writeFileSync(join(outDir, "blocked.json"), JSON.stringify(blocked, null, 2));
console.log(`allowed non-GET: ${JSON.stringify(allowedPosts)}  stripe telemetry aborted: ${telemetryAborted}`);
const summarise = (list) => {
  const byUrl = {};
  for (const b of list) byUrl[`${b.method} ${b.url}`] = (byUrl[`${b.method} ${b.url}`] ?? 0) + 1;
  return Object.entries(byUrl).map(([k, n]) => `  ${n}x ${k}`).join("\n");
};
const expected = blocked.filter((b) => b.status === "expected-block");
const unexpected = blocked.filter((b) => b.status === "blocked-write");
if (expected.length) console.log(`\nExpected blocks (still aborted, not a failure): ${expected.length}\n${summarise(expected)}`);
if (unexpected.length) {
  console.error(
    `\nREAD-ONLY GUARD: ${unexpected.length} unexpected write request(s) were attempted and blocked. See ${join(outDir, "blocked.json")}.\n${summarise(unexpected)}`,
  );
  process.exitCode = 1;
}
