export default defineBackground(() => {
    console.log("Hello backgrounds!", { id: browser.runtime.id });
    chrome.runtime.onInstalled.addListener(() => {
        chrome.contextMenus.create({
            id: "scrapeRecipe",
            title: "Scrape Recipe with Mealie",
            contexts: ["page"],
        });

        console.log("successfully added context menu item");
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === "scrapeRecipe" && tab?.id) {
            // Request the URL from the content script
            chrome.tabs.sendMessage(
                tab.id,
                { action: "getCurrentUrl" },
                (response) => {
                    if (response?.url) {
                        console.log(
                            "URL received in background:",
                            response.url
                        );
                        scrapeRecipe(response.url); // Call the function to scrape the recipe
                    } else {
                        createNotification(
                            "Failed to retrieve URL from the page."
                        );
                    }
                }
            );
        }
    });

    const scrapeRecipe = (url: string) => {
        console.log("Scraping Recipe for URL:", url);
        // Retrieve the saved API token
        chrome.storage.sync.get("mealieApiToken", (data) => {
            const apiToken = data.mealieApiToken;

            if (!apiToken) {
                createNotification("Please save your Mealie API token first.");
                return;
            }

            // Make the POST request to Mealie API
            fetch("https://mealie.shaplabs.net/api/recipes/create/url", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiToken}`,
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
                    console.log("Mealie API Response:", data);
                })
                .catch((error) => {
                    createNotification(
                        "Failed to scrape recipe. Check the console for details."
                    );
                    console.error("Error scraping recipe:", error);
                });
        });
    };

    const createNotification = (message: string) => {
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon128.png",
            title: "Mealie Recipe Scraper",
            message: message,
        });
    };
});