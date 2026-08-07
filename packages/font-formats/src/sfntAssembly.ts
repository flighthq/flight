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
