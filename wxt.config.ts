import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
    // extensionApi: 'chrome',
    modules: ['@wxt-dev/module-react'],
    manifest: {
        permissions: ['storage', 'activeTab', 'contextMenus', 'scripting'],
        description: 'Scrape recipes and save them to a Mealie instance.',
        name: 'Mini Mealie',
    },
    // https://wxt.dev/guide/essentials/config/auto-imports.html
    imports: {
        eslintrc: {
            enabled: 9,
        },
    },
});
