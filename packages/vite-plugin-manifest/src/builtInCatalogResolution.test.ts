import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BUILT_IN_REQUIREMENT_BACKENDS,
  BUILT_IN_REQUIREMENT_CATALOG_ENTRIES,
  BUILT_IN_REQUIREMENT_TRANSLATIONS,
} from '@flighthq/requirement-catalog/contract';

import { createManifestPlugin } from './manifestPlugin';

describe('AWD2 content through the built-in catalog', () => {
  it('resolves an AWD2 material block to non-empty render fragments', async () => {
    const { source, diagnostics } = await loadAwd2(awd2WithMaterialBlock());
    expect(diagnostics).toEqual([]);
    expect(source).not.toContain('export const glOptions = {};');
    expect(source).toContain('materialRenderers');
    expect(source).toContain("'ShadedMaterial'");
  });
});

// The built-in catalog's whole claim is that a build can point at real content and get the real
// handlers back. A test that only counted rows would pass on 58 rows naming symbols that do not exist,
// or naming tags no document contains. So this drives the SHIPPED catalog through the SHIPPED plugin
// against a SWF built here, and asserts on what a consumer would actually import.
describe('BUILT_IN_REQUIREMENT_CATALOG_ENTRIES through the plugin', () => {
  it('resolves a real document to the exact handlers its tags need, and nothing else', async () => {
    const { diagnostics, source } = await load(
      swfFile(tag(TAG_DEFINE_SHAPE), tag(TAG_DEFINE_SPRITE), tag(TAG_DEFINE_TEXT)),
    );

    expect(source).toContain(
      "import { swfDefineShapeHandler, swfSpriteHandler, swfStaticTextHandler } from '@flighthq/swf';",
    );
    expect(source).toContain('export const parserOptions = {\n  tags: [');
    expect(diagnostics).toEqual([]);
  });

  // ★ THE ASSERTION THAT MAKES PRECISION MEAN SOMETHING. Resolving to a FAMILY would satisfy the test
  // above just as well, while landing every handler that family spans. These two are siblings of the
  // handlers this document genuinely needs — `swfDefineMorphShapeHandler` shares swfShapeTagFamily with
  // the shape handler, and `swfEditTextHandler` shares swfTextTagFamily with the static-text handler,
  // dragging the text-input machinery behind it. A document with no morph shape and no edit text must
  // land neither.
  it('lands neither sibling handler from the families its handlers belong to', async () => {
    const { source } = await load(swfFile(tag(TAG_DEFINE_SHAPE), tag(TAG_DEFINE_TEXT)));
    for (const sibling of ['swfDefineMorphShapeHandler', 'swfEditTextHandler']) {
      expect(source, `${sibling} rode in on its family`).not.toContain(sibling);
    }
    // And no family array is ever named, which is how a sibling would get in.
    expect(source).not.toContain('TagFamily');
  });

  it('omits every handler the content does not use at all', async () => {
    const { source } = await load(swfFile(tag(TAG_DEFINE_SHAPE)));
    for (const unused of ['swfSoundHandler', 'swfVideoHandler', 'swfFontHandler', 'swfScriptHandler']) {
      expect(source, `${unused} leaked into a document that does not use it`).not.toContain(unused);
    }
  });

  it('reports nothing for a document whose tags the built-in catalog covers', async () => {
    const { diagnostics } = await load(swfFile(tag(TAG_DEFINE_SHAPE)));
    // A populated catalog that still warned on every tag would be worse than an empty one: the build
    // would be correct and the channel untrustworthy.
    expect(diagnostics).toEqual([]);
  });

  it('STILL reports a tag no family claims, so coverage is not silence', async () => {
    const { diagnostics } = await load(swfFile(tag(TAG_UNCLAIMED)));
    expect(diagnostics).toEqual([`no catalog entry for document.format swf.Unknown(${TAG_UNCLAIMED}): <file>`]);
  });

  it('carries no registrar to emit, so a parser row contributes an import and no registration', async () => {
    const { source } = await load(swfFile(tag(TAG_DEFINE_SHAPE)));
    expect(source).not.toContain('register');
  });

  // ★ THE EXPORT THAT IS SAFE TO USE AS IT STANDS. `canvasOptions` carries only what the content
  // implies; handing it to `createCanvasRenderState` where a preset belonged typechecked, built, and
  // rendered a BLACK FRAME, because a canvas also needs a shape-command table and a blend-mode
  // application that no catalog row can express. The composed export exists so a caller never has to
  // know which pieces a backend needs — the knowledge they lacked when the frame came out black.
  it('exports a composed options object carrying the backend machinery, not just the content', async () => {
    const { source } = await load(swfFile(tag(TAG_DEFINE_SHAPE)));
    expect(source).toContain('export const canvasFullOptions = {');
    expect(source).toContain('  ...canvasRenderInfrastructure,');
    expect(source).toContain('  ...canvasOptions,');
    // Imported, not merely referenced: a symbol used without an import fails at run time, and the
    // import block is rendered before the fragments, so registering it late emits nothing.
    expect(source).toContain('canvasRenderInfrastructure');
    expect(source.indexOf('canvasRenderInfrastructure')).toBeLessThan(source.indexOf('export const canvasOptions'));
  });

  it('offers a composed export for every backend the catalog declares', async () => {
    const { source } = await load(swfFile(tag(TAG_DEFINE_SHAPE)));
    for (const backend of ['canvas', 'dom', 'gl', 'wgpu']) {
      expect(source, backend).toContain(`export const ${backend}FullOptions = {`);
    }
  });

  // A catalog that names no backend machinery must NOT imply a working configuration it cannot build.
  it('omits the composed export when the catalog declares no backend machinery', async () => {
    const { source } = await load(swfFile(tag(TAG_DEFINE_SHAPE)), { backends: undefined });
    expect(source).toContain('export const canvasOptions = {');
    expect(source).not.toContain('canvasFullOptions');
    expect(source).not.toContain('canvasRenderInfrastructure');
  });

  // ★ THE POINT OF THE TRANSLATION LAYER. Before it, a document resolved its parser handlers and every
  // render fragment came back `{}` — the manifest helped the parsing half and left the larger half to
  // be wired by hand. These assert the render fragments now carry the renderers the content's own tags
  // imply, reached from a TAG requirement through the node kinds it builds.
  it('fills the render fragments a document implies, not just the parser one', async () => {
    const { source } = await load(swfFile(tag(TAG_DEFINE_SHAPE)));
    // Asserted by symbol rather than as one exact line: the same import also carries the backend
    // infrastructure now, and pinning the whole line would break on any addition to it.
    for (const symbol of ['canvasScene2DRenderer', 'canvasShapeRenderer', 'canvasScale9ShapeRenderer']) {
      expect(source, symbol).toContain(symbol);
    }
    expect(source).toContain("['Shape', canvasShapeRenderer]");
    expect(source).toContain("['Shape', glShapeRenderer]");
    expect(source).toContain("['Shape', wgpuShapeRenderer]");
    expect(source).not.toContain('export const canvasOptions = {};');
  });

  it('gives a document whose tags build no node the container renderer its root still needs', async () => {
    // SetBackgroundColor builds nothing, but the importer still makes a root. A purely per-tag table
    // would leave that root unrendered; the namespace-keyed translation is what covers it.
    const { source } = await load(swfFile(tag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0, 0, 0]))));
    expect(source).toContain("['DisplayObject', canvasScene2DRenderer]");
  });

  it('keeps each backend to its own renderers, so importing one does not drag in another', async () => {
    const { source } = await load(swfFile(tag(TAG_DEFINE_SHAPE)));
    const canvasFragment = source.slice(
      source.indexOf('export const canvasOptions'),
      source.indexOf('export const domOptions'),
    );
    expect(canvasFragment).not.toContain('glShapeRenderer');
    expect(canvasFragment).not.toContain('wgpuShapeRenderer');
  });
});

