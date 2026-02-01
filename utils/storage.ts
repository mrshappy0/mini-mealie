const DETECTION_CACHE_TTL_MS = 30_000;
const DETECTION_CACHE_MAX_SIZE = 100;
let lastCheckId = 0;
const detectionCache = new Map<string, { checkedAt: number; title: string }>();

/**
 * Clear the detection cache. Exported for testing purposes.
 * @internal
 */
export function clearDetectionCache() {
    detectionCache.clear();
}

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
            let title = 'No Recipe Found - Try HTML Mode';

            if (url) {
                pruneDetectionCache();

                const cached = detectionCache.get(url);
                const now = Date.now();
                if (cached && now - cached.checkedAt < DETECTION_CACHE_TTL_MS) {
                    // Update timestamp for true LRU behavior
                    cached.checkedAt = now;
                    title = cached.title;
                } else {
                    const result = await testScrapeUrlDetailed(url, mealieServer, mealieApiToken);
                    if (checkId !== lastCheckId) return;

                    const { logEvent, sanitizeUrl } = await import('./logging');

                    switch (result.outcome) {
                        case 'recipe':
                            title = 'Recipe Detected - Add to Mealie';
                            await logEvent({
                                level: 'info',
                                feature: 'recipe-detect',
                                action: 'testScrape',
                                phase: 'success',
                                message: 'Recipe detected on page',
                                data: { url: sanitizeUrl(url) },
                            });
                            break;
                        case 'not-recipe':
                            // Keep default title.
                            await logEvent({
                                level: 'info',
                                feature: 'recipe-detect',
                                action: 'testScrape',
                                phase: 'failure',
                                message: 'No recipe found on page',
                                data: { url: sanitizeUrl(url) },
                            });
                            break;
                        case 'timeout':
                            title = 'Detection Timed Out - Try HTML Mode';
                            await logEvent({
                                level: 'warn',
                                feature: 'recipe-detect',
                                action: 'testScrape',
                                phase: 'failure',
                                message: `Recipe detection timed out (${result.timeoutMs}ms)`,
                                data: { url: sanitizeUrl(url), timeoutMs: result.timeoutMs },
                            });
                            break;
                        case 'http-error':
                            title = `Detection Failed (${result.status}) - Try HTML Mode`;
                            await logEvent({
                                level: 'warn',
                                feature: 'recipe-detect',
                                action: 'testScrape',
                                phase: 'failure',
                                message: `Recipe detection failed with HTTP ${result.status}`,
                                data: { url: sanitizeUrl(url), status: result.status },
                            });
                            break;
                        case 'error':
                            title = 'Detection Failed - Try HTML Mode';
                            await logEvent({
                                level: 'error',
                                feature: 'recipe-detect',
                                action: 'testScrape',
                                phase: 'failure',
                                message: `Recipe detection error: ${result.message}`,
                                data: { url: sanitizeUrl(url) },
                            });
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
