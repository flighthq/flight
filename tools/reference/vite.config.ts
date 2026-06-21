import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, extname, join, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import { copyDirectoryContents } from '../../scripts/copy-dir';
import { workspacePackages } from '../../scripts/workspaces';

const BACKENDS = ['dom', 'canvas', 'webgl', 'webgpu'] as const;

interface ReferenceTest {
  name: string;
  // Column ids of the form `<library>:<renderer>` (e.g. openfl:webgl, flight:canvas).
  renderers: string[];
}

const projectRoot = resolve(__dirname, '../..');
const referenceDir = join(projectRoot, 'tests/reference');
// Flight reference impls reuse the functional render harness: the @ft/render targets, the per-backend
// createFunctionalTarget, and the in-page render verifier all live there, so this tool depends on it.
const harnessDir = join(projectRoot, 'tests/functional/_harness');

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

// A column id is `<library>:<renderer>`; the colon is not URL/path safe, so routes and emitted files
// use this hyphenated segment. The id stays the logical key and is carried alongside, never rebuilt
// from the segment.
function routeSegment(column: string): string {
  return column.replace(':', '-');
}

// Columns contributed by one library subdir of a reference test, discovered by filename:
//   app.<r>.ts     → an explicit "<lib>:<r>" column (the file forces that renderer)
//   render.<r>.ts  → a "<lib>:<r>" column backed by a self-contained per-backend target (no app.ts)
//   bare app.ts    → the library's default backend set (package.json `renderers` ?? all backends)
function libraryColumns(testDir: string, lib: string): string[] {
  const srcDir = join(testDir, lib, 'src');
  if (!existsSync(srcDir)) return [];
  const files = readdirSync(srcDir);
  const appRenderers = files
    .map((f) => /^app\.([a-z0-9]+)\.ts$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1]);
  if (appRenderers.length > 0) return appRenderers.sort().map((r) => `${lib}:${r}`);
  const customRenderers = BACKENDS.filter((r) => existsSync(join(srcDir, `render.${r}.ts`)));
  if (customRenderers.length > 0) return customRenderers.map((r) => `${lib}:${r}`);
  if (existsSync(join(srcDir, 'app.ts'))) {
    const pkgPath = join(testDir, lib, 'package.json');
    const pkg = existsSync(pkgPath) ? (JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>) : {};
    const renderers = (pkg.renderers as string[] | undefined) ?? [...BACKENDS];
    return renderers.map((r) => `${lib}:${r}`);
  }
  return [];
}

// Reference libraries (openfl, a future starling, …) lead; the Flight port always comes last.
function orderLibraries(libs: string[]): string[] {
  const refs = libs.filter((l) => l !== 'flight').sort();
  return libs.includes('flight') ? [...refs, 'flight'] : refs;
}

function discoverTests(): ReferenceTest[] {
  if (!existsSync(referenceDir)) return [];
  return readdirSync(referenceDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_harness')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name }) => {
      const testDir = join(referenceDir, name);
      const libs = orderLibraries(
        readdirSync(testDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name),
      );
      return { name, renderers: libs.flatMap((lib) => libraryColumns(testDir, lib)) };
    })
    .filter((t) => t.renderers.length > 0);
}

// The module imported for a column's rendered page. An openfl `app.<r>.ts` and a bare `render.<r>.ts`
// (no app.ts) are self-contained → imported directly; a Flight `app.ts` is imported via the `___ref___`
// indirection so it carries `?render=<r>` and its `@ft/render` / `./render` imports resolve per backend.
function entryModuleSource(name: string, column: string): string | null {
  const [lib, r] = splitFirst(column, ':');
  const srcDir = join(referenceDir, name, lib, 'src');
  if (existsSync(join(srcDir, `app.${r}.ts`))) return join(srcDir, `app.${r}.ts`);
  if (existsSync(join(srcDir, 'app.ts'))) return `___ref___${name}:${lib}:${r}`;
  if (existsSync(join(srcDir, `render.${r}.ts`))) return join(srcDir, `render.${r}.ts`);
  return null;
}

