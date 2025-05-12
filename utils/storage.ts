export const checkStorageAndUpdateBadge = () => {
    chrome.storage.sync.get(
        [...storageKeys],
        async ({ mealieServer, mealieApiToken }: StorageData) => {
            if (!mealieServer || !mealieApiToken) {
                showBadge('❌');
                removeContextMenu();
                return;
            }

            clearBadge();

            const [{ url }] = await chrome.tabs.query({ active: true, currentWindow: true });

            const title =
                url && (await testScrapeUrl(url, mealieServer, mealieApiToken))
                    ? 'Recipe Detected - Add Recipe to Mealie'
                    : 'No Recipe Detected - Attempt to Add Recipe';

            addContextMenu(title);
        },
    );
};
