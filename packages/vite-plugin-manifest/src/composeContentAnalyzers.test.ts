import { encodeUTF8 } from '@flighthq/encoding/contract';
import { createRequirementSet } from '@flighthq/requirement/contract';
import type { RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { composeContentAnalyzers } from './composeContentAnalyzers.ts';
import type { ContentAnalyzer, ContentDecompressors } from './contentAnalyzers.ts';
import { DEFAULT_CONTENT_ANALYZERS } from './contentAnalyzers.ts';

const NO_DECOMPRESSORS: ContentDecompressors = { deflate: null, lzma: null };

// A TexturePacker sheet: read by the spritesheet family AND the texture-atlas family, because one file is usable
// as either depending on which API the app calls. This is the document the union exists for.
const TEXTURE_PACKER = encodeUTF8(
  JSON.stringify({
    frames: { 'hero.png': { frame: { h: 8, w: 8, x: 0, y: 0 } } },
    meta: { app: 'https://www.codeandweb.com/texturepacker', image: 'atlas.png' },
  }),
);

// A Tiled TMJ map, which no other `.json` family reads.
const TILED_MAP = encodeUTF8(
  JSON.stringify({ height: 1, layers: [], tileheight: 8, tilewidth: 8, type: 'map', width: 1 }),
);

// A Starling spritesheet, which is also what the texture-atlas family calls a Starling atlas.
const STARLING = encodeUTF8(
  '<?xml version="1.0"?><TextureAtlas imagePath="a.png"><SubTexture name="a"/></TextureAtlas>',
);

// A Tiled TSX tileset: XML, read only by the tilemap family.
const TILED_TILESET = encodeUTF8('<?xml version="1.0"?><tileset name="t" tilewidth="8" tileheight="8" tilecount="1"/>');

// A BMFont XML descriptor, which shares `.xml` with both atlas families and the tilemap family.
const BMFONT_XML = encodeUTF8('<?xml version="1.0"?><font><common lineHeight="32" base="26"/></font>');

describe('composeContentAnalyzers', () => {
  // ★ THE UNION IS THE POINT, AND IT IS MEASURED ON A DOCUMENT TWO FAMILIES REALLY DO CLAIM. A precedence would
  // pass every other test in this file: it would answer one correct key and silently drop the other, and the
  // build would be missing whichever implementation the app turned out to call.
  it('reports every family that recognises the document, not the first one', () => {
    const keys = keysOf(DEFAULT_CONTENT_ANALYZERS['.json'].analyze(TEXTURE_PACKER, NO_DECOMPRESSORS));
    expect(keys).toContain('spritesheet.TexturePacker');
    expect(keys).toContain('textureatlas.texturePacker');
  });

  it('reports only the family that recognises a document no other family claims', () => {
    expect(keysOf(DEFAULT_CONTENT_ANALYZERS['.json'].analyze(TILED_MAP, NO_DECOMPRESSORS))).toEqual([
      'tilemap.TiledTmj',
    ]);
  });

  it('unions across the xml families the same way', () => {
    const starling = keysOf(DEFAULT_CONTENT_ANALYZERS['.xml'].analyze(STARLING, NO_DECOMPRESSORS));
    expect(starling).toContain('spritesheet.Starling');
    expect(starling).toContain('textureatlas.starling');
    expect(keysOf(DEFAULT_CONTENT_ANALYZERS['.xml'].analyze(TILED_TILESET, NO_DECOMPRESSORS))).toEqual([
      'tilemap.TiledTsx',
    ]);
    expect(keysOf(DEFAULT_CONTENT_ANALYZERS['.xml'].analyze(BMFONT_XML, NO_DECOMPRESSORS))).toEqual([
      'bitmapfont.BmFontXml',
    ]);
  });

  // `.plist` and `.atlas` are the other two shared extensions.
  //
  // ★ THE UNION REPORTS WHAT THE DETECTORS SAY, SO A DETECTOR THAT OVER-CLAIMS BECOMES EVERY FAMILY'S PROBLEM.
  // This composition first reported `particles.ParticleDesigner` for the Cocos sheet below, because the
  // ParticleDesigner detector tested for the plist CONTAINER rather than for an emitter key — and that container
  // is shared with Cocos spritesheets. The detector now asks for a key the emitter itself declares, so the answer
  // is exact and is asserted as exact: `toContain` would pass again if that regressed.
  it('unions across the plist and atlas families', () => {
    const cocos = encodeUTF8('<?xml version="1.0"?><plist version="1.0"><dict><key>frames</key><dict/></dict></plist>');
    expect(keysOf(DEFAULT_CONTENT_ANALYZERS['.plist'].analyze(cocos, NO_DECOMPRESSORS))).toEqual([
      'spritesheet.CocosPlist',
    ]);
    // ★ AND THE MIRROR, WHICH IS WHAT MAKES THE PAIR EXACT IN BOTH DIRECTIONS. `detectCocosPlist` used to test for
    // the plist container too, so a ParticleDesigner export was claimed by the spritesheet family as well. Each
    // detector now asks for the key its own parser requires — an emitter key, or the `frames` dict — so both
    // answers are exact and both are asserted as exact. A `toContain` on either side would pass again if one
    // regressed to claiming the container.
    const emitter = encodeUTF8(
      '<?xml version="1.0"?><plist version="1.0"><dict><key>maxParticles</key><integer>200</integer>' +
        '<key>textureFileName</key><string>spark.png</string></dict></plist>',
    );
    expect(keysOf(DEFAULT_CONTENT_ANALYZERS['.plist'].analyze(emitter, NO_DECOMPRESSORS))).toEqual([
      'particles.ParticleDesigner',
    ]);

    // A plist that is neither answers nothing, and reports unreadable — so a build is told, rather than handed an
    // empty manifest that looks like a document needing no implementations.
    const neither = encodeUTF8(
      '<?xml version="1.0"?><plist version="1.0"><dict><key>note</key><string>x</string></dict></plist>',
    );
    expect(keysOf(DEFAULT_CONTENT_ANALYZERS['.plist'].analyze(neither, NO_DECOMPRESSORS))).toEqual([]);
    expect(DEFAULT_CONTENT_ANALYZERS['.plist'].isReadable(neither, NO_DECOMPRESSORS)).toBe(false);

    const libgdx = encodeUTF8(
      'a.png\nsize: 2,2\nformat: RGBA8888\nregion\n  rotate: false\n  xy: 0, 0\n  orig: 2, 2\n',
    );
    const atlasKeys = keysOf(DEFAULT_CONTENT_ANALYZERS['.atlas'].analyze(libgdx, NO_DECOMPRESSORS));
    expect(atlasKeys).toContain('spritesheet.LibgdxAtlas');
    expect(atlasKeys).toContain('textureatlas.libgdxAtlas');
    expect(DEFAULT_CONTENT_ANALYZERS['.atlas'].isReadable(encodeUTF8('not an atlas\n'), NO_DECOMPRESSORS)).toBe(false);
  });

  // ★ UNREADABLE MUST STAY DISTINGUISHABLE FROM "REQUIRES NOTHING" FOR A SHARED EXTENSION TOO. A `.json` no
  // family recognises is the common case — an app config next to the assets — and the plugin reports it rather
  // than emitting an empty manifest that looks like a document needing no implementations.
  it('reports a document no member recognises as unreadable', () => {
    const notAnAsset = encodeUTF8(JSON.stringify({ apiBase: 'https://example.invalid', retries: 3 }));
    expect(DEFAULT_CONTENT_ANALYZERS['.json'].isReadable(notAnAsset, NO_DECOMPRESSORS)).toBe(false);
    expect(keysOf(DEFAULT_CONTENT_ANALYZERS['.json'].analyze(notAnAsset, NO_DECOMPRESSORS))).toEqual([]);
  });

  it('reports a document any member recognises as readable', () => {
    expect(DEFAULT_CONTENT_ANALYZERS['.json'].isReadable(TILED_MAP, NO_DECOMPRESSORS)).toBe(true);
    expect(DEFAULT_CONTENT_ANALYZERS['.xml'].isReadable(BMFONT_XML, NO_DECOMPRESSORS)).toBe(true);
  });

  // `covers` INTERSECTS. Every family here inspects `document.format` and nothing else, so the composite claims
  // exactly that — and a member that inspected no facet would narrow the claim rather than widen it.
  it('claims a facet only where every member inspected it', () => {
    const set = DEFAULT_CONTENT_ANALYZERS['.json'].analyze(TEXTURE_PACKER, NO_DECOMPRESSORS);
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);

    const narrowed = composeContentAnalyzers([
      stubAnalyzer([RequirementFacet.DocumentFormat], ['a.One']),
      stubAnalyzer([], ['b.Two']),
    ]).analyze(TILED_MAP, NO_DECOMPRESSORS);
    expect(narrowed.covers).toEqual([]);
    // The positive facts survive the narrowing: a member that proved no negatives can still contribute one.
    expect(keysOf(narrowed).sort()).toEqual(['a.One', 'b.Two']);
  });

  it('answers an empty set and unreadable for no members at all', () => {
    const empty = composeContentAnalyzers([]);
    expect(empty.isReadable(TILED_MAP, NO_DECOMPRESSORS)).toBe(false);
    expect(keysOf(empty.analyze(TILED_MAP, NO_DECOMPRESSORS))).toEqual([]);
  });

  it('collects the sibling files every member declares', () => {
    const composed = composeContentAnalyzers([
      { analyze: () => stubSet([], []), isReadable: () => true },
      { analyze: () => stubSet([], []), collectReferences: () => ['one.mtl'], isReadable: () => true },
      { analyze: () => stubSet([], []), collectReferences: () => ['two.mtl'], isReadable: () => true },
    ]);
    expect(composed.collectReferences?.(TILED_MAP)).toEqual(['one.mtl', 'two.mtl']);
  });
});

function keysOf(set: Readonly<RequirementSet>): string[] {
  return set.requirements.map((requirement) => requirement.key);
}

function stubAnalyzer(covers: readonly RequirementFacet[], keys: readonly string[]): ContentAnalyzer {
  return { analyze: () => stubSet(covers, keys), isReadable: () => true };
}

// Built with the real constructor, because a RequirementSet carries entity identity a literal cannot fake. What
// makes it a stub is the `covers` list: an EMPTY one, which no real analyzer produces and which is exactly the
// input the intersection rule is about.
function stubSet(covers: readonly RequirementFacet[], keys: readonly string[]): RequirementSet {
  return createRequirementSet(
    covers,
    keys.map((key) => ({ facet: RequirementFacet.DocumentFormat, key })),
  );
}
