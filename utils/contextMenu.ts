import type { DuplicateDetectionResult } from './storage';

export const RUN_CREATE_RECIPE_MENU_ID = 'runCreateRecipe';
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
    // Always create/update the main menu item
    addContextMenu(createTitle, createEnabled);

    // Remove old duplicate menu items first
    removeAllDuplicateMenus();

    // Add duplicate warnings based on detection type
    const canCreate = typeof chrome.contextMenus.create === 'function';
    if (!canCreate) return;

    if (duplicateInfo.type === 'url') {
        // Exact URL match - high confidence warning
        const { match } = duplicateInfo;
        chrome.contextMenus.create(
            {
                id: DUPLICATE_URL_MENU_ID,
                title: `⚠️ Exact match: "${match.name}"`,
                enabled: true,
                contexts: ['page'],
            },
            () => {
                void chrome.runtime.lastError;
            },
        );
    } else if (duplicateInfo.type === 'name') {
        // Similar name matches - lower confidence warning
        const { matches } = duplicateInfo;
        chrome.contextMenus.create(
            {
                id: DUPLICATE_NAME_MENU_ID,
                title: `💡 Similar recipes (${matches.length})`,
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
    // type === 'none': no duplicate menu items added
};
