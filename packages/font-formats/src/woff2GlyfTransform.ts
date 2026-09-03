import type { Woff2GlyfStreams } from '@flighthq/types/contract';

import { encodeSfntCompositeGlyph, encodeSfntLoca, encodeSfntSimpleGlyph } from './sfntAssembly';

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

// Builds the `reverseTransform` callback `readWoff2Font` takes. Create one per font: it holds the
// reversal's second output between the two calls that need it, so it is not reusable across fonts.
//
// ★ ONE REVERSAL PRODUCES TWO TABLES, BUT THE SEAM ASKS FOR ONE TABLE AT A TIME. Reversing the `glyf`
// transform necessarily rebuilds `loca` as well — the offsets are only knowable once every record has
// been laid out — yet the callback is invoked once per tag. A stateless implementation would therefore
// walk all seven streams TWICE per font, once to answer `glyf` and again to answer `loca`, which is the
// most expensive part of opening the file. Holding the pair is what avoids that.
//
// A WOFF2 whose `glyf` is transformed always marks `loca` transformed too, with a transformed length of
// zero, because its contents are entirely derived. Asking for `loca` first is handled: the reversal runs
// from the `glyf` bytes in `tables` whichever tag arrives first.
export function createWoff2TransformReverser(): (
  tag: string,
  transformed: Readonly<Uint8Array>,
  tables: ReadonlyMap<string, Uint8Array>,
) => Uint8Array | null {
  let reversed: { glyf: Uint8Array; loca: Uint8Array } | null = null;

  const reverse = (glyfBytes: Readonly<Uint8Array> | undefined): boolean => {
    if (reversed !== null) return true;
    if (glyfBytes === undefined) return false;
    const streams = readWoff2GlyfStreams(glyfBytes);
    if (streams === null) return false;
    reversed = reverseWoff2GlyfTransform(streams);
    return reversed !== null;
  };

  return (tag, transformed, tables) => {
    if (tag === 'glyf') return reverse(transformed) ? reversed!.glyf : null;
    if (tag === 'loca') return reverse(tables.get('glyf')) ? reversed!.loca : null;
    // Any other transformed table is a transform this package does not implement, and refusing is what
    // stops a font being assembled with transformed bytes under an untransformed tag.
    //
    // ★ THIS REFUSAL IS NOT A KNOWN GAP, AND THE DISTINCTION IS WORTH THE COMMENT. The container also
    // defines a transform for `hmtx`, so a reader that declines it reads as incomplete against the
    // format. In practice producers emit the `glyf`/`loca` pair and nothing else, because that pair is
    // where the compression is; the others are permitted but unused. Implementing one would therefore
    // add a branch no font reaches AND that no font can test — trading a loud refusal for an untested
    // path. `censusWoff2Transforms` in the reversal oracle is what measures this, and it is the check
    // to re-run before deciding the situation has changed.
    return null;
  };
}

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

// How many bytes of `bboxStream` the presence bitmap occupies, before the explicit bounding boxes
// begin. One bit per glyph, but the bitmap is padded to a 32-BIT boundary rather than to a byte.
//
// ★ THE PADDING IS THE WHOLE REASON THIS IS A FUNCTION AND NOT AN INLINE `>> 3`. Rounding to a byte
// gives the right answer whenever the glyph count happens to land in the same 4-byte cell, and the
// wrong answer by 1-3 bytes otherwise. Those bytes are the SEAM between the bitmap and the first
// bounding box, so being short by two shifts every box by one int16 — each glyph then reads three of
// its own values plus one belonging to its neighbour, which still looks like a plausible box.
//
// The coincidence is what makes it dangerous: a font whose glyph count rounds the same way under both
// rules cannot distinguish them, so byte-rounding reads such a font perfectly and the neighbouring
// weight of the same family not at all. Any check of this seam needs a glyph count that is NOT a
// multiple of 32.
export function getWoff2BboxBitmapByteLength(glyphCount: number): number {
  return 4 * Math.ceil(glyphCount / 32);
}

