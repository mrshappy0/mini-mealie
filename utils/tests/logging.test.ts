/* eslint-disable security/detect-object-injection */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    clearEvents,
    EVENT_LOG_STORAGE_KEY,
    getRecentEvents,
    logEvent,
    sanitizeUrl,
    withOperation,
} from '../logging';

describe('logging', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        global.chrome = {
            storage: {
                local: {
                    get: vi.fn(),
                    set: vi.fn((_items, callback) => callback?.()),
                    remove: vi.fn((_keys, callback) => callback?.()),
                },
            },
        } as unknown as typeof chrome;

        // Mock crypto.randomUUID using vi.stubGlobal
        vi.stubGlobal('crypto', {
            randomUUID: vi.fn(() => '12345678-1234-1234-1234-123456789abc'),
        });
    });

    describe('sanitizeUrl', () => {
        it('should remove query parameters and hash', () => {
            const url = 'https://example.com/recipe?id=123&token=secret#section';
            expect(sanitizeUrl(url)).toBe('https://example.com/recipe');
        });

        it('should preserve origin and pathname', () => {
            const url = 'https://recipes.example.com/path/to/recipe';
            expect(sanitizeUrl(url)).toBe('https://recipes.example.com/path/to/recipe');
        });

        it('should handle invalid URLs', () => {
            expect(sanitizeUrl('not-a-url')).toBe('[invalid-url]');
            expect(sanitizeUrl('')).toBe('[invalid-url]');
        });

        it('should handle URLs with port', () => {
            const url = 'http://localhost:3000/recipe';
            expect(sanitizeUrl(url)).toBe('http://localhost:3000/recipe');
        });
    });

    describe('logEvent', () => {
        it('should create and store a log event', async () => {
            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({});
            });

            await logEvent({
                level: 'info',
                feature: 'recipe-create',
                action: 'createFromUrl',
                phase: 'start',
                message: 'Creating recipe',
            });

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    [EVENT_LOG_STORAGE_KEY]: expect.arrayContaining([
                        expect.objectContaining({
                            level: 'info',
                            feature: 'recipe-create',
                            action: 'createFromUrl',
                            phase: 'start',
                            message: 'Creating recipe',
                            id: expect.any(String),
                            ts: expect.any(Number),
                        }),
                    ]),
                }),
                expect.any(Function),
            );
        });

        it('should sanitize sensitive data', async () => {
            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({});
            });

            await logEvent({
                level: 'info',
                feature: 'auth',
                action: 'login',
                message: 'Logging in',
                data: {
                    server: 'https://example.com',
                    token: 'secret-token',
                    password: 'secret-password',
                    apiKey: 'secret-key',
                    validField: 'visible',
                },
            });

            const setCall = vi.mocked(chrome.storage.local.set).mock.calls[0];
            const events = (setCall[0] as Record<string, unknown>)[EVENT_LOG_STORAGE_KEY] as Array<{
                data?: Record<string, unknown>;
            }>;
            const event = events[0];

            expect(event.data).toBeDefined();
            expect(event.data?.validField).toBe('visible');
            expect(event.data?.server).toBe('https://example.com');
            // Sensitive fields should be removed
            expect(event.data?.token).toBeUndefined();
            expect(event.data?.password).toBeUndefined();
            expect(event.data?.apiKey).toBeUndefined();
        });

        it('should truncate long strings in data', async () => {
            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({});
            });

            const longString = 'x'.repeat(1000);

            await logEvent({
                level: 'info',
                feature: 'html-capture',
                action: 'getPageHTML',
                message: 'Captured HTML',
                data: {
                    html: longString,
                },
            });

            const setCall = vi.mocked(chrome.storage.local.set).mock.calls[0];
            const events = (setCall[0] as Record<string, unknown>)[EVENT_LOG_STORAGE_KEY] as Array<{
                data?: Record<string, unknown>;
            }>;
            const event = events[0];

            expect(event.data?.html).toBe('[string, 1000 chars]');
        });

        it('should maintain ring buffer with max 300 events', async () => {
            const existingEvents = Array.from({ length: 300 }, (_, i) => ({
                id: `event-${i}`,
                ts: Date.now() - i * 1000,
                level: 'info' as const,
                feature: 'test' as const,
                action: 'test',
                message: `Event ${i}`,
            }));

            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({ [EVENT_LOG_STORAGE_KEY]: existingEvents });
            });

            await logEvent({
                level: 'info',
                feature: 'recipe-create',
                action: 'test',
                message: 'New event',
            });

            const setCall = vi.mocked(chrome.storage.local.set).mock.calls[0];
            const events = (setCall[0] as Record<string, unknown>)[
                EVENT_LOG_STORAGE_KEY
            ] as Array<unknown>;

            // Should still be 300 events (oldest removed)
            expect(events.length).toBe(300);
            // New event should be last (newest)
            expect((events[events.length - 1] as { message: string }).message).toBe('New event');
        });

        it('should write to console based on log level', async () => {
            const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({});
            });

            await logEvent({
                level: 'info',
                feature: 'recipe-create',
                action: 'test',
                message: 'Info message',
            });
            expect(consoleLog).toHaveBeenCalled();

            consoleLog.mockClear();

            await logEvent({
                level: 'warn',
                feature: 'recipe-create',
                action: 'test',
                message: 'Warning message',
            });
            expect(consoleLog).toHaveBeenCalled();

            await logEvent({
                level: 'error',
                feature: 'recipe-create',
                action: 'test',
                message: 'Error message',
            });
            expect(consoleError).toHaveBeenCalled();

            consoleLog.mockRestore();
            consoleError.mockRestore();
        });

        it('should handle missing chrome API gracefully', async () => {
            const originalChrome = global.chrome;
            // @ts-expect-error - testing undefined chrome
            global.chrome = undefined;

            await expect(
                logEvent({
                    level: 'info',
                    feature: 'recipe-create',
                    action: 'test',
                    message: 'Test',
                }),
            ).resolves.not.toThrow();

            global.chrome = originalChrome;
        });
    });

    describe('getRecentEvents', () => {
        it('should return stored events', async () => {
            const mockEvents = [
                {
                    id: '1',
                    ts: Date.now(),
                    level: 'info' as const,
                    feature: 'test' as const,
                    action: 'test',
                    message: 'Event 1',
                },
                {
                    id: '2',
                    ts: Date.now(),
                    level: 'error' as const,
                    feature: 'test' as const,
                    action: 'test',
                    message: 'Event 2',
                },
            ];

            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({ [EVENT_LOG_STORAGE_KEY]: mockEvents });
            });

            const events = await getRecentEvents();
            expect(events).toEqual(mockEvents);
        });

        it('should limit events to specified amount', async () => {
            const mockEvents = Array.from({ length: 100 }, (_, i) => ({
                id: `${i}`,
                ts: Date.now(),
                level: 'info' as const,
                feature: 'test' as const,
                action: 'test',
                message: `Event ${i}`,
            }));

            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({ [EVENT_LOG_STORAGE_KEY]: mockEvents });
            });

            const events = await getRecentEvents(10);
            expect(events.length).toBe(10);
            // Should return the last 10
            expect(events[0].message).toBe('Event 90');
        });

        it('should return empty array when no events exist', async () => {
            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({});
            });

            const events = await getRecentEvents();
            expect(events).toEqual([]);
        });

        it('should handle invalid data gracefully', async () => {
            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({ [EVENT_LOG_STORAGE_KEY]: 'invalid' });
            });

            const events = await getRecentEvents();
            expect(events).toEqual([]);
        });
    });

    describe('clearEvents', () => {
        it('should clear event log from storage', async () => {
            await clearEvents();

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { [EVENT_LOG_STORAGE_KEY]: [] },
                expect.any(Function),
            );
        });

        it('should handle missing chrome API gracefully', async () => {
            const originalChrome = global.chrome;
            // @ts-expect-error - testing undefined chrome
            global.chrome = undefined;

            await expect(clearEvents()).resolves.not.toThrow();

            global.chrome = originalChrome;
        });
    });

    describe('withOperation', () => {
        it('should log start and success events', async () => {
            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({});
            });

            const result = await withOperation(
                {
                    feature: 'recipe-create',
                    action: 'createFromUrl',
                    message: 'Creating recipe',
                    data: { url: 'https://example.com' },
                },
                async () => 'success-result',
            );

            expect(result).toBe('success-result');

            const setCalls = vi.mocked(chrome.storage.local.set).mock.calls;
            expect(setCalls.length).toBe(2); // start + success

            const startEvent = (
                (setCalls[0][0] as Record<string, unknown>)[EVENT_LOG_STORAGE_KEY] as Array<{
                    phase?: string;
                }>
            )[0];
            expect(startEvent.phase).toBe('start');

            const successEvent = (
                (setCalls[1][0] as Record<string, unknown>)[EVENT_LOG_STORAGE_KEY] as Array<{
                    phase?: string;
                }>
            )[0];
            expect(successEvent.phase).toBe('success');
        });

        it('should log failure when operation throws', async () => {
            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({});
            });

            await expect(
                withOperation(
                    {
                        feature: 'recipe-create',
                        action: 'createFromUrl',
                        message: 'Creating recipe',
                    },
                    async () => {
                        throw new Error('Test error');
                    },
                ),
            ).rejects.toThrow('Test error');

            const setCalls = vi.mocked(chrome.storage.local.set).mock.calls;

            const failureEvent = (
                (setCalls[1][0] as Record<string, unknown>)[EVENT_LOG_STORAGE_KEY] as Array<{
                    phase?: string;
                    level?: string;
                }>
            )[0];
            expect(failureEvent.phase).toBe('failure');
            expect(failureEvent.level).toBe('error');
        });

        it('should use custom success predicate', async () => {
            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({});
            });

            await withOperation(
                {
                    feature: 'recipe-create',
                    action: 'createFromUrl',
                    message: 'Creating recipe',
                },
                async () => 'failure',
                (result) => result === 'success',
            );

            const setCalls = vi.mocked(chrome.storage.local.set).mock.calls;

            const resultEvent = (
                (setCalls[1][0] as Record<string, unknown>)[EVENT_LOG_STORAGE_KEY] as Array<{
                    phase?: string;
                    level?: string;
                }>
            )[0];
            expect(resultEvent.phase).toBe('failure');
            expect(resultEvent.level).toBe('warn');
        });

        it('should include duration in result events', async () => {
            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({});
            });

            await withOperation(
                {
                    feature: 'recipe-create',
                    action: 'test',
                    message: 'Test',
                },
                async () => {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    return 'done';
                },
            );

            const setCalls = vi.mocked(chrome.storage.local.set).mock.calls;

            const successEvent = (
                (setCalls[1][0] as Record<string, unknown>)[EVENT_LOG_STORAGE_KEY] as Array<{
                    durationMs?: number;
                }>
            )[0];
            expect(successEvent.durationMs).toBeGreaterThanOrEqual(0);
        });
    });

    describe('generateId', () => {
        it('should use crypto.randomUUID when available', async () => {
            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({});
            });

            await logEvent({
                level: 'info',
                feature: 'recipe-create',
                action: 'test',
                message: 'Test',
            });

            const setCall = vi.mocked(chrome.storage.local.set).mock.calls[0];
            const events = (setCall[0] as Record<string, unknown>)[EVENT_LOG_STORAGE_KEY] as Array<{
                id: string;
            }>;
            expect(events[0].id).toBe('12345678-1234-1234-1234-123456789abc');
        });

        it('should fallback to Date+random when crypto unavailable', async () => {
            const originalCrypto = global.crypto;
            // @ts-expect-error - testing missing randomUUID
            global.crypto = { randomUUID: undefined };

            vi.mocked(chrome.storage.local.get).mockImplementation((_keys, callback) => {
                callback?.({});
            });

            await logEvent({
                level: 'info',
                feature: 'recipe-create',
                action: 'test',
                message: 'Test',
            });

            const setCall = vi.mocked(chrome.storage.local.set).mock.calls[0];
            const events = (setCall[0] as Record<string, unknown>)[EVENT_LOG_STORAGE_KEY] as Array<{
                id: string;
            }>;
            // Should match timestamp-random pattern
            expect(events[0].id).toMatch(/^\d+-[a-z0-9]+$/);

            global.crypto = originalCrypto;
        });
    });
});
