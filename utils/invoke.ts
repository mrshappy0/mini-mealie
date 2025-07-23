export function runCreateRecipe(tab: chrome.tabs.Tab) {
    chrome.storage.sync.get<StorageData>(
        [...storageKeys],
        async ({ mealieServer, mealieApiToken }) => {
            if (!mealieServer || !mealieApiToken) {
                showBadge('❌', 4);
                return;
            }
            const result = await createRecipe(tab.url!, mealieServer, mealieApiToken);
            showBadge(result === 'success' ? '✅' : '❌', 4);
        },
    );
}
