import { defineConfig, mergeConfig } from 'vitest/config';

import { workspacePackages } from '../../scripts/workspaces';
import baseConfig from '../../vitest.config.base';

const alias = Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, `${pkg.dir}/src`]));

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: { alias },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
    },
  }),
);
