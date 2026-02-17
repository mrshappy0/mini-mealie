import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    addContextMenu,
    removeAllDuplicateMenus,
    removeContextMenu,
    updateContextMenu,
} from '../contextMenu';

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

describe('updateContextMenu', () => {
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

    it('should create main menu and no duplicate menus when type is none', () => {
        updateContextMenu(
            'Create Recipe from URL',
            true,
            { type: 'none' },
            'https://mealie.local',
            'my-group',
        );

        // Main menu should be created
        expect(chrome.contextMenus.update).toHaveBeenCalledWith(
            'runCreateRecipe',
            { title: 'Create Recipe from URL', enabled: true },
            expect.any(Function),
        );

        // Duplicate removal should be called
        expect(chrome.contextMenus.remove).toHaveBeenCalledWith(
            'viewDuplicateUrl',
            expect.any(Function),
        );
        expect(chrome.contextMenus.remove).toHaveBeenCalledWith(
            'viewDuplicatesByName',
            expect.any(Function),
        );

        // No duplicate menu items created beyond the removal calls
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(createCalls.length).toBe(0);
    });

    it('should create URL duplicate warning menu when exact match found', () => {
        updateContextMenu(
            'Create Recipe from URL',
            true,
            {
                type: 'url',
                match: { id: '123', name: 'Chicken Carbonara', slug: 'chicken-carbonara' },
            },
            'https://mealie.local',
            'my-group',
        );

        // Main menu should be created
        expect(chrome.contextMenus.update).toHaveBeenCalled();

        // Duplicate URL menu should be created
        expect(chrome.contextMenus.create).toHaveBeenCalledWith(
            {
                id: 'viewDuplicateUrl',
                title: '⚠️ Exact match: "Chicken Carbonara"',
                enabled: true,
                contexts: ['page'],
            },
            expect.any(Function),
        );
    });

    it('should create name duplicate warning menu when similar recipes found', () => {
        updateContextMenu(
            'Create Recipe from URL',
            true,
            {
                type: 'name',
                matches: [
                    { id: '456', name: 'Chicken Pasta', slug: 'chicken-pasta' },
                    { id: '789', name: 'Creamy Chicken', slug: 'creamy-chicken' },
                ],
                searchQuery: 'Chicken Carbonara',
            },
            'https://mealie.local',
            'my-group',
        );

        // Main menu should be created
        expect(chrome.contextMenus.update).toHaveBeenCalled();

        // Duplicate name menu should be created
        expect(chrome.contextMenus.create).toHaveBeenCalledWith(
            {
                id: 'viewDuplicatesByName',
                title: '💡 Similar recipes (2)',
                enabled: true,
                contexts: ['page'],
            },
            expect.any(Function),
        );
    });

    it('should not create URL menu when server or groupSlug is missing', () => {
        updateContextMenu(
            'Create Recipe from URL',
            true,
            {
                type: 'url',
                match: { id: '123', name: 'Test Recipe', slug: 'test-recipe' },
            },
            undefined,
            undefined,
        );

        // Duplicate removal should still be called
        expect(chrome.contextMenus.remove).toHaveBeenCalled();

        // No duplicate menu items created
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(createCalls.length).toBe(0);
    });

    it('should handle disabled main menu', () => {
        updateContextMenu(
            'No Recipe - Switch to HTML Mode',
            false,
            { type: 'none' },
            'https://mealie.local',
            'my-group',
        );

        // Main menu should be created with disabled state
        expect(chrome.contextMenus.update).toHaveBeenCalledWith(
            'runCreateRecipe',
            { title: 'No Recipe - Switch to HTML Mode', enabled: false },
            expect.any(Function),
        );
    });
});

describe('removeAllDuplicateMenus', () => {
    beforeEach(() => {
        global.chrome = {
            contextMenus: {
                remove: vi.fn((_id, callback) => callback && callback()),
            },
            runtime: {
                lastError: undefined,
            },
        } as unknown as typeof chrome;
    });

    it('should remove both duplicate menu items', () => {
        removeAllDuplicateMenus();

        expect(chrome.contextMenus.remove).toHaveBeenCalledWith(
            'viewDuplicateUrl',
            expect.any(Function),
        );
        expect(chrome.contextMenus.remove).toHaveBeenCalledWith(
            'viewDuplicatesByName',
            expect.any(Function),
        );
        expect(chrome.contextMenus.remove).toHaveBeenCalledTimes(2);
    });

    it('should handle missing remove function gracefully', () => {
        global.chrome = {
            contextMenus: {},
        } as unknown as typeof chrome;

        // Should not throw
        expect(() => removeAllDuplicateMenus()).not.toThrow();
    });
});
