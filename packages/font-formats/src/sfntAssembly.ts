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
    // The checksum field is left zero for the same reason: nothing in this package verifies it, and
    // writing a recomputed value would assert a check that was never performed.
    view.setUint32(record + 8, dataAt);
    view.setUint32(record + 12, table.data.byteLength);
    out.set(table.data, dataAt);
    dataAt += (table.data.byteLength + 3) & ~3;
  });

  return out;
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
