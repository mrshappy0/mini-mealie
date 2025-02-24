import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
    extensionApi: "chrome",
    modules: ["@wxt-dev/module-react"],
    manifest: {
        permissions: [
            "storage",
            "tabs",
            "activeTab",
            "storage",
            "contextMenus",
            "notifications"
        ],
        description: "Scrape recipes and save them to a Mealie instance.",
    },
});
