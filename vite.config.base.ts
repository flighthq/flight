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
    optimizeDeps: {
      exclude: ['some-large-package-to-optimize'],
    },
    plugins: [
      // Add other plugins as needed, like for Vue or React
      // Example: vue() for Vue.js
    ],
  });
}
