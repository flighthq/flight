import { encodeUTF8 } from '@flighthq/encoding/contract';
import { createRequirementSet } from '@flighthq/requirement/contract';
import type { RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { composeContentAnalyzers } from './composeContentAnalyzers.ts';
import type { ContentAnalyzer, ContentDecompressors } from './contentAnalyzers.ts';
import { DEFAULT_CONTENT_ANALYZERS } from './contentAnalyzers.ts';

const NO_DECOMPRESSORS: ContentDecompressors = { deflate: null, lzma: null };

// One document per family that still shares `.json`. Each is read by ONE of them — which is why the union property
// itself is measured on stubs below rather than on the table: no real document in this corpus is claimed by two,
// and a test that pretended otherwise would be asserting a coincidence.
const LOTTIE = encodeUTF8(
  JSON.stringify({ fr: 30, h: 100, ip: 0, layers: [{ ks: {}, nm: 'a', ty: 4 }], op: 60, v: '5.7.1', w: 100 }),
);
const SPINE_JSON = encodeUTF8(
  JSON.stringify({ animations: {}, bones: [{ name: 'root' }], skeleton: { spine: '4.1' }, skins: [], slots: [] }),
);
const DRAGONBONES = encodeUTF8(
  JSON.stringify({
    armature: [{ animation: [], bone: [], name: 'a', skin: [], slot: [] }],
    name: 'db',
    version: '5.5',
  }),
);

// A TexturePacker sheet. It used to be claimed here by BOTH the spritesheet and texture-atlas families; both
// analyzers are gone, so `.json` no longer answers for it at all. See the "no longer claims" test for why.
const TEXTURE_PACKER = encodeUTF8(
  JSON.stringify({
    frames: { 'hero.png': { frame: { h: 8, w: 8, x: 0, y: 0 } } },
    meta: { app: 'https://www.codeandweb.com/texturepacker', image: 'atlas.png' },
  }),
);

// A Tiled TMJ map, likewise no longer analyzed.
const TILED_MAP = encodeUTF8(
  JSON.stringify({ height: 1, layers: [], tileheight: 8, tilewidth: 8, type: 'map', width: 1 }),
);

describe('composeContentAnalyzers', () => {
  // ★ THE UNION IS MEASURED ON STUBS, DELIBERATELY. The property is "every member's answer survives", and stubs are
  // the only way to state it without depending on two real families happening to claim one document — a
  // coincidence a corpus change could remove, leaving a green test that no longer tests anything.
  it('reports every member that answers, not the first one', () => {
    const composed = composeContentAnalyzers([
      stubAnalyzer([RequirementFacet.DocumentFormat], ['a.One']),
      stubAnalyzer([RequirementFacet.DocumentFormat], ['b.Two']),
      stubAnalyzer([RequirementFacet.DocumentFormat], []),
    ]);
    expect(keysOf(composed.analyze(LOTTIE, NO_DECOMPRESSORS)).sort()).toEqual(['a.One', 'b.Two']);
  });

  it('routes each shared-extension document to the family that reads it', () => {
    expect(keysOf(DEFAULT_CONTENT_ANALYZERS['.json'].analyze(LOTTIE, NO_DECOMPRESSORS))).toEqual([
      'lottie.layer.shape',
    ]);
    expect(keysOf(DEFAULT_CONTENT_ANALYZERS['.json'].analyze(SPINE_JSON, NO_DECOMPRESSORS))).toEqual([
      'spine-json.bones',
    ]);
    // DragonBones recognises its armature document while this minimal one requires no section handler: readable
    // with nothing required is a real answer, and a different one from "could not be read".
    expect(DEFAULT_CONTENT_ANALYZERS['.json'].isReadable(DRAGONBONES, NO_DECOMPRESSORS)).toBe(true);
    expect(keysOf(DEFAULT_CONTENT_ANALYZERS['.json'].analyze(DRAGONBONES, NO_DECOMPRESSORS))).toEqual([]);
  });

  // ★ THE REGRESSION GUARD FOR WHY FIVE FAMILIES LEFT THIS TABLE, NARROWED TO WHAT IS STILL TRUE. Their analyzers
  // answered "which variant?" by asking a detection registry, and those registries seed themselves from the full
  // preset — so installing the one format a manifest chose linked every sibling codec. Measured on a real
  // production bundle: one spritesheet format installed through `applySpritesheetImportOptions` cost 40,377 bytes
  // and carried all five codecs, where naming the codec directly cost 7,935 and carried one.
  //
  // `.fnt`, `.pex` and the four Tiled extensions came back as BEDROCK analyzers, which is a different route and
  // not the one this guards: they emit one requirement whose catalog row names a parse function directly, so the
  // generated module binds one parser and never reaches an applier. `bedrockContentAnalyzers.test.ts` asserts
  // that, including the absence of every registry symbol. What remains here is the shared `.json` lane — which
  // must still recognise neither a TexturePacker sheet nor a Tiled map — and the three extensions that name two
  // or more parsers across different families, for which no single direct binding is true.
  it('no longer claims the families whose analyzer would have linked every sibling codec', () => {
    for (const bytes of [TEXTURE_PACKER, TILED_MAP]) {
      expect(keysOf(DEFAULT_CONTENT_ANALYZERS['.json'].analyze(bytes, NO_DECOMPRESSORS))).toEqual([]);
      expect(DEFAULT_CONTENT_ANALYZERS['.json'].isReadable(bytes, NO_DECOMPRESSORS)).toBe(false);
    }
    for (const extension of ['.atlas', '.plist', '.xml']) {
      expect(DEFAULT_CONTENT_ANALYZERS[extension], extension).toBeUndefined();
    }
  });

  // ★ UNREADABLE MUST STAY DISTINGUISHABLE FROM "REQUIRES NOTHING" FOR A SHARED EXTENSION TOO. A `.json` no family
  // recognises is the common case — an app config next to the assets — and the plugin reports it rather than
  // emitting an empty manifest that looks like a document needing no implementations.
  it('reports a document no member recognises as unreadable', () => {
    const notAnAsset = encodeUTF8(JSON.stringify({ apiBase: 'https://example.invalid', retries: 3 }));
    expect(DEFAULT_CONTENT_ANALYZERS['.json'].isReadable(notAnAsset, NO_DECOMPRESSORS)).toBe(false);
    expect(keysOf(DEFAULT_CONTENT_ANALYZERS['.json'].analyze(notAnAsset, NO_DECOMPRESSORS))).toEqual([]);
  });

  it('reports a document any member recognises as readable', () => {
    expect(DEFAULT_CONTENT_ANALYZERS['.json'].isReadable(LOTTIE, NO_DECOMPRESSORS)).toBe(true);
    expect(DEFAULT_CONTENT_ANALYZERS['.json'].isReadable(SPINE_JSON, NO_DECOMPRESSORS)).toBe(true);
  });

  // `covers` INTERSECTS. A member that inspected no facet narrows the claim rather than widening it.
  it('claims a facet only where every member inspected it', () => {
    expect(DEFAULT_CONTENT_ANALYZERS['.json'].analyze(LOTTIE, NO_DECOMPRESSORS).covers).toEqual([
      RequirementFacet.DocumentFormat,
    ]);

    const narrowed = composeContentAnalyzers([
      stubAnalyzer([RequirementFacet.DocumentFormat], ['a.One']),
      stubAnalyzer([], ['b.Two']),
    ]).analyze(LOTTIE, NO_DECOMPRESSORS);
    expect(narrowed.covers).toEqual([]);
    // The positive facts survive the narrowing: a member that proved no negatives can still contribute one.
    expect(keysOf(narrowed).sort()).toEqual(['a.One', 'b.Two']);
  });

  it('answers an empty set and unreadable for no members at all', () => {
    const empty = composeContentAnalyzers([]);
    expect(empty.isReadable(LOTTIE, NO_DECOMPRESSORS)).toBe(false);
    expect(keysOf(empty.analyze(LOTTIE, NO_DECOMPRESSORS))).toEqual([]);
  });

  it('collects the sibling files every member declares', () => {
    const composed = composeContentAnalyzers([
      { analyze: () => stubSet([], []), isReadable: () => true },
      { analyze: () => stubSet([], []), collectReferences: () => ['one.mtl'], isReadable: () => true },
      { analyze: () => stubSet([], []), collectReferences: () => ['two.mtl'], isReadable: () => true },
    ]);
    expect(composed.collectReferences?.(LOTTIE)).toEqual(['one.mtl', 'two.mtl']);
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
