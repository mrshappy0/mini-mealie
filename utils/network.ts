import normalizeUrlLib from 'normalize-url';

export type CreateRecipeResult = 'success' | 'failure';

/**
 * Normalize a URL for duplicate detection matching.
 * Removes tracking parameters, www prefix, trailing slashes, and fragments.
 * Uses the normalize-url library for comprehensive and secure URL normalization.
 */
export function normalizeUrl(url: string): string {
    try {
        // First validate it's a proper URL with protocol
        // normalize-url will happily add http:// to invalid URLs
        new URL(url);

        return normalizeUrlLib(url, {
            stripHash: true,
            stripWWW: true,
            removeQueryParameters: [
                // UTM parameters
                'utm_source',
                'utm_medium',
                'utm_campaign',
                'utm_term',
                'utm_content',
                'utm_id',
                'utm_source_platform',
                'utm_creative_format',
                'utm_marketing_tactic',
                // Click tracking
                'fbclid',
                'gclid',
                'msclkid',
                'dclid',
                // Analytics
                '_ga',
                '_gl',
                '_ke',
                'mc_cid',
                'mc_eid',
                // Social media
                'igshid',
                'twclid',
                // Email tracking
                'mkt_tok',
                // Misc tracking
                'ref',
                'referrer',
            ],
            removeTrailingSlash: true,
            removeSingleSlash: false,
            sortQueryParameters: true,
        });
    } catch {
        // If URL parsing fails, return the original URL
        return url;
    }
}

type FetchLikeResponse = {
    ok: boolean;
    status: number;
    statusText?: string;
    headers?: { get?: (name: string) => string | null };
    text?: () => Promise<string>;
    json?: () => Promise<unknown>;
};

async function safeReadResponseText(res: FetchLikeResponse): Promise<string> {
    if (typeof res.text === 'function') {
        try {
            return await res.text();
        } catch {
            // fall through
        }
    }

    if (typeof res.json === 'function') {
        try {
            const data = await res.json();
            return typeof data === 'string' ? data : JSON.stringify(data);
        } catch {
            // fall through
        }
    }

    return '';
}

function getContentType(res: FetchLikeResponse): string {
    const contentType = res.headers?.get?.('content-type');
    return contentType ?? '';
}

function formatErrorDetails(responseText: string, contentType: string): string {
    if (!responseText) return '';
    if (!contentType.includes('application/json')) return responseText;

    try {
        return JSON.stringify(JSON.parse(responseText), null, 2);
    } catch {
        return responseText;
    }
}

export async function createRecipeFromURL(
    url: string,
    server: string,
    token: string,
    includeTags = false,
    includeCategories = false,
): Promise<CreateRecipeResult> {
    try {
        const fetchUrl = new URL('/api/recipes/create/url', server).href;
        const response = (await fetch(fetchUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url, includeTags, includeCategories }),
        })) as FetchLikeResponse;
        if (!response.ok) {
            const responseText = await safeReadResponseText(response);
            const contentType = getContentType(response);
            const details = formatErrorDetails(responseText, contentType);

            throw new Error(
                `HTTP error ${response.status} ${response.statusText ?? ''} for POST ${fetchUrl}${details ? `\n${details}` : ''}`,
            );
        }

        if (typeof response.json === 'function') {
            await response.json();
        }
        return 'success';
    } catch (error) {
        console.error('Error scraping recipe (URL mode):', error);
        return 'failure';
    }
}

