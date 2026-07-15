import { existsSync, readFileSync } from 'fs';
import { extname, join, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

// Imported from the package source (not the built barrel) so `vite --config` resolves it before
// @flighthq/tool-capture is built; it is the same single source the capture scripts consume.
import { discoverFunctionalScenes, functionalSceneFile } from '../../packages/tool-capture/src/functionalScenes';
import type { FunctionalScene } from '../../packages/tool-capture/src/functionalScenes';
import { resolveAssetTarget } from '../../scripts/asset-cache';
import { copyDirectoryContents } from '../../scripts/copy-dir';
import { workspacePackages } from '../../scripts/workspaces';

const projectRoot = resolve(__dirname, '../..');
const testsDir = join(projectRoot, 'functional');
// Scenes are flat files under functional/scenes/: <name>.ts (backend-agnostic) or
// <name>.<backend>.ts (self-contained backend-specific target). See @flighthq/tool-capture.
const scenesDir = join(testsDir, 'scenes');
// The shared render harness lives in tools/ (createFunctionalTarget, verify, per-backend factories).
const harnessDir = join(projectRoot, 'tools/harness');
// Suite render assets: the manifest is colocated here (tools/functional/assets.manifest.json) and
// the downloaded pool resolves to the shared cache (.cache/assets/functional) — or, when the cache
// is disabled, to public/assets. resolveAssetTarget keeps this in lockstep with the downloader.
const assetsPool = resolveAssetTarget(__dirname).outDir;

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.utf8': 'text/plain; charset=utf-8',
};

function splitFirst(str: string, sep: string): [string, string] {
  const i = str.indexOf(sep);
  if (i === -1) return [str, ''];
  return [str.slice(0, i), str.slice(i + sep.length)];
}

function discoverTests(): FunctionalScene[] {
  return discoverFunctionalScenes(scenesDir);
}

// The per-cell entry: install the log-capture sink, declare the backend the page renders (a
// backend-agnostic scene reads window.__ftBackend to pick its target; a backend-specific scene
// ignores it), dynamically import the scene so both run before its module-init, then verify.
function entryModule(name: string, backend: string): string {
  const scenePath = functionalSceneFile(scenesDir, name, backend);
  return [
    `import { createConsoleCaptureSink, setLogSink } from '@flighthq/log';`,
    `setLogSink(createConsoleCaptureSink());`,
    `window.__ftBackend = ${JSON.stringify(backend)};`,
    `const __testModule = await import(${JSON.stringify(scenePath)});`,
    `const { runRenderVerification } = await import(${JSON.stringify(join(harnessDir, 'verify.ts'))});`,
    `await runRenderVerification(__testModule, ${JSON.stringify(backend)});`,
  ].join('\n');
}

