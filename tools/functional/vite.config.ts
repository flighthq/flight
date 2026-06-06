import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, extname, join, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import { workspacePackages } from '../../scripts/workspaces';

const RENDERERS = ['dom', 'canvas', 'webgl'] as const;
type Renderer = (typeof RENDERERS)[number];

interface FunctionalTest {
  name: string;
  renderers: Renderer[];
}

const projectRoot = resolve(__dirname, '../..');
const testsDir = join(projectRoot, 'tests/functional');

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
};

function discoverTests(): FunctionalTest[] {
  if (!existsSync(testsDir)) return [];
  return readdirSync(testsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(testsDir, d.name, 'package.json')))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name }) => ({
      name,
      renderers: RENDERERS.filter((r) => existsSync(join(testsDir, name, `src/render.${r}.ts`))),
    }))
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
          const [name, render] = source.slice('___ft___'.length).split(':');
          const appPath = join(testsDir, name, 'src', 'app.ts');
          return appPath + '?render=' + render;
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

        if (id.startsWith('\0virtual:ft-entry:')) {
          const [name, render] = id.slice('\0virtual:ft-entry:'.length).split(':');
          return `import '___ft___${name}:${render}';`;
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

          const test = tests.find((t) => t.name === name && (t.renderers as readonly string[]).includes(render));
          if (!test) return next();

          if (assetParts.length > 0) {
            const assetRel = assetParts.join('/');
            // Check test-specific public dir first, then shared tests/functional/public
            const candidates = [join(testsDir, name, 'public', assetRel), join(testsDir, 'public', assetRel)];
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
  <style>*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } body { overflow: hidden; }</style>
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

  const alias: Record<string, string> = Object.fromEntries(
    workspacePackages.map((pkg) => [pkg.name, pkg.dir + '/src']),
  );

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
