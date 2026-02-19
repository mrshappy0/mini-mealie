const DETECTION_CACHE_TTL_MS = 30_000;
const DETECTION_CACHE_MAX_SIZE = 100;
let lastCheckId = 0;
type DetectionOutcome = 'recipe' | 'not-recipe' | 'timeout' | 'http-error' | 'error';

export type DuplicateDetectionResult = {
    urlMatch?: RecipeSummary;
    nameMatches?: RecipeSummary[];
    searchQuery?: string;
};

type CachedDetection = {
    checkedAt: number;
    outcome: DetectionOutcome;
    status?: number;
    recipeName?: string;
    duplicateDetection?: DuplicateDetectionResult;
};

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
 * Check for duplicate recipes by URL and name.
 * First attempts exact URL match (high confidence), then falls back to fuzzy name search.
 * @param url - The recipe URL to check
 * @param recipeName - The parsed recipe name (optional)
 * @param server - Mealie server URL
 * @param token - API token
 * @returns Duplicate detection result with match type and data
 */
async function checkForDuplicates(
    url: string,
    recipeName: string | undefined,
    server: string,
    token: string,
): Promise<DuplicateDetectionResult> {
    const result: DuplicateDetectionResult = {};

    try {
        // Check both URL match AND name matches (don't return early)
        const urlMatch = await findRecipeByURL(url, server, token);
        if (urlMatch) {
            result.urlMatch = urlMatch;
            await logEvent({
                level: 'info',
                feature: 'duplicate-detect',
                action: 'checkDuplicates',
                phase: 'success',
                message: 'Found exact URL match',
                data: { url: sanitizeUrl(url), recipeName: urlMatch.name },
            });
        }

        // Also check for name matches if we have a recipe name
        if (recipeName) {
            const nameMatches = await searchRecipesByName(recipeName, server, token);
            if (nameMatches.length > 0) {
                result.nameMatches = nameMatches;
                result.searchQuery = recipeName;
                await logEvent({
                    level: 'info',
                    feature: 'duplicate-detect',
                    action: 'checkDuplicates',
                    phase: 'success',
                    message: `Found ${nameMatches.length} similar recipes by name`,
                    data: { recipeName, matchCount: nameMatches.length },
                });
            }
        }

        // Log if no duplicates found
        if (!result.urlMatch && !result.nameMatches) {
            await logEvent({
                level: 'info',
                feature: 'duplicate-detect',
                action: 'checkDuplicates',
                phase: 'success',
                message: 'No duplicates found',
                data: { url: sanitizeUrl(url) },
            });
        }

        return result;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await logEvent({
            level: 'error',
            feature: 'duplicate-detect',
            action: 'checkDuplicates',
            phase: 'failure',
            message: `Duplicate detection failed: ${errorMessage}`,
            data: { url: sanitizeUrl(url) },
        });
        // On error, don't block - just return no duplicates
        return {};
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

            // In HTML mode, always show static title and enable
            // No detection or duplicate checking needed
            if (!isUrlMode) {
                updateContextMenu('Create Recipe from HTML', true, {}, false);
                return;
            }

            // From here on, we're in URL mode only
            let title = 'No Recipe - Switch to HTML Mode';
            const enabled = true; // Always enabled
            let isErrorSuggestion = true; // Default to error state
            let duplicateInfo: DuplicateDetectionResult = {};

            if (url) {
                // Skip internal browser and extension pages
                if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
                    showBadge('');
                    removeContextMenu();
                    removeAllDuplicateMenus();
                    return;
                }

                pruneDetectionCache();

                const cached = detectionCache.get(url);
                const now = Date.now();
                if (cached && now - cached.checkedAt < DETECTION_CACHE_TTL_MS) {
                    // Update timestamp for true LRU behavior
                    cached.checkedAt = now;
                    // Generate title based on current mode and cached outcome
                    title = getTitleForOutcome(cached.outcome, cached.status, isUrlMode);
                    isErrorSuggestion = cached.outcome !== 'recipe';
                    // Use cached duplicate detection if available and recipe was detected
                    if (cached.outcome === 'recipe' && cached.duplicateDetection) {
                        duplicateInfo = cached.duplicateDetection;
                    }
                } else {
                    const result = await testScrapeUrlDetailed(url, mealieServer, mealieApiToken);
                    if (checkId !== lastCheckId) return;

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

                    // Only check for duplicates if recipe was detected (in URL mode)
                    if (result.outcome === 'recipe') {
                        isErrorSuggestion = false;
                        // Store recipe name if available
                        if (result.recipeName) {
                            cacheEntry.recipeName = result.recipeName;
                        }
                        // Check for duplicates
                        const duplicateDetection = await checkForDuplicates(
                            url,
                            result.recipeName,
                            mealieServer,
                            mealieApiToken,
                        );
                        if (checkId !== lastCheckId) return;
                        cacheEntry.duplicateDetection = duplicateDetection;
                        duplicateInfo = duplicateDetection;
                    }

                    detectionCache.set(url, cacheEntry);
                    title = getTitleForOutcome(result.outcome, cacheEntry.status, isUrlMode);
                }
            }

            // Always use updateContextMenu with duplicate info
            updateContextMenu(title, enabled, duplicateInfo, isErrorSuggestion);
        },
    );
};
