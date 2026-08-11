import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    DUPLICATE_NAME_MENU_ID,
    DUPLICATE_URL_MENU_ID,
    RUN_CREATE_RECIPE_MENU_ID,
    SWITCH_TO_HTML_MODE_ID,
} from '@/utils/contextMenu';
import { initDevEnvironment } from '@/utils/devInit';
import { runCreateRecipe } from '@/utils/invoke';
import { logEvent } from '@/utils/logging';
import { getUser } from '@/utils/network';
import { checkStorageAndUpdateBadge, clearDetectionCache, detectionCache } from '@/utils/storage';
import { RecipeCreateMode } from '@/utils/types/storageTypes';

import backgroundDef from '../background';

vi.mock('@/utils/invoke', () => ({ runCreateRecipe: vi.fn() }));
vi.mock('@/utils/network', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/utils/network')>()),
    getUser: vi.fn(),
}));
vi.mock('@/utils/devInit', () => ({ initDevEnvironment: vi.fn(() => Promise.resolve()) }));

vi.mock('@/utils/logging', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/utils/logging')>();
    return { ...actual, logEvent: vi.fn(() => Promise.resolve('id')) };
});

vi.mock('@/utils/storage', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/utils/storage')>();
    return {
        ...actual,
        checkStorageAndUpdateBadge: vi.fn(() => Promise.resolve()),
        clearDetectionCache: vi.fn(),
    };
});

const mockUser = {
    username: 'chef',
    admin: false,
    email: 'chef@example.com',
    fullName: 'Chef',
    group: 'group',
    groupSlug: 'group-slug',
    household: 'household',
};

function getContextMenuClickListener() {
    const spy = vi.mocked(fakeBrowser.contextMenus.onClicked.addListener);
    const call = spy.mock.calls.at(-1);
    if (!call) throw new Error('No contextMenus.onClicked listener registered');
    return call[0] as (
        info: { menuItemId: string },
        tab: { url?: string; id?: number },
    ) => void | Promise<void>;
}

