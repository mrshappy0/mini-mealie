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
        updateContextMenu('Create Recipe from URL', true, {});

        // Main menu should be created
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(createCalls.length).toBe(1);
        expect(createCalls[0][0]).toEqual({
            id: 'runCreateRecipe',
            title: '➕ Create Recipe from URL',
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
        updateContextMenu('Create Recipe from URL', true, {
            urlMatch: { id: '123', name: 'Chicken Carbonara', slug: 'chicken-carbonara' },
        });

        // Check menu creation calls
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(createCalls.length).toBe(2);

        // First should be main menu
        expect(createCalls[0][0]).toEqual({
            id: 'runCreateRecipe',
            title: '➕ Create Recipe from URL',
            enabled: true,
            contexts: ['page'],
        });

        // Second should be duplicate URL menu
        expect(createCalls[1][0]).toEqual({
            id: 'viewDuplicateUrl',
            title: '⚠️ Already exists: "Chicken Carbonara"',
            enabled: true,
            contexts: ['page'],
        });
    });

    it('should create name duplicate warning menu when similar recipes found', () => {
        updateContextMenu('Create Recipe from URL', true, {
            nameMatches: [
                { id: '456', name: 'Chicken Pasta', slug: 'chicken-pasta' },
                { id: '789', name: 'Creamy Chicken', slug: 'creamy-chicken' },
            ],
            searchQuery: 'Chicken Carbonara',
        });

        // Check menu creation calls
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(createCalls.length).toBe(4); // Main + name parent + 2 children

        // First should be main menu
        expect(createCalls[0][0]).toEqual({
            id: 'runCreateRecipe',
            title: '➕ Create Recipe from URL',
            enabled: true,
            contexts: ['page'],
        });

        // Second should be duplicate name menu (plural)
        expect(createCalls[1][0]).toEqual({
            id: 'viewDuplicatesByName',
            title: '🔍 Found 2 similar recipes',
            enabled: true,
            contexts: ['page'],
        });
    });

    it('should use singular form when only one similar recipe found', () => {
        updateContextMenu('Create Recipe from URL', true, {
            nameMatches: [{ id: '456', name: 'Chicken Pasta', slug: 'chicken-pasta' }],
            searchQuery: 'Chicken Carbonara',
        });

        // Check menu creation calls
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;

        // Should have main menu + name menu + 1 child
        expect(createCalls.length).toBe(3);

        // Duplicate name menu should use singular form
        expect(createCalls[1][0]).toEqual({
            id: 'viewDuplicatesByName',
            title: '🔍 Found 1 similar recipe',
            enabled: true,
            contexts: ['page'],
        });
    });

    it('should show both URL match and name matches when both exist', () => {
        updateContextMenu('Create Recipe from URL', true, {
            urlMatch: { id: '123', name: 'Chicken Carbonara', slug: 'chicken-carbonara' },
            nameMatches: [
                { id: '456', name: 'Chicken Pasta', slug: 'chicken-pasta' },
                { id: '789', name: 'Creamy Chicken', slug: 'creamy-chicken' },
            ],
            searchQuery: 'Chicken Carbonara',
        });

        // Check menu creation calls
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(createCalls.length).toBe(5); // Main + URL + name parent + 2 children

        // First should be main menu
        expect(createCalls[0][0].id).toBe('runCreateRecipe');

        // Second should be URL duplicate
        expect(createCalls[1][0].id).toBe('viewDuplicateUrl');

        // Third should be name duplicate menu
        expect(createCalls[2][0].id).toBe('viewDuplicatesByName');
    });

    it('should handle disabled main menu', () => {
        updateContextMenu('No Recipe - Switch to HTML Mode', false, {});

        // Main menu should be created with disabled state
        const createCalls = (chrome.contextMenus.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(createCalls[0][0]).toEqual({
            id: 'runCreateRecipe',
            title: '➕ No Recipe - Switch to HTML Mode',
            enabled: false,
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
