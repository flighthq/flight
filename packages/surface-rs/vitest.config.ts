import { existsSync } from 'node:fs';
import path from 'node:path';

import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.base';

// The conformance suite imports the wasm-bindgen output (`src/wasm/surface_wasm.js`), which is
// gitignored and only produced by `npm run build:wasm`. The committed `src/wasm/*.d.ts` contracts let
// the package type-check with no Rust toolchain, but the runtime `.js` only exists after a wasm build.
// When it is absent, exclude the wasm-dependent test so the default `vitest` / `prepush` run stays
// green without requiring a wasm build — the conformance test runs automatically once wasm is baked.
const wasmBuilt = existsSync(path.resolve(__dirname, 'src/wasm/surface_wasm.js'));

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
      exclude: wasmBuilt ? [] : ['**/surfaceWasm.test.ts'],
      // Without a wasm build the only (conformance) test is excluded, leaving zero tests; that is a
      // green state here, not a failure.
      passWithNoTests: true,
      sequence: { groupOrder: 2 },
    },
  }),
);
