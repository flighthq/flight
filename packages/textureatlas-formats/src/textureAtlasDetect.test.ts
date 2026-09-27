import { addTextureAtlasRegion, createTextureAtlas } from '@flighthq/textureatlas/contract';
import type { TextureAtlasFormatKind } from '@flighthq/types/contract';
import {
  TextureAtlasFormatKindAseprite,
  TextureAtlasFormatKindLibgdxAtlas,
  TextureAtlasFormatKindStarling,
  TextureAtlasFormatKindTexturePacker,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  applyTextureAtlasImportOptions,
  detectTextureAtlasFormat,
  getTextureAtlasFormat,
  getTextureAtlasFormatKinds,
  parseTextureAtlas,
  registerTextureAtlasFormat,
  starlingTextureAtlasFormat,
  textureAtlasAllFormats,
  unregisterTextureAtlasFormat,
} from './textureAtlasDetect.ts';

const STARLING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="atlas.png">
  <SubTexture name="hero_idle" x="0" y="0" width="64" height="64"/>
</TextureAtlas>`;

const LIBGDX_ATLAS = `
atlas.png
size: 256,256
format: RGBA8888
filter: Nearest,Nearest
repeat: none
hero_idle
  rotate: false
  xy: 0, 0
  size: 64, 64
  orig: 64, 64
  offset: 0, 0
  index: -1`;

const ASEPRITE_JSON = JSON.stringify({
  frames: {
    hero_idle: {
      frame: { x: 0, y: 0, w: 64, h: 64 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
      sourceSize: { w: 64, h: 64 },
      duration: 100,
    },
  },
  meta: { app: 'https://www.aseprite.org/', image: 'atlas.png', size: { w: 64, h: 64 }, scale: 1 },
});

const TEXTUREPACKER_JSON = JSON.stringify({
  frames: {
    hero_idle: {
      frame: { x: 0, y: 0, w: 64, h: 64 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
      sourceSize: { w: 64, h: 64 },
    },
  },
  meta: { app: 'https://www.codeandweb.com/texturepacker', image: 'atlas.png', size: { w: 64, h: 64 }, scale: 1 },
});

// One document per format, shared by the exclusivity proof and the reverse-order proof: both are statements
// about the same corpus, and a second copy of it could drift from the first without failing either.
const CORPUS: readonly (readonly [TextureAtlasFormatKind, string])[] = [
  [
    TextureAtlasFormatKindAseprite,
    JSON.stringify({ frames: { 'a.png': { duration: 100 } }, meta: { app: 'http://www.aseprite.org/' } }),
  ],
  [
    TextureAtlasFormatKindTexturePacker,
    JSON.stringify({ frames: { 'a.png': {} }, meta: { app: 'https://www.codeandweb.com/texturepacker' } }),
  ],
  [
    TextureAtlasFormatKindStarling,
    '<TextureAtlas imagePath="a.png"><SubTexture name="x" x="0" y="0" width="1" height="1"/></TextureAtlas>',
  ],
  [TextureAtlasFormatKindLibgdxAtlas, 'a.png\nsize: 64,64\nformat: RGBA8888\nx\n  xy: 0, 0\n  orig: 1, 1\n'],
];

describe('applyTextureAtlasImportOptions', () => {
  // ★ THE BUILT-INS ARE ALREADY SEEDED BY THE TIME ANY TEST RUNS, because the registry seeds itself on first
  // access. So "installs only what you name" cannot be shown on a built-in kind — re-registering one keeps its
  // original position by design. A custom kind is the honest vehicle.
  it('installs a named format and nothing else', () => {
    const kind = 'acme.SeamTest' as TextureAtlasFormatKind;
    expect(getTextureAtlasFormat(kind)).toBeNull();
    applyTextureAtlasImportOptions({
      formats: [{ entry: { detect: () => false, parse: (_c, atlas) => atlas }, kind }],
    });
    expect(getTextureAtlasFormat(kind)).not.toBeNull();
    unregisterTextureAtlasFormat(kind);
    expect(getTextureAtlasFormat(kind)).toBeNull();
  });

  // ★ MEASURED AGAINST A KIND THAT IS ABSENT, because a before/after comparison of the kind set cannot see this
  // bug. Empty options falling back to the full preset would re-register kinds that are ALREADY installed, which
  // leaves the set identical — the comparison passes while the fallback is live. Removing one built-in first is
  // what makes the two behaviours distinguishable.
  it('installs nothing for empty options, rather than falling back to the built-ins', () => {
    unregisterTextureAtlasFormat(TextureAtlasFormatKindStarling);
    applyTextureAtlasImportOptions({});
    expect(getTextureAtlasFormat(TextureAtlasFormatKindStarling)).toBeNull();
    applyTextureAtlasImportOptions({ formats: [starlingTextureAtlasFormat] });
    expect(getTextureAtlasFormat(TextureAtlasFormatKindStarling)).toBe(starlingTextureAtlasFormat.entry);
  });
});

describe('detectTextureAtlasFormat', () => {
  it('detects Starling XML by its <TextureAtlas> root', () => {
    expect(detectTextureAtlasFormat(STARLING_XML)).toBe(TextureAtlasFormatKindStarling);
  });

  it('detects a libGDX / Spine text atlas by its header and region blocks', () => {
    expect(detectTextureAtlasFormat(LIBGDX_ATLAS)).toBe(TextureAtlasFormatKindLibgdxAtlas);
  });

  it('detects Aseprite JSON by its meta.app string', () => {
    expect(detectTextureAtlasFormat(ASEPRITE_JSON)).toBe(TextureAtlasFormatKindAseprite);
  });

  it('detects TexturePacker JSON by its meta.app string', () => {
    expect(detectTextureAtlasFormat(TEXTUREPACKER_JSON)).toBe(TextureAtlasFormatKindTexturePacker);
  });

  it('detects an array-shaped Aseprite document', () => {
    const arrayDoc = JSON.stringify({
      frames: [{ filename: 'a', frame: { x: 0, y: 0, w: 1, h: 1 }, duration: 50 }],
      meta: { app: 'aseprite' },
    });
    expect(detectTextureAtlasFormat(arrayDoc)).toBe(TextureAtlasFormatKindAseprite);
  });

  it('falls back to the per-frame duration field when meta.app is unrecognised', () => {
    const asepriteNoApp = JSON.stringify({ frames: { a: { duration: 100 } }, meta: { app: 'unknown' } });
    const packerNoApp = JSON.stringify({ frames: { a: { rotated: false } }, meta: { app: 'unknown' } });
    expect(detectTextureAtlasFormat(asepriteNoApp)).toBe(TextureAtlasFormatKindAseprite);
    expect(detectTextureAtlasFormat(packerNoApp)).toBe(TextureAtlasFormatKindTexturePacker);
  });

  it('returns null for unrecognised, empty, or malformed input', () => {
    expect(detectTextureAtlasFormat('')).toBeNull();
    expect(detectTextureAtlasFormat('   ')).toBeNull();
    expect(detectTextureAtlasFormat('not a known format')).toBeNull();
    expect(detectTextureAtlasFormat('{ not json')).toBeNull();
    expect(detectTextureAtlasFormat('<plist><dict></dict></plist>')).toBeNull();
    expect(detectTextureAtlasFormat('{"meta":{"app":"aseprite"}}')).toBeNull();
    expect(detectTextureAtlasFormat('[1,2,3]')).toBeNull();
  });
});

describe('getTextureAtlasFormat', () => {
  it('exposes a detect/parse entry for every built-in kind', () => {
    for (const kind of [
      TextureAtlasFormatKindAseprite,
      TextureAtlasFormatKindLibgdxAtlas,
      TextureAtlasFormatKindStarling,
      TextureAtlasFormatKindTexturePacker,
    ]) {
      const entry = getTextureAtlasFormat(kind);
      expect(entry).not.toBeNull();
      expect(typeof entry!.detect).toBe('function');
      expect(typeof entry!.parse).toBe('function');
    }
  });

  it('returns null for a kind nobody registered', () => {
    expect(getTextureAtlasFormat('acme.NotAFormat' as TextureAtlasFormatKind)).toBeNull();
  });

  it('hands back an entry whose parser fills the atlas directly', () => {
    const entry = getTextureAtlasFormat(TextureAtlasFormatKindStarling)!;
    const atlas = createTextureAtlas();
    entry.parse(
      '<TextureAtlas imagePath="a.png"><SubTexture name="a" x="0" y="0" width="8" height="4"/></TextureAtlas>',
      atlas,
      {},
    );
    expect(atlas.regions.map((r) => r.name)).toEqual(['a']);
  });
});

describe('getTextureAtlasFormatKinds', () => {
  it('enumerates sorted bound kinds and stops naming one after it is unregistered', () => {
    const kind = 'zz.TestEnumeration' as TextureAtlasFormatKind;
    registerTextureAtlasFormat(kind, { detect: () => false, parse: (_content, atlas) => atlas });
    expect(getTextureAtlasFormatKinds()).toEqual([
      TextureAtlasFormatKindAseprite,
      TextureAtlasFormatKindLibgdxAtlas,
      TextureAtlasFormatKindStarling,
      TextureAtlasFormatKindTexturePacker,
      kind,
    ]);

    unregisterTextureAtlasFormat(kind);

    expect(getTextureAtlasFormatKinds()).not.toContain(kind);
  });
});

describe('never-throw policy under partial documents', () => {
  // The regression this pins: both JSON parsers guarded the JSON.parse failure and then dereferenced
  // `entry.frame` / `entry.spriteSourceSize` / `entry.sourceSize` blind one line later, so a document
  // that parsed but was not fully populated — a truncated download, an older exporter, a hand-edited
  // file — threw a raw TypeError out of the importer instead of yielding what it could read.
  const ASEPRITE_PARTIAL = JSON.stringify({
    frames: { 'a.png': { frame: { h: 4, w: 8, x: 0, y: 0 } } },
    meta: { app: 'http://www.aseprite.org/' },
  });
  const PACKER_PARTIAL = JSON.stringify({
    frames: { 'a.png': { frame: { h: 4, w: 8, x: 0, y: 0 } } },
    meta: { app: 'https://www.codeandweb.com/texturepacker' },
  });

  it('reads a frame that omits sourceSize and spriteSourceSize', () => {
    for (const content of [ASEPRITE_PARTIAL, PACKER_PARTIAL]) {
      const atlas = createTextureAtlas();
      expect(() => parseTextureAtlas(content, atlas)).not.toThrow();
      expect(atlas.regions.length).toBe(1);
      expect(atlas.regions[0].width).toBe(8);
      expect(atlas.regions[0].height).toBe(4);
      expect(atlas.regions[0].sourceX).toBe(0);
      expect(atlas.regions[0].sourceY).toBe(0);
    }
  });

  it('skips a frame with no rect rather than pushing a zero-sized region', () => {
    for (const app of ['http://www.aseprite.org/', 'https://www.codeandweb.com/texturepacker']) {
      const content = JSON.stringify({
        frames: { 'a.png': {}, 'b.png': { frame: { h: 4, w: 8, x: 0, y: 0 } } },
        meta: { app },
      });
      const atlas = createTextureAtlas();
      expect(() => parseTextureAtlas(content, atlas)).not.toThrow();
      expect(atlas.regions.map((r) => r.name)).toEqual(['b.png']);
    }
  });

  it('keeps the readable frames when one frame is malformed', () => {
    const content = JSON.stringify({
      frames: {
        'bad.png': { frame: null },
        'good.png': { frame: { h: 4, w: 8, x: 0, y: 0 } },
      },
      meta: { app: 'http://www.aseprite.org/' },
    });
    const atlas = createTextureAtlas();
    parseTextureAtlas(content, atlas);
    expect(atlas.regions.map((r) => r.name)).toEqual(['good.png']);
  });

  it('still records trim metadata when the document does supply it', () => {
    const content = JSON.stringify({
      frames: {
        'a.png': {
          frame: { h: 4, w: 8, x: 0, y: 0 },
          sourceSize: { h: 16, w: 16 },
          spriteSourceSize: { h: 4, w: 8, x: 2, y: 3 },
          trimmed: true,
        },
      },
      meta: { app: 'http://www.aseprite.org/' },
    });
    const atlas = createTextureAtlas();
    parseTextureAtlas(content, atlas);
    expect(atlas.regions[0].trimmed).toBe(true);
    expect(atlas.regions[0].originalWidth).toBe(16);
    expect(atlas.regions[0].originalHeight).toBe(16);
    expect(atlas.regions[0].sourceX).toBe(2);
    expect(atlas.regions[0].sourceY).toBe(3);
  });
});

describe('parseTextureAtlas', () => {
  it('auto-detects and parses each built-in format into the given atlas', () => {
    for (const content of [
      JSON.stringify({
        frames: { 'a.png': { duration: 100, frame: { h: 4, w: 8, x: 0, y: 0 } } },
        meta: { app: 'http://www.aseprite.org/' },
      }),
      '<TextureAtlas imagePath="a.png"><SubTexture name="a" x="0" y="0" width="8" height="4"/></TextureAtlas>',
      'a.png\nsize: 64,64\nformat: RGBA8888\na\n  xy: 0, 0\n  size: 8, 4\n  orig: 8, 4\n  offset: 0, 0\n',
    ]) {
      const atlas = createTextureAtlas();
      expect(parseTextureAtlas(content, atlas)).toBe(atlas);
      expect(atlas.regions.length).toBeGreaterThan(0);
    }
  });

  it('returns null for unrecognised content and leaves the atlas untouched', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 1, 1, undefined, undefined, 'existing');
    expect(parseTextureAtlas('not an atlas', atlas)).toBeNull();
    expect(atlas.regions.map((r) => r.name)).toEqual(['existing']);
  });

  it('honours an explicit formatKind, skipping detection', () => {
    // Content that detects as TexturePacker, parsed explicitly as TexturePacker — proves the override
    // reaches the registry rather than being ignored.
    const content = JSON.stringify({
      frames: { 'a.png': { frame: { h: 4, w: 8, x: 0, y: 0 } } },
      meta: { app: 'https://www.codeandweb.com/texturepacker' },
    });
    const atlas = createTextureAtlas();
    expect(parseTextureAtlas(content, atlas, TextureAtlasFormatKindTexturePacker)).toBe(atlas);
    expect(atlas.regions.length).toBe(1);
  });

  it('returns null for an explicit kind that is not registered', () => {
    const atlas = createTextureAtlas();
    expect(parseTextureAtlas('anything', atlas, 'acme.Missing' as TextureAtlasFormatKind)).toBeNull();
  });

  it('passes options through to the format parser', () => {
    // stripPathPrefix is a TexturePacker option; the Starling parser ignores it, which is the point
    // of one shared options bag.
    const content = JSON.stringify({
      frames: { 'sprites/a.png': { frame: { h: 4, w: 8, x: 0, y: 0 } } },
      meta: { app: 'https://www.codeandweb.com/texturepacker' },
    });
    const atlas = createTextureAtlas();
    parseTextureAtlas(content, atlas, undefined, { stripPathPrefix: true });
    expect(atlas.regions[0].name).toBe('a.png');
  });
});

describe('registerTextureAtlasFormat', () => {
  const CUSTOM = 'acme.Custom' as TextureAtlasFormatKind;

  it('makes a custom format detectable and parseable', () => {
    registerTextureAtlasFormat(CUSTOM, {
      detect: (content) => content.startsWith('ACME'),
      parse: (_content, atlas) => {
        addTextureAtlasRegion(atlas, 0, 0, 2, 2, undefined, undefined, 'custom');
        return atlas;
      },
    });
    expect(detectTextureAtlasFormat('ACME v1')).toBe(CUSTOM);
    const atlas = createTextureAtlas();
    expect(parseTextureAtlas('ACME v1', atlas)).toBe(atlas);
    unregisterTextureAtlasFormat(CUSTOM);
    expect(atlas.regions[0].name).toBe('custom');
  });

  it('does not disturb the built-in formats', () => {
    registerTextureAtlasFormat(CUSTOM, { detect: () => false, parse: (_c, atlas) => atlas });
    const starling =
      '<TextureAtlas imagePath="a.png"><SubTexture name="a" x="0" y="0" width="1" height="1"/></TextureAtlas>';
    expect(detectTextureAtlasFormat(starling)).toBe(TextureAtlasFormatKindStarling);
    unregisterTextureAtlasFormat(CUSTOM);
  });
});

describe('registry', () => {
  it('exactly one detector matches each document — order is not load-bearing', () => {
    // The property the sibling spritesheet-formats registry cannot claim: there, an Aseprite export
    // also satisfies the TexturePacker detector and only insertion order picks the winner. Here each
    // JSON detector runs the whole disambiguation, so reordering the registry cannot change an answer.
    for (const [expected, content] of CORPUS) {
      const matched = CORPUS.map(([kind]) => kind).filter((kind) => getTextureAtlasFormat(kind)!.detect(content));
      expect(matched).toEqual([expected]);
    }
  });

  it('detects each document as its own format', () => {
    for (const [expected, content] of CORPUS) {
      expect(detectTextureAtlasFormat(content)).toBe(expected);
    }
  });
});

describe('textureAtlasAllFormats', () => {
  it('covers exactly the built-in kinds the registry holds', () => {
    expect([...textureAtlasAllFormats.map((format) => format.kind)].sort()).toEqual(
      [...getTextureAtlasFormatKinds()].sort(),
    );
  });

  // A descriptor has to carry the SAME entry the registry resolved, or a catalog row naming a descriptor would
  // name an implementation the importer does not use.
  it('carries the entry identity the registry holds for each kind', () => {
    for (const format of textureAtlasAllFormats) {
      expect(getTextureAtlasFormat(format.kind)).toBe(format.entry);
    }
  });

  it('names each kind once', () => {
    const kinds = textureAtlasAllFormats.map((format) => format.kind);
    expect(kinds.length).toBe(new Set(kinds).size);
  });

  // ★ PRECEDENCE IS NOT LOAD-BEARING, PROVEN BY REVERSING IT RATHER THAN BY READING THE DETECTORS. The
  // exclusivity proof in `describe('registry')` measures that no document satisfies two detectors; this measures
  // the consequence a caller actually cares about — that installing the preset backwards answers identically.
  // Re-registering a kind keeps its original position, so the four have to be REMOVED first or the reversed
  // apply would be a no-op and this test would pass without reordering anything.
  it('detects every corpus document identically when installed in reverse order', () => {
    const forward = CORPUS.map(([, content]) => detectTextureAtlasFormat(content));
    expect(forward).toEqual(CORPUS.map(([kind]) => kind));

    for (const format of textureAtlasAllFormats) unregisterTextureAtlasFormat(format.kind);
    expect(getTextureAtlasFormatKinds()).toEqual([]);
    applyTextureAtlasImportOptions({ formats: [...textureAtlasAllFormats].reverse() });
    expect(CORPUS.map(([, content]) => detectTextureAtlasFormat(content))).toEqual(forward);

    for (const format of textureAtlasAllFormats) unregisterTextureAtlasFormat(format.kind);
    applyTextureAtlasImportOptions({ formats: textureAtlasAllFormats });
    expect(CORPUS.map(([, content]) => detectTextureAtlasFormat(content))).toEqual(forward);
  });
});

describe('unregisterTextureAtlasFormat', () => {
  it('removes a format from detection and direct resolution', () => {
    const kind = 'acme.Removed' as TextureAtlasFormatKind;
    registerTextureAtlasFormat(kind, {
      detect: (content) => content.startsWith('REMOVED:'),
      parse: (_content, atlas) => atlas,
    });

    unregisterTextureAtlasFormat(kind);

    expect(detectTextureAtlasFormat('REMOVED: data')).toBeNull();
    expect(getTextureAtlasFormat(kind)).toBeNull();
  });
});
