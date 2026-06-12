import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: ['@wxt-dev/module-react'],
    manifest: ({ browser }) => ({
        permissions: ['storage', 'activeTab', 'contextMenus', 'scripting'],
        host_permissions: ['<all_urls>'],
        description: 'Scrape recipes and save them to a Mealie instance.',
        name: 'Mini Mealie',
        ...(browser === 'firefox'
            ? {
                  browser_specific_settings: {
                      gecko: {
                          // Required for chrome.storage.sync / browser.storage.sync under temporary
                          // loads (about:debugging). Without an explicit ID, Firefox disables sync storage.
                          id: 'mini-mealie@shaplabs.net',
                          strict_min_version: '109.0',
                          // Mozilla AMO policy (effective 2025-11-03): every new add-on must
                          // declare what data leaves the browser. This extension sends the
                          // user-supplied Mealie API token (authenticationInfo) and the active
                          // recipe page HTML (websiteContent) to the Mealie server the user
                          // configures. No data goes to the extension author or any third party.
                          data_collection_permissions: {
                              required: ['authenticationInfo', 'websiteContent'],
                          },
                      },
                  },
              }
            : {}),
    }),
    // https://wxt.dev/guide/essentials/config/auto-imports.html
    imports: {
        eslintrc: { enabled: 9 },
    },
    hooks: {
        // Chrome creates a `_metadata/` folder inside the extension output directory after
        // loading an unpacked extension. On the next build/reload Chrome then refuses to
        // load the extension with "Filenames starting with '_' are reserved for use by the
        // system." Deleting it after each build keeps the directory clean for Chrome.
        'build:done': async (wxt) => {
            await rm(join(wxt.config.outDir, '_metadata'), { recursive: true, force: true });
        },
    },
});
