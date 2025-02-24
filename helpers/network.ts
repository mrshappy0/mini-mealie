import { showBadge } from "./badge";
import { createNotification } from "./notifications";

export const scrapeRecipe = (url: string) => {
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

            fetch(`${mealieServer}/api/recipes/create/url`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${mealieApiToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ url }),
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(
                            `HTTP error! status: ${response.status}`
                        );
                    }
                    return response.json();
                })
                .then((data) => {
                    createNotification("Recipe successfully scraped!");
                    showBadge("✅", 4);
                })
                .catch((error) => {
                    createNotification(
                        "Failed to scrape recipe. Check the console for details."
                    );
                    showBadge("❌", 4);
                });
        }
    );
};
