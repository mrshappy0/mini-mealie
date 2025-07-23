export default defineBackground(() => {
    // Check storage and update badge on startup
    chrome.runtime.onStartup.addListener(() => {
        checkStorageAndUpdateBadge();
    });

    // Check storage and update badge when extension is installed or updated
    chrome.runtime.onInstalled.addListener(() => {
        checkStorageAndUpdateBadge();
    });

    // Watch for changes in storage to update badge and context menu
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && (changes.mealieServer || changes.mealieApiToken)) {
            checkStorageAndUpdateBadge();
        }
    });

    // Detect when the active tab changes
    chrome.tabs.onActivated.addListener(() => {
        checkStorageAndUpdateBadge();
    });

    // Detect when a tab URL is updated
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.url) {
            checkStorageAndUpdateBadge();
        }
    });

    chrome.contextMenus.onClicked.addListener(async (_, tab) => {
        if (tab?.url && tab.id) {
            runCreateRecipe(tab);
        }
    });
});
