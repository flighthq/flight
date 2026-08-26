import { resolve } from 'node:path';

import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

import { workspacePackages } from '../../scripts/workspaces';

const alias = Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, `${pkg.dir}/src`]));
const flightPackages = workspacePackages.map((pkg) => pkg.name);

export default defineConfig({
  main: {
    build: { rollupOptions: { input: resolve(__dirname, 'electron/main/index.ts') } },
    plugins: [externalizeDepsPlugin({ exclude: flightPackages })],
    resolve: { alias },
  },
  preload: {
    build: { rollupOptions: { input: resolve(__dirname, 'electron/preload/index.ts') } },
    plugins: [externalizeDepsPlugin({ exclude: flightPackages })],
    resolve: { alias },
  },
  renderer: {
    build: { rollupOptions: { input: resolve(__dirname, 'electron/renderer/index.html') } },
    resolve: { alias },
    root: resolve(__dirname, 'electron/renderer'),
  },
});
