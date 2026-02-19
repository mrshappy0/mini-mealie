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

    it('should remove the parent context menu and child items when supported', () => {
        removeContextMenu();

        // Should remove parent (which cascades to children)
        expect(chrome.contextMenus.remove).toHaveBeenCalledWith(
            'miniMealieParent',
            expect.any(Function),
        );

        // Should also explicitly remove create menu item
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
        updateContextMenu('Create Recipe from URL', true, {}, false);

        // Should create parent menu + create menu (no duplicates)
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(createCalls.length).toBe(2);

        // First should be parent menu
        expect(createCalls[0][0]).toEqual({
            id: 'miniMealieParent',
            title: 'Mini Mealie',
            contexts: ['page'],
        });

        // Second should be create menu as child
        expect(createCalls[1][0]).toEqual({
            id: 'runCreateRecipe',
            parentId: 'miniMealieParent',
            title: 'Create Recipe from URL',
            enabled: true,
            contexts: ['page'],
        });

        // Duplicate removal should be called
        expect(chrome.contextMenus.remove).toHaveBeenCalledWith(
            'viewDuplicateUrl',
            expect.any(Function),
        );
        expect(chrome.contextMenus.remove).toHaveBeenCalledWith(
            'viewDuplicatesByName',
            expect.any(Function),
        );
    });

    it('should create URL duplicate warning menu when exact match found', () => {
        updateContextMenu(
            'Create Recipe from URL',
            true,
            {
                urlMatch: { id: '123', name: 'Chicken Carbonara', slug: 'chicken-carbonara' },
            },
            false,
        );

        // Check menu creation calls
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(createCalls.length).toBe(3); // Parent + create + URL duplicate

        // First should be parent menu
        expect(createCalls[0][0]).toEqual({
            id: 'miniMealieParent',
            title: 'Mini Mealie',
            contexts: ['page'],
        });

        // Second should be create menu
        expect(createCalls[1][0]).toEqual({
            id: 'runCreateRecipe',
            parentId: 'miniMealieParent',
            title: 'Create Recipe from URL',
            enabled: true,
            contexts: ['page'],
        });

        // Third should be duplicate URL menu (sibling of create)
        expect(createCalls[2][0]).toEqual({
            id: 'viewDuplicateUrl',
            parentId: 'miniMealieParent',
            title: '⚠️ Already exists: "Chicken Carbonara"',
            enabled: true,
            contexts: ['page'],
        });
    });

    it('should create name duplicate warning menu when similar recipes found', () => {
        updateContextMenu(
            'Create Recipe from URL',
            true,
            {
                nameMatches: [
                    { id: '456', name: 'Chicken Pasta', slug: 'chicken-pasta' },
                    { id: '789', name: 'Creamy Chicken', slug: 'creamy-chicken' },
                ],
                searchQuery: 'Chicken Carbonara',
            },
            false,
        );

        // Check menu creation calls
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(createCalls.length).toBe(5); // Parent + create + name parent + 2 children

        // First should be parent menu
        expect(createCalls[0][0]).toEqual({
            id: 'miniMealieParent',
            title: 'Mini Mealie',
            contexts: ['page'],
        });

        // Second should be create menu
        expect(createCalls[1][0]).toEqual({
            id: 'runCreateRecipe',
            parentId: 'miniMealieParent',
            title: 'Create Recipe from URL',
            enabled: true,
            contexts: ['page'],
        });

        // Third should be duplicate name menu (plural, sibling of create)
        expect(createCalls[2][0]).toEqual({
            id: 'viewDuplicatesByName',
            parentId: 'miniMealieParent',
            title: '🔍 Found 2 similar recipes',
            enabled: true,
            contexts: ['page'],
        });
    });

    it('should use singular form when only one similar recipe found', () => {
        updateContextMenu(
            'Create Recipe from URL',
            true,
            {
                nameMatches: [{ id: '456', name: 'Chicken Pasta', slug: 'chicken-pasta' }],
                searchQuery: 'Chicken Carbonara',
            },
            false,
        );

        // Check menu creation calls
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;

        // Should have parent + create + name menu + 1 child
        expect(createCalls.length).toBe(4);

        // Duplicate name menu should use singular form
        expect(createCalls[2][0]).toEqual({
            id: 'viewDuplicatesByName',
            parentId: 'miniMealieParent',
            title: '🔍 Found 1 similar recipe',
            enabled: true,
            contexts: ['page'],
        });
    });

    it('should show both URL match and name matches when both exist', () => {
        updateContextMenu(
            'Create Recipe from URL',
            true,
            {
                urlMatch: { id: '123', name: 'Chicken Carbonara', slug: 'chicken-carbonara' },
                nameMatches: [
                    { id: '456', name: 'Chicken Pasta', slug: 'chicken-pasta' },
                    { id: '789', name: 'Creamy Chicken', slug: 'creamy-chicken' },
                ],
                searchQuery: 'Chicken Carbonara',
            },
            false,
        );

        // Check menu creation calls
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(createCalls.length).toBe(6); // Parent + create + URL + name parent + 2 children

        // First should be parent menu
        expect(createCalls[0][0].id).toBe('miniMealieParent');

        // Second should be create menu
        expect(createCalls[1][0].id).toBe('runCreateRecipe');

        // Third should be URL duplicate
        expect(createCalls[2][0].id).toBe('viewDuplicateUrl');

        // Fourth should be name duplicate menu
        expect(createCalls[3][0].id).toBe('viewDuplicatesByName');
    });

    it('should create error suggestion menu when isErrorSuggestion is true', () => {
        updateContextMenu('No Recipe - Switch to HTML Mode', true, {}, true);

        // Main menu should be created with switchToHtmlMode ID and enabled
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;

        // First should be parent
        expect(createCalls[0][0].id).toBe('miniMealieParent');

        // Second should be switch mode menu (not create recipe menu)
        expect(createCalls[1][0]).toEqual({
            id: 'switchToHtmlMode',
            parentId: 'miniMealieParent',
            title: 'No Recipe - Switch to HTML Mode',
            enabled: true, // Always enabled to allow clicking
            contexts: ['page'],
        });
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
