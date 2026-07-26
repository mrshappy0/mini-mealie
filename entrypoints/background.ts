import { MINI_MEALIE_E2E_RUN_CREATE_RECIPE_MESSAGE } from '@/utils/e2eMessaging';

export default defineBackground(() => {
    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleUpdate = () => {
        if (updateTimer != null) {
            clearTimeout(updateTimer);
        }

        updateTimer = setTimeout(() => {
            updateTimer = undefined;
            // TODO: investigate if we can await this call
            void checkStorageAndUpdateBadge();
        }, 250);
    };

    // Check storage and update badge on startup
    chrome.runtime.onStartup.addListener(async () => {
        // Pre-populate dev environment if applicable
        await initDevEnvironment();
        scheduleUpdate();
    });

    // Check storage and update badge when extension is installed or updated
    chrome.runtime.onInstalled.addListener(async () => {
        // Pre-populate dev environment if applicable
        await initDevEnvironment();
        scheduleUpdate();

        // Auto-open logs page in dev mode (only on install/update, not every startup)
        if (import.meta.env.DEV) {
            // TODO: investigate if we can await this call
            void chrome.tabs.create({ url: chrome.runtime.getURL('logs.html') });
        }
    });

    // Watch for changes in storage to update badge and context menu
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') {
            if (changes.mealieServer || changes.mealieApiToken) {
                scheduleUpdate();
            }
            // Clear cache and immediately update when mode changes
            // (no delay) to ensure context menu updates instantly
            if (changes.recipeCreateMode) {
                clearDetectionCache();
                void checkStorageAndUpdateBadge();
            }
        }
    });

    // Detect when the active tab changes
    chrome.tabs.onActivated.addListener(() => {
        scheduleUpdate();
    });

    // Detect when a tab URL is updated
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.url) {
            // Skip internal browser and extension pages
            if (isRestrictedUrl(changeInfo.url)) {
                return;
            }
            scheduleUpdate();
        }
    });

    // E2E hook: lets the test harness trigger the exact same code path as the
    // context-menu "Save to Mini Mealie" click, without driving native menu UI.
    // See utils/e2eMessaging.ts for why this is the canonical cross-browser trigger.
    //
    // Gated behind WXT_E2E so it's tree-shaken out of production store builds — only
    // E2E builds (`WXT_E2E=true`) compile it in. See wxt.config.ts `vite.define`.
    if (import.meta.env.WXT_E2E) {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            if (message?.type !== MINI_MEALIE_E2E_RUN_CREATE_RECIPE_MESSAGE) {
                return;
            }

            const rawUrl = typeof message.matchUrl === 'string' ? message.matchUrl.trim() : '';
            const matchUrl = rawUrl.length > 0 ? rawUrl.split('#')[0] : undefined;

            const finish = (tab: chrome.tabs.Tab | undefined) => {
                if (!tab?.id || !tab.url || isRestrictedUrl(tab.url)) {
                    sendResponse({ ok: false, error: 'no_valid_tab' });
                    return;
                }
                runCreateRecipe(tab);
                sendResponse({ ok: true });
            };

            if (matchUrl) {
                chrome.tabs.query({}, (tabs) => {
                    void chrome.runtime.lastError;
                    const tab = tabs.find((t) => t.url && t.url.split('#')[0] === matchUrl);
                    finish(tab);
                });
            } else {
                chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                    void chrome.runtime.lastError;
                    finish(tabs[0]);
                });
            }

            // Keep the message channel open for the async sendResponse above
            // (required in both MV3 service workers and MV2 background pages).
            return true;
        });
    }

    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        if (!tab?.url || !tab.id) return;

        const menuId = info.menuItemId as string;

        // Check if this is a child menu item (format: "viewDuplicatesByName:slug")
        if (menuId.startsWith(DUPLICATE_NAME_MENU_ID + ':')) {
            const slug = menuId.substring(DUPLICATE_NAME_MENU_ID.length + 1);
            await handleViewSpecificDuplicate(slug);
            return;
        }

        switch (menuId) {
            case RUN_CREATE_RECIPE_MENU_ID:
                runCreateRecipe(tab);
                break;

            case SWITCH_TO_HTML_MODE_ID:
                // Switch to HTML mode when user clicks error suggestion
                chrome.storage.sync.set({ recipeCreateMode: RecipeCreateMode.HTML }, async () => {
                    await logEvent({
                        level: 'info',
                        feature: 'recipe-create',
                        action: 'switchMode',
                        phase: 'success',
                        message: 'Switched to HTML mode from context menu',
                    });
                });
                break;

            case DUPLICATE_URL_MENU_ID:
                await handleViewDuplicate(tab.url, menuId);
                break;

            case DUPLICATE_NAME_MENU_ID:
                // Parent menu - open search page
                await handleViewDuplicate(tab.url, menuId);
                break;
        }
    });
});

