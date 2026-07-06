import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, extname, join, relative, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import { resolveAssetTarget } from '../../../scripts/asset-cache';
import { copyDirectoryContents } from '../../../scripts/copy-dir';
import { workspacePackages } from '../../../scripts/workspaces';

const RENDERERS = ['dom', 'canvas', 'webgl', 'webgpu', 'wasm'] as const;
type Renderer = (typeof RENDERERS)[number];
const includeWasmExamples = process.env.FLIGHT_EXAMPLES_WASM === '1';
const WASM_EXAMPLES = new Set([
  'addinganimation',
  'addingtext',
  'animatedsprite',
  'batchloading',
  'bunnymark',
  'comparebitmapdata',
  'displayingabitmap',
  'drawingshapes',
  'nyancat',
  'piratepig',
  'playingsound',
  'playingvideo',
  'renderview',
  'sparktrail',
  'textmetrics',
  'tweenexample',
  'usingtilemap',
]);

interface Example {
  name: string;
  renderers: Renderer[];
}

const projectRoot = resolve(__dirname, '../../..');
const examplesDir = join(projectRoot, 'examples', 'packages');

// The examples is the listener app: it installs @flighthq/log's console-capture sink, then loads the
// example. The example is the emit app — it only ever imports the lightweight log/log* helpers,
// so its own build (e.g. under the size suite) tree-shakes the sink machinery away. The example is
// imported dynamically so the synchronous setLogSink call runs first — before the example's
// module-init logs fire (a static import would hoist and run the example before this body).
// Examples with no meaningful rendered output to gate for not-blankness — they produce sound, not
// pixels. They still get the Tier 1 error gate (a thrown/console error fails capture --fail-on-error);
// only the not-blank/fingerprint verification is skipped. Keyed by example name (all renderers).
const VERIFY_SKIP = new Set<string>(['playingsound']);

