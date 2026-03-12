import { defineConfig } from 'vite';

import { workspacePackages } from './scripts/workspaces';

export function createBaseConfig(mode: string) {
  const isProduction = mode === 'production';

  const runtimePackages = workspacePackages.filter((pkg) => pkg.name !== '@flighthq/types');
  const alias = Object.fromEntries(runtimePackages.map((pkg) => [pkg.name, pkg.dir + '/src']));
  const exclude = workspacePackages.map((p) => p.name);

  return defineConfig({
    build: {
      target: 'esnext',
      sourcemap: !isProduction,
      minify: isProduction ? 'esbuild' : false,
      outDir: isProduction ? 'dist' : 'dev-dist',
    },

    esbuild: {
      drop: isProduction ? ['console', 'debugger'] : [],
      target: 'esnext',
    },

    resolve: {
      alias,
      preserveSymlinks: false,
    },

    optimizeDeps: {
      exclude,
    },

    server: {
      watch: {
        followSymlinks: true,
      },
    },
  });
}
