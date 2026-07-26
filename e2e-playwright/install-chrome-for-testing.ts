/**
 * Download Chrome for Testing for the chrome-latest canary leg.
 *
 * Prints `browser@buildId <executablePath>` (same shape as `@puppeteer/browsers install`)
 * and, when running on GitHub Actions, appends PLAYWRIGHT_CHROME_EXECUTABLE to GITHUB_ENV.
 *
 * Tag defaults to `latest` (override with CHROME_FOR_TESTING_TAG, e.g. `stable`).
 * Cache: E2E_CFT_CACHE_DIR or ~/.cache/mini-mealie-chrome-for-testing.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tag = process.env.CHROME_FOR_TESTING_TAG?.trim() || 'latest';
const cacheDir =
    process.env.E2E_CFT_CACHE_DIR?.trim() ||
    path.join(os.homedir(), '.cache', 'mini-mealie-chrome-for-testing');

fs.mkdirSync(cacheDir, { recursive: true });

const result = spawnSync(
    'npx',
    ['-y', '@puppeteer/browsers', 'install', `chrome@${tag}`, '--path', cacheDir],
    { encoding: 'utf8' },
);

const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
if (result.status !== 0) {
    console.error(combined || `npx @puppeteer/browsers failed (status ${result.status})`);
    process.exit(result.status ?? 1);
}

// Format per CLI help: <browser>@<buildID> <path>
const lines = combined.split('\n').map((l) => l.trim()).filter(Boolean);
const line = [...lines].reverse().find((l) => /^chrome@\S+\s+\//.test(l));
if (!line) {
    console.error(`Could not parse Chrome for Testing path from install output:\n${combined}`);
    process.exit(1);
}

const space = line.indexOf(' ');
const buildLabel = line.slice(0, space);
const executablePath = line.slice(space + 1).trim();
if (!fs.existsSync(executablePath)) {
    console.error(`Executable not found at ${executablePath}`);
    process.exit(1);
}

console.log(`${buildLabel} ${executablePath}`);

if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `PLAYWRIGHT_CHROME_EXECUTABLE=${executablePath}\n`);
}
