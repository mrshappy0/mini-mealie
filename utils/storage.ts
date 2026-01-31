const DETECTION_CACHE_TTL_MS = 30_000;
const DETECTION_CACHE_MAX_SIZE = 100;
let lastCheckId = 0;
const detectionCache = new Map<string, { checkedAt: number; title: string }>();

/**
 * Prune expired cache entries and enforce size limit using LRU eviction.
 * Called opportunistically on each cache access to prevent unbounded memory growth.
 */
function pruneDetectionCache() {
    // Early return if cache is empty
    if (detectionCache.size === 0) return;

    const now = Date.now();

    // Remove expired entries
    for (const [url, entry] of detectionCache.entries()) {
        if (now - entry.checkedAt >= DETECTION_CACHE_TTL_MS) {
            detectionCache.delete(url);
        }
    }

    // Enforce max size by removing oldest entries (LRU)
    // Only sort when we actually need to evict entries
    if (detectionCache.size > DETECTION_CACHE_MAX_SIZE) {
        const entriesToDelete = detectionCache.size - DETECTION_CACHE_MAX_SIZE;
        const sortedEntries = Array.from(detectionCache.entries()).sort(
            (a, b) => a[1].checkedAt - b[1].checkedAt,
        );

        for (let i = 0; i < entriesToDelete; i++) {
            detectionCache.delete(sortedEntries[i][0]);
        }
    }
}

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
                pruneDetectionCache();

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
                    });
                }
            }

            addContextMenu(title);
        },
    );
};
