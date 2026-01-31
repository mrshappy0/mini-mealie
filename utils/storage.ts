const DETECTION_CACHE_TTL_MS = 30_000;
let lastCheckId = 0;
const detectionCache = new Map<
    string,
    { checkedAt: number; title: string; outcome: TestScrapeUrlDetailedResult['outcome'] }
>();

export const checkStorageAndUpdateBadge = async () => {
    const checkId = ++lastCheckId;

    chrome.storage.sync.get(
        [...storageKeys],
        async ({ mealieServer, mealieApiToken }: StorageData) => {
            if (checkId !== lastCheckId) return;

            if (!mealieServer || !mealieApiToken) {
                showBadge('❌');
                removeContextMenu();
                return;
            }

            clearBadge();

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (checkId !== lastCheckId) return;

            const { url } = tab ?? {};
            let title = 'No Recipe Detected - Attempt to Add Recipe';

            if (url) {
                const cached = detectionCache.get(url);
                const now = Date.now();
                if (cached && now - cached.checkedAt < DETECTION_CACHE_TTL_MS) {
                    title = cached.title;
                } else {
                    const result = await testScrapeUrlDetailed(url, mealieServer, mealieApiToken);
                    if (checkId !== lastCheckId) return;

                    switch (result.outcome) {
                        case 'recipe':
                            title = 'Recipe Detected - Add Recipe to Mealie';
                            break;
                        case 'not-recipe':
                            // Keep default title.
                            break;
                        case 'timeout':
                            title = 'Recipe Check Timed Out - Attempt to Add Recipe';
                            break;
                        case 'http-error':
                            title = `Recipe Check Failed (${result.status}) - Attempt to Add Recipe`;
                            break;
                        case 'error':
                            title = 'Recipe Check Failed - Attempt to Add Recipe';
                            break;
                    }

                    detectionCache.set(url, {
                        checkedAt: now,
                        title,
                        outcome: result.outcome,
                    });
                }
            }

            addContextMenu(title);
        },
    );
};
