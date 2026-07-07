import { resolve } from 'path';
import { defineConfig } from 'vite';

import { workspacePackages } from '../scripts/workspaces';

// The landing page is deployed at the site root (flighthq.ai, base `/`). It links to the examples and
// functional tools with relative URLs, so they resolve under any base without threading VITE_BASE
// into the markup. The hero is rendered with Flight itself, so workspace packages resolve to source
// (matching the examples/functional configs) for fast iteration and tree-shaken dev builds.
const projectRoot = resolve(__dirname, '..');

export default defineConfig(() => ({
  root: __dirname,
  base: process.env.VITE_BASE ?? '/',

  resolve: {
    alias: Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, pkg.dir + '/src'])),
    preserveSymlinks: false,
  },

  optimizeDeps: {
    exclude: workspacePackages.map((p) => p.name),
  },

  server: {
    fs: {
      allow: [projectRoot],
    },
    watch: {
      followSymlinks: true,
    },
  },
}));
