import { decodeUTF8 } from '@flighthq/encoding/contract';
import { isReadableRive, parseRiveRequirements } from '@flighthq/scene2d-formats/contract';
import { collectAwd2BlockCounts, parseAwd2Requirements } from '@flighthq/scene3d-formats/contract';
import {
  collectMd2Features,
  collectObjMaterialLibraryReferences,
  collectThreeDsChunkCounts,
  isReadableCollada,
  parseColladaRequirements,
  parseMd2Requirements,
  parseMd5AnimRequirements,
  parseMd5MeshRequirements,
  parseObjRequirements,
  parseThreeDsRequirements,
} from '@flighthq/scene3d-formats/contract';
import { collectSpineBinarySectionCounts, parseSpineBinaryRequirements } from '@flighthq/skeleton2d-formats/contract';
import { parseSwfHeader, parseSwfRequirements } from '@flighthq/swf/contract';
import type {
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
  RequirementSet,
} from '@flighthq/types/contract';

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
  '.swf': {
    analyze: (source, { deflate, lzma }) => parseSwfRequirements(source, deflate, lzma),
    isReadable: (source, { deflate, lzma }) => parseSwfHeader(source, deflate, lzma) !== null,
  },
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
