import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: ['@wxt-dev/module-react'],
    manifest: {
        permissions: ['storage', 'activeTab', 'contextMenus', 'scripting'],
        host_permissions: ['<all_urls>'],
        description: 'Scrape recipes and save them to a Mealie instance.',
        name: 'Mini Mealie',
    },
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
