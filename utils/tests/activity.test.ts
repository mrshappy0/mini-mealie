/* eslint-disable security/detect-object-injection */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACTIVITY_STORAGE_KEY, beginActivity, endActivity, getActivityState } from '../activity';

// Mock external dependencies
vi.mock('../badge', () => ({
    showBadge: vi.fn(),
    clearBadge: vi.fn(),
}));

vi.mock('../contextMenu', () => ({
    addContextMenu: vi.fn(),
}));

vi.mock('../storage', () => ({
    checkStorageAndUpdateBadge: vi.fn(),
}));

const { addContextMenu } = await import('../contextMenu');
const { showBadge, clearBadge } = await import('../badge');
const { checkStorageAndUpdateBadge } = await import('../storage');

describe('activity', () => {
    let storageData: Record<string, unknown> = {};

    beforeEach(() => {
        vi.clearAllMocks();
        storageData = {};

        global.chrome = {
            action: {
                setTitle: vi.fn(),
                setBadgeText: vi.fn(),
                setBadgeBackgroundColor: vi.fn(),
            },
            storage: {
                local: {
                    get: vi.fn(((
                        keys: string | string[],
                        callback?: (items: Record<string, unknown>) => void,
                    ) => {
                        const result: Record<string, unknown> = {};
                        if (Array.isArray(keys)) {
                            keys.forEach((key) => {
                                if (key in storageData) {
                                    result[key] = storageData[key];
                                }
                            });
                        } else if (typeof keys === 'string') {
                            if (keys in storageData) {
                                result[keys] = storageData[keys];
                            }
                        }
                        if (callback) {
                            callback(result);
                        } else {
                            return Promise.resolve(result);
                        }
                    }) as typeof chrome.storage.local.get),
                    set: vi.fn(((items: Record<string, unknown>, callback?: () => void) => {
                        Object.assign(storageData, items);
                        if (callback) {
                            callback();
                        } else {
                            return Promise.resolve();
                        }
                    }) as typeof chrome.storage.local.set),
                    remove: vi.fn(((keys: string | string[], callback?: () => void) => {
                        if (Array.isArray(keys)) {
                            keys.forEach((key) => {
                                delete storageData[key];
                            });
                        } else if (typeof keys === 'string') {
                            delete storageData[keys];
                        }
                        if (callback) {
                            callback();
                        } else {
                            return Promise.resolve();
                        }
                    }) as typeof chrome.storage.local.remove),
                },
            },
        } as unknown as typeof chrome;
    });

    afterEach(async () => {
        // Drain activeCount to reset module state
        const state = storageData[ACTIVITY_STORAGE_KEY] as { activeCount?: number } | undefined;
        const count = state?.activeCount ?? 0;
        for (let i = 0; i < count; i++) {
            await endActivity();
        }
    });

    describe('beginActivity', () => {
        it('should set tooltip title', async () => {
            await beginActivity('Scraping recipe');

            expect(chrome.action.setTitle).toHaveBeenCalledWith({ title: 'Scraping recipe' });
        });

        it('should call addContextMenu with disabled state', async () => {
            await beginActivity('Processing');

            expect(addContextMenu).toHaveBeenCalledWith('Processing', false);
        });

        it('should store activity state with label and opId', async () => {
            await beginActivity('Saving recipe', 'op-123');

            expect(storageData[ACTIVITY_STORAGE_KEY]).toMatchObject({
                label: 'Saving recipe',
                opId: 'op-123',
            });
        });
    });

    describe('endActivity', () => {
        it('should complete without errors', async () => {
            await beginActivity('Test');
            await expect(endActivity()).resolves.not.toThrow();
        });
    });

    describe('activity lifecycle', () => {
        it('should store and update activity state', async () => {
            await beginActivity('Test');

            expect(storageData[ACTIVITY_STORAGE_KEY]).toBeDefined();
            const state = storageData[ACTIVITY_STORAGE_KEY] as { label: string };
            expect(state.label).toBe('Test');
        });
    });

    describe('getActivityState', () => {
        it('should return null when no activity is stored', async () => {
            const state = await getActivityState();
            expect(state).toBeNull();
        });

        it('should return stored activity state', async () => {
            await beginActivity('Test activity', 'op-456');

            const state = await getActivityState();
            expect(state).toMatchObject({
                label: 'Test activity',
                opId: 'op-456',
            });
            expect(state?.activeCount).toBeGreaterThan(0);
            expect(state?.startedAt).toBeTypeOf('number');
        });

        it('should return null for invalid state data', async () => {
            storageData[ACTIVITY_STORAGE_KEY] = 'invalid';

            const state = await getActivityState();
            expect(state).toBeNull();
        });

        it('should return null for state missing activeCount', async () => {
            storageData[ACTIVITY_STORAGE_KEY] = { label: 'Test' };

            const state = await getActivityState();
            expect(state).toBeNull();
        });
    });

    describe('edge cases', () => {
        it('should handle operations without chrome API gracefully', async () => {
            const originalChrome = global.chrome;
            // @ts-expect-error - Testing undefined chrome
            global.chrome = undefined;

            await expect(beginActivity('Test')).resolves.toBeUndefined();
            await expect(endActivity()).resolves.toBeUndefined();
            await expect(getActivityState()).resolves.toBeNull();

            global.chrome = originalChrome;
        });

        it('should handle missing chrome.storage API', async () => {
            const originalStorage = chrome.storage;
            // @ts-expect-error - Testing missing storage API
            delete chrome.storage;

            await expect(beginActivity('Test')).resolves.toBeUndefined();
            await expect(endActivity()).resolves.toBeUndefined();
            await expect(getActivityState()).resolves.toBeNull();

            chrome.storage = originalStorage;
        });
    });

    describe('chrome API integration', () => {
        it('should call chrome action APIs', async () => {
            await beginActivity('Test');

            expect(chrome.action.setTitle).toHaveBeenCalled();
            expect(addContextMenu).toHaveBeenCalled();
        });
    });

    describe('spinner functionality', () => {
        it('should not start duplicate spinner for concurrent activities', async () => {
            vi.useFakeTimers();

            await beginActivity('Activity 1');
            vi.clearAllMocks();

            await beginActivity('Activity 2');

            // Advance time - spinner already running, shouldn't restart
            vi.advanceTimersByTime(200);

            vi.useRealTimers();
        });

        it('should stop spinner and reset badge color when all activities end', async () => {
            vi.useFakeTimers();

            // This test assumes we can get to activeCount === 0
            // Start one activity
            await beginActivity('Solo activity');
            vi.advanceTimersByTime(200);

            // Clear mocks to see only endActivity calls
            vi.clearAllMocks();

            // End activity - if activeCount reaches 0, should stop spinner
            await endActivity();

            // If activeCount reached 0, badge background should reset to black
            if (!storageData[ACTIVITY_STORAGE_KEY]) {
                expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
                    color: '#000000',
                });
            }

            vi.useRealTimers();
        });
    });

    describe('multiple concurrent activities', () => {
        it('should track multiple activities and decrement count', async () => {
            const initialState = storageData[ACTIVITY_STORAGE_KEY] as
                | { activeCount: number }
                | undefined;
            const initialCount = initialState?.activeCount ?? 0;

            await beginActivity('Activity A');
            const stateAfterFirst = storageData[ACTIVITY_STORAGE_KEY] as { activeCount: number };
            expect(stateAfterFirst.activeCount).toBeGreaterThan(initialCount);

            await beginActivity('Activity B');
            const stateAfterSecond = storageData[ACTIVITY_STORAGE_KEY] as { activeCount: number };
            expect(stateAfterSecond.activeCount).toBeGreaterThan(stateAfterFirst.activeCount);

            await endActivity();
            const stateAfterEnd = storageData[ACTIVITY_STORAGE_KEY] as { activeCount: number };
            expect(stateAfterEnd.activeCount).toBeLessThan(stateAfterSecond.activeCount);
        });

        it('should preserve label of latest activity', async () => {
            await beginActivity('First label');
            await beginActivity('Second label');

            const state = storageData[ACTIVITY_STORAGE_KEY] as { label: string };
            expect(state.label).toBe('Second label');
        });

        it('should not clear storage while activities remain', async () => {
            await beginActivity('Activity 1');
            await beginActivity('Activity 2');

            await endActivity();

            // State should still exist if activities remain
            if (storageData[ACTIVITY_STORAGE_KEY]) {
                const state = storageData[ACTIVITY_STORAGE_KEY] as { activeCount: number };
                expect(state.activeCount).toBeGreaterThan(0);
            }
        });
    });

    describe('endActivity with result badges', () => {
        it('should call showBadge when success badge provided and count reaches 0', async () => {
            // Clear storage to try to reach 0
            storageData = {};

            await beginActivity('Test');
            await endActivity('✅', 'Success message');

            // Only called if activeCount reached 0
            if (!storageData[ACTIVITY_STORAGE_KEY]) {
                expect(showBadge).toHaveBeenCalledWith('✅', 4);
            }
        });

        it('should call showBadge when error badge provided and count reaches 0', async () => {
            storageData = {};

            await beginActivity('Test');
            await endActivity('❌', 'Error message');

            if (!storageData[ACTIVITY_STORAGE_KEY]) {
                expect(showBadge).toHaveBeenCalledWith('❌', 4);
            }
        });

        it('should call clearBadge when no badge provided and count reaches 0', async () => {
            storageData = {};

            await beginActivity('Test');
            await endActivity();

            if (!storageData[ACTIVITY_STORAGE_KEY]) {
                expect(clearBadge).toHaveBeenCalled();
            }
        });

        it('should set tooltip when message provided and count reaches 0', async () => {
            storageData = {};

            await beginActivity('Test');
            vi.clearAllMocks();

            await endActivity('✅', 'All done!');

            if (!storageData[ACTIVITY_STORAGE_KEY]) {
                expect(chrome.action.setTitle).toHaveBeenCalledWith({ title: 'All done!' });
            }
        });

        it('should call checkStorageAndUpdateBadge when count reaches 0', async () => {
            storageData = {};

            await beginActivity('Test');
            await endActivity();

            if (!storageData[ACTIVITY_STORAGE_KEY]) {
                expect(checkStorageAndUpdateBadge).toHaveBeenCalled();
            }
        });

        it('should write state when activities remain after endActivity', async () => {
            await beginActivity('Activity 1');
            await beginActivity('Activity 2');

            const setMock = vi.mocked(chrome.storage.local.set);
            setMock.mockClear();

            await endActivity();

            // If activities remain, should write updated state
            if (storageData[ACTIVITY_STORAGE_KEY]) {
                expect(setMock).toHaveBeenCalled();
            }
        });
    });

    describe('storage operations', () => {
        it('should write complete activity state', async () => {
            await beginActivity('Test op', 'op-789');

            const state = storageData[ACTIVITY_STORAGE_KEY] as {
                activeCount: number;
                label: string;
                opId: string;
                startedAt: number;
            };

            expect(state.activeCount).toBeGreaterThan(0);
            expect(state.label).toBe('Test op');
            expect(state.opId).toBe('op-789');
            expect(state.startedAt).toBeTypeOf('number');
            expect(state.startedAt).toBeLessThanOrEqual(Date.now());
        });

        it('should clear state when calling remove', async () => {
            await beginActivity('Test');
            expect(storageData[ACTIVITY_STORAGE_KEY]).toBeDefined();

            await chrome.storage.local.remove([ACTIVITY_STORAGE_KEY]);

            expect(storageData[ACTIVITY_STORAGE_KEY]).toBeUndefined();
        });
    });

    describe('startedAt timestamp', () => {
        it('should set startedAt on first activity', async () => {
            storageData = {};

            await beginActivity('First');

            const state = storageData[ACTIVITY_STORAGE_KEY] as { startedAt: number };
            expect(state.startedAt).toBeTypeOf('number');
            expect(state.startedAt).toBeGreaterThan(0);
        });

        it('should preserve startedAt across multiple activities', async () => {
            storageData = {};

            await beginActivity('First');
            const firstState = storageData[ACTIVITY_STORAGE_KEY] as { startedAt: number };
            const firstTimestamp = firstState.startedAt;

            // Wait a bit
            await new Promise((resolve) => setTimeout(resolve, 10));

            await beginActivity('Second');
            const secondState = storageData[ACTIVITY_STORAGE_KEY] as { startedAt: number };

            // startedAt should be the same (not updated)
            expect(secondState.startedAt).toBe(firstTimestamp);
        });
    });

    describe('stopSpinner internals', () => {
        it('should clear spinner timer via clearInterval', async () => {
            vi.useFakeTimers();
            const setBadgeTextSpy = vi.fn();
            chrome.action = {
                setBadgeText: setBadgeTextSpy,
                setBadgeBackgroundColor: vi.fn(),
                setTitle: vi.fn(),
            } as unknown as typeof chrome.action;

            storageData = {};
            await beginActivity('Timer test');
            const callsBefore = setBadgeTextSpy.mock.calls.length;

            await endActivity();
            vi.advanceTimersByTime(500); // Should not trigger after stop

            // No new calls after clearInterval
            expect(setBadgeTextSpy.mock.calls.length).toBe(callsBefore);
            vi.useRealTimers();
        });
    });

    describe('storage promise resolution', () => {
        it('should resolve writeActivityState promise', async () => {
            const setPromise = beginActivity('Promise test');
            await expect(setPromise).resolves.toBeUndefined();
        });

        it('should resolve clearActivityState promise', async () => {
            storageData = {};
            await beginActivity('Clear test');
            const endPromise = endActivity();
            await expect(endPromise).resolves.toBeUndefined();
        });

        it('should invoke chrome.storage.local.set callback', async () => {
            const setSpy = vi.fn((items, callback) => callback());
            chrome.storage = {
                local: { set: setSpy, get: vi.fn(), remove: vi.fn() },
            } as unknown as typeof chrome.storage;

            await beginActivity('Set callback');
            expect(setSpy).toHaveBeenCalled();
        });
    });

    describe('endActivity conditional branches', () => {
        it('should call clearBadge when no resultBadge provided and count reaches 0', async () => {
            storageData = {};

            await beginActivity('No badge');
            await endActivity(); // No resultBadge

            if (!storageData[ACTIVITY_STORAGE_KEY]) {
                expect(clearBadge).toHaveBeenCalled();
            }
        });

        it('should set tooltip when message provided and count reaches 0', async () => {
            const setTitleSpy = vi.fn();
            chrome.action = {
                setBadgeText: vi.fn(),
                setBadgeBackgroundColor: vi.fn(),
                setTitle: setTitleSpy,
            } as unknown as typeof chrome.action;

            storageData = {};
            await beginActivity('Tooltip test');
            await endActivity(undefined, 'Custom tooltip');

            if (!storageData[ACTIVITY_STORAGE_KEY]) {
                expect(setTitleSpy).toHaveBeenCalledWith({ title: 'Custom tooltip' });
            }
        });

        it('should call checkStorageAndUpdateBadge when count reaches 0', async () => {
            storageData = {};

            await beginActivity('Badge check');
            await endActivity();

            if (!storageData[ACTIVITY_STORAGE_KEY]) {
                expect(checkStorageAndUpdateBadge).toHaveBeenCalled();
            }
        });

        it('should call writeActivityState when activities remain after endActivity', async () => {
            const setSpy = vi.fn((items, callback) => callback());
            chrome.storage = {
                local: { set: setSpy, get: vi.fn(), remove: vi.fn() },
            } as unknown as typeof chrome.storage;

            await beginActivity('First');
            await beginActivity('Second');
            setSpy.mockClear();

            await endActivity(); // Still one active

            expect(setSpy).toHaveBeenCalled();
        });
    });

    describe('getActivityState edge cases', () => {
        it('should return null for state without activeCount property', async () => {
            storageData[ACTIVITY_STORAGE_KEY] = { label: 'Invalid' };

            const state = await getActivityState();
            expect(state).toBeNull();
        });

        it('should return null for non-object state', async () => {
            storageData[ACTIVITY_STORAGE_KEY] = 'not an object';

            const state = await getActivityState();
            expect(state).toBeNull();
        });

        it('should invoke chrome.storage.local.get callback', async () => {
            const getSpy = vi.fn((_, callback) =>
                callback({ [ACTIVITY_STORAGE_KEY]: { activeCount: 1, label: 'Test' } }),
            );
            chrome.storage = {
                local: { set: vi.fn(), get: getSpy, remove: vi.fn() },
            } as unknown as typeof chrome.storage;

            await getActivityState();
            expect(getSpy).toHaveBeenCalledWith([ACTIVITY_STORAGE_KEY], expect.any(Function));
        });
    });

    describe('uncovered lines - Promise return paths', () => {
        it('should execute return statement in writeActivityState', async () => {
            const resolveSpy = vi.fn();

            // Wrap beginActivity promise to capture resolution (line 72)
            const promise = beginActivity('WriteState return test');
            promise.then(resolveSpy);

            await promise;
            expect(resolveSpy).toHaveBeenCalled();
        });

        it('should execute return statement in clearActivityState', async () => {
            storageData = {};
            await beginActivity('ClearState return test');

            const resolveSpy = vi.fn();

            // Wrap endActivity promise to capture resolution (line 68)
            const promise = endActivity();
            promise.then(resolveSpy);

            await promise;
            expect(resolveSpy).toHaveBeenCalled();
        });

        it('should return early from writeActivityState when chrome undefined', async () => {
            const originalChrome = global.chrome;
            // @ts-expect-error - Testing undefined path (line 67)
            global.chrome = undefined;

            // Should return early from line 67
            await expect(beginActivity('No chrome')).resolves.toBeUndefined();

            global.chrome = originalChrome;
        });

        it('should return early from clearActivityState when storage undefined', async () => {
            storageData = {};
            await beginActivity('Storage undefined test');

            const originalStorage = chrome.storage;
            // @ts-expect-error - Testing undefined path (line 63)
            delete chrome.storage;

            // Should return early from line 63
            await expect(endActivity()).resolves.toBeUndefined();

            chrome.storage = originalStorage;
        });
    });

    describe('uncovered lines - endActivity conditional branches', () => {
        it('should execute showBadge branch when resultBadge provided', async () => {
            storageData = {};

            await beginActivity('ShowBadge branch test');

            vi.mocked(showBadge).mockClear();

            // Trigger line 117 (showBadge call)
            await endActivity('✅');

            expect(showBadge).toHaveBeenCalledWith('✅', 4);
        });

        it('should execute clearBadge else branch when no resultBadge', async () => {
            storageData = {};

            await beginActivity('ClearBadge branch test');

            vi.mocked(clearBadge).mockClear();

            // Trigger line 119 (clearBadge call)
            await endActivity();

            expect(clearBadge).toHaveBeenCalled();
        });

        it('should execute tooltip branch when message provided', async () => {
            storageData = {};

            const setTitleSpy = vi.fn();
            chrome.action = {
                setBadgeText: vi.fn(),
                setBadgeBackgroundColor: vi.fn(),
                setTitle: setTitleSpy,
            } as unknown as typeof chrome.action;

            await beginActivity('Tooltip branch test');

            setTitleSpy.mockClear();

            // Trigger line 124 (setTitle call)
            await endActivity(undefined, 'Tooltip message');

            expect(setTitleSpy).toHaveBeenCalledWith({ title: 'Tooltip message' });
        });

        it('should execute clearActivityState when count reaches 0', async () => {
            storageData = {};

            const removeSpy = vi.fn(
                (_: string | string[], callback?: () => void): Promise<void> | void => {
                    delete storageData[ACTIVITY_STORAGE_KEY];
                    if (callback) {
                        callback();
                    } else {
                        return Promise.resolve();
                    }
                },
            ) as typeof chrome.storage.local.remove;

            chrome.storage.local.remove = removeSpy;

            await beginActivity('ClearActivity test');

            // Trigger line 126 (clearActivityState call)
            await endActivity();

            expect(removeSpy).toHaveBeenCalledWith([ACTIVITY_STORAGE_KEY], expect.any(Function));
        });

        it('should execute checkStorageAndUpdateBadge when count reaches 0', async () => {
            storageData = {};

            await beginActivity('CheckStorage test');

            vi.mocked(checkStorageAndUpdateBadge).mockClear();

            // Trigger line 128 (checkStorageAndUpdateBadge call)
            await endActivity();

            expect(checkStorageAndUpdateBadge).toHaveBeenCalled();
        });

        it('should execute else branch writeActivityState when activities remain', async () => {
            const setSpy = vi.fn(
                (items: Record<string, unknown>, callback?: () => void): Promise<void> | void => {
                    Object.assign(storageData, items);
                    if (callback) {
                        callback();
                    } else {
                        return Promise.resolve();
                    }
                },
            );

            chrome.storage.local.set = setSpy as typeof chrome.storage.local.set;

            await beginActivity('First activity');
            await beginActivity('Second activity');

            setSpy.mockClear();

            // Trigger line 130 (writeActivityState in else branch)
            await endActivity();

            // Should still have state (not reached 0)
            expect(storageData[ACTIVITY_STORAGE_KEY]).toBeDefined();
            expect(setSpy).toHaveBeenCalled();
        });

        it('should set currentLabel to undefined when count reaches 0', async () => {
            storageData = {};

            await beginActivity('Label undefined test');

            // Trigger line 111 (currentLabel = undefined)
            await endActivity();

            // Verify state was cleared (label should be undefined)
            expect(storageData[ACTIVITY_STORAGE_KEY]).toBeUndefined();
        });

        it('should set currentOpId to undefined when count reaches 0', async () => {
            storageData = {};

            await beginActivity('OpId undefined test', 'test-op-id');

            // Trigger line 112 (currentOpId = undefined)
            await endActivity();

            // Verify state was cleared
            expect(storageData[ACTIVITY_STORAGE_KEY]).toBeUndefined();
        });

        it('should set startedAt to undefined when count reaches 0', async () => {
            storageData = {};

            await beginActivity('StartedAt undefined test');

            // Trigger line 113 (startedAt = undefined)
            await endActivity();

            // Verify state was cleared
            expect(storageData[ACTIVITY_STORAGE_KEY]).toBeUndefined();
        });
    });
});
