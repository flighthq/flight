import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'node',
      // The loader tests use the per-file mock idiom, so each rebuilds the subject's whole transitive
      // graph through `vi.resetModules()` plus a dynamic re-import — measured 45s for `gltfLoad` here.
      // The root config raises the budget for exactly these files; this config merges the base rather
      // than the root, so it does not inherit that and the default 10s fails six loaders on a clean tree.
      // Those reds were never about correctness, and a suite that cries wolf teaches readers to discount
      // the reds that are — a habit that does not stay confined to the files that earned it.
      hookTimeout: 60_000,
      include: ['src/**/*.test.ts'],
    },
  }),
);