// Whether a glyph carries an explicit bounding box in `bboxStream`, rather than one to be computed
// from its points. Composite glyphs always do, since they hold no points of their own.
//
// Bit order is most-significant-first: glyph 0 is the HIGH bit of byte 0. Reading it the other way
// round is the more dangerous of the two mistakes, because it is neither right nor obviously wrong —
// the two orders agree on any byte that is symmetric, so a least-significant-first reader recovers a
// scattered subset of the boxes and mis-assigns the rest to the wrong glyphs.
export function hasWoff2GlyphBbox(bboxStream: Readonly<Uint8Array>, glyphIndex: number): boolean {
  const byte = bboxStream[glyphIndex >> 3];
  if (byte === undefined) return false;
  return (byte & (0x80 >> (glyphIndex & 7))) !== 0;
}

// Whether a point is on the curve, from its `flagStream` byte. The low seven bits are the triplet
// code; the high bit carries this.
//
// ★ THE SENSE IS INVERTED RELATIVE TO `glyf`, AND ASSUMING OTHERWISE IS SILENT. In an sfnt `glyf`
// table the on-curve flag is bit 0 SET meaning on-curve. Here the high bit SET means the point is
// OFF the curve, and CLEAR means on-curve. Anyone carrying the `glyf` convention across will invert
// every point in the font — and an inverted outline still draws a glyph, with corners where curves
// belong, so nothing fails loudly. Same silent class as the sign order and the missing base above.
//
// The mistake is unfalsifiable by eye, which is why the sense is pinned by a named function rather
// than an inline mask: an outline with every on/off decision inverted is still a closed, plausible
// outline, so it renders as a glyph rather than as damage.
export function isWoff2PointOnCurve(flag: number): boolean {
  return (flag & WOFF2_POINT_OFF_CURVE) === 0;
}

