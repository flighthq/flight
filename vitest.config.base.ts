import path from 'path';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    setupFiles: [path.resolve(__dirname, 'tests/setup/jsdom.ts')],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
