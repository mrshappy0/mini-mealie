export const scrapeRecipe = (url: string, tabId: number) => {
    chrome.storage.sync.get(
        ['mealieServer', 'mealieApiToken'],
        ({ mealieServer, mealieApiToken }) => {
            if (!mealieServer) {
                showBadge('❌', 4);
                return;
            }

            if (!mealieApiToken) {
                showBadge('❌', 4);
                return;
            }
            chrome.scripting.executeScript(
                {
                    target: { tabId },
                    func: async (url, server, token) => {
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
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        } catch (error) {
                            return 'failure';
                        }
                    },
                    args: [url, mealieServer, mealieApiToken],
                },
                (result) => {
                    const status = result[0].result;
                    if (status === 'success') {
                        showBadge('✅', 4);
                    } else {
                        showBadge('❌', 4);
                    }
                },
            );
        },
    );
};

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
