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

// One point's coordinate delta, decoded from the flag's low seven bits and the bytes that follow it in
// the glyph stream. `used` is how many glyph-stream bytes this point consumed.
//
// The 128 codes partition as 10 + 10 + 64 + 36 + 4 + 4, and each block fixes a byte count, a bit width
// per axis, a base to add to the raw value, and a sign pair. Those are interface facts about the
// format — what a published format exists to state — and the decoding below is Flight's own.
//
// ★ TWO DETAILS THAT A PLAUSIBLE-LOOKING GUESS GETS WRONG, AND NEITHER FAILS LOUDLY:
//   1. WITHIN EVERY FOUR-CODE GROUP THE ORDER IS (-,-) (+,-) (-,+) (+,+) — so bit 0 of the group index
//      is the X sign and bit 1 is the Y sign. Swapping them MIRRORS every diagonal delta, and a
//      mirrored glyph is still a glyph.
//   2. THE 12-BIT AND 16-BIT BLOCKS ADD NO BASE. The 4-bit and 8-bit blocks add 1, 17, 33, 49 and
//      1, 257, 513 respectively; the two widest add nothing. An off-by-one there shifts only the
//      largest deltas, so most glyphs still look right.
export function decodeWoff2Triplet(
  code: number,
  glyphStream: Readonly<Uint8Array>,
  at: number,
): { dx: number; dy: number; used: number } | null {
  const used = code < 84 ? 1 : code < 120 ? 2 : code < 124 ? 3 : 4;
  if (at + used > glyphStream.byteLength) return null;
  const b0 = glyphStream[at]!;
  const b1 = glyphStream[at + 1] ?? 0;
  const b2 = glyphStream[at + 2] ?? 0;
  const b3 = glyphStream[at + 3] ?? 0;
  const signX = (group: number): number => ((group & 1) !== 0 ? 1 : -1);
  const signY = (group: number): number => ((group & 2) !== 0 ? 1 : -1);

  if (code < 10) return { dx: 0, dy: ((code & 1) !== 0 ? 1 : -1) * ((code >> 1) * 256 + b0), used };
  if (code < 20) {
    const i = code - 10;
    return { dx: ((i & 1) !== 0 ? 1 : -1) * ((i >> 1) * 256 + b0), dy: 0, used };
  }
  if (code < 84) {
    // Four bits per axis packed into one byte, X in the high nibble.
    const i = code - 20;
    return {
      dx: signX(i) * (1 + (i >> 4) * 16 + (b0 >> 4)),
      dy: signY(i) * (1 + ((i >> 2) & 3) * 16 + (b0 & 15)),
      used,
    };
  }
  if (code < 120) {
    const i = code - 84;
    return {
      dx: signX(i) * (1 + Math.floor(i / 12) * 256 + b0),
      dy: signY(i) * (1 + Math.floor((i % 12) / 4) * 256 + b1),
      used,
    };
  }
  if (code < 124) {
    const i = code - 120;
    return { dx: signX(i) * ((b0 << 4) | (b1 >> 4)), dy: signY(i) * (((b1 & 15) << 8) | b2), used };
  }
  const i = code - 124;
  return { dx: signX(i) * ((b0 << 8) | b1), dy: signY(i) * ((b2 << 8) | b3), used };
}

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
