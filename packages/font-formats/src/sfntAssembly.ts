// Writing a plain sfnt from tables somebody else unpacked.
//
// Both compressed wrappers end the same way: once WOFF has inflated its tables, or WOFF2 has
// decompressed and un-transformed its own, what is left is the identical job of laying out an sfnt.
// That job is the primitive, so it lives here rather than once per wrapper — an assembled font is a
// composition of the same parts however it arrived, and a second copy is where the two would drift.

const SFNT_HEADER_BYTES = 12;
const SFNT_DIRECTORY_ENTRY_BYTES = 16;

// Writes a header, a directory sorted by tag, then each table's data on a four-byte boundary.
//
// Sorting is required rather than cosmetic — the sfnt directory is defined as being in tag order, and a
// reader entitled to binary-search it would otherwise find the wrong table. Alignment follows the
// convention every real font is written with; it is not known to be enforced by consumers.
//
// `tag` is the four-character tag packed big-endian into a uint32, which is the form it is compared and
// sorted in, so no reader has to round-trip it through a string to order a directory.
export function assembleSfntFont(
  flavor: number,
  tables: readonly Readonly<{ data: Readonly<Uint8Array>; tag: number }>[],
): Uint8Array {
  const sorted = [...tables].sort((a, b) => a.tag - b.tag);
  const headerBytes = SFNT_HEADER_BYTES + sorted.length * SFNT_DIRECTORY_ENTRY_BYTES;

  let total = headerBytes;
  for (const table of sorted) total += (table.data.byteLength + 3) & ~3;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, flavor);
  view.setUint16(4, sorted.length);
  // searchRange, entrySelector and rangeShift are derived values a reader can recompute; the reader in
  // this package walks the directory linearly and never consults them, so they are left zero rather than
  // written with values nothing checks.

  let dataAt = headerBytes;
  sorted.forEach((table, index) => {
    const record = SFNT_HEADER_BYTES + index * SFNT_DIRECTORY_ENTRY_BYTES;
    view.setUint32(record, table.tag);
    // The real checksum, computed from the bytes being written. An assembled font that carried zeros
    // here would be making a false statement about tables it holds, and any consumer that does check
    // would read the zero as a mismatch.
    view.setUint32(record + 4, computeSfntTableChecksum(table.data, table.tag === HEAD_TAG));
    view.setUint32(record + 8, dataAt);
    view.setUint32(record + 12, table.data.byteLength);
    out.set(table.data, dataAt);
    dataAt += (table.data.byteLength + 3) & ~3;
  });

  return out;
}

// The checksum an sfnt directory stores for a table: the sum of its bytes read as big-endian uint32
// words, zero-padded to a four-byte boundary, taken modulo 2^32. An interface fact about the format.
//
// ★ `head` IS THE ONE EXCEPTION AND OMITTING IT MAKES EVERY REAL FONT REPORT A MISMATCH. The table
// carries `checkSumAdjustment` at byte 8, a value derived from the whole font's checksum, and the
// format defines the table's own checksum as being computed with that field treated as ZERO —
// otherwise the value would have to contain a function of itself.
export function computeSfntTableChecksum(data: Readonly<Uint8Array>, isHeadTable = false): number {
  let sum = 0;
  for (let at = 0; at < data.byteLength; at += 4) {
    // Bytes past the end read as zero, which is the padding the format defines rather than a guard.
    const zeroed = isHeadTable && at === HEAD_CHECKSUM_ADJUSTMENT_OFFSET;
    const word = zeroed
      ? 0
      : (data[at] ?? 0) * 0x1000000 + (data[at + 1] ?? 0) * 0x10000 + (data[at + 2] ?? 0) * 0x100 + (data[at + 3] ?? 0);
    sum = (sum + word) % 0x100000000;
  }
  return sum >>> 0;
}

