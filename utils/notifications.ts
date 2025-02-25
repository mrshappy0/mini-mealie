export const createNotification = (message: string) => {
    console.log("hit message:", message)
    chrome.notifications.create({
        type: "basic",
        iconUrl: "icon/128.png",
        title: "Mealie Recipe Scraper",
        message: message,
    });
};
