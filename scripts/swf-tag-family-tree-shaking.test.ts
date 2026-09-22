// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

// What a SWF tag family costs when you do not register it, measured rather than asserted.
//
// The claim this file exists to defend is that a family is a real import boundary: a build that imports
// shape, placement, control and sprite must not have @flighthq/abc, @flighthq/audio or the image-decoding
// chain anywhere in its module graph — not merely unreferenced in it. That distinction is why the
// evidence here is the bundler's own input list, which names every module the graph reaches, rather than
// a byte count, which would shrink for many reasons that are not this one.
//
// Three independent instruments, because each fails differently:
//   1. PACKAGE reachability — no file under packages/<forbidden>/src contributed.
//   2. MODULE reachability — the unregistered families' own files contributed zero bytes.
//   3. CONTENT — the family's own parser function is absent from the emitted code, by the name
//      `keepNames` preserves; and where the family carries a distinctive string, that too.
// A change that defeated one would have to defeat all three to pass silently.

interface BundleReach {
  code: string;
  contributedBytes: ReadonlyMap<string, number>;
  packages: ReadonlySet<string>;
}

interface TagFamily {
  // A string this family's own code carries — a diagnostic kind or a container MIME type — which appears
  // in the emitted bundle only if the family was kept. Absent for a family that carries no distinctive
  // literal; `symbol` covers every family and this is the second, independent instrument where it exists.
  marker?: string;
  module: string;
  name: string;
  // Packages nothing else in a lean SWF build reaches, so their presence means this family was linked.
  packages: readonly string[];
  // A module-private parser this family owns. Minification renames it, but `keepNames` re-attaches the
  // original as a string, which is what makes the name checkable in a minified bundle at all.
  symbol: string;
  value: string;
}

const FAMILIES: readonly TagFamily[] = [
  {
    marker: 'swf.script.do-init-action',
    module: 'swfScriptTagFamily.ts',
    name: 'script',
    packages: ['abc'],
    symbol: 'readSwfAbcPayload',
    value: 'swfScriptTagFamily',
  },
  {
    marker: 'swf.axis.sound-format-non-mp3',
    module: 'swfSoundTagFamily.ts',
    name: 'sound',
    packages: ['audio'],
    symbol: 'readSwfSoundStreamHead',
    value: 'swfSoundTagFamily',
  },
  {
    marker: 'image/x-swf-lossless-alpha',
    module: 'swfBitmapTagFamily.ts',
    name: 'bitmap',
    packages: ['image'],
    symbol: 'readSwfLegacyImageDefinition',
    value: 'swfBitmapTagFamily',
  },
  {
    marker: 'swf.text.define-edit-text',
    module: 'swfTextTagFamily.ts',
    name: 'text',
    packages: ['text', 'text-markup'],
    symbol: 'appendSwfPendingTextShapes',
    value: 'swfTextTagFamily',
  },
  {
    marker: 'swf.font.define-font',
    module: 'swfFontTagFamily.ts',
    name: 'font',
    packages: [],
    symbol: 'readSwfFontDefinition',
    value: 'swfFontTagFamily',
  },
  {
    module: 'swfVideoTagFamily.ts',
    name: 'video',
    packages: [],
    symbol: 'readSwfVideoDefinition',
    value: 'swfVideoTagFamily',
  },
];

// Everything an application needs to place authored artwork, and nothing else. This is the build the
// whole design is for, so it is the one the assertions are written against.
const ARTWORK_FAMILY_VALUES = [
  'swfControlTagFamily',
  'swfPlacementTagFamily',
  'swfShapeTagFamily',
  'swfSpriteTagFamily',
] as const;

const ARTWORK_ENTRY = ['createScene2DFromSwf', ...ARTWORK_FAMILY_VALUES];

const FAMILY_MARKERS: readonly [family: string, included: string, excluded: string][] = [
  ['swfBitmapTagFamily', 'swf.jpeg-tables-missing', 'swf.shape-body-unreadable'],
  ['swfControlTagFamily', 'swf.scene-names', 'swf.font-glyph-table'],
  ['swfFontTagFamily', 'swf.font-glyph-table', 'swf.scene-names'],
  ['swfPlacementTagFamily', 'swf.blend-mode-behind-unread-filters', 'swf.font-glyph-table'],
  ['swfScriptTagFamily', 'swf.script.do-abc', 'swf.font-glyph-table'],
  ['swfShapeTagFamily', 'swf.shape-body-unreadable', 'swf.jpeg-tables-missing'],
  ['swfSoundTagFamily', 'swf.stream-sound-format', 'swf.font-glyph-table'],
  ['swfSpriteTagFamily', 'swf.tag-handler-unregistered', 'swf.font-glyph-table'],
  ['swfTextTagFamily', 'swf.text-shape-uncomposable', 'swf.font-glyph-table'],
  ['swfVideoTagFamily', 'videoTextures', 'swf.font-glyph-table'],
];

const ALL_FAMILY_MARKERS = FAMILY_MARKERS.map(([, marker]) => marker);

