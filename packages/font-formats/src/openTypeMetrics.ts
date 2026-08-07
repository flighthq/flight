import type { GlyphOutlineMetrics, SfntTableDirectory } from '@flighthq/types/contract';

// The tables every outline source needs regardless of which flavor carries the outlines: `head` for the
// design-unit scale and the `loca` index width, `hhea` for the vertical metrics and the count of long
// horizontal metrics, `maxp` for the glyph count, and `hmtx` for per-glyph advances.
//
// All four are read into plain numbers here rather than kept as byte ranges, because they are small,
// fixed-layout, and read on every glyph — the alternative is re-reading a header inside a hot loop.

// Per-glyph horizontal advances, in design units, indexed by glyph id.
//
// `hmtx` is run-length shaped rather than flat: it holds `numberOfHMetrics` paired advance/bearing
// records followed by bearings alone, so every glyph past that count repeats the LAST stated advance.
// That is how monospaced and CJK fonts stay small, and reading it as a flat array silently gives every
// such glyph the wrong width. Expanded once here into a dense array so lookup is a single index.
export function readOpenTypeAdvances(
  bytes: Readonly<Uint8Array>,
  directory: Readonly<SfntTableDirectory>,
  glyphCount: number,
): Int32Array | null {
  const hhea = directory.tables.get('hhea');
  const hmtx = directory.tables.get('hmtx');
  if (hhea === undefined || hmtx === undefined || hhea.length < 36) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const longMetricCount = view.getUint16(hhea.offset + 34);
  if (longMetricCount === 0 || longMetricCount * 4 > hmtx.length) return null;

  const advances = new Int32Array(glyphCount);
  let lastAdvance = 0;
  for (let glyph = 0; glyph < glyphCount; glyph += 1) {
    if (glyph < longMetricCount) lastAdvance = view.getUint16(hmtx.offset + glyph * 4);
    advances[glyph] = lastAdvance;
  }
  return advances;
}

// The number of glyphs the font declares, which bounds every glyph-indexed lookup. Returns -1 rather
// than null so a caller can compare against it without unwrapping; a font with no `maxp` has no
// defensible glyph count and every index is out of range.
export function readOpenTypeGlyphCount(bytes: Readonly<Uint8Array>, directory: Readonly<SfntTableDirectory>): number {
  const maxp = directory.tables.get('maxp');
  if (maxp === undefined || maxp.length < 6) return -1;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(maxp.offset + 4);
}

// `head.indexToLocFormat`: 0 means `loca` holds 16-bit halved offsets, 1 means 32-bit byte offsets.
// Returns -1 when the table is absent or the value is neither, which is a malformed table rather than a
// value to guess at — guessing produces plausible garbage outlines instead of a clean rejection.
export function readOpenTypeLocaFormat(bytes: Readonly<Uint8Array>, directory: Readonly<SfntTableDirectory>): number {
  const head = directory.tables.get('head');
  if (head === undefined || head.length < 54) return -1;
  const format = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt16(head.offset + 50);
  return format === 0 || format === 1 ? format : -1;
}

// Font-wide vertical metrics, in the design units `unitsPerEm` denominates. Returns the null sentinel
// when either table is absent or too short to hold the fields being read.
export function readOpenTypeMetrics(
  bytes: Readonly<Uint8Array>,
  directory: Readonly<SfntTableDirectory>,
): GlyphOutlineMetrics | null {
  const head = directory.tables.get('head');
  const hhea = directory.tables.get('hhea');
  if (head === undefined || hhea === undefined || head.length < 54 || hhea.length < 36) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const unitsPerEm = view.getUint16(head.offset + 18);
  // A zero would make every scaled coordinate a division by zero downstream, and it is the one value in
  // this table that cannot be defaulted sensibly, so it is treated as a malformed table rather than
  // silently replaced.
  if (unitsPerEm === 0) return null;

  return {
    // `hhea` states ascender as a positive distance above the baseline and descender as a negative one.
    // `GlyphOutlineMetrics` documents both as POSITIVE distances from the baseline, so the descender's
    // sign is flipped here — at the seam, once, rather than in every consumer.
    ascent: view.getInt16(hhea.offset + 4),
    descent: -view.getInt16(hhea.offset + 6),
    lineGap: view.getInt16(hhea.offset + 8),
    unitsPerEm,
  };
}
