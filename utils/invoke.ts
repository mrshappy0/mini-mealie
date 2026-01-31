import { isRecipeCreateMode, RecipeCreateMode } from './types/storageTypes';

export function runCreateRecipe(tab: chrome.tabs.Tab) {
    chrome.storage.sync.get<StorageData>(
        [...storageKeys],
        async ({ mealieServer, mealieApiToken, recipeCreateMode }) => {
            if (!mealieServer || !mealieApiToken) {
                showBadge('❌', 4);
                return;
            }

            const mode = isRecipeCreateMode(recipeCreateMode)
                ? recipeCreateMode
                : RecipeCreateMode.URL;

            switch (mode) {
                case RecipeCreateMode.URL: {
                    if (!tab.url) {
                        showBadge('❌', 4);
                        return;
                    }

                    const result = await createRecipeFromURL(tab.url, mealieServer, mealieApiToken);
                    showBadge(result === 'success' ? '✅' : '❌', 4);
                    return;
                }

                case RecipeCreateMode.HTML: {
                    if (tab.id == null) {
                        showBadge('❌', 4);
                        return;
                    }

                    const html = await getPageHTML(tab.id);
                    if (!html) {
                        showBadge('❌', 4);
                        return;
                    }

                    const result = await createRecipeFromHTML(
                        html,
                        mealieServer,
                        mealieApiToken,
                        tab.url,
                    );
                    showBadge(result === 'success' ? '✅' : '❌', 4);
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
