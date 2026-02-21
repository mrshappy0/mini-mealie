import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runCreateRecipe } from '../invoke';
import { RecipeCreateMode } from '../types/storageTypes';

vi.mock('../activity', () => ({
    beginActivity: vi.fn(),
    endActivity: vi.fn(),
}));

vi.mock('../logging', () => ({
    logEvent: vi.fn(),
    sanitizeUrl: vi.fn((url: string) => url),
}));

vi.mock('../network', () => ({
    createRecipeFromURL: vi.fn().mockResolvedValue('success'),
    createRecipeFromHTML: vi.fn().mockResolvedValue('success'),
}));

vi.mock('../storage', () => ({
    detectionCache: new Map(),
    invalidateDetectionCacheForUrl: vi.fn(),
}));

describe('invoke', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        global.chrome = {
            storage: {
                sync: {
                    get: vi.fn(),
                },
                local: {
                    set: vi.fn(),
                },
            },
            scripting: {
                executeScript: vi.fn().mockResolvedValue([
                    {
                        result: '<html><body>Test</body></html>',
                    },
                ]),
            },
            action: {
                openPopup: vi.fn(),
            },
        } as unknown as typeof chrome;
    });

    describe('runCreateRecipe - suggest HTML mode', () => {
        it('should suggest HTML mode when URL detection failed', async () => {
            const { detectionCache } = await import('../storage');
            const { logEvent } = await import('../logging');

            const mockUrl = 'https://example.com/recipe';

            // Set up cache with failed detection
            detectionCache.set(mockUrl, {
                outcome: 'not-recipe',
                checkedAt: Date.now(),
            });

            vi.mocked(chrome.storage.sync.get).mockImplementation((_keys, callback) => {
                callback?.({
                    mealieServer: 'https://mealie.local',
                    mealieApiToken: 'token',
                    recipeCreateMode: RecipeCreateMode.URL,
                });
            });

            runCreateRecipe({ id: 123, url: mockUrl } as chrome.tabs.Tab);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(logEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'suggestHtmlMode',
                    message: 'Opening popup to suggest HTML mode',
                }),
            );
            expect(chrome.storage.local.set).toHaveBeenCalledWith({ suggestHtmlMode: true });
            expect(chrome.action.openPopup).toHaveBeenCalled();
        });

        it('should suggest HTML mode when URL detection timed out', async () => {
            const { detectionCache } = await import('../storage');

            const mockUrl = 'https://example.com/recipe';

            detectionCache.set(mockUrl, {
                outcome: 'timeout',
                checkedAt: Date.now(),
            });

            vi.mocked(chrome.storage.sync.get).mockImplementation((_keys, callback) => {
                callback?.({
                    mealieServer: 'https://mealie.local',
                    mealieApiToken: 'token',
                    recipeCreateMode: RecipeCreateMode.URL,
                });
            });

            runCreateRecipe({ id: 123, url: mockUrl } as chrome.tabs.Tab);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(chrome.action.openPopup).toHaveBeenCalled();
        });

        it('should suggest HTML mode when URL detection had http error', async () => {
            const { detectionCache } = await import('../storage');

            const mockUrl = 'https://example.com/recipe';

            detectionCache.set(mockUrl, {
                outcome: 'http-error',
                status: 500,
                checkedAt: Date.now(),
            });

            vi.mocked(chrome.storage.sync.get).mockImplementation((_keys, callback) => {
                callback?.({
                    mealieServer: 'https://mealie.local',
                    mealieApiToken: 'token',
                });
            });

            runCreateRecipe({ id: 123, url: mockUrl } as chrome.tabs.Tab);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(chrome.action.openPopup).toHaveBeenCalled();
        });

        it('should not suggest HTML mode when detection succeeded', async () => {
            const { detectionCache } = await import('../storage');
            const { beginActivity } = await import('../activity');

            const mockUrl = 'https://example.com/recipe';

            detectionCache.set(mockUrl, {
                outcome: 'recipe',
                checkedAt: Date.now(),
            });

            vi.mocked(chrome.storage.sync.get).mockImplementation((_keys, callback) => {
                callback?.({
                    mealieServer: 'https://mealie.local',
                    mealieApiToken: 'token',
                });
            });

            runCreateRecipe({ id: 123, url: mockUrl } as chrome.tabs.Tab);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(chrome.action.openPopup).not.toHaveBeenCalled();
            expect(beginActivity).toHaveBeenCalled();
        });

        it('should not suggest HTML mode when no cache entry exists', async () => {
            const { detectionCache } = await import('../storage');
            const { beginActivity } = await import('../activity');

            detectionCache.clear();

            vi.mocked(chrome.storage.sync.get).mockImplementation((_keys, callback) => {
                callback?.({
                    mealieServer: 'https://mealie.local',
                    mealieApiToken: 'token',
                });
            });

            runCreateRecipe({ id: 123, url: 'https://example.com/recipe' } as chrome.tabs.Tab);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(chrome.action.openPopup).not.toHaveBeenCalled();
            expect(beginActivity).toHaveBeenCalled();
        });

        it('should not suggest HTML mode in HTML mode', async () => {
            const { detectionCache } = await import('../storage');
            const { beginActivity } = await import('../activity');

            const mockUrl = 'https://example.com/recipe';

            detectionCache.set(mockUrl, {
                outcome: 'not-recipe',
                checkedAt: Date.now(),
            });

            vi.mocked(chrome.storage.sync.get).mockImplementation((_keys, callback) => {
                callback?.({
                    mealieServer: 'https://mealie.local',
                    mealieApiToken: 'token',
                    recipeCreateMode: RecipeCreateMode.HTML,
                });
            });

            runCreateRecipe({ id: 123, url: mockUrl } as chrome.tabs.Tab);

            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(chrome.action.openPopup).not.toHaveBeenCalled();
            expect(beginActivity).toHaveBeenCalled();
        });
    });
});
