import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { REPO_ROOT } from './config';

/**
 * Ephemeral Dockerized Mealie for E2E: bring it up, mint an API token, tear it down.
 * CLI-usable so the npm scripts can start/stop it independently of a test run:
 *
 *   tsx e2e-shared/mealie-docker.ts up     # start + write .env.e2e (server + token)
 *   tsx e2e-shared/mealie-docker.ts down   # stop + remove volumes
 */

const COMPOSE_FILE = path.join(REPO_ROOT, 'docker/mealie.e2e.yml');
const MEALIE_PORT = process.env.MEALIE_PORT?.trim() || '9925';
const MEALIE_BASE = `http://localhost:${MEALIE_PORT}`;
const ENV_FILE = path.join(REPO_ROOT, '.env.e2e');

// Mealie's built-in default admin account.
const DEFAULT_EMAIL = 'changeme@example.com';
const DEFAULT_PASSWORD = 'MyPassword';

function compose(args: string[]): void {
    execFileSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
        stdio: 'inherit',
        cwd: REPO_ROOT,
    });
}

async function waitForHealthy(timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${MEALIE_BASE}/api/app/about`);
            if (res.ok) return;
        } catch {
            // not up yet
        }
        await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error(`Mealie did not become healthy at ${MEALIE_BASE} within ${timeoutMs}ms`);
}

async function login(): Promise<string> {
    const body = new URLSearchParams({ username: DEFAULT_EMAIL, password: DEFAULT_PASSWORD });
    const res = await fetch(`${MEALIE_BASE}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    if (!res.ok) throw new Error(`Mealie login failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) throw new Error('Mealie login returned no access_token');
    return data.access_token;
}

async function mintApiToken(accessToken: string): Promise<string> {
    const res = await fetch(`${MEALIE_BASE}/api/users/api-tokens`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'mini-mealie-e2e' }),
    });
    if (!res.ok) throw new Error(`Mealie api-token mint failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { token?: string };
    if (!data.token) throw new Error('Mealie api-token response had no token');
    return data.token;
}

export type MealieHandle = { server: string; token: string };

/** Start Mealie (if not already up), wait for health, mint a fresh API token. */
export async function mealieUp(): Promise<MealieHandle> {
    compose(['up', '-d']);
    await waitForHealthy();
    const accessToken = await login();
    const token = await mintApiToken(accessToken);
    return { server: MEALIE_BASE, token };
}

/** Stop Mealie and remove its (tmpfs) volumes. */
export function mealieDown(): void {
    compose(['down', '-v']);
}

async function main(): Promise<void> {
    const cmd = process.argv[2];
    if (cmd === 'up') {
        const { server, token } = await mealieUp();
        writeFileSync(ENV_FILE, `E2E_MEALIE_SERVER=${server}\nE2E_MEALIE_TOKEN=${token}\n`);
        console.log(`[mealie] up at ${server} — creds written to .env.e2e`);
    } else if (cmd === 'down') {
        mealieDown();
        console.log('[mealie] down');
    } else {
        console.error('usage: tsx e2e-shared/mealie-docker.ts <up|down>');
        process.exit(1);
    }
}

// Run as CLI only when invoked directly (not when imported).
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
