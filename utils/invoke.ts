export function runCreateRecipe(tab: chrome.tabs.Tab) {
    chrome.storage.sync.get<StorageData>(
        [...storageKeys],
        async ({ mealieServer, mealieApiToken }) => {
            if (!mealieServer || !mealieApiToken) {
                showBadge('❌', 4);
                return;
            }
            const html = await getPageHTML(tab.id!);
            if (!html) {
                showBadge('❌', 4);
                return;
            }
            const result = await createRecipeFromHTML(html, mealieServer, mealieApiToken);
            showBadge(result === 'success' ? '✅' : '❌', 4);
        },
    );
}
async function getPageHTML(tabId: number): Promise<string | null> {
    return new Promise((resolve) => {
        chrome.scripting.executeScript(
            {
                target: { tabId },
                func: () => document.documentElement.outerHTML,
            },
            (results) => {
                if (chrome.runtime.lastError || !results || results.length === 0) {
                    resolve(null);
                } else {
                    resolve(results[0].result as string);
                }
            },
        );
    });
}
