import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { FIXTURE_PORT, REPO_ROOT } from './config';

/**
 * Tiny static server for the hermetic recipe fixture(s) in `e2e-shared/fixtures/`.
 * Used so E2E never depends on a live recipe site.
 *
 * Programmatic: `const s = await startFixtureServer(); … await stopFixtureServer(s);`
 * CLI (for Playwright's webServer): `tsx e2e-shared/fixture-server.ts`
 */

const FIXTURES_DIR = path.join(REPO_ROOT, 'e2e-shared/fixtures');

const CONTENT_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
};

export function startFixtureServer(port = FIXTURE_PORT): Promise<Server> {
    const server = createServer(async (req, res) => {
        try {
            // Strip query/hash, prevent path traversal outside FIXTURES_DIR.
            const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
            const filePath = path.join(FIXTURES_DIR, rel || 'recipe.html');
            // Trailing separator guards against a sibling dir sharing the prefix (e.g. `fixtures-x`).
            if (filePath !== FIXTURES_DIR && !filePath.startsWith(FIXTURES_DIR + path.sep)) {
                res.writeHead(403).end('forbidden');
                return;
            }
            const body = await readFile(filePath);
            res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
            res.end(body);
        } catch {
            res.writeHead(404).end('not found');
        }
    });
    return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

export function stopFixtureServer(server: Server): Promise<void> {
    return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

// CLI: serve until killed (Playwright webServer manages the lifecycle).
if (import.meta.url === `file://${process.argv[1]}`) {
    startFixtureServer().then((s) => {
        const addr = s.address();
        const port = typeof addr === 'object' && addr ? addr.port : FIXTURE_PORT;
        console.log(`[fixture] serving ${FIXTURES_DIR} on http://localhost:${port}`);
    });
}
