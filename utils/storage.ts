import { logEvent } from './logging';

const DETECTION_CACHE_TTL_MS = 30_000;
const DETECTION_CACHE_MAX_SIZE = 100;

/**
 * Browser protocols that prevent content script injection.
 * Used to skip pages where the extension cannot function.
 */
export const RESTRICTED_PROTOCOLS = [
    'chrome:',
    'chrome-extension:',
    'chrome-untrusted:',
    'moz-extension:',
    'about:',
    'data:',
    'file:',
];

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
 * Invalidate the detection cache for a specific URL.
 * Used after recipe creation to ensure duplicate detection reflects the new state.
 * @param url - The URL to invalidate
 */
export function invalidateDetectionCacheForUrl(url: string) {
    detectionCache.delete(url);
}

/**
 * Check if a URL uses a restricted protocol that prevents script injection.
 * Returns true for chrome://, chrome-extension://, moz-extension://, about:, data:, file:, etc.
 * @param url - The URL to check
 * @returns true if the URL is restricted, false otherwise
 */
export function isRestrictedUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return RESTRICTED_PROTOCOLS.includes(urlObj.protocol);
    } catch {
        // Invalid URL - treat as restricted
        return true;
    }
}

/**
 * Disable all menus and clear the badge.
 * Used when on restricted pages or when extension is not configured.
 */
