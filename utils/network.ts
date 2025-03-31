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

export const verifyConnection = (url: string, tabId: number) => {
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
                    func: async (url, token) => {
                        try {
                            const verificationResponse = await fetch(`${url}/api/users/self`, {
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                    'Content-Type': 'application/json',
                                },
                            });
                            if (!verificationResponse.ok) {
                                throw new Error(
                                    `Verification failed! status: ${verificationResponse.status}`,
                                );
                            }
                            const verificationData = await verificationResponse.json();
                            const username = verificationData.username;

                            return username;
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        } catch (error) {
                            //Do we want the username to be "Not signed in" or something like that?
                            return { username: null };
                        }
                    },
                    args: [url, mealieApiToken],
                },
                (result) => {
                    const username = result[0].result;
                    // Not sure the issue for below
                    if (username) {
                        showBadge(`✅ ${username}`, 4);
                    } else {
                        // Should below have an username not signed in or a additional option for x plus not signed in.
                        showBadge('❌', 4);
                    }
                },
            );
        },
    );
};
