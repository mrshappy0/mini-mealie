export const addContextMenu = (title: string) => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'runCreateRecipe',
            title,
            contexts: ['page'],
        });
    });
};

export const removeContextMenu = () => {
    chrome.contextMenus.removeAll();
};
