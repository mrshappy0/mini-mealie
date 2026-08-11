// @vitest-environment node
/**
 * Contract test for the AMO (Firefox Add-ons) submission wire format.
 *
 * WHY THIS EXISTS
 * ---------------
 * The v1.5.17 store submission failed with a 400 from AMO:
 *
 *     "source": ["Unsupported file type, please upload an archive file
 *                 (.zip, .tar.gz, .tgz, .tar.bz2)."]
 *
 * Nothing in this repo changed. A wxt bump (0.20.27 -> 0.21.3) carried
 * publish-browser-extension 4.0.5 -> 6.0.0, and across that jump the sources
 * attachment changed from a named file to a nameless blob:
 *
 *     v4.0.5   form.set("source", await fileFromPath(path))       // filename="x-sources.zip"
 *     v6.0.0   versionBody.set("source", await openAsBlob(path))  // filename="blob"  <-- rejected
 *     v6.1.1   versionBody.set("source", await openAsFile(path))  // filename="x-sources.zip"
 *
 * `fs.openAsBlob()` returns a Blob with no name. Per the FormData spec a bare
 * Blob is wrapped into a File literally named "blob", so the part serializes as
 * `filename="blob"`. AMO validates that attachment by file extension, finds no
 * `.zip`, and rejects the whole submission.
 *
 * Note the consequence for assertions below: an `instanceof File` check does
 * NOT catch this, because the broken version also produces a File. Only the
 * filename distinguishes them.
 *
 * That failure mode is invisible until a real release hits AMO, which is far
 * too late. This test drives the real `FirefoxAddonStoreV5.submit()` against a
 * stubbed `fetch` and asserts the multipart parts carry `.zip` filenames, so a
 * future wxt bump that regresses the serialization fails here on the PR
 * instead of on the release.
 *
 * The store class is resolved through wxt's own module graph rather than a
 * direct import, so this exercises the exact publish-browser-extension
 * instance `pnpm wxt submit` will use — including whatever version a future
 * wxt bump resolves to.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** Minimal but structurally valid empty-ZIP bytes (end-of-central-directory record only). */
const EMPTY_ZIP = Buffer.from([
    0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const EXTENSION_ID = 'mini-mealie@shaplabs.net';

/**
 * Structural type for the slice of publish-browser-extension used here.
 *
 * Declared locally rather than imported: the package is wxt's transitive
 * dependency, not ours, so it isn't resolvable by name from this project. Adding
 * it as a direct devDependency would make the types resolve but would also
 * risk pinning a *different* copy than the one wxt loads at submit time, which
 * is precisely what this test exists to check.
 */
interface FirefoxStoreModule {
    FirefoxAddonStoreV5: new (
        options: {
            zip: string;
            sourcesZip?: string;
            extensionId: string;
            channel: 'listed' | 'unlisted';
            jwtIssuer: string;
            jwtSecret: string;
            skipSubmitReview: boolean;
        },
        setStatus: (text: string) => void,
    ) => { submit(dryRun?: boolean): Promise<void> };
}

/** Resolve publish-browser-extension the way `wxt submit` does, not as a direct dependency. */
async function importStoreAsWxtSeesIt(): Promise<FirefoxStoreModule> {
    const require = createRequire(import.meta.url);
    const wxtEntry = require.resolve('wxt');
    const storeEntry = createRequire(wxtEntry).resolve('publish-browser-extension');
    return (await import(storeEntry)) as FirefoxStoreModule;
}

/** A single captured outbound request. */
interface CapturedRequest {
    method: string;
    url: string;
    body: unknown;
}

/**
 * Stand-in for the AMO v5 API. Returns the minimum shape `submit()` reads at
 * each step, and records every request so the test can inspect what was sent.
 */
function stubAmoApi(captured: CapturedRequest[]) {
    return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        captured.push({ method, url, body: init?.body });

        const json = (data: unknown) =>
            new Response(JSON.stringify(data), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });

        // Order matters: the upload-status route is a longer match than the
        // upload-create route, so it has to be tested first.
        if (url.includes('/api/v5/addons/upload/') && method === 'GET') {
            return json({ uuid: 'test-upload-uuid', processed: true, valid: true, validation: {} });
        }
        if (url.includes('/api/v5/addons/upload/') && method === 'POST') {
            return json({ uuid: 'test-upload-uuid' });
        }
        if (url.includes('/versions/') && method === 'POST') {
            return json({ id: 456, file: { id: 789 } });
        }
        if (url.includes('/api/v5/addons/addon/')) {
            return json({ id: 123, slug: 'mini-mealie' });
        }
        throw new Error(`Unstubbed AMO request: ${method} ${url}`);
    });
}

