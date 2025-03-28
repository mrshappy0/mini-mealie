export const checkStorageAndUpdateBadge = () => {
    chrome.storage.sync.get(
        ['mealieServer', 'mealieApiToken'],
        ({ mealieServer, mealieApiToken }: StorageData) => {
            const hasServer = !!mealieServer;
            const hasToken = !!mealieApiToken;

            if (!hasServer || !hasToken) {
                showBadge('❌');
                removeContextMenu();
            } else {
                clearBadge();
                addContextMenu();
            }
        },
    );
};
