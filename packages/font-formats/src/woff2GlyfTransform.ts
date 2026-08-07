import type { Woff2GlyfStreams } from '@flighthq/types/contract';

// The transformed `glyf` table: seven parallel sub-streams instead of one array of glyphs.
//
// WHY THE TRANSFORM EXISTS, WHICH IS ALSO WHY IT MUST BE REVERSED RATHER THAN DECOMPRESSED: a `glyf`
// table interleaves contour counts, flags, coordinates and hinting bytecode per glyph, so similar values
// end up far apart and compress badly. The transform SEPARATES them — every glyph's contour count in one
// stream, every flag in another, every coordinate in a third — so like sits beside like. It is a
// reordering, not a compression, and Brotli is applied over the result.
//
// So the reversal is a re-interleave: walk the streams in step and rebuild each glyph.
//
// The stream layout and header fields are interface facts about the format. The reading is Flight's own.

const WOFF2_GLYF_HEADER_BYTES = 36;

// Carves the seven sub-streams out of a transformed `glyf` table. Returns the null sentinel when the
// declared sizes do not fit the table, rather than clamped streams: a stream that is short by a few bytes
// still decodes into real-looking contour counts and coordinates, so a partial carve is the silent-
// wrongness case rather than a visible one.
//
// Kept separate from the re-interleave so the split is checkable on its own — the seven sizes plus the
// header must account for the table exactly, which is a property a real font can be tested against
// without reconstructing a single glyph.
export function readWoff2GlyfStreams(transformed: Readonly<Uint8Array>): Woff2GlyfStreams | null {
  if (transformed.byteLength < WOFF2_GLYF_HEADER_BYTES) return null;
  const view = new DataView(transformed.buffer, transformed.byteOffset, transformed.byteLength);

  const glyphCount = view.getUint16(4);
  const indexFormat = view.getUint16(6);

  const sizes: number[] = [];
  for (let index = 0; index < 7; index += 1) sizes.push(view.getUint32(8 + index * 4));

  let total = WOFF2_GLYF_HEADER_BYTES;
  for (const size of sizes) total += size;
  // The sizes must account for the table exactly. A table longer than its streams claim carries bytes
  // nothing will read; one shorter means at least one stream is truncated.
  if (total !== transformed.byteLength) return null;

  let at = WOFF2_GLYF_HEADER_BYTES;
  const slice = (size: number): Uint8Array => {
    const part = transformed.subarray(at, at + size) as Uint8Array;
    at += size;
    return part;
  };

  // Carved into locals in STREAM order before the object is built. The returned fields are alphabetized
  // to match the rest of the package, and object literal properties evaluate in source order — so
  // slicing inside the literal would consume the streams alphabetically and hand every field the right
  // LENGTH with the wrong BYTES. Lengths alone cannot see that, which is why the order lives here.
  const nContourStream = slice(sizes[0]!);
  const nPointsStream = slice(sizes[1]!);
  const flagStream = slice(sizes[2]!);
  const glyphStream = slice(sizes[3]!);
  const compositeStream = slice(sizes[4]!);
  const bboxStream = slice(sizes[5]!);
  const instructionStream = slice(sizes[6]!);

  return {
    bboxStream,
    compositeStream,
    flagStream,
    glyphCount,
    glyphStream,
    indexFormat,
    instructionStream,
    nContourStream,
    nPointsStream,
  };
}

// 255UInt16: a variable-length count used for point-per-contour and instruction lengths. Three escape
// codes extend a single byte's range, and reading one with the wrong escape yields a plausible small
// number rather than an error — which is why the codes are named rather than inlined.
//
// Advances `cursor.at`. Returns -1 when the value runs past `end`, so a caller can refuse rather than
// treat a truncated stream as a short glyph.
export function readWoff2Short(bytes: Readonly<Uint8Array>, cursor: { at: number }, end: number): number {
  if (cursor.at >= end) return -1;
  const code = bytes[cursor.at]!;
  cursor.at += 1;

  if (code === WOFF2_SHORT_WORD) {
    if (cursor.at + 2 > end) return -1;
    const value = (bytes[cursor.at]! << 8) | bytes[cursor.at + 1]!;
    cursor.at += 2;
    return value;
  }
  if (code === WOFF2_SHORT_ONE_MORE_BYTE_2) {
    if (cursor.at >= end) return -1;
    const value = bytes[cursor.at]! + WOFF2_SHORT_LOWEST * 2;
    cursor.at += 1;
    return value;
  }
  if (code === WOFF2_SHORT_ONE_MORE_BYTE_1) {
    if (cursor.at >= end) return -1;
    const value = bytes[cursor.at]! + WOFF2_SHORT_LOWEST;
    cursor.at += 1;
    return value;
  }
  return code;
}

const WOFF2_SHORT_WORD = 253;
const WOFF2_SHORT_ONE_MORE_BYTE_2 = 254;
const WOFF2_SHORT_ONE_MORE_BYTE_1 = 255;
const WOFF2_SHORT_LOWEST = 253;
