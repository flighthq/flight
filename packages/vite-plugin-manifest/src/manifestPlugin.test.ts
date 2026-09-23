import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRequirementSet } from '@flighthq/requirement/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { createManifestPlugin, MANIFEST_VIRTUAL_MODULE_ID } from './manifestPlugin';

describe('createManifestPlugin', () => {
  it('resolves only its own virtual module id, to a rollup-private id', async () => {
    const plugin = createManifestPlugin(await options());
    expect(plugin.resolveId(MANIFEST_VIRTUAL_MODULE_ID)).toBe(`\0${MANIFEST_VIRTUAL_MODULE_ID}`);
    expect(plugin.resolveId('some/other/module')).toBeNull();
  });

  it('loads nothing for an id it did not resolve', async () => {
    const plugin = createManifestPlugin(await options());
    expect(await plugin.load('some/other/module')).toBeNull();
  });

  it('serves generated source that registers what the scanned content required', async () => {
    const { dir, ...rest } = await fixture();
    const plugin = createManifestPlugin(rest.options);
    plugin.configResolved({ root: dir });
    const source = (await plugin.load(`\0${MANIFEST_VIRTUAL_MODULE_ID}`))!;
    expect(source).toContain("import { registerSwfShowFrame } from '@acme/swf-bits';");
    expect(source).toContain('registerSwfShowFrame(state);');
  });

  it('reports an unsupported format instead of skipping it silently', async () => {
    const { dir, diagnostics, options: opts } = await fixture();
    await writeFile(join(dir, 'content', 'notes.txt'), 'not content');
    const plugin = createManifestPlugin(opts);
    plugin.configResolved({ root: dir });
    await plugin.load(`\0${MANIFEST_VIRTUAL_MODULE_ID}`);
    expect(diagnostics.some((m) => m.includes('unsupported content format') && m.includes('notes.txt'))).toBe(true);
  });

  it('reports an unreadable content directory rather than failing the build', async () => {
    const diagnostics: string[] = [];
    const plugin = createManifestPlugin({
      backend: 'canvas',
      catalog: { entries: [] },
      contentDirectories: ['does-not-exist'],
      onDiagnostic: (m) => diagnostics.push(m),
    });
    plugin.configResolved({ root: tmpdir() });
    expect(await plugin.load(`\0${MANIFEST_VIRTUAL_MODULE_ID}`)).toContain('registerScannedRequirements');
    expect(diagnostics.some((m) => m.includes('content directory not readable'))).toBe(true);
  });

  it('keeps every other file when one analyzer throws', async () => {
    const { dir, diagnostics, options: opts } = await fixture();
    await writeFile(join(dir, 'content', 'broken.bin'), 'x');
    const plugin = createManifestPlugin({
      ...opts,
      analyzers: {
        '.bin': () => {
          throw new Error('deliberate analyzer failure');
        },
      },
    });
    plugin.configResolved({ root: dir });
    const source = (await plugin.load(`\0${MANIFEST_VIRTUAL_MODULE_ID}`))!;
    expect(diagnostics.some((m) => m.includes('analyzer failed') && m.includes('broken.bin'))).toBe(true);
    expect(source).toContain('registerSwfShowFrame(state);');
  });

  it('reports a requirement the catalog cannot satisfy', async () => {
    const { dir, diagnostics, options: opts } = await fixture();
    const plugin = createManifestPlugin({ ...opts, catalog: { entries: [] } });
    plugin.configResolved({ root: dir });
    await plugin.load(`\0${MANIFEST_VIRTUAL_MODULE_ID}`);
    expect(diagnostics.some((m) => m.includes('no catalog entry for document.format ShowFrame'))).toBe(true);
  });

  it('rescans after a content file changes, and ignores files it does not analyze', async () => {
    const { dir, options: opts } = await fixture();
    const plugin = createManifestPlugin(opts);
    plugin.configResolved({ root: dir });
    const before = await plugin.load(`\0${MANIFEST_VIRTUAL_MODULE_ID}`)!;
    expect(before).not.toContain('registerSwfBackground(state);');

    // Add content the first scan never saw. Until something invalidates the cache the module must not
    // change — otherwise `load` is rescanning every time and the cache is decorative.
    await writeFile(join(dir, 'content', 'b.swf'), Buffer.from(createSwf(TAG_SET_BACKGROUND_COLOR)));
    expect(await plugin.load(`\0${MANIFEST_VIRTUAL_MODULE_ID}`)).toBe(before);

    // A source file is not a content input, so it must not invalidate anything either.
    plugin.handleHotUpdate({ file: join(dir, 'src', 'main.ts') });
    expect(await plugin.load(`\0${MANIFEST_VIRTUAL_MODULE_ID}`)).toBe(before);

    // A content file is, so the next load rebuilds and picks up the file added above.
    plugin.handleHotUpdate({ file: join(dir, 'content', 'b.swf') });
    const after = await plugin.load(`\0${MANIFEST_VIRTUAL_MODULE_ID}`)!;
    expect(after).not.toBe(before);
    expect(after).toContain('registerSwfBackground(state);');
  });

  it('builds at buildStart so the first load is already warm', async () => {
    const { dir, options: opts } = await fixture();
    const plugin = createManifestPlugin(opts);
    plugin.configResolved({ root: dir });
    await plugin.buildStart();
    expect(await plugin.load(`\0${MANIFEST_VIRTUAL_MODULE_ID}`)).toContain('registerSwfShowFrame(state);');
  });

  it('lets a caller-supplied analyzer add a format the plugin does not know', async () => {
    const { dir, options: opts } = await fixture();
    await writeFile(join(dir, 'content', 'thing.acme'), 'anything');
    const plugin = createManifestPlugin({
      ...opts,
      analyzers: {
        '.acme': () =>
          createRequirementSet(
            [RequirementFacet.DocumentFormat],
            [{ facet: RequirementFacet.DocumentFormat, key: 'AcmeThing' }],
          ),
      },
      catalog: {
        entries: [
          {
            backend: 'canvas',
            facet: 'document.format',
            implementationImport: '@acme/bits',
            implementationSymbol: 'acmeThing',
            kind: 'AcmeThing',
            registrarImport: '@acme/bits',
            registrarSymbol: 'registerAcmeThing',
          },
        ],
      },
    });
    plugin.configResolved({ root: dir });
    expect(await plugin.load(`\0${MANIFEST_VIRTUAL_MODULE_ID}`)).toContain('registerAcmeThing(state);');
  });
});

