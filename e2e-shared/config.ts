import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MINI_MEALIE_E2E_RUN_CREATE_RECIPE_MESSAGE } from '../utils/e2eMessaging';

export { MINI_MEALIE_E2E_RUN_CREATE_RECIPE_MESSAGE };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Load `.env.e2e` (written by `mealie-docker.ts up`) into `process.env` without adding a
 * dotenv dependency. Existing env vars win, so an explicit `E2E_MEALIE_SERVER=...` on the
 * command line overrides the Docker-minted values.
 */
export function loadE2eEnv(): void {
    const file = path.join(REPO_ROOT, '.env.e2e');
    if (!existsSync(file)) return;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (key && process.env[key] === undefined) process.env[key] = value;
    }
}

/** Built Chrome MV3 extension (service-worker background). */
export function chromeExtensionDir(): string {
    const fromEnv = process.env.E2E_CHROME_EXTENSION_PATH?.trim();
    if (fromEnv) return path.resolve(REPO_ROOT, fromEnv);
    return path.join(REPO_ROOT, '.output/chrome-mv3');
}

/** Built Firefox MV2 extension (persistent background page). */
export function firefoxExtensionDir(): string {
    const fromEnv = process.env.E2E_FIREFOX_EXTENSION_PATH?.trim();
    if (fromEnv) return path.resolve(REPO_ROOT, fromEnv);
    return path.join(REPO_ROOT, '.output/firefox-mv2');
}

/**
 * Path to a Firefox `.xpi` (a WXT zip artifact) to install temporarily. Selenium's
 * `installAddon` base64-reads a file, so we install the packaged zip, not the unpacked
 * dir. Prefers `E2E_FIREFOX_XPI`, else the newest `.output/*-firefox.zip`
 * (run `pnpm zip:firefox` first). Excludes the `*-sources.zip` artifact.
 */
export function firefoxXpiPath(): string {
    const fromEnv = process.env.E2E_FIREFOX_XPI?.trim();
    if (fromEnv) return path.resolve(REPO_ROOT, fromEnv);
    const outDir = path.join(REPO_ROOT, '.output');
    const candidates = existsSync(outDir)
        ? readdirSync(outDir)
              .filter((f) => f.endsWith('-firefox.zip'))
              .map((f) => path.join(outDir, f))
              .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
        : [];
    if (candidates.length === 0) {
        throw new Error(
            'No Firefox .xpi found in .output/. Run `pnpm zip:firefox` or set E2E_FIREFOX_XPI.',
        );
    }
    return candidates[0];
}

/**
 * Firefox add-on id — must match `browser_specific_settings.gecko.id` in the built
 * MV2 manifest (upstream PR #123 set this to `shaplabs.net`). Selenium loads the add-on
 * temporarily; we pin its internal UUID (below) so the popup URL is deterministic.
 */
export const GECKO_ADDON_ID = 'mini-mealie@shaplabs.net';

/**
 * Fixed internal UUID for the temporarily-loaded add-on. We pre-seed
 * `extensions.webextensions.uuids` in the Firefox profile so we can open
 * `moz-extension://<this-uuid>/popup.html` without scraping prefs.js for the
 * randomly-assigned UUID.
 */
export const FIREFOX_ADDON_UUID = 'b0c0d0e0-0000-4000-8000-000000000001';

export type ImportMode = 'url' | 'html';

export function getImportMode(): ImportMode {
    return process.env.E2E_IMPORT_MODE?.trim().toLowerCase() === 'url' ? 'url' : 'html';
}

/** Port for the local hermetic recipe fixture server (see fixture-server.ts). */
export const FIXTURE_PORT = Number(process.env.E2E_FIXTURE_PORT?.trim() || 8730);

/** URL of the hermetic fixture recipe served locally. */
export const FIXTURE_RECIPE_URL = `http://localhost:${FIXTURE_PORT}/recipe.html`;

/**
 * Recipe name in the fixture's JSON-LD. In HTML mode Mealie may not persist an orgURL
 * (the fixture has no canonical/og:url), so the assertion matches on this name instead —
 * deterministic and independent of Mealie's orgURL handling.
 */
export const FIXTURE_RECIPE_NAME = 'Pistachio-Crusted Salmon (E2E Fixture)';

/**
 * Recipe page to import. Defaults to the local hermetic fixture (no external site, so CI is
 * deterministic). Override `E2E_RECIPE_URL` with a real challenging site for a live-scrape run,
 * e.g. https://www.allrecipes.com/recipe/269394/pistachio-crusted-salmon/.
 */
export function getRecipeUrl(): string {
    return process.env.E2E_RECIPE_URL?.trim() || FIXTURE_RECIPE_URL;
}

/** True when the recipe URL is the local fixture (harness must start the fixture server). */
export function usesFixture(): boolean {
    return getRecipeUrl() === FIXTURE_RECIPE_URL;
}

export type MealieEnv = { server: string; token: string };

/** Returns Mealie creds from env, or null when unset (harness should skip). */
export function getMealieEnv(): MealieEnv | null {
    const server = process.env.E2E_MEALIE_SERVER?.trim();
    const token = process.env.E2E_MEALIE_TOKEN?.trim();
    if (!server || !token) return null;
    return { server, token };
}

/** Storage payload seeded into `storage.sync` before triggering an import. */
export function seedStorage(mode: ImportMode) {
    return {
        recipeCreateMode: mode,
        importTags: true,
        importCategories: true,
        openAfterImport: false,
    } as const;
}
