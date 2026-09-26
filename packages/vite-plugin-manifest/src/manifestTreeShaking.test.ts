import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BUILT_IN_REQUIREMENT_BACKENDS,
  BUILT_IN_REQUIREMENT_CATALOG_ENTRIES,
  BUILT_IN_REQUIREMENT_TRANSLATIONS,
} from '@flighthq/requirement-catalog/contract';
import { RequirementFacet } from '@flighthq/types/contract';
import { build } from 'vite';

import { MANIFEST_PARSER_BACKEND } from './manifestModuleSource.ts';
import { createManifestPlugin, MANIFEST_QUERY_SUFFIX } from './manifestPlugin.ts';

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
      expect(bundle).toContain('swf.DefineShape');
      expect(bundle).toContain('nodeRenderers');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'retains BOTH canvas and gl when the entry imports both fragments',
    async () => {
      const dir = await project();
      await writeFile(
        join(dir, 'src', 'main.js'),
        `import { canvasOptions, glOptions } from './asset.swf${MANIFEST_QUERY_SUFFIX}';\n` +
          'globalThis.out = [canvasOptions, glOptions];\n',
      );
      const bundle = await bundleOf(dir);

      // A canvas fragment is a Partial<CanvasRenderStateOptions> spread straight into
      // createCanvasRenderState(options), so canvas carries real implementations and both survive.
      // wgpu and the parser do not, which is what makes this a retention test rather than a tautology.
      expect(bundle).toContain('CANVAS_IMPLEMENTATION_MARKER');
      expect(bundle).toContain('GL_IMPLEMENTATION_MARKER');
      expect(bundle).not.toContain('WGPU_IMPLEMENTATION_MARKER');
      expect(bundle).not.toContain('PARSER_IMPLEMENTATION_MARKER');
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
    entry('canvas', RequirementFacet.DocumentFormat, 'swf.DefineShape', 'canvasDefineShape', impl('canvas')),
    entry('gl', RequirementFacet.DocumentFormat, 'swf.DefineShape', 'glDefineShape', impl('gl')),
    entry('wgpu', RequirementFacet.DocumentFormat, 'swf.DefineShape', 'wgpuDefineShape', impl('wgpu')),
    entry(
      MANIFEST_PARSER_BACKEND,
      RequirementFacet.DocumentFormat,
      'swf.DefineShape',
      'parserDefineShape',
      impl('parser'),
    ),
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
  await writeFile(join(dir, 'src', 'asset.swf'), Buffer.from(createSwfWithDefineShape()));
  for (const backend of ['canvas', 'gl', 'wgpu', 'parser']) {
    await writeFile(
      join(dir, 'src', `${backend}Impl.js`),
      `export const ${backend}DefineShape = '${backend.toUpperCase()}_IMPLEMENTATION_MARKER';\n`,
    );
  }
  return dir;
}

function createSwfWithDefineShape(): Uint8Array {
  const body = new Uint8Array([0x00, 0x00, 0x18, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00]);
  const file = new Uint8Array(8 + body.length);
  file.set([0x46, 0x57, 0x53, 9], 0);
  new DataView(file.buffer).setUint32(4, file.length, true);
  file.set(body, 8);
  return file;
}

