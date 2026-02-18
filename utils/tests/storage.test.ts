import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WxtVitest } from 'wxt/testing';

import { clearBadge, showBadge } from '../badge';
import { removeContextMenu, updateContextMenu } from '../contextMenu';
import { testScrapeUrlDetailed } from '../network';
import { checkStorageAndUpdateBadge, clearDetectionCache } from '../storage';

void WxtVitest();

const mockActiveTab = {
    url: 'https://recipe.org/mock-recipe-url',
    index: 0,
    pinned: false,
    highlighted: false,
    windowId: 0,
    active: true,
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: false,
    groupId: 0,
};

vi.mock('../badge', () => ({
    showBadge: vi.fn(),
    clearBadge: vi.fn(),
}));

vi.mock('../contextMenu', () => ({
    removeContextMenu: vi.fn(() => Promise.resolve()),
    updateContextMenu: vi.fn(() => Promise.resolve()),
}));

vi.mock('../network', () => ({
    testScrapeUrlDetailed: vi.fn(() => Promise.resolve({ outcome: 'not-recipe' })),
}));

vi.mock('../logging', () => ({
    logEvent: vi.fn(),
    sanitizeUrl: vi.fn((url: string) => url),
}));

describe('checkStorageAndUpdateBadge', () => {
    beforeEach(() => {
        fakeBrowser.reset();
        vi.clearAllMocks();
        clearDetectionCache();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should show ❌ badge and call removeContextMenu if mealieServer or mealieApiToken is undefined', async () => {
        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string | undefined>) => void) => {
                callback({ mealieServer: undefined, mealieApiToken: 'mock-token' });
            },
        );

        const mockShowBadge = vi.mocked(showBadge);
        const mockRemoveContextMenu = vi.mocked(removeContextMenu);
        const mockClearBadge = vi.mocked(clearBadge);
        const mockUpdateContextMenu = vi.mocked(updateContextMenu);

        await checkStorageAndUpdateBadge();

        expect(mockShowBadge).toHaveBeenCalledWith('❌');
        expect(mockRemoveContextMenu).toHaveBeenCalledTimes(1);
        expect(mockClearBadge).not.toHaveBeenCalled();
        expect(mockUpdateContextMenu).not.toHaveBeenCalled();
    });

    it('should clear badge and add context menu if mealieServer and mealieApiToken exist', async () => {
        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
            },
        );

        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([mockActiveTab]);

        const mockedShowBadge = vi.mocked(showBadge);
        const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
        const mockUpdateContextMenu = vi.mocked(updateContextMenu);

        await checkStorageAndUpdateBadge();

        // Wait for all async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledWith(
            'https://recipe.org/mock-recipe-url',
            'https://mealie.tld',
            'mock-token',
        );
        expect(mockedShowBadge).not.toHaveBeenCalled();
        expect(mockUpdateContextMenu).toHaveBeenCalledTimes(1);
        expect(mockUpdateContextMenu).toHaveBeenCalledWith(
            'No Recipe - Switch to HTML Mode',
            false,
            { type: 'none' },
        );
    });

    it('should set "Recipe Detected" title when scraper detects a recipe', async () => {
        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
            },
        );

        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([
            { ...mockActiveTab, url: 'https://recipe.org/detected' },
        ]);

        const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
        mockTestScrapeUrlDetailed.mockResolvedValueOnce({ outcome: 'recipe' });

        const mockUpdateContextMenu = vi.mocked(updateContextMenu);

        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockUpdateContextMenu).toHaveBeenCalledWith(
            'Create Recipe from URL',
            true,
            expect.any(Object),
        );
    });

    it('should set a timeout title when scraper check times out', async () => {
        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
            },
        );

        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([
            { ...mockActiveTab, url: 'https://recipe.org/timeout' },
        ]);

        const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
        mockTestScrapeUrlDetailed.mockResolvedValueOnce({ outcome: 'timeout', timeoutMs: 4500 });

        const mockUpdateContextMenu = vi.mocked(updateContextMenu);

        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockUpdateContextMenu).toHaveBeenCalledWith(
            'Timed Out - Switch to HTML Mode',
            false,
            { type: 'none' },
        );
    });

    it('should set an http-error title with status when scraper check fails', async () => {
        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
            },
        );

        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([
            { ...mockActiveTab, url: 'https://recipe.org/http-error' },
        ]);

        const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
        mockTestScrapeUrlDetailed.mockResolvedValueOnce({
            outcome: 'http-error',
            status: 500,
            details: 'Internal',
        });

        const mockUpdateContextMenu = vi.mocked(updateContextMenu);

        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockUpdateContextMenu).toHaveBeenCalledWith(
            'Failed Detection (HTTP 500) - Switch to HTML Mode',
            false,
            { type: 'none' },
        );
    });

    it('should cache detection results for the same URL', async () => {
        const url = 'https://recipe.org/cache-test';

        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
            },
        );

        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([{ ...mockActiveTab, url }]);
        vi.spyOn(Date, 'now').mockReturnValue(1_000);

        const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
        mockTestScrapeUrlDetailed.mockResolvedValue({ outcome: 'not-recipe' });

        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));
        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(1);
    });

    it('should remove expired cache entries after TTL expires', async () => {
        const url = 'https://recipe.org/expire-test';

        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
            },
        );

        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([{ ...mockActiveTab, url }]);

        const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
        mockTestScrapeUrlDetailed.mockResolvedValue({ outcome: 'recipe' });

        const dateSpy = vi.spyOn(Date, 'now');
        dateSpy.mockReturnValue(1_000);

        // First call - should cache the result
        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(1);

        // Second call within TTL - should use cache and update timestamp (LRU)
        dateSpy.mockReturnValue(20_000); // 19 seconds later, within 30s TTL
        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(1); // Still only 1 call

        // Third call after TTL expires from the LAST ACCESS (not original cache time)
        // Since last access was at 20_000, we need to wait 30s from that point
        dateSpy.mockReturnValue(51_000); // 31 seconds after last access at 20_000
        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(2); // New fetch
    });

    it('should enforce cache size limit and evict oldest entries', async () => {
        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
            },
        );

        const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
        mockTestScrapeUrlDetailed.mockResolvedValue({ outcome: 'recipe' });

        const dateSpy = vi.spyOn(Date, 'now');
        let currentTime = 1_000;

        // Add 105 entries to exceed the max size of 100
        for (let i = 0; i < 105; i++) {
            const url = `https://recipe.org/url-${i}`;
            dateSpy.mockReturnValue(currentTime);
            vi.spyOn(chrome.tabs, 'query').mockResolvedValue([{ ...mockActiveTab, url }]);

            await checkStorageAndUpdateBadge();
            await new Promise((resolve) => setTimeout(resolve, 10)); // Wait for async operations

            currentTime += 100; // Increment time for each entry
        }

        // Should have called testScrapeUrlDetailed 105 times (once per unique URL)
        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(105);

        // Now access the oldest URL that should have been evicted (url-0 through url-4)
        // The 5 oldest should be evicted when we added entries beyond 100
        const oldestUrl = 'https://recipe.org/url-0';
        dateSpy.mockReturnValue(currentTime);
        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([{ ...mockActiveTab, url: oldestUrl }]);

        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 10)); // Wait for async operations

        // Should fetch again because the oldest entry was evicted
        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(106);

        // Now access a URL that should still be cached (url-100 or later)
        const recentUrl = 'https://recipe.org/url-100';
        dateSpy.mockReturnValue(currentTime);
        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([{ ...mockActiveTab, url: recentUrl }]);

        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 10)); // Wait for async operations

        // Should still be 106 because url-100 is still cached
        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(106);
    });

    it('should handle empty cache efficiently with early return', async () => {
        // This test verifies that pruning works correctly even when starting with empty cache
        const url = 'https://recipe.org/empty-cache-test';

        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
            },
        );

        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([{ ...mockActiveTab, url }]);
        vi.spyOn(Date, 'now').mockReturnValue(1_000);

        const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
        mockTestScrapeUrlDetailed.mockResolvedValue({ outcome: 'recipe' });

        // First call on empty cache - should work without errors
        await checkStorageAndUpdateBadge();
        await Promise.resolve();

        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(1);
    });

    it('should prune multiple expired entries in a single pass', async () => {
        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
            },
        );

        const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
        mockTestScrapeUrlDetailed.mockResolvedValue({ outcome: 'recipe' });

        const dateSpy = vi.spyOn(Date, 'now');
        dateSpy.mockReturnValue(1_000);

        // Add 3 entries at the same time
        for (let i = 0; i < 3; i++) {
            const url = `https://recipe.org/multi-expire-${i}`;
            vi.spyOn(chrome.tabs, 'query').mockResolvedValue([{ ...mockActiveTab, url }]);

            await checkStorageAndUpdateBadge();
            await Promise.resolve();
        }

        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(3);

        // Move time forward beyond TTL
        dateSpy.mockReturnValue(32_000); // 31 seconds later

        // Add a new entry - this should trigger pruning of all 3 expired entries
        const newUrl = 'https://recipe.org/new-after-expiry';
        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([{ ...mockActiveTab, url: newUrl }]);

        await checkStorageAndUpdateBadge();
        await Promise.resolve();

        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(4);

        // Now try to access one of the old URLs - it should fetch again
        const expiredUrl = 'https://recipe.org/multi-expire-0';
        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([{ ...mockActiveTab, url: expiredUrl }]);

        await checkStorageAndUpdateBadge();
        await Promise.resolve();

        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(5); // Fetched again
    });

    it('should update timestamp on cache access for true LRU behavior', async () => {
        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
            },
        );

        const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
        mockTestScrapeUrlDetailed.mockResolvedValue({ outcome: 'recipe' });

        const dateSpy = vi.spyOn(Date, 'now');
        const tabsQuerySpy = vi.spyOn(chrome.tabs, 'query');

        const url1 = 'https://recipe.org/lru-test-frequently-accessed';
        const url2 = 'https://recipe.org/lru-test-rarely-accessed';

        // Cache url1 at time 1000
        dateSpy.mockReturnValue(1_000);
        tabsQuerySpy.mockResolvedValue([{ ...mockActiveTab, url: url1 }]);
        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(1);

        // Cache url2 at time 2000
        dateSpy.mockReturnValue(2_000);
        tabsQuerySpy.mockResolvedValue([{ ...mockActiveTab, url: url2 }]);
        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(2);

        // Access url1 again at time 20000 (19s after initial cache)
        // This updates url1's timestamp to 20000
        dateSpy.mockReturnValue(20_000);
        tabsQuerySpy.mockResolvedValue([{ ...mockActiveTab, url: url1 }]);
        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(2); // Still cached

        // At time 33000:
        // - url1's timestamp is 20000, age = 13s (still valid, < 30s)
        // - url2's timestamp is 2000, age = 31s (expired, >= 30s)
        dateSpy.mockReturnValue(33_000);

        // Access url2 - should fetch because it expired
        tabsQuerySpy.mockResolvedValue([{ ...mockActiveTab, url: url2 }]);
        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(3);

        // Access url1 - should still be cached because timestamp was updated to 20000
        tabsQuerySpy.mockResolvedValue([{ ...mockActiveTab, url: url1 }]);
        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(3); // Still 3, no new fetch
    });

    it('should use HTML mode title when in HTML mode', async () => {
        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({
                    mealieServer: 'https://mealie.tld',
                    mealieApiToken: 'mock-token',
                    recipeCreateMode: RecipeCreateMode.HTML,
                });
            },
        );

        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([mockActiveTab]);

        const mockUpdateContextMenu = vi.mocked(updateContextMenu);
        const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);

        // Mock successful recipe detection
        mockTestScrapeUrlDetailed.mockResolvedValue({
            outcome: 'recipe',
        });

        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));

        // In HTML mode, should still call detection for cache, but use HTML mode title
        expect(mockTestScrapeUrlDetailed).toHaveBeenCalled();
        expect(mockUpdateContextMenu).toHaveBeenCalledWith('Create Recipe from HTML', true, {
            type: 'none',
        });
    });

    it('should handle error outcome from detection', async () => {
        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
            },
        );

        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([
            { ...mockActiveTab, url: 'https://recipe.org/error-test' },
        ]);

        const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
        mockTestScrapeUrlDetailed.mockResolvedValueOnce({
            outcome: 'error',
            message: 'Network failure',
        });

        const mockUpdateContextMenu = vi.mocked(updateContextMenu);

        await checkStorageAndUpdateBadge();
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockUpdateContextMenu).toHaveBeenCalledWith(
            'Failed Detection - Switch to HTML Mode',
            false,
            { type: 'none' },
        );
    });

    describe('Duplicate Detection Integration', () => {
        beforeEach(() => {
            // Mock network functions for duplicate detection
            vi.mock('../network', () => ({
                testScrapeUrlDetailed: vi.fn(() => Promise.resolve({ outcome: 'not-recipe' })),
                findRecipeByURL: vi.fn(() => Promise.resolve(null)),
                searchRecipesByName: vi.fn(() => Promise.resolve([])),
            }));
        });

        it('should cache recipeName when recipe is detected', async () => {
            const { detectionCache } = await import('../storage');

            vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
                (_keys, callback: (items: Record<string, string>) => void) => {
                    callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
                },
            );

            vi.spyOn(chrome.tabs, 'query').mockResolvedValue([mockActiveTab]);

            const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
            mockTestScrapeUrlDetailed.mockResolvedValueOnce({
                outcome: 'recipe',
                recipeName: 'Chicken Carbonara',
            });

            await checkStorageAndUpdateBadge();
            await new Promise((resolve) => setTimeout(resolve, 100));

            const cached = detectionCache.get('https://recipe.org/mock-recipe-url');
            expect(cached).toBeDefined();
            expect(cached?.recipeName).toBe('Chicken Carbonara');
        });

        it('should cache duplicateDetection with URL match', async () => {
            const { detectionCache } = await import('../storage');
            const { findRecipeByURL } = await import('../network');

            vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
                (_keys, callback: (items: Record<string, string>) => void) => {
                    callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
                },
            );

            vi.spyOn(chrome.tabs, 'query').mockResolvedValue([mockActiveTab]);

            const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
            mockTestScrapeUrlDetailed.mockResolvedValueOnce({
                outcome: 'recipe',
                recipeName: 'Chicken Carbonara',
            });

            const mockFindRecipeByURL = vi.mocked(findRecipeByURL);
            mockFindRecipeByURL.mockResolvedValueOnce({
                id: '123',
                name: 'Chicken Carbonara',
                slug: 'chicken-carbonara',
            });

            await checkStorageAndUpdateBadge();
            await new Promise((resolve) => setTimeout(resolve, 100));

            const cached = detectionCache.get('https://recipe.org/mock-recipe-url');
            expect(cached?.duplicateDetection).toEqual({
                type: 'url',
                match: {
                    id: '123',
                    name: 'Chicken Carbonara',
                    slug: 'chicken-carbonara',
                },
            });
        });

        it('should cache duplicateDetection with name matches', async () => {
            const { detectionCache } = await import('../storage');
            const { findRecipeByURL, searchRecipesByName } = await import('../network');

            vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
                (_keys, callback: (items: Record<string, string>) => void) => {
                    callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
                },
            );

            vi.spyOn(chrome.tabs, 'query').mockResolvedValue([mockActiveTab]);

            const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
            mockTestScrapeUrlDetailed.mockResolvedValueOnce({
                outcome: 'recipe',
                recipeName: 'Chicken Pasta',
            });

            const mockFindRecipeByURL = vi.mocked(findRecipeByURL);
            mockFindRecipeByURL.mockResolvedValueOnce(null);

            const mockSearchRecipesByName = vi.mocked(searchRecipesByName);
            mockSearchRecipesByName.mockResolvedValueOnce([
                { id: '456', name: 'Chicken Carbonara', slug: 'chicken-carbonara' },
                { id: '789', name: 'Chicken Alfredo', slug: 'chicken-alfredo' },
            ]);

            await checkStorageAndUpdateBadge();
            await new Promise((resolve) => setTimeout(resolve, 100));

            const cached = detectionCache.get('https://recipe.org/mock-recipe-url');
            expect(cached?.duplicateDetection).toEqual({
                type: 'name',
                searchQuery: 'Chicken Pasta',
                matches: [
                    { id: '456', name: 'Chicken Carbonara', slug: 'chicken-carbonara' },
                    { id: '789', name: 'Chicken Alfredo', slug: 'chicken-alfredo' },
                ],
            });
        });

        it('should cache duplicateDetection as none when no matches found', async () => {
            const { detectionCache } = await import('../storage');
            const { findRecipeByURL, searchRecipesByName } = await import('../network');

            vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
                (_keys, callback: (items: Record<string, string>) => void) => {
                    callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
                },
            );

            vi.spyOn(chrome.tabs, 'query').mockResolvedValue([mockActiveTab]);

            const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
            mockTestScrapeUrlDetailed.mockResolvedValueOnce({
                outcome: 'recipe',
                recipeName: 'Unique Recipe',
            });

            const mockFindRecipeByURL = vi.mocked(findRecipeByURL);
            mockFindRecipeByURL.mockResolvedValueOnce(null);

            const mockSearchRecipesByName = vi.mocked(searchRecipesByName);
            mockSearchRecipesByName.mockResolvedValueOnce([]);

            await checkStorageAndUpdateBadge();
            await new Promise((resolve) => setTimeout(resolve, 100));

            const cached = detectionCache.get('https://recipe.org/mock-recipe-url');
            expect(cached?.duplicateDetection).toEqual({ type: 'none' });
        });

        it('should not run duplicate detection for non-recipe outcomes', async () => {
            const { detectionCache } = await import('../storage');
            const { findRecipeByURL } = await import('../network');

            vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
                (_keys, callback: (items: Record<string, string>) => void) => {
                    callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
                },
            );

            vi.spyOn(chrome.tabs, 'query').mockResolvedValue([mockActiveTab]);

            const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
            mockTestScrapeUrlDetailed.mockResolvedValueOnce({ outcome: 'not-recipe' });

            const mockFindRecipeByURL = vi.mocked(findRecipeByURL);

            await checkStorageAndUpdateBadge();
            await new Promise((resolve) => setTimeout(resolve, 100));

            const cached = detectionCache.get('https://recipe.org/mock-recipe-url');
            expect(cached?.duplicateDetection).toBeUndefined();
            expect(mockFindRecipeByURL).not.toHaveBeenCalled();
        });

        it('should handle duplicate detection errors gracefully', async () => {
            const { detectionCache } = await import('../storage');
            const { findRecipeByURL } = await import('../network');

            vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
                (_keys, callback: (items: Record<string, string>) => void) => {
                    callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
                },
            );

            vi.spyOn(chrome.tabs, 'query').mockResolvedValue([mockActiveTab]);

            const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
            mockTestScrapeUrlDetailed.mockResolvedValueOnce({
                outcome: 'recipe',
                recipeName: 'Test Recipe',
            });

            const mockFindRecipeByURL = vi.mocked(findRecipeByURL);
            mockFindRecipeByURL.mockRejectedValueOnce(new Error('Network error'));

            await checkStorageAndUpdateBadge();
            await new Promise((resolve) => setTimeout(resolve, 100));

            const cached = detectionCache.get('https://recipe.org/mock-recipe-url');
            // Should fall back to 'none' on error
            expect(cached?.duplicateDetection).toEqual({ type: 'none' });
        });
    });
});
