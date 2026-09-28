import { readBitmapFontFormatKind } from '@flighthq/bitmapfont-formats/contract';
import { decodeUTF8 } from '@flighthq/encoding/contract';
import { createRequirementSet } from '@flighthq/requirement/contract';
import {
  isReadableLottie,
  isReadableRive,
  isReadableSvg,
  parseLottieRequirements,
  parseRiveRequirements,
  parseSvgRequirements,
} from '@flighthq/scene2d-formats/contract';
import { collectAwd2BlockCounts, parseAwd2Requirements } from '@flighthq/scene3d-formats/contract';
import {
  collectGlbFeatures,
  collectGltfFeatures,
  collectMd2Features,
  collectStlFeatures,
  collectObjMaterialLibraryReferences,
  collectThreeDsChunkCounts,
  isReadableCollada,
  parseColladaRequirements,
  parseGlbRequirements,
  parseGltfRequirements,
  parseMd2Requirements,
  parseMd5AnimRequirements,
  parseMd5MeshRequirements,
  parseObjRequirements,
  parseStlRequirements,
  parseThreeDsRequirements,
} from '@flighthq/scene3d-formats/contract';
import {
  collectSpineBinarySectionCounts,
  isReadableDragonBones,
  isReadableSpineJson,
  parseDragonBonesRequirements,
  parseSpineBinaryRequirements,
  parseSpineJsonRequirements,
} from '@flighthq/skeleton2d-formats/contract';
import { parseSwfHeader, parseSwfRequirements } from '@flighthq/swf/contract';
import type {
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
  RequirementSet,
} from '@flighthq/types/contract';
import {
  RequirementFacet,
  StarlingPexFormatKind,
  TilemapFormatKindTiledTmj,
  TilemapFormatKindTiledTmx,
  TilemapFormatKindTiledTsj,
  TilemapFormatKindTiledTsx,
} from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';

import { composeContentAnalyzers } from './composeContentAnalyzers.ts';

/** The decompressors a build supplies so compressed content can be read. */
export interface ContentDecompressors {
  readonly deflate: Readonly<HostDecompressDeflateCapability> | null;
  readonly lzma: Readonly<HostDecompressLzmaCapability> | null;
}

/**
 * How one format is read: whether the bytes are readable at all, and what they require.
 *
 * `isReadable` exists because the two questions have DIFFERENT answers and only one of them is
 * visible in a `RequirementSet`. An analyzer returns an empty set both for a file that genuinely
 * requires nothing AND for a file it could not decode — a `CWS` SWF or a deflate AWD when no
 * decompressor was supplied. Without a separate readability probe the plugin cannot tell those apart,
 * and the second one silently produces a bundle missing every handler the content needed. The header
 * parsers answer it for a bounded prefix, which is exactly what they are for.
 */
export interface ContentAnalyzer {
  readonly analyze: (
    source: Uint8Array,
    decompressors: Readonly<ContentDecompressors>,
    // Optional so the analyzers that need no sibling file stay two-argument functions, and so a caller
    // driving an analyzer directly need not pass an empty array.
    references?: readonly string[],
  ) => RequirementSet;
  readonly isReadable: (source: Uint8Array, decompressors: Readonly<ContentDecompressors>) => boolean;
  /**
   * Sibling files this analyzer needs, as paths RELATIVE to the content file, or absent when it needs none.
   *
   * ★ THE ANALYZER NAMES THE FILES; THE PLUGIN READS THEM. OBJ is the case that forced this: the shading
   * model lives in the MTL, a separate file, so without it the inventory had to claim both models for every
   * material-bearing OBJ and every classic model dragged the PBR path into the bundle. Doing the I/O here
   * would give the analysis layer a filesystem and make it untestable without one; declaring the paths keeps
   * it a pure function of text and leaves resolution to the caller that already owns a path.
   *
   * The texts come back in `analyze`'s `references`, in the order returned here. A path the build could not
   * read is simply absent, so an analyzer must still produce a usable answer from fewer texts than it asked
   * for.
   */
  readonly collectReferences?: (source: Uint8Array) => readonly string[];
}