// ★ A REAL VITE BUILD, WITH THE @flighthq PACKAGES LEFT EXTERNAL. Rollup resolves every static import
// before it shakes anything, and these packages resolve through their `dist`, which is gitignored and
// which the unit lane does not build — so a non-external build here would fail on a missing bundle rather
// than on anything this test is about. External keeps the import statements verbatim in the output, which
// is what makes the assertions below possible: they read the specifier and the ordered array a consumer's
// build actually emits.
describe('vite build of a rich-format manifest', () => {
  it(
    'emits the COLLADA decoders in family order, through a real build',
    async () => {
      const dir = await richProject('asset.dae', colladaFile(EVERY_COLLADA_FEATURE));
      await writeFile(
        join(dir, 'src', 'main.js'),
        `import { parserOptions } from './asset.dae${MANIFEST_QUERY_SUFFIX}';\nglobalThis.out = parserOptions;\n`,
      );
      const bundle = await richBundleOf(dir);
      expect(bundle).toContain('from "@flighthq/scene3d-formats"');
      expect(bundle.indexOf('colladaMaterialDecoder')).toBeLessThan(bundle.indexOf('colladaGeometryDecoder'));
      expect(bundle).toContain('decoders');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'drops the render fragments when the entry imported only the parser one',
    async () => {
      const dir = await richProject('asset.dae', colladaFile('<library_geometries><geometry/></library_geometries>'));
      await writeFile(
        join(dir, 'src', 'main.js'),
        `import { parserOptions } from './asset.dae${MANIFEST_QUERY_SUFFIX}';\nglobalThis.out = parserOptions;\n`,
      );
      const bundle = await richBundleOf(dir);
      expect(bundle).toContain('colladaGeometryDecoder');
      // A geometry-only document needs no other decoder, and rollup drops the five it never named.
      //
      // The four backend infrastructure imports DO survive, and that is a property of `external` rather
      // than of the manifest: rollup cannot prove an external module is side-effect-free, so it keeps the
      // import even where the value is unused. Shaking the render fragments out is asserted in
      // manifestTreeShaking.test.ts, which resolves its implementations for real.
      expect(bundle).not.toContain('colladaMaterialDecoder');
      expect(bundle).not.toContain('colladaControllerDecoder');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'emits the 3DS handlers a document needs, through a real build',
    async () => {
      const dir = await richProject('asset.3ds', threeDsFile({ materials: 1, meshes: ['Box'] }));
      await writeFile(
        join(dir, 'src', 'main.js'),
        `import { parserOptions } from './asset.3ds${MANIFEST_QUERY_SUFFIX}';\nglobalThis.out = parserOptions;\n`,
      );
      const bundle = await richBundleOf(dir);
      expect(bundle).toContain('threeDsMaterialHandler');
      expect(bundle).toContain('threeDsMeshHandler');
      expect(bundle).not.toContain('threeDsCameraHandler');
      expect(bundle).toContain('handlers');
    },
    BUILD_TIMEOUT_MS,
  );
});

const EVERY_COLLADA_FEATURE =
  '<library_materials><material/></library_materials>' +
  '<library_effects><effect/></library_effects>' +
  '<library_cameras><camera/></library_cameras>' +
  '<library_geometries><geometry/></library_geometries>' +
  '<library_controllers><controller/></library_controllers>' +
  '<library_animations><animation/></library_animations>' +
  '<library_lights><light/></library_lights>';

async function richProject(name: string, content: Uint8Array): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rich-format-build-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', name), Buffer.from(content));
  return dir;
}

async function richBundleOf(dir: string): Promise<string> {
  await build({
    build: {
      minify: false,
      outDir: join(dir, 'dist'),
      rollupOptions: {
        external: (id: string) => id.startsWith('@flighthq/'),
        input: join(dir, 'src', 'main.js'),
      },
      write: true,
    },
    configFile: false,
    logLevel: 'silent',
    plugins: [
      createManifestPlugin({
        catalog: {
          backends: BUILT_IN_REQUIREMENT_BACKENDS,
          entries: [...BUILT_IN_REQUIREMENT_CATALOG_ENTRIES],
          translations: BUILT_IN_REQUIREMENT_TRANSLATIONS,
        },
        onDiagnostic: () => {},
      }),
    ],
    root: dir,
  });
  const outDir = join(dir, 'dist');
  const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => join(entry.parentPath ?? outDir, entry.name));
  return (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
}

function colladaFile(libraries: string): Uint8Array {
  return new TextEncoder().encode(
    `<?xml version="1.0"?>\n<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">${libraries}</COLLADA>`,
  );
}

function chunk(id: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(6 + payload.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, id, true);
  view.setUint32(2, out.length, true);
  out.set(payload, 6);
  return out;
}

function bytes(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function name(text: string): Uint8Array {
  return new TextEncoder().encode(`${text}\0`);
}

function threeDsFile(features: {
  cameras?: readonly string[];
  keyframes?: readonly string[];
  lights?: readonly string[];
  materials?: number;
  meshes?: readonly string[];
}): Uint8Array {
  const THREE_DS_MAIN = 0x4d4d;
  const THREE_DS_EDITOR = 0x3d3d;
  const THREE_DS_KEYFRAME = 0xb000;
  const THREE_DS_KEYFRAME_OBJECT_NODE = 0xb002;
  const THREE_DS_OBJECT = 0x4000;
  const THREE_DS_TRIMESH = 0x4100;
  const THREE_DS_LIGHT = 0x4600;
  const THREE_DS_CAMERA = 0x4700;
  const THREE_DS_MATERIAL = 0xafff;

  const editorParts: Uint8Array[] = [];
  for (let index = 0; index < (features.materials ?? 0); index++) {
    editorParts.push(chunk(THREE_DS_MATERIAL, new Uint8Array(0)));
  }
  for (const mesh of features.meshes ?? []) {
    editorParts.push(chunk(THREE_DS_OBJECT, bytes(name(mesh), chunk(THREE_DS_TRIMESH, new Uint8Array(0)))));
  }
  for (const light of features.lights ?? []) {
    editorParts.push(chunk(THREE_DS_OBJECT, bytes(name(light), chunk(THREE_DS_LIGHT, new Uint8Array(12)))));
  }
  for (const camera of features.cameras ?? []) {
    editorParts.push(chunk(THREE_DS_OBJECT, bytes(name(camera), chunk(THREE_DS_CAMERA, new Uint8Array(32)))));
  }
  const parts: Uint8Array[] = [chunk(THREE_DS_EDITOR, bytes(...editorParts))];
  const keyframeParts = (features.keyframes ?? []).map(() => chunk(THREE_DS_KEYFRAME_OBJECT_NODE, new Uint8Array(0)));
  if (keyframeParts.length > 0) parts.push(chunk(THREE_DS_KEYFRAME, bytes(...keyframeParts)));
  return chunk(THREE_DS_MAIN, bytes(...parts));
}
