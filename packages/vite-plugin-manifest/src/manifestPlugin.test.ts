import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { sdkHostDecompressDeflate } from '@flighthq/compression/contract';
import { createRequirementSet } from '@flighthq/requirement/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { MANIFEST_PARSER_BACKEND } from './manifestModuleSource';
import { createManifestPlugin, MANIFEST_QUERY_SUFFIX } from './manifestPlugin';

describe('createManifestPlugin', () => {
  it('claims only ?manifest imports, resolving them against the importer directory', async () => {
    const plugin = createManifestPlugin({ catalog: { entries: [] } });
    expect(plugin.resolveId('./asset.swf')).toBeNull();
    expect(plugin.resolveId('./styles.css')).toBeNull();
    const resolved = plugin.resolveId(`./asset.swf${MANIFEST_QUERY_SUFFIX}`, '/project/src/main.ts')!;
    expect(resolved.startsWith('\0flight-manifest:')).toBe(true);
    expect(resolved.endsWith('/project/src/asset.swf')).toBe(true);
  });

  it('loads nothing for an id it did not resolve', async () => {
    const plugin = createManifestPlugin({ catalog: { entries: [] } });
    expect(await plugin.load('/project/src/main.ts')).toBeNull();
  });

  it('serves fragments for the one file imported, resolved across every backend', async () => {
    const { dir, plugin } = await fixture();
    const source = (await load(plugin, dir, 'a.swf'))!;
    expect(source).toContain("import { glDefineShape } from '@acme/gl';");
    expect(source).toContain("import { wgpuDefineShape } from '@acme/wgpu';");
    expect(source).toContain(
      "export const glOptions = {\n  nodeRenderers: new Map([\n    ['swf.DefineShape', glDefineShape],",
    );
    expect(source).toContain(
      "export const wgpuOptions = {\n  nodeRenderers: new Map([\n    ['swf.DefineShape', wgpuDefineShape],",
    );
    // canvas and dom carry no kind-keyed options fields on base, so their fragments are empty and
    // still exported — an application can spread every fragment unconditionally.
    expect(source).toContain('export const canvasOptions = {};');
    expect(source).toContain('export const domOptions = {};');
  });

  it('reads the exact file imported, so two documents give different modules', async () => {
    const { dir, plugin } = await fixture();
    await writeFile(join(dir, 'b.swf'), Buffer.from(createSwf(TAG_SET_BACKGROUND_COLOR)));
    const a = await load(plugin, dir, 'a.swf');
    const b = await load(plugin, dir, 'b.swf');
    expect(a).not.toBe(b);
    expect(a).toContain("['swf.DefineShape', wgpuDefineShape]");
    expect(b).toContain('export const wgpuOptions = {};');
  });

  it('invalidates per imported source, leaving other files cached', async () => {
    const { dir, plugin } = await fixture();
    await writeFile(join(dir, 'b.swf'), Buffer.from(createSwf(TAG_DEFINE_SHAPE)));
    const beforeA = await load(plugin, dir, 'a.swf');
    const beforeB = await load(plugin, dir, 'b.swf');

    // Rewrite a.swf to content with no DefineShape, then invalidate ONLY a.swf.
    await writeFile(join(dir, 'a.swf'), Buffer.from(createSwf(TAG_SET_BACKGROUND_COLOR)));
    await writeFile(join(dir, 'b.swf'), Buffer.from(createSwf(TAG_SET_BACKGROUND_COLOR)));
    plugin.handleHotUpdate({ file: join(dir, 'a.swf') });

    expect(await load(plugin, dir, 'a.swf')).not.toBe(beforeA);
    // b.swf changed on disk too, but nothing invalidated it, so its cached module must stand.
    expect(await load(plugin, dir, 'b.swf')).toBe(beforeB);
  });

  it('reports an unsupported format and still serves a spreadable empty module', async () => {
    const { dir, diagnostics, plugin } = await fixture();
    await writeFile(join(dir, 'notes.txt'), 'not content');
    const source = (await load(plugin, dir, 'notes.txt'))!;
    expect(diagnostics.some((m) => m.includes('unsupported content format'))).toBe(true);
    expect(source).toContain('export const canvasOptions = {};');
    expect(source).toContain('export const parserOptions = {};');
  });

  // Downstream report: a CWS SWF and a deflate AWD produced `parserOptions = {}` with NO diagnostic,
  // because nothing is "unresolved" when nothing was read. That is a bundle missing every handler the
  // content needed — exactly what onDiagnostic exists to prevent.
  it('REPORTS compressed content it cannot decode, instead of emitting an empty manifest silently', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-vite-'));
    await writeFile(join(dir, 'a.swf'), Buffer.from(compressedSwf()));
    const diagnostics: string[] = [];
    const plugin = createManifestPlugin({
      catalog: { entries: [] },
      onDiagnostic: (message) => diagnostics.push(message),
    });
    const source = (await load(plugin, dir, 'a.swf'))!;
    expect(source).toContain('export const parserOptions = {};');
    expect(diagnostics.some((m) => m.includes('unreadable content') && m.includes('deflate/lzma'))).toBe(true);
  });

  it('reads that same compressed file once a deflate capability is supplied', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-vite-'));
    await writeFile(join(dir, 'a.swf'), Buffer.from(compressedSwf()));
    const diagnostics: string[] = [];
    const plugin = createManifestPlugin({
      catalog: {
        entries: [
          entry(MANIFEST_PARSER_BACKEND, RequirementFacet.DocumentFormat, 'swf.DefineShape', 'parserDefineShape'),
        ],
      },
      deflate: sdkHostDecompressDeflate,
      onDiagnostic: (message) => diagnostics.push(message),
    });
    const source = (await load(plugin, dir, 'a.swf'))!;
    expect(source).toContain('parserDefineShape,');
    expect(diagnostics.filter((m) => m.includes('unreadable content'))).toEqual([]);
  });

  it('reports an unreadable file rather than failing the build', async () => {
    const { dir, diagnostics, plugin } = await fixture();
    expect(await load(plugin, dir, 'missing.swf')).toContain('export const glOptions = {};');
    expect(diagnostics.some((m) => m.includes('analyzer failed'))).toBe(true);
  });

  it('reports a requirement no catalog entry satisfies', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-vite-'));
    await writeFile(join(dir, 'a.swf'), Buffer.from(createSwf(TAG_DEFINE_SHAPE)));
    const diagnostics: string[] = [];
    const plugin = createManifestPlugin({
      catalog: { entries: [] },
      onDiagnostic: (message) => diagnostics.push(message),
    });
    await load(plugin, dir, 'a.swf');
    expect(diagnostics.some((m) => m.includes('no catalog entry for document.format swf.DefineShape'))).toBe(true);
  });

  it('drives resolution through an EXTERNAL catalog, separate from the built-in one', async () => {
    const { dir, plugin } = await fixture();
    // The plugin resolves ONLY against the catalog it is handed — it never consults the built-in one
    // implicitly. The built-in set now ships 58 parser rows, so this can no longer lean on it being
    // empty: instead the same file is loaded through a caller catalog and through an empty one, and
    // the gl row appears only in the first.
    expect(await load(plugin, dir, 'a.swf')).toContain("['swf.DefineShape', glDefineShape]");

    const empty = createManifestPlugin({ catalog: { entries: [] }, onDiagnostic: () => {} });
    const source = (await load(empty, dir, 'a.swf'))!;
    expect(source).toContain('export const glOptions = {};');
    expect(source).not.toContain('glDefineShape');
  });

  // ★ A DISPOSITION SUPPRESSES ITS OWN WARNING AND NOTHING ELSE. The catalog states that this backend
  // deliberately does not implement this exact requirement, so reporting it would train a reader to
  // ignore the channel. Synthetic rows: no shipped backend has a gap whose INTENT can be verified here.
  it('does not report a requirement the catalog disposes of on every backend', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-vite-'));
    await writeFile(join(dir, 'a.swf'), Buffer.from(createSwf(TAG_DEFINE_SHAPE)));
    const diagnostics: string[] = [];
    const plugin = createManifestPlugin({
      catalog: {
        dispositions: ['canvas', 'dom', 'gl', 'wgpu', 'parser'].map((backend) => ({
          backend,
          facet: RequirementFacet.DocumentFormat,
          kind: 'swf.DefineShape',
          reason: 'stipulated by this test',
        })),
        entries: [],
      },
      onDiagnostic: (message) => diagnostics.push(message),
    });
    await load(plugin, dir, 'a.swf');
    // Asserted on the DISPOSED requirement specifically, not on silence overall: the same document also
    // requires shape commands this bare catalog cannot satisfy, and those SHOULD still be reported.
    // Demanding zero diagnostics would have made the test pass only for a catalog that disposed of
    // everything, which is the opposite of what an exact marker is for.
    expect(diagnostics.some((m) => m.includes('swf.DefineShape'))).toBe(false);
    expect(diagnostics.some((m) => m.includes('scene.shape-command'))).toBe(true);
  });

  // The same requirement disposed on ONE backend is still a gap everywhere else, so it still reports.
  it('still reports a requirement only one backend disposes of', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-vite-'));
    await writeFile(join(dir, 'a.swf'), Buffer.from(createSwf(TAG_DEFINE_SHAPE)));
    const diagnostics: string[] = [];
    const plugin = createManifestPlugin({
      catalog: {
        dispositions: [
          { backend: 'canvas', facet: RequirementFacet.DocumentFormat, kind: 'swf.DefineShape', reason: 'stipulated' },
        ],
        entries: [],
      },
      onDiagnostic: (message) => diagnostics.push(message),
    });
    await load(plugin, dir, 'a.swf');
    expect(diagnostics.some((m) => m.includes('no catalog entry for document.format swf.DefineShape'))).toBe(true);
  });

  it('reports every requirement no backend in the external catalog can satisfy', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-vite-'));
    await writeFile(join(dir, 'a.swf'), Buffer.from(createSwf(TAG_DEFINE_SHAPE)));
    const diagnostics: string[] = [];
    const plugin = createManifestPlugin({
      catalog: { entries: [] },
      onDiagnostic: (message) => diagnostics.push(message),
    });
    await load(plugin, dir, 'a.swf');
    expect(diagnostics.some((m) => m.includes('no catalog entry for document.format swf.DefineShape'))).toBe(true);
  });
});

