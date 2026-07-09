import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { FIXTURE_RECIPE_URL, loadE2eEnv, REPO_ROOT, usesFixture } from '../e2e-shared/config';

// Pull in Docker-minted Mealie creds from .env.e2e if present.
loadE2eEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Chromium-only Playwright config. Firefox E2E lives in `e2e-geckodriver/` — Playwright's
 * Firefox engine cannot load extensions, so that target uses Selenium + geckodriver.
 */
export default defineConfig({
    testDir: __dirname,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    timeout: 180_000,
    expect: { timeout: 60_000 },
    reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(__dirname, 'playwright-report') }]],
    use: {
        ...devices['Desktop Chrome'],
        trace: 'on-first-retry',
    },
    // Serve the hermetic recipe fixture for the duration of the run (unless E2E_RECIPE_URL
    // points at a real site). Playwright starts it, waits for it, and tears it down.
    webServer: usesFixture()
        ? {
              command: 'pnpm exec tsx e2e-shared/fixture-server.ts',
              url: FIXTURE_RECIPE_URL,
              cwd: REPO_ROOT,
              reuseExistingServer: !process.env.CI,
              timeout: 30_000,
          }
        : undefined,
});