/**
 * The formats Flight analyzes, keyed by lowercase file extension.
 *
 * These call the format packages' own exports directly. Duplicating their logic here would let a
 * build's idea of what a file needs drift from what the importer actually reads — the two must be the
 * same walk or the manifest is a guess.
 *
 * Away3D writes `.awd`; `.awd2` is accepted too because the format is AWD2 and projects name the file
 * either way. Both resolve to the same analyzer, so the choice of suffix never changes what a build
 * reads.
 *
 * Binary formats (3DS, MD2) probe their headers for readability — a corrupted or truncated file
 * reports unreadable rather than silently producing an empty requirement set.
 *
 * Text formats (Collada, OBJ, MD5 mesh, MD5 anim) are decoded from UTF-8 via the portable encoding
 * contract. Collada additionally validates XML structure through `isReadableCollada`; the others are
 * always readable once decoded, since their line-oriented parsers handle any text gracefully.
 *
 * Some extensions belong to several families at once, and those entries are composed rather than assigned: the
 * answer is the UNION of every family whose analyzer recognises the file, never a precedence among them. See
 * `composeContentAnalyzers` for why picking a winner would be a guess that drops an implementation the app needs.
 *
 * ★ WHAT IS DELIBERATELY ABSENT, AND WHY IT WAS REMOVED. There is no analyzer for the bitmap-font, particle,
 * spritesheet, tilemap or texture-atlas families, and so no `.atlas`, `.fnt`, `.pex`, `.plist`, `.tmj`, `.tmx`,
 * `.tsj`, `.tsx` or `.xml` entry. Those five families answer "which variant is this?" by asking a DETECTION
 * REGISTRY, and their registries seed themselves from the full preset — so the act of installing the one format a
 * manifest chose linked every sibling codec. Measured on a real production bundle, naming one spritesheet format
 * through `applySpritesheetImportOptions` cost 40,377 bytes and carried all five codecs, where naming the codec
 * directly cost 7,935 and carried one. An analyzer that promises a build only what its content needs, and delivers
 * the whole family, is worse than no analyzer: it moves the cost somewhere nobody looks for it.
 *
 * A single-extension-to-single-codec route cannot rescue them either, because every route ends at the same
 * applier: a catalog row naming one descriptor is installed through `apply*ImportOptions`, which reaches the
 * registry initializer and seeds the full preset again. The fix for those families is to select a codec directly
 * or to accept the registry's cost knowingly — both of which their own APIs already support.
 *
 * The families that REMAIN are the ones whose analyzers answer a question inside one parser: which handlers,
 * decoders or tags a document needs, out of a family the caller passes as data. Naming a subset there links a
 * subset, which is the property that makes the manifest worth generating at all.
 */
