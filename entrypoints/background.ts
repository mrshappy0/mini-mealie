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
        if (area === 'sync' && (changes.mealieServer || changes.mealieApiToken)) {
            scheduleUpdate();
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
            if (
                changeInfo.url.startsWith('chrome://') ||
                changeInfo.url.startsWith('chrome-extension://')
            ) {
                return;
            }
            scheduleUpdate();
        }
    });

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
    // Get server and group slug from storage
    chrome.storage.sync.get([...storageKeys], async (data) => {
        const { mealieServer, mealieGroupSlug } = data;

        if (!mealieServer || !mealieGroupSlug) {
            await logEvent({
                level: 'warn',
                feature: 'duplicate-detect',
                action: 'viewSpecificDuplicate',
                phase: 'failure',
                message: 'Missing server or group slug',
                data: {
                    hasMealieServer: !!mealieServer,
                    hasMealieGroupSlug: !!mealieGroupSlug,
                },
            });
            return;
        }

        // Open the specific recipe page
        const recipeUrl = `${mealieServer}/g/${mealieGroupSlug}/r/${slug}`;
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

    // Get server and group slug from storage
    chrome.storage.sync.get([...storageKeys], async (data) => {
        const { mealieServer, mealieGroupSlug } = data;

        if (!mealieServer || !mealieGroupSlug) {
            await logEvent({
                level: 'warn',
                feature: 'duplicate-detect',
                action: 'viewDuplicate',
                phase: 'failure',
                message: 'Missing server or group slug',
                data: {
                    hasMealieServer: !!mealieServer,
                    hasMealieGroupSlug: !!mealieGroupSlug,
                },
            });
            return;
        }

        const duplicateInfo = cached.duplicateDetection!;

        if (menuId === DUPLICATE_URL_MENU_ID && duplicateInfo.urlMatch) {
            // Open the exact match recipe page
            const recipeUrl = `${mealieServer}/g/${mealieGroupSlug}/r/${duplicateInfo.urlMatch.slug}`;
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
            // Open search page with recipe name
            const searchUrl = `${mealieServer}/g/${mealieGroupSlug}/recipes/all?page=1&orderBy=created_at&orderDirection=desc&search=${encodeURIComponent(cached.recipeName)}`;
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
