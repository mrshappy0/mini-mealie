export default defineBackground(() => {
    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleUpdate = () => {
        if (updateTimer != null) {
            clearTimeout(updateTimer);
        }

        updateTimer = setTimeout(() => {
            updateTimer = undefined;
            checkStorageAndUpdateBadge();
        }, 250);
    };

    // Check storage and update badge on startup
    chrome.runtime.onStartup.addListener(() => {
        scheduleUpdate();
    });

    // Check storage and update badge when extension is installed or updated
    chrome.runtime.onInstalled.addListener(() => {
        scheduleUpdate();
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
            scheduleUpdate();
        }
    });

    chrome.contextMenus.onClicked.addListener(async (_, tab) => {
        if (tab?.url && tab.id) {
            runCreateRecipe(tab);
        }
    });
});
