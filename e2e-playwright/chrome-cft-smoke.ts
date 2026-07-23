/**
 * Tiny Playwright↔Chrome-for-Testing smoke for the chrome-latest canary leg.
 *
 * Launches PLAYWRIGHT_CHROME_EXECUTABLE with no extension and no suite — if this fails,
 * treat the red leg as Playwright↔CfT tooling (or install/path), not product behavior.
 * See docs/developers-guide/e2e-testing.md (Canary) and issue #183.
 */
import { chromium } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE?.trim();
if (!executablePath) {
    throw new Error(
        'PLAYWRIGHT_CHROME_EXECUTABLE is required (run pnpm test:e2e:chrome-cft:install first)',
    );
}

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
await page.goto('about:blank');
const title = await page.title();
await browser.close();

console.log(
    `chrome-cft-smoke ok: executablePath=${executablePath} title=${JSON.stringify(title)}`,
);
