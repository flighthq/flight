import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    minify: 'terser',
    sourcemap: false,
    modulePreload: false,
    cssCodeSplit: false,

    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },

    terserOptions: {
      ecma: 2020,
      module: true,
      toplevel: true,

      compress: {
        passes: 3,
        drop_console: true,
        drop_debugger: true,
        unsafe: true,
        arrows: true,
        unsafe_arrows: true,
        reduce_vars: true,
        inline: true,
        pure_getters: 'strict',
      },

      mangle: {
        properties: true,
      },

      format: {
        comments: false,
      },
    },
  },
});
