export type CreateRecipeResult = 'success' | 'failure';

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
): Promise<CreateRecipeResult> {
    try {
        const fetchUrl = new URL('/api/recipes/create/url', server).href;
        const response = (await fetch(fetchUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
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
): Promise<CreateRecipeResult> {
    try {
        const fetchUrl = new URL('/api/recipes/create/html-or-json', server).href;
        const response = (await fetch(fetchUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ includeTags: false, data: html, url: sourceUrl }),
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
    | { outcome: 'recipe' }
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
            return data?.name ? { outcome: 'recipe' } : { outcome: 'not-recipe' };
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
