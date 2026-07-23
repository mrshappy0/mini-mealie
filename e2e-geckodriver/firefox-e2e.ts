import os from 'node:os';
import path from 'node:path';

import { Builder, type WebDriver } from 'selenium-webdriver';
import { Options, ServiceBuilder } from 'selenium-webdriver/firefox';

import {
    FIREFOX_ADDON_UUID,
    FIXTURE_RECIPE_NAME,
    firefoxXpiPath,
    GECKO_ADDON_ID,
    getImportMode,
    getMealieEnv,
    getRecipeUrl,
    loadE2eEnv,
    MINI_MEALIE_E2E_RUN_CREATE_RECIPE_MESSAGE,
    seedStorage,
    usesFixture,
} from '../e2e-shared/config';
import { startFixtureServer, stopFixtureServer } from '../e2e-shared/fixture-server';
import { waitForRecipe } from '../e2e-shared/mealie-api';

/**
 * Firefox MV2 E2E via Selenium + geckodriver.
 *
 * Why not Playwright: Playwright's Firefox engine can't load extensions. Geckodriver's
 * temporary add-on install is Mozilla's supported path for unsigned add-ons under
 * automation. Run `e2e-geckodriver/setup.sh` first to fetch a non-snap Firefox + geckodriver
 * (snap builds are sandboxed and can't be driven), and `pnpm zip:firefox` to produce the xpi.
 *
 * Flow mirrors the Chrome spec: install add-on → seed creds in the popup → open recipe tab →
 * fire the internal e2e message → poll Mealie for the imported recipe.
 */

loadE2eEnv();

const HOME = os.homedir();
// Must match e2e-geckodriver/setup.sh's version-keyed default
// (~/.local/firefox-nonsnap-$FIREFOX_VER). Override with E2E_FIREFOX_BIN if needed.
const FIREFOX_VER = process.env.FIREFOX_VER?.trim() || '142.0';
const FIREFOX_BIN =
    process.env.E2E_FIREFOX_BIN?.trim() ||
    path.join(HOME, `.local/firefox-nonsnap-${FIREFOX_VER}`, 'firefox', 'firefox');
const GECKODRIVER_BIN =
    process.env.E2E_GECKODRIVER_BIN?.trim() || path.join(HOME, '.local/bin/geckodriver');

const POPUP_URL = `moz-extension://${FIREFOX_ADDON_UUID}/popup.html`;

function log(msg: string): void {
    console.log(`[e2e:firefox] ${msg}`);
}

async function buildDriver(): Promise<WebDriver> {
    const options = new Options();
    options.setBinary(FIREFOX_BIN);
    if (process.env.E2E_HEADLESS !== '0') options.addArguments('-headless');

    // Pin the add-on's internal UUID so POPUP_URL is deterministic instead of random.
    options.setPreference('extensions.webextensions.uuids', JSON.stringify({ [GECKO_ADDON_ID]: FIREFOX_ADDON_UUID }));
    // Temporary add-ons don't require signing, but be explicit for older channels.
    options.setPreference('xpinstall.signatures.required', false);
    options.setPreference('extensions.langpacks.signatures.required', false);

    // Firefox 153+ blocks WebDriver navigation to moz-extension:// pages unless
    // geckodriver opts into parent-process access. Harmless on older pins (142).
    // https://firefox-source-docs.mozilla.org/testing/geckodriver/Flags.html#allow-system-access
    const service = new ServiceBuilder(GECKODRIVER_BIN).addArguments('--allow-system-access');
    return new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
}

/** Seed Mealie creds + import options into storage.sync from the popup context. */
async function seedCreds(driver: WebDriver, server: string, token: string): Promise<void> {
    const err = await driver.executeAsyncScript(
        function (server: string, token: string, seed: object, done: (e: string | null) => void) {
            chrome.storage.sync.set(Object.assign({ mealieServer: server, mealieApiToken: token }, seed), function () {
                const e = chrome.runtime.lastError;
                done(e?.message ?? null);
            });
        },
        server,
        token,
        seedStorage(getImportMode()),
    );
    if (err) throw new Error(`storage.sync.set failed: ${err}`);
}

/** Fire the internal e2e message from the popup; resolves with the background ack. */
async function triggerImport(driver: WebDriver, matchUrl: string): Promise<{ ok?: boolean; error?: string }> {
    return (await driver.executeAsyncScript(
        function (type: string, matchUrl: string, done: (r: unknown) => void) {
            // eslint-disable-next-line no-undef
            browser.runtime
                .sendMessage({ type, matchUrl })
                .then((r: unknown) => done(r || {}))
                .catch((e: unknown) => done({ error: String(e) }));
        },
        MINI_MEALIE_E2E_RUN_CREATE_RECIPE_MESSAGE,
        matchUrl,
    )) as { ok?: boolean; error?: string };
}

async function main(): Promise<void> {
    const mealie = getMealieEnv();
    if (!mealie) {
        log('SKIP: set E2E_MEALIE_SERVER + E2E_MEALIE_TOKEN (or run `pnpm test:e2e:up`).');
        return;
    }
    const xpi = firefoxXpiPath();
    const recipeUrl = getRecipeUrl();

    // Serve the hermetic recipe fixture locally unless pointed at a real site.
    const fixtureServer = usesFixture() ? await startFixtureServer() : undefined;

    const driver = await buildDriver();
    try {
        log(`installing add-on: ${xpi}`);
        await (driver as unknown as { installAddon: (path: string, temporary: boolean) => Promise<string> }).installAddon(xpi, true);

        // Popup tab: seed creds.
        await driver.get(POPUP_URL);
        await seedCreds(driver, mealie.server, mealie.token);
        const popupHandle = await driver.getWindowHandle();

        // Recipe tab: open and let JS-heavy pages settle.
        await driver.switchTo().newWindow('tab');
        await driver.get(recipeUrl);
        await driver.sleep(process.env.CI ? 8000 : 4000);
        const recipePageUrl = await driver.getCurrentUrl();

        // Back to popup to fire the trigger from an extension context.
        await driver.switchTo().window(popupHandle);
        const ack = await triggerImport(driver, recipePageUrl);
        if (!ack.ok) throw new Error(`import trigger failed: ${ack.error ?? 'unknown'}`);
        log('import triggered; polling Mealie…');

        const hit = await waitForRecipe({
            mealieBase: mealie.server,
            token: mealie.token,
            matchUrl: recipePageUrl,
            matchName: usesFixture() ? FIXTURE_RECIPE_NAME : undefined,
            timeoutMs: 120_000,
        });
        log(`PASS: recipe imported (slug=${hit.slug})`);
    } finally {
        await driver.quit();
        if (fixtureServer) await stopFixtureServer(fixtureServer);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
