import { isReadableBitmapFont, parseBitmapFontRequirements } from '@flighthq/bitmapfont-formats/contract';
import { decodeUTF8 } from '@flighthq/encoding/contract';
import { isReadableParticleConfig, parseParticleRequirements } from '@flighthq/particles-formats/contract';
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
import { isReadableSpritesheet, parseSpritesheetRequirements } from '@flighthq/spritesheet-formats/contract';
import { parseSwfHeader, parseSwfRequirements } from '@flighthq/swf/contract';
import { isReadableTextureAtlas, parseTextureAtlasRequirements } from '@flighthq/textureatlas-formats/contract';
import { isReadableTilemapDocument, parseTilemapRequirements } from '@flighthq/tilemap-formats/contract';
import type {
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
  RequirementSet,
} from '@flighthq/types/contract';

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
 * ★ SOME EXTENSIONS BELONG TO SEVERAL FAMILIES AT ONCE, and those entries are composed rather than assigned.
 * `.json` alone is claimed by eight families and `.xml` by four, so there is no one analyzer for them — and the
 * answer is the UNION of every family whose detector recognises the file, never a precedence among them. See
 * `composeContentAnalyzers` for why picking a winner would be a guess that drops an implementation the app needs.
 *
 * `.fnt` is listed although only one family claims it, because that family is itself three formats under one
 * extension: BMFont writes binary, text and XML all as `.fnt`, which is discriminated inside
 * `parseBitmapFontRequirements` rather than here.
 *
 * `.tsx` is a Tiled tileset. It collides with the TypeScript-React suffix, which is harmless here for two
 * reasons: this table is consulted only for a content file a build explicitly imports through the plugin, and a
 * TSX component's text is recognised by no tilemap detector, so it reports unreadable rather than parsing as a
 * tileset.
 */
export const DEFAULT_CONTENT_ANALYZERS: Readonly<Record<string, ContentAnalyzer>> = Object.freeze({
  '.3ds': {
    analyze: (source) => parseThreeDsRequirements(source),
    isReadable: (source) => collectThreeDsChunkCounts(source) !== null,
  },
  '.atlas': composeContentAnalyzers([SPRITESHEET_ANALYZER(), TEXTURE_ATLAS_ANALYZER()]),
  '.awd': AWD2_ANALYZER(),
  '.awd2': AWD2_ANALYZER(),
  '.dae': {
    analyze: (source) => parseColladaRequirements(decodeUTF8(source)),
    isReadable: (source) => isReadableCollada(decodeUTF8(source)),
  },
  '.fnt': BITMAP_FONT_ANALYZER(),
  '.glb': {
    analyze: (source) => parseGlbRequirements(source),
    isReadable: (source) => collectGlbFeatures(source) !== null,
  },
  '.gltf': {
    analyze: (source) => parseGltfRequirements(decodeUTF8(source)),
    isReadable: (source) => collectGltfFeatures(decodeUTF8(source)) !== null,
  },
  '.json': composeContentAnalyzers([
    BITMAP_FONT_ANALYZER(),
    DRAGONBONES_ANALYZER(),
    LOTTIE_ANALYZER(),
    PARTICLE_ANALYZER(),
    SPINE_JSON_ANALYZER(),
    SPRITESHEET_ANALYZER(),
    TEXTURE_ATLAS_ANALYZER(),
    TILEMAP_ANALYZER(),
  ]),
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
  '.pex': PARTICLE_ANALYZER(),
  '.plist': composeContentAnalyzers([PARTICLE_ANALYZER(), SPRITESHEET_ANALYZER()]),
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
  '.tmj': TILEMAP_ANALYZER(),
  '.tmx': TILEMAP_ANALYZER(),
  '.tsj': TILEMAP_ANALYZER(),
  '.tsx': TILEMAP_ANALYZER(),
  '.xml': composeContentAnalyzers([
    BITMAP_FONT_ANALYZER(),
    SPRITESHEET_ANALYZER(),
    TEXTURE_ATLAS_ANALYZER(),
    TILEMAP_ANALYZER(),
  ]),
});

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

// Bytes, not text: three of the four BMFont forms are text and one is binary, so the family's own entry point
// takes the bytes and decodes what it needs.
function BITMAP_FONT_ANALYZER(): ContentAnalyzer {
  return {
    analyze: (source) => parseBitmapFontRequirements(source),
    isReadable: (source) => isReadableBitmapFont(source),
  };
}

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

function PARTICLE_ANALYZER(): ContentAnalyzer {
  return {
    analyze: (source) => parseParticleRequirements(decodeUTF8(source)),
    isReadable: (source) => isReadableParticleConfig(decodeUTF8(source)),
  };
}

function SPINE_JSON_ANALYZER(): ContentAnalyzer {
  return {
    analyze: (source) => parseSpineJsonRequirements(decodeUTF8(source)),
    isReadable: (source) => isReadableSpineJson(decodeUTF8(source)),
  };
}

function SPRITESHEET_ANALYZER(): ContentAnalyzer {
  return {
    analyze: (source) => parseSpritesheetRequirements(decodeUTF8(source)),
    isReadable: (source) => isReadableSpritesheet(decodeUTF8(source)),
  };
}

function TEXTURE_ATLAS_ANALYZER(): ContentAnalyzer {
  return {
    analyze: (source) => parseTextureAtlasRequirements(decodeUTF8(source)),
    isReadable: (source) => isReadableTextureAtlas(decodeUTF8(source)),
  };
}

function TILEMAP_ANALYZER(): ContentAnalyzer {
  return {
    analyze: (source) => parseTilemapRequirements(decodeUTF8(source)),
    isReadable: (source) => isReadableTilemapDocument(decodeUTF8(source)),
  };
}