// Packs a four-character tag into the uint32 an sfnt directory stores it as. Tags shorter than four
// characters are padded with spaces, which is how the format spells `cvt ` and `CFF ` — a caller
// Encodes one composite glyph: the header and bounds, then the component records verbatim, then the
// hinting instructions if any component asked for them. `components` is the slice of the WOFF2
// composite stream that `measureWoff2CompositeGlyph` sized, and it is copied unchanged — the transform
// reorders whole glyphs, it does not re-encode a component record.
//
// ★ THE CONTOUR COUNT IS A MARKER HERE, NOT A COUNT. Any negative value means "composite", and the
// reader switches on the sign alone before reading anything else; -1 is the conventional spelling. A
// caller that passed the number of components instead would write a positive count and every reader
// would parse the component records as an endPtsOfContours array.
//
// ★ A COMPOSITE CANNOT COMPUTE ITS OWN BOUNDS FROM WHAT IT HOLDS, which is why `bounds` is required
// rather than optional: it names other glyphs and places them, so its box depends on glyphs it does
// not carry. This is also why the WOFF2 transform always stores an explicit box for one.
export function encodeSfntCompositeGlyph(
  components: Readonly<Uint8Array>,
  instructions: Readonly<Uint8Array>,
  bounds: Readonly<{ xMax: number; xMin: number; yMax: number; yMin: number }>,
  hasInstructions: boolean,
): Uint8Array {
  // The instruction length field exists only when a component set the flag. Writing a zero length
  // unconditionally would add two bytes no reader expects and shift every following glyph.
  const tail = hasInstructions ? 2 + instructions.byteLength : 0;
  const out = new Uint8Array(10 + components.byteLength + tail);
  const view = new DataView(out.buffer);
  view.setInt16(0, -1);
  view.setInt16(2, bounds.xMin);
  view.setInt16(4, bounds.yMin);
  view.setInt16(6, bounds.xMax);
  view.setInt16(8, bounds.yMax);
  out.set(components, 10);
  if (hasInstructions) {
    view.setUint16(10 + components.byteLength, instructions.byteLength);
    out.set(instructions, 12 + components.byteLength);
  }
  return out;
}

// Builds the `loca` table from each glyph record's length, in glyph order. `loca` holds glyphCount + 1
// offsets, because a glyph's length is the gap to the NEXT entry — which is also how a zero-length
// (blank) glyph is expressed, as two equal consecutive offsets.
//
// ★ THE SHORT FORM STORES HALF THE OFFSET, WHICH MAKES EVEN PADDING A CORRECTNESS REQUIREMENT RATHER
// THAN A TIDINESS ONE. With `indexFormat` 0 each entry is `offset / 2` in a uint16, so an odd offset is
// not representable and would be silently truncated to the even one below it — pointing the reader at
// the previous glyph's last byte. Callers must therefore pad every record to an even length before
// measuring it here. Returns the null sentinel rather than truncating when an offset is odd, or when
// the font is too large for the short form to reach.
export function encodeSfntLoca(glyphLengths: readonly number[], indexFormat: number): Uint8Array | null {
  const entries = glyphLengths.length + 1;
  const out = new Uint8Array(indexFormat === 0 ? entries * 2 : entries * 4);
  const view = new DataView(out.buffer);

  let offset = 0;
  for (let index = 0; index < entries; index += 1) {
    if (indexFormat === 0) {
      if (offset % 2 !== 0) return null;
      if (offset / 2 > 0xffff) return null;
      view.setUint16(index * 2, offset / 2);
    } else {
      view.setUint32(index * 4, offset);
    }
    offset += glyphLengths[index] ?? 0;
  }
  return out;
}

