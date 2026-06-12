import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugins: [WxtVitest() as any],
    test: {
        reporters: ['default', 'html'],
        coverage: {
            enabled: true,
            reporter: ['text', 'html', 'json', 'json-summary'],
            include: ['utils/**/*.ts'],
            exclude: [
                '**/index.ts', // Barrel exports
                '**/devInit.ts', // Dev-only initialization code
                '**/types/apiTypes.ts', // Pure TypeScript type definitions
            ],
            reportOnFailure: true,
        },
    },
});
