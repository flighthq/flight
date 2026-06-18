import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, extname, join, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import { workspacePackages } from '../../scripts/workspaces';

const RENDERERS = ['dom', 'canvas', 'webgl', 'webgpu'] as const;
type Renderer = (typeof RENDERERS)[number];

interface FunctionalTest {
  name: string;
  renderers: string[];
}

const projectRoot = resolve(__dirname, '../..');
const testsDir = join(projectRoot, 'tests/functional');
const referenceBaseDir = join(projectRoot, 'tests/reference');

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

function discoverReferenceRenderers(testName: string): string[] {
  if (!existsSync(referenceBaseDir)) return [];
  return readdirSync(referenceBaseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(referenceBaseDir, d.name, testName, 'src', 'app.ts')))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => `reference:${d.name}`);
}

function discoverTests(): FunctionalTest[] {
  if (!existsSync(testsDir)) return [];
  return readdirSync(testsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(testsDir, d.name, 'package.json')))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name }) => {
      const testDir = join(testsDir, name);
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
      return {
        name,
        renderers: [...renderers, ...discoverReferenceRenderers(name)],
      };
    })
    .filter((t) => t.renderers.length > 0);
}

function functionalTestsPlugin(tests: FunctionalTest[]): Plugin[] {
  return [
    {
      name: 'functional-tests:modules',
      enforce: 'pre',

      resolveId(source, importer) {
        if (source === 'virtual:functional-test-list') return '\0virtual:functional-test-list';

        if (source.startsWith('virtual:ft-entry:')) return '\0' + source;

        if (source.startsWith('___ft___')) {
          const [name, render] = splitFirst(source.slice('___ft___'.length), ':');
          const appPath = join(testsDir, name, 'src', 'app.ts');
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
          return resolve(testsDir, '_harness/render.ts');
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
          return `export const tests = ${JSON.stringify(tests)};`;
        }

        if (id.startsWith('\0virtual:ft-render:')) {
          const renderer = id.slice('\0virtual:ft-render:'.length);
          const harnessDir = join(testsDir, '_harness');
          if (renderer === 'canvas') {
            return [
              `import { createCanvasTarget } from ${JSON.stringify(join(harnessDir, 'canvas.ts'))};`,
              `export async function createFunctionalTarget(opts) { return createCanvasTarget(opts); }`,
            ].join('\n');
          }
          if (renderer === 'webgl') {
            return [
              `import { createWebGLTarget } from ${JSON.stringify(join(harnessDir, 'webgl.ts'))};`,
              `export async function createFunctionalTarget(opts) { return createWebGLTarget(opts); }`,
            ].join('\n');
          }
          if (renderer === 'dom') {
            return [
              `import { createDOMTarget } from ${JSON.stringify(join(harnessDir, 'dom.ts'))};`,
              `export async function createFunctionalTarget(opts) { return createDOMTarget(opts); }`,
            ].join('\n');
          }
          if (renderer === 'webgpu') {
            return [
              `import { createWebGPUTarget } from ${JSON.stringify(join(harnessDir, 'webgpu.ts'))};`,
              `export const createFunctionalTarget = createWebGPUTarget;`,
            ].join('\n');
          }
          return null;
        }

        if (id.startsWith('\0virtual:ft-entry:')) {
          const [name, render] = splitFirst(id.slice('\0virtual:ft-entry:'.length), ':');

          if (render.startsWith('reference:')) {
            const refFolder = render.slice('reference:'.length);
            const appPath = join(referenceBaseDir, refFolder, name, 'src', 'app.ts');
            return `import ${JSON.stringify(appPath)};`;
          }

          // The harness is the listener app: install the console-capture sink, then dynamically
          // import the flight test (dynamic so setFlightLogSink runs before the test's module-init
          // logs). The test itself only imports the lightweight emit helpers.
          return [
            `import { createConsoleCaptureSink, setFlightLogSink } from '@flighthq/log';`,
            `setFlightLogSink(createConsoleCaptureSink());`,
            `import('___ft___${name}:${render}');`,
          ].join('\n');
        }
      },
    },

    {
      name: 'functional-tests:routes',

      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const urlPath = (req.url ?? '/').split('?')[0];
          const parts = urlPath.split('/').filter(Boolean);

          if (parts[0] !== 'tests' || parts.length < 3) return next();
          const [, name, render, ...assetParts] = parts;

          const test = tests.find((t) => t.name === name && t.renderers.includes(render));
          if (!test) return next();

          if (assetParts.length > 0) {
            const assetRel = assetParts.join('/');
            const candidates: string[] = [];

            if (render.startsWith('reference:')) {
              const refFolder = render.slice('reference:'.length);
              candidates.push(join(referenceBaseDir, refFolder, name, 'public', assetRel));
            } else {
              candidates.push(join(testsDir, name, 'public', assetRel));
            }
            candidates.push(join(testsDir, 'public', assetRel));

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
    openfl: join(projectRoot, 'node_modules', 'openfl', 'lib', 'openfl'),
  };

  return {
    root: __dirname,

    plugins: functionalTestsPlugin(tests),

    resolve: {
      alias,
      preserveSymlinks: false,
    },

    optimizeDeps: {
      include: workspacePackages.map((p) => p.name),
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
