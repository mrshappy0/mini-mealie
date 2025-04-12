export const addContextMenu = () => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'runCreateRecipe',
            title: 'Import recipe to Mealie',
            contexts: ['page'],
        });
    });
};

export const removeContextMenu = () => {
    chrome.contextMenus.removeAll();
};
