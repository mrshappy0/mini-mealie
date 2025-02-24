export default defineContentScript({
  matches: ["<all_urls>"],
  main() {

    // Listen for a message from the background script
    chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
      if (message.action === "getCurrentUrl") {
        const url = window.location.href;

        // Send the URL back to the background script
        sendResponse({ url });
      }
    });
  },
});