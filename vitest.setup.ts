import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// `test.globals` isn't enabled, so @testing-library/react can't auto-detect a
// global `afterEach` to clean up between tests. Without this, every render()
// stays mounted (and every mounted App keeps its chrome.storage.onChanged
// listener live), so later tests see a DOM with multiple stacked component
// trees reacting to the same storage events.
afterEach(() => {
    cleanup();
});

type StorageMethod = 'get' | 'set' | 'remove' | 'clear';
const STORAGE_METHODS: StorageMethod[] = ['get', 'set', 'remove', 'clear'];

// Captured once per storage area (before any vi.spyOn wrapping) so that
// re-running withCallbackSupport every beforeEach — needed because a test's
// own vi.restoreAllMocks() would strip the bridge — never wraps a wrapper.
const pristineOriginals = new WeakMap<
    object,
    Partial<Record<StorageMethod, (...args: unknown[]) => Promise<unknown>>>
>();

/**
 * fake-browser's chrome.storage.* methods are promise-only (see
 * @webext-core/fake-browser). Real Chrome also accepts an optional trailing
 * callback, which is the style this codebase uses throughout. Bridge that so
 * app code doesn't need test-only branches.
 */
function withCallbackSupport(area: unknown) {
    if (!area || typeof area !== 'object') return;
    const target = area as Record<string, unknown>;

    let originals = pristineOriginals.get(target);
    if (!originals) {
        originals = {};
        for (const method of STORAGE_METHODS) {
            // eslint-disable-next-line security/detect-object-injection -- method is from the fixed STORAGE_METHODS list, not user input
            const fn = target[method];
            if (typeof fn === 'function') {
                // eslint-disable-next-line security/detect-object-injection -- see above
                originals[method] = (fn as (...args: unknown[]) => Promise<unknown>).bind(target);
            }
        }
        pristineOriginals.set(target, originals);
    }

    for (const method of STORAGE_METHODS) {
        // eslint-disable-next-line security/detect-object-injection -- method is from the fixed STORAGE_METHODS list, not user input
        const original = originals[method];
        if (!original) continue;

        const spy = vi.spyOn(
            target as unknown as Record<StorageMethod, (...args: unknown[]) => unknown>,
            method,
        );
        spy.mockImplementation((...args: unknown[]) => {
            const maybeCallback = args[args.length - 1];
            if (typeof maybeCallback === 'function') {
                const callback = maybeCallback as (value: unknown) => void;
                void original(...args.slice(0, -1)).then((value) => callback(value));
                return undefined;
            }
            return original(...args);
        });
    }
}

beforeEach(() => {
    if (typeof chrome === 'undefined') return;

    // fake-browser defaults runtime.lastError to `{ message: '' }` — a truthy
    // object — instead of `undefined` like real Chrome absent an error, which
    // trips every `if (chrome.runtime.lastError)` guard unconditionally.
    if (chrome.runtime) {
        // @ts-expect-error - real Chrome's type doesn't allow undefined, but that's the actual no-error value
        chrome.runtime.lastError = undefined;
    }

    if (!chrome.storage) return;
    withCallbackSupport(chrome.storage.sync);
    withCallbackSupport(chrome.storage.local);
});