describe('background', () => {
    beforeEach(() => {
        fakeBrowser.reset();
        vi.clearAllMocks();
        // fake-browser's contextMenus.onClicked.addListener throws
        // "not implemented" rather than being a working no-op stub.
        vi.spyOn(fakeBrowser.contextMenus.onClicked, 'addListener').mockImplementation(() => {});
        backgroundDef.main();
    });

    describe('badge/menu refresh triggers (debounced via scheduleUpdate)', () => {
        it('refreshes on startup, after pre-populating dev credentials', async () => {
            await fakeBrowser.runtime.onStartup.trigger();
            expect(initDevEnvironment).toHaveBeenCalled();

            await vi.waitFor(() => expect(checkStorageAndUpdateBadge).toHaveBeenCalled(), {
                timeout: 1000,
                interval: 10,
            });
        });

        it('refreshes on install and opens the logs page in dev mode', async () => {
            const createTab = vi.spyOn(chrome.tabs, 'create');

            await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });
            expect(initDevEnvironment).toHaveBeenCalled();

            await vi.waitFor(() => expect(checkStorageAndUpdateBadge).toHaveBeenCalled(), {
                timeout: 1000,
                interval: 10,
            });
            // import.meta.env.DEV is true under vitest, so the dev-only auto-open should fire.
            expect(createTab).toHaveBeenCalledWith(
                expect.objectContaining({ url: expect.stringContaining('logs.html') }),
            );
        });

        it('refreshes when the active tab changes', async () => {
            await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });

            await vi.waitFor(() => expect(checkStorageAndUpdateBadge).toHaveBeenCalled(), {
                timeout: 1000,
                interval: 10,
            });
        });

        it('refreshes when a tab navigates to a non-restricted URL', async () => {
            await fakeBrowser.tabs.onUpdated.trigger(1, { url: 'https://example.com/recipe' }, {
                id: 1,
            } as chrome.tabs.Tab);

            await vi.waitFor(() => expect(checkStorageAndUpdateBadge).toHaveBeenCalled(), {
                timeout: 1000,
                interval: 10,
            });
        });

        it('does not refresh when a tab navigates to a restricted URL', async () => {
            await fakeBrowser.tabs.onUpdated.trigger(1, { url: 'chrome://extensions' }, {
                id: 1,
            } as chrome.tabs.Tab);

            await new Promise((resolve) => setTimeout(resolve, 300));
            expect(checkStorageAndUpdateBadge).not.toHaveBeenCalled();
        });

        it('debounces rapid-fire triggers into a single refresh', async () => {
            await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });
            await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });
            await fakeBrowser.tabs.onActivated.trigger({ tabId: 1, windowId: 1 });

            await vi.waitFor(() => expect(checkStorageAndUpdateBadge).toHaveBeenCalled(), {
                timeout: 1000,
                interval: 10,
            });
            expect(checkStorageAndUpdateBadge).toHaveBeenCalledTimes(1);
        });

        it('refreshes immediately (no debounce) when recipeCreateMode changes, clearing the cache', async () => {
            await chrome.storage.sync.set({ recipeCreateMode: RecipeCreateMode.HTML });

            expect(clearDetectionCache).toHaveBeenCalled();
            await vi.waitFor(() => expect(checkStorageAndUpdateBadge).toHaveBeenCalled(), {
                timeout: 1000,
                interval: 10,
            });
        });

        it('refreshes when server or token change', async () => {
            await chrome.storage.sync.set({ mealieServer: 'https://mealie.example.com' });

            await vi.waitFor(() => expect(checkStorageAndUpdateBadge).toHaveBeenCalled(), {
                timeout: 1000,
                interval: 10,
            });
        });

        it('ignores unrelated sync storage changes', async () => {
            await chrome.storage.sync.set({ importTags: false });

            await new Promise((resolve) => setTimeout(resolve, 300));
            expect(checkStorageAndUpdateBadge).not.toHaveBeenCalled();
            expect(clearDetectionCache).not.toHaveBeenCalled();
        });

        it('ignores local storage changes', async () => {
            await chrome.storage.local.set({ mealieServer: 'https://mealie.example.com' });

            await new Promise((resolve) => setTimeout(resolve, 300));
            expect(checkStorageAndUpdateBadge).not.toHaveBeenCalled();
        });
    });

    describe('contextMenus.onClicked dispatch', () => {
        it('runs recipe creation for the main menu item', async () => {
            const listener = getContextMenuClickListener();
            const tab = { url: 'https://example.com/recipe', id: 1 };

            await listener({ menuItemId: RUN_CREATE_RECIPE_MENU_ID }, tab);

            expect(runCreateRecipe).toHaveBeenCalledWith(tab);
        });

        it('switches to HTML mode and logs it', async () => {
            const listener = getContextMenuClickListener();
            const tab = { url: 'https://example.com/recipe', id: 1 };

            await listener({ menuItemId: SWITCH_TO_HTML_MODE_ID }, tab);

            await vi.waitFor(async () => {
                const stored = await chrome.storage.sync.get('recipeCreateMode');
                expect(stored.recipeCreateMode).toBe(RecipeCreateMode.HTML);
            });
            await vi.waitFor(() =>
                expect(logEvent).toHaveBeenCalledWith(
                    expect.objectContaining({ action: 'switchMode', phase: 'success' }),
                ),
            );
        });

        it('does nothing when the tab has no url or id', async () => {
            const listener = getContextMenuClickListener();

            await listener({ menuItemId: RUN_CREATE_RECIPE_MENU_ID }, {});

            expect(runCreateRecipe).not.toHaveBeenCalled();
        });

        describe('duplicate URL match', () => {
            const tab = { url: 'https://example.com/recipe', id: 1 };

            it('opens the matched recipe when credentials and a cached match exist', async () => {
                await chrome.storage.sync.set({
                    mealieServer: 'https://mealie.example.com',
                    mealieApiToken: 'token123',
                });
                vi.mocked(getUser).mockResolvedValue(mockUser);
                detectionCache.set(tab.url, {
                    checkedAt: Date.now(),
                    outcome: 'recipe',
                    duplicateDetection: {
                        urlMatch: { id: '1', name: 'Existing Recipe', slug: 'existing-recipe' },
                    },
                });
                const createTab = vi.spyOn(chrome.tabs, 'create');

                const listener = getContextMenuClickListener();
                await listener({ menuItemId: DUPLICATE_URL_MENU_ID }, tab);

                // handleViewDuplicate's inner chrome.storage.sync.get callback runs
                // fire-and-forget from the listener's perspective, so it may still
                // be in flight once `await listener(...)` resolves.
                await vi.waitFor(() =>
                    expect(createTab).toHaveBeenCalledWith(
                        expect.objectContaining({
                            url: expect.stringContaining('existing-recipe'),
                        }),
                    ),
                );
            });

            it('logs a warning and opens nothing when there is no cached detection', async () => {
                const createTab = vi.spyOn(chrome.tabs, 'create');

                const listener = getContextMenuClickListener();
                await listener({ menuItemId: DUPLICATE_URL_MENU_ID }, tab);

                expect(createTab).not.toHaveBeenCalled();
                expect(logEvent).toHaveBeenCalledWith(
                    expect.objectContaining({ level: 'warn', phase: 'failure' }),
                );
            });

            it('logs a warning and opens nothing when credentials are missing', async () => {
                detectionCache.set(tab.url, {
                    checkedAt: Date.now(),
                    outcome: 'recipe',
                    duplicateDetection: {
                        urlMatch: { id: '1', name: 'Existing Recipe', slug: 'existing-recipe' },
                    },
                });
                const createTab = vi.spyOn(chrome.tabs, 'create');

                const listener = getContextMenuClickListener();
                await listener({ menuItemId: DUPLICATE_URL_MENU_ID }, tab);

                expect(createTab).not.toHaveBeenCalled();
            });
        });

        describe('duplicate name matches', () => {
            const tab = { url: 'https://example.com/recipe', id: 1 };

            it('opens a search page for similar recipes', async () => {
                await chrome.storage.sync.set({
                    mealieServer: 'https://mealie.example.com',
                    mealieApiToken: 'token123',
                });
                vi.mocked(getUser).mockResolvedValue(mockUser);
                detectionCache.set(tab.url, {
                    checkedAt: Date.now(),
                    outcome: 'recipe',
                    recipeName: 'Chocolate Cake',
                    duplicateDetection: {
                        nameMatches: [{ id: '1', name: 'Chocolate Cake', slug: 'chocolate-cake' }],
                    },
                });
                const createTab = vi.spyOn(chrome.tabs, 'create');

                const listener = getContextMenuClickListener();
                await listener({ menuItemId: DUPLICATE_NAME_MENU_ID }, tab);

                await vi.waitFor(() =>
                    expect(createTab).toHaveBeenCalledWith(
                        expect.objectContaining({
                            url: expect.stringContaining('search=Chocolate'),
                        }),
                    ),
                );
            });
        });

        describe('specific duplicate child menu item', () => {
            it('opens the chosen recipe directly by slug', async () => {
                await chrome.storage.sync.set({
                    mealieServer: 'https://mealie.example.com',
                    mealieApiToken: 'token123',
                });
                vi.mocked(getUser).mockResolvedValue(mockUser);
                const createTab = vi.spyOn(chrome.tabs, 'create');

                const listener = getContextMenuClickListener();
                await listener(
                    { menuItemId: `${DUPLICATE_NAME_MENU_ID}:some-other-recipe` },
                    { url: 'https://example.com/recipe', id: 1 },
                );

                await vi.waitFor(() =>
                    expect(createTab).toHaveBeenCalledWith(
                        expect.objectContaining({
                            url: expect.stringContaining('some-other-recipe'),
                        }),
                    ),
                );
            });
        });
    });
});