function disableAllMenus(): void {
    showBadge('');
    removeContextMenu();
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

/**
 * Result from processing recipe detection (cached or fresh).
 */
type DetectionProcessingResult = {
    title: string;
    isErrorSuggestion: boolean;
    duplicateInfo: DuplicateDetectionResult;
};

/**
 * Process cached detection result and return menu state.
 * Updates cache timestamp for LRU behavior.
 */
function processCachedDetection(
    cached: CachedDetection,
    isUrlMode: boolean,
): DetectionProcessingResult {
    // Update timestamp for true LRU behavior
    cached.checkedAt = Date.now();

    const title = getTitleForOutcome(cached.outcome, cached.status, isUrlMode);
    const isErrorSuggestion = cached.outcome !== 'recipe';

    // Use cached duplicate detection if available and recipe was detected
    let duplicateInfo: DuplicateDetectionResult = {};
    if (cached.outcome === 'recipe' && cached.duplicateDetection) {
        duplicateInfo = cached.duplicateDetection;
    }

    return { title, isErrorSuggestion, duplicateInfo };
}

/**
 * Perform fresh recipe detection, duplicate checking, and cache the results.
 * Returns null if the operation was cancelled (due to a newer check starting).
 */
async function processFreshDetection(
    url: string,
    now: number,
    checkId: number,
    mealieServer: string,
    mealieApiToken: string,
    isUrlMode: boolean,
): Promise<DetectionProcessingResult | null> {
    const result = await testScrapeUrlDetailed(url, mealieServer, mealieApiToken);
    if (checkId !== lastCheckId) return null;

    await logDetectionResult(result, url);

    // Cache the outcome and generate title based on current mode
    const cacheEntry: CachedDetection = {
        checkedAt: now,
        outcome: result.outcome,
    };
    if (result.outcome === 'http-error') {
        cacheEntry.status = result.status;
    }

    let isErrorSuggestion = true;
    let duplicateInfo: DuplicateDetectionResult = {};

    // Only check for duplicates if recipe was detected (in URL mode)
    if (result.outcome === 'recipe') {
        isErrorSuggestion = false;
        // Store recipe name if available
        if (result.recipeName) {
            cacheEntry.recipeName = result.recipeName;
        }
        // Show menu immediately after scrape — duplicate checks use unbounded Mealie fetches and
        // previously blocked updateContextMenu until they finished (often forever if Mealie hung).
        if (checkId === lastCheckId) {
            const interimTitle = getTitleForOutcome(result.outcome, cacheEntry.status, isUrlMode);
            updateContextMenu(interimTitle, true, {}, false);
        }
        // Check for duplicates
        const duplicateDetection = await checkForDuplicates(
            url,
            result.recipeName,
            mealieServer,
            mealieApiToken,
        );
        if (checkId !== lastCheckId) return null;
        cacheEntry.duplicateDetection = duplicateDetection;
        duplicateInfo = duplicateDetection;
    }

    detectionCache.set(url, cacheEntry);
    const title = getTitleForOutcome(result.outcome, cacheEntry.status, isUrlMode);

    return { title, isErrorSuggestion, duplicateInfo };
}

/**
 * Log the detection result based on the outcome.
 * @param result - The detailed scrape result
 * @param url - The URL that was tested
 */
async function logDetectionResult(
    result: Awaited<ReturnType<typeof testScrapeUrlDetailed>>,
    url: string,
): Promise<void> {
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
}

const MEALIE_CREDENTIAL_LOCAL_KEYS = ['mealieServer', 'mealieApiToken', 'mealieUsername'] as const;

/** Persist Mealie credentials to storage.local (Firefox/temporary profiles can lose sync-only writes). */
export function mirrorMealieCredentialsToLocal(creds: {
    mealieServer: string;
    mealieApiToken: string;
    mealieUsername?: string;
}): void {
    chrome.storage.local.set(
        {
            mealieServer: creds.mealieServer,
            mealieApiToken: creds.mealieApiToken,
            mealieUsername: creds.mealieUsername ?? '',
        },
        () => void chrome.runtime.lastError,
    );
}

export function clearMealieCredentialsLocal(): void {
    chrome.storage.local.remove(
        [...MEALIE_CREDENTIAL_LOCAL_KEYS],
        () => void chrome.runtime.lastError,
    );
}

/**
 * When sync is missing credentials, merge from storage.local and back-fill sync.
 * Used by popup hydration and badge/menu refresh (Firefox-friendly).
 */
export function mergeMealieCredentialsFromLocalIfNeeded(
    syncData: StorageData,
    onMerged: (data: StorageData) => void,
): void {
    if (syncData.mealieServer && syncData.mealieApiToken) {
        onMerged(syncData);
        return;
    }

    chrome.storage.local.get([...MEALIE_CREDENTIAL_LOCAL_KEYS], (local: Partial<StorageData>) => {
        void chrome.runtime.lastError;

        const merged: StorageData = {
            ...syncData,
            mealieServer: syncData.mealieServer ?? local.mealieServer,
            mealieApiToken: syncData.mealieApiToken ?? local.mealieApiToken,
            mealieUsername: syncData.mealieUsername ?? local.mealieUsername,
        };

        if (
            merged.mealieServer &&
            merged.mealieApiToken &&
            (!syncData.mealieServer || !syncData.mealieApiToken)
        ) {
            chrome.storage.sync.set(
                {
                    mealieServer: merged.mealieServer,
                    mealieApiToken: merged.mealieApiToken,
                    mealieUsername: merged.mealieUsername,
                },
                () => void chrome.runtime.lastError,
            );
        }

        onMerged(merged);
    });
}

/** Always persisted to Activity Logs — root-cause signal when only `auth/getUser` appears from the popup. */
const BADGE_MENU_LOG_SCHEMA = 2;

function recordBadgeMenuRefresh(summary: Record<string, unknown>): void {
    const outcome = typeof summary.outcome === 'string' ? summary.outcome : 'badgeMenuRefresh';
    void Promise.resolve(
        logEvent({
            level: 'info',
            feature: 'recipe-detect',
            action: 'badgeMenuRefresh',
            phase: 'success',
            message: outcome,
            data: { ...summary, schema: BADGE_MENU_LOG_SCHEMA },
        }),
    ).catch(() => undefined);
}

async function runStorageCheckAfterMerge(checkId: number, data: StorageData): Promise<void> {
    const { mealieServer, mealieApiToken, recipeCreateMode } = data;
    if (checkId !== lastCheckId) return;

    if (!mealieServer || !mealieApiToken) {
        showBadge('❌');
        removeContextMenu();
        recordBadgeMenuRefresh({
            outcome: 'skipped_no_credentials',
            srv: Boolean(mealieServer),
            tok: Boolean(mealieApiToken),
        });
        return;
    }

    let tabsResult: chrome.tabs.Tab[];
    try {
        tabsResult = await new Promise<chrome.tabs.Tab[]>((resolve) => {
            const result = chrome.tabs.query(
                { active: true, lastFocusedWindow: true },
                resolve,
            ) as unknown;
            if (result instanceof Promise) void result.then(resolve);
        });
    } catch (err) {
        recordBadgeMenuRefresh({
            outcome: 'tabs_query_rejected',
            error: err instanceof Error ? err.message : String(err),
        });
        return;
    }
    if (checkId !== lastCheckId) return;

    const [tab] = tabsResult;
    const { url } = tab ?? {};
    const mode = isRecipeCreateMode(recipeCreateMode) ? recipeCreateMode : RecipeCreateMode.URL;
    const isUrlMode = mode === RecipeCreateMode.URL;

    // Skip internal browser and extension pages (applies to both URL and HTML modes)
    // Script injection fails on these pages due to browser security restrictions
    if (url && isRestrictedUrl(url)) {
        disableAllMenus();
        recordBadgeMenuRefresh({
            outcome: 'skipped_restricted_tab',
            url: sanitizeUrl(url),
            recipeCreateMode: mode,
            tabsReturned: tabsResult.length,
        });
        return;
    }

    // In HTML mode, always show static title and enable
    // No detection or duplicate checking needed
    if (!isUrlMode) {
        updateContextMenu('Create Recipe from HTML', true, {}, false);
        recordBadgeMenuRefresh({
            outcome: 'html_mode_static_menu',
            tabsReturned: tabsResult.length,
            activeTabId: tab?.id,
            hadTabUrl: Boolean(url),
        });
        return;
    }

    // From here on, we're in URL mode only
    let title = 'No Recipe - Switch to HTML Mode';
    const enabled = true; // Always enabled
    let isErrorSuggestion = true; // Default to error state
    let duplicateInfo: DuplicateDetectionResult = {};

    if (url) {
        pruneDetectionCache();

        const cached = detectionCache.get(url);
        const now = Date.now();

        let detectionResult: DetectionProcessingResult | null;

        if (cached && now - cached.checkedAt < DETECTION_CACHE_TTL_MS) {
            detectionResult = processCachedDetection(cached, isUrlMode);
        } else {
            detectionResult = await processFreshDetection(
                url,
                now,
                checkId,
                mealieServer,
                mealieApiToken,
                isUrlMode,
            );
            if (!detectionResult) {
                recordBadgeMenuRefresh({
                    outcome: 'skipped_detection_superseded',
                    hadTabUrl: Boolean(url),
                    tabUrlHint: url ? sanitizeUrl(url) : undefined,
                    tabsReturned: tabsResult.length,
                });
                return;
            }
        }

        title = detectionResult.title;
        isErrorSuggestion = detectionResult.isErrorSuggestion;
        duplicateInfo = detectionResult.duplicateInfo;
    }

    // Always use updateContextMenu with duplicate info
    updateContextMenu(title, enabled, duplicateInfo, isErrorSuggestion);
    recordBadgeMenuRefresh({
        outcome: 'menu_updated',
        recipeCreateMode: RecipeCreateMode.URL,
        menuTitle: title,
        hadTabUrl: Boolean(url),
        tabUrlHint: url ? sanitizeUrl(url) : undefined,
        tabsReturned: tabsResult.length,
        activeTabId: tab?.id,
    });
}

/**
 * Overlapping badge/menu refreshes each incremented `lastCheckId` before earlier scrapes finished,
 * so `processFreshDetection` constantly returned null (cancelled) and the context menu never appeared.
 * Serialize refreshes so only one check id is “live” during Mealie I/O.
 */
let refreshTail: Promise<void> = Promise.resolve();

/** Reset serialized refresh state between Vitest cases (module singleton). */
export function resetBadgeMenuRefreshQueueForTests(): void {
    refreshTail = Promise.resolve();
}

async function runQueuedStorageCheck(): Promise<void> {
    const checkId = ++lastCheckId;
    await new Promise<void>((resolve) => {
        chrome.storage.sync.get([...storageKeys], (syncData: StorageData) => {
            void chrome.runtime?.lastError;
            mergeMealieCredentialsFromLocalIfNeeded(syncData, (merged) => {
                recordBadgeMenuRefresh({
                    outcome: 'pipeline_job',
                    step: 'merged_credentials',
                    checkId,
                    srv: Boolean(merged.mealieServer),
                    tok: Boolean(merged.mealieApiToken),
                    mode: merged.recipeCreateMode ?? null,
                });
                void runStorageCheckAfterMerge(checkId, merged).finally(() => resolve());
            });
        });
    });
}

/** Queue a badge/context-menu refresh; resolves when this queued hop completes. */
export function checkStorageAndUpdateBadge(): Promise<void> {
    const job = refreshTail.then(() => runQueuedStorageCheck());
    refreshTail = job.catch(() => undefined);
    return job;
}
