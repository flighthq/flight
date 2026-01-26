import { defineConfig } from 'vitest/config';
// @ts-ignore
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        // @ts-ignore
        setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
        }
    },
});