// Encodes one simple glyph as the `glyf` table stores it: the contour ends, the hinting instructions,
// then per-point flags and the x and y deltas the flags describe. `xs` and `ys` are ABSOLUTE coordinates
// in font units; the deltas are computed here, because the encoding is defined over deltas and a caller
// holding absolute points should not have to know that.
//
// Returns an empty array for a glyph with no contours. A `glyf` entry of length zero is how the format
// spells "this glyph draws nothing" — a blank record with a zero contour count is NOT the same thing,
// and writing one gives every space character a bounding box.
//
// ★ THE ENCODING IS A COMPRESSION, AND EVERY POINT HAS SEVERAL VALID SPELLINGS. A delta of zero can be
// written as "same as previous" with no bytes at all; a delta within a byte can be written short with a
// sign bit, or long as an int16. Choosing the smallest is what a font producer does, but a font that
// chose differently is still correct — so a byte-for-byte comparison against a real font measures
// agreement with THAT producer's choices, not correctness. Compare geometry to judge correctness.
export function encodeSfntSimpleGlyph(
  endPtsOfContours: readonly number[],
  xs: readonly number[],
  ys: readonly number[],
  onCurve: readonly boolean[],
  instructions: Readonly<Uint8Array>,
  bounds: Readonly<{ xMax: number; xMin: number; yMax: number; yMin: number }>,
): Uint8Array {
  if (endPtsOfContours.length === 0) return new Uint8Array(0);

  const pointCount = xs.length;
  const flags: number[] = [];
  const xBytes: number[] = [];
  const yBytes: number[] = [];
  let previousX = 0;
  let previousY = 0;

  for (let point = 0; point < pointCount; point += 1) {
    const dx = xs[point]! - previousX;
    const dy = ys[point]! - previousY;
    previousX = xs[point]!;
    previousY = ys[point]!;
    let flag = onCurve[point] === true ? SFNT_GLYF_ON_CURVE : 0;

    // A zero delta needs no bytes: the "same or positive" bit alone means unchanged when the matching
    // short bit is clear, which is why these two bits cannot be read independently.
    if (dx === 0) flag |= SFNT_GLYF_X_SAME_OR_POSITIVE;
    else if (dx >= -255 && dx <= 255) {
      flag |= SFNT_GLYF_X_SHORT;
      if (dx > 0) flag |= SFNT_GLYF_X_SAME_OR_POSITIVE;
      xBytes.push(Math.abs(dx));
    } else xBytes.push((dx >> 8) & 0xff, dx & 0xff);

    if (dy === 0) flag |= SFNT_GLYF_Y_SAME_OR_POSITIVE;
    else if (dy >= -255 && dy <= 255) {
      flag |= SFNT_GLYF_Y_SHORT;
      if (dy > 0) flag |= SFNT_GLYF_Y_SAME_OR_POSITIVE;
      yBytes.push(Math.abs(dy));
    } else yBytes.push((dy >> 8) & 0xff, dy & 0xff);

    flags.push(flag);
  }

  // Runs of identical flags collapse into one flag plus a repeat count. The count is a single byte, so
  // a run longer than 256 becomes several repeat groups rather than one overflowing count.
  const packedFlags: number[] = [];
  for (let index = 0; index < flags.length; ) {
    const flag = flags[index]!;
    let run = 1;
    while (index + run < flags.length && flags[index + run] === flag && run < 256) run += 1;
    if (run > 1) packedFlags.push(flag | SFNT_GLYF_REPEAT, run - 1);
    else packedFlags.push(flag);
    index += run;
  }

  const size =
    10 + endPtsOfContours.length * 2 + 2 + instructions.byteLength + packedFlags.length + xBytes.length + yBytes.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setInt16(0, endPtsOfContours.length);
  view.setInt16(2, bounds.xMin);
  view.setInt16(4, bounds.yMin);
  view.setInt16(6, bounds.xMax);
  view.setInt16(8, bounds.yMax);
  let at = 10;
  for (const end of endPtsOfContours) {
    view.setUint16(at, end);
    at += 2;
  }
  view.setUint16(at, instructions.byteLength);
  at += 2;
  out.set(instructions, at);
  at += instructions.byteLength;
  out.set(packedFlags, at);
  at += packedFlags.length;
  out.set(xBytes, at);
  at += xBytes.length;
  out.set(yBytes, at);
  return out;
}

// passing the unpadded name gets the same value the font carries rather than a silent mismatch.
export function packSfntTag(tag: string): number {
  const padded = tag.padEnd(4, ' ');
  return (
    ((padded.charCodeAt(0) << 24) |
      (padded.charCodeAt(1) << 16) |
      (padded.charCodeAt(2) << 8) |
      padded.charCodeAt(3)) >>>
    0
  );
}

const HEAD_TAG = 0x68656164;
const HEAD_CHECKSUM_ADJUSTMENT_OFFSET = 8;

// Point flag bits, as the `glyf` format defines them. The two SAME_OR_POSITIVE bits do double duty:
// with the matching SHORT bit set they carry the sign, and with it clear they mean the delta is zero.
const SFNT_GLYF_ON_CURVE = 0x01;
const SFNT_GLYF_REPEAT = 0x08;
const SFNT_GLYF_X_SAME_OR_POSITIVE = 0x10;
const SFNT_GLYF_X_SHORT = 0x02;
const SFNT_GLYF_Y_SAME_OR_POSITIVE = 0x20;
const SFNT_GLYF_Y_SHORT = 0x04;
