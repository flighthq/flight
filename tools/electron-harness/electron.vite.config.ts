import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

import { workspacePackages } from '../../scripts/workspaces';

// Resolve every @flighthq/* package to its TypeScript source (same trick the example Vite config
// uses), so the harness runs against current source without a prior build step. Everything else
// (electron, node builtins) stays external — except the @flighthq packages, which must be bundled.
const alias = Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, `${pkg.dir}/src`]));
const flightPackages = workspacePackages.map((pkg) => pkg.name);

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: flightPackages })],
    resolve: { alias },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: flightPackages })],
    resolve: { alias },
  },
  renderer: {
    resolve: { alias },
  },
});
