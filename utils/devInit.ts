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
    const existingData = await chrome.storage.sync.get([
        'mealieServer',
        'mealieApiToken',
        'mealieGroupSlug',
    ]);

    // If we have all required data, skip initialization
    if (existingData.mealieServer && existingData.mealieApiToken && existingData.mealieGroupSlug) {
        console.log('[DevInit] Storage already populated with group slug - skipping');
        return;
    }

    // If we have credentials but missing group slug, fetch it
    if (existingData.mealieServer && existingData.mealieApiToken && !existingData.mealieGroupSlug) {
        console.log('[DevInit] Storage missing group slug - fetching user profile');
        try {
            const { getUser } = await import('./network');
            const userResult = await getUser(
                existingData.mealieServer,
                existingData.mealieApiToken,
            );

            if ('username' in userResult) {
                await chrome.storage.sync.set({
                    mealieUsername: userResult.username,
                    mealieGroupSlug: userResult.group,
                });
                console.log('[DevInit] Added group slug to storage:', userResult.group);
            }
        } catch (error) {
            console.error('[DevInit] Error fetching group slug:', error);
        }
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

    // Fetch user profile to get group slug
    try {
        const { getUser } = await import('./network');
        const userResult = await getUser(server, token);

        if ('username' in userResult) {
            // Populate storage with credentials and group slug
            const storageData: Record<string, string> = {
                mealieServer: server,
                mealieApiToken: token,
                mealieUsername: userResult.username,
                mealieGroupSlug: userResult.group,
            };

            // Write to chrome.storage.sync
            await chrome.storage.sync.set(storageData);

            console.log('[DevInit] Storage pre-populated successfully with group slug:', {
                username: userResult.username,
                group: userResult.group,
            });
        } else {
            console.warn('[DevInit] Failed to fetch user profile:', userResult.errorMessage);
            // Fall back to setting credentials without group slug
            const storageData: Record<string, string> = {
                mealieServer: server,
                mealieApiToken: token,
            };

            if (username) {
                storageData.mealieUsername = username;
            }

            await chrome.storage.sync.set(storageData);
            console.log('[DevInit] Storage pre-populated (without group slug)');
        }
    } catch (error) {
        console.error('[DevInit] Error during initialization:', error);
    }
}
