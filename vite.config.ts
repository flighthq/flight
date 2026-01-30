import { defineConfig } from 'vite';

// Vite config with modern TypeScript support
export default defineConfig({
  build: {
    target: 'esnext', // Ensure it targets modern browsers (ES2022)
    sourcemap: true, // Enable source maps for debugging
    minify: 'esbuild', // Use esbuild for fast minification
  },
  optimizeDeps: {
    exclude: ['some-large-package-to-optimize'],
  },
  plugins: [
    // Add other plugins as needed, like for Vue or React
    // Example: vue() for Vue.js
  ],
});
