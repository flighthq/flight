import { detectFontFormat } from '@flighthq/font/contract';
import type {
  GlyphOutlineMetrics,
  GlyphOutlineSource,
  OpenTypeFontExplanation,
  Path,
  SfntTableDirectory,
} from '@flighthq/types/contract';

import { readOpenTypeCodepointMap } from './openTypeCmap';
import { readOpenTypeGlyphOutline, readOpenTypeGlyphRanges } from './openTypeGlyf';
import {
  readOpenTypeAdvances,
  readOpenTypeGlyphCount,
  readOpenTypeLocaFormat,
  readOpenTypeMetrics,
} from './openTypeMetrics';
import { readSfntTableDirectory } from './sfntTableDirectory';

/**
 * OPENTYPE/TRUETYPE BYTES → THE EXISTING `GlyphOutlineSource` SEAM.
 *
 * This package produces an interface it does not own. `GlyphOutlineSource` is declared in
 * `@flighthq/types`, `@flighthq/font` already turns one into a rasterizer backend, and `@flighthq/swf`
 * already produces one from its own edge-record encoding. What was missing was only a producer that
 * reads a font FILE, so the output shape here is determined rather than designed.
 *
 * WHAT THIS PACKAGE IS NOT. Shaping is `@flighthq/textshaper`, layout is `@flighthq/textlayout`, and
 * static bitmap strikes are `@flighthq/bitmapfont`. This produces outlines, advances, and a codepoint
 * mapping, in unhinted design units, and nothing else.
 *
 * ON PROVENANCE, BECAUSE THIS IS THE MOST ENCUMBERED DOMAIN IN THE TREE. Table tags, field offsets, and
 * flag bits are interface facts — what a published format exists to state — and carry no obligation.
 * The outline reconstruction is an ALGORITHM, and it is built from the specification in Flight's own
 * architecture, never transcribed from a reference implementation. Anything tested against is fetched
 * on demand and committed nowhere; synthetic fonts assembled byte by byte in a test are preferred.
 */

// The producer. Returns the null sentinel for any font this package cannot read, which covers cases
// with completely different remedies — so `explainOpenTypeFont` is the shakeable query that separates
// them, and a caller diagnosing a rejection calls it rather than reading a message string.
export function createGlyphOutlineSourceFromOpenTypeFont(bytes: Readonly<Uint8Array>): GlyphOutlineSource | null {
  const parsed = readOpenTypeFontTables(bytes);
  if (parsed === null) return null;

  const { advances, codepoints, directory, glyphCount, metrics, ranges } = parsed;

  // A bound method object rather than a plain record, because the source owns tables the methods close
  // over. The scratch-free contract is the caller's: `getGlyphOutline` writes into their `out`.
  return {
    getGlyphOutline(out: Path, glyphIndex: number): boolean {
      if (glyphIndex < 0 || glyphIndex >= glyphCount) return false;
      return readOpenTypeGlyphOutline(out, bytes, directory, ranges, glyphIndex);
    },
    getGlyphOutlineAdvance(glyphIndex: number): number {
      return glyphIndex < 0 || glyphIndex >= glyphCount ? 0 : advances[glyphIndex]!;
    },
    getGlyphOutlineIndexForCodePoint(codePoint: number): number {
      return codepoints.get(codePoint) ?? -1;
    },
    getGlyphOutlineMetrics() {
      return metrics;
    },
  };
}

// Why `createGlyphOutlineSourceFromOpenTypeFont` returned null, as plain data.
//
// Kept separate from the producer, and re-reading the bytes rather than being handed its intermediate
// state, so a caller that never diagnoses anything does not link it. That costs a second parse on the
// failure path only, which is the path where nobody is counting microseconds.
export function explainOpenTypeFont(bytes: Readonly<Uint8Array>): OpenTypeFontExplanation {
  const format = detectFontFormat(bytes as Uint8Array) ?? '';
  const empty = { format, readableTableCount: 0, table: '', tableCount: 0 };

  if (bytes.byteLength < 12) return { ...empty, accepted: false, reason: 'too-short' };
  if (format === '') return { ...empty, accepted: false, reason: 'unrecognized' };
  // WOFF and WOFF2 are compressed wrappers around these same tables and need a decompression stage
  // first; a collection holds several fonts with no rule here for which is meant. All three are real
  // fonts, which is why this is not `unrecognized`.
  if (format !== 'truetype' && format !== 'opentype') {
    return { ...empty, accepted: false, reason: 'unsupported-container' };
  }

  const directory = readSfntTableDirectory(bytes);
  if (directory === null) return { ...empty, accepted: false, reason: 'too-short' };

  const counted = {
    format,
    readableTableCount: directory.tables.size,
    tableCount: directory.declaredTableCount,
  };

  for (const tag of ['cmap', 'head', 'hhea', 'hmtx', 'maxp']) {
    if (!directory.tables.has(tag))
      return { ...counted, accepted: false, reason: 'missing-required-table', table: tag };
  }

  // Checked BEFORE `glyf` is reported missing: a CFF font is not a damaged TrueType font, and saying so
  // is the difference between "find a different producer" and "re-download this file".
  if (!directory.tables.has('glyf')) {
    for (const tag of ['CFF ', 'CFF2']) {
      if (directory.tables.has(tag)) return { ...counted, accepted: false, reason: 'unsupported-outlines', table: tag };
    }
    return { ...counted, accepted: false, reason: 'missing-required-table', table: 'glyf' };
  }
  if (!directory.tables.has('loca')) {
    return { ...counted, accepted: false, reason: 'missing-required-table', table: 'loca' };
  }

  // Every table is present, so anything still wrong is a table that disagrees with its own extent.
  const parsed = readOpenTypeFontTables(bytes);
  if (parsed === null) return { ...counted, accepted: false, reason: 'malformed-table', table: '' };
  return { ...counted, accepted: true, reason: 'ok', table: '' };
}

interface OpenTypeFontTables {
  advances: Int32Array;
  codepoints: ReadonlyMap<number, number>;
  directory: SfntTableDirectory;
  glyphCount: number;
  metrics: Readonly<GlyphOutlineMetrics>;
  ranges: Uint32Array;
}

// The single parse both entry points run, so the producer and the explanation can never disagree about
// whether a font is readable — a disagreement there is the defect where a caller is told the font is
// fine and still gets null.
function readOpenTypeFontTables(bytes: Readonly<Uint8Array>): OpenTypeFontTables | null {
  const format = detectFontFormat(bytes as Uint8Array);
  if (format !== 'truetype' && format !== 'opentype') return null;

  const directory = readSfntTableDirectory(bytes);
  if (directory === null || !directory.tables.has('glyf')) return null;

  const glyphCount = readOpenTypeGlyphCount(bytes, directory);
  if (glyphCount <= 0) return null;

  const locaFormat = readOpenTypeLocaFormat(bytes, directory);
  if (locaFormat === -1) return null;

  const metrics = readOpenTypeMetrics(bytes, directory);
  const advances = readOpenTypeAdvances(bytes, directory, glyphCount);
  const codepoints = readOpenTypeCodepointMap(bytes, directory);
  const ranges = readOpenTypeGlyphRanges(bytes, directory, glyphCount, locaFormat);
  if (metrics === null || advances === null || codepoints === null || ranges === null) return null;

  return { advances, codepoints, directory, glyphCount, metrics, ranges };
}
