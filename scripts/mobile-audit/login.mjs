// One-off: opens a headed browser window per account type so you can sign in
// by hand. When a window reaches that account's dashboard, its session is
// saved to scripts/mobile-audit/.auth/<account>.json (gitignored).
// No credentials live in this file.
//
//   node scripts/mobile-audit/login.mjs                 # all three
//   node scripts/mobile-audit/login.mjs contractor      # just one

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_URL } from "./routes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const authDir = join(here, ".auth");
mkdirSync(authDir, { recursive: true });

const DASHBOARD = {
  contractor: /\/dashboard\/contractor/,
  business: /\/dashboard\/business/,
  personal: /\/dashboard\/homeowner/,
};

const wanted = process.argv.slice(2).filter((a) => a in DASHBOARD);
const accounts = wanted.length ? wanted : Object.keys(DASHBOARD);
const TIMEOUT_MS = Number(process.env.LOGIN_TIMEOUT_MS ?? 20 * 60 * 1000);

const browser = await chromium.launch({ headless: false });

await Promise.all(
  accounts.map(async (account) => {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate((a) => {
      document.title = `SIGN IN AS: ${a.toUpperCase()}`;
    }, account);
    console.log(`[${account}] waiting for sign-in (window titled "SIGN IN AS: ${account.toUpperCase()}")`);
    try {
      await page.waitForURL(DASHBOARD[account], { timeout: TIMEOUT_MS });
      // Let supabase-js finish persisting the session to localStorage.
      await page.waitForTimeout(2000);
      await context.storageState({ path: join(authDir, `${account}.json`) });
      console.log(`[${account}] saved ${join(authDir, `${account}.json`)}`);
    } catch (e) {
      console.log(`[${account}] not saved: ${String(e).split("\n")[0]}`);
    }
    await context.close();
  }),
);

await browser.close();