export const DEFAULT_CONTENT_ANALYZERS: Readonly<Record<string, ContentAnalyzer>> = Object.freeze({
  '.3ds': {
    analyze: (source) => parseThreeDsRequirements(source),
    isReadable: (source) => collectThreeDsChunkCounts(source) !== null,
  },
  '.awd': AWD2_ANALYZER(),
  '.awd2': AWD2_ANALYZER(),
  '.dae': {
    analyze: (source) => parseColladaRequirements(decodeUTF8(source)),
    isReadable: (source) => isReadableCollada(decodeUTF8(source)),
  },
  '.glb': {
    analyze: (source) => parseGlbRequirements(source),
    isReadable: (source) => collectGlbFeatures(source) !== null,
  },
  '.gltf': {
    analyze: (source) => parseGltfRequirements(decodeUTF8(source)),
    isReadable: (source) => collectGltfFeatures(decodeUTF8(source)) !== null,
  },
  '.json': composeContentAnalyzers([DRAGONBONES_ANALYZER(), LOTTIE_ANALYZER(), SPINE_JSON_ANALYZER()]),
  '.md2': {
    analyze: (source) => parseMd2Requirements(source),
    isReadable: (source) => collectMd2Features(source) !== null,
  },
  '.md5anim': {
    analyze: (source) => parseMd5AnimRequirements(decodeUTF8(source)),
    isReadable: () => true,
  },
  '.md5mesh': {
    analyze: (source) => parseMd5MeshRequirements(decodeUTF8(source)),
    isReadable: () => true,
  },
  '.obj': {
    analyze: (source, _decompressors, references) => parseObjRequirements(decodeUTF8(source), references),
    collectReferences: (source) => collectObjMaterialLibraryReferences(decodeUTF8(source)),
    isReadable: () => true,
  },
  '.skel': {
    analyze: (source) => parseSpineBinaryRequirements(source),
    isReadable: (source) => collectSpineBinarySectionCounts(source) !== null,
  },
  '.riv': {
    analyze: (source) => parseRiveRequirements(source),
    isReadable: (source) => isReadableRive(source),
  },
  // ★ THE READABILITY PROBE IS THE CENSUS, WHICH IS WHERE THE BOUNDS CHECK LIVES. A truncated binary STL and a
  // text file that merely contains the word `solid` both answer null there, so neither reaches the plugin as a
  // document that requires nothing.
  '.stl': {
    analyze: (source) => parseStlRequirements(source),
    isReadable: (source) => collectStlFeatures(source) !== null,
  },
  '.svg': {
    analyze: (source) => parseSvgRequirements(decodeUTF8(source)),
    isReadable: (source) => isReadableSvg(decodeUTF8(source)),
  },
  '.swf': {
    analyze: (source, { deflate, lzma }) => parseSwfRequirements(source, deflate, lzma),
    isReadable: (source, { deflate, lzma }) => parseSwfHeader(source, deflate, lzma) !== null,
  },
  '.fnt': BITMAP_FONT_ANALYZER(),
  '.pex': xmlRootAnalyzer('particleEmitterConfig', `particles.${StarlingPexFormatKind}`),
  '.tmj': jsonObjectAnalyzer(`tilemap.${TilemapFormatKindTiledTmj}`),
  '.tmx': xmlRootAnalyzer('map', `tilemap.${TilemapFormatKindTiledTmx}`),
  '.tsj': jsonObjectAnalyzer(`tilemap.${TilemapFormatKindTiledTsj}`),
  '.tsx': xmlRootAnalyzer('tileset', `tilemap.${TilemapFormatKindTiledTsx}`),
});

/**
 * The `.fnt` analyzer: the ONE format the bytes actually are, never the one the extension suggests.
 *
 * ★ THE EXTENSION CANNOT NAME THIS FORMAT, WHICH IS WHY THIS ONE READS CONTENT. BMFont writes binary, text and
 * XML all under `.fnt`. A coarse `.fnt` → text mapping would hand an XML font to `parseBitmapFontFnt`, which
 * returns null on it — an empty font with no error, the failure content-aware analysis exists to prevent. The
 * discriminator is the same function the four detectors ask, imported from the registry-free module that owns it,
 * so this analyzer and `parseBitmapFont` cannot disagree about what a file is.
 *
 * Exactly one requirement, and no feature census: which glyphs or pages a descriptor carries changes nothing
 * about which code reads it.
 */
function BITMAP_FONT_ANALYZER(): ContentAnalyzer {
  return {
    analyze: (source) => {
      const kind = readBitmapFontFormatKind(source);
      return bedrockRequirementSet(kind === null ? null : `bitmapfont.${kind}`);
    },
    isReadable: (source) => readBitmapFontFormatKind(source) !== null,
  };
}