function entryWithLogCapture(name: string, render: string): string {
  const verifyPath = join(projectRoot, 'tools', 'harness', 'verify.ts');
  if (render === 'wasm') {
    const loaderPath = join(__dirname, 'src', 'wasm-loader.ts');
    const lines = [
      `import { createConsoleCaptureSink, setLogSink } from '@flighthq/log';`,
      `setLogSink(createConsoleCaptureSink());`,
      `const { mountWasmExample } = await import(${JSON.stringify(loaderPath)});`,
      `await mountWasmExample(${JSON.stringify(name)});`,
    ];
    if (!VERIFY_SKIP.has(name)) {
      lines.push(
        `if (window['__flightCapture'] && window['__flightCaptureVerify'] !== false) {`,
        `  await new Promise((resolve) => { let n = 0; const poll = () => (window['__captureFramesReached'] || ++n > 140) ? resolve() : setTimeout(poll, 15); poll(); });`,
        `  const { runRenderVerification } = await import(${JSON.stringify(verifyPath)});`,
        `  await runRenderVerification({}, 'wasm');`,
        `}`,
      );
    }
    return lines.join('\n');
  }
  // The shared in-page render verifier (also used by the functional harness). Reused here so examples
  // get the same not-blank / error / fingerprint checks with no per-example code. It is dynamically
  // imported and run ONLY under capture mode (window.__flightCapture, set by the verify harness), so
  // it never executes — and its chunk never loads — in the deployed gallery a visitor browses.
  // Path-singleton of the example's render module: app.ts imports './render', which resolveId rewrites
  // to this same absolute file, so importing it here yields the identical exported render state.
  const renderPath = join(examplesDir, name, 'src', `render.${render}.ts`);
  const lines = [
    `import { createConsoleCaptureSink, setLogSink } from '@flighthq/log';`,
    `setLogSink(createConsoleCaptureSink());`,
  ];
  if (!VERIFY_SKIP.has(name) && render === 'webgpu') {
    // WebGPU's swapchain is never presented on the headless/software adapter, so the browser screenshots
    // a blank canvas and the verifier must read the frame back from the GPU instead. That path needs the
    // render state registered as a functional target with frame capture enabled, and capture must be on
    // before the first submit — a static (requiresInvalidation) scene submits only once. The render
    // module just creates the state on import (the app.ts imported next does the rendering), so enabling
    // capture here — between importing the render module and running the app — captures every frame. The
    // gallery example itself carries no capture concern; this runs in capture mode only.
    lines.push(
      `if (window['__flightCapture'] && window['__flightCaptureVerify'] !== false) {`,
      `  const { registerWgpuFunctionalTarget } = await import(${JSON.stringify(verifyPath)});`,
      `  const __render = await import(${JSON.stringify(renderPath)});`,
      `  registerWgpuFunctionalTarget(__render.state, __render.scale);`,
      `}`,
    );
  }
  lines.push(`const __example = await import('___app___${name}:${render}');`);
  if (!VERIFY_SKIP.has(name)) {
    lines.push(
      `if (window['__flightCapture'] && window['__flightCaptureVerify'] !== false) {`,
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
      renderers: RENDERERS.filter(
        (r) =>
          (r === 'wasm' && includeWasmExamples && WASM_EXAMPLES.has(name)) ||
          existsSync(join(examplesDir, name, `src/render.${r}.ts`)),
      ),
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
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.utf8': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

function examplesPlugin(examples: Example[]): Plugin[] {
  let viteBase = '/';
  let outDir = resolve(__dirname, 'dist');

  return [
    {
      name: 'examples:modules',
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
        if (source === 'virtual:examples-examples') return '\0virtual:examples-examples';

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

        if (id === '\0virtual:examples-examples') {
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
                // Document-relative `assets/...` fetches resolve into this example's own asset pool
                // (see writeBundle) — a per-example base, not a shared one, so an example serves only
                // what its own manifest declared. The script src below is base-absolute, so <base>
                // never touches it.
                `  <base href="${viteBase}example-assets/${example.name}/" />`,
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
        // One asset pool per example, matching the per-example <base href> above. Each example's
        // downloaded cache (.cache/assets/<name>/, or its public/assets when the cache is disabled)
        // is copied under example-assets/<name>/assets/, so a page resolves `assets/...` only within
        // its own example. This mirrors the dev route below: an example serves exactly what its own
        // manifest declared, so an under-declared manifest 404s here instead of being shadowed by a
        // file another example happened to pull.
        for (const example of examples) {
          const src = resolveAssetTarget(join(examplesDir, example.name)).outDir;
          if (existsSync(src)) {
            copyDirectoryContents(src, join(outDir, 'example-assets', example.name, 'assets'));
          }
        }
      },
    },

    {
      name: 'examples:routes',

      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const urlPath = (req.url ?? '/').split('?')[0];
          const parts = urlPath.split('/').filter(Boolean);

          // Must start with /examples/{name}/{render}
          if (parts[0] !== 'examples' || parts.length < 3) return next();
          const [, name, render, ...assetParts] = parts;

          const example = examples.find((e) => e.name === name && (e.renderers as readonly string[]).includes(render));
          if (!example) return next();

          // Asset request: /examples/{name}/{render}/{assetPath...}. App URLs are `assets/<rel>`; the
          // cache stores the manifest's `<rel>` (assets/-less), so strip the serving prefix and index
          // into this example's own pool. Per-example, so an under-declared manifest 404s instead of
          // being shadowed by a file another example pulled — matching the built layout above.
          if (assetParts.length > 0) {
            const assetRel = assetParts.join('/');
            const rel = assetRel.startsWith('assets/') ? assetRel.slice('assets/'.length) : assetRel;
            const dir = resolveAssetTarget(join(examplesDir, name)).outDir;
            const assetFile = join(dir, rel);
            if (!relative(dir, assetFile).startsWith('..') && existsSync(assetFile) && statSync(assetFile).isFile()) {
              const mime = MIME[extname(assetFile)] ?? 'application/octet-stream';
              res.setHeader('Content-Type', mime);
              res.end(readFileSync(assetFile));
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

    plugins: examplesPlugin(examples),

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
