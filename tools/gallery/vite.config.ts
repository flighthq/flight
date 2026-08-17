import { randomUUID } from 'node:crypto';

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import { workspacePackages } from '../../scripts/workspaces';

const projectRoot = resolve(__dirname, '../..');
const artifactsDir = resolve(projectRoot, '.artifacts');
const galleryArtifactFiles = [
  join(artifactsDir, '*', '*', '*', 'screenshot.png'),
  join(artifactsDir, '*', '*', '*', 'status.json'),
];

const TOOL_ORDER = ['functional', 'examples', 'reference'];
const RENDERER_ORDER = ['dom', 'canvas', 'webgl', 'webgpu'];
const EXCLUDE_TOOLS = new Set(['site']);

interface GalleryCellProvenance {
  hostInstanceId: string | null;
  environmentId: string | null;
}

interface GalleryCell {
  renderer: string;
  state: 'ready' | 'error';
  error: string | null;
  changed: boolean | null;
  hash: string | null;
  provenance: GalleryCellProvenance | null;
}

interface GalleryTest {
  tool: string;
  name: string;
  cells: GalleryCell[];
  expectedImageDescription?: string;
}

function discoverGallery(): GalleryTest[] {
  if (!existsSync(artifactsDir)) return [];

  const toolFilter = process.env['VITE_GALLERY_TOOL'];
  const toolDirs = readdirSync(artifactsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !EXCLUDE_TOOLS.has(d.name) && (!toolFilter || d.name === toolFilter))
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
      let expectedImageDescription: string | undefined;

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
        let hash: string | null = null;
        let provenance: GalleryCellProvenance | null = null;
        let cellDescription: string | undefined;

        if (existsSync(statusPath)) {
          try {
            const s = JSON.parse(readFileSync(statusPath, 'utf8')) as {
              state?: string;
              error?: string;
              changed?: boolean;
              hash?: string;
              provenance?: { hostInstanceId?: string; environmentId?: string };
              expectedImageDescription?: string;
            };
            if (s.state === 'error') state = 'error';
            error = s.error ?? null;
            changed = s.changed ?? null;
            hash = s.hash ?? null;
            if (s.provenance) {
              provenance = {
                hostInstanceId: s.provenance.hostInstanceId ?? null,
                environmentId: s.provenance.environmentId ?? null,
              };
            }
            cellDescription = s.expectedImageDescription;
          } catch {
            // ignore malformed status
          }
        }

        if (cellDescription !== undefined && expectedImageDescription === undefined) {
          expectedImageDescription = cellDescription;
        }
        cells.push({ renderer, state, error, changed, hash, provenance });
      }

      if (cells.length > 0) {
        const entry: GalleryTest = { tool, name, cells };
        if (expectedImageDescription !== undefined) entry.expectedImageDescription = expectedImageDescription;
        results.push(entry);
      }
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
          // Capture output also contains logs and transient files. Watch only the two fixed-depth
          // files that can change the manifest instead of recursively subscribing to the artifact tree.
          server.watcher.add(galleryArtifactFiles);
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

          if (req.method === 'POST' && urlPath === '/api/commission') {
            let body = '';
            req.on('data', (chunk: Buffer) => {
              body += chunk.toString();
            });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body) as {
                  tool: string;
                  entry: string;
                  cells: readonly {
                    renderer: string;
                    pixelSha256: string | null;
                    hostInstanceId: string | null;
                    environmentId: string | null;
                  }[];
                  reason: string;
                };
                if (!payload.tool || !payload.entry || !payload.cells?.length) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'missing required fields: tool, entry, cells' }));
                  return;
                }

                const eligible = payload.cells.filter(
                  (c): c is typeof c & { pixelSha256: string; hostInstanceId: string; environmentId: string } =>
                    c.pixelSha256 !== null && c.hostInstanceId !== null && c.environmentId !== null,
                );
                if (eligible.length === 0) {
                  res.statusCode = 400;
                  res.end(
                    JSON.stringify({
                      error: 'no eligible cells: every cell needs pixelSha256, hostInstanceId, and environmentId',
                    }),
                  );
                  return;
                }

                const id = randomUUID();
                const request = {
                  schemaVersion: 2,
                  id,
                  subject: payload.tool,
                  targets: eligible.map((c) => ({
                    entry: payload.entry,
                    renderer: c.renderer,
                    pixelSha256: c.pixelSha256,
                    capture: {
                      hostInstanceId: c.hostInstanceId,
                      environmentId: c.environmentId,
                    },
                  })),
                  frames: 1,
                  reason: payload.reason || 'Commissioned from gallery',
                };

                const queueDir = join(projectRoot, 'oracle-requests');
                mkdirSync(queueDir, { recursive: true });
                const outPath = join(queueDir, `${id}.json`);
                writeFileSync(outPath, JSON.stringify(request, null, 2) + '\n');

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ id, path: relative(projectRoot, outPath) }));
              } catch {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'invalid JSON body' }));
              }
            });
            return;
          }

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
