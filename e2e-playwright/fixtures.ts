import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';

import { chromeExtensionDir } from '../e2e-shared/config';

/**
 * Chromium E2E fixture. Mirrors Chrome's `--load-extension=…` flow (Playwright's
 * "Chrome extensions" pattern). Chrome MV3 uses a background service worker, so the
 * extension id comes from `context.serviceWorkers()`.
 */

export type MiniMealieFixtures = {
    context: BrowserContext;
    /** `chrome-extension://…` without trailing slash */
    extensionOrigin: string;
    /** Extension popup — same APIs as the toolbar popup; used for storage + `runtime.sendMessage` */
    extensionBridgePage: Page;
};

export const test = base.extend<MiniMealieFixtures>({
    context: async ({}, use) => {
        const pathToExtension = chromeExtensionDir();
        const browserContext = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            args: [
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,
            ],
        });
        await use(browserContext);
        await browserContext.close();
    },

    extensionOrigin: async ({ context }, use) => {
        let [worker] = context.serviceWorkers();
        if (!worker) {
            worker = await context.waitForEvent('serviceworker');
        }
        const id = worker.url().split('/')[2];
        if (!id) {
            throw new Error(`Could not parse chrome-extension id from ${worker.url()}`);
        }
        await use(`chrome-extension://${id}`);
    },

    extensionBridgePage: async ({ context, extensionOrigin }, use) => {
        const page = await context.newPage();
        await page.goto(`${extensionOrigin}/popup.html`, { waitUntil: 'domcontentloaded' });
        await use(page);
        await page.close();
    },
});

export const expect = test.expect;
