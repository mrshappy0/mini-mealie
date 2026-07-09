import { configDefaults, defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugins: [WxtVitest() as any],
    test: {
        reporters: ['default', 'html'],
        // E2E harnesses (Playwright/Selenium) are not unit tests — keep them out of vitest.
        exclude: [
            ...configDefaults.exclude,
            '**/e2e-playwright/**',
            '**/e2e-geckodriver/**',
            '**/e2e-shared/**',
        ],
        coverage: {
            enabled: true,
            reporter: ['text', 'html', 'json', 'json-summary'],
            include: ['utils/**/*.ts'],
            exclude: [
                '**/index.ts', // Barrel exports
                '**/devInit.ts', // Dev-only initialization code
                '**/types/apiTypes.ts', // Pure TypeScript type definitions
                '**/e2eMessaging.ts', // E2E message constants only
            ],
            reportOnFailure: true,
        },
    },
});
