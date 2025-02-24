import { checkStorageAndUpdateBadge, createNotification, scrapeRecipe } from "@/utils";

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
        if (
            area === "sync" &&
            (changes.mealieServer || changes.mealieApiToken)
        ) {
            checkStorageAndUpdateBadge();
        }
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === "scrapeRecipe" && tab?.id) {
            chrome.tabs.sendMessage(
                tab.id,
                { action: "getCurrentUrl" },
                (response) => {
                    if (response?.url) {
                        scrapeRecipe(response.url);
                    } else {
                        createNotification(
                            "Failed to retrieve URL from the page."
                        );
                    }
                }
            );
        }
    });
});