function ftRenderModule(renderer: string): string | null {
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

function buildEntryHtml(name: string, column: string, scriptSrc: string, assetBase: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <base href="${assetBase}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} · ${column}</title>
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

function referenceTestsPlugin(tests: ReferenceTest[]): Plugin[] {
  let viteBase = '/';
  let outDir = resolve(__dirname, 'dist');

  return [
    {
      name: 'reference-tests:modules',
      enforce: 'pre',

      config(_, { command }) {
        if (command !== 'build') return;
        const input: Record<string, string> = { main: resolve(__dirname, 'index.html') };
        for (const test of tests) {
          for (const column of test.renderers) {
            input[`tests/${test.name}/${routeSegment(column)}/index`] = `virtual:ref-entry:${test.name}:${column}`;
          }
        }
        return {
          build: {
            rollupOptions: {
              input,
              output: {
                entryFileNames(chunk) {
                  const id = chunk.facadeModuleId;
                  if (id?.startsWith('\0virtual:ref-entry:')) {
                    const [name, column] = splitFirst(id.slice('\0virtual:ref-entry:'.length), ':');
                    return `tests/${name}/${routeSegment(column)}/index.js`;
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
        if (source === 'virtual:reference-test-list') return '\0virtual:reference-test-list';
        if (source.startsWith('virtual:ref-entry:')) return '\0' + source;

        if (source.startsWith('___ref___')) {
          const [name, libRest] = splitFirst(source.slice('___ref___'.length), ':');
          const [lib, render] = splitFirst(libRest, ':');
          return join(referenceDir, name, lib, 'src', 'app.ts') + '?render=' + render;
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

        if (source === './render' && importer) {
          const match = importer.match(/\?render=([^&]+)/);
          if (match) {
            return resolve(dirname(importer.split('?')[0]), `render.${match[1]}.ts`);
          }
        }
      },

      load(id) {
        if (id === '\0virtual:reference-test-list') {
          // Re-scan on each load so a newly added reference folder appears after an HMR reload.
          return `export const tests = ${JSON.stringify(discoverTests())};`;
        }

        if (id.startsWith('\0virtual:ft-render:')) {
          return ftRenderModule(id.slice('\0virtual:ft-render:'.length));
        }

        if (id.startsWith('\0virtual:ref-entry:')) {
          const [name, column] = splitFirst(id.slice('\0virtual:ref-entry:'.length), ':');
          const moduleSrc = entryModuleSource(name, column);
          if (!moduleSrc) return null;
          const [lib, renderer] = splitFirst(column, ':');
          // Install the console-capture sink first (dynamic import below so it runs before module-init logs).
          const head = [
            `import { createConsoleCaptureSink, setLogSink } from '@flighthq/log';`,
            `setLogSink(createConsoleCaptureSink());`,
          ];
          // Flight columns run the in-page verifier (not-blank + oracle) — but it is a capture/CI gate,
          // not dev-view behavior, so run it ONLY under capture mode (window.__flightCapture, set by the
          // capture harness). Plain `dev:reference` browsing then never throws a blank-render error. Keyed
          // on the BARE renderer so verify.ts's dom/webgpu branches fire (the prefixed column id would
          // wrongly run not-blank on DOM and skip the WebGPU read-back the capture harness needs).
          if (lib === 'flight') {
            return [
              ...head,
              `const __testModule = await import(${JSON.stringify(moduleSrc)});`,
              `if (window['__flightCapture']) {`,
              `  const { runRenderVerification } = await import(${JSON.stringify(join(harnessDir, 'verify.ts'))});`,
              `  await runRenderVerification(__testModule, ${JSON.stringify(renderer)});`,
              `}`,
            ].join('\n');
          }
          // Reference-library columns (openfl, …) are visual references, not SDK renders — the verifier
          // asserts Flight rendered, so it must not run here. Only Tier 1 (page errors) gates them.
          return [...head, `await import(${JSON.stringify(moduleSrc)});`].join('\n');
        }
      },

      generateBundle(_, bundle) {
        for (const test of tests) {
          for (const column of test.renderers) {
            const entryId = `\0virtual:ref-entry:${test.name}:${column}`;
            const chunk = Object.values(bundle).find(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (c) => c.type === 'chunk' && (c as any).facadeModuleId === entryId,
            ) as { fileName: string } | undefined;
            if (!chunk) continue;
            this.emitFile({
              type: 'asset',
              fileName: `tests/${test.name}/${routeSegment(column)}/index.html`,
              source: buildEntryHtml(test.name, column, `${viteBase}${chunk.fileName}`, `${viteBase}test-assets/`),
            });
          }
        }
      },

      writeBundle() {
        // One flat pool for all reference assets; every render page's <base href> points here. File
        // names are globally unique, so identical files across columns/tests are stored once.
        const pool = join(outDir, 'test-assets');
        const sources = [join(referenceDir, 'public')];
        for (const test of tests) {
          const testDir = join(referenceDir, test.name);
          for (const lib of readdirSync(testDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
            sources.push(join(testDir, lib.name, 'public'));
          }
          sources.push(join(testDir, 'public'));
        }
        for (const src of sources) {
          if (existsSync(src)) copyDirectoryContents(src, pool);
        }
      },
    },

    {
      name: 'reference-tests:routes',

      configureServer(server) {
        const refresh = (): void => {
          const mod = server.moduleGraph.getModuleById('\0virtual:reference-test-list');
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        };
        server.watcher.add(referenceDir);
        server.watcher.on('addDir', refresh);
        server.watcher.on('unlinkDir', refresh);
        server.watcher.on('add', (file) => {
          if (file.endsWith('.ts') || file.endsWith('package.json')) refresh();
        });

        server.middlewares.use((req, res, next) => {
          const urlPath = (req.url ?? '/').split('?')[0];
          const parts = urlPath.split('/').filter(Boolean);
          if (parts[0] !== 'tests' || parts.length < 3) return next();
          const [, name, segment, ...assetParts] = parts;

          const test = discoverTests().find(
            (t) => t.name === name && t.renderers.some((r) => routeSegment(r) === segment),
          );
          if (!test) return next();
          const column = test.renderers.find((r) => routeSegment(r) === segment)!;
          const [lib] = splitFirst(column, ':');

          if (assetParts.length > 0) {
            const assetRel = assetParts.join('/');
            const candidates = [
              join(referenceDir, name, lib, 'public', assetRel),
              join(referenceDir, name, 'public', assetRel),
              join(referenceDir, 'public', assetRel),
            ];
            for (const candidate of candidates) {
              if (existsSync(candidate)) {
                res.setHeader('Content-Type', MIME[extname(candidate)] ?? 'application/octet-stream');
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
  <title>${name} · ${column}</title>
  <style>*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: sans-serif; font-size: 16px; overflow: hidden; }</style>
  <script>
    function __refShowError(msg) {
      var el = document.getElementById('ref-error');
      if (!el) {
        el = document.createElement('pre');
        el.id = 'ref-error';
        el.style.cssText = 'position:fixed;inset:0;margin:0;padding:1em;background:#1a0000;color:#ff6b6b;font-size:13px;font-family:monospace;overflow:auto;z-index:9999;white-space:pre-wrap;word-break:break-word;';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      try { window.parent.console.error('[${name}/${column}]', msg); } catch (_) {}
    }
    window.addEventListener('error', function(e) {
      __refShowError((e.error && e.error.stack) || e.message || String(e));
    });
    window.addEventListener('unhandledrejection', function(e) {
      __refShowError((e.reason && e.reason.stack) || String(e.reason));
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
  <script type="module" src="/@id/__x00__virtual:ref-entry:${name}:${column}"></script>
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

  const alias: Record<string, string> = {
    ...Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, pkg.dir + '/src'])),
    openfl: join(projectRoot, 'node_modules', 'openfl', 'lib', 'openfl'),
  };

  return {
    root: __dirname,
    base: process.env.VITE_BASE ?? '/',
    plugins: referenceTestsPlugin(tests),
    resolve: { alias, preserveSymlinks: false },
    optimizeDeps: { exclude: workspacePackages.map((p) => p.name) },
    server: { fs: { allow: [projectRoot] }, watch: { followSymlinks: true } },
  };
});
