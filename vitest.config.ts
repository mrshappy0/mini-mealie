import { defineConfig } from 'vitest/config';

import { WxtVitest } from '#imports';

export default defineConfig({
    plugins: [WxtVitest()],
    test: {
        reporters: ['default', 'html'],
        coverage: {
            enabled: true,
            reporter: ['text', 'html', 'json', 'json-summary'],
            include: ['utils'], // TODO: increase coverage to components & entrypoints
            exclude: ['**/index.ts'],
            reportOnFailure: true,
        },
    },
});
