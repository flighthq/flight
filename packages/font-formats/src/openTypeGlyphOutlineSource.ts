import { getDecompressor } from '@flighthq/compression/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { detectFontFormat } from '@flighthq/font/contract';
import type {
  CffTable,
  Entity,
  GlyphOutlineMetrics,
  GlyphOutlineSource,
  ImportDiagnostic,
  OpenTypeFontExplanation,
  Path,
  SfntTableDirectory,
} from '@flighthq/types/contract';

import { runCffCharstring } from './cffCharstring';
import { readCffTable } from './cffTable';
import { readOpenTypeCodepointMap } from './openTypeCmap';
import { readOpenTypeGlyphOutline, readOpenTypeGlyphRanges } from './openTypeGlyf';
import {
  readOpenTypeAdvances,
  readOpenTypeGlyphCount,
  readOpenTypeLocaFormat,
  readOpenTypeMetrics,
} from './openTypeMetrics';
import { readSfntTableDirectory } from './sfntTableDirectory';
import { readWoffFont, WOFF_COMPRESSION } from './woffFont';

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

// WOFF is a wrapper around the same tables, so it is unwrapped once here and everything downstream — the
// directory, both outline flavors, CID — reads the rebuilt sfnt without knowing it arrived compressed.
// Returns the source unchanged for a plain sfnt, and the null sentinel for a container this package does
// not open or one whose tables need a decompressor nobody registered.
function unwrapFontContainer(
  source: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): Readonly<Uint8Array> | null {
  const format = detectFontFormat(source as Uint8Array);
  if (format === 'truetype' || format === 'opentype') return source;
  if (format !== 'woff') return null;
  return readWoffFont(source, getDecompressor(WOFF_COMPRESSION), diagnostics);
}

// The producer. Returns the null sentinel for any font this package cannot read, which covers cases
// with completely different remedies — so `explainOpenTypeFont` is the shakeable query that separates
// them, and a caller diagnosing a rejection calls it rather than reading a message string.
export function createGlyphOutlineSourceFromOpenTypeFont(
  source: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): (GlyphOutlineSource & Entity) | null {
  const parsed = readOpenTypeFontTables(source, diagnostics);
  if (parsed === null) return null;

  const { advances, bytes, cff, codepoints, directory, glyphCount, metrics, ranges } = parsed;

  // A bound method object rather than a plain record, because the source owns tables the methods close
  // over. The scratch-free contract is the caller's: `getGlyphOutline` writes into their `out`.
  const out = allocateEntity<GlyphOutlineSource & Entity>();
  out.getGlyphOutline = (out: Path, glyphIndex: number): boolean => {
    if (glyphIndex < 0 || glyphIndex >= glyphCount) return false;
    if (cff !== null) {
      const charstring = cff.charstrings[glyphIndex];
      if (charstring === undefined) return false;
      // A CID font selects the pool per glyph; every other font shares one. Reading the wrong pool
      // draws plausible geometry rather than failing, so the choice is made here from the table's own
      // structure rather than defaulted anywhere.
      const localSubrs = cff.localSubrsByGlyph?.[glyphIndex] ?? cff.localSubrs;
      return runCffCharstring(out, bytes, charstring, localSubrs, cff.globalSubrs);
    }
    return ranges === null ? false : readOpenTypeGlyphOutline(out, bytes, directory, ranges, glyphIndex);
  };
  out.getGlyphOutlineAdvance = (glyphIndex: number): number => {
    return glyphIndex < 0 || glyphIndex >= glyphCount ? 0 : advances[glyphIndex]!;
  };
  out.getGlyphOutlineIndexForCodePoint = (codePoint: number): number => {
    return codepoints.get(codePoint) ?? -1;
  };
  out.getGlyphOutlineMetrics = () => {
    return metrics;
  };
  return finishEntity(out);
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
  // WOFF is opened now: it wraps these same tables, so it is unwrapped and read like any other font. It
  // needs a DEFLATE decompressor, which `@flighthq/compression` provides on request — an unregistered one
  // is its own reason, because the remedy is one line of registration rather than a different producer.
  // WOFF2 and a collection are still not opened: WOFF2 needs Brotli and a table-transform reversal, and a
  // collection holds several fonts with no rule here for which is meant.
  if (format === 'woff' && getDecompressor(WOFF_COMPRESSION) === null) {
    return { ...empty, accepted: false, reason: 'missing-decompressor' };
  }
  if (format !== 'truetype' && format !== 'opentype' && format !== 'woff') {
    return { ...empty, accepted: false, reason: 'unsupported-container' };
  }

  const unwrapped = format === 'woff' ? readWoffFont(bytes, getDecompressor(WOFF_COMPRESSION)) : bytes;
  if (unwrapped === null) return { ...empty, accepted: false, reason: 'malformed-table', table: '' };

  const directory = readSfntTableDirectory(unwrapped);
  if (directory === null) return { ...empty, accepted: false, reason: 'too-short' };

  const counted = {
    format,
    readableTableCount: directory.tables.size,
    tableCount: directory.declaredTableCount,
  };

  void unwrapped;
  for (const tag of ['cmap', 'head', 'hhea', 'hmtx', 'maxp']) {
    if (!directory.tables.has(tag))
      return { ...counted, accepted: false, reason: 'missing-required-table', table: tag };
  }

  // `glyf` and `CFF ` are the two outline flavors, and both are read now. `CFF2` is not: it is a
  // different charstring dialect with variation support, so it keeps the stated-absence treatment that
  // `CFF ` had until this landed — a caller holding one needs a different producer, not a repaired file.
  if (!directory.tables.has('glyf')) {
    if (directory.tables.has('CFF2') && !directory.tables.has('CFF ')) {
      return { ...counted, accepted: false, reason: 'unsupported-outlines', table: 'CFF2' };
    }
    if (!directory.tables.has('CFF ')) {
      return { ...counted, accepted: false, reason: 'missing-required-table', table: 'glyf' };
    }
  } else if (!directory.tables.has('loca')) {
    return { ...counted, accepted: false, reason: 'missing-required-table', table: 'loca' };
  }

  // Every table is present, so anything still wrong is a table that disagrees with its own extent.
  const parsed = readOpenTypeFontTables(bytes);
  if (parsed === null) return { ...counted, accepted: false, reason: 'malformed-table', table: '' };
  return { ...counted, accepted: true, reason: 'ok', table: '' };
}

