import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, extname, join, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import { copyDirectoryContents } from '../../scripts/copy-dir';
import { workspacePackages } from '../../scripts/workspaces';

const RENDERERS = ['dom', 'canvas', 'webgl', 'webgpu'] as const;
type Renderer = (typeof RENDERERS)[number];

interface FunctionalTest {
  name: string;
  renderers: string[];
}

const projectRoot = resolve(__dirname, '../..');
const testsDir = join(projectRoot, 'functional');
// Scenes live under packages/ (the TS tier, mirroring examples/packages); public/ and the asset
// manifest stay at the suite root. Scene-relative paths use packagesDir; infra uses testsDir.
const packagesDir = join(testsDir, 'packages');
// The shared render harness lives in tools/ (used by functional and reference alike).
const harnessDir = join(projectRoot, 'tools/harness');
// Suite render assets live in the top-level assets/ folder (the committed manifest + downloaded pool),
// no longer colocated under the suite.
const assetsDir = join(projectRoot, 'assets/functional');

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

// A renderer id is the logical key (`canvas`, `webgl`, `webgpu`). Should an id ever carry a colon
// (not safe as a URL or directory segment), this maps it to a hyphenated route segment; colon-free
// ids pass through unchanged. The id is never reconstructed from the segment; callers that need the
// id carry it alongside.
function routeSegment(renderer: string): string {
  return renderer.replace(':', '-');
}

function discoverTests(): FunctionalTest[] {
  if (!existsSync(packagesDir)) return [];
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(packagesDir, d.name, 'package.json')))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name }) => {
      const testDir = join(packagesDir, name);
      const customRenderers = RENDERERS.filter((r) => existsSync(join(testDir, `src/render.${r}.ts`))) as Renderer[];
      let renderers: string[];
      if (customRenderers.length > 0) {
        renderers = customRenderers;
      } else if (existsSync(join(testDir, 'src', 'app.ts'))) {
        const pkg = JSON.parse(readFileSync(join(testDir, 'package.json'), 'utf8')) as Record<string, unknown>;
        renderers = (pkg.renderers as string[] | undefined) ?? ['dom', 'canvas', 'webgl', 'webgpu'];
      } else {
        renderers = [];
      }
      return { name, renderers };
    })
    .filter((t) => t.renderers.length > 0);
}

