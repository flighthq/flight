import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeUTF8 } from '@flighthq/encoding/contract';
import { BUILT_IN_REQUIREMENT_TRANSLATIONS } from '@flighthq/requirement-catalog/contract';
import { MD2_HEADER_SIZE, MD2_MAGIC, MD2_VERSION } from '@flighthq/scene3d-formats/contract';
import { RequirementFacet } from '@flighthq/types/contract';
import { build } from 'vite';

import { createManifestPlugin, MANIFEST_QUERY_SUFFIX } from './manifestPlugin.ts';

// Real Vite builds that prove 3D format assets resolve through the ?manifest virtual import path,
// bundle consumer entry points, and tree-shake to only the expected render implementations. These
// complement the in-process builtInCatalog3dResolution tests: resolution correctness is established
// there, bundler-level survival is established here.
const BUILD_TIMEOUT_MS = 60_000;

describe('vite build with 3D format content', () => {
  it(
    'bundles only the gl material renderer for a material-bearing 3DS, dropping wgpu',
    async () => {
      const dir = await project3d('.3ds', threeDsWithMaterial());
      await writeEntry(dir, '.3ds', 'glOptions');
      const bundle = await bundleOf(dir);

      expect(bundle).toContain('GL_BLINNPHONG_MARKER');
      expect(bundle).not.toContain('WGPU_BLINNPHONG_MARKER');
      expect(bundle).not.toContain('GL_STANDARDPBR_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'bundles no material renderer for a mesh-only 3DS',
    async () => {
      const dir = await project3d('.3ds', threeDsWithMeshOnly());
      await writeEntry(dir, '.3ds', 'glOptions');
      const bundle = await bundleOf(dir);

      expect(bundle).not.toContain('GL_BLINNPHONG_MARKER');
      expect(bundle).not.toContain('WGPU_BLINNPHONG_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'bundles StandardPbr for a material-bearing COLLADA on gl, drops BlinnPhong',
    async () => {
      const dir = await project3d('.dae', encodeUTF8(FULL_COLLADA));
      await writeEntry(dir, '.dae', 'glOptions');
      const bundle = await bundleOf(dir);

      expect(bundle).toContain('GL_STANDARDPBR_MARKER');
      expect(bundle).not.toContain('GL_BLINNPHONG_MARKER');
      expect(bundle).not.toContain('WGPU_STANDARDPBR_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'bundles no material renderer for a geometry-only COLLADA',
    async () => {
      const dir = await project3d('.dae', encodeUTF8(GEOMETRY_ONLY_COLLADA));
      await writeEntry(dir, '.dae', 'glOptions');
      const bundle = await bundleOf(dir);

      expect(bundle).not.toContain('GL_STANDARDPBR_MARKER');
      expect(bundle).not.toContain('GL_BLINNPHONG_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'bundles BlinnPhong for a skin-bearing MD2 on wgpu',
    async () => {
      const dir = await project3d('.md2', md2WithSkins());
      await writeEntry(dir, '.md2', 'wgpuOptions');
      const bundle = await bundleOf(dir);

      expect(bundle).toContain('WGPU_BLINNPHONG_MARKER');
      expect(bundle).not.toContain('GL_BLINNPHONG_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'bundles no material renderer for a mesh-only MD2',
    async () => {
      const dir = await project3d('.md2', md2MeshOnly());
      await writeEntry(dir, '.md2', 'glOptions');
      const bundle = await bundleOf(dir);

      expect(bundle).not.toContain('GL_BLINNPHONG_MARKER');
      expect(bundle).not.toContain('WGPU_BLINNPHONG_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'bundles BlinnPhong for a full MD5 mesh',
    async () => {
      const dir = await project3d('.md5mesh', encodeUTF8(FULL_MD5_MESH));
      await writeEntry(dir, '.md5mesh', 'glOptions');
      const bundle = await bundleOf(dir);

      expect(bundle).toContain('GL_BLINNPHONG_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'bundles no material renderer for MD5 anim — animations carry no material',
    async () => {
      const dir = await project3d('.md5anim', encodeUTF8(FULL_MD5_ANIM));
      await writeEntry(dir, '.md5anim', 'glOptions');
      const bundle = await bundleOf(dir);

      expect(bundle).not.toContain('GL_BLINNPHONG_MARKER');
      expect(bundle).not.toContain('GL_STANDARDPBR_MARKER');
      expect(bundle).not.toContain('WGPU_BLINNPHONG_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'bundles both BlinnPhong and StandardPbr for a material-bearing OBJ',
    async () => {
      const dir = await project3d('.obj', encodeUTF8(FULL_OBJ));
      await writeEntry(dir, '.obj', 'glOptions');
      const bundle = await bundleOf(dir);

      expect(bundle).toContain('GL_BLINNPHONG_MARKER');
      expect(bundle).toContain('GL_STANDARDPBR_MARKER');
      expect(bundle).not.toContain('WGPU_BLINNPHONG_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'bundles no material renderer for a geometry-only OBJ',
    async () => {
      const dir = await project3d('.obj', encodeUTF8(MINIMAL_OBJ));
      await writeEntry(dir, '.obj', 'glOptions');
      const bundle = await bundleOf(dir);

      expect(bundle).not.toContain('GL_BLINNPHONG_MARKER');
      expect(bundle).not.toContain('GL_STANDARDPBR_MARKER');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'feature-rich bundle is larger than minimal bundle for the same format',
    async () => {
      const minDir = await project3d('.md2', md2MeshOnly());
      await writeEntry(minDir, '.md2', 'glOptions');
      const minBundle = await bundleOf(minDir);

      const fullDir = await project3d('.md2', md2WithSkins());
      await writeEntry(fullDir, '.md2', 'glOptions');
      const fullBundle = await bundleOf(fullDir);

      expect(fullBundle.length).toBeGreaterThan(minBundle.length);
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'reports unreadable diagnostic through the plugin path for corrupt 3DS',
    async () => {
      const dir = await project3d('.3ds', new Uint8Array([0x00]));
      await writeEntry(dir, '.3ds', 'glOptions');
      const diagnostics: string[] = [];
      await bundleOf(dir, diagnostics);
      expect(diagnostics.some((d) => d.includes('unreadable'))).toBe(true);
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'reports unreadable diagnostic through the plugin path for non-COLLADA XML',
    async () => {
      const dir = await project3d('.dae', encodeUTF8('<root/>'));
      await writeEntry(dir, '.dae', 'glOptions');
      const diagnostics: string[] = [];
      await bundleOf(dir, diagnostics);
      expect(diagnostics.some((d) => d.includes('unreadable'))).toBe(true);
    },
    BUILD_TIMEOUT_MS,
  );
});

async function writeEntry(dir: string, ext: string, exportName: string): Promise<void> {
  await writeFile(
    join(dir, 'src', 'main.js'),
    `import { ${exportName} } from './asset${ext}${MANIFEST_QUERY_SUFFIX}';\nglobalThis.out = ${exportName};\n`,
  );
}

async function bundleOf(dir: string, diagnostics?: string[]): Promise<string> {
  await build({
    build: {
      minify: false,
      outDir: join(dir, 'dist'),
      rollupOptions: { input: join(dir, 'src', 'main.js') },
      write: true,
    },
    configFile: false,
    logLevel: 'silent',
    plugins: [
      createManifestPlugin({
        catalog: {
          entries: materialCatalogEntries(dir),
          translations: BUILT_IN_REQUIREMENT_TRANSLATIONS,
        },
        onDiagnostic: (message) => diagnostics?.push(message),
      }),
    ],
    root: dir,
  });
  const outDir = join(dir, 'dist');
  const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => join(e.parentPath ?? outDir, e.name));
  const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  return contents.join('\n');
}

function materialCatalogEntries(dir: string) {
  const impl = (name: string) => join(dir, 'src', `${name}.js`);
  return [
    materialEntry('gl', 'BlinnPhongMaterial', 'glBlinnPhongImpl', impl('glBlinnPhong')),
    materialEntry('gl', 'StandardPbrMaterial', 'glStandardPbrImpl', impl('glStandardPbr')),
    materialEntry('wgpu', 'BlinnPhongMaterial', 'wgpuBlinnPhongImpl', impl('wgpuBlinnPhong')),
    materialEntry('wgpu', 'StandardPbrMaterial', 'wgpuStandardPbrImpl', impl('wgpuStandardPbr')),
  ];
}

function materialEntry(backend: string, kind: string, symbol: string, module: string) {
  return {
    backend,
    facet: RequirementFacet.SceneMaterialKind as never,
    implementationImport: module,
    implementationSymbol: symbol,
    kind,
  };
}

async function project3d(ext: string, content: Uint8Array): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'flight-vite-3d-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', `asset${ext}`), Buffer.from(content));
  const stubs: ReadonlyArray<readonly [string, string]> = [
    ['glBlinnPhong', 'GL_BLINNPHONG_MARKER'],
    ['glStandardPbr', 'GL_STANDARDPBR_MARKER'],
    ['wgpuBlinnPhong', 'WGPU_BLINNPHONG_MARKER'],
    ['wgpuStandardPbr', 'WGPU_STANDARDPBR_MARKER'],
  ];
  for (const [name, marker] of stubs) {
    await writeFile(join(dir, 'src', `${name}.js`), `export const ${name}Impl = '${marker}';\n`);
  }
  return dir;
}

function threeDsWithMaterial(): Uint8Array {
  const materialChunk = threeDsChunk(0xafff, new Uint8Array(0));
  const editorChunk = threeDsChunk(0x3d3d, materialChunk);
  return threeDsChunk(0x4d4d, editorChunk);
}

function threeDsWithMeshOnly(): Uint8Array {
  const trimeshChunk = threeDsChunk(0x4100, new Uint8Array(0));
  const objectName = new Uint8Array([0x4d, 0x00]);
  const objectBody = new Uint8Array(objectName.length + trimeshChunk.length);
  objectBody.set(objectName, 0);
  objectBody.set(trimeshChunk, objectName.length);
  const objectChunk = threeDsChunk(0x4000, objectBody);
  const editorChunk = threeDsChunk(0x3d3d, objectChunk);
  return threeDsChunk(0x4d4d, editorChunk);
}

function threeDsChunk(id: number, body: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(6 + body.length);
  const view = new DataView(chunk.buffer);
  view.setUint16(0, id, true);
  view.setUint32(2, 6 + body.length, true);
  chunk.set(body, 6);
  return chunk;
}

function md2WithSkins(): Uint8Array {
  const buf = new ArrayBuffer(MD2_HEADER_SIZE);
  const view = new DataView(buf);
  view.setInt32(0, MD2_MAGIC, true);
  view.setInt32(4, MD2_VERSION, true);
  view.setInt32(20, 1, true);
  view.setInt32(32, 10, true);
  view.setInt32(40, 1, true);
  return new Uint8Array(buf);
}

function md2MeshOnly(): Uint8Array {
  const buf = new ArrayBuffer(MD2_HEADER_SIZE);
  const view = new DataView(buf);
  view.setInt32(0, MD2_MAGIC, true);
  view.setInt32(4, MD2_VERSION, true);
  view.setInt32(20, 0, true);
  view.setInt32(32, 10, true);
  view.setInt32(40, 1, true);
  return new Uint8Array(buf);
}

const FULL_COLLADA = [
  '<?xml version="1.0"?>',
  '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
  '<library_geometries><geometry id="g"><mesh></mesh></geometry></library_geometries>',
  '<library_materials><material id="m"><instance_effect url="#e"/></material></library_materials>',
  '<library_effects><effect id="e"><profile_COMMON></profile_COMMON></effect></library_effects>',
  '</COLLADA>',
].join('\n');

const GEOMETRY_ONLY_COLLADA = [
  '<?xml version="1.0"?>',
  '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
  '<library_geometries><geometry id="g"><mesh></mesh></geometry></library_geometries>',
  '</COLLADA>',
].join('\n');

const MINIMAL_OBJ = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';

const FULL_OBJ = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nmtllib foo.mtl\nusemtl bar\n';

const FULL_MD5_MESH = 'joints {\n}\nmesh {\nshader "body"\n}\n';

const FULL_MD5_ANIM = 'hierarchy {\n}\nframe 0 {\n}\n';