/**
 * A bedrock analyzer for a format whose XML ROOT ELEMENT names it, asking the same question its parser asks.
 *
 * `parseTiledTmx` rejects anything whose root is not `map` and `parseTiledTileset` anything but `tileset`, so
 * probing the root here cannot accept a file the parser would then refuse. Starling PEX is the same shape at
 * `particleEmitterConfig`.
 *
 * ★ `.tsx` IS A TILED TILESET HERE, NOT TYPESCRIPT JSX, AND THAT IS SAFE BECAUSE ANALYSIS IS OPT-IN. The plugin
 * resolves a manifest only for an explicit `?manifest` import of a named file — `import { contentParser } from
 * './terrain.tsx?manifest'` — and never walks the project, so no React component is ever analyzed. A `.tsx`
 * source file that reached this would fail the root probe and contribute nothing anyway.
 */
function xmlRootAnalyzer(root: string, kind: string): ContentAnalyzer {
  const isRoot = (source: Readonly<Uint8Array>): boolean => parseXmlDocument(decodeUTF8(source))?.name === root;
  return {
    analyze: (source) => bedrockRequirementSet(isRoot(source) ? kind : null),
    isReadable: isRoot,
  };
}

/** A bedrock analyzer for a JSON format, readable exactly when its text is the JSON object its parser needs. */
function jsonObjectAnalyzer(kind: string): ContentAnalyzer {
  const isObject = (source: Readonly<Uint8Array>): boolean => {
    let raw: unknown;
    try {
      raw = JSON.parse(decodeUTF8(source));
    } catch {
      return false;
    }
    return raw !== null && typeof raw === 'object' && !Array.isArray(raw);
  };
  return {
    analyze: (source) => bedrockRequirementSet(isObject(source) ? kind : null),
    isReadable: isObject,
  };
}

// One document-format requirement, or none when the content is not the format its extension claimed. A bedrock
// format has nothing else to say: it names one parser, and a census of what is inside the document would not
// change which code reads it.
function bedrockRequirementSet(kind: string | null): RequirementSet {
  return createRequirementSet(
    [RequirementFacet.DocumentFormat],
    kind === null ? [] : [{ facet: RequirementFacet.DocumentFormat, key: kind }],
  );
}

// The two formats need DIFFERENT readability probes, because they compress different things.
//
// SWF compresses the whole body behind the 8-byte signature, so `parseSwfHeader` already fails on a
// `CWS` file with no deflate capability — a bounded check that answers the question exactly.
//
// AWD2 compresses only the body: its 12-byte header is plain bytes and `parseAwd2Header` succeeds even
// when nothing can read what follows. Probing the header there would report a deflate AWD as readable
// and reintroduce the silent-empty hole this exists to close, so AWD2 probes the block census, which
// is the step that actually rehydrates.
function AWD2_ANALYZER(): ContentAnalyzer {
  return {
    analyze: (source, { deflate, lzma }) => parseAwd2Requirements(source, deflate, lzma),
    isReadable: (source, { deflate, lzma }) => collectAwd2BlockCounts(source, deflate, lzma) !== null,
  };
}

// Each family that shares an extension gets one analyzer, reused wherever that family's formats appear. These are
// FUNCTIONS rather than module constants for the same reason `AWD2_ANALYZER` is: the table above is built at module
// initialization, and a `const` it referenced would have to be declared before it — which fights the convention
// that loose module values live at the bottom of the file, and turns a reordering into a temporal-dead-zone crash
// rather than a lint complaint.

function DRAGONBONES_ANALYZER(): ContentAnalyzer {
  return {
    analyze: (source) => parseDragonBonesRequirements(decodeUTF8(source)),
    isReadable: (source) => isReadableDragonBones(decodeUTF8(source)),
  };
}

function LOTTIE_ANALYZER(): ContentAnalyzer {
  return {
    analyze: (source) => parseLottieRequirements(decodeUTF8(source)),
    isReadable: (source) => isReadableLottie(decodeUTF8(source)),
  };
}

function SPINE_JSON_ANALYZER(): ContentAnalyzer {
  return {
    analyze: (source) => parseSpineJsonRequirements(decodeUTF8(source)),
    isReadable: (source) => isReadableSpineJson(decodeUTF8(source)),
  };
}