// assetBase points at one global pool (test-assets/) shared by every renderer of every test.
// Functional assets have globally unique names and are loaded through a shared manifest, so a
// single flat pool has no collisions and stores each file once. The script src is absolute and ES
// module imports resolve against the module URL, so neither is affected by <base>; only
// document-relative asset fetches are redirected into the pool, which is the intent.
function buildEntryHtml(name: string, render: string, scriptSrc: string, assetBase: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <base href="${assetBase}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} · ${render}</title>
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

function functionalTestsPlugin(tests: FunctionalTest[]): Plugin[] {
  // routeSegment maps each renderer id to a URL/filesystem-safe path segment for emitted files and
  // routes; the id stays intact as the renderer's logical key.
  const buildTests: FunctionalTest[] = tests;

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
            input[`tests/${test.name}/${routeSegment(render)}/index`] = `virtual:ft-entry:${test.name}:${render}`;
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
                    return `tests/${name}/${routeSegment(render)}/index.js`;
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

      resolveId(source, importer) {
        if (source === 'virtual:functional-test-list') return '\0virtual:functional-test-list';

        if (source.startsWith('virtual:ft-entry:')) return '\0' + source;

        if (source.startsWith('___ft___')) {
          const [name, render] = splitFirst(source.slice('___ft___'.length), ':');
          const appPath = join(packagesDir, name, 'src', 'app.ts');
          return appPath + '?render=' + render;
        }

        if (source === '@ft/render' && importer) {
          const match = importer.match(/\?render=([^&]+)/);
          if (match) {
            const renderer = match[1];
            const testSrcDir = dirname(importer.split('?')[0]);
            const customPath = resolve(testSrcDir, `render.${renderer}.ts`);
            if (existsSync(customPath)) return customPath;
            return `\0virtual:ft-render:${renderer}`;
          }
          return resolve(harnessDir, 'render.ts');
        }

        // Depth-stable alias for the shared verify helper (scenes live under packages/, the harness
        // at the suite root); an alias keeps scene imports valid across scene/harness relocations.
        if (source === '@ft/verify') {
          return resolve(harnessDir, 'verify.ts');
        }

        if (source === './render' && importer) {
          const match = importer.match(/\?render=([^&]+)/);
          if (match) {
            const render = match[1];
            return resolve(dirname(importer.split('?')[0]), `render.${render}.ts`);
          }
        }
      },

      load(id) {
        if (id === '\0virtual:functional-test-list') {
          // Re-scan on each load so a newly added test folder appears after an HMR reload, not only
          // after a server restart. The captured `tests` is still used for the build input map.
          return `export const tests = ${JSON.stringify(discoverTests())};`;
        }

        if (id.startsWith('\0virtual:ft-render:')) {
          const renderer = id.slice('\0virtual:ft-render:'.length);
          if (renderer === 'canvas') {
            return [
              `import { createCanvasTarget } from ${JSON.stringify(join(harnessDir, 'canvas.ts'))};`,
              `export async function createFunctionalTarget(opts) { return createCanvasTarget(opts); }`,
            ].join('\n');
          }
          if (renderer === 'webgl') {
            return [
              `import { createGlTarget } from ${JSON.stringify(join(harnessDir, 'webgl.ts'))};`,
              `export async function createFunctionalTarget(opts) { return createGlTarget(opts); }`,
            ].join('\n');
          }
          if (renderer === 'dom') {
            return [
              `import { createDomTarget } from ${JSON.stringify(join(harnessDir, 'dom.ts'))};`,
              `export async function createFunctionalTarget(opts) { return createDomTarget(opts); }`,
            ].join('\n');
          }
          if (renderer === 'webgpu') {
            return [
              `import { createWgpuTarget } from ${JSON.stringify(join(harnessDir, 'webgpu.ts'))};`,
              `export const createFunctionalTarget = createWgpuTarget;`,
            ].join('\n');
          }
          return null;
        }

        if (id.startsWith('\0virtual:ft-entry:')) {
          const [name, render] = splitFirst(id.slice('\0virtual:ft-entry:'.length), ':');

          // The harness is the listener app: install the console-capture sink, then dynamically
          // import the flight test (dynamic so setLogSink runs before the test's module-init
          // logs). The test itself only imports the lightweight emit helpers. Once the test module
          // has finished rendering (its top-level await resolves), run the in-page verifier so a
          // blank or wrong render fails as a page error — turning "the page loaded" into "the
          // renderer actually drew". The test module may export assertRender / minCoverage.
          return [
            `import { createConsoleCaptureSink, setLogSink } from '@flighthq/log';`,
            `setLogSink(createConsoleCaptureSink());`,
            `const __testModule = await import('___ft___${name}:${render}');`,
            `const { runRenderVerification } = await import(${JSON.stringify(join(harnessDir, 'verify.ts'))});`,
            `await runRenderVerification(__testModule, ${JSON.stringify(render)});`,
          ].join('\n');
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
              fileName: `tests/${test.name}/${routeSegment(render)}/index.html`,
              source: buildEntryHtml(test.name, render, `${viteBase}${chunk.fileName}`, `${viteBase}test-assets/`),
            });
          }
        }
      },

      writeBundle() {
        // One flat pool for all functional assets. Every render page's <base href> points here, so
        // identical files used across renderers and tests (including the shared manifest) are stored
        // exactly once. Safe to merge because asset file names are globally unique.
        const pool = join(outDir, 'test-assets');
        const sources = [join(assetsDir, 'public'), ...buildTests.map((t) => join(packagesDir, t.name, 'public'))];
        for (const src of sources) {
          if (existsSync(src)) copyDirectoryContents(src, pool);
        }
      },
    },

    {
      name: 'functional-tests:routes',

      configureServer(server) {
        // Re-scan when a test folder is added or removed so new tests appear without a server restart.
        const refreshTestList = (): void => {
          const mod = server.moduleGraph.getModuleById('\0virtual:functional-test-list');
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        };
        server.watcher.add(testsDir);
        server.watcher.on('addDir', refreshTestList);
        server.watcher.on('unlinkDir', refreshTestList);
        server.watcher.on('add', (file) => {
          if (file.endsWith('app.ts') || file.endsWith('package.json')) refreshTestList();
        });

        server.middlewares.use((req, res, next) => {
          const urlPath = (req.url ?? '/').split('?')[0];
          const parts = urlPath.split('/').filter(Boolean);

          if (parts[0] !== 'tests' || parts.length < 3) return next();
          const [, name, segment, ...assetParts] = parts;

          // The URL carries the safe route segment; recover the renderer id (with any colon) for the virtual entry module below. Routes match dev and build.
          // Re-scan so a folder added since startup resolves without a restart.
          const test = discoverTests().find(
            (t) => t.name === name && t.renderers.some((r) => routeSegment(r) === segment),
          );
          if (!test) return next();
          const render = test.renderers.find((r) => routeSegment(r) === segment)!;

          if (assetParts.length > 0) {
            const assetRel = assetParts.join('/');
            const candidates: string[] = [];
            candidates.push(join(packagesDir, name, 'public', assetRel));
            candidates.push(join(assetsDir, 'public', assetRel));

            for (const candidate of candidates) {
              if (existsSync(candidate)) {
                const mime = MIME[extname(candidate)] ?? 'application/octet-stream';
                res.setHeader('Content-Type', mime);
                res.end(readFileSync(candidate));
                return;
              }
            }
            return next();
          }

          const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} · ${render}</title>
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

  // `@flighthq/log` resolves automatically via the workspace-package aliases above.
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
      // Serve the workspace @flighthq/* packages as live source (they are aliased to each package's
      // src/ above), never pre-bundled into .vite/deps. Pre-bundling (include) caches them, which both
      // breaks HMR and lets a stale cache silently run old code — a real capture-correctness hazard.
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
