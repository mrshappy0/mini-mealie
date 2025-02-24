export const addContextMenu = () => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "scrapeRecipe",
            title: "Scrape Recipe with Mealie",
            contexts: ["page"],
        });
    });
};

export const removeContextMenu = () => {
    chrome.contextMenus.removeAll();
};