async function options() {
  return { backend: 'canvas', catalog: { entries: [] }, contentDirectories: ['content'] };
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'flight-vite-'));
  const { mkdir } = await import('node:fs/promises');
  await mkdir(join(dir, 'content'), { recursive: true });
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'content', 'a.swf'), Buffer.from(createSwf(TAG_SHOW_FRAME)));
  const diagnostics: string[] = [];
  return {
    diagnostics,
    dir,
    options: {
      backend: 'canvas',
      catalog: {
        entries: [
          {
            backend: 'canvas',
            facet: 'document.format' as const,
            implementationImport: '@acme/swf-bits',
            implementationSymbol: 'swfShowFrame',
            kind: 'ShowFrame',
            registrarImport: '@acme/swf-bits',
            registrarSymbol: 'registerSwfShowFrame',
          },
          {
            backend: 'canvas',
            facet: 'document.format' as const,
            implementationImport: '@acme/swf-bits',
            implementationSymbol: 'swfBackground',
            kind: 'SetBackgroundColor',
            registrarImport: '@acme/swf-bits',
            registrarSymbol: 'registerSwfBackground',
          },
        ],
      },
      contentDirectories: ['content'],
      onDiagnostic: (message: string) => diagnostics.push(message),
    },
  };
}

const TAG_SHOW_FRAME = 1;
const TAG_SET_BACKGROUND_COLOR = 9;

// A minimal SWF carrying exactly one tag of the given code, built inline so the tests need no binary
// fixture: an 8-byte prefix, a zero-bit stage rectangle, frame rate and count, the tag, then End.
function createSwf(code: number): Uint8Array {
  const tagHeader = (code << 6) | 0;
  const body = new Uint8Array([0x00, 0x00, 0x18, 0x01, 0x00, tagHeader & 0xff, (tagHeader >> 8) & 0xff, 0x00, 0x00]);
  const file = new Uint8Array(8 + body.length);
  file.set([0x46, 0x57, 0x53, 9], 0);
  new DataView(file.buffer).setUint32(4, file.length, true);
  file.set(body, 8);
  return file;
}
