import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
