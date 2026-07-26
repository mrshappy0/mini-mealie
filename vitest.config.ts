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
        setupFiles: ['./vitest.setup.ts'],
        // jsdom for everything: entrypoints/** (React components) needs a DOM,
        // and utils/** tests don't touch the DOM so running them under jsdom
        // too costs nothing meaningful at this suite's size.
        environment: 'jsdom',
        coverage: {
            enabled: true,
            provider: 'istanbul',
            reporter: ['text', 'html', 'json', 'json-summary'],
            // entrypoints/** is deliberately excluded from the coverage *gate*: files
            // there combine WXT's auto-import transform with either JSX/react-refresh
            // or the defineBackground macro, and that combination breaks statement-level
            // instrumentation under both the v8 and istanbul providers — a tested file
            // still reports 0 total statements. Real tests exist under entrypoints/**/tests
            // for regression protection; just not reflected in this percentage. Revisit
            // once the WXT/Vite/react-plugin toolchain fixes the sourcemap chain.
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
