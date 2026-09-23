import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'node',
      hookTimeout: 60_000,
      // These tests bundle, typecheck and spawn child runners, so a single one legitimately takes
      // seconds: the slowest without its own inline budget measures ~3.5s on an idle machine. The
      // 5s vitest default left almost no margin, and `npm run check` runs its gates through a
      // concurrent worker pool — so under a full sweep the same tests inflate past 5s and fail as
      // "Test timed out" rather than on any assertion. This budget is for contention, not for slow
      // subjects; it stays well under hookTimeout so a genuine hang still fails the run.
      testTimeout: 30_000,
      passWithNoTests: false,
      include: ['scripts/**/*.test.ts'],
      exclude: ['**/.claude/**', '**/node_modules/**'],
    },
  }),
);
