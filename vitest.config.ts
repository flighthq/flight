import path from 'path';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config.base.js';

const rootDir = path.resolve(__dirname);

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      projects: [
        path.join(rootDir, 'packages/animation/timeline'),
        path.join(rootDir, 'packages/assets'),
        path.join(rootDir, 'packages/core'),
        path.join(rootDir, 'packages/flight'),
        path.join(rootDir, 'packages/geometry'),
        path.join(rootDir, 'packages/interaction'),
        path.join(rootDir, 'packages/materials'),
        path.join(rootDir, 'packages/render/canvas'),
        path.join(rootDir, 'packages/render/core'),
        path.join(rootDir, 'packages/scene/graph/core'),
        path.join(rootDir, 'packages/scene/graph/display'),
        path.join(rootDir, 'packages/scene/graph/sprite'),
        path.join(rootDir, 'packages/scene/graph/world'),
        path.join(rootDir, 'packages/types'),
        path.join(rootDir, 'tests/api'),
        path.join(rootDir, 'tests/api/browser'),
        path.join(rootDir, 'tests/integration'),
        path.join(rootDir, 'tests/size'),
      ],
    },
  }),
);
