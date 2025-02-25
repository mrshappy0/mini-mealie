export const scrapeRecipe = (url: string, tabId: number) => {
    chrome.storage.sync.get(
        ["mealieServer", "mealieApiToken"],
        ({ mealieServer, mealieApiToken }) => {
            if (!mealieServer) {
                createNotification(
                    "Please enter your Mealie server URL first."
                );
                showBadge("❌", 4);
                return;
            }

            if (!mealieApiToken) {
                createNotification("Please save your Mealie API token first.");
                showBadge("❌", 4);
                return;
            }
            chrome.scripting.executeScript(
                {
                    target: { tabId },
                    func: async (url, server, token) => {
                        try {
                            const response = await fetch(
                                `${server}/api/recipes/create/url`,
                                {
                                    method: "POST",
                                    headers: {
                                        Authorization: `Bearer ${token}`,
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({ url }),
                                }
                            );
                            if (!response.ok) {
                                throw new Error(
                                    `HTTP error! status: ${response.status}`
                                );
                            }
                            const data = await response.json();
                            return "success";
                        } catch (error) {
                            return "failure";
                        }
                    },
                    args: [url, mealieServer, mealieApiToken],
                },
                (result) => {
                    const status = result[0].result;
                    if (status === "success") {
                        createNotification("Recipe successfully scraped!");
                        showBadge("✅", 4);
                    } else {
                        createNotification("Failed to scrape recipe.");
                        showBadge("❌", 4);
                    }
                }
            );
        }
    );
};
