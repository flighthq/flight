import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, extname, join, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import { copyDirectoryContents } from '../../scripts/copy-dir';
import { workspacePackages } from '../../scripts/workspaces';

const RENDERERS = ['dom', 'canvas', 'webgl', 'webgpu'] as const;
type Renderer = (typeof RENDERERS)[number];

interface Example {
  name: string;
  renderers: Renderer[];
}

const projectRoot = resolve(__dirname, '../..');
const examplesDir = join(projectRoot, 'examples');

// The explorer is the listener app: it installs @flighthq/log's console-capture sink, then loads the
// example. The example is the emit app — it only ever imports the lightweight log/log* helpers,
// so its own build (e.g. under the size suite) tree-shakes the sink machinery away. The example is
// imported dynamically so the synchronous setLogSink call runs first — before the example's
// module-init logs fire (a static import would hoist and run the example before this body).
// Examples with no meaningful rendered output to gate for not-blankness — they produce sound, not
// pixels. They still get the Tier 1 error gate (a thrown/console error fails capture --fail-on-error);
// only the not-blank/fingerprint verification is skipped. Keyed by example name (all renderers).
const VERIFY_SKIP = new Set<string>(['playingsound']);

function entryWithLogCapture(name: string, render: string): string {
  // The shared in-page render verifier (also used by the functional harness). Reused here so examples
  // get the same not-blank / error / fingerprint checks with no per-example code. It is dynamically
  // imported and run ONLY under capture mode (window.__flightCapture, set by the verify harness), so
  // it never executes — and its chunk never loads — in the deployed gallery a visitor browses.
  const verifyPath = join(projectRoot, 'tests', 'functional', '_harness', 'verify.ts');
  const lines = [
    `import { createConsoleCaptureSink, setLogSink } from '@flighthq/log';`,
    `setLogSink(createConsoleCaptureSink());`,
    `const __example = await import('___app___${name}:${render}');`,
  ];
  if (!VERIFY_SKIP.has(name)) {
    lines.push(
      `if (window['__flightCapture']) {`,
      // Many examples render in a requestAnimationFrame loop, so the canvas is blank right after the
      // module resolves. Wait for the first frame to draw — the --frames halt flags __captureFramesReached
      // once it has — polling via setTimeout (rAF is halted by then), capped so one-shot renders proceed.
      `  await new Promise((resolve) => { let n = 0; const poll = () => (window['__captureFramesReached'] || ++n > 140) ? resolve() : setTimeout(poll, 15); poll(); });`,
      `  const { runRenderVerification } = await import(${JSON.stringify(verifyPath)});`,
      `  await runRenderVerification(__example, ${JSON.stringify(render)});`,
      `}`,
    );
  }
  return lines.join('\n');
}

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
  let viteBase = '/';
  let outDir = resolve(__dirname, 'dist');

  return [
    {
      name: 'explorer:modules',
      enforce: 'pre',

      config(_, { command }) {
        if (command !== 'build') return;

        const input: Record<string, string> = {
          main: resolve(__dirname, 'index.html'),
        };

        for (const example of examples) {
          for (const render of example.renderers) {
            input[`examples/${example.name}/${render}/index`] = `virtual-build-entry:${example.name}:${render}`;
          }
        }

        return {
          build: {
            rollupOptions: {
              input,
              output: {
                entryFileNames(chunk) {
                  if (chunk.facadeModuleId?.startsWith('\0virtual-build-entry:')) {
                    const [name, renderer] = chunk.facadeModuleId.slice('\0virtual-build-entry:'.length).split(':');
                    return `examples/${name}/${renderer}/index.js`;
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
        if (source.startsWith('virtual-build-entry:')) return '\0' + source;

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
        if (id.startsWith('\0virtual-build-entry:')) {
          const [name, render] = id.slice('\0virtual-build-entry:'.length).split(':');
          return entryWithLogCapture(name, render);
        }

        if (id === '\0virtual:explorer-examples') {
          return `export const examples = ${JSON.stringify(examples)};`;
        }

        if (id.startsWith('\0virtual:entry:')) {
          const [name, render] = id.slice('\0virtual:entry:'.length).split(':');
          return entryWithLogCapture(name, render);
        }
      },

      generateBundle(_, bundle) {
        for (const example of examples) {
          for (const render of example.renderers) {
            const entryId = `\0virtual-build-entry:${example.name}:${render}`;
            const chunk = Object.values(bundle).find(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (c) => c.type === 'chunk' && (c as any).facadeModuleId === entryId,
            ) as { fileName: string } | undefined;

            if (!chunk) continue;

            this.emitFile({
              type: 'asset',
              fileName: `examples/${example.name}/${render}/index.html`,
              source: [
                '<!DOCTYPE html>',
                '<html lang="en">',
                '<head>',
                '  <meta charset="UTF-8" />',
                // Document-relative `assets/...` fetches resolve into the shared pool (see
                // writeBundle). The script src below is base-absolute, so <base> never touches it.
                `  <base href="${viteBase}example-assets/" />`,
                '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
                `  <title>${example.name} \xB7 ${render}</title>`,
                '  <style>*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } body { overflow: hidden; }</style>',
                "  <script>window.addEventListener('pagehide',function(){document.querySelectorAll('canvas').forEach(function(c){var gl=c.getContext('webgl2')||c.getContext('webgl');if(gl){var ext=gl.getExtension('WEBGL_lose_context');if(ext)ext.loseContext();}});});</script>",
                '</head>',
                '<body>',
                '  <div id="app"></div>',
                `  <script type="module" src="${viteBase}${chunk.fileName}"></script>`,
                '</body>',
                '</html>',
              ].join('\n'),
            });
          }
        }
      },

      writeBundle() {
        // One flat pool for all example assets, shared by every renderer of every example. Example
        // asset paths are globally unique by content, so merging the per-example public/ trees
        // stores each file once (wabbit_alpha.png and tileset.png are each used by several examples)
        // instead of copying every example's assets into all four {name}/{render}/ directories. Each
        // built render page's <base href> points here (see generateBundle). Examples stay
        // independently buildable: each keeps its own public/assets and loads document-relative
        // `assets/...` paths; only the explorer pools them across the gallery.
        const pool = join(outDir, 'example-assets');
        for (const example of examples) {
          const publicDir = join(examplesDir, example.name, 'public');
          if (existsSync(publicDir)) copyDirectoryContents(publicDir, pool);
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
  <script>window.addEventListener('pagehide',function(){document.querySelectorAll('canvas').forEach(function(c){var gl=c.getContext('webgl2')||c.getContext('webgl');if(gl){var ext=gl.getExtension('WEBGL_lose_context');if(ext)ext.loseContext();}});});</script>
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

  // `@flighthq/log` resolves automatically via the workspace-package aliases above.
  const alias: Record<string, string> = {
    ...Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, pkg.dir + '/src'])),
  };

  return {
    root: __dirname,
    base: process.env.VITE_BASE ?? '/',

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
