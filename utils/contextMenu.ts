export const addContextMenu = () => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "scrapeRecipe",
            title: "Import recipe to Mealie",
            contexts: ["page"],
        });
    });
};

export const removeContextMenu = () => {
    chrome.contextMenus.removeAll();
};