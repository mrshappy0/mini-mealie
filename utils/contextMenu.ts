import type { DuplicateDetectionResult } from './storage';
import type { RecipeSummary } from './types/apiTypes';

export const MINI_MEALIE_PARENT_ID = 'miniMealieParent';
export const RUN_CREATE_RECIPE_MENU_ID = 'runCreateRecipe';
export const DUPLICATE_DETECTION_PARENT_ID = 'duplicateDetection';
export const DUPLICATE_URL_MENU_ID = 'viewDuplicateUrl';
export const DUPLICATE_NAME_MENU_ID = 'viewDuplicatesByName';
export const SWITCH_TO_HTML_MODE_ID = 'switchToHtmlMode';

/**
 * Recipe sites are mostly links/images; `page` alone only fires on blank page chrome,
 * so menus never appear for typical right-clicks.
 */
export const RECIPE_MENU_CONTEXTS: [
    `${chrome.contextMenus.ContextType}`,
    ...`${chrome.contextMenus.ContextType}`[],
] = ['page', 'frame', 'link', 'selection', 'image'];

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
                contexts: RECIPE_MENU_CONTEXTS,
            });
        });
        return;
    }

    if (!canUpdate || !canCreate) return;

    chrome.contextMenus.update(RUN_CREATE_RECIPE_MENU_ID, { title, enabled }, () => {
        if (!chrome.runtime?.lastError) return;
        chrome.contextMenus.create(
            {
                id: RUN_CREATE_RECIPE_MENU_ID,
                title,
                enabled,
                contexts: RECIPE_MENU_CONTEXTS,
            },
            () => {
                // Ignore "already exists" and other transient errors.
                void chrome.runtime?.lastError;
            },
        );
    });
};

export const removeContextMenu = () => {
    const canRemoveAll = typeof chrome.contextMenus.removeAll === 'function';

    // Prefer removeAll: parallel remove()+create races Firefox (duplicate id errors are swallowed).
    if (canRemoveAll) {
        childMenuIds.length = 0;
        chrome.contextMenus.removeAll(() => void chrome.runtime?.lastError);
        return;
    }

    const canRemove = typeof chrome.contextMenus.remove === 'function';
    if (!canRemove) return;

    chrome.contextMenus.remove(MINI_MEALIE_PARENT_ID, () => {
        void chrome.runtime?.lastError;
    });

    chrome.contextMenus.remove(RUN_CREATE_RECIPE_MENU_ID, () => {
        void chrome.runtime?.lastError;
    });
};

/**
 * Remove all duplicate warning menu items.
 */
export const removeAllDuplicateMenus = () => {
    const canRemove = typeof chrome.contextMenus.remove === 'function';
    if (!canRemove) return;

    chrome.contextMenus.remove(DUPLICATE_URL_MENU_ID, () => {
        void chrome.runtime?.lastError;
    });
    chrome.contextMenus.remove(DUPLICATE_NAME_MENU_ID, () => {
        void chrome.runtime?.lastError;
    });

    // Remove all child menu items
    for (const childId of childMenuIds) {
        chrome.contextMenus.remove(childId, () => {
            void chrome.runtime?.lastError;
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
 * @param isErrorSuggestion - Whether the create title is an error suggesting mode switch
 */
function createNameMatchChildrenFromIterator(iter: Iterator<RecipeSummary>): void {
    const step = iter.next();
    if (step.done || !step.value) return;

    const match = step.value;
    const childId = `${DUPLICATE_NAME_MENU_ID}:${match.slug}`;
    childMenuIds.push(childId);
    chrome.contextMenus.create(
        {
            id: childId,
            parentId: DUPLICATE_NAME_MENU_ID,
            title: match.name,
            enabled: true,
            contexts: RECIPE_MENU_CONTEXTS,
        },
        () => {
            void chrome.runtime?.lastError;
            createNameMatchChildrenFromIterator(iter);
        },
    );
}

function createNameMatchParentMenu(duplicateInfo: DuplicateInfo): void {
    if (!duplicateInfo.nameMatches || duplicateInfo.nameMatches.length === 0) return;

    const matches = duplicateInfo.nameMatches;
    const recipeWord = matches.length === 1 ? 'recipe' : 'recipes';

    chrome.contextMenus.create(
        {
            id: DUPLICATE_NAME_MENU_ID,
            parentId: MINI_MEALIE_PARENT_ID,
            title: `🔍 Found ${matches.length} similar ${recipeWord}`,
            enabled: true,
            contexts: RECIPE_MENU_CONTEXTS,
        },
        () => {
            void chrome.runtime?.lastError;
            createNameMatchChildrenFromIterator(matches[Symbol.iterator]());
        },
    );
}

/** Chain sibling menus after the primary action so parents exist before children (Firefox-sensitive). */
function createDuplicateSiblingMenus(duplicateInfo: DuplicateInfo): void {
    if (duplicateInfo.urlMatch) {
        chrome.contextMenus.create(
            {
                id: DUPLICATE_URL_MENU_ID,
                parentId: MINI_MEALIE_PARENT_ID,
                title: `⚠️ Already exists: "${duplicateInfo.urlMatch.name}"`,
                enabled: true,
                contexts: RECIPE_MENU_CONTEXTS,
            },
            () => {
                void chrome.runtime?.lastError;
                createNameMatchParentMenu(duplicateInfo);
            },
        );
        return;
    }

    createNameMatchParentMenu(duplicateInfo);
}

export const updateContextMenu = (
    createTitle: string,
    createEnabled: boolean,
    duplicateInfo: DuplicateInfo,
    isErrorSuggestion = false,
) => {
    const canCreate = typeof chrome.contextMenus.create === 'function';
    const canRemoveAll = typeof chrome.contextMenus.removeAll === 'function';
    if (!canCreate || !canRemoveAll) return;

    const menuId = isErrorSuggestion ? SWITCH_TO_HTML_MODE_ID : RUN_CREATE_RECIPE_MENU_ID;

    chrome.contextMenus.removeAll(() => {
        void chrome.runtime?.lastError;
        childMenuIds.length = 0;

        chrome.contextMenus.create(
            {
                id: MINI_MEALIE_PARENT_ID,
                title: 'Mini Mealie',
                contexts: RECIPE_MENU_CONTEXTS,
            },
            () => {
                void chrome.runtime?.lastError;
                chrome.contextMenus.create(
                    {
                        id: menuId,
                        parentId: MINI_MEALIE_PARENT_ID,
                        title: createTitle,
                        enabled: createEnabled,
                        contexts: RECIPE_MENU_CONTEXTS,
                    },
                    () => {
                        void chrome.runtime?.lastError;
                        createDuplicateSiblingMenus(duplicateInfo);
                    },
                );
            },
        );
    });
};
