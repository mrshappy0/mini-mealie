const RUN_CREATE_RECIPE_MENU_ID = 'runCreateRecipe';

export const addContextMenu = (title: string) => {
    const canUpdate = typeof chrome.contextMenus.update === 'function';
    const canCreate = typeof chrome.contextMenus.create === 'function';
    const canRemoveAll = typeof chrome.contextMenus.removeAll === 'function';

    // Test environments sometimes only mock removeAll/create.
    if (!canUpdate && canRemoveAll && canCreate) {
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: RUN_CREATE_RECIPE_MENU_ID,
                title,
                contexts: ['page'],
            });
        });
        return;
    }

    if (!canUpdate || !canCreate) return;

    chrome.contextMenus.update(RUN_CREATE_RECIPE_MENU_ID, { title }, () => {
        if (!chrome.runtime.lastError) return;
        chrome.contextMenus.create(
            {
                id: RUN_CREATE_RECIPE_MENU_ID,
                title,
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