/**
 * Handle clicking on a specific duplicate recipe menu item.
 * Opens the recipe page directly in Mealie.
 */
async function handleViewSpecificDuplicate(slug: string) {
    chrome.storage.sync.get<StorageData>([...storageKeys], async (data) => {
        const { mealieServer, mealieApiToken } = data;

        if (!mealieServer || !mealieApiToken) {
            await logEvent({
                level: 'warn',
                feature: 'duplicate-detect',
                action: 'viewSpecificDuplicate',
                phase: 'failure',
                message: 'Missing server or token',
                data: {
                    hasMealieServer: !!mealieServer,
                    hasMealieApiToken: !!mealieApiToken,
                },
            });
            return;
        }

        const normalizedMealieServer = mealieServer.replace(/\/+$/, '');
        const user = await getUser(mealieServer, mealieApiToken);
        const groupSlug = 'groupSlug' in user ? user.groupSlug : undefined;

        if (!groupSlug) {
            await logEvent({
                level: 'warn',
                feature: 'duplicate-detect',
                action: 'viewSpecificDuplicate',
                phase: 'failure',
                message: 'Failed to fetch group slug',
            });
            return;
        }

        const recipeUrl = `${normalizedMealieServer}/g/${groupSlug}/r/${slug}`;
        await logEvent({
            level: 'info',
            feature: 'duplicate-detect',
            action: 'viewSpecificDuplicate',
            phase: 'success',
            message: 'Opening specific duplicate recipe',
            data: { recipeSlug: slug },
        });
        void chrome.tabs.create({ url: recipeUrl });
    });
}

/**
 * Handle clicking on duplicate warning menu items.
 * Opens the existing recipe page or search page in Mealie.
 */
async function handleViewDuplicate(url: string, menuId: string) {
    // Get cached duplicate detection for this URL
    const cached = detectionCache.get(url);
    if (!cached?.duplicateDetection) {
        await logEvent({
            level: 'warn',
            feature: 'duplicate-detect',
            action: 'viewDuplicate',
            phase: 'failure',
            message: 'No cached duplicate detection found',
            data: { url: sanitizeUrl(url) },
        });
        return;
    }

    chrome.storage.sync.get<StorageData>([...storageKeys], async (data) => {
        const { mealieServer, mealieApiToken } = data;

        if (!mealieServer || !mealieApiToken) {
            await logEvent({
                level: 'warn',
                feature: 'duplicate-detect',
                action: 'viewDuplicate',
                phase: 'failure',
                message: 'Missing server or token',
                data: {
                    hasMealieServer: !!mealieServer,
                    hasMealieApiToken: !!mealieApiToken,
                },
            });
            return;
        }

        const normalizedServer = mealieServer.replace(/\/+$/, '');
        const user = await getUser(mealieServer, mealieApiToken);
        const groupSlug = 'groupSlug' in user ? user.groupSlug : undefined;

        if (!groupSlug) {
            await logEvent({
                level: 'warn',
                feature: 'duplicate-detect',
                action: 'viewDuplicate',
                phase: 'failure',
                message: 'Failed to fetch group slug',
            });
            return;
        }

        const duplicateInfo = cached.duplicateDetection!;

        if (menuId === DUPLICATE_URL_MENU_ID && duplicateInfo.urlMatch) {
            const recipeUrl = `${normalizedServer}/g/${encodeURIComponent(groupSlug)}/r/${encodeURIComponent(duplicateInfo.urlMatch.slug)}`;
            await logEvent({
                level: 'info',
                feature: 'duplicate-detect',
                action: 'viewDuplicate',
                phase: 'success',
                message: 'Opening exact match recipe',
                data: {
                    recipeName: duplicateInfo.urlMatch.name,
                    recipeSlug: duplicateInfo.urlMatch.slug,
                },
            });
            void chrome.tabs.create({ url: recipeUrl });
        } else if (menuId === DUPLICATE_NAME_MENU_ID && cached.recipeName) {
            const searchUrl = `${normalizedServer}/g/${encodeURIComponent(groupSlug)}/recipes/all?page=1&orderBy=created_at&orderDirection=desc&search=${encodeURIComponent(cached.recipeName)}`;
            await logEvent({
                level: 'info',
                feature: 'duplicate-detect',
                action: 'viewDuplicate',
                phase: 'success',
                message: 'Opening search page for similar recipes',
                data: { recipeName: cached.recipeName },
            });
            void chrome.tabs.create({ url: searchUrl });
        }
    });
}
