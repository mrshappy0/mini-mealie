const DETECTION_CACHE_TTL_MS = 30_000;
const DETECTION_CACHE_MAX_SIZE = 100;
let lastCheckId = 0;
type DetectionOutcome = 'recipe' | 'not-recipe' | 'timeout' | 'http-error' | 'error';
type CachedDetection = { checkedAt: number; outcome: DetectionOutcome; status?: number };
export const detectionCache = new Map<string, CachedDetection>();

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

        for (const [url] of sortedEntries.slice(0, entriesToDelete)) {
            detectionCache.delete(url);
        }
    }
}

/**
 * Generate context menu title based on detection outcome and current mode.
 */
function getTitleForOutcome(
    outcome: DetectionOutcome,
    status: number | undefined,
    isUrlMode: boolean,
): string {
    // HTML mode doesn't rely on URL detection, so just show generic title
    if (!isUrlMode) {
        return 'Create Recipe from HTML';
    }

    // URL mode: show detection-specific titles
    switch (outcome) {
        case 'recipe':
            return 'Create Recipe from URL';
        case 'not-recipe':
            return 'No Recipe - Switch to HTML Mode';
        case 'timeout':
            return 'Timed Out - Switch to HTML Mode';
        case 'http-error':
            return `Failed Detection (HTTP ${status}) - Switch to HTML Mode`;
        case 'error':
            return 'Failed Detection - Switch to HTML Mode';
    }
}

export const checkStorageAndUpdateBadge = async () => {
    const checkId = ++lastCheckId;

    chrome.storage.sync.get(
        [...storageKeys],
        async ({ mealieServer, mealieApiToken, recipeCreateMode }: StorageData) => {
            if (checkId !== lastCheckId) return;

            if (!mealieServer || !mealieApiToken) {
                showBadge('❌');
                removeContextMenu();
                return;
            }

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (checkId !== lastCheckId) return;

            const { url } = tab ?? {};
            const mode = isRecipeCreateMode(recipeCreateMode)
                ? recipeCreateMode
                : RecipeCreateMode.URL;
            const isUrlMode = mode === RecipeCreateMode.URL;

            let title = isUrlMode ? 'No Recipe - Switch to HTML Mode' : 'Create Recipe from HTML';

            if (url) {
                pruneDetectionCache();

                const cached = detectionCache.get(url);
                const now = Date.now();
                if (cached && now - cached.checkedAt < DETECTION_CACHE_TTL_MS) {
                    // Update timestamp for true LRU behavior
                    cached.checkedAt = now;
                    // Generate title based on current mode and cached outcome
                    title = getTitleForOutcome(cached.outcome, cached.status, isUrlMode);
                } else {
                    const result = await testScrapeUrlDetailed(url, mealieServer, mealieApiToken);
                    if (checkId !== lastCheckId) return;

                    const { logEvent, sanitizeUrl } = await import('./logging');

                    switch (result.outcome) {
                        case 'recipe':
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

                    // Cache the outcome and generate title based on current mode
                    const cacheEntry: CachedDetection = {
                        checkedAt: now,
                        outcome: result.outcome,
                    };
                    if (result.outcome === 'http-error') {
                        cacheEntry.status = result.status;
                    }
                    detectionCache.set(url, cacheEntry);
                    title = getTitleForOutcome(result.outcome, cacheEntry.status, isUrlMode);
                }
            }

            addContextMenu(title);
        },
    );
};
