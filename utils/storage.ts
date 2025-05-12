export const checkStorageAndUpdateBadge = async () => {
    chrome.storage.sync.get(
        [...storageKeys],
        async ({ mealieServer, mealieApiToken }: StorageData) => {
            if (!mealieServer || !mealieApiToken) {
                showBadge('❌');
                removeContextMenu();
                return;
            }

            clearBadge();
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const { url } = tab ?? {};
            let title = 'No Recipe Detected - Attempt to Add Recipe';

            if (url) {
                const isRecipe = await testScrapeUrl(url, mealieServer, mealieApiToken);
                title = isRecipe ? 'Recipe Detected - Add Recipe to Mealie' : title;
            }

            addContextMenu(title);
        },
    );
};
