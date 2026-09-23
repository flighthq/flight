import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RequirementFacet } from '@flighthq/types/contract';
import { build } from 'vite';

import { MANIFEST_PARSER_BACKEND } from './manifestModuleSource';
import { createManifestPlugin, MANIFEST_QUERY_SUFFIX } from './manifestPlugin';

// Tree shaking is a property of a BUNDLER, not of the emitted string. Reading the generated source
// only shows what was offered; these tests run a real Vite production build and read what survived.
const BUILD_TIMEOUT_MS = 60_000;

describe('vite build', () => {
  it(
    'keeps only the backend fragment the entry imported, dropping the other implementations',
    async () => {
      const dir = await project();
      await writeFile(
        join(dir, 'src', 'main.js'),
        `import { glOptions } from './asset.swf${MANIFEST_QUERY_SUFFIX}';\nglobalThis.out = glOptions;\n`,
      );
      const bundle = await bundleOf(dir);

      expect(bundle).toContain('GL_IMPLEMENTATION_MARKER');
      expect(bundle).not.toContain('CANVAS_IMPLEMENTATION_MARKER');
      expect(bundle).not.toContain('WGPU_IMPLEMENTATION_MARKER');
      expect(bundle).not.toContain('PARSER_IMPLEMENTATION_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'keeps only the parser fragment when that is what the entry imported',
    async () => {
      const dir = await project();
      await writeFile(
        join(dir, 'src', 'main.js'),
        `import { parserOptions } from './asset.swf${MANIFEST_QUERY_SUFFIX}';\nglobalThis.out = parserOptions;\n`,
      );
      const bundle = await bundleOf(dir);

      expect(bundle).toContain('PARSER_IMPLEMENTATION_MARKER');
      expect(bundle).not.toContain('GL_IMPLEMENTATION_MARKER');
      expect(bundle).not.toContain('CANVAS_IMPLEMENTATION_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'keeps every implementation an entry actually imports, across two backends',
    async () => {
      const dir = await project();
      await writeFile(
        join(dir, 'src', 'main.js'),
        `import { glOptions, wgpuOptions } from './asset.swf${MANIFEST_QUERY_SUFFIX}';\n` +
          'globalThis.out = [glOptions, wgpuOptions];\n',
      );
      const bundle = await bundleOf(dir);

      expect(bundle).toContain('GL_IMPLEMENTATION_MARKER');
      expect(bundle).toContain('WGPU_IMPLEMENTATION_MARKER');
      expect(bundle).not.toContain('PARSER_IMPLEMENTATION_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'produces a spreadable fragment carrying the kind the content required',
    async () => {
      const dir = await project();
      await writeFile(
        join(dir, 'src', 'main.js'),
        `import { glOptions } from './asset.swf${MANIFEST_QUERY_SUFFIX}';\nglobalThis.out = glOptions;\n`,
      );
      const bundle = await bundleOf(dir);
      // The fragment reaches the bundle as a real Map literal keyed by the requirement's kind, which is
      // what lets an application spread it straight into createGlRenderState.
      expect(bundle).toContain('ShowFrame');
      expect(bundle).toContain('nodeRenderers');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'keeps gl while canvas contributes nothing, because CanvasRenderOptions has no map fields',
    async () => {
      const dir = await project();
      await writeFile(
        join(dir, 'src', 'main.js'),
        `import { canvasOptions, glOptions } from './asset.swf${MANIFEST_QUERY_SUFFIX}';\n` +
          'globalThis.out = [canvasOptions, glOptions];\n',
      );
      const bundle = await bundleOf(dir);

      // GL survives because its fragment carries a real Map. Canvas contributes nothing — not because
      // the bundler shook it out, but because the plugin emits `canvasOptions = {}` and REPORTS the
      // dropped row: CanvasRenderOptions declares no kind-keyed field for it to spread into. This pins
      // today's truth; it changes the moment the canvas construction API gains one.
      expect(bundle).toContain('GL_IMPLEMENTATION_MARKER');
      expect(bundle).not.toContain('CANVAS_IMPLEMENTATION_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );
});

async function bundleOf(dir: string): Promise<string> {
  await build({
    build: {
      minify: false,
      outDir: join(dir, 'dist'),
      rollupOptions: { input: join(dir, 'src', 'main.js') },
      write: true,
    },
    configFile: false,
    logLevel: 'silent',
    plugins: [createManifestPlugin({ catalog: { entries: catalogEntries(dir) }, onDiagnostic: () => {} })],
    root: dir,
  });
  const outDir = join(dir, 'dist');
  const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => join(e.parentPath ?? outDir, e.name));
  const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  return contents.join('\n');
}

function catalogEntries(dir: string) {
  const impl = (backend: string) => join(dir, 'src', `${backend}Impl.js`);
  return [
    entry('canvas', RequirementFacet.DocumentFormat, 'ShowFrame', 'canvasShowFrame', impl('canvas')),
    entry('gl', RequirementFacet.DocumentFormat, 'ShowFrame', 'glShowFrame', impl('gl')),
    entry('wgpu', RequirementFacet.DocumentFormat, 'ShowFrame', 'wgpuShowFrame', impl('wgpu')),
    entry(MANIFEST_PARSER_BACKEND, RequirementFacet.DocumentFormat, 'ShowFrame', 'parserShowFrame', impl('parser')),
  ];
}

function entry(backend: string, facet: string, kind: string, symbol: string, module: string) {
  return {
    backend,
    facet: facet as never,
    implementationImport: module,
    implementationSymbol: symbol,
    kind,
    registrarImport: module,
    registrarSymbol: `register${kind}`,
  };
}

async function project(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'flight-vite-build-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', 'asset.swf'), Buffer.from(createSwfWithShowFrame()));
  for (const backend of ['canvas', 'gl', 'wgpu', 'parser']) {
    await writeFile(
      join(dir, 'src', `${backend}Impl.js`),
      `export const ${backend}ShowFrame = '${backend.toUpperCase()}_IMPLEMENTATION_MARKER';\n`,
    );
  }
  return dir;
}

function createSwfWithShowFrame(): Uint8Array {
  const body = new Uint8Array([0x00, 0x00, 0x18, 0x01, 0x00, 0x40, 0x00, 0x00, 0x00]);
  const file = new Uint8Array(8 + body.length);
  file.set([0x46, 0x57, 0x53, 9], 0);
  new DataView(file.buffer).setUint32(4, file.length, true);
  file.set(body, 8);
  return file;
}
