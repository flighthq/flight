import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    minify: 'terser', // or 'terser' for extra squeeze
    sourcemap: false,
    reportCompressedSize: true, // shows gzip in console
    // chunkSizeWarningLimit: 10, // warn if any chunk >10KB
    rollupOptions: {
      output: {
        manualChunks: undefined, // no extra splitting
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    terserOptions: {
      compress: {
        arrows: true, // convert arrow functions to plain functions when shorter
        booleans: true,
        booleans_as_integers: true, // turn true/false into 1/0 (very aggressive, careful with side-effects)
        collapse_vars: true,
        comparisons: true,
        computed_props: true,
        conditionals: true,
        dead_code: true,
        drop_console: true, // remove console.*
        drop_debugger: true,
        ecma: 2020, // modern ECMA target for better optimizations
        evaluate: true,
        global_defs: {}, // add if you have custom defines (e.g. __DEV__: false)
        hoist_funs: true,
        hoist_props: true,
        hoist_vars: true,
        if_return: true,
        inline: true, // inline small functions aggressively
        join_vars: true,
        keep_classnames: false, // mangle class names unless needed
        keep_fnames: false,
        keep_infinity: true, // prevent Infinity → 1/0
        loops: true,
        negate_iife: true,
        passes: 3, // run compressor multiple times (higher = slower but smaller)
        properties: true,
        pure_funcs: ['console.log'], // mark pure functions to enable more aggressive removal
        pure_getters: 'strict',
        reduce_funcs: true,
        reduce_vars: true,
        sequences: true,
        side_effects: true,
        switches: true,
        toplevel: true, // enable toplevel optimizations (very aggressive!)
        typeofs: true,
        unsafe: true, // enable unsafe transformations (e.g. !![] → true)
        unsafe_arrows: true, // convert ES5 functions to arrows (modern target needed)
        unsafe_comps: true,
        unsafe_Function: true,
        unsafe_math: true, // e.g. 1/3 → .333...
        unsafe_methods: true,
        unsafe_proto: true,
        unsafe_regexp: true,
        unsafe_undefined: true,
      },

      mangle: {
        properties: true, // mangle property names (very aggressive, test thoroughly!)
        safari10: false,
        toplevel: true,
      },

      format: {
        comments: false, // remove all comments
        beautify: false,
      },

      // Rarely needed, but for extreme cases:
      ecma: 2020, // consistent with compress.ecma
      keep_classnames: false,
      keep_fnames: false,
      module: true, // assume ES modules
      toplevel: true,
    },

    target: 'esnext',
  },
  server: {
    // optional: disable HMR etc. if not needed
  },
});