interface OpenTypeFontTables {
  advances: Int32Array;
  // THE UNWRAPPED FONT, WHICH IS NOT ALWAYS WHAT THE CALLER PASSED IN. A WOFF is rebuilt into a plain
  // sfnt before reading, so every offset in `directory`, `ranges` and `cff` indexes THESE bytes. Carrying
  // them here rather than letting the source close over its own argument is what stops a wrapped font
  // reading its outlines out of the wrapper — which produces empty glyphs rather than an error.
  bytes: Readonly<Uint8Array>;
  // Exactly one of `cff` and `ranges` is populated: they are the two outline flavors an sfnt can carry,
  // and a font declares which by the table it ships. Keeping them as separate fields rather than one
  // union means `getGlyphOutline` dispatches on which is present rather than re-sniffing the container.
  cff: CffTable | null;
  codepoints: ReadonlyMap<number, number>;
  directory: SfntTableDirectory;
  glyphCount: number;
  metrics: Readonly<GlyphOutlineMetrics>;
  ranges: Uint32Array | null;
}

// The single parse both entry points run, so the producer and the explanation can never disagree about
// whether a font is readable — a disagreement there is the defect where a caller is told the font is
// fine and still gets null.
function readOpenTypeFontTables(
  source: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): OpenTypeFontTables | null {
  const bytes = unwrapFontContainer(source, diagnostics);
  if (bytes === null) return null;

  const directory = readSfntTableDirectory(bytes);
  if (directory === null) return null;

  const glyphCount = readOpenTypeGlyphCount(bytes, directory);
  if (glyphCount <= 0) return null;

  const metrics = readOpenTypeMetrics(bytes, directory);
  const advances = readOpenTypeAdvances(bytes, directory, glyphCount);
  const codepoints = readOpenTypeCodepointMap(bytes, directory);
  if (metrics === null || advances === null || codepoints === null) return null;

  // The flavor-independent tables are read first because they are needed either way; only the outline
  // source differs. `glyf` is preferred when both are somehow present, since a font shipping both is
  // malformed and the quadratic path is the one with the longer history here.
  const shared = { advances, bytes, codepoints, directory, glyphCount, metrics };
  if (directory.tables.has('glyf')) {
    const locaFormat = readOpenTypeLocaFormat(bytes, directory);
    if (locaFormat === -1) return null;
    const ranges = readOpenTypeGlyphRanges(bytes, directory, glyphCount, locaFormat);
    return ranges === null ? null : { ...shared, cff: null, ranges };
  }

  const cff = readCffTable(bytes, directory);
  return cff === null ? null : { ...shared, cff, ranges: null };
}
