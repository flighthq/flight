import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BUILT_IN_REQUIREMENT_CATALOG_ENTRIES } from '@flighthq/requirement-catalog/contract';

import { createManifestPlugin } from './manifestPlugin';

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
});

const TAG_DEFINE_SHAPE = 2;
const TAG_DEFINE_SPRITE = 39;
const TAG_DEFINE_TEXT = 11;
// 253 is inside the tag-code range and claimed by no family, so it stays a genuine unknown.
const TAG_UNCLAIMED = 253;

async function load(content: Uint8Array): Promise<{ diagnostics: string[]; source: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'builtin-catalog-'));
  await writeFile(join(dir, 'a.swf'), Buffer.from(content));
  const diagnostics: string[] = [];
  const plugin = createManifestPlugin({
    catalog: { entries: [...BUILT_IN_REQUIREMENT_CATALOG_ENTRIES] },
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
