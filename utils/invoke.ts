import { beginActivity, endActivity } from './activity';
import { logEvent, sanitizeUrl } from './logging';
import { isRecipeCreateMode, RecipeCreateMode } from './types/storageTypes';

export function runCreateRecipe(tab: chrome.tabs.Tab) {
    chrome.storage.sync.get<StorageData>(
        [...storageKeys],
        async ({ mealieServer, mealieApiToken, recipeCreateMode }) => {
            if (!mealieServer || !mealieApiToken) {
                logEvent({
                    level: 'warn',
                    feature: 'recipe-create',
                    action: 'runCreateRecipe',
                    phase: 'failure',
                    message: 'Missing server or token',
                });
                showBadge('❌', 4);
                return;
            }

            const mode = isRecipeCreateMode(recipeCreateMode)
                ? recipeCreateMode
                : RecipeCreateMode.URL;

            // Check if we should suggest HTML mode instead of creating
            if (mode === RecipeCreateMode.URL && tab.url) {
                const cached = detectionCache.get(tab.url);
                if (cached && cached.outcome !== 'recipe') {
                    // Detection failed - suggest HTML mode via popup
                    logEvent({
                        level: 'info',
                        feature: 'recipe-create',
                        action: 'suggestHtmlMode',
                        phase: 'start',
                        message: 'Opening popup to suggest HTML mode',
                        data: { url: sanitizeUrl(tab.url) },
                    });

                    chrome.storage.local.set({ suggestHtmlMode: true });
                    chrome.action.openPopup();
                    return;
                }
            }

            switch (mode) {
                case RecipeCreateMode.URL: {
                    if (!tab.url) {
                        logEvent({
                            level: 'warn',
                            feature: 'recipe-create',
                            action: 'createFromUrl',
                            phase: 'failure',
                            message: 'No tab URL available',
                        });
                        showBadge('❌', 4);
                        return;
                    }

                    await beginActivity('Creating recipe (URL)');
                    logEvent({
                        level: 'info',
                        feature: 'recipe-create',
                        action: 'createFromUrl',
                        phase: 'start',
                        message: 'Creating recipe from URL',
                        data: { url: sanitizeUrl(tab.url) },
                    });

                    const result = await createRecipeFromURL(tab.url, mealieServer, mealieApiToken);
                    const success = result === 'success';

                    logEvent({
                        level: success ? 'info' : 'warn',
                        feature: 'recipe-create',
                        action: 'createFromUrl',
                        phase: success ? 'success' : 'failure',
                        message: success
                            ? 'Recipe created from URL'
                            : 'Failed to create recipe from URL',
                        data: { url: sanitizeUrl(tab.url) },
                    });

                    await endActivity(
                        success ? '✅' : '❌',
                        success ? 'Recipe created successfully' : 'Recipe creation failed',
                    );
                    return;
                }

                case RecipeCreateMode.HTML: {
                    if (tab.id == null) {
                        logEvent({
                            level: 'warn',
                            feature: 'recipe-create',
                            action: 'createFromHtml',
                            phase: 'failure',
                            message: 'No tab ID available',
                        });
                        showBadge('❌', 4);
                        return;
                    }

                    await beginActivity('Creating recipe (HTML)');
                    logEvent({
                        level: 'info',
                        feature: 'html-capture',
                        action: 'getPageHTML',
                        phase: 'start',
                        message: 'Capturing page HTML',
                        data: { url: tab.url ? sanitizeUrl(tab.url) : undefined },
                    });

                    const html = await getPageHTML(tab.id);
                    if (!html) {
                        logEvent({
                            level: 'warn',
                            feature: 'html-capture',
                            action: 'getPageHTML',
                            phase: 'failure',
                            message: 'Failed to capture page HTML',
                        });
                        await endActivity('❌', 'Failed to capture page HTML');
                        return;
                    }

                    logEvent({
                        level: 'info',
                        feature: 'html-capture',
                        action: 'getPageHTML',
                        phase: 'success',
                        message: 'Page HTML captured',
                        data: { htmlLength: html.length },
                    });

                    logEvent({
                        level: 'info',
                        feature: 'recipe-create',
                        action: 'createFromHtml',
                        phase: 'start',
                        message: 'Creating recipe from HTML',
                        data: { url: tab.url ? sanitizeUrl(tab.url) : undefined },
                    });

                    const result = await createRecipeFromHTML(
                        html,
                        mealieServer,
                        mealieApiToken,
                        tab.url,
                    );
                    const success = result === 'success';

                    logEvent({
                        level: success ? 'info' : 'warn',
                        feature: 'recipe-create',
                        action: 'createFromHtml',
                        phase: success ? 'success' : 'failure',
                        message: success
                            ? 'Recipe created from HTML'
                            : 'Failed to create recipe from HTML',
                        data: { url: tab.url ? sanitizeUrl(tab.url) : undefined },
                    });

                    await endActivity(
                        success ? '✅' : '❌',
                        success ? 'Recipe created successfully' : 'Recipe creation failed',
                    );
                    return;
                }
            }
        },
    );
}

async function getPageHTML(tabId: number) {
    try {
        const results = await chrome.scripting.executeScript<[], string>({
            target: { tabId },
            func: () => document.documentElement.outerHTML,
        });

        const html = results[0]?.result;
        return typeof html === 'string' ? html : null;
    } catch {
        return null;
    }
}
