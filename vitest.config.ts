import { resolve } from 'path';
import type { TestProjectConfiguration } from 'vitest/config';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      projects: [
        config('packages/animation/timeline'),
        config('packages/assets', 'jsdom'),
        config('packages/flight'),
        config('packages/geometry'),
        config('packages/interaction'),
        config('packages/materials'),
        config('packages/render/core'),
        config('packages/scene/graph/stage'),
        config('packages/scene/graph/world'),
        config('packages/types'),
        config('tests/api'),
        config('packages/render/canvas', 'jsdom'),
        config('tests/api/browser', 'jsdom'),
        config('tests/integration', 'jsdom'),
        config('tests/size'),
      ],
    },
  }),
);

function config(path: string, environment: string = 'node', groupOrder?: number): TestProjectConfiguration {
  let name = '';
  if (path.startsWith('packages')) {
    name = '@flighthq/' + path.substring(path.indexOf('/') + 1).replace('/', '-');
  } else {
    name = path;
  }
  groupOrder = groupOrder ?? (environment === 'jsdom' ? 2 : 1);
  return {
    test: {
      name: name,
      dir: path,
      sequence: { groupOrder: groupOrder },
      environment: environment,
    },
    extends: resolve(path, 'vitest.config.ts'),
  };
}