export async function createRecipeFromHTML(
    html: string,
    server: string,
    token: string,
    sourceUrl?: string,
    includeTags = false,
    includeCategories = false,
): Promise<CreateRecipeResult> {
    try {
        const fetchUrl = new URL('/api/recipes/create/html-or-json', server).href;
        const response = (await fetch(fetchUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: html, url: sourceUrl, includeTags, includeCategories }),
        })) as FetchLikeResponse;
        if (!response.ok) {
            const responseText = await safeReadResponseText(response);
            const contentType = getContentType(response);
            const details = formatErrorDetails(responseText, contentType);

            throw new Error(
                `HTTP error ${response.status} ${response.statusText ?? ''} for POST ${fetchUrl}${details ? `\n${details}` : ''}`,
            );
        }

        if (typeof response.json === 'function') {
            await response.json();
        }
        return 'success';
    } catch (error) {
        console.error('Error scraping recipe (HTML mode):', error);
        return 'failure';
    }
}

export const getUser = async (
    url: string,
    token: string,
): Promise<User | { errorMessage: string }> => {
    const { logEvent, sanitizeUrl } = await import('./logging');

    await logEvent({
        level: 'info',
        feature: 'auth',
        action: 'getUser',
        phase: 'start',
        message: 'Fetching user profile',
        data: { server: sanitizeUrl(url) },
    });

    try {
        const res = await fetch(`${url}/api/users/self`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        if (!res.ok) {
            throw new Error(`Get User Failed - status: ${res.status}`);
        }
        const user = await res.json();

        await logEvent({
            level: 'info',
            feature: 'auth',
            action: 'getUser',
            phase: 'success',
            message: 'User profile fetched',
            data: { server: sanitizeUrl(url), username: user.username },
        });

        return user;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        await logEvent({
            level: 'error',
            feature: 'auth',
            action: 'getUser',
            phase: 'failure',
            message: `Failed to fetch user: ${errorMessage}`,
            data: { server: sanitizeUrl(url) },
        });

        if (error instanceof Error) {
            return { errorMessage: error.message };
        }
        return { errorMessage: 'Unknown error occurred' };
    }
};

export const testScrapeUrl = async (
    url: string,
    server: string,
    token: string,
): Promise<boolean> => {
    const result = await testScrapeUrlDetailed(url, server, token);
    return result.outcome === 'recipe';
};

export type TestScrapeUrlDetailedResult =
    | { outcome: 'recipe'; recipeName?: string }
    | { outcome: 'not-recipe' }
    | { outcome: 'timeout'; timeoutMs: number }
    | { outcome: 'http-error'; status: number; details?: string }
    | { outcome: 'error'; message: string };

export const testScrapeUrlDetailed = async (
    url: string,
    server: string,
    token: string,
    options?: { timeoutMs?: number },
): Promise<TestScrapeUrlDetailedResult> => {
    const timeoutMs = options?.timeoutMs ?? 4500;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = (await fetch(`${server}/api/recipes/test-scrape-url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ url }),
            signal: controller.signal,
        })) as FetchLikeResponse;

        const contentType = getContentType(res);
        const responseText = await safeReadResponseText(res);

        if (!res.ok) {
            const details = formatErrorDetails(responseText, contentType) || undefined;

            return { outcome: 'http-error', status: res.status, details };
        }

        if (!responseText) return { outcome: 'not-recipe' };

        // If we got JSON already from safeReadResponseText, responseText may be stringified JSON.
        try {
            const data = JSON.parse(responseText) as { name?: unknown };
            if (data?.name && typeof data.name === 'string') {
                return { outcome: 'recipe', recipeName: data.name };
            }
            return { outcome: 'not-recipe' };
        } catch {
            // Non-JSON response; treat as "not-recipe" rather than error.
            return { outcome: 'not-recipe' };
        }
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            return { outcome: 'timeout', timeoutMs };
        }

        if (error instanceof Error) {
            return { outcome: 'error', message: error.message };
        }

        return { outcome: 'error', message: 'Unknown error' };
    } finally {
        clearTimeout(timeoutId);
    }
};

/**
 * Find a recipe by exact orgURL match.
 * Returns null if no match found or on error.
 *
 * Note: Mealie stores orgURL as-is (with www, trailing slashes, etc).
 * We fetch recent recipes and normalize both sides for comparison.
 */
export async function findRecipeByURL(
    url: string,
    server: string,
    token: string,
): Promise<RecipeSummary | null> {
    const { logEvent, sanitizeUrl } = await import('./logging');

    try {
        const normalizedUrl = normalizeUrl(url);

        // Fetch recent recipes (more likely to match) and filter client-side
        // This works around Mealie's exact string matching in queryFilter
        const apiUrl = new URL('/api/recipes', server);
        apiUrl.searchParams.set('perPage', '100'); // Fetch more to increase match chance
        apiUrl.searchParams.set('orderBy', 'dateUpdated');
        apiUrl.searchParams.set('orderDirection', 'desc');

        const res = (await fetch(apiUrl.href, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        })) as FetchLikeResponse;

        if (!res.ok) {
            await logEvent({
                level: 'warn',
                feature: 'duplicate-detect',
                action: 'findByUrl',
                phase: 'failure',
                message: `Failed to query recipes by URL (HTTP ${res.status})`,
                data: { url: sanitizeUrl(url) },
            });
            return null;
        }

        const responseText = await safeReadResponseText(res);
        const data = JSON.parse(responseText) as { items?: RecipeSummary[] };

        // Filter recipes client-side by normalizing both URLs
        const recipes = data.items ?? [];
        for (const recipe of recipes) {
            if (!recipe.orgURL) continue;

            const recipeNormalizedUrl = normalizeUrl(recipe.orgURL);

            if (recipeNormalizedUrl === normalizedUrl) {
                await logEvent({
                    level: 'info',
                    feature: 'duplicate-detect',
                    action: 'findByUrl',
                    phase: 'success',
                    message: 'Found exact URL match',
                    data: {
                        url: sanitizeUrl(url),
                        recipeName: recipe.name,
                        recipeSlug: recipe.slug,
                    },
                });
                return recipe;
            }
        }

        await logEvent({
            level: 'info',
            feature: 'duplicate-detect',
            action: 'findByUrl',
            phase: 'success',
            message: 'No URL match found',
            data: { url: sanitizeUrl(url) },
        });
        return null;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await logEvent({
            level: 'error',
            feature: 'duplicate-detect',
            action: 'findByUrl',
            phase: 'failure',
            message: `Error searching for recipe by URL: ${errorMessage}`,
            data: { url: sanitizeUrl(url) },
        });
        return null;
    }
}

/**
 * Search for recipes by name (fuzzy match).
 * Returns top 5 matches sorted by relevance.
 * Returns empty array on error.
 */
export async function searchRecipesByName(
    name: string,
    server: string,
    token: string,
): Promise<RecipeSummary[]> {
    const { logEvent } = await import('./logging');

    try {
        // Construct the API query with search parameter
        const apiUrl = new URL('/api/recipes', server);
        apiUrl.searchParams.set('search', name);
        apiUrl.searchParams.set('perPage', '5');

        const res = (await fetch(apiUrl.href, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        })) as FetchLikeResponse;

        if (!res.ok) {
            await logEvent({
                level: 'warn',
                feature: 'duplicate-detect',
                action: 'searchByName',
                phase: 'failure',
                message: `Failed to search recipes by name (HTTP ${res.status})`,
                data: { recipeName: name },
            });
            return [];
        }

        const responseText = await safeReadResponseText(res);
        const data = JSON.parse(responseText) as { items?: RecipeSummary[] };

        const matches = data.items ?? [];

        await logEvent({
            level: 'info',
            feature: 'duplicate-detect',
            action: 'searchByName',
            phase: 'success',
            message: `Found ${matches.length} similar recipes`,
            data: { recipeName: name, matchCount: matches.length },
        });

        return matches;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await logEvent({
            level: 'error',
            feature: 'duplicate-detect',
            action: 'searchByName',
            phase: 'failure',
            message: `Error searching recipes by name: ${errorMessage}`,
            data: { recipeName: name },
        });
        return [];
    }
}