const TAG_DEFINE_SHAPE = 2;
const TAG_SET_BACKGROUND_COLOR = 9;
const TAG_DEFINE_SPRITE = 39;
const TAG_DEFINE_TEXT = 11;
// 253 is inside the tag-code range and claimed by no family, so it stays a genuine unknown.
const TAG_UNCLAIMED = 253;

async function load(
  content: Uint8Array,
  overrides: { backends?: typeof BUILT_IN_REQUIREMENT_BACKENDS } = {},
): Promise<{ diagnostics: string[]; source: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'builtin-catalog-'));
  await writeFile(join(dir, 'a.swf'), Buffer.from(content));
  const diagnostics: string[] = [];
  const plugin = createManifestPlugin({
    catalog: {
      backends: 'backends' in overrides ? overrides.backends : BUILT_IN_REQUIREMENT_BACKENDS,
      entries: [...BUILT_IN_REQUIREMENT_CATALOG_ENTRIES],
      translations: BUILT_IN_REQUIREMENT_TRANSLATIONS,
    },
    onDiagnostic: (message) => diagnostics.push(message),
  });
  const id = plugin.resolveId('./a.swf?manifest', join(dir, 'entry.ts'))!;
  // Load FIRST, then read the diagnostics it produced. Building the result object with `diagnostics`
  // listed before the awaited `source` snapshots the array while it is still empty, which silently
  // turns every `toEqual([])` here into a test that cannot fail.
  const source = (await plugin.load(id))!;
  return { diagnostics: diagnostics.map((message) => message.replace(join(dir, 'a.swf'), '<file>')), source };
}

