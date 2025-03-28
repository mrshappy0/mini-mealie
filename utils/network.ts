export const scrapeRecipe = (url: string, tabId: number) => {
    chrome.storage.sync.get(
        ['mealieServer', 'mealieApiToken'],
        ({ mealieServer, mealieApiToken }: StorageData) => {
            if (!mealieServer || !mealieApiToken) {
                showBadge('❌', 4);
                return;
            }

            const scriptParams = {
                target: { tabId },
                func: scrapeRecipeFromUrl,
                args: [url, mealieServer, mealieApiToken] as [string, string, string],
            };

            chrome.scripting.executeScript(scriptParams, (result) => {
                showBadge(result[0].result === 'success' ? '✅' : '❌', 4);
            });
        },
    );
};

async function scrapeRecipeFromUrl(url: string, server: string, token: string): Promise<string> {
    try {
        const response = await fetch(`${server}/api/recipes/create/url`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Process the response if necessary
        await response.json();
        return 'success';
    } catch (error) {
        console.error('Error scraping recipe:', error);
        return 'failure';
    }
}