// assetBase points at one global pool (test-assets/) shared by every renderer of every test.
// Functional assets have globally unique names and are loaded through a shared manifest, so a
// single flat pool has no collisions and stores each file once.
function buildEntryHtml(name: string, render: string, scriptSrc: string, assetBase: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <base href="${assetBase}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} · ${render}</title>
  <link rel="icon" href="data:," />
  <style>*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: sans-serif; font-size: 16px; overflow: hidden; }</style>
  <script>
    window.addEventListener('pagehide', function() {
      document.querySelectorAll('canvas').forEach(function(c) {
        var gl = c.getContext('webgl2') || c.getContext('webgl');
        if (gl) { var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
      });
    });
  </script>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="${scriptSrc}"></script>
</body>
</html>`;
}

function functionalTestsPlugin(tests: FunctionalScene[]): Plugin[] {
  const buildTests: FunctionalScene[] = tests;

  let viteBase = '/';
  let outDir = resolve(__dirname, 'dist');

  return [
    {
      name: 'functional-tests:modules',
      enforce: 'pre',

      config(_, { command }) {
        if (command !== 'build') return;

        const input: Record<string, string> = {
          main: resolve(__dirname, 'index.html'),
        };
        for (const test of buildTests) {
          for (const render of test.renderers) {
            input[`tests/${test.name}/${render}/index`] = `virtual:ft-entry:${test.name}:${render}`;
          }
        }

        return {
          build: {
            rollupOptions: {
              input,
              output: {
                entryFileNames(chunk) {
                  const id = chunk.facadeModuleId;
                  if (id?.startsWith('\0virtual:ft-entry:')) {
                    const [name, render] = splitFirst(id.slice('\0virtual:ft-entry:'.length), ':');
                    return `tests/${name}/${render}/index.js`;
                  }
                  return 'assets/[name]-[hash].js';
                },
              },
            },
          },
        };
      },

      configResolved(config) {
        viteBase = config.base;
        outDir = resolve(config.root, config.build.outDir);
      },

      resolveId(source) {
        if (source === 'virtual:functional-test-list') return '\0virtual:functional-test-list';
        if (source.startsWith('virtual:ft-entry:')) return '\0' + source;

        // The harness seams resolve to their real modules — no per-backend build-time redirect. The
        // backend is chosen at runtime via window.__ftBackend (set by the entry above).
        if (source === '@ft/render') return resolve(harnessDir, 'render.ts');
        if (source === '@ft/verify') return resolve(harnessDir, 'verify.ts');
      },

      load(id) {
        if (id === '\0virtual:functional-test-list') {
          // Re-scan on each load so a newly added scene appears after an HMR reload, not only after a
          // server restart. The captured `tests` is still used for the build input map.
          return `export const tests = ${JSON.stringify(discoverTests())};`;
        }

        if (id.startsWith('\0virtual:ft-entry:')) {
          const [name, render] = splitFirst(id.slice('\0virtual:ft-entry:'.length), ':');
          return entryModule(name, render);
        }
      },

      generateBundle(_, bundle) {
        for (const test of buildTests) {
          for (const render of test.renderers) {
            const entryId = `\0virtual:ft-entry:${test.name}:${render}`;
            const chunk = Object.values(bundle).find(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (c) => c.type === 'chunk' && (c as any).facadeModuleId === entryId,
            ) as { fileName: string } | undefined;

            if (!chunk) continue;

            this.emitFile({
              type: 'asset',
              fileName: `tests/${test.name}/${render}/index.html`,
              source: buildEntryHtml(test.name, render, `${viteBase}${chunk.fileName}`, `${viteBase}test-assets/`),
            });
          }
        }
      },

      writeBundle() {
        // One flat pool for all functional assets: every render page's <base href> points here, so
        // files shared across renderers (including the manifest) are stored once. Names are globally
        // unique, so a flat merge is collision-free.
        const pool = join(outDir, 'test-assets');
        if (existsSync(assetsPool)) copyDirectoryContents(assetsPool, pool);
      },
    },

    {
      name: 'functional-tests:routes',

      configureServer(server) {
        // Re-scan when a scene file is added or removed so new scenes appear without a server restart.
        const refreshTestList = (): void => {
          const mod = server.moduleGraph.getModuleById('\0virtual:functional-test-list');
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        };
        server.watcher.add(scenesDir);
        server.watcher.on('add', (file) => {
          if (file.endsWith('.ts')) refreshTestList();
        });
        server.watcher.on('unlink', (file) => {
          if (file.endsWith('.ts')) refreshTestList();
        });

        server.middlewares.use((req, res, next) => {
          const urlPath = (req.url ?? '/').split('?')[0];
          const parts = urlPath.split('/').filter(Boolean);

          if (parts[0] !== 'tests' || parts.length < 3) return next();
          const [, name, render, ...assetParts] = parts;

          // Re-scan so a scene added since startup resolves without a restart.
          const test = discoverTests().find((t) => t.name === name && t.renderers.includes(render));
          if (!test) return next();

          if (assetParts.length > 0) {
            const assetRel = assetParts.join('/');
            const candidate = join(assetsPool, assetRel);
            if (existsSync(candidate)) {
              const mime = MIME[extname(candidate)] ?? 'application/octet-stream';
              res.setHeader('Content-Type', mime);
              res.end(readFileSync(candidate));
              return;
            }
            return next();
          }

          const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} · ${render}</title>
  <link rel="icon" href="data:," />
  <style>*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: sans-serif; font-size: 16px; overflow: hidden; }</style>
  <script>
    function __ftShowError(msg) {
      var el = document.getElementById('ft-error');
      if (!el) {
        el = document.createElement('pre');
        el.id = 'ft-error';
        el.style.cssText = 'position:fixed;inset:0;margin:0;padding:1em;background:#1a0000;color:#ff6b6b;font-size:13px;font-family:monospace;overflow:auto;z-index:9999;white-space:pre-wrap;word-break:break-word;';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      try { window.parent.console.error('[${name}/${render}]', msg); } catch (_) {}
    }
    window.addEventListener('error', function(e) {
      __ftShowError((e.error && e.error.stack) || e.message || String(e));
    });
    window.addEventListener('unhandledrejection', function(e) {
      __ftShowError((e.reason && e.reason.stack) || String(e.reason));
    });
    window.addEventListener('pagehide', function() {
      document.querySelectorAll('canvas').forEach(function(c) {
        var gl = c.getContext('webgl2') || c.getContext('webgl');
        if (gl) { var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
      });
    });
  </script>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/@vite/client"></script>
  <script type="module" src="/@id/__x00__virtual:ft-entry:${name}:${render}"></script>
</body>
</html>`;

          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(html);
        });
      },
    },
  ];
}

export default defineConfig(() => {
  const tests = discoverTests();

  // `@flighthq/log` resolves automatically via the workspace-package aliases below.
  const alias: Record<string, string> = {
    ...Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, pkg.dir + '/src'])),
  };

  return {
    root: __dirname,
    base: process.env.VITE_BASE ?? '/',

    plugins: functionalTestsPlugin(tests),

    resolve: {
      alias,
      preserveSymlinks: false,
    },

    optimizeDeps: {
      // Serve the workspace @flighthq/* packages as live source (aliased to each package's src/),
      // never pre-bundled — pre-bundling caches them, which breaks HMR and can silently run old code.
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
  };
});
