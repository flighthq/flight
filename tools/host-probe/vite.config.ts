import { resolve } from 'node:path';

import { defineConfig } from 'vite';

import { workspacePackages } from '../../scripts/workspaces';

const alias = Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, `${pkg.dir}/src`]));

export default defineConfig(() => {
  const host = process.env.VITE_HOST_PROBE_HOST ?? 'web';
  return {
    root: __dirname,
    build: {
      outDir: resolve(__dirname, 'dist', host),
      emptyOutDir: true,
      target: 'esnext',
    },
    optimizeDeps: {
      exclude: workspacePackages.map((pkg) => pkg.name),
    },
    resolve: {
      alias,
      dedupe: ['@flighthq/types'],
    },
    server: {
      fs: { allow: [resolve(__dirname, '../..')] },
    },
  };
});
