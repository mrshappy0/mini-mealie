import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addContextMenu, removeContextMenu } from '../contextMenu';

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
            enabled: true,
            contexts: ['page'],
        });
    });

    it('should remove all context menus when removeContextMenu is called', () => {
        removeContextMenu();

        expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
    });
});

describe('Context Menu Utility (update/remove path)', () => {
    beforeEach(() => {
        global.chrome = {
            contextMenus: {
                removeAll: vi.fn((callback) => callback && callback()),
                create: vi.fn((_createProperties, callback) => callback && callback()),
                update: vi.fn((_id, _updateProperties, callback) => callback && callback()),
                remove: vi.fn((_id, callback) => callback && callback()),
            },
            runtime: {
                lastError: undefined,
            },
        } as unknown as typeof chrome;
    });

    it('should update the existing context menu when supported', () => {
        addContextMenu('Recipe Detected - Add Recipe to Mealie');

        expect(chrome.contextMenus.update).toHaveBeenCalledWith(
            'runCreateRecipe',
            { title: 'Recipe Detected - Add Recipe to Mealie', enabled: true },
            expect.any(Function),
        );
        expect(chrome.contextMenus.create).not.toHaveBeenCalled();
        expect(chrome.contextMenus.removeAll).not.toHaveBeenCalled();
    });

    it('should create the context menu if update fails', () => {
        chrome.contextMenus.update = vi.fn((_id, _props, callback) => {
            chrome.runtime.lastError = {
                message: 'No such menu item',
            } as unknown as chrome.runtime.LastError;
            callback?.();
        });

        addContextMenu('No Recipe Detected - Attempt to Add Recipe');

        expect(chrome.contextMenus.create).toHaveBeenCalledWith(
            {
                id: 'runCreateRecipe',
                title: 'No Recipe Detected - Attempt to Add Recipe',
                enabled: true,
                contexts: ['page'],
            },
            expect.any(Function),
        );
    });

    it('should remove the specific context menu item when supported', () => {
        removeContextMenu();

        expect(chrome.contextMenus.remove).toHaveBeenCalledWith(
            'runCreateRecipe',
            expect.any(Function),
        );
    });
});
