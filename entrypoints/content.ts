export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    console.log("Content script active.");

    // Listen for a message from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "getCurrentUrl") {
        const url = window.location.href;
        console.log("Captured URL:", url);

        // Send the URL back to the background script
        sendResponse({ url });
      }
    });
  },
});