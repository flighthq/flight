// What a WOFF2 carries in place of sfnt's offset table.
//
// The shape differs from `SfntTableDirectory` in the way that matters to a reader: an sfnt directory
// gives every table an OFFSET, so tables can be read in any order and independently. A WOFF2 directory
// gives only LENGTHS, because every table lives in one Brotli stream end to end — so a table's position
// is the sum of the lengths before it, and nothing can be read until the whole stream is decompressed.
export interface Woff2TableDirectory {
  entries: readonly Woff2TableEntry[];
  // Where the compressed stream begins, which is only known once the variable-length directory has been
  // walked. Carried here so a caller never has to re-walk it, and never has to guess it from the end of
  // the file — the format's trailing padding makes that guess decode as a valid but empty stream.
  streamStart: number;
  // How many bytes the tables occupy once decompressed but before any transform is reversed. This is the
  // length the decompressor should produce, not the size of the sfnt that will be assembled from it.
  totalUncompressedLength: number;
}

export interface Woff2TableEntry {
  // The table's length as an sfnt table, after any transform has been reversed.
  originalLength: number;
  tag: string;
  // The table's length as it appears in the decompressed stream. Equal to `originalLength` when the
  // table was not transformed, so a caller can use it unconditionally to walk the stream.
  transformLength: number;
  // The raw two-bit version from the directory, kept because its MEANING depends on the tag: for `glyf`
  // and `loca` version 3 is the null transform, while for every other table version 0 is. `transformed`
  // carries that resolved answer so no caller has to reapply the rule.
  transformVersion: number;
  transformed: boolean;
}