describe('SWF artwork-only builds', () => {
  it('reaches no scripting, audio, image-decoding or text package', async () => {
    const bundle = await bundleSwfExports(ARTWORK_ENTRY);
    for (const family of FAMILIES) {
      for (const name of family.packages) {
        expect(bundle.packages.has(name), `${family.name} family pulled @flighthq/${name}`).toBe(false);
      }
    }
    // Named outright as well as derived from the table, so the three the task names stay legible here
    // even if the table above is edited.
    expect([...bundle.packages].filter((name) => ['abc', 'audio', 'image', 'image-codec'].includes(name))).toEqual([]);
  });

  it('links none of the unregistered family modules', async () => {
    const bundle = await bundleSwfExports(ARTWORK_ENTRY);
    for (const family of FAMILIES) {
      expect(contributedBytes(bundle, family.module), family.name).toBe(0);
      expect(bundle.code.includes(keptFunctionName(family.symbol)), `${family.name} parser`).toBe(false);
      if (family.marker !== undefined) {
        expect(bundle.code.includes(family.marker), `${family.name} marker`).toBe(false);
      }
    }
  });

  // swfAllTagHandlers is the one module that names all ten families, and so the only edge by which a
  // build could acquire them. An importer that reached it would make every other assertion here depend
  // on tree shaking instead of on the import graph. The dispatch builder, which names no family, is
  // reached — that is what makes the exclusion structural rather than a shaker's favour.
  it('does not link the module that names every family', async () => {
    const bundle = await bundleSwfExports(ARTWORK_ENTRY);
    expect(contributedBytes(bundle, 'swfAllTagHandlers.ts')).toBe(0);
    expect(contributedBytes(bundle, 'expandSwfTagHandlerDispatch.ts')).toBeGreaterThan(0);
  });

  it('keeps the families it did register', async () => {
    const bundle = await bundleSwfExports(ARTWORK_ENTRY);
    for (const module of ['swfShapeTagFamily.ts', 'swfPlacementTagFamily.ts', 'swfControlTagFamily.ts']) {
      expect(contributedBytes(bundle, module), module).toBeGreaterThan(0);
    }
  });
});

describe('SWF per-family cost', () => {
  for (const family of FAMILIES) {
    // The complement of the exclusion test: each package listed above has to be reachable through its own
    // family, or "absent from the artwork build" would be a fact about the package rather than about the
    // boundary. A family whose packages list is empty is covered by its module and marker alone.
    it(`links the ${family.name} family, and its packages, when it is registered`, async () => {
      const bundle = await bundleSwfExports([...ARTWORK_ENTRY, family.value]);
      expect(contributedBytes(bundle, family.module)).toBeGreaterThan(0);
      expect(bundle.code.includes(keptFunctionName(family.symbol)), `${family.name} parser`).toBe(true);
      if (family.marker !== undefined) {
        expect(bundle.code.includes(family.marker), `${family.name} marker`).toBe(true);
      }
      for (const name of family.packages) {
        expect(bundle.packages.has(name), `@flighthq/${name}`).toBe(true);
      }
    });
  }
});

describe('SWF per-family isolation', () => {
  it.each(FAMILY_MARKERS)('keeps %s independently bundleable', async (name, included, excluded) => {
    const bundle = await bundleSwfExports([name]);

    expect(bundle.code).toContain(included);
    expect(bundle.code).not.toContain(excluded);
  });

  it.each(FAMILY_MARKERS)('keeps %s isolated from every other family marker', async (name, included) => {
    const bundle = await bundleSwfExports([name]);

    for (const marker of ALL_FAMILY_MARKERS) {
      if (marker === included) continue;
      expect(bundle.code).not.toContain(marker);
    }
  });
});

describe('SWF zero-config builds', () => {
  it('reaches every family through the all-handlers preset', async () => {
    const bundle = await bundleSwfExports(['createScene2DFromSwf', 'swfAllTagHandlers']);
    expect(contributedBytes(bundle, 'swfAllTagHandlers.ts')).toBeGreaterThan(0);
    for (const family of FAMILIES) {
      expect(contributedBytes(bundle, family.module), family.name).toBeGreaterThan(0);
      for (const name of family.packages) expect(bundle.packages.has(name), `@flighthq/${name}`).toBe(true);
    }
  });
});

// How `keepNames` records a function's original name once minification has renamed the binding.
function keptFunctionName(symbol: string): string {
  return `,"${symbol}")`;
}

function contributedBytes(bundle: Readonly<BundleReach>, module: string): number {
  return bundle.contributedBytes.get(module) ?? 0;
}

async function bundleSwfExports(names: readonly string[]): Promise<BundleReach> {
  const result = await build({
    bundle: true,
    format: 'esm',
    keepNames: true,
    logLevel: 'silent',
    metafile: true,
    minify: true,
    stdin: {
      contents: `export { ${names.join(', ')} } from './index.ts';`,
      resolveDir: getSwfSourceDirectory(),
      sourcefile: 'swf-tag-family-reach.ts',
    },
    treeShaking: true,
    write: false,
  });
  const output = Object.values(result.metafile.outputs)[0];
  const contributedBytes = new Map<string, number>();
  const packages = new Set<string>();
  for (const [file, contribution] of Object.entries(output.inputs)) {
    if (contribution.bytesInOutput <= 0) continue;
    const match = /packages\/([^/]+)\/src\/(.+)$/.exec(file.replaceAll('\\', '/'));
    if (match === null) continue;
    packages.add(match[1]);
    if (match[1] === 'swf') contributedBytes.set(match[2], contribution.bytesInOutput);
  }
  return { code: result.outputFiles[0].text, contributedBytes, packages };
}

function getSwfSourceDirectory(): string {
  const directory = new URL('../packages/swf/src/', import.meta.url);
  const pathname = decodeURIComponent(directory.pathname);
  if (directory.hostname !== '') return `//${directory.hostname}${pathname}`;
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}
