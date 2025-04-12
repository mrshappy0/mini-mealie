export const runCreateRecipe = (url: string, tabId: number) => {
    chrome.storage.sync.get(
        ['mealieServer', 'mealieApiToken'],
        ({ mealieServer, mealieApiToken }: StorageData) => {
            if (!mealieServer || !mealieApiToken) {
                showBadge('❌', 4);
                return;
            }

            const scriptParams = {
                target: { tabId },
                func: createRecipe,
                args: [url, mealieServer, mealieApiToken] as [string, string, string],
            };

            chrome.scripting.executeScript(scriptParams, (result) => {
                showBadge(result[0].result === 'success' ? '✅' : '❌', 4);
            });
        },
    );
};

async function createRecipe(url: string, server: string, token: string): Promise<string> {
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

        await response.json();
        return 'success';
    } catch (error) {
        console.error('Error scraping recipe:', error);
        return 'failure';
    }
}

export const getUser = async (url: string, token: string) => {
    try {
        const verificationResponse = await fetch(`${url}/api/users/self`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        if (!verificationResponse.ok) {
            throw new Error(`Verification failed! status: ${verificationResponse.status}`);
        }
        const { username } = await verificationResponse.json();
        return { username: username };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        return { errorMessage: error.message };
    }
};
