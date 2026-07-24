import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: ['@wxt-dev/module-react'],
    /**
     * AMO sources zip filter — keep the listed-channel sources artifact free of
     * local agent docs, local-only E2E harnesses, and test/coverage artifacts.
     * WXT's source-zip generator walks the filesystem, not git, so `.gitignore`
     * and `.git/info/exclude` do NOT apply here. Hidden files and node_modules
     * are excluded by default; everything below is project-specific.
     */
    zip: {
        excludeSources: [
            'AGENTS.md',
            'CLAUDE.md',
            'e2e-shared/**',
            'e2e-geckodriver/**',
            'e2e-playwright/**',
            'docker/**',
            'coverage/**',
            'html/**',
        ],
    },
    /**
     * Statically define `import.meta.env.WXT_E2E` so it's a literal `true`/`false` at build
     * time (not a runtime lookup) and the E2E-only message hook in background.ts is dead-code
     * eliminated from production store builds. Set `WXT_E2E=true` (E2E build steps only) to
     * compile the hook in; store builds (`pnpm zip`, submit.yml) leave it unset → stripped.
     */
    vite: () => ({
        define: {
            'import.meta.env.WXT_E2E': JSON.stringify(process.env.WXT_E2E === 'true'),
        },
    }),
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
                          // Keep in sync with firefox.oldest in e2e-shared/support-range.json.
                          strict_min_version: '151.0',
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
