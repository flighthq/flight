import { dirname, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import { workspacePackages } from './scripts/workspaces';

function renderPlugin(render: string): Plugin {
  return {
    name: 'render-alias',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === './render' && importer) {
        return resolve(dirname(importer), `render.${render}.ts`);
      }
    },
  };
}

export function createBaseConfig(mode: string) {
  const isProduction = mode === 'production';
  const render = process.env.RENDER ?? 'canvas';

  const alias = Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, pkg.dir + '/src']));
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

    plugins: [renderPlugin(render)],

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
