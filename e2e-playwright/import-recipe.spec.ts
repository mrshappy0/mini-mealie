import {
    FIXTURE_RECIPE_NAME,
    getImportMode,
    getMealieEnv,
    getRecipeUrl,
    MINI_MEALIE_E2E_RUN_CREATE_RECIPE_MESSAGE,
    seedStorage,
    usesFixture,
} from '../e2e-shared/config';
import { waitForRecipe } from '../e2e-shared/mealie-api';

import { test, expect } from './fixtures';

const mealie = getMealieEnv();
const mode = getImportMode();
const recipeUrl = getRecipeUrl();

test.describe('Mini Mealie E2E — Chrome MV3', () => {
    test.beforeEach(({}, testInfo) => {
        testInfo.skip(
            !mealie,
            'Set E2E_MEALIE_SERVER + E2E_MEALIE_TOKEN (or run `pnpm test:e2e:up` for a Dockerized Mealie).',
        );
    });

    test('load extension, seed creds, trigger import, assert recipe in Mealie', async ({
        context,
        extensionBridgePage,
    }) => {
        const { server, token } = mealie!;

        // Seed Mealie creds + import options into storage.sync via the popup context.
        await extensionBridgePage.evaluate(
            async ({ server, token, seed }) => {
                await new Promise<void>((resolve, reject) => {
                    chrome.storage.sync.set(
                        { mealieServer: server, mealieApiToken: token, ...seed },
                        () => {
                            const err = chrome.runtime.lastError;
                            if (err) reject(err);
                            else resolve();
                        },
                    );
                });
            },
            { server, token, seed: seedStorage(mode) },
        );

        // Open the recipe page and let it settle (JS-heavy sites hydrate late).
        const recipePage = await context.newPage();
        await recipePage.goto(recipeUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await recipePage.waitForTimeout(process.env.CI ? 8000 : 4000);

        // Trigger the import via the internal e2e message (same path as the context-menu click).
        const tabUrl = recipePage.url();
        const ack = await extensionBridgePage.evaluate(
            async ([type, matchUrl]) => {
                return await new Promise<{ ok?: boolean; error?: string }>((resolve, reject) => {
                    chrome.runtime.sendMessage({ type, matchUrl }, (r) => {
                        const err = chrome.runtime.lastError;
                        if (err) reject(err);
                        else resolve(r ?? {});
                    });
                });
            },
            [MINI_MEALIE_E2E_RUN_CREATE_RECIPE_MESSAGE, tabUrl] as const,
        );
        expect(ack.ok, `import trigger failed: ${ack.error ?? 'unknown'}`).toBe(true);

        const hit = await waitForRecipe({
            mealieBase: server,
            token,
            matchUrl: recipePage.url(),
            matchName: usesFixture() ? FIXTURE_RECIPE_NAME : undefined,
            timeoutMs: 120_000,
        });
        expect(hit.slug).toBeTruthy();

        await recipePage.close();
    });
});
