import { defineConfig, mergeConfig } from 'vite';

import { createBaseConfig } from '../../../vite.config.base';

export default defineConfig((env) => {
  return mergeConfig(createBaseConfig(env.mode), {
    root: __dirname,
    build: {
      cssCodeSplit: false,
      minify: 'terser',
      modulePreload: false,
      rollupOptions: { output: { manualChunks: undefined } },
      sourcemap: false,
      target: 'esnext',
      terserOptions: {
        compress: {
          arrows: true,
          drop_console: true,
          drop_debugger: true,
          inline: true,
          passes: 3,
          pure_getters: 'strict',
          reduce_vars: true,
          unsafe: true,
          unsafe_arrows: true,
        },
        ecma: 2020,
        format: { comments: false },
        mangle: { properties: true },
        module: true,
        toplevel: true,
      },
    },
  });
});
