import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import { workspacePackages } from '../../scripts/workspaces';

const projectRoot = resolve(__dirname, '../..');
const artifactsDir = resolve(projectRoot, '.artifacts');

const TOOL_ORDER = ['functional', 'examples', 'reference'];
const RENDERER_ORDER = ['dom', 'canvas', 'webgl', 'webgpu'];
const EXCLUDE_TOOLS = new Set(['site']);

interface GalleryCell {
  renderer: string;
  state: 'ready' | 'error';
  error: string | null;
  changed: boolean | null;
}

interface GalleryTest {
  tool: string;
  name: string;
  cells: GalleryCell[];
}

function discoverGallery(): GalleryTest[] {
  if (!existsSync(artifactsDir)) return [];

  const toolDirs = readdirSync(artifactsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !EXCLUDE_TOOLS.has(d.name))
    .sort((a, b) => {
      const ai = TOOL_ORDER.indexOf(a.name);
      const bi = TOOL_ORDER.indexOf(b.name);
      const aRank = ai === -1 ? Infinity : ai;
      const bRank = bi === -1 ? Infinity : bi;
      return aRank !== bRank ? aRank - bRank : a.name.localeCompare(b.name);
    });

  const results: GalleryTest[] = [];

  for (const toolDir of toolDirs) {
    const tool = toolDir.name;
    const toolPath = join(artifactsDir, tool);

    const names = readdirSync(toolPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const name of names) {
      const testPath = join(toolPath, name);
      const cells: GalleryCell[] = [];

      const rendererDirs = readdirSync(testPath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .sort((a, b) => {
          const ai = RENDERER_ORDER.indexOf(a.name);
          const bi = RENDERER_ORDER.indexOf(b.name);
          const aRank = ai === -1 ? Infinity : ai;
          const bRank = bi === -1 ? Infinity : bi;
          return aRank !== bRank ? aRank - bRank : a.name.localeCompare(b.name);
        });

      for (const rendererDir of rendererDirs) {
        const renderer = rendererDir.name;
        const rendererPath = join(testPath, renderer);
        const screenshotPath = join(rendererPath, 'screenshot.png');
        const statusPath = join(rendererPath, 'status.json');

        if (!existsSync(screenshotPath)) continue;

        let state: 'ready' | 'error' = 'ready';
        let error: string | null = null;
        let changed: boolean | null = null;

        if (existsSync(statusPath)) {
          try {
            const s = JSON.parse(readFileSync(statusPath, 'utf8')) as {
              state?: string;
              error?: string;
              changed?: boolean;
            };
            if (s.state === 'error') state = 'error';
            error = s.error ?? null;
            changed = s.changed ?? null;
          } catch {
            // ignore malformed status
          }
        }

        cells.push({ renderer, state, error, changed });
      }

      if (cells.length > 0) results.push({ tool, name, cells });
    }
  }

  return results;
}

function galleryPlugin(): Plugin[] {
  return [
    {
      name: 'gallery:manifest',

      resolveId(source) {
        if (source === 'virtual:gallery-manifest') return '\0virtual:gallery-manifest';
      },

      load(id) {
        if (id !== '\0virtual:gallery-manifest') return;
        return `export const tests = ${JSON.stringify(discoverGallery())};`;
      },

      configureServer(server) {
        if (existsSync(artifactsDir)) {
          server.watcher.add(artifactsDir);
          const refresh = (file: string) => {
            if (!file.endsWith('screenshot.png') && !file.endsWith('status.json')) return;
            const mod = server.moduleGraph.getModuleById('\0virtual:gallery-manifest');
            if (mod) server.moduleGraph.invalidateModule(mod);
            server.ws.send({ type: 'full-reload' });
          };
          server.watcher.on('add', refresh);
          server.watcher.on('change', refresh);
        }

        server.middlewares.use((req, res, next) => {
          const urlPath = (req.url ?? '/').split('?')[0];
          if (!urlPath.startsWith('/artifacts/')) return next();

          const rel = urlPath.slice('/artifacts/'.length);
          const fsPath = join(artifactsDir, rel);

          if (relative(artifactsDir, fsPath).startsWith('..')) return next();
          if (!existsSync(fsPath)) return next();

          const ext = fsPath.split('.').pop() ?? '';
          const mime: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            json: 'application/json',
            jsonl: 'text/plain',
          };

          res.setHeader('Content-Type', mime[ext] ?? 'application/octet-stream');
          res.end(readFileSync(fsPath));
        });
      },
    },
  ];
}

export default defineConfig(() => {
  const alias = Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, pkg.dir + '/src']));

  return {
    root: __dirname,
    base: process.env.VITE_BASE ?? '/',

    plugins: galleryPlugin(),

    resolve: { alias, preserveSymlinks: false },

    optimizeDeps: {
      exclude: workspacePackages.map((p) => p.name),
    },

    server: {
      fs: { allow: [projectRoot, artifactsDir] },
    },
  };
});
