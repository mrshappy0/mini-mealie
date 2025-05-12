import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocking the Chrome API
beforeEach(() => {
    global.chrome = {
        contextMenus: {
            removeAll: vi.fn((callback) => callback && callback()),
            create: vi.fn(),
        },
    } as unknown as typeof chrome;
});

describe('Context Menu Utility', () => {
    it('should remove all existing context menus before adding a new one', () => {
        addContextMenu('No Recipe Detected - Attempt to Add Recipe');

        expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
        expect(chrome.contextMenus.create).toHaveBeenCalledWith({
            id: 'runCreateRecipe',
            title: 'No Recipe Detected - Attempt to Add Recipe',
            contexts: ['page'],
        });
    });

    it('should remove all context menus when removeContextMenu is called', () => {
        removeContextMenu();

        expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
    });
});
