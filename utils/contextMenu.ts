import type { DuplicateDetectionResult } from './storage';

export const RUN_CREATE_RECIPE_MENU_ID = 'runCreateRecipe';
export const DUPLICATE_DETECTION_PARENT_ID = 'duplicateDetection';
export const DUPLICATE_URL_MENU_ID = 'viewDuplicateUrl';
export const DUPLICATE_NAME_MENU_ID = 'viewDuplicatesByName';

// Keep track of child menu IDs for cleanup
const childMenuIds: string[] = [];

export type DuplicateInfo = DuplicateDetectionResult;

/**
 * Internal helper to add or update a single context menu item.
 * For creating the main recipe creation menu.
 */
export const addContextMenu = (title: string, enabled = true) => {
    const canUpdate = typeof chrome.contextMenus.update === 'function';
    const canCreate = typeof chrome.contextMenus.create === 'function';
    const canRemoveAll = typeof chrome.contextMenus.removeAll === 'function';

    // Test environments sometimes only mock removeAll/create.
    if (!canUpdate && canRemoveAll && canCreate) {
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: RUN_CREATE_RECIPE_MENU_ID,
                title,
                enabled,
                contexts: ['page'],
            });
        });
        return;
    }

    if (!canUpdate || !canCreate) return;

    chrome.contextMenus.update(RUN_CREATE_RECIPE_MENU_ID, { title, enabled }, () => {
        if (!chrome.runtime.lastError) return;
        chrome.contextMenus.create(
            {
                id: RUN_CREATE_RECIPE_MENU_ID,
                title,
                enabled,
                contexts: ['page'],
            },
            () => {
                // Ignore "already exists" and other transient errors.
                void chrome.runtime.lastError;
            },
        );
    });
};

export const removeContextMenu = () => {
    const canRemove = typeof chrome.contextMenus.remove === 'function';
    const canRemoveAll = typeof chrome.contextMenus.removeAll === 'function';

    // Test environments sometimes only mock removeAll.
    if (!canRemove && canRemoveAll) {
        chrome.contextMenus.removeAll();
        return;
    }

    if (!canRemove) return;

    chrome.contextMenus.remove(RUN_CREATE_RECIPE_MENU_ID, () => {
        void chrome.runtime.lastError;
    });
};

/**
 * Remove all duplicate warning menu items.
 */
export const removeAllDuplicateMenus = () => {
    const canRemove = typeof chrome.contextMenus.remove === 'function';
    if (!canRemove) return;

    chrome.contextMenus.remove(DUPLICATE_URL_MENU_ID, () => {
        void chrome.runtime.lastError;
    });
    chrome.contextMenus.remove(DUPLICATE_NAME_MENU_ID, () => {
        void chrome.runtime.lastError;
    });

    // Remove all child menu items
    for (const childId of childMenuIds) {
        chrome.contextMenus.remove(childId, () => {
            void chrome.runtime.lastError;
        });
    }
    childMenuIds.length = 0; // Clear the array
};

/**
 * Update context menu with main action and optional duplicate warnings.
 * This is the primary function for managing the extension's context menu.
 *
 * @param createTitle - Title for the main "Create Recipe" menu item
 * @param createEnabled - Whether the create action is enabled
 * @param duplicateInfo - Information about detected duplicates
 */
export const updateContextMenu = (
    createTitle: string,
    createEnabled: boolean,
    duplicateInfo: DuplicateInfo,
) => {
    // Remove all menus first to ensure correct ordering
    removeContextMenu();
    removeAllDuplicateMenus();

    const canCreate = typeof chrome.contextMenus.create === 'function';
    if (!canCreate) return;

    // 1. Always create the main menu FIRST (ensures it appears first)
    chrome.contextMenus.create(
        {
            id: RUN_CREATE_RECIPE_MENU_ID,
            title: `➕ ${createTitle}`,
            enabled: createEnabled,
            contexts: ['page'],
        },
        () => {
            void chrome.runtime.lastError;
        },
    );

    // 2. Create "Already exists" menu if URL match found
    if (duplicateInfo.urlMatch) {
        chrome.contextMenus.create(
            {
                id: DUPLICATE_URL_MENU_ID,
                title: `⚠️ Already exists: "${duplicateInfo.urlMatch.name}"`,
                enabled: true,
                contexts: ['page'],
            },
            () => {
                void chrome.runtime.lastError;
            },
        );
    }

    // 3. Create "Found X similar recipes" menu if name matches found
    if (duplicateInfo.nameMatches && duplicateInfo.nameMatches.length > 0) {
        const matches = duplicateInfo.nameMatches;
        const recipeWord = matches.length === 1 ? 'recipe' : 'recipes';
        chrome.contextMenus.create(
            {
                id: DUPLICATE_NAME_MENU_ID,
                title: `🔍 Found ${matches.length} similar ${recipeWord}`,
                enabled: true,
                contexts: ['page'],
            },
            () => {
                void chrome.runtime.lastError;
            },
        );

        // Create child menu items for each match
        for (const match of matches) {
            const childId = `${DUPLICATE_NAME_MENU_ID}:${match.slug}`;
            childMenuIds.push(childId);
            chrome.contextMenus.create(
                {
                    id: childId,
                    parentId: DUPLICATE_NAME_MENU_ID,
                    title: match.name,
                    enabled: true,
                    contexts: ['page'],
                },
                () => {
                    void chrome.runtime.lastError;
                },
            );
        }
    }
};