const TAG_DEFINE_SHAPE = 2;
const TAG_SET_BACKGROUND_COLOR = 9;

function entry(backend: string, facet: string, kind: string, symbol: string) {
  return {
    backend,
    facet: facet as never,
    implementationImport: `@acme/${backend}`,
    implementationSymbol: symbol,
    kind,
    registrarImport: `@acme/${backend}`,
    registrarSymbol: `register${kind}`,
  };
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'flight-vite-'));
  await writeFile(join(dir, 'a.swf'), Buffer.from(createSwf(TAG_DEFINE_SHAPE)));
  const diagnostics: string[] = [];
  const plugin = createManifestPlugin({
    catalog: {
      entries: [
        entry('wgpu', RequirementFacet.DocumentFormat, 'swf.DefineShape', 'wgpuDefineShape'),
        entry('gl', RequirementFacet.DocumentFormat, 'swf.DefineShape', 'glDefineShape'),
        entry(MANIFEST_PARSER_BACKEND, RequirementFacet.DocumentFormat, 'swf.DefineShape', 'parserDefineShape'),
      ],
    },
    onDiagnostic: (message) => diagnostics.push(message),
  });
  return { diagnostics, dir, plugin };
}

async function load(plugin: ReturnType<typeof createManifestPlugin>, dir: string, name: string) {
  const id = plugin.resolveId(`./${name}${MANIFEST_QUERY_SUFFIX}`, join(dir, 'main.ts'))!;
  return plugin.load(id);
}

// A minimal SWF carrying exactly one tag of the given code, built inline so the tests need no fixture.
function createSwf(code: number): Uint8Array {
  const tagHeader = code << 6;
  const body = new Uint8Array([0x00, 0x00, 0x18, 0x01, 0x00, tagHeader & 0xff, (tagHeader >> 8) & 0xff, 0x00, 0x00]);
  const file = new Uint8Array(8 + body.length);
  file.set([0x46, 0x57, 0x53, 9], 0);
  new DataView(file.buffer).setUint32(4, file.length, true);
  file.set(body, 8);
  return file;
}

function compressedSwf(): Uint8Array {
  const uncompressed = createSwf(TAG_DEFINE_SHAPE);
  const body = new Uint8Array(deflateSync(Buffer.from(uncompressed.subarray(8))));
  const file = new Uint8Array(8 + body.length);
  file.set(uncompressed.subarray(0, 8), 0);
  file[0] = 0x43;
  file.set(body, 8);
  return file;
}
