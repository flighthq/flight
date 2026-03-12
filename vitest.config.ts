import path from 'path';
import { defineConfig, mergeConfig } from 'vitest/config';

import { workspacePackages } from './scripts/workspaces';
import baseConfig from './vitest.config.base.js';

const rootDir = path.resolve(__dirname);

const packageProjects = workspacePackages.map((p) => p.dir);

const testProjects = ['tests/api', 'tests/api/browser', 'tests/integration', 'tests/size'].map((p) =>
  path.join(rootDir, p),
);

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      projects: [...packageProjects, ...testProjects],
    },
  }),
);