describe('AMO submission wire format', () => {
    let dir: string;
    let zip: string;
    let sourcesZip: string;
    let captured: CapturedRequest[];
    let originalFetch: typeof globalThis.fetch;

    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), 'mini-mealie-submit-'));
        zip = join(dir, 'mini-mealie-9.9.9-firefox.zip');
        sourcesZip = join(dir, 'mini-mealie-9.9.9-sources.zip');
        // Paths are freshly-created temp dirs, not attacker-influenced input.
        /* eslint-disable security/detect-non-literal-fs-filename */
        await writeFile(zip, EMPTY_ZIP);
        await writeFile(sourcesZip, EMPTY_ZIP);
        /* eslint-enable security/detect-non-literal-fs-filename */

        const { FirefoxAddonStoreV5 } = await importStoreAsWxtSeesIt();

        captured = [];
        originalFetch = globalThis.fetch;
        globalThis.fetch = stubAmoApi(captured) as unknown as typeof globalThis.fetch;

        try {
            // Mirrors the flags submit.yml passes: listed channel, sources zip
            // attached, no AMO metadata file.
            const store = new FirefoxAddonStoreV5(
                {
                    zip,
                    sourcesZip,
                    extensionId: EXTENSION_ID,
                    channel: 'listed',
                    jwtIssuer: 'test-issuer',
                    jwtSecret: 'test-secret',
                    skipSubmitReview: false,
                },
                () => {},
            );
            await store.submit();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    /** The FormData sent to the version-create endpoint, which carries the sources zip. */
    const versionRequest = () => {
        const req = captured.find((r) => r.url.includes('/versions/') && r.method === 'POST');
        expect(req, 'expected a POST to the AMO versions endpoint').toBeDefined();
        expect(req!.body).toBeInstanceOf(FormData);
        return req!.body as FormData;
    };

    it('attaches the sources zip as a named file, not a bare blob', () => {
        const source = versionRequest().get('source');

        // Sanity check only — this passes on the broken version too, since
        // FormData wraps a nameless Blob into a File called "blob".
        expect(source).toBeInstanceOf(File);

        // This is the assertion that actually catches the regression: verified
        // against publish-browser-extension@6.0.0, where the name is "blob".
        expect((source as File).name).toBe('mini-mealie-9.9.9-sources.zip');
    });

    it('serializes the sources part with a .zip filename on the wire', async () => {
        // Assert against the encoded multipart body rather than just the object,
        // since the filename AMO validates comes from serialization.
        const body = await new Response(versionRequest()).text();
        const disposition = body.match(/name="source"[^\r\n]*/)?.[0] ?? '';

        expect(disposition).toContain('filename="mini-mealie-9.9.9-sources.zip"');
        expect(disposition).not.toContain('filename="blob"');
    });

    it('attaches the extension zip as a named file', async () => {
        const upload = captured.find(
            (r) => r.url.includes('/api/v5/addons/upload/') && r.method === 'POST',
        );
        expect(upload, 'expected a POST to the AMO upload endpoint').toBeDefined();
        expect(upload!.body).toBeInstanceOf(FormData);

        const file = (upload!.body as FormData).get('upload');
        expect(file).toBeInstanceOf(File);
        expect((file as File).name).toBe('mini-mealie-9.9.9-firefox.zip');
    });
});