// How many `compositeStream` bytes one composite glyph's component records occupy, and whether any
// component asks for hinting instructions. Returns the null sentinel when the records run past the end
// of the stream.
//
// A composite glyph names other glyphs and places them, so it carries no points of its own — which is
// why a reversal walking the streams is tempted to skip it entirely.
//
// ★ SKIPPING IT DESYNCHRONISES THE GLYPH STREAM, AND NOT THROUGH THE STREAM YOU WOULD EXPECT. A
// composite consumes no points, so the flag and point streams are genuinely untouched. But when any
// component sets `WE_HAVE_INSTRUCTIONS`, the glyph's instruction length is stored in the GLYPH stream,
// exactly as a simple glyph's is. Miss that read and every SIMPLE glyph after this one decodes from a
// position one length-field too early — so the failure surfaces far from its cause, in glyphs that are
// themselves fine, and the first symptom is usually a decoded outline that overruns the font's own
// declared bounding box.
//
// `hasInstructions` is therefore the field a caller must not ignore; `byteLength` alone looks like the
// complete answer and is not.
export function measureWoff2CompositeGlyph(
  compositeStream: Readonly<Uint8Array>,
  at: number,
): { byteLength: number; hasInstructions: boolean } | null {
  const start = at;
  let cursor = at;
  let hasInstructions = false;
  let more = true;

  while (more) {
    // Flags and glyph index, then the placement arguments and the optional transform.
    if (cursor + 4 > compositeStream.byteLength) return null;
    const flags = (compositeStream[cursor]! << 8) | compositeStream[cursor + 1]!;
    cursor += 4;
    cursor += (flags & WOFF2_COMPONENT_ARGS_ARE_WORDS) !== 0 ? 4 : 2;

    // The three transform forms are mutually exclusive, widest first: a single scale, one per axis, or
    // a full 2x2. Adding them instead of choosing would overcount every transformed component.
    if ((flags & WOFF2_COMPONENT_HAS_SCALE) !== 0) cursor += 2;
    else if ((flags & WOFF2_COMPONENT_HAS_XY_SCALE) !== 0) cursor += 4;
    else if ((flags & WOFF2_COMPONENT_HAS_TWO_BY_TWO) !== 0) cursor += 8;

    if ((flags & WOFF2_COMPONENT_HAS_INSTRUCTIONS) !== 0) hasInstructions = true;
    more = (flags & WOFF2_COMPONENT_MORE_COMPONENTS) !== 0;
  }
  if (cursor > compositeStream.byteLength) return null;
  return { byteLength: cursor - start, hasInstructions };
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

// The high bit of a `flagStream` byte. Named rather than inlined because the value is unremarkable
// and the SENSE is not: set means off-curve, which is the opposite of the `glyf` convention.
const WOFF2_POINT_OFF_CURVE = 0x80;

// Composite component flags. These are interface facts about the `glyf` format, which a composite
// glyph's records are written in unchanged — the transform reorders whole glyphs, it does not re-encode
// a component record.
const WOFF2_COMPONENT_ARGS_ARE_WORDS = 0x0001;
const WOFF2_COMPONENT_HAS_INSTRUCTIONS = 0x0100;
const WOFF2_COMPONENT_HAS_SCALE = 0x0008;
const WOFF2_COMPONENT_HAS_TWO_BY_TWO = 0x0080;
const WOFF2_COMPONENT_HAS_XY_SCALE = 0x0040;
const WOFF2_COMPONENT_MORE_COMPONENTS = 0x0020;

const WOFF2_SHORT_WORD = 253;
const WOFF2_SHORT_ONE_MORE_BYTE_2 = 254;
const WOFF2_SHORT_ONE_MORE_BYTE_1 = 255;
const WOFF2_SHORT_LOWEST = 253;

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

const EMPTY_BYTES = new Uint8Array(0);

function measurePointBounds(
  xs: readonly number[],
  ys: readonly number[],
): { xMax: number; xMin: number; yMax: number; yMin: number } {
  let xMax = xs[0] ?? 0;
  let xMin = xs[0] ?? 0;
  let yMax = ys[0] ?? 0;
  let yMin = ys[0] ?? 0;
  for (let index = 1; index < xs.length; index += 1) {
    if (xs[index]! < xMin) xMin = xs[index]!;
    if (xs[index]! > xMax) xMax = xs[index]!;
    if (ys[index]! < yMin) yMin = ys[index]!;
    if (ys[index]! > yMax) yMax = ys[index]!;
  }
  return { xMax, xMin, yMax, yMin };
}

function padToEven(record: Readonly<Uint8Array>): Uint8Array {
  if (record.byteLength % 2 === 0) return record as Uint8Array;
  const padded = new Uint8Array(record.byteLength + 1);
  padded.set(record);
  return padded;
}

// Re-interleaves the seven sub-streams back into a `glyf` table and the `loca` that indexes it. This is
// the reversal the whole transform exists to be undone by: every other export here reads one piece, and
// this walks them in step.
//
// Returns the null sentinel the moment any stream runs short, rather than a partial table. A truncated
// walk yields real-looking glyphs for every index before the break, so a partial result is the silent
// failure and a refusal is the visible one.
//
// ★ EVERY RECORD IS PADDED TO AN EVEN LENGTH, AND THAT IS CORRECTNESS RATHER THAN TIDINESS. With the
// short `loca` format each offset is stored halved, so an odd offset cannot be represented; see
// `encodeSfntLoca`, which refuses rather than truncating.
export function reverseWoff2GlyfTransform(
  streams: Readonly<Woff2GlyfStreams>,
): { glyf: Uint8Array; loca: Uint8Array } | null {
  if (streams.nContourStream.byteLength < streams.glyphCount * 2) return null;
  const contourView = new DataView(
    streams.nContourStream.buffer,
    streams.nContourStream.byteOffset,
    streams.nContourStream.byteLength,
  );

  const points = { at: 0 };
  const glyph = { at: 0 };
  let compositeAt = 0;
  let flagAt = 0;
  let instructionAt = 0;
  let bboxAt = getWoff2BboxBitmapByteLength(streams.glyphCount);

  const records: Uint8Array[] = [];
  for (let index = 0; index < streams.glyphCount; index += 1) {
    const contours = contourView.getInt16(index * 2);

    // A glyph carrying an explicit box consumes one from the stream whether or not it needs it, so the
    // read happens here rather than only where a box is wanted.
    let stored: { xMax: number; xMin: number; yMax: number; yMin: number } | null = null;
    if (hasWoff2GlyphBbox(streams.bboxStream, index)) {
      if (bboxAt + 8 > streams.bboxStream.byteLength) return null;
      const box = new DataView(streams.bboxStream.buffer, streams.bboxStream.byteOffset + bboxAt, 8);
      stored = { xMax: box.getInt16(4), xMin: box.getInt16(0), yMax: box.getInt16(6), yMin: box.getInt16(2) };
      bboxAt += 8;
    }

    if (contours === 0) {
      records.push(EMPTY_BYTES);
      continue;
    }

    if (contours < 0) {
      const measured = measureWoff2CompositeGlyph(streams.compositeStream, compositeAt);
      // A composite cannot compute its own box, so a missing one is unrecoverable rather than a default.
      if (measured === null || stored === null) return null;
      const components = streams.compositeStream.subarray(compositeAt, compositeAt + measured.byteLength);
      compositeAt += measured.byteLength;

      let instructions: Readonly<Uint8Array> = EMPTY_BYTES;
      if (measured.hasInstructions) {
        const length = readWoff2Short(streams.glyphStream, glyph, streams.glyphStream.byteLength);
        if (length < 0 || instructionAt + length > streams.instructionStream.byteLength) return null;
        instructions = streams.instructionStream.subarray(instructionAt, instructionAt + length);
        instructionAt += length;
      }
      records.push(padToEven(encodeSfntCompositeGlyph(components, instructions, stored, measured.hasInstructions)));
      continue;
    }

    const endPtsOfContours: number[] = [];
    let pointCount = 0;
    for (let contour = 0; contour < contours; contour += 1) {
      const count = readWoff2Short(streams.nPointsStream, points, streams.nPointsStream.byteLength);
      if (count < 0) return null;
      pointCount += count;
      endPtsOfContours.push(pointCount - 1);
    }
    if (flagAt + pointCount > streams.flagStream.byteLength) return null;

    const xs: number[] = [];
    const ys: number[] = [];
    const onCurve: boolean[] = [];
    let x = 0;
    let y = 0;
    for (let point = 0; point < pointCount; point += 1) {
      const flag = streams.flagStream[flagAt + point]!;
      const delta = decodeWoff2Triplet(flag & 0x7f, streams.glyphStream, glyph.at);
      if (delta === null) return null;
      glyph.at += delta.used;
      x += delta.dx;
      y += delta.dy;
      xs.push(x);
      ys.push(y);
      onCurve.push(isWoff2PointOnCurve(flag));
    }
    flagAt += pointCount;

    const instructionLength = readWoff2Short(streams.glyphStream, glyph, streams.glyphStream.byteLength);
    if (instructionLength < 0 || instructionAt + instructionLength > streams.instructionStream.byteLength) return null;
    const instructions = streams.instructionStream.subarray(instructionAt, instructionAt + instructionLength);
    instructionAt += instructionLength;

    // A simple glyph without a stored box gets one measured from its own points, which is the only
    // place the box can come from once the transform has dropped it.
    const bounds = stored ?? measurePointBounds(xs, ys);
    records.push(padToEven(encodeSfntSimpleGlyph(endPtsOfContours, xs, ys, onCurve, instructions, bounds)));
  }

  const loca = encodeSfntLoca(
    records.map((record) => record.byteLength),
    streams.indexFormat,
  );
  if (loca === null) return null;

  let total = 0;
  for (const record of records) total += record.byteLength;
  const glyf = new Uint8Array(total);
  let at = 0;
  for (const record of records) {
    glyf.set(record, at);
    at += record.byteLength;
  }
  return { glyf, loca };
}
