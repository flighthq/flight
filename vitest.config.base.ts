import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const rootDir = __dirname;
const rootTsconfig = path.resolve(rootDir, 'tsconfig.json');

export default defineConfig({
  plugins: [tsconfigPaths({ projects: [rootTsconfig], root: rootDir })],
  test: {
    globals: true,
    setupFiles: [path.resolve(rootDir, 'vitest.setup.ts')],
    exclude: ['**/.claude/**', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    dedupe: ['@flighthq/types'],
  },
});
