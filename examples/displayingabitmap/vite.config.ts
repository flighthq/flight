import { defineConfig, mergeConfig } from 'vite';

import { createBaseConfig } from '../../vite.config.base'; // eslint-disable-line

export default defineConfig((env) => {
  return mergeConfig(createBaseConfig(env.mode), {
    root: __dirname,
  });
});
