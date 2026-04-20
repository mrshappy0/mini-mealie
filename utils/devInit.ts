/**
 * Pre-populate extension storage from environment variables during development.
 * Only runs in dev mode when env vars are present.
 *
 * This improves developer experience by avoiding manual login on every browser restart.
 */
export async function initDevEnvironment(): Promise<void> {
    // Only run in development mode
    if (!import.meta.env.DEV) {
        return;
    }

    const server = import.meta.env.WXT_MEALIE_SERVER;
    const token = import.meta.env.WXT_MEALIE_API_TOKEN;
    const username = import.meta.env.WXT_MEALIE_USERNAME;

    // Only proceed if credentials are provided
    if (!server || !token) {
        console.log('[DevInit] No dev credentials found in .env.local - skipping pre-population');
        return;
    }

    // Check if storage already has values (don't overwrite user changes during dev)
    const existingData = await chrome.storage.sync.get(['mealieServer', 'mealieApiToken']);

    if (existingData.mealieServer && existingData.mealieApiToken) {
        console.log('[DevInit] Storage already populated - skipping');
        return;
    }

    // Validate HTTPS for production servers
    if (
        !server.startsWith('http://localhost') &&
        !server.startsWith('http://127.0.0.1') &&
        !server.startsWith('https://')
    ) {
        console.warn('[DevInit] Server URL should use HTTPS for production servers');
    }

    console.log('[DevInit] Pre-populating storage from .env.local:', {
        server,
        hasToken: !!token,
        username: username || '(not set)',
    });

    try {
        const { getUser } = await import('./network');
        const userResult = await getUser(server, token);

        if ('username' in userResult) {
            await chrome.storage.sync.set({
                mealieServer: server,
                mealieApiToken: token,
                mealieUsername: userResult.username,
            });
            console.log('[DevInit] Storage pre-populated successfully:', {
                username: userResult.username,
            });
        } else {
            console.warn('[DevInit] Failed to fetch user profile:', userResult.errorMessage);
            const storageData: Record<string, string> = {
                mealieServer: server,
                mealieApiToken: token,
            };

            if (username) {
                storageData.mealieUsername = username;
            }

            const wroteUsername = Boolean(username);
            await chrome.storage.sync.set(storageData);
            console.log(
                wroteUsername
                    ? '[DevInit] Storage pre-populated (with unverified username from .env.local)'
                    : '[DevInit] Storage pre-populated (without username)',
            );
        }
    } catch (error) {
        console.error('[DevInit] Error during initialization:', error);
    }
}
