import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
    plugins: [WxtVitest()],
    test: {
        reporters: ['default', 'html'],
        coverage: {
            enabled: true,
            reporter: ['text', 'html', 'json'],
            include: ['entrypoints', 'components', 'utils'],
            exclude: ['**/index.ts'],
        },
    },
});