function tag(code: number, body: Uint8Array = new Uint8Array()): Uint8Array {
  const header = (code << 6) | (body.length < 0x3f ? body.length : 0x3f);
  return Uint8Array.from([header & 0xff, (header >> 8) & 0xff, ...body]);
}

function swfFile(...tags: readonly Uint8Array[]): Uint8Array {
  const body = Uint8Array.from([0x00, 0x00, 0x18, 0x01, 0x00, ...tags.flatMap((t) => [...t]), 0x00, 0x00]);
  const file = new Uint8Array(8 + body.length);
  file.set([0x46, 0x57, 0x53, 9], 0);
  new DataView(file.buffer).setUint32(4, file.length, true);
  file.set(body, 8);
  return file;
}

async function loadAwd2(content: Uint8Array): Promise<{ diagnostics: string[]; source: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'builtin-catalog-'));
  await writeFile(join(dir, 'a.awd'), Buffer.from(content));
  const diagnostics: string[] = [];
  const plugin = createManifestPlugin({
    catalog: {
      backends: BUILT_IN_REQUIREMENT_BACKENDS,
      entries: [...BUILT_IN_REQUIREMENT_CATALOG_ENTRIES],
      translations: BUILT_IN_REQUIREMENT_TRANSLATIONS,
    },
    onDiagnostic: (message) => diagnostics.push(message),
  });
  const id = plugin.resolveId('./a.awd?manifest', join(dir, 'entry.ts'))!;
  const source = (await plugin.load(id))!;
  return { diagnostics: diagnostics.map((message) => message.replace(join(dir, 'a.awd'), '<file>')), source };
}

const AWD2_BLOCK_MATERIAL = 81;

function awd2WithMaterialBlock(): Uint8Array {
  const blockBody = new Uint8Array(0);
  const blockHeader = 11;
  const file = new Uint8Array(12 + blockHeader + blockBody.length);
  file.set([0x41, 0x57, 0x44, 2, 1, 0, 0, 0], 0);
  const view = new DataView(file.buffer);
  view.setUint32(8, blockHeader + blockBody.length, true);
  view.setUint32(12, 1, true);
  file[16] = 0;
  file[17] = AWD2_BLOCK_MATERIAL;
  file[18] = 0;
  view.setUint32(19, blockBody.length, true);
  return file;
}
