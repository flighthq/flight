import { collectAwd2BlockCounts, parseAwd2Requirements } from '@flighthq/scene3d-formats/contract';
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
  readonly analyze: (source: Uint8Array, decompressors: Readonly<ContentDecompressors>) => RequirementSet;
  readonly isReadable: (source: Uint8Array, decompressors: Readonly<ContentDecompressors>) => boolean;
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
 */
export const DEFAULT_CONTENT_ANALYZERS: Readonly<Record<string, ContentAnalyzer>> = Object.freeze({
  '.awd': AWD2_ANALYZER(),
  '.awd2': AWD2_ANALYZER(),
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
