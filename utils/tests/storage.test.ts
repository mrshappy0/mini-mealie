import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkStorageAndUpdateBadge } from '../storage';
import { showBadge, clearBadge } from '../badge';
import { addContextMenu, removeContextMenu } from '../contextMenu';
import { WxtVitest } from 'wxt/testing';

// Enable WxtVitest for Web Extension APIs
WxtVitest();

vi.mock('../badge', () => ({
    showBadge: vi.fn(),
    clearBadge: vi.fn(),
}));

vi.mock('../contextMenu', () => ({
    addContextMenu: vi.fn(),
    removeContextMenu: vi.fn(),
}));

describe('checkStorageAndUpdateBadge', () => {
    beforeEach(() => {
        fakeBrowser.reset();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should clear badge and add context menu if mealieServer and mealieApiToken exist', () => {
        // ✅ Spy on chrome.storage.sync.get correctly
        vi.spyOn(chrome.storage.sync, 'get').mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) => {
                callback({ mealieServer: 'https://mealie.local', mealieApiToken: 'mock-token' });
            },
        );

        // ✅ Use vi.mocked() to ensure clearBadge is treated as a mock function
        const mockedClearBadge = vi.mocked(clearBadge);
        const mockedAddContextMenu = vi.mocked(addContextMenu);
        const mockedShowBadge = vi.mocked(showBadge);
        const mockedRemoveContextMenu = vi.mocked(removeContextMenu);

        // ✅ Call the function
        checkStorageAndUpdateBadge();

        // ✅ Assertions
        expect(mockedClearBadge).toHaveBeenCalled();
        expect(mockedAddContextMenu).toHaveBeenCalled();
        expect(mockedShowBadge).not.toHaveBeenCalled();
        expect(mockedRemoveContextMenu).not.toHaveBeenCalled();
    });
});
