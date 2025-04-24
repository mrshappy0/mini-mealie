export const runCreateRecipe = (url: string, tabId: number) => {
    chrome.storage.sync.get<StorageData>(
        [...storageKeys],
        ({ mealieServer, mealieApiToken, ladderEnabled }: StorageData) => {
            console.log(ladderEnabled);
            if (!mealieServer || !mealieApiToken) {
                showBadge('❌', 4);
                return;
            }

            const scriptParams = {
                target: { tabId },
                func: createRecipe,
                args: [url, mealieServer, mealieApiToken, ladderEnabled] as [
                    string,
                    string,
                    string,
                    boolean,
                ],
            };
            console.log('hoitjhoiwe: ', ladderEnabled, typeof ladderEnabled);
            chrome.scripting.executeScript(scriptParams, (result) => {
                console.log('result', result);
                showBadge(result[0].result === 'success' ? '✅' : '❌', 4);
            });
        },
    );
};

async function createRecipe(
    url: string,
    server: string,
    token: string,
    ladderEnabled: boolean,
): Promise<string> {
    const ladderUrl = 'https://13ft.wasimaster.me';
    const finalUrl = ladderEnabled ? `${ladderUrl}/${url}` : url;
    try {
        const response = await fetch(`${server}/api/recipes/create/url`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: finalUrl }),
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

export const getUser = async (
    url: string,
    token: string,
): Promise<User | { errorMessage: string }> => {
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
        return await res.json();
    } catch (error) {
        if (error instanceof Error) {
            return { errorMessage: error.message };
        }
        return { errorMessage: 'Unknown error occurred' };
    }
};
