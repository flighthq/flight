import { defineConfig, mergeConfig } from 'vite';

import { createBaseConfig } from '../../../vite.config.base.ts';

export default defineConfig((env) => {
  return mergeConfig(createBaseConfig(env.mode), {
    root: __dirname,
  });
});
