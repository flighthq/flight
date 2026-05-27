import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, extname, join, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import { workspacePackages } from '../../scripts/workspaces';

const RENDERERS = ['dom', 'canvas', 'webgl'] as const;
type Renderer = (typeof RENDERERS)[number];

interface Example {
  name: string;
  renderers: Renderer[];
}

const projectRoot = resolve(__dirname, '../..');
const examplesDir = join(projectRoot, 'examples');

function discoverExamples(): Example[] {
  return readdirSync(examplesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(examplesDir, d.name, 'package.json')))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name }) => ({
      name,
      renderers: RENDERERS.filter((r) => existsSync(join(examplesDir, name, `src/render.${r}.ts`))),
    }))
    .filter((e) => e.renderers.length > 0);
}

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

function explorerPlugin(examples: Example[]): Plugin[] {
  return [
    {
      name: 'explorer:modules',
      enforce: 'pre',

      resolveId(source, importer) {
        // Virtual examples list
        if (source === 'virtual:explorer-examples') return '\0virtual:explorer-examples';

        // Virtual per-example entry points
        if (source.startsWith('virtual:entry:')) return '\0' + source;

        // Trampoline: virtual entry imports ___app___name:render so we can
        // attach the ?render= query to the real file path as the module ID.
        if (source.startsWith('___app___')) {
          const [name, render] = source.slice('___app___'.length).split(':');
          const appPath = join(examplesDir, name, 'src', 'app.ts');
          return appPath + '?render=' + render;
        }

        // Redirect './render' when the importer carries ?render= context.
        if (source === './render' && importer) {
          const match = importer.match(/\?render=([^&]+)/);
          if (match) {
            const render = match[1];
            return resolve(dirname(importer.split('?')[0]), `render.${render}.ts`);
          }
        }
      },

      load(id) {
        if (id === '\0virtual:explorer-examples') {
          return `export const examples = ${JSON.stringify(examples)};`;
        }

        if (id.startsWith('\0virtual:entry:')) {
          const [name, render] = id.slice('\0virtual:entry:'.length).split(':');
          return `import '___app___${name}:${render}';`;
        }
      },
    },

    {
      name: 'explorer:routes',

      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const urlPath = (req.url ?? '/').split('?')[0];
          const parts = urlPath.split('/').filter(Boolean);

          // Must start with /examples/{name}/{render}
          if (parts[0] !== 'examples' || parts.length < 3) return next();
          const [, name, render, ...assetParts] = parts;

          const example = examples.find((e) => e.name === name && (e.renderers as readonly string[]).includes(render));
          if (!example) return next();

          // Asset request: /examples/{name}/{render}/{assetPath...}
          if (assetParts.length > 0) {
            const assetRel = assetParts.join('/');
            const publicFile = join(examplesDir, name, 'public', assetRel);
            if (existsSync(publicFile)) {
              const mime = MIME[extname(publicFile)] ?? 'application/octet-stream';
              res.setHeader('Content-Type', mime);
              res.end(readFileSync(publicFile));
              return;
            }
            return next();
          }

          // HTML entry page
          const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} · ${render}</title>
  <style>*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } body { overflow: hidden; }</style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/@vite/client"></script>
  <script type="module" src="/@id/__x00__virtual:entry:${name}:${render}"></script>
</body>
</html>`;

          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        });
      },
    },
  ];
}

export default defineConfig(() => {
  const examples = discoverExamples();

  const alias: Record<string, string> = Object.fromEntries(
    workspacePackages.map((pkg) => [pkg.name, pkg.dir + '/src']),
  );

  return {
    root: __dirname,

    plugins: explorerPlugin(examples),

    resolve: {
      alias,
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
  };
});
