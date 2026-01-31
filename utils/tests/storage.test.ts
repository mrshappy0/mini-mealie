import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WxtVitest } from 'wxt/testing';

import { clearBadge, showBadge } from '../badge';
import { addContextMenu, removeContextMenu } from '../contextMenu';
import { testScrapeUrlDetailed } from '../network';
import { checkStorageAndUpdateBadge } from '../storage';

WxtVitest();

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
    addContextMenu: vi.fn(() => Promise.resolve()),
    removeContextMenu: vi.fn(() => Promise.resolve()),
}));

vi.mock('../network', () => ({
    testScrapeUrlDetailed: vi.fn(() => ({ outcome: 'not-recipe' })),
}));

describe('checkStorageAndUpdateBadge', () => {
    beforeEach(() => {
        fakeBrowser.reset();
        vi.clearAllMocks();
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
        const mockAddContextMenu = vi.mocked(addContextMenu);

        await checkStorageAndUpdateBadge();

        expect(mockShowBadge).toHaveBeenCalledWith('❌');
        expect(mockRemoveContextMenu).toHaveBeenCalledTimes(1);
        expect(mockClearBadge).not.toHaveBeenCalled();
        expect(mockAddContextMenu).not.toHaveBeenCalled();
    });

    it('should clear badge and add context menu if mealieServer and mealieApiToken exist', async () => {
        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({ mealieServer: 'https://mealie.tld', mealieApiToken: 'mock-token' });
            },
        );

        vi.spyOn(chrome.tabs, 'query').mockResolvedValue([mockActiveTab]);

        const mockedClearBadge = vi.mocked(clearBadge);
        const mockedShowBadge = vi.mocked(showBadge);
        const mockTestScrapeUrlDetailed = vi.mocked(testScrapeUrlDetailed);
        const mockAddContextMenu = vi.mocked(addContextMenu);

        await checkStorageAndUpdateBadge();

        expect(mockedClearBadge).toHaveBeenCalled();
        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledWith(
            'https://recipe.org/mock-recipe-url',
            'https://mealie.tld',
            'mock-token',
        );
        expect(mockedShowBadge).not.toHaveBeenCalled();

        // This `await Promise.resolve()` serves as a microtask checkpoint.
        // Despite `addContextMenu()` not being explicitly asynchronous, the test fails without this line.
        // We are already awaiting `checkStorageAndUpdateBadge()`, so it is unclear why this extra await is necessary.
        // Possible explanation: The function may internally trigger microtasks that complete after the primary call stack,
        // requiring this additional microtask flush to ensure that all asynchronous operations have fully completed.
        await Promise.resolve();
        expect(mockAddContextMenu).toHaveBeenCalledTimes(1);
        expect(mockAddContextMenu).toHaveBeenCalledWith(
            'No Recipe Detected - Attempt to Add Recipe',
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

        const mockAddContextMenu = vi.mocked(addContextMenu);

        await checkStorageAndUpdateBadge();
        await Promise.resolve();

        expect(mockAddContextMenu).toHaveBeenCalledWith('Recipe Detected - Add Recipe to Mealie');
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

        const mockAddContextMenu = vi.mocked(addContextMenu);

        await checkStorageAndUpdateBadge();
        await Promise.resolve();

        expect(mockAddContextMenu).toHaveBeenCalledWith(
            'Recipe Check Timed Out - Attempt to Add Recipe',
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

        const mockAddContextMenu = vi.mocked(addContextMenu);

        await checkStorageAndUpdateBadge();
        await Promise.resolve();

        expect(mockAddContextMenu).toHaveBeenCalledWith(
            'Recipe Check Failed (500) - Attempt to Add Recipe',
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
        await Promise.resolve();
        await checkStorageAndUpdateBadge();
        await Promise.resolve();

        expect(mockTestScrapeUrlDetailed).toHaveBeenCalledTimes(1);
    });
});
