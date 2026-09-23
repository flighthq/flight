import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    expect(source).toContain("import { canvasShowFrame } from '@acme/canvas';");
    expect(source).toContain("import { glShowFrame } from '@acme/gl';");
    expect(source).toContain(
      "export const canvasOptions = {\n  nodeRenderers: new Map([\n    ['ShowFrame', canvasShowFrame],",
    );
    expect(source).toContain("export const glOptions = {\n  nodeRenderers: new Map([\n    ['ShowFrame', glShowFrame],");
    expect(source).toContain('export const wgpuOptions = {};');
  });

  it('reads the exact file imported, so two documents give different modules', async () => {
    const { dir, plugin } = await fixture();
    await writeFile(join(dir, 'b.swf'), Buffer.from(createSwf(TAG_SET_BACKGROUND_COLOR)));
    const a = await load(plugin, dir, 'a.swf');
    const b = await load(plugin, dir, 'b.swf');
    expect(a).not.toBe(b);
    expect(a).toContain("['ShowFrame', canvasShowFrame]");
    expect(b).toContain('export const canvasOptions = {};');
  });

  it('invalidates per imported source, leaving other files cached', async () => {
    const { dir, plugin } = await fixture();
    await writeFile(join(dir, 'b.swf'), Buffer.from(createSwf(TAG_SHOW_FRAME)));
    const beforeA = await load(plugin, dir, 'a.swf');
    const beforeB = await load(plugin, dir, 'b.swf');

    // Rewrite a.swf to content with no ShowFrame, then invalidate ONLY a.swf.
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

  it('reports an unreadable file rather than failing the build', async () => {
    const { dir, diagnostics, plugin } = await fixture();
    expect(await load(plugin, dir, 'missing.swf')).toContain('export const glOptions = {};');
    expect(diagnostics.some((m) => m.includes('analyzer failed'))).toBe(true);
  });

  it('reports a requirement no catalog entry satisfies', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-vite-'));
    await writeFile(join(dir, 'a.swf'), Buffer.from(createSwf(TAG_SHOW_FRAME)));
    const diagnostics: string[] = [];
    const plugin = createManifestPlugin({
      catalog: { entries: [] },
      onDiagnostic: (message) => diagnostics.push(message),
    });
    await load(plugin, dir, 'a.swf');
    expect(diagnostics.some((m) => m.includes('no catalog entry for document.format ShowFrame'))).toBe(true);
  });

  it('lets a caller-supplied analyzer add a format the plugin does not know', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flight-vite-'));
    await writeFile(join(dir, 'thing.acme'), 'anything');
    const plugin = createManifestPlugin({
      analyzers: {
        '.acme': () =>
          createRequirementSet(
            [RequirementFacet.SceneNodeKind],
            [{ facet: RequirementFacet.SceneNodeKind, key: 'AcmeThing' }],
          ),
      },
      catalog: { entries: [entry('canvas', RequirementFacet.SceneNodeKind, 'AcmeThing', 'canvasAcme')] },
    });
    expect(await load(plugin, dir, 'thing.acme')).toContain("['AcmeThing', canvasAcme]");
  });
});

const TAG_SHOW_FRAME = 1;
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
  await writeFile(join(dir, 'a.swf'), Buffer.from(createSwf(TAG_SHOW_FRAME)));
  const diagnostics: string[] = [];
  const plugin = createManifestPlugin({
    catalog: {
      entries: [
        entry('canvas', RequirementFacet.DocumentFormat, 'ShowFrame', 'canvasShowFrame'),
        entry('gl', RequirementFacet.DocumentFormat, 'ShowFrame', 'glShowFrame'),
        entry(MANIFEST_PARSER_BACKEND, RequirementFacet.DocumentFormat, 'ShowFrame', 'parserShowFrame'),
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
