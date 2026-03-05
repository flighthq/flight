import path from 'path';
import { defineConfig } from 'vite';

export function createBaseConfig(mode: string) {
  const isProduction = mode === 'production';

  return defineConfig({
    build: {
      target: 'esnext',
      sourcemap: isProduction ? false : true,
      minify: isProduction ? 'esbuild' : false,
      outDir: isProduction ? 'dist' : 'dev-dist',
    },
    esbuild: {
      drop: isProduction ? ['console', 'debugger'] : [],
      target: 'esnext',
    },
    plugins: [
      // Add other plugins as needed, like for Vue or React
      // Example: vue() for Vue.js
    ],
    resolve: {
      alias: {
        // Alias directly to source for instant hot-module-reload (HMR)
        '@flighthq/animation-timeline': path.resolve(__dirname, 'packages/animation/timeline/src/index.ts'),
        '@flighthq/assets': path.resolve(__dirname, 'packages/assets/src/index.ts'),
        '@flighthq/flight': path.resolve(__dirname, 'packages/flight/src/index.ts'),
        '@flighthq/geometry': path.resolve(__dirname, 'packages/geometry/src/index.ts'),
        '@flighthq/interaction': path.resolve(__dirname, 'packages/interaction/src/index.ts'),
        '@flighthq/materials': path.resolve(__dirname, 'packages/materials/src/index.ts'),
        '@flighthq/render-canvas': path.resolve(__dirname, 'packages/render/canvas/src/index.ts'),
        '@flighthq/render-core': path.resolve(__dirname, 'packages/render/core/src/index.ts'),
        '@flighthq/scene-graph-stage/bounds': path.resolve(__dirname, 'packages/scene/graph/stage/src/bounds.ts'),
        '@flighthq/scene-graph-stage/children': path.resolve(__dirname, 'packages/scene/graph/stage/src/children.ts'),
        '@flighthq/scene-graph-stage/transform': path.resolve(__dirname, 'packages/scene/graph/stage/src/transform.ts'),
        '@flighthq/scene-graph-stage': path.resolve(__dirname, 'packages/scene/graph/stage/src/index.ts'),
        '@flighthq/scene-graph-world': path.resolve(__dirname, 'packages/scene/graph/world/src/index.ts'),
        // '@flighthq/types': path.resolve(__dirname, 'packages/types/src/index.ts'),
      },
    },
    optimizeDeps: {
      // Prevent Vite from pre-bundling your workspace packages → treat as live source
      exclude: [
        '@flighthq/animation-timeline',
        '@flighthq/assets',
        '@flighthq/flight',
        '@flighthq/geometry',
        '@flighthq/interaction',
        '@flighthq/materials',
        '@flighthq/render-canvas',
        '@flighthq/render-core',
        '@flighthq/scene-graph-stage',
        '@flighthq/scene-graph-world',
        // '@flighthq/types',
        // ... list all workspace packages you want live-reloading on
      ],
    },
    server: {
      watch: {
        // Ensure Vite watches symlinked files properly
        followSymlinks: true,

        // If changes still miss (e.g. WSL, Docker, network FS), enable polling
        // usePolling: true,
        // interval: 300,
      },
    },
  });
}
